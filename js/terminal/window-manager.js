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
//    minSize:  number,   // минимальная высота (px), default: 180
//    maxSize:  number,   // максимальная высота (px), default: 480
//    status:   string,   // текст статус-бара (опционально)
//    backdrop: boolean,  // затемнить фон (default: false)
//    x: number, y: number  // начальная позиция (default: по центру)
//  }
//
//  Только для десктопа — не инициализируется на touch-устройствах.
// =============================================================================

const WindowManager = (() => {

    // Только десктоп
    const IS_DESKTOP = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (!IS_DESKTOP) {
        return {
            open: () => {},
            close: () => {},
            closeAll: () => {},
            setContent: () => {},
        };
    }

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
    let _zBase = 500;
    let _zCounter = 0;
    const _windows = {}; // id → { el, opts, minimized }

    function _bringToFront(el) {
        _zCounter++;
        el.style.zIndex = _zBase + _zCounter;
        // Убираем active со всех, ставим на текущее
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

    // ── Кнопка размера (toggle min/max) ─────────────────────────────────────
    function _makeSizeToggle(win, content, statusbar, opts) {
        const minH = opts.minSize || 180;
        const maxH = opts.maxSize || 480;
        let isMin = false;

        const btn = win.querySelector('.lyoko-btn.resize');

        function setSize(toMin) {
            isMin = toMin;
            const targetH = isMin ? minH : maxH;
            content.style.transition = 'max-height 0.3s cubic-bezier(0.22,1,0.36,1)';
            content.style.maxHeight  = targetH + 'px';
            if (statusbar) statusbar.style.display = isMin ? 'none' : '';
            btn.title     = isMin ? 'Развернуть' : 'Свернуть';
            btn.innerHTML = isMin ? '▲' : '▼';
        }

        setSize(false); // начинаем с max
        btn.addEventListener('click', () => setSize(!isMin));
    }

    // ── Построить окно ───────────────────────────────────────────────────────
    function _buildWindow(id, title, contentHTML, opts) {
        const width  = opts.width   || 420;
        const pos    = (opts.x != null && opts.y != null)
            ? { x: opts.x, y: opts.y }
            : _defaultPos(width, opts.maxSize || 480);

        const win = document.createElement('div');
        win.className  = 'lyoko-window';
        win.dataset.id = id;
        win.style.width  = width + 'px';
        win.style.left   = pos.x + 'px';
        win.style.top    = pos.y + 'px';

        win.innerHTML = `
            <div class="lyoko-titlebar">
                <span class="lyoko-title">${title}</span>
                <button class="lyoko-btn resize" title="Свернуть">▼</button>
                <button class="lyoko-btn close"  title="Закрыть">✕</button>
            </div>
            <div class="lyoko-content">${contentHTML}</div>
            ${opts.status ? `<div class="lyoko-statusbar"><span>${opts.status}</span><span>ID:${id.toUpperCase()}</span></div>` : ''}
        `;

        const titlebar  = win.querySelector('.lyoko-titlebar');
        const content   = win.querySelector('.lyoko-content');
        const statusbar = win.querySelector('.lyoko-statusbar');
        const closeBtn  = win.querySelector('.lyoko-btn.close');

        // Drag
        _makeDraggable(win, titlebar);

        // Resize toggle
        _makeSizeToggle(win, content, statusbar, opts);

        // Close
        closeBtn.addEventListener('click', () => WindowManager.close(id));

        // Клик по окну — вынести вперёд
        win.addEventListener('mousedown', () => _bringToFront(win));

        return win;
    }

    // ── Backdrop ─────────────────────────────────────────────────────────────
    function _updateBackdrop() {
        const anyBackdrop = Object.values(_windows).some(w => w.opts.backdrop);
        backdrop.classList.toggle('visible', anyBackdrop);
    }

    // ── Публичный API ────────────────────────────────────────────────────────

    function open(id, title, contentHTML, opts = {}) {
        _initDOM();

        // Если окно уже открыто — обновляем контент и выносим вперёд
        if (_windows[id]) {
            setContent(id, contentHTML);
            _bringToFront(_windows[id].el);
            return;
        }

        const win = _buildWindow(id, title, contentHTML, opts);
        layer.appendChild(win);
        _windows[id] = { el: win, opts };

        // Анимация материализации
        requestAnimationFrame(() => {
            win.classList.add('materializing');
            win.addEventListener('animationend', () => win.classList.remove('materializing'), { once: true });
        });

        _bringToFront(win);
        _updateBackdrop();
    }

    function close(id) {
        const entry = _windows[id];
        if (!entry) return;

        const win = entry.el;
        win.classList.add('dematerializing');

        win.addEventListener('animationend', () => {
            win.remove();
            delete _windows[id];
            _updateBackdrop();
        }, { once: true });
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
