const CmdUpload = {
    // Хранилище для накопления файлов (чтобы можно было догружать по очереди)
    sessionFiles: {},
    dossierContent: "",
    dossierName: "",

    async execute(args, terminal) {
        // Сбрасываем сессию при новом вызове команды
        this.sessionFiles = {};
        this.dossierContent = "";

        terminal.printSystem("[СИСТЕМА] Ожидание выбора файлов...");
        await this.promptForFiles(terminal);
    },

    async promptForFiles(terminal) {
        return new Promise((resolve) => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.multiple = true;
            fileInput.accept = '.txt, image/*';

            fileInput.onchange = async (event) => {
                const files = Array.from(event.target.files);

                // 1. Сначала ищем текст, если он еще не был загружен
                const txtFile = files.find(f => f.name.toLowerCase().endsWith('.txt'));
                if (txtFile && !this.dossierContent) {
                    this.dossierContent = await txtFile.text();
                    this.dossierName = txtFile.name;
                }

                // 2. Добавляем картинки в наше хранилище sessionFiles
                const imageFiles = files.filter(f => f.type.startsWith('image/'));
                for (const img of imageFiles) {
                    const base64 = await this.fileToBase64(img);
                    this.sessionFiles[img.name] = base64;
                }

                // 3. Проверяем, всё ли на месте
                if (!this.dossierContent) {
                    terminal.printError("КРИТИЧЕСКАЯ ОШИБКА: Файл конфигурации (.txt) не найден.");
                    return;
                }

                const missing = this.getMissingImages();

                if (missing.length > 0) {
                    terminal.printError(`НЕДОСТАТОЧНО ФАЙЛОВ!`);
                    terminal.printSystem(`Для корректного отображения догрузите: ${missing.join(', ')}`);

                    const actionBtn = document.createElement('div');
                    actionBtn.className = 'operator-action-btn';
                    actionBtn.innerHTML = `> ОЖИДАНИЕ ДЕЙСТВИЯ ОПЕРАТОРА: НАЖМИТЕ ДЛЯ ДОЗАГРУЗКИ ФАЙЛОВ <`;
                    
                    actionBtn.onclick = () => {
                        actionBtn.remove(); 
                        this.promptForFiles(terminal); 
                    };

                    const outNode = document.getElementById('dossier-output') || terminal.output || document.body;
                    outNode.appendChild(actionBtn);
                    
                    if (outNode.scrollTop !== undefined) {
                        outNode.scrollTop = outNode.scrollHeight;
                    }

                } else {
                    // Всё готово — запускаем рендер
                    this.startRendering(terminal);
                }
                resolve();
            };

            fileInput.click();
        });
    },

    // Ищет в тексте теги [IMAGE] и возвращает список имен файлов, которых нет в памяти
    getMissingImages() {
        // Регулярка ищет [IMAGE] имя_файла.расширение
        const imageTags = this.dossierContent.match(/\[IMAGE\]\s*([^| \n\r\]]+)/g) || [];
        const requiredNames = imageTags.map(tag => tag.replace('[IMAGE]', '').trim());

        // Оставляем только те, которых нет в sessionFiles
        return requiredNames.filter(name => !this.sessionFiles[name]);
    },

    async startRendering(terminal) {
        terminal.printSystem(`[СИСТЕМА] Проверка целостности пройдена.`);
        terminal.printSystem(`[СИСТЕМА] Чтение досье: ${this.dossierName}...`);
        terminal.printSystem(`---`);

        const outputContainer = document.getElementById('dossier-output') || terminal.output;
        if (outputContainer) {
            // Передаем накопленные картинки в CmdGet
            await CmdGet.renderStepByStep(this.dossierContent, outputContainer, 'local', this.sessionFiles);
        }
    },

    fileToBase64(file) {
        return new Promise((resolve) => {
            const r = new FileReader();
            r.onload = e => resolve(e.target.result);
            r.readAsDataURL(file);
        });
    }
};