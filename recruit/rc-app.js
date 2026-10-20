/*
  KAPOK JAPAN 採用LP の動き。boot.js が本文を差し込んだあと RCLP.mount(root) を呼ぶ。
  Studio のページ切り替え（再読み込みなし）で何度も呼ばれる前提で、毎回 root の中だけを相手にする。
  - ふわっと出る（[data-rise]）
  - ページ内リンク（#rc-form は Studio の応募フォームへ）
  - 職種の「この職種で応募する」→ フォームの希望職種を選んでから移動
  - 開閉（details）をなめらかに
  - 応募フォームへの固定ボタン（ヒーローを過ぎたら出す・フォームが見えたら隠す）
*/
(function () {
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function studioForm() { return document.querySelector('#__nuxt form'); }

  // 移動中に文字や写真の読み込みでページの高さが変わっても行き先がずれないよう、毎フレーム行き先を測り直す。
  // 触ったりホイールを回したりしたら、そこで止める。
  var cancelScroll = null;
  function scrollToEl(el, offset) {
    var off = offset == null ? 24 : offset;
    function target() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(max, el.getBoundingClientRect().top + window.pageYOffset - off));
    }
    if (cancelScroll) cancelScroll();
    var html = document.documentElement, prev = html.style.scrollBehavior;
    if (reduce) { html.style.scrollBehavior = 'auto'; window.scrollTo(0, target()); html.style.scrollBehavior = prev; return; }
    var start = window.pageYOffset, t0 = null, dur = Math.min(1200, 450 + Math.abs(target() - start) * 0.12), live = true;
    function stop() {
      live = false; cancelScroll = null; html.style.scrollBehavior = prev;
      ['wheel', 'touchstart', 'keydown'].forEach(function (t) { window.removeEventListener(t, stop); });
    }
    ['wheel', 'touchstart', 'keydown'].forEach(function (t) { window.addEventListener(t, stop, { passive: true }); });
    cancelScroll = stop;
    html.style.scrollBehavior = 'auto'; // サイト側の「なめらかスクロール」と二重にならないように
    function step(now) {
      if (!live) return;
      if (t0 == null) t0 = now;
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      window.scrollTo(0, start + (target() - start) * e);
      if (p < 1) requestAnimationFrame(step); else stop();
    }
    requestAnimationFrame(step);
  }
  function goForm() {
    var f = studioForm();
    if (f) scrollToEl(f, 120);
  }

  // 希望職種（ラジオ）を選ぶ。候補は「|」区切りで、完全一致 → 部分一致の順に探す。選べなければ何もしない
  function pickJob(cands) {
    var f = studioForm();
    if (!f) return false;
    var radios = Array.prototype.slice.call(f.querySelectorAll('input[type="radio"]'));
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var hit = radios.filter(function (r) { return r.value === c; })[0] || radios.filter(function (r) { return r.value.indexOf(c) >= 0; })[0];
      if (hit) {
        if (!hit.checked) hit.click(); // Studio（Vue）側の値も更新されるよう、クリックとして選ぶ
        return true;
      }
    }
    return false;
  }

  function rise(root) {
    var items = root.querySelectorAll('[data-rise]');
    if (reduce || !('IntersectionObserver' in window)) return;
    root.classList.add('is-ready');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        // 同じ行に並ぶものは少しずつ遅らせる
        var sibs = el.parentElement ? Array.prototype.filter.call(el.parentElement.children, function (x) { return x.hasAttribute('data-rise'); }) : [];
        var idx = Math.max(0, sibs.indexOf(el));
        el.style.transitionDelay = Math.min(idx, 5) * 70 + 'ms';
        el.classList.add('is-in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }

  function accordions(root) {
    Array.prototype.forEach.call(root.querySelectorAll('details.rc-acc'), function (d) {
      var s = d.querySelector('summary');
      var body = d.querySelector('.rc-acc__body');
      if (!s || !body || !body.animate) return;
      var busy = false;
      s.addEventListener('click', function (e) {
        if (reduce) return;
        e.preventDefault();
        if (busy) return;
        busy = true;
        if (d.open) {
          var h = body.offsetHeight;
          var a = body.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 260, easing: 'ease' });
          a.onfinish = function () { d.open = false; busy = false; };
        } else {
          d.open = true;
          var h2 = body.offsetHeight;
          var b = body.animate([{ height: '0px', opacity: 0 }, { height: h2 + 'px', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.2,.7,.2,1)' });
          b.onfinish = function () { busy = false; };
        }
      });
    });
  }

  function links(root) {
    root.addEventListener('click', function (e) {
      var apply = e.target.closest('[data-apply]');
      if (apply) {
        e.preventDefault();
        pickJob(apply.getAttribute('data-apply').split('|'));
        goForm();
        return;
      }
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (id === 'rc-form') {
        if (studioForm()) { e.preventDefault(); goForm(); }
        return;
      }
      var el = id && root.querySelector('#' + id);
      if (el) { e.preventDefault(); scrollToEl(el, 0); }
    });
  }

  // 固定ボタンは body 直下に1つだけ作る（Studio の箱の中だと、親の設定次第で固定が効かないことがあるため）
  var fab = null, state = { pastHero: false, formSeen: false }, watchers = [];
  function fabUpdate() { if (fab) fab.classList.toggle('is-show', state.pastHero && !state.formSeen); }
  function ensureFab() {
    if (fab && fab.isConnected) return fab;
    fab = document.getElementById('rc-fab');
    if (!fab) {
      fab = document.createElement('a');
      fab.id = 'rc-fab';
      fab.href = '#rc-form';
      fab.textContent = '応募フォームへ';
      fab.addEventListener('click', function (e) { e.preventDefault(); goForm(); });
      document.body.appendChild(fab);
    }
    return fab;
  }
  function floatingButton(root) {
    if (!('IntersectionObserver' in window)) return;
    ensureFab();
    // 前に採用ページを開いたときの見張りは外す（ページを出入りするたびに mount が呼ばれる）
    watchers.forEach(function (w) { w.disconnect(); });
    watchers = [];
    state.pastHero = false; state.formSeen = false; fabUpdate();
    var hero = root.querySelector('.rc-hero');
    if (hero) {
      var ho = new IntersectionObserver(function (es) {
        es.forEach(function (e) { state.pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; });
        fabUpdate();
      });
      ho.observe(hero);
      watchers.push(ho);
    }
    // 応募フォームと、その直前の ENTRY の帯が見えている間は隠す
    var watch = [root.querySelector('.rc-entry'), studioForm()].filter(Boolean);
    var seen = new Set();
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
      state.formSeen = seen.size > 0;
      fabUpdate();
    });
    watch.forEach(function (el) { io.observe(el); });
    watchers.push(io);
  }

  function mount(root) {
    if (!root || root.__rcMounted) return;
    root.__rcMounted = true;
    rise(root);
    accordions(root);
    links(root);
    floatingButton(root);
  }

  window.RCLP = { mount: mount, pickJob: pickJob };
})();
