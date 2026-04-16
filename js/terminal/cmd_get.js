// НАСТРОЙКИ РЕПОЗИТОРИЯ (Впиши свои данные!)
const GITHUB_USER = "izzzi-lol"; // Например, izzzi-lol
const GITHUB_REPO = "izzzi-lol.github.io"; // Например, scp-terminal
const DOSSIERS_ROOT = "dossiers";

const CmdGet = {
    recentMatches: [],

    // --- НОВАЯ ФУНКЦИЯ ДЛЯ РАБОТЫ С GITHUB API ---
    async fetchAvailableFolders(terminal) {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${DOSSIERS_ROOT}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();

            // Нас интересуют только папки (директории), их имена — это ID досье
            return data
                .filter(item => item.type === 'dir')
                .map(item => item.name);
        } catch (e) {
            terminal.printError("Ошибка баз данных:", e);
            return [];
        }
    },

    async execute(args, terminal) {
        if (args.length === 0) {
            terminal.printError("ОШИБКА: Укажите ID или имя. Пример: get 01005423");
            return;
        }

        const query = args.join(' ').toLowerCase();

        if (query === 'recent') {
            this.displayRecent(terminal, "");
            return;
        }

        terminal.printSystem(`ИНИЦИАЛИЗАЦИЯ ПОИСКА: "${query.toUpperCase()}"...`);

        try {
            // 1. ПОЛУЧАЕМ СПИСОК ПАПОК ЧЕРЕЗ API (ВМЕСТО list.json)
            const folderIds = await this.fetchAvailableFolders(terminal);

            const outputContainer = TerminalAPI.getOutputNode(); // Используем API терминала

            if (folderIds.length === 0) {
                terminal.printError("КРИТИЧЕСКАЯ ОШИБКА: База данных недоступна или пуста.");
                return;
            }

            let matches = [];

	    // 1. ПРОВЕРКА НА ТОЧНЫЙ ID (Игнорируем регистр)
            // Ищем в массиве папок ту, чье имя в нижнем регистре совпадает с нашим запросом
            const exactMatchId = folderIds.find(id => id.toLowerCase() === query);

            if (exactMatchId) {
                // Используем exactMatchId, чтобы сохранить правильный регистр папки для URL
                const docResponse = await fetch(`${DOSSIERS_ROOT}/${exactMatchId}/dossier.txt`);
                if (docResponse.ok) {
                    const content = await docResponse.text();
                    terminal.printSystem(`ДОКУМЕНТ ПО ID НАЙДЕН.`);
                    await new Promise(r => setTimeout(r, 20));

                    // ИСПРАВЛЕНО: передаем exactMatchId вместо query
                    await this.renderStepByStep(content, outputContainer, exactMatchId);

                    return; // Сразу выходим, если нашли по ID
                }
            }

            // 2.2 ПРОВЕРЯЕМ КАЖДЫЙ dossier.txt
            for (const id of folderIds) {

                const docResponse = await fetch(`${DOSSIERS_ROOT}/${id}/dossier.txt`);
                if (!docResponse.ok) continue;

                const content = await docResponse.text();

                // Ищем тег [TITLE], чтобы вытащить имя для превью
                let title = "UNNAMED";
                const titleMatch = content.match(/\[TITLE\](.*)/);
                if (titleMatch) {
                    title = titleMatch[1].trim();
                }

                // Проверяем: совпадает ли ID папки или есть ли слово в тексте
                if (id.toLowerCase() === query || content.toLowerCase().includes(query)) {
                    matches.push({id, title, content});
                }
            }

            // 3. ОБРАБОТКА РЕЗУЛЬТАТОВ
            if (matches.length === 0) {
                terminal.printError(`СОВПАДЕНИЙ НЕ НАЙДЕНО.`);
            } else if (matches.length === 1 && query !== 'recent') {

                terminal.printSystem(`НАЙДЕНА ЗАПИСЬ ПО ID: ${matches[0].id}`);
                await new Promise(r => setTimeout(r, 20));
                terminal.printSystem(`Инициализация . . .`);

                await this.renderStepByStep(matches[0].content, outputContainer, matches[0].id);
            } else {
                this.recentMatches = matches;
                this.displayRecent(terminal, query);
            }

        } catch (error) {
            terminal.printError(`СИСТЕМНЫЙ СБОЙ: ${error.message}`);
        }
    },

    displayRecent(terminal, query) {
        if (this.recentMatches.length === 0) {
            terminal.printSystem("СПИСОК ПУСТ.");
            return;
        }

        terminal.printSystem("\n--- РЕЗУЛЬТАТЫ ПОИСКА ---");

        this.recentMatches.forEach(m => {
            let preview = "";

            if (query) {
                // Очищаем текст от тегов
                const cleanText = m.content.replace(/\[.*?\]/g, ' ').replace(/\s+/g, ' ').trim();
                const words = cleanText.split(' ');

                const foundIndex = words.findIndex(w => w.toLowerCase().includes(query));

                if (foundIndex !== -1) {
                    const start = Math.max(0, foundIndex - 3);
                    const end = Math.min(words.length, foundIndex + 4);
                    const fragment = words.slice(start, end).join(' ');
                    preview = `...${fragment}...`;
                }
            }

            terminal.printSystem(`[ID: ${m.id}] | ${m.title}`);
            if (preview) {
                terminal.printSystem(`  └─ Контекст: "${preview}"`, '#888'); // Делаем превью серым
            }
        });

        terminal.printSystem("---------------------------\n");
        terminal.printSystem("Для доступа к нужной записи введите команду GET [ID]");
    },

    // Твой парсер (я не менял логику рендера, только оставил нужную сигнатуру)
    async renderStepByStep(content, output, folderId, localImageMap = {}) {
        const lines = content.split('\n');
        let currentTable = null;
        let currentQuote = null;
        let currentFootnote = null;
        let currentList = null;

        // Путь теперь указывает в правильную папку
        const currentDossierPath = `dossiers/${folderId}/`;

        const resetTheme = () => {
            const def = '#a200ff';
            document.documentElement.style.setProperty('--theme-color', def);
            document.documentElement.style.setProperty('--theme-quote-border', def);
            document.documentElement.style.setProperty('--theme-quote-bg', 'rgba(162,0,255,0.05)');
            document.documentElement.style.setProperty('--theme-table-bg', 'rgba(162,0,255,0.2)');
        };
        resetTheme();

        const startLine = document.createElement("div");
        startLine.classList.add("doc-line");
        const textSpan = document.createElement("span");
        textSpan.textContent = "[НАЧАЛО ДОКУМЕНТА]";
        startLine.appendChild(textSpan);
        output.appendChild(startLine);

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            if (line.startsWith('[COLORCODES]')) {
                let colors = {};
                line.replace('[COLORCODES]', '').split(';').forEach(p => {
                    let [k, v] = p.split('=');
                    if (k && v) colors[k.trim()] = v.trim();
                });
                let b = colors['Mainpage'] || '#a200ff';
                let q = colors['Quotes'] || b;
                let t = colors['Tables'] || b;
                document.documentElement.style.setProperty('--theme-color', b);
                document.documentElement.style.setProperty('--theme-quote-border', q);
                document.documentElement.style.setProperty('--theme-quote-bg', q + '0D');
                document.documentElement.style.setProperty('--theme-table-bg', t + '33');
                continue;
            }

            let el;
            let targetContainer = output;

            if (line.startsWith('[/TABLE6]')) {
                currentTable = null;
                continue;
            }
            if (line.startsWith('[/FOOTNOTE]')) {
                currentFootnote = null;
                continue;
            }
            if (line.startsWith('[/QUOTE]')) {
                currentQuote = null;
                continue;
            }

            if (line.startsWith('[TITLE]')) {
                el = document.createElement('span');
                el.className = 'glitch-title';
                el.textContent = line.replace('[TITLE]', '');
            } else if (line.startsWith('[DANGER]')) {
                el = document.createElement('div');
                el.className = 'danger-diamond';
                el.textContent = line.replace('[DANGER]', '');
            } else if (line.startsWith('[IMAGE]')) {
                let p = line.replace('[IMAGE]', '').split('||');
                el = document.createElement('div');

                let mode = p[2] ? p[2].trim().toLowerCase() : "right";
                // Четвертый параметр — масштаб. Если его нет, ставим 1.
                let scale = p[3] ? parseFloat(p[3].trim()) : 1;

                el.className = `scp-image-container ${mode}-mode visible`;

                // Передаем масштаб в CSS через переменную
                if (!isNaN(scale)) {
                    el.style.setProperty('--img-scale', scale);
                }

                let imageName = p[0].trim();
                let imageSrc = `${currentDossierPath}images/${imageName}`;

                if (localImageMap && localImageMap[imageName]) {
                    imageSrc = localImageMap[imageName];
                }

                el.innerHTML = `<img src="${imageSrc}"><div class="scp-image-caption">${p[1] || ""}</div>`;
            } else if (line.startsWith('[TABLE6]')) {
                let wrapper = document.createElement('div');
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
                if (currentTable && line.includes('||')) {
                    let tr = document.createElement('tr');
                    line.split('||').forEach(c => {
                        let td = document.createElement('td');
                        td.innerHTML = c.trim()
                            .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gi, '<span style="color:$1">$2</span>')
                            .replace(/\[bgcolor=(#[0-9a-fA-F]{3,6})\](.*?)\[\/bgcolor\]/gi, '<span style="background-color:$1; padding: 0 4px; border-radius: 2px;">$2</span>');
                        tr.appendChild(td);
                    });
                    currentTable.appendChild(tr);
                    continue;
                } else {
                    // --- НАЧАЛО ПОДДЕРЖКИ MARKDOWN ---
                    let isListItem = false;
                    const listMatch = line.match(/^(\-|\*)\s+(.*)/);
                    const mdHeaderMatch = line.match(/^(#{1,6})\s+(.*)/);

                    if (listMatch) {
                        isListItem = true;
                        el = document.createElement('li');
                        line = listMatch[2]; // Берем только текст, без тире
                    } else if (line === '---' || line === '***') {
                        el = document.createElement('hr');
                        el.className = 'scp-hr';
                        line = ''; // Пустая строка, чтобы не генерировались квадратики
                    } else if (mdHeaderMatch) {
                        const level = mdHeaderMatch[1].length;
                        el = document.createElement(`h${level}`);
                        el.classList.add('scp-header', `scp-h${level}`);
                        line = mdHeaderMatch[2];
                    } else {
                        // Старая логика заголовков [H1]-[H6] (оставляем для совместимости)
                        const headerMatch = line.match(/^\[H([1-6])\]/i);
                        if (headerMatch) {
                            const level = headerMatch[1];
                            el = document.createElement(`h${level}`);
                            el.classList.add('scp-header', `scp-h${level}`);
                            line = line.replace(headerMatch[0], '').trim();
                        } else {
                            el = document.createElement('p'); // Обычный абзац
                        }
                    }

                    // Проверка на [CENTER]
                    if (line.includes('[CENTER]')) {
                        el.classList.add('center');
                        line = line.replace('[CENTER]', '').trim();
                    }

                    // --- УПРАВЛЕНИЕ КОНТЕЙНЕРАМИ (Списки внутри цитат и сносок) ---
                    if (isListItem) {
                        if (!currentList) {
                            currentList = document.createElement('ul');
                            currentList.className = 'scp-list';

                            let parent = output;
                            if (currentQuote) parent = currentQuote;
                            else if (currentFootnote) parent = currentFootnote;
                            parent.appendChild(currentList);
                        }
                        targetContainer = currentList; // <li> пойдет внутрь <ul>
                    } else {
                        currentList = null; // Закрываем список, если пошел обычный текст

                        if (currentQuote) targetContainer = currentQuote;
                        else if (currentFootnote) targetContainer = currentFootnote;
                        else targetContainer = output;
                    }

                    // --- ЗАМЕНА ИНЛАЙН-ТЕГОВ (Inline Markdown) ---
                    let html = line
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\_(.*?)\_/g, '<em>$1</em>')
                        .replace(/\~\~(.*?)\~\~/g, '<del>$1</del>') // Зачеркивание ~~текст~~
                        .replace(/==(.*?)==/g, '<span class="scp-redacted">$1</span>') // Плашка цензуры ==текст==
                        .replace(/`(.*?)`/g, '<code class="scp-inline-code">$1</code>') // Код `текст`
                        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="scp-link">$1</a>') // MD Ссылки
                        .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gi, '<span style="color:$1">$2</span>')
                        .replace(/\[bgcolor=(#[0-9a-fA-F]{3,6})\](.*?)\[\/bgcolor\]/gi, '<span style="background-color:$1; padding: 0 4px; border-radius: 2px;">$2</span>')
                        .replace(/\[HREF=(.*?)\](.*?)\[\/HREF\]/gi, '<a href="$1" target="_blank" class="scp-link">$2</a>');

                    let temp = document.createElement('div');

                    // ВОТ ЭТА СТРОКА РЕШАЕТ ВСЁ:
                    temp.innerHTML = html;

                    const wrapWords = (node) => {
                        if (node.nodeType === 3) {
                            let frag = document.createDocumentFragment();
                            node.nodeValue.split(' ').forEach((w, i, a) => {
                                if (w.trim()) {
                                    let s = document.createElement('span');
                                    s.className = 'word';
                                    s.textContent = w;
                                    frag.appendChild(s);
                                }
                                if (i < a.length - 1) frag.appendChild(document.createTextNode(' '));
                            });
                            return frag;
                        } else {
                            let clone = node.cloneNode(false);
                            node.childNodes.forEach(c => clone.appendChild(wrapWords(c)));
                            return clone;
                        }
                    };

                    Array.from(temp.childNodes).forEach(n => el.appendChild(wrapWords(n)));
                }
            }

            targetContainer.appendChild(el);

            const words = el.querySelectorAll('.word');
            if (words.length > 0) {
                let speedWarp = -0.025;
                for (let w of words) {
                    w.classList.add('decrypting');
                    await new Promise(r => setTimeout(r, 30));
                    w.classList.remove('decrypting');
                    w.classList.add('revealed');
                    await new Promise(r => setTimeout(r, 15 - speedWarp));
                    speedWarp -= speedWarp;
                    output.scrollTop = output.scrollHeight;
                }
            } else {
                el.classList.add('visible');
                await new Promise(r => setTimeout(r, 100));
            }
        }

        const endLine = document.createElement("div");
        endLine.classList.add("doc-line");
        const textSpan_End = document.createElement("span");
        textSpan_End.textContent = "[КОНЕЦ ДОКУМЕНТА]";
        endLine.appendChild(textSpan_End);
        output.appendChild(endLine);

        output.scrollTop = output.scrollHeight;
    }
};
