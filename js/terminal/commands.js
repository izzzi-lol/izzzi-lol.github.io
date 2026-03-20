// Глобальный список для автодополнения в main.js
const COMMAND_LIST = ['get', 'help', 'clear', 'reboot'];

const CommandHandler = {
    async execute(rawInput, terminal) {
        const parts = rawInput.trim().split(' ');
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1); // Всё, что идет после названия команды

        switch (cmd) {
            case 'get':
                // Передаем управление в файл cmd_get.js
                await CmdGet.execute(args, terminal);
                break;

            case 'clear':
                terminal.clearScreen();
                break;

            case 'help':
                terminal.printSystem("ДОСТУПНЫЕ КОМАНДЫ: " + COMMAND_LIST.join(', '));
                terminal.printSystem("ИСПОЛЬЗОВАНИЕ: get [имя_файла]");
                break;

            case 'reboot':
                terminal.printSystem("ПЕРЕЗАГРУЗКА СИСТЕМЫ...");
                localStorage.clear();
                setTimeout(() => location.reload(), 1500);
                break;

            default:
                if (cmd !== '') {
                    terminal.printError(`КОМАНДА НЕ РАСПОЗНАНА: ${cmd}. Введите help для списка команд.`);
                }
        }
    }
};

