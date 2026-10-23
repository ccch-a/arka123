/* ==========================================================================
   АРКА 123 — скролл-сцена в hero
   Считает прогресс прокрутки внутри секции .hero и пишет его в CSS-переменную --p (0…1).
   Всё остальное — арка растёт, заголовок растворяется, подпись проявляется — делает CSS.
   Если включён prefers-reduced-motion, скрипт ничего не слушает: --p остаётся 0,
   сцена статична (длину «прокрутки» тогда тоже задаёт только CSS и только без reduced-motion).
   ========================================================================== */
(function () {
  'use strict';

  var hero = document.querySelector('[data-hero]');
  if (!hero) return;

  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var ticking = false;     // защита от лишних вызовов в одном кадре
  var inView = true;       // слушаем прокрутку, только пока hero на экране
  var current = -1;        // последнее записанное значение
  var enabled = false;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  // smoothstep: старт и финиш плавные, середина быстрее
  function ease(t) { return t * t * (3 - 2 * t); }

  function update() {
    ticking = false;

    var rect = hero.getBoundingClientRect();
    var track = rect.height - window.innerHeight;     // сколько секция «едет» под sticky-сценой
    var raw = track > 0 ? -rect.top / track : 0;
    var p = Math.round(ease(clamp(raw, 0, 1)) * 1000) / 1000;

    if (p === current) return;
    current = p;

    hero.style.setProperty('--p', p);
    // когда заголовок уже невидим, выключаем его для мыши и экранных читалок-«кликеров»
    hero.classList.toggle('is-past', p > 0.45);
  }

  function request() {
    if (inView && !ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  // Следим, на экране ли секция. И при уходе, и при возвращении пересчитываем прогресс:
  // резкий прыжок (клавиша Home, «наверх» без плавной прокрутки) может пройти мимо события scroll,
  // и сцена осталась бы в старом положении
  var observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        update();
      }, { rootMargin: '100px 0px' })
    : null;

  function enable() {
    if (enabled) return;
    enabled = true;
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    if (observer) observer.observe(hero);
    update();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    window.removeEventListener('scroll', request);
    window.removeEventListener('resize', request);
    if (observer) observer.unobserve(hero);
    current = -1;
    hero.style.removeProperty('--p');
    hero.classList.remove('is-past');
  }

  function sync() { motion.matches ? disable() : enable(); }

  // Пользователь может переключить настройку системы прямо во время просмотра
  if (motion.addEventListener) motion.addEventListener('change', sync);
  else if (motion.addListener) motion.addListener(sync);

  sync();
})();
