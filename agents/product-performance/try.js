/* "Try it" steps above each demo: no overlay, nothing to read first. Each step runs its own action
   and ticks itself off however the visitor gets there. Step 3 opens the Feedback review and, on a wide
   screen, the chat beside it with 👍/👎 highlighted: rate on the right and the review on the left updates
   at once ("from you"). Close either first. On a narrow screen the review comes first, then the chat
   opens at the unrated answer. A rating from the "ask, then rate" step opens the review too: beside the chat on a
   wide screen, full screen (chat closed) on a narrow one. Pages pass their own step 1 and "ask" actions. */
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
      if (b && !b.classList.contains('done')) { b.classList.add('done'); b.querySelector('i').textContent = '✓'; b.classList.remove('try-next'); b.querySelectorAll('.try-tag').forEach(t => t.remove()); }
    };
    const openReview = () => { const b = q('[data-fbr-open]'); if (b) b.click(); };
    let hint = false, followed = false;
    const html = document.documentElement;
    const wide = () => innerWidth >= 1200;
    const duo = () => html.classList.contains('try-duo');
    const unrated = () => [...chat.querySelectorAll('.ppa-fb')].pop();
    const pulseFb = fb => { fb.scrollIntoView({ block: 'center', behavior: smooth }); fb.classList.remove('try-pulse'); void fb.offsetWidth; fb.classList.add('try-pulse'); };
    const hasMine = sc => !!sc.querySelector('.fbr-r.you') || /from you/.test(sc.textContent);
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
        if (isOpen()) {   // wait until the chat is closed too; after the review on a narrow screen, point at the answer
          const fb = p === '3' && !followed && unrated();
          if (fb) { followed = true; pulseFb(fb); }
          pending = p; return;
        }
        const fb = p === '3' && !followed && unrated();
        if (fb) {   // narrow screens: after the review, invite the optional rating right where it happens
          followed = true; pending = p;
          await openChat(); pulseFb(fb);
          return;
        }
        list.scrollIntoView({ block: 'center', behavior: smooth });
        const nx = list.querySelector('[data-step]:not(.done)');
        if (!nx) return;
        setNext(nx);
        nx.focus({ preventScroll: true });
      }, 250);
    };
    // on arrival, highlight step 1 as soon as the steps are on screen
    const hl = () => { const nx = list.querySelector('[data-step]:not(.done)'); if (nx && !list.querySelector('.try-next')) setNext(nx); };
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); hl(); } }, { threshold: 0.5 }); io.observe(list.querySelector('[data-step]') || list); } else hl();   // step 1 on screen is enough (the stacked row is taller than a phone)
    // first agent page opened in this tab: dim everything but the steps for a moment — once for the whole site. Not a gate — any click,
    // scroll or key lifts it, and a click on a step still runs that step. ?spot shows it again for review.
    const spotKey = 'trySpot';
    let spotSeen = false; try { spotSeen = !!sessionStorage.getItem(spotKey); sessionStorage.setItem(spotKey, '1'); } catch (e) {}
    if (!spotSeen || /[?&]spot\b/.test(location.search)) {
      hl();
      const veil = document.createElement('div'); veil.className = 'try-veil'; veil.setAttribute('aria-hidden', 'true');
      const cap = document.createElement('div'); cap.className = 'try-cap'; cap.setAttribute('role', 'note');
      cap.innerHTML = '<b>New here? Start with step 1</b> — about 30 seconds. Or click anywhere to explore on your own.';
      const place = () => {   // below the row on wide screens; above it when the steps stack (step 3 is off-screen on a phone)
        const b = list.getBoundingClientRect(), stacked = getComputedStyle(list).gridTemplateColumns.split(' ').length < 2;
        cap.style.top = (stacked ? b.top + scrollY - cap.offsetHeight - 18 : b.bottom + scrollY + 12) + 'px'; cap.style.left = (b.left + scrollX) + 'px';
      };
      document.body.append(veil, cap);
      // scroll only if step 1 isn't fully on screen; when the caption sits above the steps, leave room for it
      const first = list.querySelector('[data-step]'), r = first.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight - 60) {
        const stacked = getComputedStyle(list).gridTemplateColumns.split(' ').length < 2;
        scrollTo({ top: list.getBoundingClientRect().top + scrollY - (stacked ? cap.offsetHeight + 40 : 24), behavior: 'auto' });
      }
      place(); html.classList.add('try-spot');
      requestAnimationFrame(() => { veil.classList.add('on'); cap.classList.add('on'); });
      const evs = ['pointerdown', 'keydown', 'wheel', 'touchmove'];
      const lift = () => {
        evs.forEach(t => removeEventListener(t, lift, true)); removeEventListener('resize', place);
        veil.classList.remove('on'); cap.classList.remove('on');
        setTimeout(() => { veil.remove(); cap.remove(); html.classList.remove('try-spot'); }, 260);
      };
      setTimeout(() => evs.forEach(t => addEventListener(t, lift, { capture: true, passive: true })), 300);
      addEventListener('resize', place);
    }
    new MutationObserver(back).observe(chat, { attributes: true, attributeFilter: ['class'] });
    root.querySelectorAll('.ins-modal').forEach(m => new MutationObserver(() => { if (m.hidden) back(); }).observe(m, { attributes: true, attributeFilter: ['hidden'] }));

    const run = {
      1: async () => { await closeChat(); await cfg.one(ctx); },
      2: async () => {   // ask, then point at 👍/👎; the rating opens the owner's review
        if (!cfg.rateReview) return cfg.ask(ctx);
        rateFlow = true; await cfg.ask(ctx);
        for (let t = 0; t < 80 && !unrated(); t++) await wait(150);
        const fb = unrated(); if (fb) { await wait(300); followed = true; pulseFb(fb); }
      },
      inv: () => cfg.inv(ctx),
      3: async () => {   // the review opens at once; an answer to rate is asked for in the background if needed
        hint = true; followed = false;
        const need = !unrated();
        if (wide()) html.classList.add('try-duo'); else await closeChat();
        openReview(); mark(3);
        if (need) { await cfg.ask(ctx); for (let t = 0; t < 80 && !unrated(); t++) await wait(150); }
        else if (wide()) await openChat();
        if (wide()) { followed = true; const fb = unrated(); if (fb) { await wait(200); pulseFb(fb); } }
      }
    };

    let rateFlow = false;
    // Approve / Dismiss ends the agent run: close it and point at the next step
    root.addEventListener('click', e => {
      if (!cfg.inv || !e.target.closest('.ppa-rec [data-dec]')) return;
      mark('inv');
      pending = 'inv'; closeChat();
    }, true);   // capture: the run replaces the buttons on click
    // a rating from step 3 opens the feedback review next to the chat, with "from you" in it
    root.addEventListener('click', e => {
      if (!rateFlow || !e.target.closest('.ppa-fb [data-rate]')) return;
      rateFlow = false;
      setTimeout(async () => {
        hint = true;
        if (wide()) { html.classList.add('try-duo'); openReview(); return; }
        // narrow screens: no room side by side, so close the chat and open the review full screen, "from you" in it.
        // Hold the step's "back to the steps" while the chat closes, so it waits for the review instead.
        const p = pending; pending = null;
        await closeChat(); openReview();
        pending = p;
      }, 900);
    }, true);
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      clearNext(); pending = null;   // a new step cancels the previous step's "back to the steps"
      root.scrollIntoView({ block: 'start', behavior: smooth });
      const s = b.dataset.step, fn = run[s] || (cfg.steps && cfg.steps[s] && (() => cfg.steps[s](ctx)));
      if (!fn) return;
      Promise.resolve(fn()).then(() => setTimeout(() => {
        pending = s;
        // a step that stays on the page (a tab, a draft) opens nothing to close: tick it and point at the next step now
        if (cfg.rateReview && !isOpen() && ![...root.querySelectorAll('.ins-modal')].some(m => !m.hidden)) {
          pending = null; mark(s); const nx = list.querySelector('[data-step]:not(.done)'); if (nx) setNext(nx);
        }
      }, 400));
    });
    // tick steps 1–2 off whichever way the visitor gets there
    document.addEventListener('click', e => {
      Object.entries(cfg.done).forEach(([n, sel]) => { if (e.target.closest(sel)) mark(n); });
    }, true);
    // step 3 = seeing the feedback review, however it was opened
    document.addEventListener('click', e => { if (e.target.closest('[data-fbr-open], [data-fbr]')) mark(3); }, true);
    // when step 3 opened the review, keep a one-line hint at its top (the review re-renders on every decision)
    root.querySelectorAll('.ins-modal').forEach(m => {
      const sc = m.querySelector('.ins-scroll'); if (!sc) return;
      const put = () => {
        if (!hint || m.hidden || !sc.querySelector('.fbr') || sc.querySelector('.try-hint')) return;
        const txt = hasMine(sc) ? '<b>Your rating is in.</b> It now counts in this week\'s review — see "from you" below.'
          : duo() ? '<b>This is what the owner sees each week.</b> Rate the answer on the right with 👍 / 👎 — it shows up here as "from you".'
          : '<b>This is what the owner sees each week.</b> Close it and rate the answer in the chat with 👍 / 👎 — it shows up here as "from you".';
        sc.insertAdjacentHTML('afterbegin', `<div class="try-hint">${txt}</div>`);
        if (hasMine(sc)) sc.querySelectorAll('.fbr-sig > div, .fbr-r.you').forEach(x => { if (/from you/.test(x.textContent) || x.classList.contains('you')) x.classList.add('try-flash'); });
      };
      new MutationObserver(put).observe(sc, { childList: true });
      new MutationObserver(() => { if (m.hidden) { hint = false; html.classList.remove('try-duo'); } else put(); }).observe(m, { attributes: true, attributeFilter: ['hidden'] });
      // side by side, Tab moves between the review and the chat: each page's dialog focus loop includes the chat when html.try-duo is set
    });
    // side by side: a rating on the right refreshes the review on the left at once
    let fbN = 0;
    new MutationObserver(() => {
      const n = chat.querySelectorAll('.ppa-fbdone').length;
      if (n > fbN && duo() && [...root.querySelectorAll('.ins-modal')].some(m => !m.hidden)) { const y = document.activeElement; openReview(); if (y && y.isConnected) y.focus({ preventScroll: true }); }
      fbN = n;
    }).observe(chat, { childList: true, subtree: true });
  };
})();
