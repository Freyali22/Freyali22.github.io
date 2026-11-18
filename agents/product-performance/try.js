/* "Try it" steps above each demo: no overlay, nothing to read first. Each step runs its own action
   and ticks itself off however the visitor gets there. Step 3 points at 👍/👎; once a rating is
   logged it opens the Feedback review. Pages pass their own step 1 and "ask" actions. */
(() => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  window.TrySteps = cfg => {
    const list = document.querySelector('.try-steps'), root = document.querySelector(cfg.root);
    if (!list || !root) return;
    const q = s => root.querySelector(s), chat = q('.ppa-chat');
    const isOpen = () => chat.classList.contains('open');
    const openChat = async () => { if (!isOpen()) { q('[data-ask]').click(); await wait(350); } };
    const closeChat = async () => { if (isOpen()) { q('.ppa-x').click(); await wait(300); } };
    const ctx = { q, wait, openChat, closeChat };
    const mark = n => {
      const b = list.querySelector(`[data-step="${n}"]`);
      if (b && !b.classList.contains('done')) { b.classList.add('done'); b.querySelector('i').textContent = '✓'; }
    };
    const openReview = () => { const b = q('[data-fbr-open]'); if (b) b.click(); };
    let armed = false;
    // after a step's panel closes (Weekly Insights, chat, feedback review), bring the visitor back to the steps
    // and point at the next one — no scrolling back up by hand
    let pending = null;
    const clearNext = () => list.querySelectorAll('.try-next').forEach(x => { x.classList.remove('try-next'); x.querySelectorAll('.try-tag').forEach(t => t.remove()); });
    const setNext = nx => {   // white card + accent border pulse + "Start here" / "Next" tag + arrow nudge
      clearNext();
      nx.insertAdjacentHTML('afterbegin', `<span class="try-tag" aria-hidden="true">${list.querySelector('.done') ? 'Next' : 'Start here'}</span>`);
      void nx.offsetWidth; nx.classList.add('try-next');
    };
    const back = () => {
      if (!pending) return;
      const p = pending; pending = null;
      setTimeout(async () => {
        if ([...root.querySelectorAll('.ins-modal')].some(m => !m.hidden)) { pending = p; return; }
        if (isOpen()) { if (p !== '3') { pending = p; return; } await closeChat(); }   // last step: close the chat too
        list.scrollIntoView({ block: 'center', behavior: smooth });
        const nx = list.querySelector('[data-step]:not(.done)');
        if (!nx) return;
        setNext(nx);
        nx.focus({ preventScroll: true });
      }, 250);
    };
    // on arrival, highlight step 1 as soon as the steps are on screen
    const hl = () => { const nx = list.querySelector('[data-step]:not(.done)'); if (nx && !list.querySelector('.try-next')) setNext(nx); };
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); hl(); } }, { threshold: 0.5 }); io.observe(list); } else hl();
    new MutationObserver(back).observe(chat, { attributes: true, attributeFilter: ['class'] });
    root.querySelectorAll('.ins-modal').forEach(m => new MutationObserver(() => { if (m.hidden) back(); }).observe(m, { attributes: true, attributeFilter: ['hidden'] }));

    const run = {
      1: async () => { await closeChat(); await cfg.one(ctx); },
      2: () => cfg.ask(ctx),
      3: async () => {
        if (chat.querySelector('.ppa-fbdone') && !chat.querySelector('.ppa-fb')) { await openChat(); return openReview(); }
        armed = true;
        if (!chat.querySelector('.ppa-fb')) {
          await cfg.ask(ctx);
          for (let t = 0; t < 80 && !chat.querySelector('.ppa-fb'); t++) await wait(150);
        }
        await openChat();
        const fb = [...chat.querySelectorAll('.ppa-fb')].pop();
        if (!fb) return;
        fb.scrollIntoView({ block: 'center', behavior: smooth });
        fb.classList.remove('try-pulse'); void fb.offsetWidth; fb.classList.add('try-pulse');
      }
    };

    list.addEventListener('click', e => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      clearNext();
      root.scrollIntoView({ block: 'start', behavior: smooth });
      Promise.resolve(run[b.dataset.step]()).then(() => setTimeout(() => { pending = b.dataset.step; }, 400));
    });
    // tick steps 1–2 off whichever way the visitor gets there
    document.addEventListener('click', e => {
      Object.entries(cfg.done).forEach(([n, sel]) => { if (e.target.closest(sel)) mark(n); });
    }, true);
    // step 3 = a logged rating (👍, or 👎 + reason); after step 3 was clicked, show the owner's side
    new MutationObserver(() => {
      if (!chat.querySelector('.ppa-fbdone')) return;
      mark(3);
      if (armed) { armed = false; setTimeout(openReview, 700); }
    }).observe(chat, { childList: true, subtree: true });
  };
})();
