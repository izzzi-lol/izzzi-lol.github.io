const CmdGet = {
    async execute(args, terminal) {
        if (args.length === 0) {
            terminal.printError("ОШИБКА: Укажите ключевое слово для поиска. Пример: get soul");
            return;
        }

        const query = args.join(' ').toLowerCase();
        terminal.printSystem(`ИНИЦИАЛИЗАЦИЯ ПОИСКА ПО ЗАПРОСУ: "${query}"...`);

        try {
            // 1. Получаем список всех папок с досье
            const listResponse = await fetch('dossiers/list.json');
            if (!listResponse.ok) throw new Error('Список директорий не найден');
            const folderIds = await listResponse.json();

            let foundFolderId = null;
            let foundContent = null;

            // 2. Перебираем папки и ищем внутри файлов dossier.txt
            terminal.printSystem("СКАНИРОВАНИЕ ЛОКАЛЬНЫХ БАЗ ДАННЫХ...");

            for (const id of folderIds) {
                try {
                    const docResponse = await fetch(`dossiers/${id}/dossier.txt`);
                    if (!docResponse.ok) continue;

                    const content = await docResponse.text();

                    // Поиск: проверяем, есть ли запрос в тексте (без учета регистра)
                    if (content.toLowerCase().includes(query)) {
                        foundFolderId = id;
                        foundContent = content;
                        break; // Останавливаем поиск при первом совпадении
                    }
                } catch (e) {
                    console.warn(`Ошибка чтения досье ${id}:`, e);
                }
            }

            if (foundFolderId) {
                terminal.printSystem(`СОВПАДЕНИЕ НАЙДЕНО. ИЗВЛЕЧЕНИЕ ДОСЬЕ [ID: ${foundFolderId}]...`);
                await new Promise(r => setTimeout(r, 800)); // Имитация загрузки

                // Получаем контейнер вывода и запускаем твой парсер
                const outputContainer = document.getElementById('dossier-output');

                const startDoc = document.createElement("div");
                startDoc.classList.add("doc-line");

                const textSpan = document.createElement("span");
                textSpan.textContent = "[НАЧАЛО ДОКУМЕНТА]";

                startDoc.appendChild(textSpan);
                outputContainer.appendChild(startDoc);

                await this.renderStepByStep(foundContent, outputContainer, foundFolderId);
            } else {
                terminal.printError(`ОШИБКА: Запись по запросу "${query}" не найдена.`);
            }

        } catch (error) {
            terminal.printError(`КРИТИЧЕСКАЯ ОШИБКА БАЗЫ ДАННЫХ: ${error.message}`);
        }
    },

    // Твой доведенный до идеала парсер
    async renderStepByStep(content, output, folderId) {
        const lines = content.split('\n');
        let currentTable = null;
        let currentQuote = null;

        // Формируем путь к текущей папке для правильной загрузки картинок
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

            // 1. Обработка COLORCODES
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

            if (line.startsWith('[')) { currentTable = null; currentQuote = null; }

            // 2. Парсинг тегов
            if (line.startsWith('[TITLE]')) {
                el = document.createElement('span'); el.className = 'glitch-title';
                el.textContent = line.replace('[TITLE]', '');
            }
            else if (line.startsWith('[DANGER]')) {
                el = document.createElement('div'); el.className = 'danger-diamond';
                el.textContent = line.replace('[DANGER]', '');
            }
            else if (line.startsWith('[IMAGE]')) {
                let p = line.replace('[IMAGE]', '').split('||');
                el = document.createElement('div');
                let mode = p[2] ? p[2].trim().toLowerCase() : "right";
                el.className = `scp-image-container ${mode}-mode visible`;
                // Здесь используем динамический путь до картинки
                el.innerHTML = `<img src="${currentDossierPath}images/${p[0].trim()}"><div class="scp-image-caption">${p[1]||""}</div>`;
            }
            else if (line.startsWith('[TABLE6]')) {
                let wrapper = document.createElement('div'); wrapper.className = 'table-wrapper visible';
                currentTable = document.createElement('table'); currentTable.className = 'table6';
                wrapper.appendChild(currentTable); el = wrapper;
            }
            else if (line.startsWith('[QUOTE]')) {
                currentQuote = document.createElement('blockquote'); el = currentQuote;
            }
            else if (line.startsWith('[FOOTNOTE]')) {
                el = document.createElement('div'); el.className = 'footnote';
                el.textContent = line.replace('[FOOTNOTE]', '');
            }
            else {
                // 3. Обработка текста и табличных строк
                if (currentTable && line.includes('||')) {
                    let tr = document.createElement('tr');
                    line.split('||').forEach(c => {
                        let td = document.createElement('td');
                        td.innerHTML = c.trim().replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');
                        tr.appendChild(td);
                    });
                    currentTable.appendChild(tr);
                    continue;
                } else {
                    el = document.createElement('p');

                    // 1. Обработка центрирования
                    if (line.startsWith('[CENTER]')) {
                        el.classList.add('center'); // Добавляем класс
                        line = line.replace('[CENTER]', '').trim(); // УДАЛЯЕМ тег из строки, чтобы он не печатался
                    }

                    if (currentQuote) targetContainer = currentQuote;

                    // 2. Магия парсинга форматирования
                    let html = line
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\/\/(.*?)\/\//g, '<em>$1</em>')
                        .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');

                    let temp = document.createElement('div');
                    temp.innerHTML = html;

                    // 3. Рекурсивная функция (оставляем твою, она отличная)
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

            // 4. Запуск анимации
            const words = el.querySelectorAll('.word');
            if (words.length > 0) {
                let speedWarp = -0.025;
                for (let w of words) {
                    // 1. Показываем белый прямоугольник
                    w.classList.add('decrypting');

                    // Ждем 30мс, пока висит прямоугольник
                    await new Promise(r => setTimeout(r, 30));

                    // 2. Убираем прямоугольник и проявляем текст
                    w.classList.remove('decrypting');
                    w.classList.add('revealed');

                    // Ждем 15мс перед следующим словом
                    await new Promise(r => setTimeout(r, 15 - speedWarp));

                    speedWarp -= speedWarp;

                    output.scrollTop = output.scrollHeight;
                }
            } else {
                // Для блоков без слов (картинки, разделители)
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