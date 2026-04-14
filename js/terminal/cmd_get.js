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

            if (folderIds.length === 0) {
                terminal.printError("КРИТИЧЕСКАЯ ОШИБКА: База данных недоступна или пуста.");
                return;
            }

            let matches = [];

            // 2. ПРОВЕРЯЕМ КАЖДЫЙ dossier.txt
            for (const id of folderIds) {
                const docResponse = await fetch(`${DOSSIERS_ROOT}/${id}/dossier.txt`);
                if (!docResponse.ok) continue;

                const content = await docResponse.text();

                // Ищем тег [TITLE], чтобы вытащить имя для превью
                let title = "НЕИЗВЕСТНЫЙ СУБЪЕКТ";
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
                const outputContainer = TerminalAPI.getOutputNode(); // Используем API терминала

                terminal.printSystem(`НАЙДЕНА ЗАПИСЬ ПО ID: ${matches[0].id}`);
                await new Promise(r => setTimeout(r, 20));
                terminal.printSystem(`Инициализация . . .`);

                const startLine = document.createElement("div");
                startLine.classList.add("doc-line");
                const textSpan = document.createElement("span");
                textSpan.textContent = "[НАЧАЛО ДОКУМЕНТА]";
                startLine.appendChild(textSpan);
                outputContainer.appendChild(startLine);

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
    async renderStepByStep(content, output, folderId) {
        const lines = content.split('\n');
        let currentTable = null;
        let currentQuote = null;

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
                el.className = `scp-image-container ${mode}-mode visible`;
                // ДИНАМИЧЕСКИЙ ПУТЬ ДО КАРТИНКИ РАБОТАЕТ!
                el.innerHTML = `<img src="${currentDossierPath}images/${p[0].trim()}"><div class="scp-image-caption">${p[1] || ""}</div>`;
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
                el = document.createElement('div');
                el.className = 'footnote';
                el.textContent = line.replace('[FOOTNOTE]', '');
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
                    // --- ДОБАВЛЕНА ПОДДЕРЖКА ЗАГОЛОВКОВ H1-H6 ---
                    const headerMatch = line.match(/^\[H([1-6])\]/i);

                    if (headerMatch) {
                        const level = headerMatch[1];
                        el = document.createElement(`h${level}`); // Создает h1, h2, h3...
                        el.classList.add('scp-header', `scp-h${level}`); // Классы для гибкой настройки в CSS
                        line = line.replace(headerMatch[0], '').trim(); // Вырезаем тег из текста
                    } else {
                        el = document.createElement('p'); // Стандартный абзац, если это не заголовок
                    }
                    // --------------------------------------------

                    // Проверка на CENTER теперь работает и для абзацев, и для заголовков
                    if (line.startsWith('[CENTER]')) {
                        el.classList.add('center');
                        line = line.replace('[CENTER]', '').trim();
                    }

                    if (currentQuote) targetContainer = currentQuote;

                    let html = line
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\_(.*?)\_/g, '<em>$1</em>')
                        .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gi, '<span style="color:$1">$2</span>')
                        .replace(/\[bgcolor=(#[0-9a-fA-F]{3,6})\](.*?)\[\/bgcolor\]/gi, '<span style="background-color:$1; padding: 0 4px; border-radius: 2px;">$2</span>');

                    let temp = document.createElement('div');
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

        const textSpan = document.createElement("span");
        textSpan.textContent = "[КОНЕЦ ДОКУМЕНТА]";

        endLine.appendChild(textSpan);
        output.appendChild(endLine);

        output.scrollTop = output.scrollHeight;
    }
};
