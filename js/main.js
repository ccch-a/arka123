/* ==========================================================================
   АРКА 123 — общие мелочи
   Меню, тень у шапки, подсветка пункта меню, появление блоков, демо-форма.
   Четыре «больших» поведения вынесены в отдельные файлы: preloader, hero-scroll, space, gallery.
   ========================================================================== */
(function () {
  'use strict';

  var hasObserver = 'IntersectionObserver' in window;

  /* ---------- Год в подвале ---------- */
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Шапка: тень после небольшой прокрутки ---------- */
  var header = document.querySelector('[data-header]');
  var scrollTicking = false;
  function updateHeader() {
    scrollTicking = false;
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  // Читаем scrollY не чаще раза в кадр. Первый вызов тоже откладываем до кадра:
  // прямо при загрузке он заставил бы браузер досрочно считать раскладку всей страницы
  function onScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateHeader);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Мобильное меню ---------- */
  var toggle = document.querySelector('[data-menu-toggle]');
  var nav = document.querySelector('[data-nav]');

  function setMenu(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    nav.classList.toggle('is-open', open);
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    // выбрали пункт — меню закрывается
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        toggle.focus();
      }
    });
    // повернули телефон / растянули окно до десктопа — сбрасываем состояние
    window.matchMedia('(min-width: 900px)').addEventListener('change', function (e) {
      if (e.matches) setMenu(false);
    });
  }

  /* ---------- Подсветка пункта меню по текущей секции ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('[data-nav] a[href^="#"]'));
  if (hasObserver && navLinks.length) {
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });

    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = byId[entry.target.id];
        if (!link || !entry.isIntersecting) return;
        navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
        link.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });   // «текущая» — секция в середине экрана

    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
  }

  /* ---------- Плавное появление блоков ---------- */
  var revealItems = document.querySelectorAll('[data-reveal]');
  if (hasObserver) {
    var revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealItems.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Нижняя кнопка брони (телефон) ----------
     Показываем, когда hero уже растворила свою кнопку (метка ушла вверх), и прячем,
     пока на экране форма или подвал: там кнопка не нужна и только закрывала бы текст */
  var ctaBar = document.querySelector('[data-cta-bar]');
  var ctaSentinel = document.querySelector('[data-cta-sentinel]');
  if (ctaBar && ctaSentinel && hasObserver) {
    var pastHero = false;
    var coveredBy = {};                       // какие из «закрывающих» блоков сейчас на экране

    var syncCta = function () {
      var covered = Object.keys(coveredBy).some(function (key) { return coveredBy[key]; });
      ctaBar.classList.toggle('is-visible', pastHero && !covered);
    };

    new IntersectionObserver(function (entries) {
      var entry = entries[entries.length - 1];
      pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      syncCta();
    }).observe(ctaSentinel);

    var coverObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { coveredBy[entry.target.id || 'footer'] = entry.isIntersecting; });
      syncCta();
    });
    ['contact'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) coverObserver.observe(el);
    });
    var footerEl = document.querySelector('.site-footer');
    if (footerEl) coverObserver.observe(footerEl);
  }

  /* ---------- Тарифы: кнопка «Выбрать» подставляет формат в форму ---------- */
  var tariffSelect = document.getElementById('f-tariff');
  document.querySelectorAll('[data-tariff]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!tariffSelect) return;
      tariffSelect.value = btn.getAttribute('data-tariff');
      tariffSelect.dispatchEvent(new Event('change'));   // пересчитать поля и оценку стоимости
    });
  });

  /* ---------- Форма заявки (демо: ничего никуда не отправляется) ---------- */
  var form = document.querySelector('[data-form]');
  if (!form) return;

  var status = form.querySelector('[data-form-status]');

  /* ---------- Оценка стоимости ----------
     Цифры должны совпадать с блоком «Тарифы» в index.html (демонстрационные) */
  var RATE_HOUR = 55;          // BYN за час, минимум 2 часа
  var PRICE_DAY = 360;         // BYN за рабочий день до 8 часов
  var SERIES_DISCOUNT = 0.15;  // скидка на серию от 5 занятий

  var hoursField = form.querySelector('[data-field="hours"]');
  var sessionsField = form.querySelector('[data-field="sessions"]');
  var hoursSelect = document.getElementById('f-hours');
  var sessionsSelect = document.getElementById('f-sessions');
  var estimateBox = form.querySelector('[data-estimate]');
  var estimateSum = form.querySelector('[data-estimate-sum]');
  var estimateNote = form.querySelector('[data-estimate-note]');

  // «1 час, 2 часа, 5 часов»
  function plural(n, forms) {
    var mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }
  function money(value) { return Math.round(value).toLocaleString('ru-RU') + ' BYN'; }

  function updateEstimate() {
    if (!estimateBox || !tariffSelect) return;

    var format = tariffSelect.value;
    var hourly = format === 'Несколько часов';
    var day = format === 'Рабочий день';
    var series = format === 'Серия занятий';
    var hours = parseInt(hoursSelect.value, 10);
    var sessions = parseInt(sessionsSelect.value, 10);

    // нужные поля показываем, лишние прячем
    hoursField.hidden = !(hourly || series);
    sessionsField.hidden = !series;
    estimateBox.hidden = !(hourly || day || series);

    var sum = 0, note = '';
    if (hourly) {
      sum = RATE_HOUR * hours;
      note = hours + ' ' + plural(hours, ['час', 'часа', 'часов']) + ' × ' + RATE_HOUR + ' BYN.';
      if (sum > PRICE_DAY) note += ' Выгоднее взять «Рабочий день»: ' + PRICE_DAY + ' BYN.';
    } else if (day) {
      sum = PRICE_DAY;
      note = 'До 8 часов, это ' + (PRICE_DAY / 8) + ' BYN в час.';
    } else if (series) {
      var perSession = Math.min(RATE_HOUR * hours, PRICE_DAY);   // длинное занятие считаем по цене дня
      sum = perSession * sessions * (1 - SERIES_DISCOUNT);
      note = sessions + ' ' + plural(sessions, ['занятие', 'занятия', 'занятий']) + ' по ' + hours + ' ' +
             plural(hours, ['часу', 'часа', 'часов']) + ', скидка ' + Math.round(SERIES_DISCOUNT * 100) + '%.';
    }

    if (sum) {
      estimateSum.textContent = money(sum);
      estimateNote.textContent = note + ' Точный расчёт — после заявки.';
    }
  }

  [tariffSelect, hoursSelect, sessionsSelect].forEach(function (el) {
    if (el) el.addEventListener('change', updateEstimate);
  });
  form.addEventListener('reset', function () { setTimeout(updateEstimate, 0); });   // после сброса поля возвращаются к значениям по умолчанию
  updateEstimate();
  var nameInput = document.getElementById('f-name');
  var contactInput = document.getElementById('f-contact');
  var dateInput = document.getElementById('f-date');

  // нельзя выбрать дату в прошлом
  if (dateInput) {
    var now = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    dateInput.min = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function setError(input, message) {
    var box = document.getElementById(input.getAttribute('aria-describedby'));
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      if (box) { box.textContent = message; box.hidden = false; }
    } else {
      input.removeAttribute('aria-invalid');
      if (box) { box.textContent = ''; box.hidden = true; }
    }
  }

  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function isPhone(v) { return /^[+\d][\d\s()\-]{5,}$/.test(v) && v.replace(/\D/g, '').length >= 7; }

  function validate() {
    var ok = true;
    var firstBad = null;

    var name = nameInput.value.trim();
    if (name.length < 2) {
      setError(nameInput, 'Подскажите, как к вам обращаться');
      firstBad = firstBad || nameInput;
      ok = false;
    } else setError(nameInput, '');

    var contact = contactInput.value.trim();
    if (!contact) {
      setError(contactInput, 'Оставьте телефон или e-mail, чтобы мы могли ответить');
      firstBad = firstBad || contactInput;
      ok = false;
    } else if (!isEmail(contact) && !isPhone(contact)) {
      setError(contactInput, 'Похоже на опечатку: проверьте телефон или e-mail');
      firstBad = firstBad || contactInput;
      ok = false;
    } else setError(contactInput, '');

    if (firstBad) firstBad.focus();
    return ok;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.classList.remove('is-ok');
    status.textContent = '';

    if (!validate()) return;

    var name = nameInput.value.trim().split(/\s+/)[0];
    form.reset();
    status.classList.add('is-ok');
    status.textContent = 'Спасибо, ' + name + '! Это демонстрационная форма — заявка никуда не отправлена.';
  });

  // ошибка исчезает, как только человек начал исправлять поле
  [nameInput, contactInput].forEach(function (input) {
    input.addEventListener('input', function () {
      if (input.getAttribute('aria-invalid') === 'true') setError(input, '');
    });
  });
})();
