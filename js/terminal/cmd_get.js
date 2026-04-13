// НАСТРОЙКИ РЕПОЗИТОРИЯ
const GITHUB_USER = "izzzi-lol"; 
const GITHUB_REPO = "izzzi-lol.github.io"; 
const DOSSIERS_ROOT = "dossiers"; 

// Функция для обработки жирного текста и цветов внутри строк
function parseInlineFormatting(text) {
    return text
        // Жирный текст: **текст** -> <b>текст</b>
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        // Цвета: [COLOR=#hex]текст[/COLOR]
        .replace(/\[COLOR=(.*?)\](.*?)\[\/COLOR\]/g, '<span style="color:$1">$2</span>')
        // Если забыл закрыть цветовой тег в конце строки
        .replace(/\[COLOR=(.*?)\](.*?)$/g, '<span style="color:$1">$2</span>');
}

const CmdGet = {
    recentMatches: [],

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
            terminal.printError("ОШИБКА: Укажите ID или имя. Пример: get shade");
            return;
        }

        const query = args.join(' ').toLowerCase();
        const output = document.getElementById('dossier-output');
        output.innerHTML = ''; // Очистка перед загрузкой

        terminal.printSystem(`ЗАПРОС ДАННЫХ: "${query.toUpperCase()}"...`);

        try {
            const folders = await this.fetchAvailableFolders(terminal);
            let found = false;

            for (const id of folders) {
                const response = await fetch(`${DOSSIERS_ROOT}/${id}/dossier.txt`);
                if (!response.ok) continue;

                const content = await response.text();
                // Простая проверка на вхождение ника или ID
                if (id.toLowerCase().includes(query) || content.toLowerCase().includes(query)) {
                    await this.renderDossier(content, output);
                    found = true;
                    break;
                }
            }

            if (!found) terminal.printError("ОБЪЕКТ НЕ НАЙДЕН В СЕТИ SCIPNET.");

        } catch (e) {
            terminal.printError("КРИТИЧЕСКИЙ СБОЙ ПРИ ЧТЕНИИ ФАЙЛА.");
        }
    },

    async renderDossier(rawText, targetContainer) {
        const lines = rawText.split('\n');
        let currentTable = null;
        let currentQuote = null;

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // --- ОБРАБОТКА ЗАКРЫВАЮЩИХ ТЕГОВ (ТВОЙ ФИКС) ---
            if (line.startsWith('[/TABLE6]')) { currentTable = null; continue; }
            if (line.startsWith('[/QUOTE]')) { currentQuote = null; continue; }

            // --- ОБРАБОТКА ЦВЕТОВ ТЕМЫ ---
            if (line.startsWith('[COLORCODES]')) {
                const parts = line.replace('[COLORCODES]', '').split(';');
                parts.forEach(p => {
                    const [key, val] = p.split('=').map(s => s.trim());
                    if (key === 'Mainpage') document.documentElement.style.setProperty('--theme-color', val);
                    if (key === 'Quotes') document.documentElement.style.setProperty('--theme-quote-border', val);
                    if (key === 'Tables') document.documentElement.style.setProperty('--theme-table-bg', val + '33'); // +33 для прозрачности 20%
                });
                continue;
            }

            let el;

            // --- ПАРСИНГ ТЕГОВ ---
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
                targetContainer.appendChild(currentTable);
                continue;
            }
            else if (line.startsWith('[QUOTE]')) {
                currentQuote = document.createElement('blockquote');
                targetContainer.appendChild(currentQuote);
                continue;
            }
            else {
                // Если мы внутри таблицы или цитаты
                if (currentTable) {
                    const row = currentTable.insertRow();
                    line.split('||').forEach(cellText => {
                        const cell = row.insertCell();
                        cell.innerHTML = parseInlineFormatting(cellText.trim());
                    });
                    continue;
                }
                
                el = document.createElement('p');
                el.innerHTML = parseInlineFormatting(line);
                if (currentQuote) {
                    currentQuote.appendChild(el);
                }
            }

            if (!el) continue;

            // --- ЭФФЕКТ ПОЯВЛЕНИЯ ТЕКСТА ---
            if (!currentQuote && !currentTable) {
                targetContainer.appendChild(el);
            }

            if (el.tagName !== 'DIV' && !el.querySelector('img')) {
                const rawHTML = el.innerHTML;
                el.innerHTML = '';
                
                const temp = document.createElement('span');
                temp.innerHTML = rawHTML;

                const wrapWords = (node) => {
                    if (node.nodeType === 3) { // Текст
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

                Array.from(temp.childNodes).forEach(n => el.appendChild(wrapWords(n)));

                const words = el.querySelectorAll('.word');
                let speedWarp = 0;
                for (let w of words) {
                    w.classList.add('decrypting');
                    await new Promise(r => setTimeout(r, 20));
                    w.classList.remove('decrypting');
                    w.classList.add('revealed');
                    
                    // Плавное ускорение, но не до нуля
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
        
        // Финальная черта
        const end = document.createElement('div');
        end.style.textAlign = 'center';
        end.style.margin = '40px 0';
        end.style.opacity = '0.5';
        end.textContent = '--- КОНЕЦ ДОКУМЕНТА ---';
        targetContainer.appendChild(end);
    }
};
