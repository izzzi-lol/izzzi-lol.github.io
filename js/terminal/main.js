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
        await CmdGet.execute(dossierId, TerminalAPI);
        TerminalAPI.lockInput();
    }

}
// --- ЛОГИКА АВТОРИЗАЦИИ ---
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
        setTimeout(async () => {
            authOverlay.style.display = 'none';
            document.body.classList.remove('locked');
            localStorage.setItem('last_session', Date.now());
            input.focus();

            await handleUrlParams();
        }, 800);
    }, 1000);
}

window.onload = () => {
    const last = localStorage.getItem('last_session');
    if (!last || (Date.now() - last > 300000)) { // 5 минут
        document.body.classList.add('locked');
        startAuth();
    } else {
        authOverlay.style.display = 'none';
        document.body.classList.remove('locked');
        localStorage.setItem('last_session', Date.now());
        input.focus();
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
    }
};