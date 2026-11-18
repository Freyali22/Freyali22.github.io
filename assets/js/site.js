// Shared behaviour: nav scroll-spy, copy email, chat replay, terminal replay.
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // nav: highlight the section in view (homepage only — links that point to #ids on this page)
  const links = [...document.querySelectorAll('nav a[href^="#"]')];
  const secs = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (secs.length === links.length && links.length) {
    const spy = () => {
      const y = scrollY + innerHeight * 0.35;
      let cur = secs[0];
      secs.forEach(s => { if (s.offsetTop <= y) cur = s; });
      if (innerHeight + scrollY >= document.body.scrollHeight - 4) cur = secs[secs.length - 1];
      links.forEach((a, i) => a.classList.toggle('active', secs[i] === cur));
    };
    addEventListener('scroll', spy, { passive: true });
    spy();
    window.__spy = spy;
  }

  // copy email
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard && navigator.clipboard.writeText(btn.dataset.copy);
      const lab = btn.querySelector('em') || btn;
      if (lab) { lab.textContent = 'Copied'; setTimeout(() => (lab.textContent = 'Copy'), 1600); }
    });
  });

  // terminal replay: <div class="term" data-term> ... .ln lines ... <button data-replay>
  document.querySelectorAll('[data-term]').forEach(term => {
    const lines = [...term.querySelectorAll('.ln')];
    let timers = [];
    const play = () => {
      timers.forEach(clearTimeout); timers = [];
      lines.forEach(l => l.classList.remove('on'));
      if (reduce) { lines.forEach(l => l.classList.add('on')); return; }
      let t = 400;
      lines.forEach(l => { timers.push(setTimeout(() => l.classList.add('on'), t)); t += l.classList.contains('t-ans') ? 1000 : 520; });
    };
    const btn = term.querySelector('[data-replay]');
    if (btn) btn.addEventListener('click', play);
    // start when visible
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { play(); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(term);
  });

  // chat replay. Usage: makeChat(rootEl, () => [{q, a, src}])  — answers are pre-recorded.
  window.makeChat = function (root, getScript) {
    const log = root.querySelector('.log');
    const sug = root.querySelector('.suggest');
    const render = () => {
      sug.innerHTML = '';
      getScript().forEach((item, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = item.q;
        b.addEventListener('click', () => ask(item, b));
        sug.appendChild(b);
      });
    };
    const ask = (item, btn) => {
      const h = log.querySelector('.typing'); if (h) h.remove();
      sug.querySelectorAll('button').forEach(b => (b.disabled = true));
      const q = document.createElement('div'); q.className = 'q'; q.textContent = item.q; log.appendChild(q);
      const a = document.createElement('div'); a.className = 'a'; log.appendChild(a);
      const words = item.a.split(' ');
      let i = 0;
      const step = () => {
        if (reduce) { a.textContent = item.a; return done(); }
        a.textContent = words.slice(0, ++i).join(' ');
        if (i < words.length) setTimeout(step, 35); else done();
      };
      const done = () => {
        if (item.src) { const s = document.createElement('div'); s.className = 'src'; s.textContent = item.src; log.appendChild(s); }
        btn.dataset.asked = '1';
        sug.querySelectorAll('button').forEach(b => (b.disabled = b.dataset.asked === '1'));
      };
      setTimeout(step, reduce ? 0 : 350);
    };
    const hint = () => { log.innerHTML = '<div class="typing">Pick a question below to see how the agent answers.</div>'; };
    root.reset = () => { hint(); render(); };
    hint();
    render();
    return root;
  };
})();
