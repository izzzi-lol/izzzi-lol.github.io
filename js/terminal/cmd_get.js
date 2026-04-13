// НАСТРОЙКИ РЕПОЗИТОРИЯ
const GITHUB_USER = "izzzi-lol"; 
const GITHUB_REPO = "izzzi-lol.github.io"; 
const DOSSIERS_ROOT = "dossiers"; 

// Функция для обработки жирного текста и цветов внутри строк
function parseInlineFormatting(text) {
    if (!text) return "";
    return text
        // Жирный текст: **текст** -> <b>текст</b>
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        // Цвета: [COLOR=#hex]текст[/COLOR]
        .replace(/\[COLOR=(.*?)\](.*?)\[\/COLOR\]/g, '<span style="color:$1">$2</span>')
        // Если забыл закрыть цветовой тег
        .replace(/\[COLOR=(.*?)\](.*?)$/g, '<span style="color:$1">$2</span>');
}

const CmdGet = {
    recentMatches: [], // Хранилище для нескольких результатов

    async fetchAvailableFolders(terminal) {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${DOSSIERS_ROOT}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            return data.filter(item => item.type === 'dir').map(item => item.name);
        } catch (e) {
            terminal.printError("Ошибка подключения к базе данных.");
            return [];
        }
    },

        async execute(args, terminal) {
        if (args.length === 0) {
            terminal.printError("ОШИБКА: Укажите ID, имя или ключевое слово. Пример: get shade");
            return;
        }

        const query = args.join(' ').toLowerCase();
        const output = document.getElementById('dossier-output');

        // Если пользователь ввел номер из списка найденных ранее
        if (this.recentMatches.length > 0 && !isNaN(query)) {
            const index = parseInt(query) - 1;
            if (this.recentMatches[index]) {
                output.innerHTML = '';
                await this.renderDossier(this.recentMatches[index].content, output);
                this.recentMatches = [];
                return;
            }
        }

        terminal.printSystem(`ИНИЦИАЛИЗАЦИЯ ГЛОБАЛЬНОГО ПОИСКА: "${query.toUpperCase()}"...`);

        try {
            const folders = await this.fetchAvailableFolders(terminal);
            let matches = [];

            for (const id of folders) {
                const response = await fetch(`${DOSSIERS_ROOT}/${id}/dossier.txt`);
                if (!response.ok) continue;

                const content = await response.text();
                const lines = content.split('\n');
                
                // Извлекаем заголовок
                let title = id;
                for (let line of lines) {
                    if (line.startsWith('[TITLE]')) {
                        title = line.replace('[TITLE]', '').trim();
                        break; // Заголовок нашли, дальше можно не искать в цикле
                    }
                }

                // Очищаем текст от системных тегов для честного поиска по тексту и создания отрывка
                const cleanText = content
                    .replace(/\[.*?\]/g, '') // удаляем все теги вроде [TITLE], [COLOR] и т.д.
                    .replace(/\*\*(.*?)\*\*/g, '$1') // убираем разметку жирного
                    .replace(/\s+/g, ' ') // превращаем переносы строк и двойные пробелы в один пробел
                    .trim();

                const lowerCleanText = cleanText.toLowerCase();
                const matchIndex = lowerCleanText.indexOf(query);

                // Проверяем совпадение по ID, Титулу или содержимому
                if (id.toLowerCase().includes(query) || title.toLowerCase().includes(query) || matchIndex !== -1) {
                    let snippet = "";

                    // Если нашли именно в тексте, формируем отрывок
                    if (matchIndex !== -1) {
                        // Берем по 40 символов до и после найденного слова
                        const snippetStart = Math.max(0, matchIndex - 40);
                        const snippetEnd = Math.min(cleanText.length, matchIndex + query.length + 40);
                        
                        snippet = cleanText.substring(snippetStart, snippetEnd);
                        // Добавляем многоточия, если отрывок обрезан
                        if (snippetStart > 0) snippet = "..." + snippet;
                        if (snippetEnd < cleanText.length) snippet = snippet + "...";
                    }

                    matches.push({ id, title, content, snippet });
                }
            }

            if (matches.length === 0) {
                terminal.printError("ОБЪЕКТ НЕ НАЙДЕН В СЕТИ SCIPNET.");
            } else if (matches.length === 1) {
                output.innerHTML = '';
                await this.renderDossier(matches[0].content, output);
            } else {
                // Если найдено несколько — выводим список с отрывками
                this.recentMatches = matches;
                terminal.printSystem(`НАЙДЕНО НЕСКОЛЬКО СОВПАДЕНИЙ (${matches.length}):`);
                matches.forEach((m, i) => {
                    terminal.print(`  [${i + 1}] ID: ${m.id} | ${m.title}`);
                    // Если есть текстовый отрывок, выводим его под заголовком
                    if (m.snippet) {
                        // Оборачиваем отрывок в span с уменьшенной непрозрачностью для эстетики (по желанию)
                        terminal.print(`      > <span style="opacity: 0.7;">${m.snippet}</span>`);
                    }
                });
                terminal.print(`Введите номер [1-${matches.length}] для открытия.`);
            }

        } catch (e) {
            terminal.printError("КРИТИЧЕСКИЙ СБОЙ ПРИ ОБРАБОТКЕ ЗАПРОСА.");
        }
    },

    async renderDossier(rawText, targetContainer) {
        const lines = rawText.split('\n');
        let currentTable = null;
        let isFirstTableRow = false;
        let currentQuote = null;

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('[CODES]')) continue;

            if (line.startsWith('[/TABLE6]')) { currentTable = null; continue; }
            if (line.startsWith('[/QUOTE]')) { currentQuote = null; continue; }

            if (line.startsWith('[COLORCODES]')) {
                const parts = line.replace('[COLORCODES]', '').split(';');
                parts.forEach(p => {
                    const [key, val] = p.split('=').map(s => s.trim());
                    if (key === 'Mainpage') document.documentElement.style.setProperty('--theme-color', val);
                    if (key === 'Quotes') document.documentElement.style.setProperty('--theme-quote-border', val);
                    if (key === 'Tables') document.documentElement.style.setProperty('--theme-table-bg', val + '33');
                });
                continue;
            }

            let el;

            // Рендеринг тегов
            if (line.startsWith('[TITLE]')) {
                el = document.createElement('span');
                el.className = 'glitch-title';
                el.textContent = line.replace('[TITLE]', '').trim();
            }
            else if (line.match(/^\[H[1-6]\]/)) {
                const level = line.match(/^\[H([1-6])\]/)[1];
                el = document.createElement('h' + level);
                el.innerHTML = parseInlineFormatting(line.replace(`[H${level}]`, '').trim());
            }
            else if (line.startsWith('[DANGER]')) {
                el = document.createElement('div');
                el.className = 'danger-diamond';
                el.innerHTML = `⚠️ ${parseInlineFormatting(line.replace('[DANGER]', '').trim())}`;
            }
            else if (line.startsWith('[CENTER]')) {
                el = document.createElement('div');
                el.className = 'center';
                el.innerHTML = parseInlineFormatting(line.replace('[CENTER]', '').trim());
            }
            else if (line.startsWith('[IMAGE]')) {
                const [src, desc, side] = line.replace('[IMAGE]', '').split('||').map(s => s.trim());
                el = document.createElement('div');
                el.className = `scp-image-container ${side || 'right'}`;
                el.innerHTML = `<img src="dossiers/images/${src}" class="scp-image"><p class="image-caption">${desc || ''}</p>`;
            }
            else if (line.startsWith('[TABLE6]')) {
                currentTable = document.createElement('table');
                currentTable.className = 'dossier-table';
                isFirstTableRow = true; // Первая строка будет <th>
                targetContainer.appendChild(currentTable);
                continue;
            }
            else if (line.startsWith('[QUOTE]')) {
                currentQuote = document.createElement('blockquote');
                targetContainer.appendChild(currentQuote);
                continue;
            }
            else {
                if (currentTable) {
                    const tr = document.createElement('tr');
                    line.split('||').forEach(cellText => {
                        const cell = document.createElement(isFirstTableRow ? 'th' : 'td');
                        cell.innerHTML = parseInlineFormatting(cellText.trim());
                        tr.appendChild(cell);
                    });
                    currentTable.appendChild(tr);
                    isFirstTableRow = false;
                    continue;
                }
                
                el = document.createElement('p');
                el.innerHTML = parseInlineFormatting(line);
                if (currentQuote) {
                    currentQuote.appendChild(el);
                    continue;
                }
            }

            if (!el) continue;
            targetContainer.appendChild(el);

            // Анимация появления текста
            if (el.tagName === 'P' || el.tagName === 'SPAN' || el.tagName.startsWith('H')) {
                const rawHTML = el.innerHTML;
                el.innerHTML = '';
                
                const wrapWords = (node) => {
                    if (node.nodeType === 3) {
                        const frag = document.createDocumentFragment();
                        node.textContent.split(' ').forEach(word => {
                            if (!word) return;
                            const span = document.createElement('span');
                            span.className = 'word';
                            span.textContent = word + ' ';
                            frag.appendChild(span);
                        });
                        return frag;
                    } else {
                        let clone = node.cloneNode(false);
                        node.childNodes.forEach(c => clone.appendChild(wrapWords(c)));
                        return clone;
                    }
                };

                const temp = document.createElement('div');
                temp.innerHTML = rawHTML;
                Array.from(temp.childNodes).forEach(n => el.appendChild(wrapWords(n)));

                const words = el.querySelectorAll('.word');
                let speedWarp = 0;
                for (let w of words) {
                    w.classList.add('decrypting');
                    await new Promise(r => setTimeout(r, 20));
                    w.classList.remove('decrypting');
                    w.classList.add('revealed');
                    await new Promise(r => setTimeout(r, Math.max(2, 15 - speedWarp)));
                    speedWarp += 0.2;
                    targetContainer.scrollTop = targetContainer.scrollHeight;
                }
            } else {
                el.classList.add('visible');
                targetContainer.scrollTop = targetContainer.scrollHeight;
                await new Promise(r => setTimeout(r, 100));
            }
        }
        
        const footer = document.createElement('div');
        footer.style = "text-align:center; margin:40px 0; opacity:0.3; font-size:0.8em;";
        footer.textContent = "--- КОНЕЦ ДОКУМЕНТА ---";
        targetContainer.appendChild(footer);
    }
};
