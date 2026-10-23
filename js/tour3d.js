/* ==========================================================================
   АРКА 123 — объёмная модель зала (three.js)
   ES-модуль: подгружается только по кнопке «3D» из space.js, поэтому на скорость первой
   загрузки страницы не влияет.

   Что внутри:
   · зал 15,4 × 8 м, потолок 4,5 м, три арочные окна 4 × 3,5 м (размеры из описания зала);
   · четыре расстановки: пустой зал, мастер-класс, один стол, отдельные столы;
   · вид «изнутри» с обычным углом обзора 55–75° (как у человека, без «рыбьего глаза»),
     вид «сверху» (кукольный дом), плавные переходы между точками;
   · свет: день / вечер / презентация (приглушённый свет, включённый проектор).

   Это схематичная визуализация по размерам и фотографиям, а не фотограмметрия:
   отделка и мебель похожи на настоящие, но не совпадают с ними деталь в деталь.
   Единицы — метры. Ось X — длина зала, Z — ширина (окна на стене z = 0), Y — вверх.
   ========================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------- Размеры зала (м) ---------- */
var L = 15.4, D = 8, H = 4.5;                  // 15,4 × 8 = 123 м²
var WIN_W = 4, WIN_H = 3.5, WIN_Y = 0.6;       // окна: ширина, высота, высота подоконника
var WIN_X = [2.85, 7.7, 12.55];                // центры окон по оси X
var WALL_T = 0.4;                              // толщина наружной стены

/* ---------- Точки обзора ---------- */
var VIEWS = {
  entrance: { mode: 'in', pos: [14.8, 1.62, 6.1], look: [1.5, 1.8, 3.4], fov: 66, label: 'От входа' },
  hall:     { mode: 'in', pos: [14.2, 1.55, 3.4],  look: [1.0, 1.9, 4.3],  fov: 62, label: 'Из зала' },
  teacher:  { mode: 'in', pos: [1.6, 1.65, 4.7],   look: [11.5, 1.5, 3.4], fov: 68, label: 'От экрана' },
  windows:  { mode: 'in', pos: [8.8, 1.6, 7.0],    look: [7.7, 2.35, 0],   fov: 66, label: 'Окна' },
  top:      { mode: 'top', target: [7.7, 0.5, 4.0], dist: 15.5, az: 0.0, el: 0.95, fov: 38, label: 'Сверху' }
};

/* ---------- Расстановки (порядок = порядок вкладок) ---------- */
var LAYOUT_IDS = ['empty', 'master', 'table', 'groups'];

/* ---------- Мелкие помощники ---------- */
function rng(seed) {                                  // детерминированный «случайный» ряд
  var s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }   // cubic in-out
// Заданный угол обзора считается по горизонтали для кадра 16:9. В более «высоком» кадре
// (телефон) вертикальный угол увеличиваем, чтобы зал не обрезался по бокам и не искажался
function vfovFor(fov, aspect) {
  if (aspect >= 16 / 9) return fov;
  return Math.min(100, 2 * Math.atan(Math.tan(fov * Math.PI / 360) * (16 / 9) / aspect) * 180 / Math.PI);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function angleDelta(a, b) {                           // кратчайшая разница углов
  var d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function canvasTex(w, h, draw, srgb) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c);
  if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ==========================================================================
   Текстуры
   ========================================================================== */

/* Паркет «ёлочка». Решётка подобрана перебором: доски 5×1 клетка плотно, без щелей,
   заполняют плоскость 60×60 клеток, поэтому текстура бесшовно повторяется */
function herringboneTexture() {
  var N = 60, n = 5, cell = 16;
  var a1 = [-6, -4], a2 = [-5, -5], c = [-5, 0];
  var rand = rng(7);
  var palette = ['#cfae86', '#c6a47a', '#d6b88f', '#bf9a6f', '#cbaa80', '#c2a078'];
  var tex = canvasTex(N * cell, N * cell, function (g, w, h) {
    g.fillStyle = '#9a7c58'; g.fillRect(0, 0, w, h);
    function plank(x, y, pw, ph) {                    // клетки → пиксели, с «подклейкой» через край
      var col = palette[(rand() * palette.length) | 0];
      for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
        var X = (x + ox * N) * cell, Y = (y + oy * N) * cell, W = pw * cell, Hh = ph * cell;
        if (X + W < 0 || Y + Hh < 0 || X > w || Y > h) continue;
        g.fillStyle = col; g.fillRect(X + 0.8, Y + 0.8, W - 1.6, Hh - 1.6);
        // лёгкая «текстура дерева»: 3 продольные прожилки
        g.fillStyle = 'rgba(70,40,15,0.07)';
        for (var k = 0; k < 3; k++) {
          var t = (0.2 + 0.28 * k + rand() * 0.1);
          if (pw > ph) g.fillRect(X + 2, Y + Hh * t, W - 4, 1);
          else g.fillRect(X + W * t, Y + 2, 1, Hh - 4);
        }
        g.fillStyle = 'rgba(255,240,215,0.10)';       // блик на верхней/левой кромке
        g.fillRect(X + 0.8, Y + 0.8, W - 1.6, 1.2);
        g.fillRect(X + 0.8, Y + 0.8, 1.2, Hh - 1.6);
      }
    }
    for (var i = -60; i < 60; i++) for (var j = -60; j < 60; j++) {
      var px = i * a1[0] + j * a2[0], py = i * a1[1] + j * a2[1];
      if (px < 0 || px >= N || py < 0 || py >= N) continue;
      plank(px, py, n, 1);
      plank(px + c[0], py + c[1], 1, n);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function plasterTexture() {                           // едва заметная фактура декоративной штукатурки
  var rand = rng(11);
  var tex = canvasTex(512, 512, function (g, w, h) {
    var img = g.createImageData(w, h);
    for (var i = 0; i < w * h; i++) {
      var v = 236 + (rand() - 0.5) * 14;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.globalAlpha = 0.05;                             // крупные мазки
    for (var k = 0; k < 90; k++) {
      g.fillStyle = rand() > 0.5 ? '#fff' : '#a89a86';
      g.beginPath(); g.ellipse(rand() * w, rand() * h, 30 + rand() * 60, 10 + rand() * 24, rand() * 3, 0, 7); g.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function panelTexture(base, joint, cols, rows, aspect) {   // стеновые панели с тонкими швами
  var tex = canvasTex(1024, Math.round(1024 / aspect), function (g, w, h) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = joint;
    for (var i = 0; i <= cols; i++) g.fillRect(Math.round(i * (w - 3) / cols), 0, 3, h);
    for (var j = 0; j <= rows; j++) g.fillRect(0, Math.round(j * (h - 3) / rows), w, 3);
    var gr = g.createLinearGradient(0, 0, 0, h);      // чуть темнее у пола: ощущение объёма
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.10)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  return tex;
}

function radiatorTexture() {
  return canvasTex(256, 64, function (g, w, h) {
    g.fillStyle = '#2e3236'; g.fillRect(0, 0, w, h);
    for (var x = 4; x < w; x += 12) {                 // рёбра панельного радиатора
      g.fillStyle = '#1f2326'; g.fillRect(x, 6, 3, h - 12);
      g.fillStyle = '#3d4247'; g.fillRect(x + 3, 6, 2, h - 12);
    }
    g.fillStyle = '#25292c'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  });
}

function clockTexture() {
  return canvasTex(512, 512, function (g, w) {
    var c = w / 2;
    g.fillStyle = '#23272b'; g.beginPath(); g.arc(c, c, c - 2, 0, 7); g.fill();
    g.fillStyle = '#f2efe9'; g.beginPath(); g.arc(c, c, c - 26, 0, 7); g.fill();
    g.strokeStyle = '#23272b'; g.lineCap = 'round';
    for (var i = 0; i < 12; i++) {
      var a = i * Math.PI / 6, r1 = c - 44, r2 = c - 74;
      g.lineWidth = i % 3 === 0 ? 10 : 5;
      g.beginPath(); g.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); g.lineTo(c + Math.sin(a) * r2, c - Math.cos(a) * r2); g.stroke();
    }
    function hand(angle, len, width) {
      g.lineWidth = width; g.beginPath(); g.moveTo(c, c);
      g.lineTo(c + Math.sin(angle) * len, c - Math.cos(angle) * len); g.stroke();
    }
    hand(Math.PI * (10 / 6 + 10 / 360), 120, 12); hand(Math.PI * 2 * (10 / 60), 180, 8);
    g.fillStyle = '#23272b'; g.beginPath(); g.arc(c, c, 11, 0, 7); g.fill();
  });
}

function slideTexture() {                             // «слайд» презентации на экране (демо)
  return canvasTex(1280, 720, function (g, w, h) {
    var gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#1b2e3b'); gr.addColorStop(1, '#2c4a5f');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4f93b8'; g.fillRect(80, 92, 90, 8);
    g.fillStyle = '#fff'; g.font = '700 74px Manrope, Inter, Arial, sans-serif';
    g.fillText('Основы мастерства', 80, 210);
    g.fillStyle = 'rgba(255,255,255,0.72)'; g.font = '400 36px Manrope, Inter, Arial, sans-serif';
    g.fillText('Мастер-класс · демонстрация слайда', 80, 270);
    var bars = [0.35, 0.55, 0.42, 0.78, 0.62, 0.9];   // условная диаграмма
    bars.forEach(function (v, i) {
      g.fillStyle = i === 5 ? '#6fb4d6' : 'rgba(255,255,255,0.28)';
      g.fillRect(80 + i * 118, 650 - v * 300, 84, v * 300);
    });
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '500 28px Manrope, Inter, Arial, sans-serif';
    g.fillText('Шаг 1 → Шаг 2 → Результат', 800, 520);
    g.fillRect(800, 540, 360, 3);
  });
}

function glowTexture() {                              // мягкое пятно света вокруг ламп
  return canvasTex(64, 64, function (g, w) {
    var gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,248,235,0.85)'); gr.addColorStop(0.4, 'rgba(255,244,225,0.22)'); gr.addColorStop(1, 'rgba(255,244,225,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}

function blobTexture() {                              // «контактная тень» под мебелью
  return canvasTex(64, 64, function (g, w) {
    var gr = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, false);
}

/* Пейзаж за окнами: небо, городские кварталы, а по центру — настоящее фото
   Национальной библиотеки (media/view-library.webp, вырезано из фото зала) */
function backdropCanvas(night, libraryImg) {
  var W = 2048, Hh = 1024;
  var c = document.createElement('canvas'); c.width = W; c.height = Hh;
  var g = c.getContext('2d');
  var sky = g.createLinearGradient(0, 0, 0, Hh * 0.78);
  if (night) { sky.addColorStop(0, '#16233a'); sky.addColorStop(0.6, '#3d4d6e'); sky.addColorStop(1, '#d99a73'); }
  else { sky.addColorStop(0, '#6aa6d8'); sky.addColorStop(0.55, '#a9cdea'); sky.addColorStop(1, '#e3eef6'); }
  g.fillStyle = sky; g.fillRect(0, 0, W, Hh);
  var rand = rng(5);
  g.globalAlpha = night ? 0.12 : 0.55;                // облака
  for (var i = 0; i < 26; i++) {
    var cx = rand() * W, cy = 80 + rand() * 360, r = 50 + rand() * 120;
    var cg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    cg.addColorStop(0, '#fff'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg; g.beginPath(); g.ellipse(cx, cy, r * 2.1, r * 0.55, 0, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  // городской «пояс» внизу: невысокие кварталы в дымке
  var base = Hh * 0.8;
  for (var b = 0; b < 90; b++) {
    var bw = 26 + rand() * 70, bh = 14 + rand() * 46, bx = rand() * W;
    var tone = night ? 30 + rand() * 22 : 168 + rand() * 40;
    g.fillStyle = night ? 'rgb(' + tone + ',' + (tone + 6) + ',' + (tone + 20) + ')' : 'rgb(' + tone + ',' + (tone + 6) + ',' + (tone + 14) + ')';
    g.fillRect(bx, base - bh, bw, bh + 400);
    if (night) {                                       // светящиеся окна
      g.fillStyle = 'rgba(255,214,140,0.8)';
      for (var wy = base - bh + 6; wy < base - 4; wy += 10) for (var wx = bx + 5; wx < bx + bw - 6; wx += 9) if (rand() > 0.62) g.fillRect(wx, wy, 4, 5);
    }
  }
  var haze = g.createLinearGradient(0, base - 90, 0, Hh);
  haze.addColorStop(0, night ? 'rgba(217,154,115,0)' : 'rgba(200,220,236,0)');
  haze.addColorStop(1, night ? 'rgba(60,70,95,0.9)' : 'rgba(190,210,228,0.9)');
  g.fillStyle = haze; g.fillRect(0, base - 90, W, Hh - base + 90);
  if (libraryImg) {
    // здание библиотеки — настоящее фото, но малого размера, как оно выглядит из окна (далеко, ~7° по высоте)
    var lw = 118, lh = lw * libraryImg.height / libraryImg.width;
    var lx = W * 0.5 - 40 - lw / 2, ly = base + 40 - lh;
    var t = document.createElement('canvas'); t.width = Math.round(lw * 2); t.height = Math.round(lh * 2);
    var tg = t.getContext('2d');
    tg.drawImage(libraryImg, 0, 0, t.width, t.height);
    if (night) {                                       // вечером здание темнее и теплее
      tg.globalCompositeOperation = 'source-atop';
      tg.fillStyle = 'rgba(18,28,52,0.6)'; tg.fillRect(0, 0, t.width, t.height);
    }
    g.drawImage(t, lx, ly, lw, lh);
  }
  return c;
}

/* ==========================================================================
   Основная функция
   ========================================================================== */
export function createTour(host, options) {
  options = options || {};
  var base = options.base || 'media/';

  /* ---------- Рендерер ---------- */
  var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!options.preserve });
  var maxDpr = options.maxDpr || Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(maxDpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;               // тени пересчитываем только при изменениях
  renderer.domElement.className = 'tour3d__canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.1, 400);
  scene.background = new THREE.Color('#dfe5e9');

  var pmrem = new THREE.PMREMGenerator(renderer);
  var envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;

  /* ---------- Материалы ---------- */
  var plaster = plasterTexture();
  var floorTex = herringboneTexture();
  floorTex.repeat.set(L / 6.6, D / 6.6);
  floorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  function std(color, rough, metal, env) {
    return new THREE.MeshStandardMaterial({ color: color, roughness: rough, metalness: metal || 0, envMapIntensity: env == null ? 0.5 : env });
  }
  var M = {
    plaster: std('#ebe2d2', 0.95, 0, 0.35),
    ceiling: std('#16181a', 0.92, 0, 0.3),
    floor: new THREE.MeshStandardMaterial({ map: floorTex, color: '#d9c3a2', roughness: 0.52, metalness: 0, envMapIntensity: 0.55 }),
    black: std('#111315', 0.5, 0.25, 0.7),
    graphite: std('#2b2f33', 0.72, 0, 0.4),
    pale: std('#cfcac2', 0.9, 0, 0.35),
    duct: std('#24272a', 0.55, 0.55, 0.9),
    oak: std('#c9a06b', 0.6, 0, 0.45),
    white: std('#eeeeea', 0.55, 0, 0.5),
    fabric: std('#1d2023', 0.95, 0, 0.25),
    chrome: std('#c7ccd1', 0.22, 0.95, 1.0),
    figure: std('#c9d1d6', 0.8, 0, 0.4),
    figureDark: std('#566672', 0.8, 0, 0.4),
    frosted: new THREE.MeshStandardMaterial({ color: '#dfe7e9', roughness: 0.35, metalness: 0, transparent: true, opacity: 0.62, envMapIntensity: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe3f0', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.07, envMapIntensity: 1.2, depthWrite: false })
  };
  M.plaster.map = plaster;
  var wallMats = {                                     // стены со своими текстурами
    panelWhite: new THREE.MeshStandardMaterial({ map: panelTexture('#efede8', '#cfcdc6', 13, 1, 8 / 4.5), roughness: 0.6, envMapIntensity: 0.4 }),
    panelDark: new THREE.MeshStandardMaterial({ map: panelTexture('#3b4145', '#1c2023', 5, 3, 3 / 4.5), roughness: 0.7, envMapIntensity: 0.4 })
  };
  M.radiator = new THREE.MeshStandardMaterial({ map: radiatorTexture(), roughness: 0.6, metalness: 0.2, envMapIntensity: 0.5 });

  var shadowCasters = [];
  function mesh(geo, mat, x, y, z, cast, recv) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = cast !== false;
    m.receiveShadow = recv !== false;
    return m;
  }
  function box(w, h, d, mat, x, y, z, cast) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, cast); }

  /* ==========================================================================
     Оболочка зала
     ========================================================================== */
  var shell = new THREE.Group(); scene.add(shell);
  var ceilingGroup = new THREE.Group(); scene.add(ceilingGroup);   // всё, что висит под потолком

  // Пол
  var floor = mesh(new THREE.PlaneGeometry(L, D), M.floor, L / 2, 0, D / 2, false, true);
  floor.rotation.x = -Math.PI / 2; shell.add(floor);

  // Потолок (чёрный, как на фото)
  var ceil = mesh(new THREE.PlaneGeometry(L, D), M.ceiling, L / 2, H, D / 2, false, true);
  ceil.rotation.x = Math.PI / 2; ceilingGroup.add(ceil);

  // Оконная стена: стена с арочными проёмами выдавливается на толщину стены,
  // поэтому внутри проёмов получаются настоящие откосы
  function archPath(path, cx, y0, w, h, inset) {
    var r = w / 2 - inset, left = cx - r, right = cx + r, spring = y0 + h - w / 2;
    path.moveTo(left, y0 + inset);
    path.lineTo(right, y0 + inset);
    path.lineTo(right, spring);
    path.absarc(cx, spring, r, 0, Math.PI, false);
    path.lineTo(left, y0 + inset);
    return path;
  }
  var wallShape = new THREE.Shape();
  wallShape.moveTo(0, 0); wallShape.lineTo(L, 0); wallShape.lineTo(L, H); wallShape.lineTo(0, H); wallShape.lineTo(0, 0);
  WIN_X.forEach(function (cx) { wallShape.holes.push(archPath(new THREE.Path(), cx, WIN_Y, WIN_W, WIN_H, 0)); });
  var wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: WALL_T, bevelEnabled: false, curveSegments: 40 });
  var windowWall = mesh(wallGeo, M.plaster, 0, 0, -WALL_T, true, true);
  // UV для штукатурки по мировым координатам (иначе на выдавленной геометрии «плывёт»)
  (function fixUV(geo, scale) {
    var p = geo.attributes.position, uv = geo.attributes.uv;
    for (var i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) * scale, p.getY(i) * scale);
  })(wallGeo, 1 / 3);
  windowWall.material = M.plaster.clone(); windowWall.material.map = plaster.clone(); windowWall.material.map.needsUpdate = true;
  shell.add(windowWall);

  // Остальные стены — плоскости, обращённые внутрь зала
  function wall(w, h, mat, x, y, z, ry) {
    var m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z, false, true);
    m.rotation.y = ry; shell.add(m); return m;
  }
  var texFor = function (w, h) { var t = plaster.clone(); t.needsUpdate = true; t.repeat.set(w / 3, h / 3); return t; };
  var endWallMat = M.plaster.clone(); endWallMat.map = texFor(D, H);
  var wallFront = M.plaster.clone(); wallFront.map = texFor(L, H);
  wall(D, H, wallMats.panelWhite, 0, H / 2, D / 2, Math.PI / 2);          // x = 0: белые панели, здесь экран
  wall(D, H, endWallMat, L, H / 2, D / 2, -Math.PI / 2);                  // x = L: штукатурка с часами
  wall(L, H, wallFront, L / 2, H / 2, D, Math.PI);                         // z = D: вход

  // Чёрный плинтус вдоль стен (в проёмах дверей прерываться незачем: мелочь)
  [[L, 0.1, 0.02, L / 2, 0.05, 0.01], [L, 0.1, 0.02, L / 2, 0.05, D - 0.01],
   [0.02, 0.1, D, 0.01, 0.05, D / 2], [0.02, 0.1, D, L - 0.01, 0.05, D / 2]].forEach(function (b) {
    shell.add(mesh(new THREE.BoxGeometry(b[0], b[1], b[2]), M.black, b[3], b[4], b[5], false, true));
  });

  // Окна: чёрные рамы с импостами, подоконники, радиаторы, стекло
  WIN_X.forEach(function (cx) {
    var outer = archPath(new THREE.Shape(), cx, WIN_Y, WIN_W, WIN_H, 0);
    outer.holes.push(archPath(new THREE.Path(), cx, WIN_Y, WIN_W, WIN_H, 0.07));
    var frame = mesh(new THREE.ExtrudeGeometry(outer, { depth: 0.1, bevelEnabled: false, curveSegments: 40 }), M.black, 0, 0, -0.22, true, true);
    shell.add(frame);
    var spring = WIN_Y + WIN_H - WIN_W / 2;
    [-0.85, 0.85].forEach(function (dx) {              // вертикальные импосты
      var top = spring + Math.sqrt(Math.max(0, 4 - (dx * 2 / 2) * (dx * 2 / 2) * 1)) * 0 + Math.sqrt(WIN_W * WIN_W / 4 - dx * dx);
      var h = top - WIN_Y;
      shell.add(box(0.06, h, 0.09, M.black, cx + dx, WIN_Y + h / 2, -0.17));
    });
    shell.add(box(WIN_W - 0.1, 0.06, 0.09, M.black, cx, WIN_Y + 1.55, -0.17));   // горизонтальный импост
    shell.add(box(WIN_W - 0.1, 0.06, 0.09, M.black, cx, spring + 0.0, -0.17));
    // подоконник
    shell.add(box(WIN_W + 0.3, 0.06, 0.52, M.black, cx, WIN_Y - 0.03, 0.04, true));
    // радиатор
    shell.add(box(2.6, 0.5, 0.09, M.radiator, cx - 0.2, 0.34, 0.06, true));
    // стекло
    var glass = mesh(new THREE.ShapeGeometry(archPath(new THREE.Shape(), cx, WIN_Y, WIN_W, WIN_H, 0.05), 40), M.glass, 0, 0, -0.18, false, false);
    shell.add(glass);
  });

  // Колонны у стены z = D: графитовая и светлая «бетонная»
  // (лежат в ceilingGroup, чтобы в виде «сверху» не загораживать пол)
  ceilingGroup.add(box(0.62, H, 0.55, M.graphite, 3.6, H / 2, D - 0.275, true));
  ceilingGroup.add(box(0.62, H, 0.55, M.pale, 8.3, H / 2, D - 0.275, true));

  // Графитовая перегородка у входа с подсвеченной нишей (как в фото-зале)
  var darkWall = mesh(new THREE.PlaneGeometry(3.0, H), wallMats.panelDark, 10.9, H / 2, D - 0.02, false, true);
  darkWall.rotation.y = Math.PI; shell.add(darkWall);

  // Входная группа: две матовые стеклянные створки в чёрных рамах
  [13.45, 14.55].forEach(function (x) {
    var leaf = new THREE.Group();
    leaf.add(mesh(new THREE.BoxGeometry(1.04, 2.45, 0.025), M.frosted, 0, 1.25, 0, false, false));
    [[1.08, 0.04, 0, 2.47], [1.08, 0.04, 0, 0.03], [0.04, 2.5, -0.52, 1.25], [0.04, 2.5, 0.52, 1.25]].forEach(function (f) {
      leaf.add(box(f[0], f[1], 0.05, M.black, f[2], f[3], 0, false));
    });
    leaf.add(box(0.025, 0.4, 0.04, M.chrome, x < 14 ? 0.44 : -0.44, 1.05, 0.04, false));   // ручка
    leaf.position.set(x, 0, D - 0.06); shell.add(leaf);
  });
  shell.add(box(2.3, 0.05, 0.12, M.black, 14.0, 2.5, D - 0.06, false));

  // Часы на штукатурке (стена x = L)
  var clock = mesh(new THREE.CircleGeometry(0.72, 48), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.5, envMapIntensity: 0.4 }), L - 0.03, 3.2, 4.0, false, false);
  clock.rotation.y = -Math.PI / 2; shell.add(clock);

  // Подвесные светильники: 33 линейных панели + тросики, воздуховоды, балки
  var BAR_COUNT = 33;
  var barMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  var bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.03, 0.055), barMat, BAR_COUNT);
  var cablePos = [];
  (function () {
    var r = rng(21), idx = 0, m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    for (var row = 0; row < 3; row++) for (var col = 0; col < 11; col++) {
      var x = 1.2 + col * 1.3 + (r() - 0.5) * 0.3, z = 1.8 + row * 2.2 + (r() - 0.5) * 0.4, y = 3.45 + (r() - 0.5) * 0.35;
      var yaw = (r() - 0.5) * 0.7 + (r() > 0.85 ? Math.PI / 2 : 0);
      q.setFromEuler(new THREE.Euler(0, yaw, 0)); p.set(x, y, z);
      m.compose(p, q, s); bars.setMatrixAt(idx++, m);
      [-0.38, 0.38].forEach(function (o) {
        var cx = x + Math.cos(yaw) * o, cz = z - Math.sin(yaw) * o;
        cablePos.push(cx, H, cz, cx, y, cz);
      });
    }
  })();
  bars.instanceMatrix.needsUpdate = true;
  ceilingGroup.add(bars);
  var cableGeo = new THREE.BufferGeometry(); cableGeo.setAttribute('position', new THREE.Float32BufferAttribute(cablePos, 3));
  ceilingGroup.add(new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: '#0b0c0d' })));
  // мягкое свечение вокруг ламп (спрайты, чтобы лампы «горели», а не были белыми прямоугольниками)
  var glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#fff3df', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, toneMapped: false });
  (function () {
    var m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (var i = 0; i < BAR_COUNT; i++) {
      bars.getMatrixAt(i, m); m.decompose(p, q, s);
      var sp = new THREE.Sprite(glowMat); sp.position.copy(p).add(new THREE.Vector3(0, -0.08, 0)); sp.scale.set(1.9, 0.9, 1);
      ceilingGroup.add(sp);
    }
  })();

  [2.6, 5.5].forEach(function (z, i) {                 // два воздуховода вдоль зала
    var duct = mesh(new THREE.CylinderGeometry(0.27 - i * 0.04, 0.27 - i * 0.04, L - 0.3, 28), M.duct, L / 2, H - 0.36, z, false, false);
    duct.rotation.z = Math.PI / 2; ceilingGroup.add(duct);
    [3.4, 7.5, 11.6].forEach(function (x) { ceilingGroup.add(box(0.06, 0.1, 0.62 - i * 0.08, M.duct, x, H - 0.36, z, false)); });   // хомуты
  });
  [5.1, 10.3].forEach(function (x) { ceilingGroup.add(box(0.32, 0.5, D, M.ceiling, x, H - 0.25, D / 2, false)); });   // балки
  ceilingGroup.add(box(L - 0.4, 0.05, 0.3, M.duct, L / 2, H - 0.08, 1.0, false));                                       // кабельный лоток

  /* ---------- Пейзаж за окнами ---------- */
  var backdropDay = new THREE.Mesh(new THREE.PlaneGeometry(260, 130), new THREE.MeshBasicMaterial({ toneMapped: false }));
  var backdropNight = new THREE.Mesh(new THREE.PlaneGeometry(260, 130), new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0, depthWrite: false }));
  [backdropDay, backdropNight].forEach(function (b, i) { b.position.set(L / 2, 36, -62 + i * 0.1); b.renderOrder = -2 + i; scene.add(b); });
  function paintBackdrop(img) {
    [[backdropDay, false], [backdropNight, true]].forEach(function (pair) {
      var t = new THREE.CanvasTexture(backdropCanvas(pair[1], img));
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      if (pair[0].material.map) pair[0].material.map.dispose();
      pair[0].material.map = t; pair[0].material.needsUpdate = true;
    });
    requestRender();
  }
  paintBackdrop(null);                                  // сразу рисуем небо, фото библиотеки добавим по загрузке
  var libImg = new Image();
  libImg.onload = function () { paintBackdrop(libImg); };
  libImg.src = base + 'view-library.webp';

  /* ---------- Свет ---------- */
  var sun = new THREE.DirectionalLight('#fff1dc', 3);
  sun.position.set(11, 24, -26); sun.target.position.set(7.7, 0, 3.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -15; sun.shadow.camera.right = 15; sun.shadow.camera.top = 15; sun.shadow.camera.bottom = -15;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  var hemi = new THREE.HemisphereLight('#d7e5f2', '#8a7a66', 0.45); scene.add(hemi);

  var lamps = [];                                      // источники под потолком (без теней: дёшево)
  [[2.6, 2.4], [2.6, 5.6], [6.0, 2.4], [6.0, 5.6], [9.4, 2.4], [9.4, 5.6], [12.8, 2.4], [12.8, 5.6]].forEach(function (p) {
    var l = new THREE.PointLight('#fff0dc', 0, 0, 2); l.position.set(p[0], 3.3, p[1]); scene.add(l); lamps.push(l);
  });

  // Проектор и «луч»: пирамида от объектива до экрана
  var SCREEN = { w: 3.6, h: 2.025, x: 0.03, y: 2.05, z: 4.0 };
  var cinema = new THREE.Group(); scene.add(cinema);   // экран + проектор: включается в нужных расстановках
  var screenMat = new THREE.MeshBasicMaterial({ map: slideTexture(), toneMapped: false });
  var screen = mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), screenMat, SCREEN.x, SCREEN.y, SCREEN.z, false, false);
  screen.rotation.y = Math.PI / 2; cinema.add(screen);
  cinema.add(box(0.03, SCREEN.h + 0.12, SCREEN.w + 0.12, M.black, 0.015, SCREEN.y, SCREEN.z, false));  // рамка экрана
  var projX = 8.6;
  cinema.add(box(0.3, 0.14, 0.36, M.white, projX, 3.72, SCREEN.z, true));
  var lens = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 20), M.black, projX - 0.17, 3.72, SCREEN.z, false, false);
  lens.rotation.z = Math.PI / 2; cinema.add(lens);
  cinema.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, H - 3.72 - 0.07, 8), M.black, projX, (H + 3.72) / 2 + 0.035, SCREEN.z, false, false));
  var beamGeo = new THREE.BufferGeometry();
  (function () {
    var a = [projX - 0.18, 3.72, SCREEN.z];
    var hw = SCREEN.w / 2, hh = SCREEN.h / 2, sx = SCREEN.x + 0.02;
    var c1 = [sx, SCREEN.y + hh, SCREEN.z - hw], c2 = [sx, SCREEN.y + hh, SCREEN.z + hw], c3 = [sx, SCREEN.y - hh, SCREEN.z + hw], c4 = [sx, SCREEN.y - hh, SCREEN.z - hw];
    var v = [].concat(a, c1, c2, a, c2, c3, a, c3, c4, a, c4, c1);
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  })();
  var beamMat = new THREE.MeshBasicMaterial({ color: '#bcd8ee', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  var beam = new THREE.Mesh(beamGeo, beamMat); beam.renderOrder = 3; cinema.add(beam);

  /* ==========================================================================
     Мебель
     ========================================================================== */
  var chairGeo = {
    seat: new THREE.BoxGeometry(0.44, 0.05, 0.42),
    back: new THREE.BoxGeometry(0.42, 0.34, 0.04),
    leg: new THREE.CylinderGeometry(0.012, 0.012, 0.44, 6),
    frame: new THREE.BoxGeometry(0.018, 0.018, 0.4)
  };
  function makeChair(x, z, faceX, faceZ, r) {          // стул смотрит в точку (faceX, faceZ)
    var g = new THREE.Group();
    g.add(mesh(chairGeo.seat, M.fabric, 0, 0.46, 0));
    var back = mesh(chairGeo.back, M.fabric, 0, 0.74, -0.2); back.rotation.x = -0.1; g.add(back);
    [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].forEach(function (l) { g.add(mesh(chairGeo.leg, M.chrome, l[0], 0.22, l[1], true, false)); });
    [-0.19, 0.19].forEach(function (lx) { var f = mesh(chairGeo.frame, M.chrome, lx, 0.44, 0, true, false); g.add(f); });
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(faceX - x, faceZ - z) + (r ? (r() - 0.5) * 0.12 : 0);
    return g;
  }
  function makeTable(w, d, x, z, rot, round) {
    var g = new THREE.Group();
    var top = round
      ? mesh(new THREE.CylinderGeometry(w / 2, w / 2, 0.035, 40), M.oak, 0, 0.74, 0)
      : mesh(new THREE.BoxGeometry(w, 0.035, d), M.oak, 0, 0.74, 0);
    g.add(top);
    if (round) {
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.72, 12), M.black, 0, 0.36, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.025, 24), M.black, 0, 0.012, 0));
    } else {
      [-1, 1].forEach(function (sx) {            // ножки: четыре тонких стойки и царга, а не сплошная панель
        [-1, 1].forEach(function (sz) { g.add(mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), M.black, sx * (w / 2 - 0.08), 0.36, sz * (d / 2 - 0.08))); });
      });
      g.add(mesh(new THREE.BoxGeometry(w - 0.16, 0.06, 0.03), M.black, 0, 0.69, 0));
    }
    g.position.set(x, 0, z); g.rotation.y = rot || 0;
    return g;
  }
  function makeFlipchart(x, z, face) {
    var g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.72, 0.98, 0.02), M.white, 0, 1.45, 0));
    g.add(mesh(new THREE.BoxGeometry(0.76, 0.03, 0.04), M.black, 0, 0.96, 0.01));
    [[-0.3, 0.1], [0.3, 0.1], [0, -0.12]].forEach(function (p) {
      var leg = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), M.chrome, p[0], 0.5, p[1], true, false);
      leg.rotation.set(p[1] === 0.1 ? -0.1 : 0.1, 0, p[0] * 0.2); g.add(leg);
    });
    g.position.set(x, 0, z); g.rotation.y = face; return g;
  }
  function makeLaptopSet(x, z, rot) {                  // стол ведущего: ноутбук и графин
    var g = new THREE.Group();
    g.add(makeTable(1.5, 0.7, 0, 0, 0));
    var base = mesh(new THREE.BoxGeometry(0.34, 0.015, 0.23), M.graphite, 0.0, 0.77, 0.0); g.add(base);
    var lid = mesh(new THREE.BoxGeometry(0.34, 0.23, 0.01), M.graphite, 0, 0.89, -0.11); lid.rotation.x = -0.28; g.add(lid);
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 14), M.frosted, 0.5, 0.86, -0.1, false, false));
    g.position.set(x, 0, z); g.rotation.y = rot; return g;
  }
  function makeFigure(x, z, face, seated, dark) {      // условная фигура человека — для масштаба
    var g = new THREE.Group(), mat = dark ? M.figureDark : M.figure;
    if (seated) {
      g.add(mesh(new THREE.CapsuleGeometry(0.17, 0.34, 4, 12), mat, 0, 0.9, -0.02));
      g.add(mesh(new THREE.SphereGeometry(0.105, 18, 14), mat, 0, 1.3, 0.02));
      var th = mesh(new THREE.CapsuleGeometry(0.075, 0.28, 3, 8), mat, 0, 0.56, 0.17); th.rotation.x = Math.PI / 2; g.add(th);
    } else {
      g.add(mesh(new THREE.CapsuleGeometry(0.2, 0.52, 4, 12), mat, 0, 1.26, 0));
      g.add(mesh(new THREE.SphereGeometry(0.115, 18, 14), mat, 0, 1.76, 0));
      [-0.1, 0.1].forEach(function (lx) { g.add(mesh(new THREE.CapsuleGeometry(0.075, 0.7, 3, 8), mat, lx, 0.45, 0)); });
      var arm = mesh(new THREE.CapsuleGeometry(0.055, 0.5, 3, 8), mat, 0.0, 1.42, 0.2); arm.rotation.set(1.1, 0, -0.5); g.add(arm);
    }
    g.position.set(x, 0, z); g.rotation.y = Math.atan2(face[0] - x, face[1] - z);
    return g;
  }

  var blobTex = blobTexture();
  var blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.55 });
  function blob(w, d, x, z, rot) {                     // мягкая тень на полу под предметом
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), blobMat);
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot || 0; m.position.set(x, 0.006, z); m.renderOrder = 1;
    return m;
  }

  /* Расстановки: каждый предмет — объект с задержкой появления. Люди лежат в отдельной группе */
  function buildLayouts() {
    var out = {};
    var screenPt = [0, SCREEN.z];

    out.empty = { items: [], people: [], cinema: false, labels: [] };

    // Мастер-класс: 8 столов (2 колонки × 4 ряда), 24 стула, стол ведущего, проектор и экран
    (function () {
      var r = rng(3), items = [], people = [], rows = [4.9, 6.7, 8.5, 10.3], cols = [2.55, 5.45], k = 0;
      rows.forEach(function (x, ri) {
        cols.forEach(function (z) {
          var t = new THREE.Group();
          t.add(makeTable(0.55, 1.8, 0, 0, 0)); t.add(blob(1.1, 2.3, 0.2, 0, Math.PI / 2));
          t.position.set(x, 0, z); t.userData.delay = ri * 0.09 + (z > 4 ? 0.03 : 0); items.push(t);
          [-0.62, 0, 0.62].forEach(function (dz) {
            var cz = z + dz, cx = x + 0.62 + r() * 0.1;
            var c = makeChair(cx, cz, x - 1, cz, r); c.userData.delay = ri * 0.09 + 0.08; items.push(c);
            if (r() > 0.28) {
              var f = makeFigure(cx - 0.02, cz, [0, cz], true, k++ % 3 === 0); f.userData.delay = ri * 0.09 + 0.2; people.push(f);
            }
          });
        });
      });
      var desk = makeLaptopSet(2.1, 5.6, -Math.PI / 2 * 0 + Math.PI / 2); desk.userData.delay = 0.05; items.push(desk);
      var teacher = makeFigure(1.6, 2.85, [6, 4.2], false, false); teacher.userData.delay = 0.1; people.push(teacher);
      out.master = { items: items, people: people, cinema: true, labels: [] };
    })();

    // Один большой стол: 8 секций, 16 стульев, экран, флипчарт
    (function () {
      var r = rng(8), items = [], people = [], x0 = 4.4, sec = 0.9, cx = 8.0, cz = 4.0;
      for (var i = 0; i < 8; i++) {
        var t = new THREE.Group();
        t.add(makeTable(sec - 0.02, 1.25, 0, 0, 0));
        t.position.set(x0 + sec * (i + 0.5), 0, cz); t.userData.delay = i * 0.05; items.push(t);
      }
      items.push(Object.assign(blob(7.9, 2.4, cx, cz, 0), { userData: { delay: 0.1 } }));
      for (var i2 = 0; i2 < 8; i2++) {
        [-1, 1].forEach(function (side) {
          var x = x0 + sec * (i2 + 0.5) + (r() - 0.5) * 0.12, z = cz + side * 0.98;
          var c = makeChair(x, z, x, cz, r); c.userData.delay = i2 * 0.05 + 0.1; items.push(c);
          if (r() > 0.22) { var f = makeFigure(x, z + side * 0.02, [x, cz], true, (i2 + side) % 3 === 0); f.userData.delay = i2 * 0.05 + 0.25; people.push(f); }
        });
      }
      var fc = makeFlipchart(1.9, 6.7, Math.PI / 2 - 0.5); fc.userData.delay = 0.15; items.push(fc);
      var teacher = makeFigure(1.6, 2.7, [8, 4], false, false); teacher.userData.delay = 0.3; people.push(teacher);
      out.table = { items: items, people: people, cinema: true, labels: [] };
    })();

    // Отдельные столы: 6 круглых столов по 5 стульев, флипчарт у каждой группы
    (function () {
      var r = rng(13), items = [], people = [], xs = [4.7, 8.3, 11.9], zs = [2.45, 5.55], n = 0;
      xs.forEach(function (x, xi) {
        zs.forEach(function (z, zi) {
          var t = new THREE.Group();
          t.add(makeTable(1.45, 1.45, 0, 0, 0, true)); t.add(blob(2.6, 2.6, 0, 0, 0));
          t.position.set(x, 0, z); t.userData.delay = (xi * 2 + zi) * 0.07; items.push(t);
          for (var i = 0; i < 5; i++) {
            var a = i / 5 * Math.PI * 2 + 0.5 + zi * 0.4;
            var cx = x + Math.cos(a) * 1.08, cz = z + Math.sin(a) * 1.08;
            var c = makeChair(cx, cz, x, z, r); c.userData.delay = (xi * 2 + zi) * 0.07 + 0.08; items.push(c);
            if (r() > 0.25) { var f = makeFigure(cx, cz, [x, z], true, n++ % 3 === 1); f.userData.delay = (xi * 2 + zi) * 0.07 + 0.22; people.push(f); }
          }
          var fx = x - 1.45, fz = z + (zi === 0 ? -0.55 : 0.55);
          var fc = makeFlipchart(fx, fz, Math.PI / 2 - (zi === 0 ? -0.35 : 0.35) + 0.0); fc.userData.delay = (xi * 2 + zi) * 0.07 + 0.12; items.push(fc);
        });
      });
      out.groups = { items: items, people: people, cinema: false, labels: [] };
    })();

    return out;
  }
  var layouts = buildLayouts();
  var furniture = new THREE.Group(); scene.add(furniture);
  var peopleGroup = new THREE.Group(); scene.add(peopleGroup);
  var showPeople = options.people !== false;
  var current = -1;                                    // индекс текущей расстановки
  var staged = [];                                     // предметы, которые сейчас появляются/исчезают

  function setLayout(index, instant) {
    if (index === current || !layouts[LAYOUT_IDS[index]]) return;
    var prev = current >= 0 ? layouts[LAYOUT_IDS[current]] : null;
    var next = layouts[LAYOUT_IDS[index]];
    current = index;
    // старые предметы уходят вместе, новые появляются «волной»
    if (prev) prev.items.concat(prev.people).forEach(function (o) {
      if (instant) { o.parent && o.parent.remove(o); return; }
      staged.push({ o: o, from: 1, to: 0, t: -Math.random() * 0.12, dur: 0.28, remove: true });
    });
    next.items.forEach(function (o) { place(o, furniture, instant); });
    next.people.forEach(function (o) { place(o, peopleGroup, instant); });
    cinemaTarget = next.cinema ? 1 : 0;
    if (instant) cinemaK = cinemaTarget;
    peopleGroup.visible = showPeople;
    shadowDirty = true; requestRender();
  }
  function place(o, group, instant) {
    // если предмет ещё уходит (быстрое переключение) — отменяем уход
    staged = staged.filter(function (s) { return s.o !== o; });
    group.add(o);
    if (instant) { o.scale.setScalar(1); return; }
    o.scale.setScalar(0.001);
    staged.push({ o: o, from: 0.001, to: 1, t: -(o.userData.delay || 0) - 0.18, dur: 0.5, back: true });
  }

  /* ==========================================================================
     Режимы света: день / вечер / презентация
     ========================================================================== */
  var LIGHTS = {
    day:     { sun: 3.6, lamp: 0.55, env: 0.9, hemi: 0.3, night: 0, screen: 0.0, beam: 0, exposure: 1.0 },
    evening: { sun: 0.0, lamp: 1.0,  env: 0.14, hemi: 0.05, night: 1, screen: 0.0, beam: 0, exposure: 0.95 },
    present: { sun: 0.3, lamp: 0.1, env: 0.22, hemi: 0.1, night: 0.45, screen: 1, beam: 1, exposure: 1.0 }
  };
  var light = Object.assign({}, LIGHTS.day), lightTarget = LIGHTS.day, lightName = 'day';
  var cinemaK = 0, cinemaTarget = 0;                   // экран/проектор «выезжают» плавно

  function applyLight() {
    sun.intensity = light.sun;
    hemi.intensity = light.hemi;
    lamps.forEach(function (l) { l.intensity = light.lamp * 22; });
    barMat.color.setScalar(0.45 + light.lamp * 1.5);
    glowMat.opacity = 0.15 + light.lamp * 0.4;
    ceilingGroup.children.forEach(function (c) { if (c.isSprite) c.visible = true; });
    Object.keys(M).forEach(function (k) { /* яркость окружения для материалов */ });
    scene.traverse(function (o) { if (o.material && o.material.envMapIntensity !== undefined && o.material.userData.env0 === undefined) o.material.userData.env0 = o.material.envMapIntensity; });
    scene.traverse(function (o) { if (o.material && o.material.userData && o.material.userData.env0 !== undefined) o.material.envMapIntensity = o.material.userData.env0 * light.env; });
    backdropNight.material.opacity = light.night;
    backdropDay.material.color.setScalar(1 - light.night * 0.0);
    screenMat.color.setScalar(0.1 + 0.9 * cinemaK * (0.4 + 0.6 * light.screen));
    beamMat.opacity = 0.075 * cinemaK * light.beam;
    beam.visible = beamMat.opacity > 0.002;
    cinema.visible = cinemaK > 0.01;
    cinema.scale.set(1, 1, 1);
    renderer.toneMappingExposure = light.exposure;
  }
  function setLight(name) {
    if (!LIGHTS[name]) return;
    lightName = name; lightTarget = LIGHTS[name]; shadowDirty = true; requestRender();
  }

  /* ==========================================================================
     Камера: «изнутри» (поворот головой) и «сверху» (кукольный дом)
     ========================================================================== */
  var view = { mode: 'in', yaw: 0, pitch: 0, fov: 64, pos: new THREE.Vector3(), az: 0, el: 0.95, dist: 15, target: new THREE.Vector3() };
  var camTween = null;
  var viewName = 'entrance';
  var tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  function yawPitchFromLook(pos, look) {
    var dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }
  function poseOf(v) {                                  // положение камеры для описания вида
    if (v.mode === 'top') {
      var t = new THREE.Vector3().fromArray(v.target);
      var pos = new THREE.Vector3(t.x + Math.sin(v.az) * Math.cos(v.el) * v.dist, t.y + Math.sin(v.el) * v.dist, t.z + Math.cos(v.az) * Math.cos(v.el) * v.dist);
      var m = new THREE.Matrix4().lookAt(pos, t, new THREE.Vector3(0, 1, 0));
      return { pos: pos, quat: new THREE.Quaternion().setFromRotationMatrix(m), fov: v.fov };
    }
    var yp = yawPitchFromLook(v.pos, v.look);
    return { pos: new THREE.Vector3().fromArray(v.pos), quat: new THREE.Quaternion().setFromEuler(tmpEuler.set(yp.pitch, yp.yaw, 0)), fov: v.fov };
  }
  function applyCamera() {
    if (view.mode === 'in') {
      camera.position.copy(view.pos);
      camera.quaternion.setFromEuler(tmpEuler.set(view.pitch, view.yaw, 0));
      camera.fov = vfovFor(view.fov, camera.aspect);
    } else {
      view.dist = THREE.MathUtils.clamp(view.dist, 8, 24);
      camera.position.set(view.target.x + Math.sin(view.az) * Math.cos(view.el) * view.dist, view.target.y + Math.sin(view.el) * view.dist, view.target.z + Math.cos(view.az) * Math.cos(view.el) * view.dist);
      camera.lookAt(view.target);
      camera.fov = vfovFor(view.fov, camera.aspect);
    }
    camera.updateProjectionMatrix();
    var top = view.mode === 'top' && !camTween;
    ceilingGroup.visible = !top && !(camTween && camTween.toTop);
    var hideSky = view.mode === 'top' || (camTween && camTween.toTop);
    backdropDay.visible = backdropNight.visible = !hideSky;
    scene.background.set(hideSky ? '#e4e9ec' : '#9fc4e4');
  }
  function setView(name, instant) {
    var v = VIEWS[name]; if (!v) return;
    viewName = name;
    var to = poseOf(v);
    if (instant || !renderedOnce) {
      commitView(v); requestRender(); return;
    }
    var fromQuat = camera.quaternion.clone(), fromPos = camera.position.clone(), fromFov = view.fov;
    camTween = { t: 0, dur: v.mode === 'top' || view.mode === 'top' ? 1.5 : 1.15, fromPos: fromPos, fromQuat: fromQuat, fromFov: fromFov, to: to, v: v, toTop: v.mode === 'top', fromTop: view.mode === 'top' };
    requestRender();
  }
  function commitView(v) {
    view.mode = v.mode === 'top' ? 'top' : 'in';
    view.fov = v.fov;
    if (v.mode === 'top') {
      view.target.fromArray(v.target); view.az = v.az; view.el = v.el; view.dist = v.dist;
    } else {
      var yp = yawPitchFromLook(v.pos, v.look);
      view.pos.fromArray(v.pos); view.yaw = yp.yaw; view.pitch = yp.pitch;
    }
    applyCamera();
  }

  /* ---------- Управление мышью/пальцем/клавиатурой ---------- */
  var dom = renderer.domElement, pointers = {}, pinchD = 0, interacted = false;
  dom.style.touchAction = 'pan-y';                      // вертикальный жест листает страницу, горизонтальный — вращает зал
  dom.addEventListener('pointerdown', function (e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    try { dom.setPointerCapture(e.pointerId); } catch (err) {}
    interacted = true; camTween = null;
    dom.classList.add('is-drag');
    pinchD = 0;
  });
  dom.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId]; if (!p) return;
    var ids = Object.keys(pointers);
    if (ids.length === 2) {                             // щипок — масштаб
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) zoom((pinchD - d) * 0.15);
      pinchD = d; return;
    }
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var k = view.fov / 64 * 0.0042;
    if (view.mode === 'in') {
      view.yaw += dx * k;
      view.pitch = THREE.MathUtils.clamp(view.pitch + dy * k, -1.2, 1.2);
    } else {
      view.az = THREE.MathUtils.clamp(view.az - dx * 0.006, -1.0, 1.0);
      view.el = THREE.MathUtils.clamp(view.el + dy * 0.005, 0.35, 1.45);
    }
    applyCamera(); requestRender();
  });
  function endPointer(e) {
    delete pointers[e.pointerId]; pinchD = 0;
    if (!Object.keys(pointers).length) dom.classList.remove('is-drag');
  }
  dom.addEventListener('pointerup', endPointer);
  dom.addEventListener('pointercancel', endPointer);
  function zoom(delta) {
    if (view.mode === 'in') view.fov = THREE.MathUtils.clamp(view.fov + delta, 36, 84);
    else view.dist = THREE.MathUtils.clamp(view.dist + delta * 0.12, 8, 24);
    applyCamera(); requestRender();
  }
  // Колесо мыши меняет масштаб только когда пользователь уже «взял» сцену (клик/касание),
  // иначе страница не прокручивалась бы, пока курсор над залом
  dom.addEventListener('wheel', function (e) {
    if (!interacted) return;
    e.preventDefault(); camTween = null; zoom(e.deltaY * 0.03);
  }, { passive: false });
  dom.addEventListener('pointerleave', function () { if (!Object.keys(pointers).length) interacted = false; });
  dom.setAttribute('tabindex', '-1');

  function nudge(dx, dy) {                              // для кнопок и клавиш-стрелок
    camTween = null;
    if (view.mode === 'in') { view.yaw -= dx * 0.12; view.pitch = THREE.MathUtils.clamp(view.pitch - dy * 0.08, -1.2, 1.2); }
    else { view.az = THREE.MathUtils.clamp(view.az + dx * 0.1, -1.0, 1.0); view.el = THREE.MathUtils.clamp(view.el - dy * 0.06, 0.35, 1.45); }
    applyCamera(); requestRender();
  }

  /* ---------- Подписи с размерами (HTML поверх сцены) ---------- */
  var labelLayer = document.createElement('div'); labelLayer.className = 'tour3d__labels'; labelLayer.setAttribute('aria-hidden', 'true'); host.appendChild(labelLayer);
  var labelDefs = [
    { t: 'Окна 4 × 3,5 м', p: [WIN_X[1], 2.4, 0.1], only: 'in' },
    { t: 'Потолки 4,5 м', p: [L - 0.1, 4.0, 2.0], only: 'in' },
    { t: 'Экран 3,6 × 2 м', p: [0.05, 3.3, 4.0], need: 'cinema', only: 'in' },
    { t: 'Проектор', p: [8.6, 3.75, 4.0], need: 'cinema' },
    { t: 'Вход', p: [14.0, 2.7, D - 0.1], only: 'in' },
    { t: '15,4 м', p: [7.7, 0.1, D + 0.2], only: 'top' },
    { t: '8 м', p: [L + 0.35, 0.1, 4.0], only: 'top' },
    { t: '123 м²', p: [7.7, 0.1, 1.2], only: 'top' }
  ].map(function (d) {
    var el = document.createElement('span'); el.className = 'tour3d__label'; el.textContent = d.t; labelLayer.appendChild(el);
    d.el = el; d.v = new THREE.Vector3().fromArray(d.p); return d;
  });
  var labelsOn = false;
  function updateLabels() {
    if (!labelsOn) return;
    var w = host.clientWidth, h = host.clientHeight, v = new THREE.Vector3(), dir = new THREE.Vector3();
    var placed = [];
    camera.getWorldDirection(dir);
    labelDefs.forEach(function (d) {
      var show = true;
      if (d.only === 'in' && view.mode !== 'in') show = false;
      if (d.only === 'top' && view.mode !== 'top') show = false;
      if (d.need === 'cinema' && cinemaK < 0.5) show = false;
      v.copy(d.v).project(camera);
      var inFront = v.z < 1 && dir.dot(d.v.clone().sub(camera.position)) > 0;
      if (!show || !inFront || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { d.el.style.opacity = 0; return; }
      var px = (v.x * 0.5 + 0.5) * w, py = (-v.y * 0.5 + 0.5) * h;
      // подписи не должны налезать друг на друга: если место занято, прячем вторую
      var bw = d.t.length * 7 + 24, bh = 28;
      for (var k = 0; k < placed.length; k++) {
        if (Math.abs(px - placed[k][0]) < (bw + placed[k][2]) / 2 && Math.abs(py - placed[k][1]) < bh) { d.el.style.opacity = 0; return; }
      }
      placed.push([px, py, bw]);
      d.el.style.opacity = 1;
      d.el.style.transform = 'translate(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px) translate(-50%,-50%)';
    });
  }
  function setLabels(on) { labelsOn = !!on; labelLayer.classList.toggle('is-on', labelsOn); labelDefs.forEach(function (d) { if (!labelsOn) d.el.style.opacity = 0; }); requestRender(); }
  function setPeople(on) { showPeople = !!on; peopleGroup.visible = showPeople; shadowDirty = true; requestRender(); }

  /* ==========================================================================
     Цикл отрисовки «по требованию»: кадры считаются, только пока что-то меняется
     ========================================================================== */
  var needs = true, running = false, active = true, raf = 0, last = 0, shadowDirty = true, renderedOnce = false;
  var slowFrames = 0, onFrame = options.onFrame || null;

  function requestRender() { needs = true; if (active && !raf) raf = requestAnimationFrame(tick); }

  function tick(now) {
    raf = 0;
    if (!active) return;
    var dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    if (options.fixedDt) dt = options.fixedDt;
    last = now;
    var busy = step(dt);
    var t0 = performance.now();
    draw();
    // Если кадр тяжёлый, снижаем разрешение (слабые телефоны/встроенная графика)
    if (!options.fixedDt && performance.now() - t0 > 45) { if (++slowFrames > 6 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); slowFrames = 0; } }
    if (busy || needs) { needs = false; raf = requestAnimationFrame(tick); }
    else last = 0;
  }
  function draw() {
    applyLight();
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    renderer.render(scene, camera);
    updateLabels();
    if (!renderedOnce) { renderedOnce = true; if (onFrame) onFrame(); }
  }
  function approach(cur, tgt, dt, speed) { return Math.abs(tgt - cur) < 0.002 ? tgt : cur + (tgt - cur) * Math.min(1, dt * speed); }

  function step(dt) {
    var busy = false;
    // свет
    Object.keys(lightTarget).forEach(function (k) {
      var n = approach(light[k], lightTarget[k], dt, 5);
      if (n !== light[k]) busy = true; light[k] = n;
    });
    if (light.sun !== lightTarget.sun) shadowDirty = true;
    var ck = approach(cinemaK, cinemaTarget, dt, 6); if (ck !== cinemaK) busy = true; cinemaK = ck;
    // мебель
    if (staged.length) {
      busy = true; shadowDirty = true;
      staged = staged.filter(function (s) {
        s.t += dt;
        var k = Math.max(0, Math.min(1, s.t / s.dur));
        var e = s.back ? 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2) : k * k * (3 - 2 * k);   // лёгкий «пружинящий» выход
        var val = s.from + (s.to - s.from) * (s.back ? e : (k * k * (3 - 2 * k)));
        s.o.scale.setScalar(Math.max(0.001, val));
        if (k >= 1) { if (s.remove && s.o.parent) s.o.parent.remove(s.o); return false; }
        return true;
      });
    }
    // камера
    if (camTween) {
      busy = true;
      var c = camTween; c.t += dt; var k = ease(Math.min(1, c.t / c.dur));
      camera.position.lerpVectors(c.fromPos, c.to.pos, k);
      camera.quaternion.slerpQuaternions(c.fromQuat, c.to.quat, k);
      camera.fov = vfovFor(lerp(c.fromFov, c.to.fov, k), camera.aspect); camera.updateProjectionMatrix();
      var hide = c.toTop || c.fromTop;
      ceilingGroup.visible = !(c.toTop ? k > 0.35 : (c.fromTop ? k < 0.65 : false));
      if (c.toTop) { var hs = k > 0.5; backdropDay.visible = backdropNight.visible = !hs; scene.background.set(hs ? '#e4e9ec' : '#9fc4e4'); }
      if (c.fromTop) { var hs2 = k < 0.5; backdropDay.visible = backdropNight.visible = !hs2; scene.background.set(hs2 ? '#e4e9ec' : '#9fc4e4'); }
      if (c.t >= c.dur) { camTween = null; commitView(c.v); }
    }
    return busy;
  }

  function resize() {
    var w = Math.max(2, host.clientWidth), h = Math.max(2, host.clientHeight);
    renderer.setSize(w, h, false);
    dom.style.width = '100%'; dom.style.height = '100%';
    camera.aspect = w / h;
    // на узких экранах (портрет) расширяем угол по вертикали, чтобы зал не «резался» по бокам
    var narrow = Math.min(1, camera.aspect / (16 / 9));
    camera.userData.narrow = narrow;
    if (!camTween) applyCamera(); else camera.updateProjectionMatrix();
    requestRender();
  }
  var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(host); else window.addEventListener('resize', resize);

  function setActive(on) {
    active = !!on;
    if (active) { last = 0; requestRender(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function dispose() {
    setActive(false);
    if (ro) ro.disconnect();
    scene.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    envMap.dispose(); pmrem.dispose(); renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    labelLayer.remove();
  }

  /* ---------- Съёмка панорамы 360° (для подготовки media/pano-*.webp) ---------- */
  function capturePanorama(width, viewPos) {
    var size = Math.min(2048, width / 2);
    var rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    var cam = new THREE.CubeCamera(0.1, 200, rt);
    cam.position.fromArray(viewPos || [8, 1.6, 4]);
    var hadCeil = ceilingGroup.visible; ceilingGroup.visible = true;
    backdropDay.visible = backdropNight.visible = true;
    applyLight(); renderer.shadowMap.needsUpdate = true;
    cam.update(renderer, scene);
    var mat = new THREE.ShaderMaterial({
      uniforms: { tCube: { value: rt.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform samplerCube tCube; varying vec2 vUv;' +
        'void main(){ float lon = (vUv.x - 0.5) * 6.2831853; float lat = (vUv.y - 0.5) * 3.1415926;' +
        'vec3 d = vec3(sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat));' +
        'gl_FragColor = textureCube(tCube, vec3(d.x, d.y, d.z));' +
        '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n }',
      depthTest: false, depthWrite: false
    });
    var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
    var qs = new THREE.Scene(); qs.add(quad);
    var oldSize = renderer.getSize(new THREE.Vector2()), oldRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(width, width / 2, false);
    renderer.render(qs, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1));
    var url = renderer.domElement.toDataURL('image/png');
    renderer.setPixelRatio(oldRatio); renderer.setSize(oldSize.x, oldSize.y, false);
    ceilingGroup.visible = hadCeil;
    rt.dispose(); mat.dispose();
    return url;
  }

  /* ---------- Старт ---------- */
  commitView(VIEWS.entrance);
  setLayout(0, true);
  applyLight();
  resize();
  requestRender();

  return {
    views: Object.keys(VIEWS).map(function (k) { return { id: k, label: VIEWS[k].label }; }),
    setLayout: setLayout,
    setView: setView,
    setLight: setLight,
    setLabels: setLabels,
    setPeople: setPeople,
    setActive: setActive,
    nudge: nudge,
    zoom: zoom,
    resize: resize,
    dispose: dispose,
    get view() { return viewName; },
    get lightName() { return lightName; },
    // для подготовки медиа и тестов
    _capturePanorama: capturePanorama,
    _step: function (dt) { var b = step(dt); draw(); return b; },
    _render: draw,
    _poseTo: function (name) { commitView(VIEWS[name]); viewName = name; draw(); },
    _settle: function () { var n = 0; while (step(0.05) && n++ < 200); light = Object.assign({}, lightTarget); draw(); },
    _api: { THREE: THREE, scene: scene, camera: camera, view: view, VIEWS: VIEWS, applyCamera: applyCamera, renderer: renderer }
  };
}
