/* ==========================================================================
   АРКА 123 — секция «Пространство»
   1. Цифры (123 м², 4,5 м, 33 панели) плавно «досчитываются» при появлении в окне.
   2. Варианты расстановки: вкладки + большая картинка 16:9 с кроссфейдом 400 мс,
      подпись варианта, предзагрузка остальных картинок после первой отрисовки.
   3. Кнопка «360°»: модальное окно с панорамой выбранной расстановки (Pannellum с CDN,
      файлы media/pano-1…4.webp). Кнопка скрыта, пока не найден файл панорамы.
   4. Кнопка «3D-модель зала»: объёмная модель (js/tour3d.js, three.js) грузится только по клику,
      расстановки переключаются теми же вкладками. Нет WebGL или модуль не загрузился — кнопка скрыта.
   5. Кнопка «Видео-тур»: ролик media/tour.mp4 в модальном окне (скрыта, если файла нет).

   Сама анимация кроссфейда живёт в CSS (.layouts__img, 400 мс), скрипт только
   переключает классы .is-active / .is-leaving. При prefers-reduced-motion
   глобальное правило в CSS обнуляет длительность, и картинки меняются мгновенно.
   ========================================================================== */
(function () {
  'use strict';

  var section = document.querySelector('[data-space]');
  if (!section) return;

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var hasObserver = 'IntersectionObserver' in window;

  initCounters(section);
  initLayouts(section);
  initPanorama(section);
  initTour(section);
  initVideo(section);


  /* ======================================================================
     1. Счётчики
     ====================================================================== */
  function initCounters(root) {
    var counters = root.querySelectorAll('[data-count]');
    // Без движения или без IntersectionObserver остаётся итоговое число из разметки
    if (!counters.length || !hasObserver || motionQuery.matches) return;

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        obs.unobserve(entry.target);
        countUp(entry.target);
      });
    }, { threshold: 0.6 });

    Array.prototype.forEach.call(counters, function (el) {
      el.textContent = formatNumber(0, decimalsOf(el));
      observer.observe(el);
    });
  }

  function decimalsOf(el) {
    return parseInt(el.getAttribute('data-decimals') || '0', 10);
  }

  // 4.5 → «4,5»: в русском тексте десятичная запятая
  function formatNumber(value, decimals) {
    return value.toFixed(decimals).replace('.', ',');
  }

  function countUp(el) {
    var end = parseFloat(el.getAttribute('data-count'));
    var decimals = decimalsOf(el);
    var duration = 1400;
    var start = null;

    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);                 // easeOutCubic
      el.textContent = formatNumber(end * eased, decimals);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = formatNumber(end, decimals);  // точное итоговое значение
    }
    requestAnimationFrame(step);
  }


  /* ======================================================================
     2. Варианты расстановки
     ====================================================================== */
  function initLayouts(root) {
    var box = root.querySelector('[data-layouts]');
    if (!box) return;

    var frame = box.querySelector('.layouts__frame');
    var status = box.querySelector('[data-layouts-status]');
    var images = toArray(box.querySelectorAll('.layouts__img'));
    var tabs = toArray(box.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (tab) {
      return document.getElementById(tab.getAttribute('aria-controls'));
    });
    if (!frame || !tabs.length || tabs.length !== images.length) return;

    var current = 0;        // индекс выбранной вкладки
    var token = 0;          // номер последнего выбора: защита от гонок при быстрых кликах
    var leaveTimer = null;  // таймер, который убирает уходящую картинку
    var loaders = [];       // промис загрузки для каждой картинки

    /* ---------- загрузка картинок ---------- */

    // Возвращает промис: true — картинка загружена и декодирована, false — не загрузилась.
    // Картинки 2…4 лежат в разметке с пустым gif в src и настоящим адресом в data-src.
    function loadImage(i) {
      if (loaders[i]) return loaders[i];

      var img = images[i];
      var real = img.getAttribute('data-src');

      loaders[i] = new Promise(function (resolve) {
        function finish(ok) {
          img.removeEventListener('load', onLoad);
          img.removeEventListener('error', onError);
          if (!ok) loaders[i] = null;   // при следующем клике попробуем ещё раз
          resolve(ok);
        }
        function onLoad() {
          // decode(): картинка готова к показу заранее, и кроссфейд не «дёргается»
          if (img.decode) {
            img.decode().then(function () { finish(true); }, function () { finish(true); });
          } else {
            finish(true);
          }
        }
        function onError() { finish(false); }

        img.addEventListener('load', onLoad);
        img.addEventListener('error', onError);

        if (real) {
          img.src = real;                                        // подставляем настоящий адрес
        } else if (img.complete) {                               // первая картинка могла загрузиться раньше скрипта
          if (img.naturalWidth) onLoad(); else onError();
        }
      });

      return loaders[i];
    }

    /* ---------- показ картинки: кроссфейд ---------- */

    // Новая картинка проявляется поверх старой; старая остаётся непрозрачной (.is-leaving)
    // и снимается уже под полностью проявившейся новой — «просвета» посередине нет.
    function showImage(i) {
      var next = images[i];
      var prev = frame.querySelector('.layouts__img.is-active');

      clearTimeout(leaveTimer);
      toArray(frame.querySelectorAll('.is-leaving')).forEach(function (el) {
        el.classList.remove('is-leaving');
      });

      if (prev && prev !== next) {
        prev.classList.remove('is-active');
        prev.classList.add('is-leaving');
        prev.setAttribute('aria-hidden', 'true');
      }
      next.classList.add('is-active');
      next.removeAttribute('aria-hidden');

      leaveTimer = setTimeout(function () {
        if (prev) prev.classList.remove('is-leaving');
      }, 450);
    }

    function setStatus(text) {
      if (status) status.textContent = text;
    }

    /* ---------- выбор вкладки ---------- */

    function select(i, focusTab) {
      var tab = tabs[i];
      if (i === current) {
        if (focusTab) tab.focus();
        return;
      }
      current = i;
      var mine = ++token;
      box.setAttribute('data-layout', String(i));
      box.dispatchEvent(new CustomEvent('layoutchange', { detail: { index: i } }));   // слушают 3D и панорама

      // вкладка и подпись переключаются сразу — отклик мгновенный
      tabs.forEach(function (t, k) {
        var active = k === i;
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        t.setAttribute('tabindex', active ? '0' : '-1');
        if (panels[k]) panels[k].classList.toggle('is-active', active);
      });
      if (focusTab) tab.focus();

      // на узком экране вкладки идут полосой с прокруткой — показываем выбранную
      if (tab.scrollIntoView) {
        tab.scrollIntoView({
          inline: 'center',
          block: 'nearest',
          behavior: motionQuery.matches ? 'auto' : 'smooth'
        });
      }

      // картинка меняется, когда готова. Если загрузка затянулась (медленная сеть) — говорим об этом
      var slowTimer = setTimeout(function () {
        if (mine === token) setStatus('Загружаем фото…');
      }, 250);

      loadImage(i).then(function (ok) {
        clearTimeout(slowTimer);
        if (mine !== token) return;               // пока грузилась, выбрали другую вкладку
        if (ok) {
          setStatus('');
          showImage(i);
        } else {
          setStatus('Не удалось загрузить фото. Нажмите на вкладку ещё раз.');
        }
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });

      // стрелки, Home и End — по паттерну ARIA tabs; вкладка включается сразу при переходе
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        select(next, true);
      });
    });

    /* ---------- предзагрузка остальных картинок ---------- */

    // Начинаем, когда первая картинка загружена и отрисована, по одной и в свободное время,
    // чтобы не отнимать канал у остальной страницы. В режиме экономии трафика не грузим заранее.
    function preloadRest() {
      var conn = navigator.connection;
      if (conn && conn.saveData) return;

      var chain = Promise.resolve();
      images.forEach(function (img, i) {
        if (i === 0) return;
        chain = chain.then(function () { return loadImage(i); });
      });
    }

    function afterFirstPaint(callback) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (window.requestIdleCallback) window.requestIdleCallback(callback, { timeout: 1500 });
          else setTimeout(callback, 100);
        });
      });
    }

    loadImage(0).then(function (ok) {
      if (ok) afterFirstPaint(preloadRest);
    });
  }


  /* ======================================================================
     3. Панорама 360° (Pannellum)
     ====================================================================== */
  function initPanorama(root) {
    var openBtn = root.querySelector('[data-pano-open]');
    var dialog = root.querySelector('[data-pano]');
    // нет кнопки, окна или поддержки <dialog> — кнопка так и остаётся скрытой
    if (!openBtn || !dialog || typeof dialog.showModal !== 'function') return;

    var viewEl = dialog.querySelector('[data-pano-view]');
    var errorEl = dialog.querySelector('[data-pano-error]');
    var closeBtn = dialog.querySelector('[data-pano-close]');
    var box = root.querySelector('[data-layouts]');
    // В адресе {n} заменяется номером расстановки: media/pano-1.webp … pano-4.webp
    var panoPattern = openBtn.getAttribute('data-pano-src') || 'media/pano-{n}.webp';
    var panoSrc = '';
    var existsCache = {};
    function srcFor(index) { return panoPattern.replace('{n}', String(index + 1)); }

    // Библиотека с CDN. Версия закреплена, чтобы обновление не сломало просмотрщик.
    var LIB_VERSION = '2.5.6';
    var LIB_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pannellum/' + LIB_VERSION + '/';

    var viewer = null;
    var libPromise = null;
    var lastFocused = null;   // куда вернуть фокус после закрытия
    var openToken = 0;        // отличает текущее открытие окна от прошлых

    /* ---------- есть ли файл панорамы ---------- */

    // Без файла кнопку не показываем. Через HTTP проверяем «лёгким» запросом HEAD
    // (и убеждаемся, что сервер вернул именно картинку, а не страницу-заглушку 404).
    // По file:// и при сбое запроса проверяем, загружается ли картинка.
    function panoramaExists(url) {
      return new Promise(function (resolve) {
        function viaImage() {
          var probe = new Image();
          probe.onload = function () { resolve(true); };
          probe.onerror = function () { resolve(false); };
          probe.src = url;
        }
        if (location.protocol === 'file:' || !window.fetch) return viaImage();

        fetch(url, { method: 'HEAD', cache: 'no-cache' }).then(function (res) {
          var type = res.headers.get('content-type') || '';
          resolve(res.ok && (!type || /^image\//i.test(type)));
        }, viaImage);
      });
    }

    // Кнопка показывается, только если у выбранной расстановки есть файл панорамы
    function refreshButton() {
      var index = box ? parseInt(box.getAttribute('data-layout') || '0', 10) : 0;
      var url = srcFor(index);
      panoSrc = url;
      if (existsCache[url] !== undefined) { openBtn.hidden = !existsCache[url]; return; }
      panoramaExists(url).then(function (exists) {
        existsCache[url] = exists;
        if (url === panoSrc) openBtn.hidden = !exists;
      });
    }
    refreshButton();
    if (box) box.addEventListener('layoutchange', refreshButton);

    /* ---------- загрузка библиотеки ---------- */

    // Грузим только когда она нужна: при наведении на кнопку (прогрев) или по клику.
    function loadLibrary() {
      if (window.pannellum) return Promise.resolve();
      if (libPromise) return libPromise;

      libPromise = new Promise(function (resolve, reject) {
        var css = document.createElement('link');
        var js = document.createElement('script');
        var pending = 2;
        var failed = false;

        function fail() {
          if (failed) return;
          failed = true;
          css.remove();
          js.remove();
          libPromise = null;            // следующий клик попробует заново
          reject(new Error('Pannellum не загрузился'));
        }
        function part() {
          if (failed) return;
          pending -= 1;
          if (pending === 0) {
            if (window.pannellum) resolve(); else fail();
          }
        }

        css.rel = 'stylesheet';
        css.href = LIB_BASE + 'pannellum.css';
        css.onload = part;
        css.onerror = fail;

        js.src = LIB_BASE + 'pannellum.js';
        js.async = true;
        js.onload = part;
        js.onerror = fail;

        document.head.appendChild(css);
        document.head.appendChild(js);
      });
      return libPromise;
    }

    function warmUp() { loadLibrary().catch(function () {}); }
    ['pointerenter', 'focus', 'touchstart'].forEach(function (type) {
      openBtn.addEventListener(type, warmUp, { once: true, passive: true });
    });

    /* ---------- окно и просмотрщик ---------- */

    function showError(text) {
      errorEl.textContent = text;
      errorEl.hidden = false;
    }
    function hideError() {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }

    function createViewer() {
      var config = {
        type: 'equirectangular',
        panorama: panoSrc,
        autoLoad: true,
        compass: false,
        showFullscreenCtrl: false,       // окно и так большое
        hfov: 100,
        minHfov: 50,
        maxHfov: 120,
        // Русские подписи библиотеки
        strings: {
          loadButtonLabel: 'Нажмите, чтобы загрузить<br>панораму',
          loadingLabel: 'Загрузка…',
          bylineLabel: 'Автор: %s',
          noPanoramaError: 'Файл панорамы не указан.',
          fileAccessError: 'Не удалось открыть файл «%s». Если сайт открыт с диска (file://), запустите его через локальный сервер.',
          malformedURLError: 'Неверный адрес панорамы.',
          iOS8WebGLError: 'Из-за ошибки iOS 8 панорама на этом устройстве недоступна.',
          genericWebGLError: 'Ваш браузер не поддерживает WebGL, поэтому панорама не может быть показана.',
          textureSizeError: 'Панорама слишком большая для этого устройства (%spx). Максимум — %spx.',
          unknownError: 'Не удалось показать панораму.'
        }
      };
      // Медленное вращение при открытии; тем, кто просит меньше движения, не включаем
      if (!motionQuery.matches) config.autoRotate = -2;

      viewer = window.pannellum.viewer(viewEl, config);
    }

    function destroyViewer() {
      if (viewer) {
        try { viewer.destroy(); } catch (e) { /* уже уничтожен */ }
        viewer = null;
      }
      viewEl.textContent = '';
    }

    function open() {
      lastFocused = document.activeElement;
      hideError();
      panoSrc = srcFor(box ? parseInt(box.getAttribute('data-layout') || '0', 10) : 0);
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';   // страница под окном не прокручивается

      var mine = ++openToken;
      loadLibrary().then(function () {
        if (mine !== openToken || !dialog.open) return;     // окно уже закрыли
        createViewer();
      }, function () {
        if (mine !== openToken) return;
        showError('Не удалось загрузить просмотрщик панорам. Проверьте интернет и попробуйте ещё раз.');
      });
    }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', function () { dialog.close(); });

    // клик по затемнённому фону закрывает окно
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close();
    });

    // Закрытие любым способом (Esc, кнопка, фон): освобождаем WebGL, возвращаем прокрутку и фокус
    dialog.addEventListener('close', function () {
      openToken += 1;
      destroyViewer();
      hideError();
      document.documentElement.style.overflow = '';
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    });
  }


  /* ======================================================================
     4. Объёмная 3D-модель зала
     ====================================================================== */
  function initTour(root) {
    var box = root.querySelector('[data-layouts]');
    var openBtn = root.querySelector('[data-tour-open]');
    var stage = root.querySelector('[data-tour]');
    var panel = root.querySelector('[data-tour-panel]');
    if (!box || !openBtn || !stage || !panel) return;
    var frame = box.querySelector('.layouts__frame');
    var closeBtn = stage.querySelector('[data-tour-close]');
    var loadingEl = stage.querySelector('[data-tour-loading]');
    var hintEl = stage.querySelector('[data-tour-hint]');
    var viewsEl = panel.querySelector('[data-tour-views]');
    var lightBtns = toArray(panel.querySelectorAll('[data-light]'));
    var peopleBtn = panel.querySelector('[data-people]');
    var labelsBtn = panel.querySelector('[data-labels]');

    // Нужен WebGL и поддержка карты модулей. Иначе 3D-кнопку не показываем вовсе
    function hasWebGL() {
      try {
        var c = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
      } catch (e) { return false; }
    }
    var supportsModules = 'noModule' in HTMLScriptElement.prototype &&
      !!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'));
    if (!hasWebGL() || !supportsModules) return;
    openBtn.hidden = false;

    // на сенсорных экранах подсказка про пальцы, а не про мышь
    if (hintEl && window.matchMedia('(pointer: coarse)').matches) {
      hintEl.textContent = 'Проведите по залу, чтобы осмотреться';
    }

    var tour = null;          // экземпляр модели
    var modPromise = null;    // загрузка модуля
    var opening = 0;          // защита от гонок открытие/закрытие
    var isOpen = false;

    function currentLayout() { return parseInt(box.getAttribute('data-layout') || '0', 10); }

    function loadModule() {
      if (!modPromise) {
        modPromise = import('./tour3d.js').catch(function (err) {
          modPromise = null;           // следующий клик попробует снова
          throw err;
        });
      }
      return modPromise;
    }
    // (адрес считается от js/space.js, поэтому просто ./tour3d.js)
    // Прогрев: пока человек наводит курсор на кнопку, модуль и three.js уже качаются
    function warmUp() { loadModule().catch(function () {}); }
    ['pointerenter', 'focus', 'touchstart'].forEach(function (type) {
      openBtn.addEventListener(type, warmUp, { once: true, passive: true });
    });

    function buildPanel(views) {
      if (viewsEl.childNodes.length) return;
      views.forEach(function (v, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tour3d__btn' + (i === 0 ? ' is-on' : '');
        b.textContent = v.label;
        b.setAttribute('data-view', v.id);
        b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
        viewsEl.appendChild(b);
      });
    }
    function mark(buttons, test) {
      buttons.forEach(function (b) {
        var on = test(b);
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      var mine = ++opening;
      openBtn.setAttribute('aria-pressed', 'true');
      frame.classList.add('is-3d');
      stage.hidden = false;
      panel.hidden = false;
      loadingEl.hidden = false;
      loadingEl.textContent = 'Строим зал…';
      closeBtn.focus({ preventScroll: true });

      loadModule().then(function (mod) {
        if (mine !== opening || !isOpen) return;
        if (!tour) {
          tour = mod.createTour(stage, {
            base: 'media/',
            onFrame: function () {
              loadingEl.hidden = true;
              stage.classList.add('is-ready');
              if (hintEl && !motionQuery.matches) { hintEl.hidden = false; }
            }
          });
          buildPanel(tour.views);
        }
        tour.setActive(true);
        tour.setLayout(currentLayout(), true);
        tour.resize();
      }).catch(function () {
        if (mine !== opening) return;
        loadingEl.hidden = false;
        loadingEl.textContent = 'Не удалось загрузить 3D-модель. Проверьте интернет и попробуйте ещё раз.';
      });
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      opening += 1;
      openBtn.setAttribute('aria-pressed', 'false');
      if (tour) tour.setActive(false);        // модель не считает кадры, пока её не видно
      stage.hidden = true;
      panel.hidden = true;
      stage.classList.remove('is-ready');
      frame.classList.remove('is-3d');
      openBtn.focus({ preventScroll: true });
    }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    stage.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });

    // вкладки расстановок управляют и моделью
    box.addEventListener('layoutchange', function (e) {
      if (tour && isOpen) tour.setLayout(e.detail.index, motionQuery.matches);
    });

    // панель: точки обзора, свет, люди, размеры
    panel.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn || !tour) return;
      if (btn.hasAttribute('data-view')) {
        tour.setView(btn.getAttribute('data-view'), motionQuery.matches);
        mark(toArray(viewsEl.children), function (b) { return b === btn; });
      } else if (btn.hasAttribute('data-light')) {
        tour.setLight(btn.getAttribute('data-light'));
        mark(lightBtns, function (b) { return b === btn; });
      } else if (btn === peopleBtn) {
        var on = peopleBtn.getAttribute('aria-pressed') !== 'true';
        tour.setPeople(on);
        mark([peopleBtn], function () { return on; });
      } else if (btn === labelsBtn) {
        var show = labelsBtn.getAttribute('aria-pressed') !== 'true';
        tour.setLabels(show);
        mark([labelsBtn], function () { return show; });
      }
    });

    // Клавиатура на самой сцене: стрелки поворачивают, +/− масштабируют
    stage.setAttribute('tabindex', '0');
    stage.setAttribute('role', 'application');
    stage.setAttribute('aria-label', 'Объёмная модель зала. Стрелки — повернуть, плюс и минус — масштаб, Esc — закрыть.');
    stage.addEventListener('keydown', function (e) {
      if (!tour || e.target !== stage) return;
      var handled = true;
      if (e.key === 'ArrowLeft') tour.nudge(-1, 0);
      else if (e.key === 'ArrowRight') tour.nudge(1, 0);
      else if (e.key === 'ArrowUp') tour.nudge(0, -1);
      else if (e.key === 'ArrowDown') tour.nudge(0, 1);
      else if (e.key === '+' || e.key === '=') tour.zoom(-6);
      else if (e.key === '-' || e.key === '_') tour.zoom(6);
      else handled = false;
      if (handled) e.preventDefault();
    });
    // подсказка исчезает после первого касания сцены
    stage.addEventListener('pointerdown', function () { if (hintEl) hintEl.hidden = true; }, { once: true });

    // Секция ушла с экрана — не тратим батарею на кадры
    if (hasObserver) {
      new IntersectionObserver(function (entries) {
        if (tour && isOpen) tour.setActive(entries[0].isIntersecting);
      }, { rootMargin: '100px 0px' }).observe(frame);
    }
    document.addEventListener('visibilitychange', function () {
      if (tour && isOpen) tour.setActive(!document.hidden);
    });
  }


  /* ======================================================================
     5. Видео-тур
     ====================================================================== */
  function initVideo(root) {
    var openBtn = root.querySelector('[data-video-open]');
    var dialog = document.querySelector('[data-video]');
    if (!openBtn || !dialog || typeof dialog.showModal !== 'function') return;
    var player = dialog.querySelector('[data-video-player]');
    var closeBtn = dialog.querySelector('[data-video-close]');
    var src = player.querySelector('source');
    var lastFocused = null;

    // Показываем кнопку, только если ролик существует
    function exists(url) {
      if (location.protocol === 'file:' || !window.fetch) return Promise.resolve(true);
      return fetch(url, { method: 'HEAD', cache: 'no-cache' }).then(function (res) {
        var type = res.headers.get('content-type') || '';
        return res.ok && (!type || /^video\//i.test(type));
      }, function () { return false; });
    }
    exists(src.getAttribute('src')).then(function (ok) { if (ok) openBtn.hidden = false; });

    openBtn.addEventListener('click', function () {
      lastFocused = document.activeElement;
      dialog.showModal();
      document.documentElement.style.overflow = 'hidden';
      player.preload = 'auto';
      // Автозапуск со звуком не нужен (звука в ролике нет), но тем, кто просит меньше движения, не стартуем сами
      if (!motionQuery.matches) { var p = player.play(); if (p && p.catch) p.catch(function () {}); }
    });
    closeBtn.addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', function () {
      player.pause();
      document.documentElement.style.overflow = '';
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    });
  }


  /* ---------- общее ---------- */
  function toArray(list) {
    return Array.prototype.slice.call(list);
  }
})();
