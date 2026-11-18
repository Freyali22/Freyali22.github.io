/* Guided tour, shared by every agent page.
   SiteTour.auto(root, steps, opts)  first visit only: starts once 35% of `root` (keep it short, e.g. the header) is on screen and opts.ready() is true
   SiteTour.start(steps, opts)       start now (the page's Tour button)
   step = { title, body, els: () => [Element, ...], before?: async () => {} }
   opts = { key?, ready?: () => bool, canStart?: () => bool, onEnd?: reason => {} } */
(function () {
  const keyOf = o => o.key || 'tour:' + location.pathname;
  const seen = o => { try { return localStorage.getItem(keyOf(o)) === 'done'; } catch (e) { return false; } };
  const mark = o => { try { localStorage.setItem(keyOf(o), 'done'); } catch (e) {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const still = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function union(els) {
    const rs = els.filter(Boolean).map(e => e.getBoundingClientRect()).filter(r => r.width || r.height);
    if (!rs.length) return null;
    const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top));
    const R = Math.max(...rs.map(r => r.right)), B = Math.max(...rs.map(r => r.bottom));
    return { left: l, top: t, right: R, bottom: B, width: R - l, height: B - t };
  }

  function start(steps, opts = {}) {
    if (document.querySelector('.tour')) return;
    let i = 0, busy = false, raf = 0;
    const back = document.activeElement;
    const el = document.createElement('div');
    el.className = 'tour';
    el.innerHTML = '<div class="tour-catch"></div><div class="tour-spot"></div>' +
      '<div class="tour-card fade" role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-b" tabindex="-1">' +
      '<div class="tour-k" aria-live="polite"></div><h3 id="tour-t"></h3><p id="tour-b"></p>' +
      '<div class="tour-f"><div class="tour-dots" aria-hidden="true">' + steps.map(() => '<i></i>').join('') + '</div>' +
      '<button type="button" class="tour-skip">Skip</button><button type="button" class="tour-back">Back</button>' +
      '<button type="button" class="tour-next">Next</button></div></div>';
    document.body.appendChild(el);
    const $ = s => el.querySelector(s);
    const spot = $('.tour-spot'), card = $('.tour-card');

    function place() {
      const r = union(steps[i].els()), pad = 6, m = 12, gap = 14, vw = innerWidth, vh = innerHeight;
      if (r) Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px',
        width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px', opacity: 1 });
      else spot.style.opacity = 0;
      const dock = vw < 640;
      card.classList.toggle('dock', dock);
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let x, y;
      if (dock) { x = m; y = r && r.top + r.height / 2 > vh / 2 ? m : vh - ch - m; }
      else if (!r) { x = (vw - cw) / 2; y = (vh - ch) / 2; }
      else {
        x = Math.min(Math.max(r.left + r.width / 2 - cw / 2, m), vw - cw - m);
        if (r.bottom + pad + gap + ch <= vh - m) y = r.bottom + pad + gap;
        else if (r.top - pad - gap - ch >= m) y = r.top - pad - gap - ch;
        else {
          y = Math.min(Math.max(r.top, m), vh - ch - m);
          x = r.left - pad - gap - cw >= m ? r.left - pad - gap - cw : Math.min(r.right + pad + gap, vw - cw - m);
        }
      }
      card.style.left = x + 'px'; card.style.top = y + 'px';
    }

    async function show(n) {
      if (busy) return;
      busy = true; i = n; delete el.dataset.ready;
      const s = steps[i];
      card.classList.add('fade');
      if (s.before) await s.before();
      // wait for the target to stop moving (drawers slide in) before measuring
      for (let t = 0, p = null; t < 24; t++) {
        const q = union(s.els());
        if (p && q && Math.abs(q.left - p.left) < 0.5 && Math.abs(q.top - p.top) < 0.5) break;
        p = q; await sleep(50);
      }
      const els = s.els(), r = union(els);
      if (r && els[0] && (r.top < 64 || r.bottom > innerHeight - 220)) {
        els[0].scrollIntoView({ block: 'center', behavior: still() ? 'auto' : 'smooth' });
        await sleep(still() ? 0 : 380);
      }
      $('.tour-k').textContent = (i + 1) + ' of ' + steps.length;
      $('#tour-t').textContent = s.title;
      if (s.html) $('#tour-b').innerHTML = s.html; else $('#tour-b').textContent = s.body; // html: trusted, page-authored copy only
      el.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
      const last = i === steps.length - 1;
      $('.tour-back').hidden = i === 0;
      $('.tour-skip').hidden = last;
      $('.tour-next').textContent = last ? 'Done' : 'Next';
      place();
      card.classList.remove('fade');
      $('.tour-next').focus();
      busy = false; el.dataset.ready = i + 1;
    }

    function end(reason) {
      mark(opts);
      document.removeEventListener('keydown', key, true);
      removeEventListener('resize', onMove); removeEventListener('scroll', onMove, true);
      el.remove();
      if (back && back.isConnected && back !== document.body) back.focus();
      if (opts.onEnd) opts.onEnd(reason);
    }
    const next = () => { if (busy) return; i < steps.length - 1 ? show(i + 1) : end('done'); };
    const prev = () => { if (!busy && i > 0) show(i - 1); };

    function key(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end('skip'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'Tab') {
        const f = [...card.querySelectorAll('button')].filter(b => !b.hidden);
        const k = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

    $('.tour-next').addEventListener('click', next);
    $('.tour-back').addEventListener('click', prev);
    $('.tour-skip').addEventListener('click', () => end('skip'));
    document.addEventListener('keydown', key, true);
    addEventListener('resize', onMove); addEventListener('scroll', onMove, true);
    show(0);
  }

  // First visit: never open the tour over the demo — just pulse the "Take the tour" button a few times.
  function auto(root, steps, opts = {}) {
    if (seen(opts) || !root) return;
    const go = async () => {
      for (let t = 0; t < 60 && opts.ready && !opts.ready(); t++) await sleep(150);
      await sleep(400);
      const b = opts.button || document.querySelector('[data-tour]');
      if (!b) return;
      b.classList.add('tour-hint');
      b.addEventListener('animationend', () => b.classList.remove('tour-hint'), { once: true });
    };
    if (!('IntersectionObserver' in window)) return go();
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); }
    }, { threshold: 0.35 });
    io.observe(root);
  }

  window.SiteTour = { start, auto, seen, reset: (o = {}) => { try { localStorage.removeItem(keyOf(o)); } catch (e) {} } };
})();
