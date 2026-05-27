// =============================================================================
//  cmd_get.js — Команда GET для терминала досье
//  Загружает список папок через GitHub API, ищет совпадения и рендерит досье.
// =============================================================================

const GITHUB_USER   = "izzzi-lol";          // Ваш GitHub username
const GITHUB_REPO   = "izzzi-lol.github.io"; // Ваш репозиторий
const DOSSIERS_ROOT = "dossiers";            // Папка с досье в репозитории

// Токен хранится в двойном base64 — не идеальная защита, но лучше, чем plaintext.
// В продакшене лучше проксировать через свой backend.
const GITHUB_TOKEN = "WjJsMGFIVmlYM0JoZEY4eE1VSlBVVU5KTjFrd2NtZHBSbkJIVEVKNFJtd3dYMUIwWjFJNVprdzBOR0ZzZVcxS1dGbGFNMWhTWmxGVVRuVlJkUkZ3V0c1c01WRTBTbFV6ZDJkaGRFaFhWbEZDUkRSUFJHMXVVWFZoYkdseg==";

const CmdGet = {
    // Кэш последних результатов поиска (для команды GET recent)
    recentMatches: [],

    // -------------------------------------------------------------------------
    //  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // -------------------------------------------------------------------------

    /** Стандартные заголовки для всех запросов к GitHub API. */
    _apiHeaders() {
        return {
            'Authorization':        `Bearer ${atob(atob(GITHUB_TOKEN))}`,
            'Accept':               'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        };
    },

    // -------------------------------------------------------------------------
    //  GITHUB API: получение списка папок (с кэшированием)
    // -------------------------------------------------------------------------

    /**
     * Возвращает массив имён папок в DOSSIERS_ROOT.
     * Кэшируется в sessionStorage на 5 минут, чтобы не тратить лимит запросов.
     * @param {object} terminal
     * @returns {Promise<string[]>}
     */
    async fetchAvailableFolders(terminal) {
        const CACHE_KEY = 'dossier_folders_cache';
        const CACHE_TTL = 5 * 60 * 1000; // 5 минут

        // Проверяем кэш
        try {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
                const { folders, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL) {
                    return folders;
                }
            }
        } catch (_) {
            // sessionStorage недоступен — просто игнорируем
        }

        const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${DOSSIERS_ROOT}`;

        try {
            const response = await fetch(url, { headers: this._apiHeaders() });

            // Показываем лимит запросов в консоли для отладки
            const remaining = response.headers.get('X-RateLimit-Remaining');
            const resetTs   = response.headers.get('X-RateLimit-Reset');
            if (remaining !== null) {
                const resetTime = new Date(resetTs * 1000).toLocaleTimeString();
                console.log(`[GitHub API] Лимит: осталось ${remaining} запросов, сброс в ${resetTime}`);
            }

            if (!response.ok) {
                const errorMessages = {
                    401: "ОШИБКА API: Токен недействителен или не указан.",
                    403: "ОШИБКА API: Превышен лимит запросов. Попробуйте позже.",
                    404: "ОШИБКА API: Репозиторий или папка не найдены. Проверьте GITHUB_USER / GITHUB_REPO / DOSSIERS_ROOT.",
                };
                terminal.printError(errorMessages[response.status] ?? `ОШИБКА API: Статус ${response.status}.`);
                return [];
            }

            const data = await response.json();

            // Нас интересуют только директории — их имена и есть ID досье
            const folders = data
                .filter(item => item.type === 'dir')
                .map(item => item.name);

            // Сохраняем в кэш
            try {
                sessionStorage.setItem(CACHE_KEY, JSON.stringify({ folders, timestamp: Date.now() }));
            } catch (_) {}

            return folders;

        } catch (e) {
            terminal.printError(`Ошибка подключения к базе данных: ${e.message}`);
            return [];
        }
    },

    // -------------------------------------------------------------------------
    //  КОМАНДА: execute
    // -------------------------------------------------------------------------

    /**
     * Точка входа команды GET.
     * @param {string[]} args      Аргументы после команды GET
     * @param {object}   terminal  Объект терминала (printSystem / printError)
     */
    async execute(args, terminal) {
        if (args.length === 0) {
            terminal.printError("ОШИБКА: Укажите ID или имя. Пример: get 01005423");
            return;
        }

        const query = args.join(' ').toLowerCase();

        // Специальная команда: показать последние результаты поиска
        if (query === 'recent') {
            this.displayRecent(terminal, "");
            return;
        }

        terminal.printSystem(`ИНИЦИАЛИЗАЦИЯ ПОИСКА: "${query.toUpperCase()}"...`);

        try {
            // 1. Получаем список папок через GitHub API
            const folderIds = await this.fetchAvailableFolders(terminal);

            if (folderIds.length === 0) {
                terminal.printError("КРИТИЧЕСКАЯ ОШИБКА: База данных недоступна или пуста.");
                return;
            }

            // Получаем контейнер вывода только после проверок
            const outputContainer = TerminalAPI.getOutputNode();

            // 2. Проверяем точное совпадение по ID (регистронезависимо)
            const exactId = folderIds.find(id => id.toLowerCase() === query);

            if (exactId) {
                const docResponse = await fetch(`${DOSSIERS_ROOT}/${exactId}/dossier.txt`);
                if (docResponse.ok) {
                    terminal.printSystem("ДОКУМЕНТ ПО ID НАЙДЕН.");
                    await new Promise(r => setTimeout(r, 20));
                    await this.renderStepByStep(await docResponse.text(), outputContainer, exactId);
                    return;
                }
                // Папка есть, но dossier.txt отсутствует — продолжаем полный поиск
            }

            // 3. Полнотекстовый поиск по всем dossier.txt
            const matches = [];

            for (const id of folderIds) {
                const docResponse = await fetch(`${DOSSIERS_ROOT}/${id}/dossier.txt`);
                if (!docResponse.ok) continue;

                const content = await docResponse.text();

                if (!content.toLowerCase().includes(query)) continue;

                // Извлекаем заголовок для превью
                const titleMatch = content.match(/\[TITLE\](.*)/);
                const title = titleMatch ? titleMatch[1].trim() : "UNNAMED";

                matches.push({ id, title, content });
            }

            // 4. Обработка результатов
            if (matches.length === 0) {
                terminal.printError("СОВПАДЕНИЙ НЕ НАЙДЕНО.");

            } else if (matches.length === 1) {
                terminal.printSystem(`НАЙДЕНА ЗАПИСЬ ПО ID: ${matches[0].id}`);
                await new Promise(r => setTimeout(r, 20));
                terminal.printSystem("Инициализация . . .");
                await this.renderStepByStep(matches[0].content, outputContainer, matches[0].id);

            } else {
                // Несколько совпадений — показываем список
                this.recentMatches = matches;
                this.displayRecent(terminal, query);
            }

        } catch (error) {
            terminal.printError(`СИСТЕМНЫЙ СБОЙ: ${error.message}`);
        }
    },

    // -------------------------------------------------------------------------
    //  ОТОБРАЖЕНИЕ СПИСКА СОВПАДЕНИЙ
    // -------------------------------------------------------------------------

    /**
     * Выводит список последних совпадений с контекстным превью.
     * @param {object} terminal
     * @param {string} query   Исходный запрос (для подсветки контекста)
     */
    displayRecent(terminal, query) {
        if (this.recentMatches.length === 0) {
            terminal.printSystem("СПИСОК ПУСТ.");
            return;
        }

        terminal.printSystem("\n--- РЕЗУЛЬТАТЫ ПОИСКА ---");

        for (const m of this.recentMatches) {
            let preview = "";

            if (query) {
                // Очищаем текст от тегов и ищем контекстный фрагмент
                const cleanText = m.content.replace(/\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim();
                const words = cleanText.split(' ');
                const foundIndex = words.findIndex(w => w.toLowerCase().includes(query));

                if (foundIndex !== -1) {
                    const start   = Math.max(0, foundIndex - 3);
                    const end     = Math.min(words.length, foundIndex + 4);
                    preview = `...${words.slice(start, end).join(' ')}...`;
                }
            }

            terminal.printSystem(`[ID: ${m.id}] | ${m.title}`);
            if (preview) {
                terminal.printSystem(`  └─ Контекст: "${preview}"`, '#888');
            }
        }

        terminal.printSystem("---------------------------\n");
        terminal.printSystem("Для доступа к нужной записи введите команду GET [ID]");
    },

    // -------------------------------------------------------------------------
    //  РЕНДЕР ДОСЬЕ (пошаговый, с анимацией)
    // -------------------------------------------------------------------------

    /**
     * Парсит и рендерит содержимое dossier.txt в контейнер вывода.
     * @param {string}  content         Текст файла
     * @param {Element} output          DOM-узел для вывода
     * @param {string}  folderId        ID папки (для путей к изображениям)
     * @param {object}  [localImageMap] Карта имён → data-URL для локальных изображений
     */
    async renderStepByStep(content, output, folderId, localImageMap = {}) {
        const lines              = content.split('\n');
        const currentDossierPath = `dossiers/${folderId}/`;

        // Состояние парсера
        let currentTable   = null;
        let currentQuote   = null;
        let currentFootnote = null;
        let currentList    = null;

        // Сбрасываем CSS-тему на дефолтную
        const resetTheme = () => {
            const def = '#a200ff';
            document.documentElement.style.setProperty('--theme-color',       def);
            document.documentElement.style.setProperty('--theme-quote-border', def);
            document.documentElement.style.setProperty('--theme-quote-bg',    'rgba(162,0,255,0.05)');
            document.documentElement.style.setProperty('--theme-table-bg',    'rgba(162,0,255,0.2)');
        };
        resetTheme();

        // Глобальное состояние переключателей [DISABLE=...] / [ENABLE=...]
        const parserState = { disableTags: false, disableMD: false };

        // Маркер начала документа
        const startLine = document.createElement('div');
        startLine.classList.add('doc-line');
        startLine.appendChild(Object.assign(document.createElement('span'), { textContent: '[НАЧАЛО ДОКУМЕНТА]' }));
        output.appendChild(startLine);

        // -----------------------------------------------------------------
        //  ИНЛАЙН-ПАРСЕР: Markdown + кастомные теги (с поддержкой вложенности)
        //
        //  Архитектура: рекурсивный descent-парсер вместо regex.
        //  Regex принципиально не умеет считать вложенные пары тегов —
        //  [COLOR=#A]([COLOR=#B]...[/COLOR])[/COLOR] ломается из-за .*?
        //  Парсер же ищет «самый ранний» открывающий тег, затем
        //  findMatchingClose считает глубину и находит правильный [/TAG],
        //  рекурсивно обрабатывает содержимое и идёт дальше.
        // -----------------------------------------------------------------

        // 1. Чистый Markdown без обработки тегов
        const applyMD = (str, state) => {
            if (state.disableMD) return str;
            return str
                .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
                .replace(/\*\*(.*?)\*\*/g,     '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g,          '<em>$1</em>')
                .replace(/_(.*?)_/g,            '<em>$1</em>')
                .replace(/~~(.*?)~~/g,          '<del>$1</del>')
                .replace(/==(.*?)==/g,          '<span class="scp-redacted">$1</span>')
                .replace(/`(.*?)`/g,            '<code class="scp-inline-code">$1</code>');
        };

        // 2. Ищет ЗАКРЫВАЮЩИЙ [/tagName] учитывая вложенность.
        //    Возвращает индекс закрывающего тега или -1 если не найден.
        //    fromPos — позиция сразу после открывающего тега.
        const findMatchingClose = (text, tagName, fromPos) => {
            const tn       = tagName.toLowerCase();
            const closeStr = `[/${tn}]`;
            let depth = 1;
            let pos   = fromPos;

            while (pos < text.length) {
                const ltext         = text.toLowerCase();
                const nextCloseIdx  = ltext.indexOf(closeStr, pos);
                if (nextCloseIdx === -1) return -1; // Незакрытый тег

                // Ищем следующий открывающий [tagName...] до nextCloseIdx
                let openIdx = -1;
                let searchFrom = pos;
                while (searchFrom < nextCloseIdx) {
                    const idx = ltext.indexOf(`[${tn}`, searchFrom);
                    if (idx === -1 || idx >= nextCloseIdx) break;
                    // Убеждаемся что это [tagName] или [tagName=...], а не [tagNameSomething]
                    const charAfter = ltext[idx + 1 + tn.length];
                    if (charAfter === ']' || charAfter === '=') {
                        openIdx = idx;
                        break;
                    }
                    searchFrom = idx + 1;
                }

                if (openIdx !== -1) {
                    // Вложенный открывающий тег — увеличиваем глубину,
                    // перепрыгиваем за его закрывающую скобку ']'
                    depth++;
                    const closeBracket = ltext.indexOf(']', openIdx + 1 + tn.length);
                    pos = closeBracket !== -1 ? closeBracket + 1 : openIdx + 1 + tn.length + 1;
                } else {
                    depth--;
                    if (depth === 0) return nextCloseIdx;
                    pos = nextCloseIdx + closeStr.length;
                }
            }
            return -1;
        };

        // 3. Рендерит глитч-эффект (вынесен, чтобы не дублировать код)
        const renderGlitch = (intensiveVal, innerText) => {
            const gi = Math.max(0.01, Math.min(5, intensiveVal || 0.5));

            if (!window._scpGlitchInit) {
                window._scpGlitchInit = true;
                const st = document.createElement('style');
                st.textContent = `
                    .scp-effect-glitch {
                        display: inline-block;
                        animation: _scpGlitchJitter calc(0.22s / max(var(--gi, 0.5), 0.05)) steps(1) infinite;
                    }
                    @keyframes _scpGlitchJitter {
                        0%,100% { transform: translate(0,0) skewX(0deg); filter: none; }
                        15%     { transform: translate(calc(var(--gi)*-3px),0) skewX(calc(var(--gi)*-2deg)); filter: brightness(1.6) hue-rotate(30deg); }
                        30%     { transform: translate(calc(var(--gi)*2px),0); filter: none; }
                        55%     { transform: translate(calc(var(--gi)*-1px),0) skewX(calc(var(--gi)*1.5deg)); }
                        70%     { transform: translate(0,0) skewX(0deg); filter: brightness(0.7); }
                        85%     { transform: translate(calc(var(--gi)*1px),0); filter: none; }
                    }
                `;
                document.head.appendChild(st);

                const GLITCH_CHARS = '!@#$%^&*<>?/|~±░▒▓│┼╬═║╝╔▄▀■□▪';
                (function loop() {
                    document.querySelectorAll('.scp-effect-glitch').forEach(el => {
                        const elGi = parseFloat(el.dataset.gi) || 0.5;
                        const orig = el.dataset.orig;
                        if (!orig) return;
                        let out = '';
                        for (let i = 0; i < orig.length; i++) {
                            out += (orig[i] > ' ' && Math.random() < elGi * 0.18)
                                ? GLITCH_CHARS[Math.random() * GLITCH_CHARS.length | 0]
                                : orig[i];
                        }
                        el.textContent = out;
                    });
                    const allGi = [...document.querySelectorAll('.scp-effect-glitch')]
                        .map(el => parseFloat(el.dataset.gi) || 0.5);
                    const maxGi = allGi.length ? Math.max(...allGi) : 0.5;
                    setTimeout(loop, Math.max(40, 180 / maxGi + Math.random() * 100));
                })();
            }

            const safeOrig = innerText
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            return `<span class="scp-effect-glitch" data-gi="${gi}" data-orig="${safeOrig}" style="--gi:${gi}">${innerText}</span>`;
        };

        // 4. Превращает распознанный тег + его уже-обработанное содержимое в HTML
        const renderTag = (name, attr, innerHtml) => {
            switch (name) {
                case 'color':
                    return `<span style="color:${attr}">${innerHtml}</span>`;
                case 'bgcolor':
                    return `<span style="background-color:${attr}; padding:0 4px; border-radius:2px;">${innerHtml}</span>`;
                case 'href':
                    return `<a href="${attr}" target="_blank" class="scp-link">${innerHtml}</a>`;
                case 'size':
                    return `<span style="font-size:${attr};">${innerHtml}</span>`;
                case 'effect': {
                    const m = attr.match(/GLITCH;INTENSIVE=([0-9.]+)/i);
                    return m ? renderGlitch(parseFloat(m[1]), innerHtml) : innerHtml;
                }
                default:
                    return innerHtml;
            }
        };

        // 5. Рекурсивный парсер: обходит текст слева направо,
        //    находит самый ранний тег, обрабатывает его и вызывает себя для хвоста.
        //
        //    Поддерживаемые парные теги (все поддерживают вложенность):
        //      [color=#HEX]...[/color]
        //      [bgcolor=#HEX]...[/bgcolor]
        //      [href=URL]...[/href]
        //      [size=VALUE]...[/size]
        //      [EFFECT=GLITCH;INTENSIVE=N]...[/EFFECT]
        //    Отдельная обработка (не вложенный, regex-safe):
        //      [CMD="cmd"][label][/CMD]
        const NESTABLE_TAGS = [
            { name: 'color',   openRe: /\[color=(#[0-9a-fA-F]{3,8})\]/i   },
            { name: 'bgcolor', openRe: /\[bgcolor=(#[0-9a-fA-F]{3,8})\]/i },
            { name: 'href',    openRe: /\[href=([^\]]+)\]/i                },
            { name: 'size',    openRe: /\[size=([0-9a-z.%]+)\]/i           },
            { name: 'effect',  openRe: /\[effect=([^;\]]+;[^\]]+)\]/i     },
        ];

        const parseSegment = (text, state) => {
            // Ищем самый ранний открывающий парный тег
            let earliest = null;
            for (const { name, openRe } of NESTABLE_TAGS) {
                const m = new RegExp(openRe.source, 'i').exec(text);
                if (m && (earliest === null || m.index < earliest.index)) {
                    earliest = { index: m.index, full: m[0], name, attr: m[1] };
                }
            }

            // Проверяем CMD (не поддерживает вложенность, regex достаточно)
            const cmdRe = /\[CMD="([^"]+)"\](\[.*?\])\[\/CMD\]/i;
            const cmdM  = cmdRe.exec(text);
            const useCMD = cmdM && (earliest === null || cmdM.index < earliest.index);

            // Нет тегов вообще — просто применяем Markdown
            if (!earliest && !cmdM) return applyMD(text, state);

            if (useCMD) {
                const before   = text.slice(0, cmdM.index);
                const after    = text.slice(cmdM.index + cmdM[0].length);
                const safeCmd  = cmdM[1].replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const tagHtml  = `<span class="scp-cmd-link" onclick="TerminalAPI.typeAndExecute('${safeCmd}')">${applyMD(cmdM[2], state)}</span>`;
                return applyMD(before, state) + tagHtml + parseSegment(after, state);
            }

            // Парный тег — ищем его закрывающую пару с учётом вложенности
            const { index, full, name, attr } = earliest;
            const innerStart = index + full.length;
            const closeIdx   = findMatchingClose(text, name, innerStart);

            if (closeIdx === -1) {
                // Незакрытый тег — не обрабатываем, продолжаем за ним
                return applyMD(text.slice(0, innerStart), state) + parseSegment(text.slice(innerStart), state);
            }

            const before    = text.slice(0, index);
            const inner     = text.slice(innerStart, closeIdx);
            const after     = text.slice(closeIdx + `[/${name}]`.length);

            // Рекурсивно обрабатываем содержимое, затем рендерим тег
            const innerHtml = parseSegment(inner, state);
            const tagHtml   = renderTag(name, attr, innerHtml);

            return applyMD(before, state) + tagHtml + parseSegment(after, state);
        };

        // 6. Точка входа: сначала обрабатывает управляющие переключатели
        //    [DISABLE=TAGS/MD] / [ENABLE=TAGS/MD], затем для каждого токена
        //    вызывает parseSegment или applyMD в зависимости от флагов.
        const applyInlineMarkdown = (text, state) => {
            const controlRe = /(\[DISABLE=TAGS\]|\[ENABLE=TAGS\]|\[DISABLE=MD\]|\[ENABLE=MD\])/gi;
            const tokens = text.split(controlRe);
            let result = '';

            for (const token of tokens) {
                const lower = token.toLowerCase();
                if (lower === '[disable=tags]') { state.disableTags = true;  continue; }
                if (lower === '[enable=tags]')  { state.disableTags = false; continue; }
                if (lower === '[disable=md]')   { state.disableMD  = true;  continue; }
                if (lower === '[enable=md]')    { state.disableMD  = false; continue; }
                if (!token) continue;

                result += state.disableTags ? applyMD(token, state) : parseSegment(token, state);
            }
            return result;
        };

        // -----------------------------------------------------------------
        //  ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: оборачивает текстовые узлы в <span class="word">
        //  для пословной анимации появления
        // -----------------------------------------------------------------

        const wrapWords = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const frag = document.createDocumentFragment();
                node.nodeValue.split(' ').forEach((word, i, arr) => {
                    if (word.trim()) {
                        const span = document.createElement('span');
                        span.className = 'word';
                        span.textContent = word;
                        frag.appendChild(span);
                    }
                    if (i < arr.length - 1) {
                        frag.appendChild(document.createTextNode(' '));
                    }
                });
                return frag;
            }

            // Рекурсивно клонируем элементный узел
            const clone = node.cloneNode(false);
            node.childNodes.forEach(child => clone.appendChild(wrapWords(child)));
            return clone;
        };

        // -----------------------------------------------------------------
        //  ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: анимирует появление элемента
        // -----------------------------------------------------------------

        const animateElement = async (el) => {
            const words = el.querySelectorAll('.word');
            if (words.length > 0) {
                for (const w of words) {
                    w.classList.add('revealed');
                    await new Promise(r => setTimeout(r, 38));
                    output.scrollTop = output.scrollHeight;
                }
            } else {
                el.classList.add('visible');
                await new Promise(r => setTimeout(r, 100));
            }
        };

        // -----------------------------------------------------------------
        //  ОСНОВНОЙ ЦИКЛ ПАРСЕРА
        // -----------------------------------------------------------------

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // [COLORCODES] — переопределение цветовой темы
            if (line.startsWith('[COLORCODES]')) {
                const colors = {};
                line.replace('[COLORCODES]', '').split(';').forEach(pair => {
                    const [k, v] = pair.split('=');
                    if (k && v) colors[k.trim()] = v.trim();
                });
                const base   = colors['Mainpage'] || '#a200ff';
                const quotes = colors['Quotes']   || base;
                const tables = colors['Tables']   || base;
                document.documentElement.style.setProperty('--theme-color',        base);
                document.documentElement.style.setProperty('--theme-quote-border', quotes);
                document.documentElement.style.setProperty('--theme-quote-bg',     quotes + '0D');
                document.documentElement.style.setProperty('--theme-table-bg',     tables + '33');
                continue;
            }

            // Закрывающие теги блоков — просто сбрасываем указатели
            if (line.startsWith('[/TABLE6]'))   { currentTable    = null; continue; }
            if (line.startsWith('[/FOOTNOTE]')) { currentFootnote = null; continue; }
            if (line.startsWith('[/QUOTE]'))    { currentQuote    = null; continue; }

            let el;
            let targetContainer = output;

            // ----- БЛОЧНЫЕ ТЕГИ -----

            if (line.startsWith('[TITLE]')) {
                el = document.createElement('span');
                el.className = 'glitch-title';
                el.textContent = line.replace('[TITLE]', '').trim();

            } else if (line.startsWith('[DANGER]')) {
                el = document.createElement('div');
                el.className = 'danger-diamond';
                el.textContent = line.replace('[DANGER]', '').trim();

            } else if (line.startsWith('[IMAGE]')) {
                const parts = line.replace('[IMAGE]', '').split('||');
                const imageName = parts[0].trim();
                const caption   = parts[1] ? parts[1].trim() : '';
                const mode      = parts[2] ? parts[2].trim().toLowerCase() : 'right';
                const scale     = parts[3] ? parseFloat(parts[3].trim()) : 1;

                el = document.createElement('div');
                el.className = `scp-image-container ${mode}-mode visible`;
                if (!isNaN(scale)) el.style.setProperty('--img-scale', scale);

                const imageSrc = (localImageMap && localImageMap[imageName])
                    ? localImageMap[imageName]
                    : `${currentDossierPath}images/${imageName}`;

                el.innerHTML = `<img src="${imageSrc}" alt="${caption}"><div class="scp-image-caption">${caption}</div>`;

            } else if (line.startsWith('[TABLE6]')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-wrapper visible';
                currentTable = document.createElement('table');
                currentTable.className = 'table6';
                wrapper.appendChild(currentTable);
                el = wrapper;

            } else if (line.startsWith('[QUOTE]')) {
                currentQuote = document.createElement('blockquote');
                el = currentQuote;

            } else if (line.startsWith('[FOOTNOTE]')) {
                currentFootnote = document.createElement('div');
                currentFootnote.className = 'footnote';
                el = currentFootnote;

            } else {
                // ----- СТРОКИ ВНУТРИ ТАБЛИЦЫ -----
                if (currentTable && line.includes('||')) {
                    const tr = document.createElement('tr');
                    line.split('||').forEach(cellText => {
                        const td   = document.createElement('td');
                        const html = applyInlineMarkdown(cellText.trim(), parserState);
                        const temp = document.createElement('div');
                        temp.innerHTML = html;
                        Array.from(temp.childNodes).forEach(n => td.appendChild(wrapWords(n)));
                        tr.appendChild(td);
                    });
                    currentTable.appendChild(tr);

                    // Пословная анимация строки таблицы
                    const words = tr.querySelectorAll('.word');
                    if (words.length > 0) {
                        for (const w of words) {
                            w.classList.add('revealed');
                            await new Promise(r => setTimeout(r, 38));
                            output.scrollTop = output.scrollHeight;
                        }
                    } else {
                        tr.classList.add('visible');
                        await new Promise(r => setTimeout(r, 100));
                    }
                    continue;
                }

                // ----- ОБЫЧНЫЕ СТРОКИ: MARKDOWN + КАСТОМНЫЕ ТЕГИ -----

                let isListItem = false;
                const listMatch    = line.match(/^[-*]\s+(.*)/);
                const mdHeaderMatch = line.match(/^(#{1,6})\s+(.*)/);

                if (listMatch) {
                    isListItem = true;
                    el = document.createElement('li');
                    line = listMatch[1];

                } else if (line === '---' || line === '***') {
                    el = document.createElement('hr');
                    el.className = 'scp-hr';
                    line = '';

                } else if (line === '.') {
                    el = document.createElement('div');
                    el.style.height = '1.5em';
                    line = '';

                } else if (mdHeaderMatch) {
                    const level = mdHeaderMatch[1].length;
                    el = document.createElement(`h${level}`);
                    el.classList.add('scp-header', `scp-h${level}`);
                    line = mdHeaderMatch[2];

                } else {
                    // Поддержка устаревших заголовков [H1]–[H6] (для совместимости)
                    const legacyHeader = line.match(/^\[H([1-6])\]/i);
                    if (legacyHeader) {
                        const level = legacyHeader[1];
                        el = document.createElement(`h${level}`);
                        el.classList.add('scp-header', `scp-h${level}`);
                        line = line.replace(legacyHeader[0], '').trim();
                    } else {
                        el = document.createElement('p');
                    }
                }

                // [CENTER] — выравнивание по центру
                if (line.includes('[CENTER]')) {
                    el.classList.add('center');
                    line = line.replace('[CENTER]', '').trim();
                }

                // Управление контейнерами: списки, цитаты, сноски
                if (isListItem) {
                    if (!currentList) {
                        currentList = document.createElement('ul');
                        currentList.className = 'scp-list';
                        const parent = currentQuote ?? currentFootnote ?? output;
                        parent.appendChild(currentList);
                    }
                    targetContainer = currentList;
                } else {
                    currentList = null; // Закрываем список при переходе к обычному тексту
                    targetContainer = currentQuote ?? currentFootnote ?? output;
                }

                // Применяем инлайн-парсер и оборачиваем слова
                const html = applyInlineMarkdown(line, parserState);
                const temp = document.createElement('div');
                temp.innerHTML = html;
                Array.from(temp.childNodes).forEach(n => el.appendChild(wrapWords(n)));
            }

            // Добавляем элемент в нужный контейнер и запускаем анимацию
            targetContainer.appendChild(el);
            await animateElement(el);
        }

        // Маркер конца документа
        const endLine = document.createElement('div');
        endLine.classList.add('doc-line');
        endLine.appendChild(Object.assign(document.createElement('span'), { textContent: '[КОНЕЦ ДОКУМЕНТА]' }));
        output.appendChild(endLine);
        output.scrollTop = output.scrollHeight;
    },
};
