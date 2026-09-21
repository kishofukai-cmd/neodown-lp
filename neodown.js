/* FiberField — 繊維の線を3Dで描き、状態のあいだをスクロール量で補間する canvas 描画
   使い方: const f = new FiberField(canvas, FiberField.presets.tech()); f.setProgress(0〜states-1); */
(function (global) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function randDir(r) {
    var u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    return [s * Math.cos(th), u, s * Math.sin(th)];
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function add(p, d, k) { return [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]; }

  function FiberField(canvas, preset) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.p = preset;
    this.target = 0;
    this.current = 0;
    this.mouse = [0, 0];
    this.mouseCur = [0, 0];
    this.visible = false;
    this.running = false;
    this.t0 = performance.now();
    this.still = !!preset.still;
    this._frame = this._frame.bind(this);
    this.resize();

    var self = this;
    if ('ResizeObserver' in global) new ResizeObserver(function () { self.resize(); self.draw(); }).observe(canvas);
    else global.addEventListener('resize', function () { self.resize(); self.draw(); });
    if ('IntersectionObserver' in global) {
      new IntersectionObserver(function (es) {
        self.visible = es[0].isIntersecting;
        if (self.visible) self.start();
      }).observe(canvas);
    } else { this.visible = true; this.start(); }
    global.addEventListener('pointermove', function (e) {
      self.mouse = [e.clientX / global.innerWidth * 2 - 1, e.clientY / global.innerHeight * 2 - 1];
    }, { passive: true });
  }

  FiberField.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
  };
  FiberField.prototype.setProgress = function (v) { this.target = v; if (this.still) { this.current = v; this.draw(); } };
  FiberField.prototype.start = function () {
    if (this.still) { this.draw(); return; }
    if (this.running) return;
    this.running = true; requestAnimationFrame(this._frame);
  };
  FiberField.prototype._frame = function () {
    if (!this.visible) { this.running = false; return; }
    this.current += (this.target - this.current) * 0.12;
    this.mouseCur[0] += (this.mouse[0] - this.mouseCur[0]) * 0.05;
    this.mouseCur[1] += (this.mouse[1] - this.mouseCur[1]) * 0.05;
    this.draw();
    requestAnimationFrame(this._frame);
  };

  FiberField.prototype.draw = function () {
    var p = this.p, ctx = this.ctx, w = this.w, h = this.h, dpr = this.dpr;
    var time = (performance.now() - this.t0) / 1000;
    var nStates = p.zoom.length;
    var prog = Math.max(0, Math.min(nStates - 1, this.current));
    if (p.breathe && !this.still) prog = Math.max(0, Math.min(nStates - 1, prog + Math.sin(time * 0.8) * p.breathe));
    var i0 = Math.min(nStates - 2, Math.floor(prog)), tt = prog - i0;

    var c = p.center(w, h);
    var scale = Math.min(w, h) * p.scale * lerp(p.zoom[i0], p.zoom[i0 + 1], easeInOut(tt));
    var ay = (this.still ? 0.6 : time * lerp(p.spin[i0], p.spin[i0 + 1], tt)) + this.mouseCur[0] * 0.35 + prog * 0.5;
    var ax = p.tilt + this.mouseCur[1] * 0.18;
    var sy = Math.sin(ay), cy = Math.cos(ay), sx = Math.sin(ax), cx = Math.cos(ax);
    var F = 3.4;

    function proj(v) {
      var x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy;
      var y = v[1] * cx - z * sx; z = v[1] * sx + z * cx;
      var s = F / (F - z);
      return [c[0] + x * s * scale, c[1] - y * s * scale, z, s];
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';

    var fibers = p.fibers, lw = lerp(p.width[i0], p.width[i0 + 1], tt);
    for (var i = 0; i < fibers.length; i++) {
      var f = fibers[i], A = f.s[i0], B = f.s[i0 + 1];
      var lt = easeInOut(clamp01((tt - f.delay) / (1 - p.maxDelay)));
      var a = [lerp(A.a[0], B.a[0], lt), lerp(A.a[1], B.a[1], lt), lerp(A.a[2], B.a[2], lt)];
      var b = [lerp(A.b[0], B.b[0], lt), lerp(A.b[1], B.b[1], lt), lerp(A.b[2], B.b[2], lt)];
      var cv = lerp(A.c, B.c, lt);
      if (!this.still && cv > 0.001) cv *= 1 + Math.sin(time * 1.3 + i) * 0.18;
      var m = add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], f.n, cv);
      var pa = proj(a), pb = proj(b), pm = proj(m);
      var depth = clamp01(((pa[2] + pb[2]) / 2 + 1.4) / 2.8);
      ctx.strokeStyle = 'rgba(' + p.tones[f.tone] + ',' + (p.alpha * (0.28 + 0.72 * depth)).toFixed(3) + ')';
      ctx.lineWidth = lw * (0.6 + 0.6 * depth);
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.quadraticCurveTo(pm[0], pm[1], pb[0], pb[1]);
      ctx.stroke();
    }

    if (p.nodes && prog > p.nodeFrom) {
      var nt = clamp01((prog - p.nodeFrom) / (nStates - 1 - p.nodeFrom));
      for (var k = 0; k < p.nodes.length; k++) {
        var local = clamp01((nt - (k / p.nodes.length) * 0.6) / 0.4);
        if (local <= 0) continue;
        var pn = proj(p.nodes[k]);
        var r = Math.max(0, easeOutBack(local)) * p.nodeSize * pn[3] * (scale / 300);
        var d = clamp01((pn[2] + 1.4) / 2.8);
        ctx.fillStyle = 'rgba(' + p.nodeTone + ',' + (0.35 + 0.65 * d).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(pn[0], pn[1], r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(' + p.nodeRing + ',' + (0.9 * d).toFixed(3) + ')';
        ctx.lineWidth = 1.2; ctx.stroke();
      }
    }
  };

  /* ---- プリセット ---------------------------------------------------- */
  FiberField.presets = {
    // テクノロジー: 絡まり → ひらく（花のように放射）→ たてる（ジャングルジム状の格子）→ とめる（交点に点）
    tech: function (opts) {
      opts = opts || {};
      var r = mulberry32(7), G = 4, step = 0.6, o = -0.9, edges = [], nodes = [], i, j, k;
      for (i = 0; i < G; i++) for (j = 0; j < G; j++) for (k = 0; k < G; k++) {
        var pt = [o + i * step, o + j * step, o + k * step];
        nodes.push(pt);
        if (i < G - 1) edges.push([pt, [pt[0] + step, pt[1], pt[2]]]);
        if (j < G - 1) edges.push([pt, [pt[0], pt[1] + step, pt[2]]]);
        if (k < G - 1) edges.push([pt, [pt[0], pt[1], pt[2] + step]]);
      }
      for (i = edges.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); var tmp = edges[i]; edges[i] = edges[j]; edges[j] = tmp; }
      var maxDelay = 0.4;
      var fibers = edges.map(function (e) {
        var c0 = add([0, 0, 0], randDir(r), Math.pow(r(), 0.6) * 0.42), d0 = randDir(r), l0 = 0.18 + r() * 0.3;
        var d1 = randDir(r), r1 = 0.35 + r() * 0.75, l1 = 0.4 + r() * 0.25;
        var lat = { a: e[0], b: e[1], c: 0 };
        return {
          s: [
            { a: add(c0, d0, -l0), b: add(c0, d0, l0), c: 0.3 + r() * 0.4 },
            { a: add([0, 0, 0], d1, r1), b: add([0, 0, 0], d1, r1 + l1), c: 0.06 + r() * 0.1 },
            lat, lat
          ],
          n: randDir(r),
          delay: ((e[0][1] + e[1][1]) / 2 + 0.9) / 1.8 * maxDelay,
          tone: r() < 0.18 ? 1 : 0
        };
      });
      return {
        fibers: fibers, nodes: nodes, nodeFrom: 2, nodeSize: 6.5, maxDelay: maxDelay,
        zoom: [1.3, 0.9, 1, 1.03], spin: [0.35, 0.22, 0.16, 0.08], width: [1.3, 1.3, 2, 2.2],
        tilt: 0.42, scale: 0.285, alpha: 0.9, still: !!opts.still,
        // 繊維はチャコール、交点（接着点）だけロゴと同じ赤
        tones: ['36,39,43', '58,63,69'], nodeTone: '215,20,26', nodeRing: '242,238,232',
        center: function (w, h) { return [w / 2, h / 2]; }
      };
    },

    // ヒーロー: 小さくまとまった綿 → 空気を含んでふくらむ
    hero: function (opts) {
      opts = opts || {};
      var r = mulberry32(21), N = 260, fibers = [];
      for (var i = 0; i < N; i++) {
        var d = randDir(r), t = randDir(r), rad = Math.pow(r(), 0.7);
        var len0 = 0.1 + r() * 0.2, len1 = 0.18 + r() * 0.34;
        var c0 = add([0, 0, 0], d, 0.12 + rad * 0.5), c1 = add([0, 0, 0], d, 0.3 + rad * 1.15);
        fibers.push({
          s: [
            { a: add(c0, t, -len0), b: add(c0, t, len0), c: 0.1 + r() * 0.16 },
            { a: add(c1, t, -len1), b: add(c1, t, len1), c: 0.18 + r() * 0.3 }
          ],
          n: randDir(r), delay: r() * 0.25, tone: r() < 0.3 ? 1 : 0
        });
      }
      return {
        fibers: fibers, nodes: null, nodeFrom: 9, maxDelay: 0.25,
        zoom: [1, 1.12], spin: [0.12, 0.12], width: [1.1, 1.1],
        tilt: 0.2, scale: 0.4, alpha: 0.85, breathe: 0.06, still: !!opts.still,
        // グレージュの空に浮かぶ白い綿。輪郭が出るようチャコールを3割まぜる
        tones: ['255,253,250', '70,74,80'],
        center: function (w, h) { return w > 860 ? [w * 0.72, h * 0.44] : [w * 0.66, h * 0.3]; }
      };
    }
  };

  /* ---- PuffField: 写真の上を舞う、カポックの綿 ------------------------------
     実物のカポックは真っ白ではなく、生成り〜アイボリーで絹のような繊維のかたまり。
     べた塗りの雲にせず、半透明のぼかし＋細い繊維の重なりで描き、後ろの写真が透けるようにする（9/21 深井さん）。
     数は少なく。見出し・人物・画像内のロゴ・左下の注記に重ならない位置に置く。
     x,y=画面に対する位置  r=半径（幅1440px基準）  d=奥行き（大きいほど手前。大きく動く）  soft=ぼかし（手前ほど強く） */
  var PUFFS_PC = [
    { x: 0.63, y: 0.17, r: 58, d: 0.6, soft: 0 },
    { x: 0.94, y: 0.71, r: 96, d: 1.4, soft: 0.5 },
    { x: 0.37, y: 0.61, r: 30, d: 0.8, soft: 0 },
    { x: 0.05, y: 0.73, r: 54, d: 1.1, soft: 0.25 },
    { x: 0.53, y: 0.33, r: 20, d: 0.5, soft: 0 },
    { x: 0.71, y: 0.57, r: 11, d: 0.9, soft: 0 },     // 小さな切れ端。舞っている感じを出す
    { x: 0.29, y: 0.74, r: 9, d: 0.7, soft: 0 }
  ];
  var PUFFS_SP = [
    { x: 0.80, y: 0.50, r: 42, d: 0.7, soft: 0 },
    { x: 0.15, y: 0.67, r: 26, d: 0.9, soft: 0 },
    { x: 0.94, y: 0.87, r: 70, d: 1.3, soft: 0.45 },
    { x: 0.55, y: 0.60, r: 9, d: 0.8, soft: 0 }
  ];
  var IVORY = '241,232,212', SHEEN = '255,250,238';

  function makePuffSprite(r, soft, seed, dpr) {
    var rnd = mulberry32(seed), S = Math.ceil(r * 5 * dpr), c = S / 2, R = r * dpr;
    var cv = document.createElement('canvas'); cv.width = cv.height = S;
    var g = cv.getContext('2d'), i;
    function blob(x, y, br, rgb, a0) {
      var gr = g.createRadialGradient(c + x, c + y, 0, c + x, c + y, br);
      gr.addColorStop(0, 'rgba(' + rgb + ',' + a0 + ')');
      gr.addColorStop(0.5, 'rgba(' + rgb + ',' + (a0 * 0.45) + ')');
      gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.beginPath(); g.arc(c + x, c + y, br, 0, Math.PI * 2); g.fill();
    }
    // 1) 半透明のぼかしを不ぞろいに重ねる（芯でも後ろが透ける濃さ）
    for (i = 0; i < 18; i++) {
      var ang = rnd() * Math.PI * 2, rad = Math.pow(rnd(), 0.7);
      blob(Math.cos(ang) * rad * R * 0.8, Math.sin(ang) * rad * R * 0.42, R * (0.26 + rnd() * 0.3) * (1 + soft * 0.7), IVORY, 0.35 - soft * 0.08);
    }
    // 2) 左上に絹のようなつや
    for (i = 0; i < 5; i++) blob((rnd() - 0.75) * R * 0.8, (rnd() - 0.8) * R * 0.4, R * (0.18 + rnd() * 0.2), SHEEN, 0.22);
    // 3) 細い繊維を内側から外へ重ねる（かたまりが繊維でできていると分かるように）
    g.lineCap = 'round';
    var n = soft ? 40 : 90;
    for (i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2, q = Math.pow(rnd(), 0.6), sx = Math.cos(a) * q * R * 0.8, sy = Math.sin(a) * q * R * 0.42;
      var dir = a + (rnd() - 0.5) * 2.4, len = R * (0.3 + rnd() * 0.75), k = (rnd() - 0.5) * len * 0.9;
      g.strokeStyle = 'rgba(' + (rnd() < 0.35 ? SHEEN : IVORY) + ',' + ((0.12 + rnd() * 0.24) * (1 - soft * 0.5)).toFixed(3) + ')';
      g.lineWidth = Math.max(0.6 * dpr, R * 0.006);
      g.beginPath(); g.moveTo(c + sx, c + sy);
      g.quadraticCurveTo(c + sx + Math.cos(dir) * len * 0.5 - Math.sin(dir) * k, c + sy + Math.sin(dir) * len * 0.5 + Math.cos(dir) * k, c + sx + Math.cos(dir) * len, c + sy + Math.sin(dir) * len);
      g.stroke();
    }
    return cv;
  }

  function PuffField(canvas, opts) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.still = !!(opts && opts.still);
    this.target = 0; this.cur = 0; this.mouse = [0, 0]; this.mc = [0, 0]; this.fade = this.still ? 1 : 0;
    this.t0 = performance.now(); this.visible = false; this.running = false; this._frame = this._frame.bind(this);
    this.resize();
    var self = this;
    if ('ResizeObserver' in global) new ResizeObserver(function () { self.resize(); self.draw(); }).observe(canvas);
    if ('IntersectionObserver' in global) new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; if (self.visible) self.start(); }).observe(canvas);
    else { this.visible = true; this.start(); }
    global.addEventListener('pointermove', function (e) { self.mouse = [e.clientX / global.innerWidth * 2 - 1, e.clientY / global.innerHeight * 2 - 1]; }, { passive: true });
  }
  PuffField.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect(), dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    var spec = this.w > 860 ? PUFFS_PC : PUFFS_SP, k = this.w > 860 ? Math.max(0.75, Math.min(1.3, this.w / 1440)) : 1;
    this.puffs = spec.map(function (s, i) { return { s: s, r: s.r * k, ph: i * 1.7 + 0.4, img: makePuffSprite(s.r * k, s.soft, 11 + i * 7, dpr) }; });
  };
  PuffField.prototype.setProgress = function (v) { this.target = v; if (this.still) { this.cur = v; this.draw(); } };
  PuffField.prototype.start = function () { if (this.still) { this.draw(); return; } if (this.running) return; this.running = true; requestAnimationFrame(this._frame); };
  PuffField.prototype._frame = function () {
    if (!this.visible) { this.running = false; return; }
    this.cur += (this.target - this.cur) * 0.1;
    this.mc[0] += (this.mouse[0] - this.mc[0]) * 0.04; this.mc[1] += (this.mouse[1] - this.mc[1]) * 0.04;
    if (performance.now() - this.t0 > 700) this.fade += (1 - this.fade) * 0.025;
    this.draw(); requestAnimationFrame(this._frame);
  };
  PuffField.prototype.draw = function () {
    var ctx = this.ctx, dpr = this.dpr, t = this.still ? 0 : (performance.now() - this.t0) / 1000, self = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.puffs.forEach(function (p) {
      var d = p.s.d;
      // 軽さ: 2つの周期を重ねてふわふわ漂わせ、ゆっくり回す。小さいものほどよく動く
      var light = 1 + Math.max(0, 40 - p.r) / 40, dir = p.ph % 2 > 1 ? 1 : -1;
      var x = p.s.x * self.w + (Math.sin(t * 0.21 + p.ph) * 24 + Math.sin(t * 0.47 + p.ph * 2) * 8) * d * light + self.mc[0] * 20 * d + self.cur * 60 * d;
      var y = p.s.y * self.h + (Math.cos(t * 0.17 + p.ph) * 16 + Math.sin(t * 0.39 + p.ph) * 6) * d * light + self.mc[1] * 12 * d - self.cur * 190 * d * light;
      var sc = 1 + Math.sin(t * 0.31 + p.ph) * 0.03 + self.cur * 0.15 * d, size = p.img.width * sc;
      ctx.setTransform(1, 0, 0, 1, x * dpr, y * dpr); ctx.rotate(t * 0.045 * dir * light + Math.sin(t * 0.23 + p.ph) * 0.12);
      ctx.globalAlpha = self.fade * 0.9;
      ctx.drawImage(p.img, -size / 2, -size / 2, size, size);
    });
    ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  global.PuffField = PuffField;
  global.FiberField = FiberField;
})(window);

/* NEO DOWN KAPOK® LP — スクロール演出（全ページ共通。無いセクションは飛ばす）
   依存: gsap / ScrollTrigger / lenis（CDN）、fiber-field.js。どれかが読めなくても本文は読める状態を保つ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Studio に貼ったときは LP の外側に Studio 本体（隠してある）があるので、探す範囲を LP の中に限る
  var ROOT = document.querySelector('[data-nd-root]') || document;
  var $ = function (s, r) { return (r || ROOT).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || ROOT).querySelectorAll(s)); };
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };

  /* ---- 開催までの日数（data-countdown="2026-10-06T13:00:00+09:00"） ------- */
  // 日本時間の日付どうしの差で数える（9/21 → 10/6 は「あと15日」）
  $$('[data-countdown]').forEach(function (el) {
    var jstDay = function (ms) { var d = new Date(ms + 9 * 3600000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
    var ev = new Date(el.getAttribute('data-countdown')).getTime();
    var days = Math.round((jstDay(ev) - jstDay(Date.now())) / 86400000);
    if (isNaN(days) || days < 1) { el.hidden = true; return; }
    $('[data-countdown-num]', el).textContent = days;
  });

  /* ---- 繊維の canvas（data-tones="r,g,b|r,g,b" と data-alpha で色を上書き） --- */
  var fields = {};
  if (window.FiberField) {
    $$('[data-fiber]').forEach(function (cv) {
      var name = cv.getAttribute('data-fiber');
      var preset = FiberField.presets[name]({ still: reduce });
      if (cv.dataset.tones) preset.tones = cv.dataset.tones.split('|');
      if (cv.dataset.alpha) preset.alpha = parseFloat(cv.dataset.alpha);
      fields[name] = new FiberField(cv, preset);
    });
  }

  /* ---- 写真ヒーローの上を漂う綿の塊 --------------------------------------- */
  var puffs = window.PuffField ? $$('[data-puffs]').map(function (cv) { return new PuffField(cv, { still: reduce }); }) : [];

  var rows = $$('[data-third-row]'), copy = $('[data-third-copy]');

  /* ---- 動きを減らす設定・ライブラリ無しのときは静止状態で終わる ---------------- */
  if (reduce || !window.gsap || !window.ScrollTrigger) {
    $$('[data-metric]').forEach(function (m) { m.classList.add('is-in'); });
    if (fields.tech) fields.tech.setProgress(3);
    if (fields.hero) fields.hero.setProgress(1);
    if (!reduce) {
      rows.forEach(function (li) { li.style.setProperty('--strike', 1); li.style.setProperty('--dim', li.dataset.thirdRow === 'out' ? 1 : 0); li.style.setProperty('--lit', 1); });
      if (copy) { copy.style.opacity = 1; copy.style.transform = 'none'; }
    }
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  /* ---- 慣性スクロール --------------------------------------------------- */
  if (window.Lenis) {
    var lenis = new Lenis({ lerp: 0.11, anchors: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* ---- ヘッダー: 下スクロールで隠す -------------------------------------- */
  var header = $('[data-header]');
  if (header) {
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        header.classList.toggle('is-hidden', self.direction === 1 && self.scroll() > 240);
        header.classList.toggle('is-scrolled', self.scroll() > 80);
      }
    });
    // ヘッダーの真下にあるセクションが明るい面か暗い面（写真を含む）かで文字色を切り替える
    header.classList.add('is-managed');
    $$('main > *, .nd-footer').forEach(function (el) {
      var dark = el.matches('[data-theme="dark"], .hero--photo, .band, .marquee--dark, .nd-footer');
      ScrollTrigger.create({
        trigger: el, start: 'top 40px', end: 'bottom 40px',
        onToggle: function (self) { if (self.isActive) header.classList.toggle('on-light', !dark); }
      });
    });
    var first = $('main > *');
    header.classList.toggle('on-light', !(first && first.matches('[data-theme="dark"], .hero--photo')));
  }

  /* ---- HERO ----------------------------------------------------------- */
  if ($('.hero--photo')) {
    // 全面写真のヒーロー: 読み込み時に少し引いた位置から寄り、スクロールで壁へ歩み寄るように寄って生成りに溶ける
    gsap.from('[data-line]', { yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.14, delay: 0.4 });
    gsap.from('[data-hero-photo] img, [data-hero-photo] video', { scale: 1.1, duration: 3.2, ease: 'power2.out' });
    gsap.timeline({ scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom bottom', scrub: true, onUpdate: function (self) {
      puffs.forEach(function (p) { p.setProgress(self.progress); });
      if (header) header.classList.toggle('on-light', self.progress > 0.8); // 写真が生成りに溶けたらヘッダーを濃い文字に
    } } })
      .to('[data-hero-photo]', { scale: 1.3, ease: 'none', duration: 1 }, 0)
      .to('[data-hero-inner], .hero__scroll', { opacity: 0, y: -40, ease: 'none', duration: 0.35 }, 0)
      .to('[data-hero-fade]', { opacity: 1, ease: 'none', duration: 0.42 }, 0.58);
  } else if ($('[data-hero]')) {
    gsap.from('[data-line]', { yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.14, delay: 0.2 });
    gsap.from('.hero__bgword', { opacity: 0, duration: 2, delay: 0.6 });
    // 入場: 小さな綿の粒から、ふくらんで現れる
    if (fields.hero) gsap.from(fields.hero.p, { scale: 0.1, alpha: 0, duration: 2.6, ease: 'expo.out', delay: 0.1 });
    ScrollTrigger.create({
      trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true,
      onUpdate: function (self) { if (fields.hero) fields.hero.setProgress(Math.min(1, self.progress * 1.15)); }
    });
    gsap.to('.hero__inner', { yPercent: -18, opacity: 0.15, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('[data-bgword]', { xPercent: -9, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* ---- 汎用: 下から出る ------------------------------------------------- */
  $$('[data-rise]').forEach(function (el) {
    var inHero = !!el.closest('[data-hero]');
    gsap.from(el, {
      opacity: 0, y: 44, duration: 1.1, ease: 'power3.out', delay: inHero ? 0.7 : 0,
      scrollTrigger: inHero ? null : { trigger: el, start: 'top 88%' }
    });
  });
  $$('[data-card]').forEach(function (el, i) {
    gsap.from(el, {
      opacity: 0, y: '+=90', rotate: i % 2 ? 2.5 : -2.5, duration: 1.2, ease: 'power3.out', clearProps: 'transform,opacity',
      scrollTrigger: { trigger: el, start: 'top 92%' }
    });
  });

  /* ---- 第3の中綿 -------------------------------------------------------- */
  if (rows.length === 3 && copy) {
    ScrollTrigger.create({
      trigger: '[data-third]', start: 'top top', end: 'bottom bottom', scrub: true,
      onUpdate: function (self) {
        var p = self.progress;
        var s1 = clamp01((p - 0.06) / 0.2), s2 = clamp01((p - 0.3) / 0.2), lit = clamp01((p - 0.54) / 0.2), cp = clamp01((p - 0.74) / 0.14);
        rows[0].style.setProperty('--strike', s1); rows[0].style.setProperty('--dim', s1);
        rows[1].style.setProperty('--strike', s2); rows[1].style.setProperty('--dim', s2);
        rows[2].style.setProperty('--lit', lit);
        copy.style.opacity = cp; copy.style.transform = 'translateY(' + (1 - cp) * 24 + 'px)';
      }
    });
  }

  /* ---- テクノロジー ------------------------------------------------------ */
  if ($('[data-tech]')) {
    // スクロール量 → 繊維の状態。各状態で一度止まるように区間を切る
    var KEYS = [[0, 0], [0.1, 0], [0.3, 1], [0.4, 1], [0.6, 2], [0.7, 2], [0.88, 3], [1, 3]];
    var STEP_AT = [0, 0.1, 0.4, 0.7];
    var mapTech = function (p) {
      for (var i = 1; i < KEYS.length; i++) {
        if (p <= KEYS[i][0]) {
          var a = KEYS[i - 1], b = KEYS[i], t = (p - a[0]) / (b[0] - a[0] || 1);
          return a[1] + (b[1] - a[1]) * t;
        }
      }
      return 3;
    };
    var steps = $$('[data-step]'), bar = $('[data-tech-bar]'), activeStep = 0;
    ScrollTrigger.create({
      trigger: '[data-tech]', start: 'top top', end: 'bottom bottom', scrub: true,
      onUpdate: function (self) {
        var p = self.progress, idx = 0;
        if (fields.tech) fields.tech.setProgress(mapTech(p));
        for (var i = 0; i < STEP_AT.length; i++) if (p >= STEP_AT[i]) idx = i;
        if (idx !== activeStep) {
          steps[activeStep].classList.remove('is-active');
          steps[idx].classList.add('is-active');
          activeStep = idx;
        }
        bar.style.transform = 'scaleX(' + p + ')';
      }
    });
    gsap.to('.tech__bgword', { xPercent: -14, ease: 'none', scrollTrigger: { trigger: '[data-tech]', start: 'top top', end: 'bottom bottom', scrub: true } });
  }

  /* ---- 機能性: 数字のカウントアップと棒 ------------------------------------ */
  $$('[data-metric]').forEach(function (m) {
    var b = $('[data-count]', m), to = parseFloat(b.dataset.count), dec = parseInt(b.dataset.dec, 10) || 0, o = { v: 0 };
    b.textContent = (0).toFixed(dec);
    ScrollTrigger.create({
      trigger: m, start: 'top 72%', once: true,
      onEnter: function () {
        m.classList.add('is-in');
        gsap.to(o, { v: to, duration: 1.8, ease: 'power3.out', onUpdate: function () { b.textContent = o.v.toFixed(dec); } });
      }
    });
    gsap.from($('.metric__num', m), { opacity: 0, x: -60, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: m, start: 'top 80%' } });
  });

  /* ---- 全面の写真帯: ゆっくりずれる ---------------------------------------- */
  $$('[data-band]').forEach(function (b) {
    gsap.fromTo($('img', b), { yPercent: -16 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: b, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  /* ---- 最後の巨大ロゴ --------------------------------------------------- */
  $$('[data-word]').forEach(function (w) {
    gsap.from(w, { yPercent: 55, ease: 'none', scrollTrigger: { trigger: w.closest('.sec'), start: 'top 60%', end: 'bottom bottom', scrub: true } });
  });

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
