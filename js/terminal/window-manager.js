// =============================================================================
//  window-manager.js — Lyoko Window Manager
//  Система интерактивных окон в стиле Суперкомпьютера из Code Lyoko.
//
//  API:
//    WindowManager.open(id, title, contentHTML, opts)  → открыть/показать окно
//    WindowManager.close(id)                           → закрыть окно
//    WindowManager.closeAll()                          → закрыть все окна
//    WindowManager.setContent(id, html)                → обновить контент
//
//  opts = {
//    width:    number,   // начальная ширина (px), default: 420
//    minSize:  number,   // высота контента в свёрнутом состоянии (px), default: 180
//    maxSize:  number,   // максимальная высота контента (px), default: 480
//    status:   string,   // текст статус-бара (опционально)
//    backdrop: boolean,  // затемнить фон (default: false)
//    x: number, y: number  // начальная позиция (default: по центру)
//  }
//
//  Только для десктопа — не инициализируется на touch-устройствах.
//
//  Анимация появления (3 фазы):
//    1. Яркий белый прямоугольник (flash, ~60 мс)
//    2. Окно с TitleBar и StatusBar, контент скрыт
//    3. Контент раскрывается слайдером вниз (CSS grid transition, 380 мс)
//
//  Анимация исчезновения (3 фазы):
//    1. Контент схлопывается слайдером вверх (380 мс)
//    2. Яркий белый прямоугольник (flash, ~65 мс)
//    3. Окно схлопывается по ширине scaleX → 0 (260 мс)
// =============================================================================

const WindowManager = (() => {

    // Только десктоп
    const IS_DESKTOP = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
/*
    if (!IS_DESKTOP) {
        return {
            open:       () => {},
            close:      () => {},
            closeAll:   () => {},
            setContent: () => {},
        };
    }
*/
    // ── Слой окон ────────────────────────────────────────────────────────────
    let layer, backdrop;

    function _initDOM() {
        if (layer) return;
        backdrop = document.createElement('div');
        backdrop.id = 'wm-backdrop';
        document.body.appendChild(backdrop);
        layer = document.createElement('div');
        layer.id = 'wm-layer';
        document.body.appendChild(layer);
    }

    // ── Z-index management ───────────────────────────────────────────────────
    let _zBase    = 500;
    let _zCounter = 0;
    const _windows = {}; // id → { el, opts }

    function _bringToFront(el) {
        _zCounter++;
        el.style.zIndex = _zBase + _zCounter;
        layer.querySelectorAll('.lyoko-window').forEach(w => w.classList.remove('active'));
        el.classList.add('active');
    }

    // ── Позиционирование по умолчанию ────────────────────────────────────────
    let _cascadeOffset = 0;
    function _defaultPos(width, height) {
        const cx = Math.round((window.innerWidth  - width)  / 2) + _cascadeOffset;
        const cy = Math.round((window.innerHeight - height) / 2) + _cascadeOffset;
        _cascadeOffset = (_cascadeOffset + 28) % 112;
        return {
            x: Math.max(0, Math.min(cx, window.innerWidth  - width  - 20)),
            y: Math.max(0, Math.min(cy, window.innerHeight - height - 40)),
        };
    }

    // ── Утилиты ──────────────────────────────────────────────────────────────

    /** Промис-пауза на N миллисекунд */
    const _sleep = ms => new Promise(r => setTimeout(r, ms));

    /** Один кадр requestAnimationFrame */
    const _raf   = ()  => new Promise(r => requestAnimationFrame(r));

    // ── Drag ─────────────────────────────────────────────────────────────────
    function _makeDraggable(win, titlebar) {
        let ox = 0, oy = 0, startX = 0, startY = 0;

        titlebar.addEventListener('mousedown', e => {
            if (e.target.closest('.lyoko-btn')) return;
            e.preventDefault();
            _bringToFront(win);

            startX = e.clientX;
            startY = e.clientY;
            const rect = win.getBoundingClientRect();
            ox = rect.left;
            oy = rect.top;

            const onMove = e => {
                const nx = ox + (e.clientX - startX);
                const ny = oy + (e.clientY - startY);
                win.style.left = Math.max(0, Math.min(nx, window.innerWidth  - win.offsetWidth))  + 'px';
                win.style.top  = Math.max(0, Math.min(ny, window.innerHeight - win.offsetHeight)) + 'px';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',   onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',   onUp);
        });
    }

    // ── Кнопка размера (toggle compact/full) ─────────────────────────────────
    function _makeSizeToggle(win, content, statusbar, opts) {
        const minH = opts.minSize || 180;
        const maxH = opts.maxSize || 480;
        let isMin  = false;
        const btn  = win.querySelector('.lyoko-btn.resize');

        function setSize(toMin) {
            isMin = toMin;
            content.style.transition = 'max-height 0.3s cubic-bezier(0.22,1,0.36,1)';
            content.style.maxHeight  = (isMin ? minH : maxH) + 'px';
            if (statusbar) statusbar.style.display = isMin ? 'none' : '';
            btn.title     = isMin ? 'Развернуть' : 'Свернуть';
            btn.innerHTML = isMin ? '▲' : '▼';
        }

        setSize(false); // начинаем с развёрнутого состояния
        btn.addEventListener('click', () => setSize(!isMin));
    }

    // =========================================================================
    //  АНИМАЦИИ
    // =========================================================================

    /**
     * Появление окна (3 фазы).
     *
     * Всё до первого await — синхронный блок: браузер НЕ рисует между шагами 1–3.
     * Первый _raf() — первый yield → браузер рисует flash + collapsed за один кадр.
     * Пользователь никогда не видит «полное» окно до анимации.
     */
    async function _animateOpen(win, wrapper) {
        // 1. Мгновенно схлопываем контент (без transition, пока всё скрыто)
        wrapper.style.transition = 'none';
        wrapper.classList.add('collapsed');

        // 2. Накладываем белую вспышку поверх
        win.classList.add('wm-flash');

        // Ждём два кадра — гарантируем, что браузер отрисовал оба состояния
        await _raf(); await _raf();
        await _sleep(55);

        // 3. Убираем flash → видны только TitleBar + StatusBar (контент скрыт)
        win.classList.remove('wm-flash');

        await _sleep(28);

        // 4. Возвращаем CSS transition и открываем контент слайдером вниз
        wrapper.style.transition = '';
        wrapper.classList.remove('collapsed');
        // CSS grid transition (0.38s) работает самостоятельно
    }

    /**
     * Исчезновение окна (3 фазы).
     * Вызывается после удаления окна из _windows,
     * поэтому повторный вызов close(id) невозможен.
     */
    async function _animateClose(win, wrapper) {
        win.style.pointerEvents = 'none';

        // 1. Контент схлопывается слайдером вверх (CSS grid transition, 0.38s)
        wrapper.classList.add('collapsed');
        await _sleep(410); // чуть больше 380 мс transition

        // 2. Белая вспышка — окно вспыхивает белым прямоугольником
        win.classList.add('wm-flash');
        await _sleep(65);
        win.classList.remove('wm-flash');
        await _sleep(12);

        // 3. Окно схлопывается по ширине (scaleX: 1 → 0)
        // Transition задаём инлайново — переопределяет CSS rule (inline > class)
        win.style.transition = 'transform 0.26s cubic-bezier(0.55, 0, 1, 0.45)';
        win.style.transform  = 'scaleX(0)';
        await _sleep(280);

        win.remove();
    }

    // ── Построить DOM окна ───────────────────────────────────────────────────
    function _buildWindow(id, title, contentHTML, opts) {
        const width = opts.width || 420;
        const pos   = (opts.x != null && opts.y != null)
            ? { x: opts.x, y: opts.y }
            : _defaultPos(width, opts.maxSize || 480);

        const win = document.createElement('div');
        win.className  = 'lyoko-window';
        win.dataset.id = id;
        win.style.width = width + 'px';
        win.style.left  = pos.x + 'px';
        win.style.top   = pos.y + 'px';

        win.innerHTML = `
            <div class="lyoko-titlebar">
                <span class="lyoko-title">${title}</span>
                <button class="lyoko-btn resize" title="Свернуть">▼</button>
                <button class="lyoko-btn close"  title="Закрыть">✕</button>
            </div>
            <div class="lyoko-content-wrapper">
                <div class="lyoko-content">${contentHTML}</div>
            </div>
            ${opts.status ? `<div class="lyoko-statusbar"><span>${opts.status}</span><span>ID:${id.toUpperCase()}</span></div>` : ''}
        `;

        const titlebar  = win.querySelector('.lyoko-titlebar');
        const wrapper   = win.querySelector('.lyoko-content-wrapper');
        const content   = win.querySelector('.lyoko-content');
        const statusbar = win.querySelector('.lyoko-statusbar');
        const closeBtn  = win.querySelector('.lyoko-btn.close');

        _makeDraggable(win, titlebar);
        _makeSizeToggle(win, content, statusbar, opts);
        closeBtn.addEventListener('click', () => WindowManager.close(id));
        win.addEventListener('mousedown', () => _bringToFront(win));

        return win;
    }

    // ── Backdrop ─────────────────────────────────────────────────────────────
    function _updateBackdrop() {
        const anyBackdrop = Object.values(_windows).some(w => w.opts.backdrop);
        backdrop.classList.toggle('visible', anyBackdrop);
    }

    // =========================================================================
    //  ПУБЛИЧНЫЙ API
    // =========================================================================

    function open(id, title, contentHTML, opts = {}) {
        _initDOM();

        // Окно уже открыто — обновляем контент и выносим вперёд
        if (_windows[id]) {
            setContent(id, contentHTML);
            _bringToFront(_windows[id].el);
            return;
        }

        const win     = _buildWindow(id, title, contentHTML, opts);
        layer.appendChild(win);
        _windows[id] = { el: win, opts };
        _bringToFront(win);
        _updateBackdrop();

        // Запускаем анимацию ПОСЛЕ appendChild — иначе браузер не знает о DOM-узле
        const wrapper = win.querySelector('.lyoko-content-wrapper');
        _animateOpen(win, wrapper);
    }

    function close(id) {
        const entry = _windows[id];
        if (!entry) return;

        const win     = entry.el;
        const wrapper = win.querySelector('.lyoko-content-wrapper');

        // Сразу убираем из реестра — повторный close(id) вернётся на первой строке
        delete _windows[id];
        _updateBackdrop();

        _animateClose(win, wrapper);
    }

    function closeAll() {
        Object.keys(_windows).forEach(id => close(id));
    }

    function setContent(id, html) {
        const entry = _windows[id];
        if (!entry) return;
        const content = entry.el.querySelector('.lyoko-content');
        if (content) content.innerHTML = html;
    }

    return { open, close, closeAll, setContent };

})();
