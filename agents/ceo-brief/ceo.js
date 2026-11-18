/* CEO Morning Brief demo — fictional brand, synthetic data.
   One engine (sums over day x brand x region) feeds every tab: the Sales read, the
   schedule's "Numbers to bring", the news "Why it matters" lines and the chatbot. */
(function () {
  'use strict';
  const root = document.getElementById('ceo');
  if (!root) return;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const BASE = root.dataset.base || '.';
  const M = '−';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REGIONS = ['North America', 'Europe', 'Asia Pacific', 'Japan'];
  const BRANDS = ['Studio', 'Outlet'];
  const FLOOR = 0.70, MATERIAL = 25000; // a region-day is "behind" below 70% of its own normal TY/LY ratio and $25K short
  let D, N, flags, asOf;
  const st = { tab: 'sched', tf: 'mtd', brand: 'all', region: 'all', day: 0 };

  // ---------------------------------------------------------------- format
  const pct = (x, d = 1) => (x == null || !isFinite(x) ? '–' : (Math.abs(x) < 0.05 ? '0.0' : (x > 0 ? '+' : M) + Math.abs(x).toFixed(d)) + '%');
  const pts = x => (Math.abs(x) < 0.05 ? '0.0' : (x > 0 ? '+' : M) + Math.abs(x).toFixed(1)) + ' pts';
  const ppt = x => (Math.abs(x) < 0.05 ? '0.0' : (x > 0 ? '+' : M) + Math.abs(x).toFixed(1)) + ' pt';
  const money = x => (Math.abs(x) >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'M' : '$' + Math.round(x / 1e3) + 'K');
  const kfmt = x => (x / 1e3).toFixed(1) + 'K';
  const cls = x => (x >= 0.05 ? 'up' : x <= -0.05 ? 'dn' : '');
  const gr = (t, l) => (l ? (t / l - 1) * 100 : null);
  const dt = i => new Date(D.days[i] + 'T12:00:00');
  const dlabel = i => dt(i).toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + (dt(i).getMonth() + 1) + '/' + dt(i).getDate();
  const monthName = i => dt(i).toLocaleDateString('en-US', { month: 'long' });

  // ---------------------------------------------------------------- freshness (load-lag flags)
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  function computeFlags() {
    const out = [];
    D.rows.forEach((r, ri) => {
      const ratio = r.sales.map(([t, l]) => t / l);
      ratio.forEach((x, i) => {
        const typical = median(ratio.filter((_, j) => j !== i)), short = typical * r.sales[i][1] - r.sales[i][0];
        if (x < FLOOR * typical && short > MATERIAL) out.push({ i, ri, region: r.region, brand: r.brand, of: x / typical, short });
      });
    });
    let a = N - 1;
    while (a > 0 && out.some(f => f.i === a)) a--;
    return { all: out, asOf: a, weak: out.filter(f => f.i <= a), lag: out.filter(f => f.i > a) };
  }

  // ---------------------------------------------------------------- engine
  const inScope = (r, sc) => (sc.brand === 'all' || r.brand === sc.brand) && (sc.region === 'all' || r.region === sc.region);
  const mStart = i => { const m = D.days.indexOf(D.m_start); return i >= m ? m : 0; };
  function win(tf, e) { return [tf === 'day' ? e : tf === 'mtd' ? mStart(e) : 0, e]; }
  function sum(rows, key, a, b) { let t = 0, l = 0; rows.forEach(r => { for (let i = a; i <= b; i++) { t += r[key][i][0]; l += r[key][i][1]; } }); return [t, l]; }
  function localGrowth(rows, a, b) {
    const jp = rows.filter(r => D.fx[r.region]);
    if (!jp.length) return null;
    const [t, l] = sum(jp, 'sales', a, b), fx = D.fx[jp[0].region];
    return gr(t * fx.ty, l * fx.ly);
  }
  function view(sc) {
    const e = Math.min(sc.day, asOf), [a, b] = win(sc.tf, e);
    const rows = D.rows.filter(r => inScope(r, sc));
    const [t, l] = sum(rows, 'sales', a, b), [ct, cl] = sum(rows, 'comp', a, b), [gt, gl] = sum(rows, 'gm', a, b);
    const [nt, nl] = sum(rows, 'new', a, b), [zt] = sum(rows, 'genz', a, b);
    const node = rs => { const [x, y] = sum(rs, 'sales', a, b); return { t: x, l: y, g: gr(x, y), c: (x - y) / l * 100, local: localGrowth(rs, a, b) }; };
    const brands = BRANDS.filter(br => rows.some(r => r.brand === br)).map(br => ({ name: br, ...node(rows.filter(r => r.brand === br)),
      regions: REGIONS.map(rg => rows.filter(r => r.brand === br && r.region === rg)).filter(rs => rs.length).map(rs => ({ name: rs[0].region, ...node(rs) })) }));
    const regions = REGIONS.map(rg => rows.filter(r => r.region === rg)).filter(rs => rs.length).map(rs => ({ name: rs[0].region, ...node(rs) }));
    return { sc, e, a, b, rows, t, l, g: gr(t, l), comp: gr(ct, cl), gm: gt / t * 100, gmLy: gl / l * 100, newT: nt, newG: gr(nt, nl), genzShare: zt / nt * 100,
      brands, regions, local: localGrowth(rows, a, b), weekly: weekly(sc) };
  }
  function weekly(sc) {
    const rows = D.weekly.rows.filter(r => inScope(r, sc)), add = (o, k, v) => { o[k] = o[k] || [0, 0]; o[k][0] += v[0]; o[k][1] += v[1]; };
    const cat = {}, hero = {}, nd = [0, 0], gz = [0, 0];
    rows.forEach(r => { Object.entries(r.cat).forEach(([k, v]) => add(cat, k, v)); Object.entries(r.hero).forEach(([k, v]) => add(hero, k, v));
      nd[0] += r.new_demand[0]; nd[1] += r.new_demand[1]; gz[0] += r.genz_new_demand[0]; gz[1] += r.genz_new_demand[1]; });
    const T = Object.values(cat).reduce((s, v) => s + v[0], 0), L = Object.values(cat).reduce((s, v) => s + v[1], 0);
    const cats = Object.entries(cat).map(([name, [t, l]]) => ({ name, t, l, g: gr(t, l), c: (t - l) / L * 100 }));
    const heroes = Object.entries(hero).map(([name, [t, l]]) => ({ name, t, l, g: gr(t, l), share: t / T * 100 }));
    const by = (arr, k) => [...arr].sort((x, y) => y[k] - x[k]);
    return { cats, heroes, fastest: by(cats, 'g')[0], most: by(cats, 'c')[0], drag: by(cats, 'g')[cats.length - 1],
      newG: gr(nd[0], nd[1]), newShare: nd[0] / T * 100, genzG: gr(gz[0], gz[1]) };
  }
  const scopeName = sc => sc.brand === 'all' && sc.region === 'all' ? D.brand : [sc.brand === 'all' ? '' : sc.brand, sc.region === 'all' ? '' : sc.region].filter(Boolean).join(' ');
  const andList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

  // ---------------------------------------------------------------- the read (rules, no LLM; pinned to month to date)
  function theRead(sc) {
    const v = view({ ...sc, tf: 'mtd' }), mon = monthName(v.e), who = scopeName(sc);
    const s = x => `<span class="${cls(x)}">${pct(x)}</span>`, p = x => `<span class="${cls(x)}">${pts(x)}</span>`;
    const lead = Math.abs(v.g) < 0.5 ? `<p>${esc(who)} booked <b>${money(v.t)}</b> in ${mon} to date — in line with last year (${s(v.g)}), comp ${s(v.comp)}.</p>`
      : `<p>${esc(who)} booked <b>${money(v.t)}</b> in ${mon} to date — ${s(v.g)} on last year, comp ${s(v.comp)}.</p>`;
    let second = '';
    if (v.regions.length > 1) {
      const pos = v.regions.filter(r => r.c > 0).sort((x, y) => y.c - x.c), neg = v.regions.filter(r => r.c < 0).sort((x, y) => x.c - y.c);
      const posSum = pos.reduce((q, r) => q + r.c, 0), named = [];
      for (const r of pos) { if (named.length === 2 || named.reduce((q, x) => q + x.c, 0) >= 0.8 * posSum) break; named.push(r); }
      const rest = pos.slice(named.length);
      const carry = named.length ? `Growth is carried by ${andList(named.map(r => `${esc(r.name)} ${p(r.c)}`))}${rest.length === 1 ? `, with ${esc(rest[0].name)} adding ${p(rest[0].c)}` : rest.length ? `, with ${rest.length} smaller regions adding ${p(rest.reduce((q, r) => q + r.c, 0))}` : ''} of the ${sc.region === 'all' && sc.brand === 'all' ? "company's" : 'total'} ${s(v.g)}` : 'No region is growing on last year';
      const drag = !neg.length ? '; no region is behind last year.' : neg.length === 1 ? `; ${esc(neg[0].name)} is the only drag, ${p(neg[0].c)}.` : `; the drag is ${andList(neg.map(r => `${esc(r.name)} ${p(r.c)}`))}.`;
      second = `<p>${carry}${drag}</p>`;
    } else if (v.local != null) {
      second = `<p>In local currency ${esc(v.regions[0].name)} is ${s(v.local)} — the gap to the dollar figure is currency.</p>`;
    }
    const lis = [];
    if (v.brands.length > 1) lis.push(`<li><b>Brand</b> — ${v.brands.map((b, k) => `${b.name} ${s(b.g)} ${b.c >= 0 ? 'adds' : 'takes off'} ${Math.abs(b.c).toFixed(1)}${k ? '' : ` of the ${Math.abs(v.g).toFixed(1)} points`}`).join('; ')}.</li>`);
    if (v.regions.length > 1) {
      const fast = [...v.regions].sort((x, y) => y.g - x.g)[0], behind = v.regions.filter(r => r.g < 0);
      lis.push(`<li><b>Region</b> — ${esc(fast.name)} is the fastest-growing region, ${s(fast.g)}${behind.length ? `; ${andList(behind.map(r => `${esc(r.name)} ${s(r.g)}${r.local != null ? ` (${s(r.local)} in local currency)` : ''}`))} ${behind.length > 1 ? 'are' : 'is the only one'} behind` : ''}.</li>`);
    }
    return { html: `<h5>The read · ${mon} to date</h5>${lead}${second}${lis.length ? `<div class="why">What drives it</div><ul>${lis.join('')}</ul>` : ''}`, v };
  }

  // ---------------------------------------------------------------- facts the other tabs quote (company, month to date, as of)
  function facts() {
    const v = view({ tf: 'mtd', brand: 'all', region: 'all', day: N - 1 }), R = {}, B = {};
    v.regions.forEach(r => (R[r.name] = r)); v.brands.forEach(b => (B[b.name] = b));
    const behind = v.regions.filter(r => r.g < 0), fast = [...v.regions].sort((x, y) => y.g - x.g)[0];
    const jp = R.Japan, w = v.weekly, outer = w.cats.find(c => c.name === 'Outerwear');
    const carry = [...v.regions].filter(r => r.c > 0).sort((x, y) => y.c - x.c).slice(0, 2).map(r => r.name);
    return { v, R, B, behind, fast, jp, w, outer, carry };
  }
  const b = x => `<b class="${cls(x)}">${pct(x)}</b>`;

  // ---------------------------------------------------------------- schedule (synthetic calendar + email; numbers from the engine)
  const P = {
    merch: ['SVP Merchandising', 'email thread, 6 replies', 'Mon 7:12 pm'], cfo: ['CFO', 'email', 'Mon 6:40 pm'],
    jp: ['Japan Region Lead', 'email + calendar update', 'Mon 9:58 pm'], eu: ['Europe Region Lead', 'email', 'Thu 11/12'],
    fin: ['VP Finance', 'email', 'Mon 5:05 pm'], chair: ['Board Chair', 'email', 'Fri 11/13'], dig: ['Digital Lead', 'email', 'Wed 11/11'],
  };
  function schedule(F) {
    const jpLine = `${b(F.jp.g)} month to date, but ${b(F.jp.local)} in local currency`;
    return {
      headline: `Two decisions close this week — the Outlet holiday markdown and the board outlook — and ${F.behind.length === 1 ? `${F.behind[0].name} is the one region behind last year` : `${andList(F.behind.map(r => r.name))} are behind last year`}.`,
      what: [
        { id: 'w1', html: `<b>Outlet holiday markdown is undecided.</b> Merchandising wants 30% on outerwear, Finance wants 25%; Black Friday signage locks Fri 11/20.`, from: P.merch,
          draft: ['SVP Merchandising', 'Re: Outlet holiday markdown', "Let's settle it at today's 2 pm review. Please bring the margin impact of both 25% and 30% so we can decide in the room."] },
        { id: 'w2', html: `<b>Board outlook is due this week.</b> The CFO needs your comments on page 4 by Thursday, and you promised the board chair the holiday outlook by Friday.`, from: P.cfo,
          draft: ['CFO', 'Re: Board deck — outlook page', 'Thanks — two comments on page 4. Lead with month-to-date growth vs last year, then show Japan in local currency so the currency effect is clear. Happy to review again Thursday morning.'] },
        { id: 'w3', html: `<b>Japan is the one region behind last year</b> — ${jpLine}. The Japan lead wants agreement on the Outlet store calendar this week.`, from: P.jp,
          draft: ['Japan Region Lead', 'Re: November and the Outlet calendar', '4:30 today works. Please bring the Outlet store calendar and your view on how much of the gap is currency.'] },
      ],
      actions: [
        { id: 'a1', hot: true, when: 'Today · before 2 pm', title: 'Decide the Outlet holiday markdown: 25% or 30%',
          body: 'Merchandising wants 30% to clear outerwear depth; Finance wants 25% to protect margin. Both bring scenarios to the 2 pm review.',
          rec: `Ask for the 25% case's margin impact before the meeting — it's missing from the pre-read.`, from: P.merch,
          draft: ['VP Finance', '25% markdown scenario', "Could you add the margin impact of the 25% case to the scenarios file before 2 pm? It's the one number we don't have yet."] },
        { id: 'a2', when: 'By Thursday', title: 'Comment on the board outlook page', body: 'The CFO shared page 4 of the board deck and asked for your edits on the holiday outlook framing.',
          rec: 'Approve with two edits: lead with growth vs last year, and show Japan in local currency.', from: P.cfo,
          draft: ['CFO', 'Re: Board deck — outlook page', 'Thanks — two comments on page 4. Lead with month-to-date growth vs last year, then show Japan in local currency so the currency effect is clear.'] },
        { id: 'a3', inferred: true, when: 'This week', title: 'Set up the Europe store-openings call', body: 'You offered the Europe lead a call on the spring openings "early this week". Nothing is on the calendar yet.',
          rec: "Offer Thursday 8 am — it's the only slot before the board deck locks.", from: P.eu,
          draft: ['Europe Region Lead', 'Store openings call', 'Sorry for the delay — does Thursday at 8 am New York time work for the spring openings call?'] },
      ],
      meetings: [
        { time: '9:30 am', dur: '45 min', title: 'Weekly leadership sync', body: 'Standing agenda; holiday readiness is the first item.', pill: ['solid', '2 files'], files: ['Holiday readiness.pptx', 'Ops dashboard'],
          bring: `Company ${b(F.v.g)} vs LY month to date, comp ${b(F.v.comp)}. ${andList(F.carry)} carry the growth.`, link: 'The read' },
        { time: '2:00 pm', dur: '1 hr', title: 'Holiday pricing review', decision: true, body: 'Merchandising and Finance each bring a markdown scenario for Outlet outerwear.', pill: ['warm', '1 file · gap'], files: ['Markdown scenarios.xlsx', 'no margin impact for the 25% case'],
          bring: `${F.w.fastest.name} is the fastest-growing category, ${b(F.w.fastest.g)} vs LY.<br>Outlet is ${b(F.B.Outlet.g)} vs LY, against Studio ${b(F.B.Studio.g)}.`, link: 'Insights summary' },
        { time: '4:30 pm', dur: '30 min', title: 'Japan check-in', tentative: true, body: 'The November gap and the Outlet store calendar.', pill: ['dash', 'no pre-read'], files: [],
          bring: `Japan is ${b(F.jp.g)} vs LY in dollars, but ${b(F.jp.local)} in local currency.<br>${F.jp && F.v.brands.map(br => { const r = br.regions.find(x => x.name === 'Japan'); return r ? `${br.name} Japan ${b(r.g)}` : ''; }).filter(Boolean).join(', ')}.`, link: 'Drill down' },
      ],
      commit: [
        { id: 'c1', age: '4 days', warm: true, text: "You told the board chair you'd share the holiday outlook by Friday. No draft is on file yet.", from: P.chair,
          draft: ['Board Chair', 'Re: Holiday outlook', 'A quick note that the holiday outlook will reach you Friday as promised, after the CFO and I finish the board page Thursday.'] },
        { id: 'c2', age: '6 days', text: 'You promised the Digital lead feedback on the checkout redesign "by end of last week".', from: P.dig,
          draft: ['Digital Lead', 'Re: Checkout redesign', 'Apologies for the delay. I like the one-page checkout; my one ask is to keep guest checkout as visible as sign-in. Happy to go ahead.'] },
      ],
      ahead: [['Wed 11/18', 'Japan store-calendar review · Q4 hiring sign-off'], ['Thu 11/19', 'Board outlook page due to the CFO', 'deadline'],
        ['Fri 11/20', 'Holiday outlook to the board chair · signage locks', 'promised'], ['Mon 11/23', 'Black Friday week starts — markdown goes live Fri', "needs today's decision"]],
    };
  }
  const RES_KEY = 'ceo:resolved:v1';
  const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const from = p => `<div class="from"><span class="av">${esc(p[0][0])}</span><b>${esc(p[0])}</b><span>${esc(p[1])} · ${esc(p[2])}</span></div>`;
  function tools(it) {
    const done = readLS(RES_KEY, []).includes(it.id), [to, subj, body] = it.draft;
    return `<div class="foot">${from(it.from)}<span class="btns"><button type="button" class="rsv dr" data-draft aria-expanded="false">Draft reply</button><button type="button" class="rsv" data-resolve="${it.id}" aria-pressed="${done}">${done ? '✓ Resolved' : '✓ Mark resolved'}</button></span></div>
      <div class="draft" hidden><div class="dh"><span><b>To ${esc(to)}</b> · <em>${esc(subj)}</em></span><span class="pl dash">Not sent</span></div><p>${esc(body)}</p>
      <div class="dbt"><button type="button" class="rsv ghost" data-copy>Copy draft</button><a class="rsv ghost" href="mailto:?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}">Open in email</a><span class="dnote">Nothing is sent from this page.</span></div></div>`;
  }
  const sec = (num, title, count, inner) => `<details class="sx" open><summary><i>${num}</i><b>${title}</b><span class="cnt">${count}</span></summary><div class="sxb">${inner}</div></details>`;
  function schedTab() {
    const S = schedule(facts()), done = readLS(RES_KEY, []);
    const ids = [...S.what, ...S.actions, ...S.commit].map(x => x.id), open = ids.filter(i => !done.includes(i)).length;
    const item = (it, inner) => `<div class="it${done.includes(it.id) ? ' done' : ''}" data-item="${it.id}">${inner}${tools(it)}</div>`;
    const what = `<div class="hlbox">${esc(S.headline)}</div><div class="items">${S.what.map(it => item(it, `<p>${it.html}</p>`)).join('')}</div>
      <details class="fn"><summary>How this was assembled, and what it cannot see</summary>Generated 6:05 am · Email reviewed: 64 messages since Fri 6 pm, 22 read in full · Calendar reviewed: 9 events, today + 4 business days · Limitations: attachments are listed, not read.</details>`;
    const acts = S.actions.map(a => `<div class="act${a.hot ? ' hot' : ''}${done.includes(a.id) ? ' done' : ''}" data-item="${a.id}"><div class="when">${esc(a.when)}${a.inferred ? ' <span class="pl gold">Inferred</span>' : ''}</div><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p><div class="rec">${esc(a.rec)}</div>${tools(a)}</div>`).join('');
    const mtgs = S.meetings.map(m => `<div class="tl"><div class="tm">${m.time}<small>${m.dur}</small></div><div class="mtg">
        <div class="t"><b>${esc(m.title)}${m.decision ? '<span class="dec">Decision</span>' : ''}${m.tentative ? ' <span class="pl gold">Tentative</span>' : ''}</b></div>
        <div class="ctx">${esc(m.body)}</div><div class="files"><span class="pl ${m.pill[0]}">${m.pill[1]}</span>${m.files.map(f => `<span>${esc(f)}</span>`).join('<span>·</span>')}</div>
        <div class="bring"><div class="h">✦ Numbers to bring</div>${m.bring}<div><a href="#" data-go="sales">From Sales → ${m.link}</a></div></div></div></div>`).join('') +
      '<p class="rolled">6 other events today are routine (1:1s, holds) and are left out.</p>';
    const commit = `<div class="items">${S.commit.map(c => item(c, `<p><span class="pl ${c.warm ? 'warm' : 'line'}">${c.age}</span> ${esc(c.text)}</p>`)).join('')}</div>`;
    const ahead = `<div class="ahead">${S.ahead.map(([d, t, f]) => `<div><div class="d">${d}</div><p>${esc(t)}</p>${f ? `<div class="flag"><span class="pl warm">${esc(f)}</span></div>` : ''}</div>`).join('')}</div>`;
    return `<div class="part">Part I · Five-minute brief <span>${new Date(D.brief_day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · <b data-open>${open}</b> open items</span></div>` +
      sec('01', 'What matters most', `${S.what.length} items · 64 messages reviewed`, what) +
      sec('02', 'Your actions', `${S.actions.length} · 1 due today`, acts) +
      sec('03', "Today's material meetings", `${S.meetings.length} · 1 with a named gap`, mtgs) +
      sec('04', 'Commitments at risk', String(S.commit.length), commit) +
      sec('05', 'Looking ahead', '4 business days · 3 carry flags', ahead) +
      '<div class="tabnote">Calendar, email and people here are synthetic. Nothing is sent from this page, and the chatbot never reads this tab.</div>';
  }

  // ---------------------------------------------------------------- sales tab
  function banner() {
    if (st.day <= asOf) return '';
    const lag = flags.lag.filter(f => f.i <= st.day), day = lag.length ? lag[lag.length - 1].i : st.day;
    const byReg = {}; lag.filter(f => f.i === day).forEach(f => { byReg[f.region] = byReg[f.region] || { of: [], short: 0 }; byReg[f.region].of.push(f.of); byReg[f.region].short += f.short; });
    const regs = Object.entries(byReg);
    return `<div class="fresh" role="status"><b>NOT UPDATED</b>${andList(regs.map(r => r[0]))} ${regs.length > 1 ? 'have' : 'has'} not finished loading ${dlabel(day)} — ${regs.map(([r, x]) => `${r} is at ${Math.round(Math.min(...x.of) * 100)}% of its normal ${dt(day).toLocaleDateString('en-US', { weekday: 'long' })} (${money(x.short)} outstanding)`).join('; ')}. Every figure is shown through <b class="asof">${dlabel(asOf)}</b>.</div>`;
  }
  function kpis(v) {
    const k = (l, val, d) => `<div class="ppa-kpi"><div class="l">${l}</div><div class="v">${val}</div><div class="d">${d}</div></div>`;
    const ar = x => (x >= 0 ? '▲ ' : '▼ ');
    return `<div class="ppa-kpis">${k('Net sales', money(v.t), `<b class="${cls(v.g)}">${ar(v.g)}${pct(v.g)}</b> vs LY · LY ${money(v.l)}`)}${k('Comp sales', pct(v.comp), 'stores + eCom open 1 yr+')}${k('Gross margin', v.gm.toFixed(1) + '%', `<b class="${cls(v.gm - v.gmLy)}">${ar(v.gm - v.gmLy)}${ppt(v.gm - v.gmLy)}</b> vs LY`)}${k('New customers', kfmt(v.newT), `<b class="${cls(v.newG)}">${ar(v.newG)}${pct(v.newG)}</b> vs LY · Gen Z ${Math.round(v.genzShare)}%`)}</div>`;
  }
  const FRAME = { day: 'Day', mtd: 'month to date', qtd: 'quarter to date' };
  function periodLabel(v) { return st.tf === 'day' ? dlabel(v.e) : `${dlabel(v.a)} – ${dlabel(v.b)}`; }
  function tree(v) {
    const cb = c => `<span class="cbar" style="width:${Math.max(2, Math.round(Math.abs(c) * 12))}px;background:${c < 0 ? 'var(--dn)' : '#8B4513'}"></span>`;
    const row = (c, n, x, local) => `<tr class="${c}"><td>${esc(n)}</td><td>${money(x.t)}</td><td class="${cls(x.g)}">${pct(x.g)}${local != null ? `<small>${pct(local)} local</small>` : ''}</td><td>${pts(x.c)}${c === 'co' ? '' : cb(x.c)}</td></tr>`;
    let h = `<div class="tw"><table class="tree"><tr><th>Scope</th><th>Net sales</th><th>vs LY</th><th>Growth contribution</th></tr>${row('co', scopeName(st), { t: v.t, g: v.g, c: v.g })}`;
    v.brands.forEach(br => { h += row('br', br.name, br); br.regions.forEach(r => (h += row('rg', r.name, r, r.local))); });
    return h + `</table></div><div class="tnote">Contribution = a row's change ÷ the scope's last-year sales, so the rows add up to the total. Japan also shows its growth in local currency.</div>`;
  }
  function dailyChart(v) {
    const m = mStart(Math.min(st.day, N - 1)), end = st.day, sc = st, rows = D.rows.filter(r => inScope(r, sc)), bars = [];
    for (let i = m; i <= end; i++) { const [t, l] = sum(rows, 'sales', i, i); bars.push({ i, t, l, weak: flags.weak.some(f => f.i === i && inScope(D.rows[f.ri], sc)), lag: i > asOf }); }
    const max = Math.max(...bars.map(x => Math.max(x.t, x.l)));
    return `<h5>Daily net sales · ${monthName(m)} ${dt(m).getDate()}–${dt(end).getDate()}</h5><div class="bars">${bars.map(x => `<i class="${x.weak ? 'weak' : ''}${x.lag ? ' late' : ''}" style="height:${(x.t / max * 100).toFixed(1)}%" data-tip="${esc(dlabel(x.i))} · ${money(x.t)} · ${pct(gr(x.t, x.l))} vs LY${x.weak ? ' · weak day, fully loaded' : ''}${x.lag ? ' · still loading' : ''}"></i>`).join('')}</div>
      <div class="bx">${bars.map((x, k) => `<span>${k === 0 || k === bars.length - 1 || dt(x.i).getDate() % 5 === 0 ? dt(x.i).getDate() : ''}</span>`).join('')}</div>`;
  }
  function dataNotes(sc) {
    const weak = {}; flags.weak.filter(f => inScope(D.rows[f.ri], sc) && f.i >= mStart(asOf)).forEach(f => { weak[f.i] = weak[f.i] || []; weak[f.i].push(f); });
    const li = Object.entries(weak).map(([i, fs]) => { const g = [...new Set(fs.map(f => f.region))]; return `<li class="warn"><b>${dlabel(+i)} is a weak day, not missing data</b><span>${andList(g)} came in at ${Math.round(Math.min(...fs.map(f => f.of)) * 100)}% of a normal ${dt(+i).toLocaleDateString('en-US', { weekday: 'long' })}, but every later day loaded in full — so ${dlabel(+i)} is complete and counts as is.</span></li>`; });
    const lag = flags.lag.filter(f => inScope(D.rows[f.ri], sc));
    if (lag.length) li.push(`<li class="none"><b>${dlabel(lag[0].i)} is still loading</b><span>${andList([...new Set(lag.map(f => f.region))])} is incomplete, so the brief stops at ${dlabel(asOf)}.</span></li>`);
    return li.length ? `<ul class="ppa-al">${li.join('')}</ul>` : '';
  }
  function insightsCard(v) {
    const w = v.weekly, s = x => `<span class="${cls(x)}">${pct(x)}</span>`;
    const same = w.fastest.name === w.most.name;
    return `<div class="ppa-card ins"><h5>Insights summary · weekly product &amp; customer data, through Sat 11/14</h5><ul>
      <li><b>Category</b> — ${same ? `${esc(w.fastest.name)} led the growth, ${s(w.fastest.g)} vs LY and ${pts(w.fastest.c)}` : `${esc(w.fastest.name)} grew fastest, net sales ${s(w.fastest.g)} vs LY; ${esc(w.most.name)} added the most, <span class="up">${pts(w.most.c)}</span> of growth`}; the biggest drag was ${esc(w.drag.name)}, ${s(w.drag.g)}.</li>
      <li><b>New customers &amp; Gen Z</b> — new-customer demand ${s(w.newG)} vs LY, ${Math.round(w.newShare)}% of all demand; new Gen Z ${s(w.genzG)}, ${w.genzG >= w.newG ? 'ahead of' : 'behind'} new customers overall.</li></ul></div>`;
  }
  function salesTab() {
    const v = view(st), r = theRead(st);
    const seg = (k, opts) => `<div class="seg" role="group">${opts.map(([val, l]) => `<button type="button" data-${k}="${val}" aria-pressed="${st[k] === val}">${l}</button>`).join('')}</div>`;
    return `<div class="ppa-filters ctl">
        <div class="ppa-f"><label>Time frame</label>${seg('tf', [['day', 'Day'], ['mtd', 'MTD'], ['qtd', 'QTD']])}</div>
        <div class="ppa-f"><label>Brand</label>${seg('brand', [['all', 'Both'], ['Studio', 'Studio'], ['Outlet', 'Outlet']])}</div>
        <div class="ppa-f"><label for="ceo-rg">Region</label><select id="ceo-rg" data-region-sel><option value="all">All regions</option>${REGIONS.map(x => `<option${st.region === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="ppa-f"><label>Day</label><div class="stepper"><button type="button" data-step="-1" aria-label="Previous day"${st.day <= 1 ? ' disabled' : ''}>◀</button><b>${dlabel(st.day)}</b><button type="button" data-step="1" aria-label="Next day"${st.day >= N - 1 ? ' disabled' : ''}>▶</button></div></div>
      </div>
      ${banner()}
      <div class="ppa-card read">${r.html}</div>
      <div class="ctxl">Tiles and table: <b>${st.tf === 'day' ? 'Day' : FRAME[st.tf]}</b> · ${periodLabel(v)} · vs the same days last year</div>
      ${kpis(v)}
      <div class="ppa-grid"><div class="ppa-card"><h5>Drill down · net sales, ${st.tf === 'day' ? dlabel(v.e) : FRAME[st.tf]}</h5>${tree(v)}</div>
        <div class="ppa-card">${dailyChart(v)}${dataNotes(st)}</div></div>
      ${insightsCard(v)}`;
  }

  // ---------------------------------------------------------------- news tab
  const OUT = { FW: 'Fashion Wire', RL: 'The Retail Ledger', MS: 'Market Street Daily' };
  function newsTab() {
    const F = facts(), S = D.stock, n = S.close.length, day = gr(S.close[n - 1], S.close[n - 2]), peerAvg = S.peers.reduce((s, p) => s + p[1], 0) / S.peers.length, ytdAvg = S.peers.reduce((s, p) => s + p[2], 0) / S.peers.length;
    const avg30 = S.volume_m.slice(-31, -1).reduce((s, x) => s + x, 0) / 30, vx = S.volume_m[n - 1] / avg30, vsMed = (S.close[n - 1] / S.target[2] - 1) * 100;
    const k = (l, val, d) => `<div class="ppa-kpi"><div class="l">${l}</div><div class="v${l === 'Street target' ? ' txt' : ''}">${val}</div><div class="d">${d}</div></div>`;
    const item = (c, when, head, why) => `<li><div class="src"><span class="lg lg-${c.toLowerCase()}">${c}</span><b>${OUT[c]}</b><span>${when}</span><a href="#" data-noop>Read →</a></div><div class="h">${head}</div><div class="w"><b>Why it matters:</b> ${why}</div></li>`;
    const apac = F.R['Asia Pacific'], eu = F.R.Europe;
    return `<div class="ppa-card" style="margin-top:0"><h5>Share price &amp; peers · ${S.ticker} · close ${dlabel(N - 1)}</h5>
      <div class="ppa-kpis" style="margin-top:4px">${k('Close', '$' + S.close[n - 1].toFixed(2), `<b class="${cls(day)}">${day >= 0 ? '▲' : '▼'} ${pct(day)}</b> · peers avg ${pct(peerAvg)}`)}${k('Year to date', pct(S.ytd), `peers avg ${pct(ytdAvg)}`)}${k('Volume', S.volume_m[n - 1].toFixed(1) + 'M', `${vx.toFixed(1)}× the 30-day average`)}${k('Street target', `$${S.target[0]} – $${S.target[1]}`, `median $${S.target[2]}`)}</div>
      <div class="stk"><div class="stk-c"><div class="stk-t">Share price · last 3 months</div><svg id="pxc" viewBox="0 0 640 170" preserveAspectRatio="none" role="img" aria-label="Share price, last 3 months"></svg>
        <div class="stk-t" style="margin-top:6px">Volume</div><svg id="vlc" viewBox="0 0 640 70" preserveAspectRatio="none" role="img" aria-label="Daily volume"></svg><div class="stk-x" id="stkx"></div><div class="stip" id="stip" hidden></div></div>
        <div><table class="peer"><tr><th></th><th>Day</th><th>YTD</th></tr><tr class="me"><td>${D.brand}</td><td class="${cls(day)}">${pct(day)}</td><td>${pct(S.ytd)}</td></tr>
          ${S.peers.map(p => `<tr><td>${esc(p[0])}</td><td class="${cls(p[1])}">${pct(p[1])}</td><td>${pct(p[2])}</td></tr>`).join('')}<tr class="avg"><td>Peer average</td><td>${pct(peerAvg)}</td><td>${pct(ytdAvg)}</td></tr></table>
          <details class="fn" open><summary>Interpretation</summary>Shares ${day - peerAvg >= 0 ? 'beat' : 'trailed'} the peer group by ${Math.abs(day - peerAvg).toFixed(1)} pt on ${vx.toFixed(1)}× normal volume, the morning the outerwear sell-out story ran. At $${S.close[n - 1].toFixed(2)} the stock sits ${Math.abs(vsMed).toFixed(0)}% ${vsMed < 0 ? 'below' : 'above'} the street's median target of $${S.target[2]}.</details></div></div></div>
      <div class="ppa-grid even"><div class="ppa-card"><h5>Us in the news</h5><ul class="news">
        ${item('FW', '7:40 am', `${D.brand}'s outerwear capsule sells out online in two hours`, `matches the Sales read — outerwear is the ${F.w.fastest.name === 'Outerwear' ? 'fastest-growing category' : 'a growing category'}, ${pct(F.outer.g)} vs LY.`)}
        ${item('RL', 'Mon', `${D.brand} names a new head of Asia Pacific stores`, `Asia Pacific is ${pct(apac.g)} vs LY month to date; no action needed.`)}
      </ul></div><div class="ppa-card"><h5>Competitive set</h5><ul class="news">
        ${item('FW', 'Mon', 'Maison Verre cuts prices up to 40% ahead of Black Friday', "bears on today's 2 pm markdown decision for Outlet.")}
        ${item('MS', '6:15 am', 'Halden &amp; Co raises full-year guidance on holiday pre-orders', 'peer demand is strong going into holiday; worth a line at the 9:30 sync.')}
        ${item('RL', 'Mon', 'Northgate Group to close 30 stores in Europe', `Europe is our ${F.fast.name === 'Europe' ? 'fastest-growing region' : 'a growing region'}, ${pct(eu.g)} vs LY; watch for share gains.`)}
      </ul></div></div>
      <div class="tabnote">Outlets, headlines and prices are synthetic. Each "Why it matters" line is filled from the same numbers as the Sales tab.</div>`;
  }
  function drawStock() {
    const S = D.stock, N2 = S.close.length, px = S.close, vol = S.volume_m, days = S.days.map(x => new Date(x + 'T12:00:00'));
    const W = 640, H = 170, VH = 70, L = 34, R = 6, T = 6, B = 6, xs = i => L + (W - L - R) * i / (N2 - 1);
    const lo = Math.floor(Math.min(...px) / 2) * 2 - 2, hi = Math.ceil(Math.max(...px) / 2) * 2 + 2, ys = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const ns = 'http://www.w3.org/2000/svg', mk = (t, a) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const pc = $('#pxc'), vc = $('#vlc'); if (!pc) return;
    const nse = { 'vector-effect': 'non-scaling-stroke' };
    for (let v = lo; v <= hi; v += 4) { pc.appendChild(mk('line', { x1: L, x2: W - R, y1: ys(v), y2: ys(v), stroke: '#e8e4da', 'stroke-width': 1, ...nse }));
      const t = mk('text', { x: L - 6, y: ys(v) + 3, 'text-anchor': 'end', 'font-size': 10, fill: '#5f5d57', 'font-family': 'JetBrains Mono' }); t.textContent = '$' + v; pc.appendChild(t); }
    pc.appendChild(mk('path', { d: px.map((v, i) => (i ? 'L' : 'M') + xs(i) + ',' + ys(v)).join(''), fill: 'none', stroke: '#8B4513', 'stroke-width': 2, 'stroke-linejoin': 'round', ...nse }));
    pc.appendChild(mk('circle', { cx: xs(N2 - 1), cy: ys(px[N2 - 1]), r: 4, fill: '#8B4513', stroke: '#fbfaf6', 'stroke-width': 2 }));
    const lbl = mk('text', { x: xs(N2 - 1) - 6, y: ys(px[N2 - 1]) - 9, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 600, fill: '#1d1c1a', 'font-family': 'Instrument Sans' }); lbl.textContent = '$' + px[N2 - 1].toFixed(2); pc.appendChild(lbl);
    const vmax = Math.max(...vol) * 1.1, bw = (W - L - R) / N2 - 2;
    vol.forEach((v, i) => { const h = (VH - 4) * v / vmax; vc.appendChild(mk('rect', { x: xs(i) - bw / 2, y: VH - h, width: bw, height: h, rx: 1.5, fill: i === N2 - 1 ? '#8B4513' : '#cfc9bb' })); });
    const avg = vol.slice(-31, -1).reduce((a, x) => a + x, 0) / 30, ay = VH - (VH - 4) * avg / vmax;
    vc.appendChild(mk('line', { x1: L, x2: W - R, y1: ay, y2: ay, stroke: '#5f5d57', 'stroke-dasharray': '3 3', 'stroke-width': 1, ...nse }));
    const at = mk('text', { x: L - 6, y: ay + 3, 'text-anchor': 'end', 'font-size': 10, fill: '#5f5d57', 'font-family': 'JetBrains Mono' }); at.textContent = '30d'; vc.appendChild(at);
    const f = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    $('#stkx').innerHTML = [0, 21, 42, N2 - 1].map(i => '<span>' + f(days[i]) + '</span>').join('');
    const xh = [mk('line', { y1: T, y2: H, stroke: '#46443f', 'stroke-width': 1, ...nse, visibility: 'hidden' }), mk('line', { y1: 0, y2: VH, stroke: '#46443f', 'stroke-width': 1, ...nse, visibility: 'hidden' })];
    pc.appendChild(xh[0]); vc.appendChild(xh[1]);
    const tip = $('#stip');
    function move(ev) {
      const r = pc.getBoundingClientRect(); let i = Math.round(((ev.clientX - r.left) / r.width * W - L) / (W - L - R) * (N2 - 1)); i = Math.max(0, Math.min(N2 - 1, i));
      xh.forEach(l => { l.setAttribute('x1', xs(i)); l.setAttribute('x2', xs(i)); l.setAttribute('visibility', 'visible'); });
      const ch = i ? gr(px[i], px[i - 1]) : 0;
      tip.innerHTML = `<b>${days[i].toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</b><br>Close $${px[i].toFixed(2)} · <span class="${cls(ch)}">${pct(ch)}</span><br>Volume ${vol[i].toFixed(1)}M`;
      tip.hidden = false; tip.style.left = Math.min(xs(i) / W * r.width + 12, r.width - 150) + 'px';
    }
    [pc, vc].forEach(c => { c.addEventListener('mousemove', move); c.addEventListener('mouseleave', () => { tip.hidden = true; xh.forEach(l => l.setAttribute('visibility', 'hidden')); }); });
  }

  // ---------------------------------------------------------------- chatbot: answers built from the current view's facts, every figure cited and checked
  const QS = [
    { q: 'Which product category grew the most month to date?', k: 'cat' },
    { q: 'How are new customers trending month to date?', k: 'new', frame: 'mtd' },
    { q: 'How is Gen Z trending MTD?', k: 'genz' },
    { q: 'How are the Market Tote and other hero products performing MTD?', k: 'hero' },
  ];
  function answer(k) {
    const v = view(st), w = v.weekly, ledger = [], checks = [];
    const c = (val, src) => { ledger.push({ val, src }); return `<span class="cite" data-src="${esc(src)}">${val}</span>`; };
    const dir = (word, x, want) => checks.push({ ok: want === 'pos' ? x > 0 : x < 0, t: `"${word}" matches the sign of ${pct(x)}` });
    const scope = `${st.brand === 'all' ? 'both brands' : st.brand} · ${st.region === 'all' ? 'all regions' : st.region}`;
    const wk = `Weekly · through Sat 11/14 · ${scope} · USD`, sources = [];
    let head, lis = [];
    if (k === 'cat') {
      const byG = [...w.cats].sort((x, y) => y.g - x.g), byC = [...w.cats].sort((x, y) => y.c - x.c);
      head = w.fastest.name === w.most.name ? `${w.fastest.name} grew the most — net sales ${c(pct(w.fastest.g), `Insights summary › ${w.fastest.name} › vs LY`)} vs last year, adding ${c(pts(w.fastest.c), `Insights summary › ${w.fastest.name} › contribution`)}.`
        : `${w.fastest.name} grew fastest — net sales ${c(pct(w.fastest.g), `Insights summary › ${w.fastest.name} › vs LY`)} vs last year. ${w.most.name} added the most to growth, ${c(pts(w.most.c), `Insights summary › ${w.most.name} › contribution`)}.`;
      lis.push(`The biggest drag is ${w.drag.name}, ${c(pct(w.drag.g), `Insights summary › ${w.drag.name} › vs LY`)}.`, 'From weekly product data, through the week ending Sat 11/14.');
      checks.push({ ok: byG[0].name === w.fastest.name && byC[0].name === w.most.name, t: '"fastest" and "added the most" match the ranked list' });
      sources.push('weekly product data');
      return pack(head, lis, ledger, checks, sources, wk);
    }
    if (k === 'new') {
      head = `New customers are ${v.newG >= 0 ? 'up' : 'down'} ${c(pct(v.newG), 'Sales › New customers › vs LY')} on last year month to date — ${c(kfmt(v.newT), 'Sales › New customers')} so far.`;
      dir(v.newG >= 0 ? 'up' : 'down', v.newG, v.newG >= 0 ? 'pos' : 'neg');
      lis.push(`Their demand is ${c(pct(w.newG), 'Insights summary › New-customer demand › vs LY')} vs last year and ${c(Math.round(w.newShare) + '%', 'Insights summary › share of all demand')} of all demand (weekly customer data, through Sat 11/14).`,
        `Gen Z makes up ${c(Math.round(v.genzShare) + '%', 'Sales › New customers › Gen Z share')} of new customers.`);
      sources.push('daily sales feed', 'weekly customer data');
      return pack(head, lis, ledger, checks, sources, `MTD · through ${dlabel(v.e)} · ${scope} · USD`);
    }
    if (k === 'genz') {
      const ahead = w.genzG >= w.newG;
      head = `New Gen Z demand is ${c(pct(w.genzG), 'Insights summary › New Gen Z › vs LY')} vs last year — ${ahead ? 'ahead of' : 'behind'} new customers overall, ${c(pct(w.newG), 'Insights summary › New-customer demand › vs LY')}.`;
      checks.push({ ok: ahead === (w.genzG >= w.newG), t: `"${ahead ? 'ahead' : 'behind'}" checked: ${pct(w.genzG)} vs ${pct(w.newG)}` });
      lis.push(`Gen Z is ${c(Math.round(v.genzShare) + '%', 'Sales › New customers › Gen Z share')} of new customers ${st.tf === 'day' ? 'on ' + dlabel(v.e) : FRAME[st.tf]}.`,
        'This brief reads Gen Z for new customers only — returning Gen Z customers are not in this brief.');
      checks.push({ ok: true, t: 'scope limit stated instead of guessed' });
      sources.push('weekly customer data');
      return pack(head, lis, ledger, checks, sources, wk);
    }
    const hs = w.heroes, tote = hs.find(h => h.name === 'Market Tote'), others = hs.filter(h => h !== tote), fast = [...hs].sort((x, y) => y.g - x.g)[0], behind = hs.filter(h => h.g < 0);
    head = `The Market Tote is ${c(pct(tote.g), 'Weekly product data › Market Tote › vs LY')} vs last year — ${c(tote.share.toFixed(1) + '%', 'Weekly product data › Market Tote › share of net sales')} of net sales.`;
    others.forEach(h => lis.push(`${h.name} ${c(pct(h.g), `Weekly product data › ${h.name} › vs LY`)}${h === fast ? ', the fastest of the hero products' : ''}${behind.length === 1 && behind[0] === h ? ', the only hero product behind last year' : ''}.`));
    lis.push('From weekly product data, through the week ending Sat 11/14.');
    sources.push('weekly product data, not the daily sales feed');
    return pack(head, lis, ledger, checks, sources, wk);
  }
  function pack(head, lis, ledger, checks, sources, stamp) {
    const html = `<div class="hl">${head}</div><ul>${lis.map(x => `<li>${x}</li>`).join('')}</ul>`;
    // check 1: every number in the visible text sits inside a citation
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    tmp.querySelectorAll('.cite').forEach(e => e.remove());
    const loose = (tmp.textContent.replace(/Sat 11\/14|11\/\d+|week ending/g, '').match(/[+−-]?\$?\d[\d.,]*\s?(%|pts|K|M)?/g) || []);
    const all = [{ ok: loose.length === 0, t: `${ledger.length} numbers, all cited${loose.length ? ` — uncited: ${loose.join(', ')}` : ' and match the page'}` }, ...checks, { ok: true, t: 'source named: ' + sources.join(' and ') }];
    const blocked = all.some(x => !x.ok);
    return blocked ? `<div class="hl">Withheld — this answer failed a check, so it isn't shown.</div><div class="chk">${all.map(x => `<span class="${x.ok ? '' : 'bad'}">${x.ok ? '✓' : '✗'} ${esc(x.t)}</span>`).join('')}</div>`
      : html + `<div class="chk">${all.map(x => `<span>✓ ${esc(x.t)}</span>`).join('')}</div><div class="stamp">${esc(stamp)}</div>`;
  }
  const log = $('.ppa-log'), chat = $('.ppa-chat');
  const asked = new Set();
  // same layout as the Product Performance Agent: a one-line hint, separate question boxes, then the scope note
  const sugHTML = () => {
    const v = view(st), scope = `${st.brand === 'all' ? 'both brands' : st.brand}, ${st.region === 'all' ? 'all regions' : st.region}`;
    return `<div class="hint">I read the figures for <b>${FRAME[st.tf] === 'Day' ? dlabel(v.e) : (st.tf === 'day' ? dlabel(v.e) : FRAME[st.tf])}</b> through ${dlabel(v.e)}, ${esc(scope)}. Start with one of these —</div>
      <div class="ppa-sugtop">${QS.map((x, i) => `<button type="button" data-i="${i}"${asked.has(i) ? ' disabled' : ''}>→ ${esc(x.q)}</button>`).join('')}
      <div class="ppa-scope"><b>What it covers:</b> the figures on this brief for the view you have selected, and the wording on its tabs. <b>Not:</b> email or calendar, plan, or anything outside this brief — those get "not in this brief" rather than a guess.</div></div>`;
  };
  function resetChat() { asked.clear(); log.innerHTML = sugHTML(); }
  const FB = 'ceo:feedback:v1', DEC_KEY = 'ceo:fb-decisions:v1';
  const REASONS = ['Wrong number', 'Not what I asked', 'Too vague', 'Other'];
  const fbBar = i => `<div class="ppa-fb" data-fq="${i}"><span>Was this useful?</span><button type="button" data-rate="up" aria-label="Useful">👍</button><button type="button" data-rate="down" aria-label="Not useful">👎</button></div>`;
  const fbForm = i => `<div class="ppa-fbf" data-fq="${i}"><div class="h">What went wrong?</div><div class="chips">${REASONS.map(r => `<button type="button" data-reason="${r}" aria-pressed="false">${r}</button>`).join('')}</div><textarea maxlength="200" placeholder="Optional: what did you expect?" aria-label="What did you expect?"></textarea><div class="row"><span>Stays in your browser · goes into this week's review</span><button type="button" class="send" disabled>Send</button></div></div>`;
  const fbThanks = () => `<div class="ppa-fbdone">✓ Thanks — logged. <button type="button" class="ppa-link" data-fbr>See what the owner sees → Feedback review</button></div>`;
  function logFb(rec) {
    const all = readLS(FB, []); all.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), ...rec }); writeLS(FB, all);
    const b2 = $('[data-fbr-open]'); if (b2) { b2.classList.remove('pulse'); void b2.offsetWidth; b2.classList.add('pulse'); setTimeout(() => b2.classList.remove('pulse'), 1600); }
  }
  // the synthetic week the owner reviews; the visitor's own ratings are added on top
  const REVIEW = {
    wk: 46, headline: 'Most friction this week is about periods and scope, not wrong numbers.',
    text: 'Executives asked <strong>64</strong> questions. The checker withheld <strong>1</strong> answer before anyone saw it; the bigger theme is <strong>5</strong> questions about "this quarter" answered as month to date. One theme needs a business decision before anyone can fix it.',
    sig: { q: 64, prev: 57, up: 9, dn: 3, reph: 5, nodata: 4, flags: 1 },
    rows: [
      { theme: '"This quarter" answered as month to date', ex: 'How is Japan doing this quarter?', src: '3 👎 · 2 rephrased', n: 5, dg: 'und', dl: 'Misread period', sug: 'Read the period from the question and switch the frame before answering, the way the new-customer question already does.', ai: 'fix' },
      { theme: "Asks about plan, which this brief doesn't carry", ex: 'Are we ahead of plan in Europe?', src: '4 "not in this brief"', n: 4, dg: 'def', dl: 'Definition gap?', sug: 'Decide with Finance whether plan belongs in the brief. Until then, the answer says so.', ai: 'def' },
      { theme: 'Wants the story behind a headline', ex: 'Why did Maison Verre cut prices?', src: '2 "not in this brief"', n: 2, dg: 'scope', dl: 'Out of scope', sug: 'News carries the headline and why it matters. Link the source in the answer instead.', ai: 'later' },
      { theme: 'Checker withheld an answer', ex: 'Which region grew the most?', src: '1 checker flag', n: 1, dg: 'bug', dl: 'Bug', sug: 'The draft called Asia Pacific "the biggest" by contribution while the ranked list is by growth. Fix the wording rule and add a test.', ai: 'fix' },
    ],
    done: [{ t: 'Japan answered in dollars only', d: 'fixed last week · local currency added to Japan answers · 1 regression test · 2 users told' },
      { t: '"Yesterday" read as the day still loading', d: 'fixed last week · answers stop at the last complete day · 1 regression test · 1 user told' }],
  };
  const DEC = [['fix', 'Fix now'], ['later', 'Later'], ['wont', "Won't fix"], ['def', 'Needs a definition']];
  function myRows(recs) {
    return recs.filter(r => r.kind !== 'up').map(r => {
      const base = { key: r.id, you: true, n: 1, ex: r.q, note: r.note };
      if (r.kind === 'nodata') return { ...base, theme: 'Typed question with no answer', src: '"not in this brief" reply', dg: 'scope', dl: 'Out of scope', sug: 'Not in the brief\'s answers yet. Add it, or say so in the chat\'s scope note.', ai: 'later' };
      if (r.reason === 'Wrong number') { // re-run the answer and its checks before diagnosing
        const k = QS.find(x => x.q === r.q), clean = k && !/✗|Withheld/.test(answer(k.k));
        return { ...base, theme: 'You flagged a wrong number', src: '1 👎', dg: clean ? 'def' : 'bug', dl: clean ? 'Definition gap?' : 'Bug',
          sug: clean ? 'The checks were re-run and every number matches the page, so the gap is likely the definition you expected.' : 'The re-run found a number that does not match. Fix it and add a test.', ai: clean ? 'def' : 'fix' };
      }
      const m = { 'Not what I asked': ['und', 'Misread question', 'Add this wording to the routing examples and the test set.', 'fix'], 'Too vague': ['und', 'Answer too thin', 'Add the follow-up you needed to this answer.', 'later'], Other: ['scope', 'Needs triage', 'Read the note; one report is not a pattern yet.', 'later'] }[r.reason];
      return { ...base, theme: r.reason === 'Other' ? 'Other feedback' : `"${r.reason}"`, src: '1 👎', dg: m[0], dl: m[1], sug: m[2], ai: m[3] };
    });
  }
  function feedbackReview() {
    const R = REVIEW, sg = R.sig, recs = readLS(FB, []), dec = readLS(DEC_KEY, {});
    const up = recs.filter(r => r.kind === 'up').length, dn = recs.filter(r => r.kind === 'down').length, nd = recs.filter(r => r.kind === 'nodata').length;
    const mine = myRows(recs), rows = [...mine, ...R.rows.map((r, i) => ({ ...r, key: 'ceo-s' + i }))];
    const you = k => (k ? ` · ${k} from you` : ''), qn = sg.q + nd, dq = sg.q - sg.prev;
    const tile = (l, v, d) => `<div><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const got = rows.filter(r => dec[r.key]), tally = got.length ? `You decided ${got.length} of ${rows.length}: ` + DEC.map(([k, l]) => [l, got.filter(r => dec[r.key] === k).length]).filter(x => x[1]).map(([l, n]) => `${n} ${l.toLowerCase()}`).join(' · ') : "Dashed = the agent's suggestion · click to decide";
    const row = r => `<div class="fbr-r${r.you ? ' you' : ''}">
        <div><div class="th">${esc(r.theme)}</div><div class="ex">"${esc(r.ex)}"</div>${r.note ? `<div class="nt">Note: ${esc(r.note)}</div>` : ''}<span class="src">${esc(r.src)}</span>${r.you ? '<span class="src me">You · this browser</span>' : ''}</div>
        <div class="cnt"><span>Count</span>${r.n}</div>
        <div><span class="dg ${r.dg}">${esc(r.dl)}</span><div class="sug">${esc(r.sug)}</div></div>
        <div class="dec">${DEC.map(([k, l]) => `<button type="button" data-dec="${k}" data-key="${esc(r.key)}"${r.ai === k ? ' class="ai"' : ''} aria-pressed="${dec[r.key] === k}">${l}</button>`).join('')}</div></div>`;
    return `<div class="ppa-card fbr">
      <div class="fbr-loop">${[['1 · Log', 'Every answer, 👍/👎 and reason'], ['2 · Weekly pull', "All of the week's turns"], ['3 · Agent drafts', 'Prioritises, summarises, suggests a fix', 'ai'], ['4 · Business decides', "Fix now · Later · Won't fix · Needs a definition", 'you'], ['5 · Fix + test', 'Each fix becomes a regression test'], ['6 · Tell the user', '"The thing you flagged is fixed"']].map(([h, t, c]) => `<div${c ? ` class="${c}"` : ''}><b>${h}</b>${t}</div>`).join('')}</div>
      <div class="ins-mast"><span>Feedback review · W${R.wk} · CEO Morning Brief · synthetic week</span><span>${rows.length} themes${mine.length ? ` · ${mine.length} from you` : ''}</span></div>
      <h2 class="fbr-hl">${esc(R.headline)}</h2>
      <p class="fbr-p">${R.text}</p>
      <div class="fbr-sig">${tile('Questions', qn, `${dq >= 0 ? '+' : M}${Math.abs(dq)} vs W${R.wk - 1}${you(nd)}`)}${tile('👍 / 👎', `${sg.up + up} / ${sg.dn + dn}`, `1 in ${Math.round(qn / (sg.up + up + sg.dn + dn))} answers rated${you(up + dn)}`)}${tile('Rephrased', sg.reph, 'asked again in new words')}${tile('"Not in this brief"', sg.nodata + nd, 'out of scope' + you(nd))}${tile('Checker flags', sg.flags, 'withheld before shown')}</div>
      <div class="fbr-h"><span>Ranked by the agent · you decide each row</span><span class="tally">${esc(tally)}</span></div>
      <div class="fbr-t"><div class="fbr-r hd"><div>Theme</div><div>Count</div><div>Diagnosis · suggested fix</div><div>Decision</div></div>${rows.map(row).join('')}</div>
      <div class="fbr-h"><span>Fixed last week · loop closed</span></div>
      <div class="fbr-done">${R.done.map(x => `<div><b>${esc(x.t)}</b> <span>· ${esc(x.d)}</span></div>`).join('')}</div>
      <div class="ins-foot">In production, every question and rating lands in a warehouse table; each week the agent reads them, groups and summarises the feedback into this list, and the business owner reviews it with us. Here the week is synthetic, and your own ratings stay in this browser — nothing is sent anywhere.</div>
    </div>`;
  }
  const modal = $('.ins-modal');
  let opener = null;
  function openReview(from) { opener = from || null; modal.hidden = false; document.documentElement.classList.add('ins-lock'); $('.ins-scroll').innerHTML = feedbackReview(); $('.ins-scroll').scrollTop = 0; $('.ins-x').focus(); }
  function closeReview() { if (modal.hidden) return; modal.hidden = true; document.documentElement.classList.remove('ins-lock'); (opener && opener.isConnected ? opener : $('[data-fbr-open]')).focus(); }
  modal.addEventListener('click', e => {
    if (e.target.closest('[data-ins-x]')) return closeReview();
    const b2 = e.target.closest('[data-dec]'); if (!b2) return;
    const d = readLS(DEC_KEY, {}), k = b2.dataset.key; if (d[k] === b2.dataset.dec) delete d[k]; else d[k] = b2.dataset.dec; writeLS(DEC_KEY, d);
    const y = $('.ins-scroll').scrollTop; $('.ins-scroll').innerHTML = feedbackReview(); $('.ins-scroll').scrollTop = y;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeReview(); });
  function ask(i) {
    const x = QS[i];
    if (x.frame && st.tf !== x.frame) { st.tf = x.frame; render(); } // this question reads the month-to-date frame, so select it the way a reader would
    asked.add(i);
    log.querySelectorAll('.ppa-sugtop [data-i]').forEach(b2 => (b2.disabled = asked.has(+b2.dataset.i)));
    log.insertAdjacentHTML('beforeend', `<div class="q">${esc(x.q)}</div><div class="a">${answer(x.k)}${fbBar(i)}</div>`);
    log.scrollTop = log.scrollHeight;
  }
  const words = t => new Set(t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1));
  function match(t) {
    const a = words(t); let best = -1, score = 0;
    QS.forEach((c, i) => { const b2 = words(c.q), common = [...a].filter(w => b2.has(w)).length, s = common / Math.max(a.size, b2.size); if (s > score) { score = s; best = i; } });
    return score >= 0.75 ? best : -1;
  }
  function typed(t) {
    const i = match(t);
    if (i >= 0) return ask(i);
    logFb({ kind: 'nodata', q: t.slice(0, 200) }); // a typed question with no answer is a signal for the weekly review
    const mail = /\b(email|e-mail|mail|inbox|calendar|meeting|schedule|cfo|chair|draft)\b/i.test(t);
    log.insertAdjacentHTML('beforeend', `<div class="q">${esc(t)}</div><div class="a"><span class="tag no">Not in this brief</span><div class="hl">${mail ? "I don't read the Today's schedule tab — email and calendar stay out of the chat." : 'Not in this brief.'}</div>
      <div class="demo">${mail ? "Where to find it: Today's schedule." : 'This public demo answers the four questions above from the brief\'s own figures. It is not connected to a language model, because a public page can\'t safely hold an API key. In production, any question about a figure, date or section of the brief gets an answer from the same facts — or "not in this brief".'}</div></div>`);
    log.scrollTop = log.scrollHeight;
  }

  // ---------------------------------------------------------------- render + events
  function render() {
    $$('[role=tab]').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === st.tab));
    const panel = $('.ppa-panel');
    panel.innerHTML = st.tab === 'sched' ? schedTab() : st.tab === 'sales' ? salesTab() : newsTab();
    if (st.tab === 'news') drawStock();
  }
  function go(tab) { st.tab = tab; render(); }
  root.addEventListener('click', e => {
    const t = e.target;
    const tab = t.closest('[role=tab]'); if (tab) return go(tab.dataset.tab);
    const g = t.closest('[data-go]'); if (g) { e.preventDefault(); return go(g.dataset.go); }
    if (t.closest('[data-noop]')) return e.preventDefault();
    for (const k of ['tf', 'brand']) { const s = t.closest(`[data-${k}]`); if (s && s.tagName === 'BUTTON') { st[k] = s.dataset[k]; return render(); } }
    const sp = t.closest('[data-step]'); if (sp) { st.day = Math.max(1, Math.min(N - 1, st.day + +sp.dataset.step)); return render(); }
    const dr = t.closest('[data-draft]');
    if (dr) { const d = dr.closest('[data-item]').querySelector('.draft'); d.hidden = !d.hidden; dr.setAttribute('aria-expanded', !d.hidden); dr.textContent = d.hidden ? 'Draft reply' : 'Hide draft'; return; }
    const rs = t.closest('[data-resolve]');
    if (rs) {
      const id = rs.dataset.resolve, set = new Set(readLS(RES_KEY, [])), on = !set.has(id);
      on ? set.add(id) : set.delete(id); writeLS(RES_KEY, [...set]);
      rs.closest('[data-item]').classList.toggle('done', on); rs.setAttribute('aria-pressed', on); rs.textContent = on ? '✓ Resolved' : '✓ Mark resolved';
      const o = $('[data-open]'); if (o) o.textContent = $$('[data-item]').filter(x => !x.classList.contains('done')).length;
      return;
    }
    const cp = t.closest('[data-copy]');
    if (cp) { const txt = cp.closest('.draft').querySelector('p').textContent; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => (cp.textContent = 'Copied ✓'), () => (cp.textContent = 'Copy failed')); setTimeout(() => (cp.textContent = 'Copy draft'), 1600); return; }
    if (t.closest('[data-ask]')) { chat.classList.add('open'); chat.removeAttribute('aria-hidden'); $('.ppa-input input').focus(); return; }
    if (t.closest('.ppa-x')) { chat.classList.remove('open'); chat.setAttribute('aria-hidden', 'true'); $('[data-ask]').focus(); return; }
    if (t.closest('[data-reset]')) return resetChat();
    const q = t.closest('.ppa-sugtop [data-i]'); if (q && !q.disabled) return ask(+q.dataset.i);
    const r = t.closest('[data-rate]');
    if (r) {
      const box = r.closest('.ppa-fb'), i = +box.dataset.fq;
      if (r.dataset.rate === 'up') { logFb({ kind: 'up', q: QS[i].q }); box.outerHTML = fbThanks(); return; }
      box.querySelectorAll('[data-rate]').forEach(x => x.classList.toggle('on', x === r));
      if (!(box.nextElementSibling && box.nextElementSibling.classList.contains('ppa-fbf'))) box.insertAdjacentHTML('afterend', fbForm(i));
      return;
    }
    const ch = t.closest('.ppa-fbf [data-reason]');
    if (ch) { ch.parentElement.querySelectorAll('[data-reason]').forEach(x => x.setAttribute('aria-pressed', x === ch)); ch.closest('.ppa-fbf').querySelector('.send').disabled = false; return; }
    const sb = t.closest('.ppa-fbf .send');
    if (sb) { const f = sb.closest('.ppa-fbf'), i = +f.dataset.fq; logFb({ kind: 'down', q: QS[i].q, reason: f.querySelector('[data-reason][aria-pressed=true]').dataset.reason, note: f.querySelector('textarea').value.trim().slice(0, 200) }); f.previousElementSibling.remove(); f.outerHTML = fbThanks(); return; }
    if (t.closest('[data-fbr]') || t.closest('[data-fbr-open]')) return openReview(t.closest('[data-fbr-open]') || $('[data-fbr-open]'));
    if (t.closest('[data-notes]')) { $('.ppa-notes').classList.toggle('open'); return; }
  });
  root.addEventListener('change', e => { if (e.target.matches('[data-region-sel]')) { st.region = e.target.value; render(); } });
  root.addEventListener('submit', e => { e.preventDefault(); const inp = $('.ppa-input input'), t = inp.value.trim(); if (t) { inp.value = ''; typed(t); } });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && chat.classList.contains('open')) $('.ppa-x').click(); });
  // bar tooltips in the daily chart
  const tipEl = $('.ceo-tip');
  root.addEventListener('mouseover', e => { const i = e.target.closest('.bars i'); if (!i) return; tipEl.textContent = i.dataset.tip; tipEl.hidden = false; const r = i.getBoundingClientRect(), rr = root.getBoundingClientRect(); tipEl.style.left = Math.min(r.left - rr.left, rr.width - 260) + 'px'; tipEl.style.top = (r.top - rr.top - 34) + 'px'; });
  root.addEventListener('mouseout', e => { if (e.target.closest('.bars i')) tipEl.hidden = true; });

  fetch(BASE + '/data/brief.json').then(x => x.json()).then(d => {
    D = d; N = D.days.length; flags = computeFlags(); asOf = flags.asOf; st.day = asOf; // open on the last complete day; ▶ shows the day still loading
    resetChat(); render();
    window.__ceo = { st, view, flags: () => flags, facts, answer, render };
    document.dispatchEvent(new CustomEvent('ceo:ready'));
  }).catch(err => {
    $('.ppa-panel').innerHTML = '<div class="ppa-card">Could not load the demo data. If you opened this file directly, serve the folder instead (for example <code>python3 -m http.server</code>).</div>';
    console.error(err);
  });
})();
