const input = document.getElementById('cmd-input');
const output = document.getElementById('dossier-output');
const authOverlay = document.getElementById('auth-overlay');
const authTerminal = document.getElementById('auth-terminal');

let recentMatches = []; // Хранилище для последних результатов поиска

// Логика авторизации
async function startAuth() {
    authOverlay.style.display = 'flex';
    const logs = [
        "> INITIALIZING SCIPNET BOOT...",
        "> LOADING MEMETIC AGENT...",
        "> BIOMETRICS REQUIRED...",
        "> SCANNING...",
        "> CLEARANCE LEVEL O5 DETECTED.",
        "> WELCOME, DIRECTOR."
    ];
    for (let l of logs) {
        let d = document.createElement('div');
        d.textContent = l;
        authTerminal.appendChild(d);
        await new Promise(r => setTimeout(r, 500));
    }
    setTimeout(() => {
        authOverlay.style.opacity = '0';
        authOverlay.style.transition = 'opacity 0.8s ease';
        setTimeout(() => {
            authOverlay.style.display = 'none';
            document.body.classList.remove('locked');
            localStorage.setItem('last_session', Date.now());
            input.focus();
        }, 800);
    }, 1000);
}

window.onload = () => {
    const last = localStorage.getItem('last_session');
    if (!last || (Date.now() - last) > 900000) startAuth();
    else { authOverlay.style.display = 'none'; document.body.classList.remove('locked'); }
};

let currentDossierPath = "";

async function searchDossier(query) {
    output.innerHTML = '';
    const searchStatus = document.createElement('div');
    searchStatus.className = 'word revealed';
    output.appendChild(searchStatus);

    const loaderIcons = ['\\', '|', '/', '-'];
    let i = 0;
    const loaderInterval = setInterval(() => {
        searchStatus.innerHTML = `<span style="color:yellow">ПОИСК ${loaderIcons[i++ % loaderIcons.length]}</span>`;
    }, 100);

    try {
        const listRes = await fetch('dossiers/list.json');
        const dossierIds = await listRes.json();
        let matches = [];

        for (let id of dossierIds) {
            try {
                const codeRes = await fetch(`dossiers/${id}/dossier.txt`);
                const codesText = await codeRes.text();
                const codeId = codesText.split('\n')[0].replace('[CODES]','');
                const keywords = codeId.split(',').map(k => k.trim().toLowerCase());
                if (keywords.includes(query.toLowerCase())) matches.push(id);
            } catch (e) { console.error(`Ошибка папки ${id}`); }
        }

        clearInterval(loaderInterval);

        if (matches.length === 1) {
            searchStatus.innerHTML = `<p style="color:cyan">Найдено 1 совпадение.</p>`;
            await new Promise(r => setTimeout(r, 1000));
            output.innerHTML = '';
            loadFullDossier(matches[0]);
        } else if (matches.length > 1) {
            recentMatches = matches; // Сохраняем совпадения [cite: 2]
            searchStatus.innerHTML = `<p style="color:orange; margin: 5px 0;">Найдено несколько совпадений. Используйте GET RECENT [номер]:</p>`;

            matches.forEach((id, index) => {
                const item = document.createElement('p');
                item.className = 'word revealed';
                item.style.color = 'var(--terminal-green)';
                item.style.margin = '2px 0'; // Минимальный отступ для плотности [cite: 1]
                item.innerHTML = `[${index + 1}] - ${id}`;
                output.appendChild(item);
            });
        }
    } catch (err) {
        clearInterval(loaderInterval);
        searchStatus.innerHTML = `<div class="danger-diamond">КРИТИЧЕСКИЙ СБОЙ СИСТЕМЫ</div>`;
    }
}

async function loadFullDossier(id) {
    currentDossierPath = `dossiers/${id}/`;
    try {
        const res = await fetch(`${currentDossierPath}dossier.txt`);
        const text = await res.text();
        await renderStepByStep(text);
    } catch {
        output.innerHTML = '<div class="danger-diamond">ОШИБКА ЧТЕНИЯ ФАЙЛА</div>';
    }
}

input.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const cmd = input.value.trim().toUpperCase();
        input.value = '';

        if (cmd.startsWith('GET RECENT ')) {
            const index = parseInt(cmd.replace('GET RECENT ', '')) - 1;
            if (recentMatches[index]) {
                output.innerHTML = '';
                loadFullDossier(recentMatches[index]);
            } else {
                const err = document.createElement('div');
                err.className = 'danger-diamond';
                err.textContent = "ОШИБКА: НЕВЕРНЫЙ ИНДЕКС";
                output.appendChild(err);
            }
        }
        else if (cmd.startsWith('GET ')) {
            searchDossier(cmd.substring(4));
        }
    }
});

async function renderStepByStep(content) {
    const lines = content.split('\n');
    let currentTable = null;
    let currentQuote = null;

    // Убираем [CODES] и сбрасываем тему
    lines.shift();
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
                if (currentQuote) targetContainer = currentQuote;

                // Магия парсинга
                let html = line
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\/\/(.*?)\/\//g, '<em>$1</em>')
                    .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');

                let temp = document.createElement('div'); temp.innerHTML = html;

                // Рекурсивная функция для анимации слов, не ломающая теги
                const wrapWords = (node) => {
                    if (node.nodeType === 3) {
                        let frag = document.createDocumentFragment();
                        node.nodeValue.split(' ').forEach((w, i, a) => {
                            if (w.trim()) {
                                let s = document.createElement('span'); s.className = 'word'; s.textContent = w;
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
                // Запуск анимации слов
        const words = el.querySelectorAll('.word');
        if (words.length > 0) {
            for (let w of words) {
                // 1. Показываем белый прямоугольник
                w.classList.add('decrypting');
                
                // Ждем 30мс, пока висит прямоугольник
                await new Promise(r => setTimeout(r, 30));
                
                // 2. Убираем прямоугольник и проявляем текст
                w.classList.remove('decrypting');
                w.classList.add('revealed');
                
                // Ждем 15мс перед следующим словом
                await new Promise(r => setTimeout(r, 15));
                
                output.scrollTop = output.scrollHeight;
            }
        } else {
            // Для блоков без слов (картинки, разделители)
            el.classList.add('visible');
            await new Promise(r => setTimeout(r, 100));
        }
    }
}