/* ==========================================================================
   АРКА 123 — прелоадер
   Анимация логотипа целиком живёт в CSS (css/style.css, раздел 4).
   Скрипт только:
   1. запускает её (добавляет .is-playing),
   2. ждёт конца анимации и загрузки страницы,
   3. плавно убирает лоадер и возвращает прокрутку.
   Показывается один раз за сессию; при prefers-reduced-motion не показывается совсем
   (это решает inline-скрипт в <head>, он же ставит класс .is-loading на <html>).
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var loader = document.getElementById('preloader');
  if (!loader) return;

  // Лоадер не нужен (уже показывали, reduced-motion) — просто убираем разметку
  if (!root.classList.contains('is-loading')) {
    loader.remove();
    return;
  }

  var animationEnded = false;   // дошёл ли логотип до растворения
  var pageLoaded = document.readyState === 'complete';
  var finished = false;

  // Пока идёт лоадер, страницу не крутим
  root.style.overflow = 'hidden';

  function finish() {
    if (finished) return;
    finished = true;

    loader.classList.add('is-leaving');

    // убираем после fade-out (с запасом, если transitionend не придёт)
    var removed = false;
    function cleanup() {
      if (removed) return;
      removed = true;
      loader.remove();
      root.classList.remove('is-loading');
      root.style.overflow = '';
    }
    loader.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, 700);

    try { sessionStorage.setItem('arka-intro', '1'); } catch (e) { /* приватный режим — не страшно */ }
  }

  function tryFinish() {
    if (animationEnded && pageLoaded) finish();
  }

  // Конец анимации: растворился весь логотип (keyframes pl-out)
  var all = loader.querySelector('.pl-all');
  if (all) {
    all.addEventListener('animationend', function (e) {
      if (e.animationName === 'pl-out') {
        animationEnded = true;
        tryFinish();
      }
    });
  } else {
    animationEnded = true;
  }

  if (!pageLoaded) {
    window.addEventListener('load', function () {
      pageLoaded = true;
      tryFinish();
    }, { once: true });
  }

  // Страховки
  setTimeout(finish, 5000);                       // что бы ни случилось, через 5 с лоадера нет
  loader.addEventListener('click', finish);       // клик — пропустить
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') finish();
  });

  // Запуск: следующий кадр, чтобы стартовое состояние успело отрисоваться
  requestAnimationFrame(function () {
    loader.classList.add('is-playing');
  });
})();
