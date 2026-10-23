/* ==========================================================================
   АРКА 123 — галерея и лайтбокс
   Миниатюры — обычные ссылки на крупные файлы, поэтому без JS (или в браузере без <dialog>)
   фото просто открывается по клику. С JS ссылка открывает лайтбокс на нативном <dialog>:
   Esc закрывает сам браузер, фокус остаётся внутри окна, фон за ним неактивен.
   Листать: кнопки, стрелки ← →, свайп на телефоне.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-gallery]');
  if (!root) return;

  var dialog = root.querySelector('[data-lightbox]');
  if (!dialog || typeof dialog.showModal !== 'function') return;   // оставляем обычные ссылки

  var links = Array.prototype.slice.call(root.querySelectorAll('.gallery a'));
  if (!links.length) return;

  var imgEl = dialog.querySelector('[data-lb-img]');
  var captionEl = dialog.querySelector('[data-lb-caption]');
  var countEl = dialog.querySelector('[data-lb-count]');

  var index = 0;
  var lastFocused = null;   // куда вернуть фокус после закрытия

  function wrap(i) { return (i + links.length) % links.length; }

  // Подгружаем соседние фото заранее, чтобы листание не «моргало»
  function preload(i) {
    var img = new Image();
    img.src = links[wrap(i)].href;
  }

  function show(i) {
    index = wrap(i);
    var link = links[index];
    var thumb = link.querySelector('img');

    imgEl.src = link.href;
    imgEl.alt = thumb ? thumb.alt : '';
    captionEl.textContent = link.getAttribute('data-caption') || '';
    countEl.textContent = (index + 1) + ' / ' + links.length;

    preload(index + 1);
    preload(index - 1);
  }

  function open(i) {
    lastFocused = document.activeElement;
    show(i);
    dialog.showModal();
    document.documentElement.style.overflow = 'hidden';   // страница под окном не прокручивается
  }

  function step(delta) { show(index + delta); }

  links.forEach(function (link, i) {
    link.addEventListener('click', function (e) {
      // с модификаторами (новая вкладка и т.п.) ведём себя как обычная ссылка
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      open(i);
    });
  });

  dialog.querySelector('[data-lb-close]').addEventListener('click', function () { dialog.close(); });
  dialog.querySelector('[data-lb-prev]').addEventListener('click', function () { step(-1); });
  dialog.querySelector('[data-lb-next]').addEventListener('click', function () { step(1); });

  // Клик по тёмному фону вокруг фото закрывает окно
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) dialog.close();
  });

  // Закрытие любым способом (Esc, кнопка, фон): вернуть прокрутку и фокус
  dialog.addEventListener('close', function () {
    document.documentElement.style.overflow = '';
    imgEl.removeAttribute('src');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  });

  dialog.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });

  // Свайп: заметный горизонтальный жест, который больше вертикального
  var startX = 0, startY = 0;
  dialog.addEventListener('touchstart', function (e) {
    startX = e.changedTouches[0].clientX;
    startY = e.changedTouches[0].clientY;
  }, { passive: true });

  dialog.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
