// --- ДОМ ЭЛЕМЕНТЫ ---
const input = document.getElementById('cmd-input');
const suggestion = document.getElementById('cmd-suggestion');
const output = document.getElementById('dossier-output');
const authOverlay = document.getElementById('auth-overlay');
const authTerminal = document.getElementById('auth-terminal');

async function handleUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const dossierId = urlParams.get('get');

    if (dossierId) {
        TerminalAPI.printSystem(`> АВТОМАТИЧЕСКИЙ ЗАПРОС СИСТЕМЫ: GET ${dossierId}`,'var(--terminal-green)');
        TerminalAPI.lockInput();
        await CmdGet.execute([dossierId], TerminalAPI);
        TerminalAPI.unlockInput();
    }

    window.history.replaceState({}, document.title, window.location.pathname);
}
// --- SCP СПЛЭШ (показывается после авторизации) ---
async function showSplash() {
    const splash   = document.getElementById('scp-splash');
    const logo     = document.getElementById('splash-logo');
    const glow     = document.getElementById('splash-logo-glow');
    const sub      = document.getElementById('splash-sub');
    const delay    = ms => new Promise(r => setTimeout(r, ms));

    splash.style.display = 'flex';

    // Логотип появляется
    await delay(80);
    logo.classList.add('animate');
    glow.classList.add('animate');

    // "SECURE." — пауза — "CONTAIN." — пауза — "PROTECT."
    await delay(700);
    document.getElementById('sw-secure').classList.add('show');
    await delay(380);
    document.getElementById('sw-contain').classList.add('show');
    await delay(380);
    document.getElementById('sw-protect').classList.add('show');

    // Подпись
    await delay(300);
    sub.classList.add('show');

    // Держим
    await delay(1400);

    // Fade out
    splash.classList.add('fade-out');
    await delay(900);
    splash.style.display = 'none';
}

// --- ЛОГИКА АВТОРИЗАЦИИ ---
async function startAuth() {
    authOverlay.style.display = 'flex';

    const progressWrap = document.getElementById('auth-progress-wrap');
    const progressBar  = document.getElementById('auth-progress-bar');
    const progressLabel = document.getElementById('auth-progress-label');
    const scanner      = document.getElementById('auth-scanner');
    const authFinal    = document.getElementById('auth-final');

    const delay = ms => new Promise(r => setTimeout(r, ms));

    // Функция: добавить строку в лог
    function printLog(text, color = '') {
        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = text;
        if (color) line.style.color = color;
        authTerminal.appendChild(line);
        authTerminal.scrollTop = authTerminal.scrollHeight;
    }

    // Функция: анимировать прогресс-бар от from до to за duration мс
    async function animateProgress(from, to, duration, label) {
        progressLabel.textContent = label;
        const steps = 30;
        const stepTime = duration / steps;
        const stepVal  = (to - from) / steps;
        for (let i = 0; i <= steps; i++) {
            progressBar.style.width = (from + stepVal * i) + '%';
            await delay(stepTime);
        }
    }

    // === ФАЗА 1: Быстрые системные логи ===
    await delay(200);
    const logs = [
        ["> SCIPNET BOOT SEQUENCE v4.1.9...",         120],
        ["> LOADING KERNEL MODULES...",               110],
        ["> MEMETIC HAZARD FILTER: ACTIVE",           110],
        ["> CONNECTING TO O5 MAINFRAME...",           130],
        ["> ENCRYPTING CHANNEL [AES-4096]...",        110],
        ["> VERIFYING DIGITAL SIGNATURE...",          100],
        ["> ANOMALOUS ENTITY SCAN: CLEAR",            100],
        ["> BIOMETRIC AUTHENTICATION REQUIRED.",      160],
    ];

    for (const [text, wait] of logs) {
        printLog(text);
        await delay(wait);
    }

    // === ФАЗА 2: Прогресс-бар ===
    await delay(100);
    progressWrap.style.display = 'flex';
    await animateProgress(0, 40,  400, 'LOADING CORE SYSTEMS...');
    await animateProgress(40, 75, 350, 'ESTABLISHING SECURE LINK...');
    await animateProgress(75, 95, 250, 'VERIFYING CREDENTIALS...');
    printLog("> CREDENTIALS VERIFIED. INITIATING BIOMETRIC SCAN...");
    await animateProgress(95, 100, 150, 'READY.');
    await delay(200);
    progressWrap.style.display = 'none';

    // === ФАЗА 3: Сканер ===
    scanner.style.display = 'flex';
    printLog("> RETINA SCAN IN PROGRESS...");
    await delay(1400); // время работы сканера

    printLog("> SCAN COMPLETE. ANALYZING...");
    await delay(400);
    scanner.style.display = 'none';

    // === ФАЗА 4: Результат ===
    printLog("> CLEARANCE LEVEL O5 DETECTED.", '#fff');
    await delay(300);
    authFinal.textContent = 'ACCESS GRANTED';
    authFinal.className = 'granted';
    await delay(900);

    // === ФАЗА 5: Fade out → Сплэш → Терминал ===
    authOverlay.style.opacity = '0';
    authOverlay.style.transition = 'opacity 0.7s ease';
    await delay(700);
    authOverlay.style.display = 'none';

    // Показываем SCP сплэш
    await showSplash();

    document.body.classList.remove('locked');
    localStorage.setItem('last_session', Date.now());
    input.focus();
    await handleUrlParams();
}

window.onload = async () => {
    const last = localStorage.getItem('last_session');
    if (!last || (Date.now() - last > 300000)) { // 5 минут
        document.body.classList.add('locked');
        startAuth();
    } else {
        authOverlay.style.display = 'none';
        document.body.classList.remove('locked');
        localStorage.setItem('last_session', Date.now());
        input.focus();
        await handleUrlParams();
    }
};

// --- АВТОДОПОЛНЕНИЕ (Подсказки) ---
input.addEventListener('input', () => {
    const val = input.value.toLowerCase();
    if (!val) { suggestion.textContent = ''; return; }
    const match = COMMAND_LIST.find(cmd => cmd.startsWith(val));
    suggestion.textContent = match ? input.value + match.slice(val.length) : '';
});

// --- ОБРАБОТКА ВВОДА ---
input.addEventListener('keydown', async (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        if (suggestion.textContent) {
            input.value = suggestion.textContent;
            suggestion.textContent = '';
        }
    }

    if (e.key === 'Enter') {
        const rawInput = input.value;
        if (!rawInput.trim()) return;

        TerminalAPI.printSystem(`> ${rawInput}`, '#fff');
        input.value = '';
        suggestion.textContent = '';
        TerminalAPI.lockInput();

        // Передаем управление в роутер команд
        await CommandHandler.execute(rawInput, TerminalAPI);

        TerminalAPI.unlockInput();
    }
});

document.addEventListener('click', () => input.focus());

// --- API ТЕРМИНАЛА (Для использования в командах) ---
const TerminalAPI = {
    getOutputNode: () => output, // Отдаем ссылку на экран для парсера

    printError(text) {
        let el = document.createElement('div');
        el.style.color = 'var(--danger-color)';
        el.style.marginBottom = '10px';
        el.textContent = `[ОШИБКА] ${text}`;
        output.appendChild(el);
        this.scrollToBottom();
    },

    printSystem(text, color = 'var(--terminal-green)') {
        let el = document.createElement('div');
        el.style.color = color;
        el.style.marginBottom = '10px';
        el.textContent = text;
        output.appendChild(el);
        this.scrollToBottom();
    },

    clearScreen() {
        output.innerHTML = '';
    },

    scrollToBottom() {
        output.scrollTop = output.scrollHeight;
    },

    lockInput() {
        input.disabled = true;
    },

    unlockInput() {
        input.disabled = false;
        input.focus();
    },

    // --- АНИМАЦИЯ ВВОДА КОМАНДЫ И ВЫПОЛНЕНИЕ ---
    // Вызывается при клике на [CMD=...] тег
    async typeAndExecute(command) {
        // Блокируем ввод на время анимации
        this.lockInput();
        input.value = '';
        suggestion.textContent = '';

        // Печатаем команду посимвольно
        for (let i = 0; i < command.length; i++) {
            input.value += command[i];
            await new Promise(r => setTimeout(r, 60)); // скорость печати (мс на символ)
        }

        // Небольшая пауза перед выполнением — как будто нажали Enter
        await new Promise(r => setTimeout(r, 400));

        // Выводим команду в терминал и очищаем поле
        this.printSystem(`> ${command}`, '#fff');
        input.value = '';
        suggestion.textContent = '';

        // Выполняем команду
        await CommandHandler.execute(command, TerminalAPI);
        this.unlockInput();
    },

    // --- ПАРСЕР ТЕГА [CMD="..."][LABEL][/CMD] ---
    // Превращает теги в кликабельные ссылки прямо в DOM-узле
    parseCmdTags(container) {
        // Ищем все текстовые узлы внутри контейнера
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);

        // Регулярка для тега: [CMD="команда"][МЕТКА][/CMD]
        const tagRegex = /\[CMD="([^"]+)"\](\[.*?\])\[\/CMD\]/g;

        for (const textNode of textNodes) {
            const raw = textNode.textContent;
            if (!tagRegex.test(raw)) continue;
            tagRegex.lastIndex = 0; // сбрасываем после test()

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let match;

            while ((match = tagRegex.exec(raw)) !== null) {
                const [fullMatch, command, label] = match;

                // Текст до тега — просто текстовый узел
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(raw.slice(lastIndex, match.index)));
                }

                // Создаём кликабельный элемент
                const link = document.createElement('span');
                link.textContent = label;
                link.title = `Выполнить: ${command}`;
                link.style.cssText = `
                    color: var(--terminal-green);
                    cursor: pointer;
                    text-decoration: underline;
                    text-underline-offset: 3px;
                    font-weight: bold;
                    transition: opacity 0.2s;
                `;
                link.addEventListener('mouseenter', () => link.style.opacity = '0.7');
                link.addEventListener('mouseleave', () => link.style.opacity = '1');
                link.addEventListener('click', () => TerminalAPI.typeAndExecute(command));

                fragment.appendChild(link);
                lastIndex = match.index + fullMatch.length;
            }

            // Остаток текста после последнего тега
            if (lastIndex < raw.length) {
                fragment.appendChild(document.createTextNode(raw.slice(lastIndex)));
            }

            textNode.parentNode.replaceChild(fragment, textNode);
        }
    },

    // --- ВЫВОД HTML С ПОДДЕРЖКОЙ [CMD] ТЕГОВ ---
    // Используй этот метод в cmd_get.js вместо innerHTML напрямую
    printHTML(html) {
        const el = document.createElement('div');
        el.innerHTML = html;
        this.parseCmdTags(el); // обрабатываем теги перед вставкой
        output.appendChild(el);
        this.scrollToBottom();
    },
};