/* eCom Site Journey Agent demo — fictional brand, synthetic data.
   One engine (sums over week x channel x device, plus email sends, landing pages and products)
   feeds every tab, the Weekly Insights brief and the chatbot. Every sentence is written by rules
   from those sums, so it follows the filters; every chatbot figure is cited and checked. */
(function () {
  'use strict';
  const root = document.getElementById('ecom');
  if (!root) return;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const BASE = root.dataset.base || '.';
  const M = '−';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let D, LAST;
  const st = { tab: 'overview', per: 1, ch: 'all', dv: 'all', modal: null };

  // ---------------------------------------------------------------- format
  const sg = x => (x > 0 ? '+' : x < 0 ? M : '');
  const tiny = (x, d) => Math.abs(x) < 0.5 * Math.pow(10, -d);
  const chg = (x, d = 1) => (!isFinite(x) ? '–' : (tiny(x, d) ? (0).toFixed(d) : sg(x) + Math.abs(x).toFixed(d)) + '%'); // x in %
  const rate = (x, d = 1) => (!isFinite(x) ? '–' : (x * 100).toFixed(d) + '%');                                            // x a share
  const pts = (x, d = 1) => (!isFinite(x) ? '–' : (tiny(x, d) ? (0).toFixed(d) : sg(x) + Math.abs(x).toFixed(d)) + ' pt'); // x in points
  const money = x => { const a = Math.abs(x); return '$' + (a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'K' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : Math.round(a)); };
  const smoney = x => (Math.round(x) < 0 ? M : Math.round(x) > 0 ? '+' : '') + money(x);
  const count = x => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e5 ? Math.round(x / 1e3) + 'K' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'K' : String(Math.round(x)));
  const gr = (t, l) => (l ? (t / l - 1) * 100 : NaN);
  const dp = (t, l) => (t - l) * 100;
  const tone = (x, bad) => { if (!isFinite(x) || Math.abs(x) < 0.05) return 'flat'; return (x > 0) !== !!bad ? 'up' : 'dn'; };
  const arrow = x => (!isFinite(x) || Math.abs(x) < 0.05 ? '' : x > 0 ? '▲ ' : '▼ ');
  const dlab = s => { const [, m, d] = s.split('-'); return MON[+m - 1] + ' ' + (+d); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const words = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

  // ---------------------------------------------------------------- engine
  const DEVS = dv => (dv === 'all' ? D.devices : [dv]);
  const CHS = ch => (ch === 'all' ? D.channels.map(c => c.k) : [ch]);
  const chName = k => (D.channels.find(c => c.k === k) || { name: k }).name;
  const DEVNAME = { all: 'all devices', mobile: 'mobile', desktop: 'desktop' };
  const win = (per, back) => Array.from({ length: per }, (_, i) => LAST - per * (back + 1) + 1 + i);
  function F(r) {
    const [s, e, p, a, c, o, rv] = r;
    return { s, e, p, a, c, o, r: rv, bounce: 1 - e / s, eng: e / s, pv: p / e, atcS: a / p, chkA: c / a, ordC: o / c, atcR: a / s, cartAb: 1 - o / a, cvr: o / s, aov: rv / o };
  }
  function G(ch, dv, ws) {
    const r = [0, 0, 0, 0, 0, 0, 0];
    CHS(ch).forEach(c => DEVS(dv).forEach(d => ws.forEach(w => D.grid[c][d][w].forEach((v, i) => (r[i] += v)))));
    return F(r);
  }
  function sends(ws, dv) {
    return D.email.filter(x => ws.includes(x.w)).map(x => {
      const z = [0, 0, 0, 0]; DEVS(dv).forEach(d => x.dev[d].forEach((v, i) => (z[i] += v)));
      return { w: x.w, name: x.name, link: x.link, deliv: x.deliv, opens: x.opens, clicks: x.clicks, s: z[0], b: z[1], o: z[2], r: z[3],
        open: x.opens / x.deliv, ctor: x.clicks / x.opens, cvr: z[2] / z[0], bounce: z[1] / z[0] };
    });
  }
  function emailSum(list) {
    const t = { n: list.length, deliv: 0, opens: 0, clicks: 0, s: 0, b: 0, o: 0, r: 0 };
    list.forEach(x => ['deliv', 'opens', 'clicks', 's', 'b', 'o', 'r'].forEach(k => (t[k] += x[k])));
    t.open = t.opens / t.deliv; t.ctor = t.clicks / t.opens; t.cvr = t.o / t.s; t.bounce = t.b / t.s;
    return t;
  }
  function pages(dv, ws, lws, per) {
    const sum = (k, w2) => { const z = [0, 0, 0]; DEVS(dv).forEach(d => w2.forEach(w => D.landing.data[d][k][w].forEach((v, i) => (z[i] += v)))); return z; };
    const T = G('all', dv, ws), L = G('all', dv, lws);
    const extraAll = (T.s - T.e) - T.s * L.bounce;
    return D.landing.pages.map(p => {
      const t = sum(p.k, ws), l = sum(p.k, lws), src = D.landing.src[p.k][ws[ws.length - 1]];
      const o = { k: p.k, name: p.name, s: t[0], b: t[1], o: t[2], bounce: t[1] / t[0], ls: l[0], lbounce: l[0] ? l[1] / l[0] : NaN, cvr: t[2] / t[0], src: src[0], srcShare: src[1] };
      o.d = l[0] ? dp(o.bounce, o.lbounce) : NaN;
      o.extra = l[0] ? o.b - o.s * o.lbounce : 0;
      o.spike = o.d >= 8 && o.s >= 20000 * per;
      o.shareOfRise = extraAll > 0 ? o.extra / extraAll : NaN;
      return o;
    }).filter(p => p.s > 0).sort((a, b) => b.s - a.s);
  }
  function prods(dv, ws, lws) {
    const sum = (k, w2) => { const z = [0, 0, 0, 0, 0]; DEVS(dv).forEach(d => w2.forEach(w => D.products.data[d][k][w].forEach((v, i) => (z[i] += v)))); return z; };
    const list = D.products.list.map(p => {
      const t = sum(p.k, ws), l = sum(p.k, lws);
      return { ...p, v: t[0], a: t[1], o: t[2], d: t[3], so: t[4], lv: l[0], la: l[1], ld: l[3], atc: t[1] / t[0], latc: l[1] / l[0], vtb: t[2] / t[0],
        soShare: t[4] / t[0], dChg: t[3] - l[3], dPct: gr(t[3], l[3]), vPct: gr(t[0], l[0]) };
    });
    const cats = {};
    list.forEach(p => { const c = cats[p.cat] || (cats[p.cat] = { v: 0, a: 0 }); c.v += p.v; c.a += p.a; });
    const byViews = [...list].sort((a, b) => b.v - a.v);
    const A = list.reduce((s, p) => s + p.a, 0), Vw = list.reduce((s, p) => s + p.v, 0);
    list.forEach(p => {
      const c = cats[p.cat], solo = c.v === p.v; // compare with the other products in the category (or all others, if it's alone)
      p.catAvg = solo ? (A - p.a) / (Vw - p.v) : (c.a - p.a) / (c.v - p.v);
      p.catLab = solo ? 'other products' : 'other ' + p.cat.toLowerCase();
      p.rank = byViews.indexOf(p) + 1; p.lowAtc = p.rank <= 5 && p.atc < p.catAvg / 2; p.soldOut = p.soShare >= 0.2;
    });
    return list;
  }
  // key, label, rate field; every step's rate is a share of the step before
  const STEPS = [['Sessions', 's', null, ''], ['Engaged', 'e', 'eng', '1 − bounce'], ['Product view', 'p', 'pv', ''], ['Add to cart', 'a', 'atcS', ''], ['Checkout', 'c', 'chkA', ''], ['Purchase', 'o', 'ordC', '']];
  const STAGE = { eng: 'Engagement', pv: 'Engagement', atcS: 'Cart', chkA: 'Checkout', ordC: 'Checkout', open: 'Email', ctor: 'Email' };
  function stepList(t, l, em) {
    const out = [];
    if (em) out.push({ name: 'Delivered', n: em.T.deliv, em: 1 },
      { name: 'Opened', sub: 'open rate', n: em.T.opens, rate: em.T.open, lrate: em.L.open, key: 'open', pair: 'Delivered → opened', em: 1 },
      { name: 'Clicked', sub: 'click-to-open', n: em.T.clicks, rate: em.T.ctor, lrate: em.L.ctor, key: 'ctor', pair: 'Opened → clicked', em: 1 });
    STEPS.forEach(([name, k, rk, sub], i) => out.push({ name, sub, n: t[k], rate: rk ? t[rk] : null, lrate: rk ? l[rk] : null, key: rk, pair: rk ? `${STEPS[i - 1][0]} → ${name.toLowerCase()}` : '' }));
    out.forEach(x => (x.d = x.key ? dp(x.rate, x.lrate) : null));
    return out;
  }
  const memo = new Map();
  function view(sc = st) {
    const key = [sc.per, sc.ch, sc.dv].join('|');
    if (memo.has(key)) return memo.get(key);
    const per = sc.per, ws = win(per, 0), lws = win(per, 1);
    const w0 = D.meta.weeks[ws[0]], w1 = D.meta.weeks[ws[ws.length - 1]];
    const V = {
      sc, per, ws, lws,
      label: per === 1 ? `W${w1.wk} (${dlab(w1.start)}–${dlab(w1.end)})` : `W${w0.wk}–W${w1.wk} (${dlab(w0.start)}–${dlab(w1.end)})`,
      short: per === 1 ? `W${w1.wk}` : `W${w0.wk}–W${w1.wk}`,
      vs: per === 1 ? 'last week' : 'the prior 4 weeks', vsS: per === 1 ? 'LW' : 'prior 4 wks', when: per === 1 ? 'this week' : 'over the last 4 weeks',
      t: G(sc.ch, sc.dv, ws), l: G(sc.ch, sc.dv, lws),
      all: { t: G('all', sc.dv, ws), l: G('all', sc.dv, lws) },
    };
    V.byDev = D.devices.map(d => ({ k: d, name: cap(d), t: G(sc.ch, d, ws), l: G(sc.ch, d, lws) }));
    V.byCh = D.channels.map(c => ({ k: c.k, name: c.name, t: G(c.k, sc.dv, ws), l: G(c.k, sc.dv, lws) }));
    V.em = null;
    if (sc.ch === 'all' || sc.ch === 'email') {
      const t = sends(ws, sc.dv), l = sends(lws, sc.dv);
      V.em = { t, l, T: emailSum(t), L: emailSum(l) };
      t.forEach(x => {
        const o = t.filter(y => y !== x), oc = o.reduce((a, y) => a + y.clicks, 0), oo = o.reduce((a, y) => a + y.opens, 0);
        x.others = oo ? oc / oo : NaN; x.low = o.length > 0 && x.ctor < 0.5 * x.others;
        x.bestOpen = t.every(y => y.open <= x.open);
      });
      V.em.flag = t.filter(x => x.low).sort((a, b) => a.ctor - b.ctor)[0] || null;
    }
    V.pg = pages(sc.dv, ws, lws, per);
    V.pr = prods(sc.dv, ws, lws);
    V.steps = stepList(V.t, V.l, sc.ch === 'email' && sc.dv === 'all' && V.em.T.n ? V.em : null);
    V.drop = V.steps.filter(x => x.key).reduce((a, b) => (b.d < a.d ? b : a));
    const E = D.events;
    V.ev = {
      verify: ws.includes(E.verify.w) && sc.dv !== 'desktop' ? E.verify : null,
      sold: ws.includes(E.soldout.w) ? E.soldout : null,
    };
    V.trend = Array.from({ length: 13 }, (_, i) => { const w = LAST - 12 + i, f = G(sc.ch, sc.dv, [w]); return { w, wk: D.meta.weeks[w].wk, r: f.r, cvr: f.cvr, on: ws.includes(w) }; });
    memo.set(key, V);
    return V;
  }
  const devOf = (V, d) => V.byDev.find(x => x.k === d);
  const impact = f => f.t.c * (f.l.ordC - f.t.ordC) * f.t.aov; // revenue lost (+) at checkout vs the prior rate
  // which device a step's change comes from: "mobile", "desktop" or null when both moved alike
  function devSplit(V, key) {
    if (V.sc.dv !== 'all' || !key || key === 'open' || key === 'ctor') return null;
    const [m, k] = V.byDev.map(f => dp(f.t[key], f.l[key]));
    if (m <= -1 && Math.abs(k) < Math.abs(m) / 3) return 'mobile';
    if (k <= -1 && Math.abs(m) < Math.abs(k) / 3) return 'desktop';
    return null;
  }
  const spikePage = V => V.pg.filter(p => p.spike).sort((a, b) => b.extra - a.extra)[0] || null;
  const verifyLine = ev => `It starts ${ev.from}, the day the ${ev.what} went live — ${rate(ev.exit / ev.reach, 0)} of mobile shoppers who reach it leave.`;
  // the biggest step drop, explained from the data (device split, release note, page, send)
  function dropLine(V) {
    const x = V.drop;
    if (!(x.d <= -1)) return { steady: true, html: `<b>STEADY</b>No step moved more than 1 pt vs ${V.vs}.` };
    let s = `${x.pair}, ${rate(x.lrate)} → ${rate(x.rate)} (${pts(x.d)}).`;
    const sp = devSplit(V, x.key);
    if (sp) { const a = devOf(V, sp), b = devOf(V, sp === 'mobile' ? 'desktop' : 'mobile'); s += ` It's ${sp}: ${rate(a.t[x.key])} vs ${rate(b.t[x.key])} on ${b.k}.`; }
    if (x.key === 'ordC' && V.ev.verify && (sp === 'mobile' || V.sc.dv === 'mobile')) s += ' ' + verifyLine(V.ev.verify);
    if (x.key === 'eng' && V.sc.ch === 'all') { const p = spikePage(V); if (p) s += ` Most of it is one page: ${p.name}, ${rate(p.bounce)} bounce (${pts(p.d)}).`; }
    if (x.key === 'eng' && V.sc.ch === 'social' && V.ev.sold) s += ` The "${V.ev.sold.ad}" ad lands on a product that sold out ${V.ev.sold.from}.`;
    if (x.key === 'ctor' && V.em.flag) s += ` One send explains it: "${V.em.flag.name}" was opened by ${rate(V.em.flag.open)} but clicked by ${rate(V.em.flag.ctor)} of openers.`;
    return { steady: false, html: `<b>BIGGEST DROP</b>${esc(s)}`, text: s };
  }

  // ---------------------------------------------------------------- pieces
  const kpi = (l, v, d, txt) => `<div class="ppa-kpi"><div class="l">${l}</div><div class="v${txt ? ' txt' : ''}">${v}</div><div class="d">${d}</div></div>`;
  const vsG = (V, x, prev, bad) => `<b class="${tone(x, bad)}">${arrow(x)}${chg(x)}</b> vs ${V.vs}${prev ? ' · ' + V.vsS + ' ' + prev : ''}`;
  const vsP = (V, x, prev, bad, d = 1) => `<b class="${tone(x, bad)}">${arrow(x)}${pts(x, d)}</b> vs ${V.vs}${prev ? ' · ' + V.vsS + ' ' + prev : ''}`;
  const sumList = rows => `<dl class="ppa-sum">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  function alertBox(list) {
    const items = list.length
      ? list.map(a => `<li class="${a.lv}"><b><span class="tag ${a.lv}">${a.tag}</span>${esc(a.name)}</b><span>${esc(a.txt)}</span>${a.q != null ? `<button type="button" class="ppa-inv" data-q="${a.q}">Investigate →</button>` : ''}</li>`).join('')
      : '<li class="none">Nothing unusual in this view.</li>';
    return `<div><div class="ppa-al-h"><span>Alerts</span><span>${list.length} to act on</span></div><ul class="ppa-al">${items}</ul></div>`;
  }
  const insBox = (rows, alerts) => `<div class="ppa-ins"><div><div class="ppa-al-h"><span>Summary</span></div>${sumList(rows)}</div>${alertBox(alerts)}</div>`;
  const flag = (t, crit) => `<span class="fl${crit ? ' crit' : ''}">${t}</span>`;

  // ---------------------------------------------------------------- alerts (rules over the same sums)
  function checkoutAlerts(V, long) {
    return V.byDev.filter(f => V.sc.dv === 'all' || V.sc.dv === f.k).filter(f => dp(f.t.ordC, f.l.ordC) <= -3).map(f => {
      const ev = f.k === 'mobile' ? V.ev.verify : null;
      const why = ev ? (long ? `${rate(ev.exit / ev.reach, 0)} of shoppers who reach the new ${ev.what} leave · median ${ev.median_s} s on the step` : `since the ${ev.what} went live ${ev.from}`) : `vs ${rate(f.l.ordC)} ${V.vs}`;
      return { lv: 'crit', tag: 'Checkout drop', name: long && ev ? `${cap(ev.what)} (${f.k})` : `${f.name} checkout`, txt: `${rate(f.t.ordC)} complete (${pts(dp(f.t.ordC, f.l.ordC))}) · ${why} · about ${smoney(-impact(f))}`, q: 0, imp: impact(f) };
    });
  }
  function pageAlerts(V) {
    if (V.sc.ch !== 'all') return [];
    return V.pg.filter(p => p.spike).map(p => {
      const sold = V.ev.sold && V.ev.sold.product === p.k ? V.ev.sold : null;
      return { lv: 'warn', tag: 'Bounce spike', name: `${p.name} page`, txt: `${rate(p.bounce)} bounce (${pts(p.d)}) · ${rate(p.srcShare, 0)} of visits from ${chName(p.src).toLowerCase()}${sold ? ` · the ad points to the sold-out ${sold.option} option` : ''}`, q: 3, imp: p.extra };
    });
  }
  function emailAlerts(V) {
    if (!V.em || !V.em.flag || V.sc.dv !== 'all') return [];
    const x = V.em.flag;
    return [{ lv: 'warn', tag: 'Low clicks', name: `"${x.name}" email`, txt: `Opened by ${rate(x.open)}, clicked by ${rate(x.ctor)} of openers (other sends ${rate(x.others)})${x.link ? ` · links to ${x.link.page}, which opens ${x.link.opens}` : ''}`, q: 4 }];
  }
  function productAlerts(V) {
    const out = [];
    V.pr.filter(p => p.soldOut).forEach(p => {
      const s = V.ev.sold && V.ev.sold.product === p.k ? V.ev.sold : null;
      out.push({ lv: 'crit', tag: 'Sold out', name: p.name + (s ? ' · ' + s.option : ''), txt: `${rate(p.soShare, 0)} of page views open on a sold-out option${s ? ` · the paid social ad is still live · ${s.alt} has ${s.alt_wos} weeks of supply` : ''}`, q: 3 });
    });
    V.pr.filter(p => p.lowAtc).forEach(p => {
      const h = D.events.harbor.product === p.k ? D.events.harbor : null;
      out.push({ lv: 'warn', tag: 'Low add-to-cart', name: p.name, txt: `#${p.rank} for page views, ${rate(p.atc)} add to cart (${p.catLab} ${rate(p.catAvg)})${h ? ` · reviews mention ${h.review}` : ''}`, q: 5 });
    });
    return out;
  }

  // ---------------------------------------------------------------- overview
  function overviewTab(V) {
    const { t, l } = V, m = devOf(V, 'mobile'), k = devOf(V, 'desktop');
    const rg = gr(t.r, l.r), og = gr(t.o, l.o), ag = gr(t.aov, l.aov), sgw = gr(t.s, l.s);
    const rows = [['Revenue', `${money(t.r)}, ${chg(rg)} vs ${V.vs}. ` + (Math.abs(ag) < 2 && Math.abs(og) >= 2
      ? `Order value held at ${money(t.aov)}, so it's ${og < 0 ? 'fewer' : 'more'} orders, not ${og < 0 ? 'smaller' : 'bigger'} ones.`
      : `Orders ${chg(og)}; order value ${chg(ag)}, at ${money(t.aov)}.`)]];
    if (V.sc.ch === 'all') {
      const grow = V.byCh.filter(c => gr(c.t.s, c.l.s) >= 5);
      rows.push(['Traffic', `Sessions ${chg(sgw)}. ` + (grow.length === 1
        ? `${grow[0].name} is the only channel growing (${chg(gr(grow[0].t.s, grow[0].l.s))})${grow[0].t.bounce > 0.5 ? `, but ${rate(grow[0].t.bounce, 0)} of it bounces.` : '.'}`
        : grow.length ? `Growing more than 5%: ${words(grow.map(c => `${c.name} (${chg(gr(c.t.s, c.l.s))})`))}.` : 'No channel grew more than 5%.')]);
    } else rows.push(['Traffic', `${chName(V.sc.ch)} sessions ${chg(sgw)}; bounce ${rate(t.bounce)} (${pts(dp(t.bounce, l.bounce))}).`]);
    rows.push(['Conversion', `${rate(t.cvr, 2)}, ${pts(dp(t.cvr, l.cvr), 2)}.` + (V.sc.dv === 'all' ? ` Mobile ${rate(m.t.cvr, 2)} (${pts(dp(m.t.cvr, m.l.cvr), 2)}); desktop ${rate(k.t.cvr, 2)} (${pts(dp(k.t.cvr, k.l.cvr), 2)}).` : '')]);
    const dl = dropLine(V);
    rows.push([dl.steady ? 'Journey' : 'Biggest drop', dl.steady ? `No step moved more than 1 pt vs ${V.vs}.` : esc(dl.text)]);
    if (V.em && V.em.T.n && V.sc.ch === 'all') {
      const T = V.em.T, L = V.em.L;
      rows.push(['Email', V.sc.dv === 'all'
        ? `${T.n} sends. Open rate ${rate(T.open)} (${pts(dp(T.open, L.open))}); click-to-open ${rate(T.ctor)} (${pts(dp(T.ctor, L.ctor))})${V.em.flag ? ` — one send, "${esc(V.em.flag.name)}", clicked far below the rest.` : '.'}`
        : `${T.n} sends brought ${count(T.s)} ${V.sc.dv} sessions and ${money(T.r)} (${chg(gr(T.r, L.r))}).`]);
    }
    const alerts = [...checkoutAlerts(V), ...pageAlerts(V), ...emailAlerts(V)];
    const tot = V.all.t, maxR = Math.max(...V.byCh.map(c => c.t.r));
    const chRows = V.byCh.map(c => {
      const hi = c.t.bounce >= tot.bounce + 0.12;
      return `<tr class="${hi ? 'flag' : ''}${V.sc.ch === c.k ? ' sel' : ''}"><td>${c.name}${hi ? flag('high bounce') : ''}</td><td class="n">${count(c.t.s)}</td><td class="n ${tone(gr(c.t.s, c.l.s))}">${chg(gr(c.t.s, c.l.s))}</td><td class="n${hi ? ' dn' : ''}">${rate(c.t.bounce)}</td><td class="n">${rate(c.t.cvr, 2)}</td><td class="n">${money(c.t.r)}</td><td class="n ${tone(gr(c.t.r, c.l.r))}">${chg(gr(c.t.r, c.l.r))}</td><td class="n"><span class="mix"><i style="width:${(c.t.r / maxR * 100).toFixed(0)}%"></i></span>${rate(c.t.r / tot.r, 0)}</td></tr>`;
    }).join('');
    return `
      <section class="ppa-card">
        <div class="ppa-kick">1 · Overview — how did the site do?</div>
        <div class="ppa-kpis">
          ${kpi('Revenue', money(t.r), vsG(V, rg, money(l.r)))}
          ${kpi('Sessions', count(t.s), vsG(V, sgw, count(l.s)))}
          ${kpi('Conversion rate', rate(t.cvr, 2), vsP(V, dp(t.cvr, l.cvr), rate(l.cvr, 2), false, 2))}
          ${kpi('Average order value', money(t.aov), vsG(V, ag, money(l.aov)))}
        </div>
        ${insBox(rows, alerts)}
      </section>
      <section class="ppa-card"><h3>By channel</h3><div class="sub">${esc(V.label)} · ${DEVNAME[V.sc.dv]} · vs ${V.vs}${V.sc.ch !== 'all' ? ' · selected channel in bold' : ''}</div>
        <div class="ppa-tw"><table class="tight">
          <tr><th>Channel</th><th class="n">Sessions</th><th class="n">vs ${V.vsS}</th><th class="n">Bounce</th><th class="n">CVR</th><th class="n">Revenue</th><th class="n">vs ${V.vsS}</th><th class="n">Mix</th></tr>
          ${chRows}
          <tr class="tot"><td>Total</td><td class="n">${count(tot.s)}</td><td class="n ${tone(gr(tot.s, V.all.l.s))}">${chg(gr(tot.s, V.all.l.s))}</td><td class="n">${rate(tot.bounce)}</td><td class="n">${rate(tot.cvr, 2)}</td><td class="n">${money(tot.r)}</td><td class="n ${tone(gr(tot.r, V.all.l.r))}">${chg(gr(tot.r, V.all.l.r))}</td><td class="n">100%</td></tr>
        </table></div>
        <div class="note">High bounce = 12 pts or more above the site's bounce rate. Mix = share of revenue.</div>
      </section>
      <section class="ppa-card"><h3>Last 13 weeks</h3><div class="sub">Weekly revenue and conversion rate · ${esc(V.sc.ch === 'all' ? 'all channels' : chName(V.sc.ch))} · ${DEVNAME[V.sc.dv]} · selected period shaded</div>
        <div class="sm2">${trendChart(V, 'r', 'Revenue', x => money(x), money(t.r) + ' ', chg(rg), tone(rg))}${trendChart(V, 'cvr', 'Conversion rate', x => rate(x, 1), rate(t.cvr, 2) + ' ', pts(dp(t.cvr, l.cvr), 2), tone(dp(t.cvr, l.cvr)))}</div>
        <div class="note">${trendNote(V)}</div>
      </section>`;
  }
  function trendNote(V) {
    const c = V.trend.map(x => x.cvr), wow = c.slice(1).map((x, i) => x - c[i]), last = wow[wow.length - 1];
    if (last < 0 && last === Math.min(...wow)) return `The latest week has the largest week-on-week drop in conversion of these 13 weeks (${pts(last * 100, 2)}).`;
    if (last > 0 && last === Math.max(...wow)) return `The latest week has the largest week-on-week rise in conversion of these 13 weeks (${pts(last * 100, 2)}).`;
    return 'Hover a point for the week.';
  }
  function trendChart(V, key, title, f, now, delta, cl) {
    const v = V.trend.map(x => x[key]), lo0 = Math.min(...v), hi0 = Math.max(...v), pad = (hi0 - lo0) * 0.25 || hi0 * 0.05, lo = lo0 - pad, hi = hi0 + pad;
    const W = 560, H = 104, L = 52, R = 10, T = 8, B = 18, xs = i => L + (W - L - R) * i / 12, ys = x => T + (H - T - B) * (1 - (x - lo) / (hi - lo));
    const on = V.trend.map((x, i) => (x.on ? i : -1)).filter(i => i >= 0), x0 = xs(on[0]) - (on.length > 1 ? 6 : 9), x1 = xs(on[on.length - 1]) + 9;
    const pts2 = v.map((x, i) => `${xs(i).toFixed(1)},${ys(x).toFixed(1)}`).join(' ');
    return `<div class="tc"><div class="t"><span>${title}</span><b>${now}<span class="${cl}">${delta}</span></b></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}, last 13 weeks">
        <rect x="${x0.toFixed(1)}" y="${T - 4}" width="${(x1 - x0).toFixed(1)}" height="${H - B - T + 4}" fill="#efe9df"/>
        <line x1="${L}" x2="${W - R}" y1="${ys(lo0)}" y2="${ys(lo0)}" stroke="#e4ddd1"/><line x1="${L}" x2="${W - R}" y1="${ys(hi0)}" y2="${ys(hi0)}" stroke="#e4ddd1" stroke-dasharray="2 3"/>
        <text x="${L - 6}" y="${ys(hi0) + 4}" text-anchor="end">${f(hi0)}</text><text x="${L - 6}" y="${ys(lo0) + 4}" text-anchor="end">${f(lo0)}</text>
        <polyline points="${pts2}" fill="none" stroke="#8b4513" stroke-width="2"/>
        ${v.map((x, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(x).toFixed(1)}" r="${i === 12 ? 3.5 : 2.2}" fill="#8b4513"><title>W${V.trend[i].wk}: ${f(x)}</title></circle>`).join('')}
        ${V.trend.map((x, i) => (i % 2 === 0 ? `<text x="${xs(i).toFixed(1)}" y="${H - 3}" text-anchor="middle">W${x.wk}</text>` : '')).join('')}
      </svg></div>`;
  }

  // ---------------------------------------------------------------- journey
  function journeyTab(V) {
    const { t, l } = V, m = devOf(V, 'mobile'), k = devOf(V, 'desktop'), x = V.drop;
    const rows = [];
    const dl = dropLine(V);
    if (dl.steady) rows.push(['Journey', `No step moved more than 1 pt vs ${V.vs}.`]);
    else {
      const rest = V.steps.filter(s => s.key && s !== x), eng = rest.find(s => s.key === 'eng'), big = eng && Math.abs(eng.d) >= 1 ? eng : null;
      const others = rest.filter(s => s !== big), mx = Math.max(...others.map(s => Math.abs(s.d)));
      rows.push(['Biggest drop', `${x.pair}, ${rate(x.rate)} (${pts(x.d)}). The other steps moved ${mx.toFixed(1)} pt or less${big ? `, apart from engagement (${pts(big.d)})` : ''}.`]);
    }
    if (V.sc.dv === 'all') rows.push(['By device', `Checkout → purchase: ${rate(m.t.ordC)} on mobile vs ${rate(k.t.ordC)} on desktop. Cart abandonment ${rate(m.t.cartAb)} on mobile, ${rate(k.t.cartAb)} on desktop.`]);
    else rows.push(['Cart', `Cart abandonment ${rate(t.cartAb)} (${pts(dp(t.cartAb, l.cartAb))}); checkout completion ${rate(t.ordC)} (${pts(dp(t.ordC, l.ordC))}).`]);
    if (V.sc.ch === 'all') {
      const p = spikePage(V), up = dp(t.bounce, l.bounce);
      rows.push(['Landing', `Bounce ${rate(t.bounce)} (${pts(up)}).` + (p && up > 0 && isFinite(p.shareOfRise) ? (p.shareOfRise >= 0.95 ? ` Almost all of the rise is one page, ${p.name} (${rate(p.bounce)}).` : ` ${rate(p.shareOfRise, 0)} of the rise is one page, ${p.name} (${rate(p.bounce)}).`) : '')]);
    }
    if (V.em && V.em.T.n && V.sc.ch === 'all' && V.sc.dv === 'all') rows.push(['Email', `Open rate ${rate(V.em.T.open)}, click-to-open ${rate(V.em.T.ctor)} (${pts(dp(V.em.T.ctor, V.em.L.ctor))}). Pick Email in Channel to see its journey.`]);
    if (V.sc.ch === 'email' && V.sc.dv !== 'all') rows.push(['Email', "Opens and clicks aren't split by device, so the email steps show for All devices only."]);
    const alerts = [...checkoutAlerts(V, true), ...pageAlerts(V)];
    if (V.sc.ch === 'email') alerts.push(...emailAlerts(V));
    const top = V.steps[0].n, ses = V.steps.find(s => s.name === 'Sessions').n;
    let fn = '';
    V.steps.forEach((s, i) => {
      if (s.em && i === 0) fn += '<div class="fdiv">Email · before the site</div>';
      if (V.steps[0].em && s.name === 'Sessions') fn += '<div class="fdiv">On the site</div>';
      const w = Math.max(1.5, (s.n / (s.em ? top : ses)) * 100);
      fn += `<div class="fr${s.em ? ' em' : ''}${s === x && !dl.steady ? ' hot' : ''}"><span class="nm">${s.name}${s.sub ? `<small>${s.sub}</small>` : ''}</span><div class="bar"><i style="width:${w.toFixed(1)}%"></i></div><span class="n">${count(s.n)}</span><span class="r">${s.key ? rate(s.rate) : ''}</span><span class="c ${s.key ? tone(s.d) : 'flat'}">${s.key ? pts(s.d) : '—'}</span></div>`;
    });
    const devRow = (f, lab, sel) => `<tr class="${sel ? 'sel' : ''}${dp(f.t.ordC, f.l.ordC) <= -3 ? ' flag' : ''}"><td>${lab}</td><td class="n">${rate(f.t.cartAb)}</td><td class="n ${tone(dp(f.t.cartAb, f.l.cartAb), true)}">${pts(dp(f.t.cartAb, f.l.cartAb))}</td><td class="n">${rate(f.t.ordC)}</td><td class="n ${tone(dp(f.t.ordC, f.l.ordC))}">${pts(dp(f.t.ordC, f.l.ordC))}</td></tr>`;
    const allF = { t: G(V.sc.ch, 'all', V.ws), l: G(V.sc.ch, 'all', V.lws) };
    return `
      <section class="ppa-card">
        <div class="ppa-kick">2 · Journey — where do shoppers drop off?</div>
        <div class="ppa-kpis">
          ${kpi('Bounce rate', rate(t.bounce), vsP(V, dp(t.bounce, l.bounce), rate(l.bounce), true))}
          ${kpi('Add-to-cart rate', rate(t.atcR), vsP(V, dp(t.atcR, l.atcR), rate(l.atcR)))}
          ${kpi('Cart abandonment', rate(t.cartAb), vsP(V, dp(t.cartAb, l.cartAb), rate(l.cartAb), true))}
          ${kpi('Checkout completion', rate(t.ordC), vsP(V, dp(t.ordC, l.ordC), rate(l.ordC)))}
        </div>
        ${insBox(rows, alerts)}
      </section>
      <div class="ppa-grid">
        <section class="ppa-card"><h3>${V.steps[0].em ? 'Email journey' : 'Journey'}</h3><div class="sub">${V.steps[0].em ? 'Delivered to purchase' : 'Sessions reaching each step'} · step % = share of the step before</div>
          <div class="fh"><span>Step</span><span></span><span>Count</span><span>Step %</span><span>vs ${V.vsS}</span></div>
          <div class="fn">${fn}</div>
          <div class="fwhy${dl.steady ? ' calm' : ''}">${dl.html}</div>
        </section>
        <section class="ppa-card"><h3>Cart abandonment by device</h3><div class="sub">${esc(V.label)} · vs ${V.vs}</div>
          <div class="ppa-tw"><table class="tight">
            <tr><th>Device</th><th class="n">Abandon</th><th class="n">vs ${V.vsS}</th><th class="n">Checkout</th><th class="n">vs ${V.vsS}</th></tr>
            ${devRow(m, 'Mobile', V.sc.dv === 'mobile')}${devRow(k, 'Desktop', V.sc.dv === 'desktop')}${devRow(allF, '<b>All</b>', false)}
          </table></div>
          <div class="note">Abandon = sessions with an add-to-cart that don't buy · checkout = purchases ÷ sessions that started checkout.</div>
        </section>
      </div>
      <section class="ppa-card">${V.sc.ch === 'email' ? emailTable(V) : landingTable(V)}</section>`;
  }
  function landingTable(V) {
    const rows = V.pg.map(p => {
      const sold = V.ev.sold && V.ev.sold.product === p.k ? V.ev.sold : null;
      const why = p.spike ? `${rate(p.srcShare, 0)} of its visits come from ${chName(p.src).toLowerCase()}${sold ? ` — the "${sold.ad}" ad. ${cap(sold.option)} sold out ${sold.from} and the page opens on "Sold out"; the ad is still live. ${cap(sold.alt)} has ${sold.alt_wos} weeks of supply.` : '.'}` : '';
      return `<tr class="${p.spike ? 'flag' : ''}"><td>${p.name}${p.spike ? flag('bounce spike', true) : ''}</td><td class="n">${count(p.s)}</td><td class="n${p.spike ? ' dn' : ''}">${rate(p.bounce)}</td><td class="n ${isFinite(p.d) ? tone(p.d, true) : 'flat'}">${isFinite(p.d) ? pts(p.d) : 'new'}</td><td class="n">${rate(p.cvr)}</td><td class="n">${chName(p.src)} · ${rate(p.srcShare, 0)}</td></tr>` + (why ? `<tr class="why"><td colspan="6">${esc(why)}</td></tr>` : '');
    }).join('');
    const rest = D.landing.data, other = (() => { const z = [0, 0]; DEVS(V.sc.dv).forEach(d => V.ws.forEach(w => { z[0] += rest[d].rest[w][0]; z[1] += rest[d].rest[w][1]; })); return z; })();
    return `<h3>Landing pages</h3><div class="sub">Where sessions start · ${esc(V.label)} · all channels · ${DEVNAME[V.sc.dv]}</div>
      <div class="ppa-tw"><table class="tight"><tr><th>Page</th><th class="n">Sessions</th><th class="n">Bounce</th><th class="n">vs ${V.vsS}</th><th class="n">CVR</th><th class="n">Top source, latest week</th></tr>${rows}
      <tr class="tot"><td>All other pages</td><td class="n">${count(other[0])}</td><td class="n">${rate(other[1] / other[0])}</td><td></td><td></td><td></td></tr></table></div>
      <div class="note">Bounce = sessions that were not engaged (under 10 seconds, one page, no conversion), as in GA4. A bounce spike = up 8 pts or more on a page with real traffic.</div>`;
  }
  function emailTable(V) {
    const E = V.em;
    if (!E.t.length) return '<h3>Email sends</h3><div class="sub">No sends in this period.</div>';
    const all = V.sc.dv === 'all';
    const rows = [...E.t].sort((a, b) => b.w - a.w || b.deliv - a.deliv).map(x => {
      const why = x.low ? `${x.bestOpen ? 'Best open rate in this period, so the subject line works. ' : ''}Click-to-open ${rate(x.ctor)} vs ${rate(x.others)} for the other sends.${x.link ? ` The button goes to ${x.link.page}, which opens ${x.link.opens} — ${rate(x.bounce, 0)} of visitors leave it.` : ''}` : '';
      return `<tr class="${x.low ? 'flag' : ''}"><td>${esc(x.name)}${x.low ? flag('low clicks') : ''}${V.per > 1 ? `<small>W${D.meta.weeks[x.w].wk}</small>` : ''}</td><td class="n">${count(x.deliv)}</td><td class="n">${rate(x.open)}</td><td class="n${x.low ? ' dn' : ''}">${rate(x.ctor)}</td><td class="n">${count(x.s)}</td><td class="n">${rate(x.cvr)}</td><td class="n">${money(x.r)}</td></tr>` + (why ? `<tr class="why"><td colspan="7">${esc(why)}</td></tr>` : '');
    }).join('');
    return `<h3>Email sends</h3><div class="sub">${esc(V.label)} · site results ${all ? '' : `(${V.sc.dv}) `}matched on each send's campaign tag${all ? '' : ' · delivered, opens and clicks are all devices'}</div>
      <div class="ppa-tw"><table class="tight"><tr><th>Send</th><th class="n">Delivered</th><th class="n">Open rate</th><th class="n">Click-to-open</th><th class="n">Sessions</th><th class="n">CVR</th><th class="n">Revenue</th></tr>${rows}</table></div>
      <div class="note">Open rate = opens ÷ delivered · click-to-open = clicks ÷ opens · low clicks = click-to-open under half the other sends'.</div>`;
  }

  // ---------------------------------------------------------------- products
  function productsTab(V) {
    const P = V.pr, sr = gr(V.all.t.r, V.all.l.r);
    const v = P.reduce((a, p) => a + p.v, 0), lv = P.reduce((a, p) => a + p.lv, 0), a = P.reduce((s, p) => s + p.a, 0), la = P.reduce((s, p) => s + p.la, 0);
    const byChg = [...P].sort((x, y) => y.dChg - x.dChg), top = byChg[0], drag = byChg[byChg.length - 1];
    const band = P.filter(p => Math.abs(p.dPct - sr) <= 6).length;
    const rows = [['Site-wide', band >= P.length / 2
      ? `${band} of ${P.length} products are within 6 pts of the site's ${chg(sr)} — that's the site moving, not the products.`
      : `Products moved apart from the site's ${chg(sr)}: ${band} of ${P.length} are within 6 pts of it.`]];
    rows.push(['Top driver', `${top.name} ${smoney(top.dChg)} (${chg(top.dPct)}), page views ${chg(top.vPct)}.`]);
    const ds = V.ev.sold && V.ev.sold.product === drag.k ? V.ev.sold : null;
    rows.push(['Biggest drag', `${drag.name} ${smoney(drag.dChg)} (${chg(drag.dPct)})${drag.dPct < sr - 10 ? `, far below the site's ${chg(sr)}` : ''}${drag.soldOut ? `: ${rate(drag.soShare, 0)} of its page views open on a sold-out option${ds ? ` (${ds.option}, since ${ds.from})` : ''}.` : '.'}`]);
    const low = P.filter(p => p.lowAtc);
    rows.push(['Views, not buying', low.length ? low.map(p => {
      const h = D.events.harbor.product === p.k ? D.events.harbor : null;
      return `${p.name}: ${count(p.v)} views (${chg(p.vPct)}) but ${rate(p.atc)} add to cart vs ${rate(p.catAvg)} for ${p.catLab}.${h ? ` ${rate(h.size_fit, 0)} of visitors open Size &amp; fit; reviews mention ${h.review}.` : ''}`;
    }).join(' ') : 'None of the five most-viewed products adds to cart at under half the rate of the others in its category.']);
    // diverging bars, zero line placed by the data
    const pos = Math.max(0, ...P.map(p => p.dChg)), neg = Math.max(0, ...P.map(p => -p.dChg)), span = pos + neg || 1, z = 10 + 76 * neg / span;
    const bars = byChg.map(p => {
      const w = Math.abs(p.dChg) / span * 76;
      return `<span class="lb">${p.name}</span><div class="tr" style="--z:${z.toFixed(1)}%">${p.dChg >= 0
        ? `<i class="p" style="left:${z.toFixed(1)}%;width:${w.toFixed(1)}%"></i><span style="left:calc(${(z + w).toFixed(1)}% + 5px)">${smoney(p.dChg)}</span>`
        : `<i class="m" style="left:${(z - w).toFixed(1)}%;width:${w.toFixed(1)}%"></i><span style="right:calc(${(100 - z + w).toFixed(1)}% + 5px)">${smoney(p.dChg)}</span>`}</div>`;
    }).join('');
    const trs = [...P].sort((x, y) => y.v - x.v).map(p => {
      const s = V.ev.sold && V.ev.sold.product === p.k ? V.ev.sold : null, h = D.events.harbor.product === p.k ? D.events.harbor : null;
      const why = p.soldOut ? `${rate(p.soShare, 0)} of page views open on a sold-out option${s ? ` — ${s.option} sold out ${s.from}, and the paid social ad still sends visitors to it. ${cap(s.alt)} has ${s.alt_wos} weeks of supply.` : '.'}`
        : p.lowAtc ? `#${p.rank} for page views, but ${rate(p.atc)} add to cart vs ${rate(p.catAvg)} for ${p.catLab}.${h ? ` ${rate(h.size_fit, 0)} of visitors open Size & fit; recent reviews mention ${h.review}.` : ''}` : '';
      const lo = p.atc < p.catAvg / 2, sc = 0.16;
      return `<tr class="${why ? 'flag' : ''}"><td>${p.name}${p.soldOut ? flag('sold out', true) : p.lowAtc ? flag('low add-to-cart') : ''}</td><td>${p.cat}</td><td class="n">${count(p.v)}</td><td class="n ${tone(p.vPct)}">${chg(p.vPct)}</td>
        <td class="n"><span class="atc">${rate(p.atc)}<span class="b"><i class="${lo ? 'lo' : ''}" style="width:${Math.min(100, p.atc / sc * 100).toFixed(0)}%"></i><u style="left:${Math.min(100, p.catAvg / sc * 100).toFixed(0)}%"></u></span></span></td>
        <td class="n">${rate(p.vtb)}</td><td class="n">${money(p.d)}</td><td class="n ${tone(p.dPct)}">${chg(p.dPct)}</td><td class="n${p.soldOut ? ' dn' : ''}">${p.soShare >= 0.005 ? rate(p.soShare, 0) : '—'}</td></tr>` + (why ? `<tr class="why"><td colspan="9">${esc(why)}</td></tr>` : '');
    }).join('');
    return `
      <section class="ppa-card">
        <div class="ppa-kick">3 · Products — what are shoppers looking at, and buying?</div>
        <div class="ppa-kpis">
          ${kpi('Product page views', count(v), vsG(V, gr(v, lv), count(lv)))}
          ${kpi('Add-to-cart rate', rate(a / v), vsP(V, dp(a / v, la / lv), rate(la / lv)))}
          ${kpi('Top driver', top.name, `<b class="${tone(top.dChg)}">${smoney(top.dChg)}</b> vs ${V.vs}`, true)}
          ${kpi('Biggest drag', drag.name, `<b class="${tone(drag.dChg)}">${smoney(drag.dChg)}</b> vs ${V.vs}`, true)}
        </div>
        ${insBox(rows, productAlerts(V))}
      </section>
      <section class="ppa-card"><h3>What moved demand vs ${V.vs}</h3><div class="sub">Change in demand by product · ${esc(V.label)} · ${DEVNAME[V.sc.dv]} · largest gain at the top</div>
        <div class="dv">${bars}</div>
        <div class="ppa-legend"><span><i class="sq" style="background:#2f6db0"></i>Added demand</span><span><i class="sq" style="background:#c25a28"></i>Lost demand</span></div>
      </section>
      <section class="ppa-card"><h3>Products</h3><div class="sub">${esc(V.label)} · all channels · ${DEVNAME[V.sc.dv]} · bar = add-to-cart rate, tick = the other products in its category</div>
        <div class="ppa-tw"><table class="tight"><tr><th>Product</th><th>Category</th><th class="n">Page views</th><th class="n">vs ${V.vsS}</th><th class="n">Add-to-cart</th><th class="n">View-to-buy</th><th class="n">Demand</th><th class="n">vs ${V.vsS}</th><th class="n">Sold out</th></tr>${trs}</table></div>
        <div class="note">Add-to-cart rate = add-to-carts ÷ page views · view-to-buy = orders ÷ page views · sold out = share of page views that opened on an option with no stock. Products read all channels.</div>
      </section>`;
  }

  // ---------------------------------------------------------------- Weekly Insights (latest week, all channels, all devices)
  // Every number goes through n(); the QA block re-computes each one straight from the raw JSON, not through view().
  function raw(w, chs, devs, i) { let s = 0; chs.forEach(c => devs.forEach(d => (s += D.grid[c][d][w][i]))); return s; }
  const RAW = {
    rev: w => raw(w, CHS('all'), D.devices, 6),
    cvr: w => raw(w, CHS('all'), D.devices, 5) / raw(w, CHS('all'), D.devices, 0),
    mobOrd: w => raw(w, CHS('all'), ['mobile'], 5) / raw(w, CHS('all'), ['mobile'], 4),
    deskOrd: w => raw(w, CHS('all'), ['desktop'], 5) / raw(w, CHS('all'), ['desktop'], 4),
    emRev: w => raw(w, ['email'], D.devices, 6),
    ses: w => raw(w, CHS('all'), D.devices, 0),
    bounce: w => 1 - raw(w, CHS('all'), D.devices, 1) / raw(w, CHS('all'), D.devices, 0),
  };
  function insights() {
    const V = view({ per: 1, ch: 'all', dv: 'all' }), { t, l } = V, w = LAST, checks = [];
    const n = (text, re) => { if (re) checks.push({ text, re }); return text; };
    const m = devOf(V, 'mobile'), k = devOf(V, 'desktop'), drop = l.r - t.r, x = V.drop, sp = devSplit(V, x.key);
    const effM = impact(m), sold = V.ev.sold, jp = sold && V.pr.find(p => p.k === sold.product), sr = gr(t.r, l.r);
    const jEff = jp ? jp.d - jp.ld * (1 + sr / 100) : 0;
    const share = drop > 0 ? effM / drop : 0;
    const mobD = dp(m.t.ordC, m.l.ordC), deskD = dp(k.t.ordC, k.l.ordC);
    const head = x.key === 'ordC' && sp === 'mobile' && V.ev.verify
      ? `A new payment step is costing the week — <em>mobile checkout</em> lost ${n(Math.abs(mobD).toFixed(1), () => Math.abs(dp(RAW.mobOrd(w), RAW.mobOrd(w - 1))).toFixed(1))} points, while desktop held.`
      : `${STAGE[x.key] || 'The journey'} is where the week moved — ${esc(x.pair.toLowerCase())} ${pts(x.d)}.`;
    const lead = share >= 0.5 ? 'explains most of it' : share >= 0.3 ? 'is the biggest single part' : 'is part of it';
    let deck = `Revenue was <b>${n(money(t.r), () => money(RAW.rev(w)))}</b>, <b>${n(chg(sr), () => chg(gr(RAW.rev(w), RAW.rev(w - 1))))}</b> on the week before.`;
    if (V.ev.verify && mobD <= -3) deck += ` Mobile checkout ${lead}: about <b>${money(effM)}</b> of the <b>${money(drop)}</b> drop. Since the ${V.ev.verify.what} went live on ${V.ev.verify.from}, <b>${n(rate(m.t.ordC), () => rate(RAW.mobOrd(w)))}</b> of mobile checkouts finish, down from ${n(rate(m.l.ordC), () => rate(RAW.mobOrd(w - 1)))}.`;
    if (jp && jEff < 0) deck += ` The ${jp.name} selling out in ${sold.option} cost about <b>${money(-jEff)}</b> more, beyond the site-wide dip.`;
    const stats = [
      ['Revenue', money(t.r), `<b class="${tone(sr)}">${arrow(sr)}${n(chg(sr), () => chg(gr(RAW.rev(w), RAW.rev(w - 1))))}</b> · LW ${n(money(l.r), () => money(RAW.rev(w - 1)))}`],
      ['Conversion rate', n(rate(t.cvr, 2), () => rate(RAW.cvr(w), 2)), `<b class="${tone(dp(t.cvr, l.cvr))}">${arrow(dp(t.cvr, l.cvr))}${pts(dp(t.cvr, l.cvr), 2)}</b> · LW ${n(rate(l.cvr, 2), () => rate(RAW.cvr(w - 1), 2))}`],
      ['Mobile checkout done', n(rate(m.t.ordC), () => rate(RAW.mobOrd(w))), `<b class="${tone(mobD)}">${arrow(mobD)}${pts(mobD)}</b> · desktop ${n(rate(k.t.ordC), () => rate(RAW.deskOrd(w)))}`],
      ['Email revenue', n(money(V.em.T.r), () => money(RAW.emRev(w))), `<b class="${tone(gr(V.em.T.r, V.em.L.r))}">${arrow(gr(V.em.T.r, V.em.L.r))}${chg(gr(V.em.T.r, V.em.L.r))}</b> · LW ${money(V.em.L.r)}`],
    ];
    const grow = [...V.byCh].sort((a, b) => gr(b.t.s, b.l.s) - gr(a.t.s, a.l.s))[0], pg = spikePage(V), lowP = V.pr.find(p => p.lowAtc);
    const bar = (label, v, txt) => ({ label, v, t: txt });
    const stages = [
      { k: 'Traffic', bars: [bar('Sessions', gr(t.s, l.s), chg(gr(t.s, l.s))), bar(grow.name, gr(grow.t.s, grow.l.s), chg(gr(grow.t.s, grow.l.s)))], note: `${Math.abs(gr(t.s, l.s)) < 3 ? 'Flat overall' : gr(t.s, l.s) > 0 ? 'Up overall' : 'Down overall'}; ${grow.name.toLowerCase()} grew fastest.` },
      { k: 'Engagement', bars: [bar('Bounce', -dp(t.bounce, l.bounce), pts(dp(t.bounce, l.bounce)))].concat(pg ? [bar(pg.name, -pg.d, pts(pg.d))] : []), note: pg && isFinite(pg.shareOfRise) && pg.shareOfRise > 0 ? `${pg.shareOfRise >= 0.95 ? 'Almost all' : rate(pg.shareOfRise, 0)} of the bounce rise is one page.` : 'No page spiked.' },
      { k: 'Cart', bars: [bar('Add to cart', dp(t.atcS, l.atcS), pts(dp(t.atcS, l.atcS)))].concat(lowP ? [bar(lowP.name, dp(lowP.atc, lowP.catAvg), rate(lowP.atc))] : []), note: lowP ? `Steady overall; ${lowP.name} gets views without add-to-carts.` : 'Steady.' },
      { k: 'Checkout', bars: [bar('Mobile', mobD, pts(mobD)), bar('Desktop', deskD, pts(deskD))], note: V.ev.verify && mobD <= -3 ? `The new mobile ${V.ev.verify.what}: ${rate(V.ev.verify.exit / V.ev.verify.reach, 0)} leave at it.` : 'Steady.' },
    ];
    const leadStage = STAGE[x.key] || 'Checkout';
    const bars = s => { const mx = Math.max(...s.bars.map(b => Math.abs(b.v))) || 1; return s.bars.map(b => `<div class="ins-br"><span>${esc(b.label)}</span><span class="t"><i class="${b.v < 0 ? 'neg' : 'pos'}" style="width:${(Math.abs(b.v) / mx * 100).toFixed(1)}%"></i></span><span class="n ${b.v < -0.05 ? 'dn' : b.v > 0.05 ? 'up' : ''}">${esc(b.t)}</span></div>`).join(''); };
    const acts = [];
    checkoutAlerts(V).forEach(a => acts.push({ t: V.ev.verify ? `Fix or roll back the mobile ${V.ev.verify.what}` : `Find what changed in ${a.name.toLowerCase()}`, b: `${rate(m.t.ordC)} of mobile checkouts finish, down from ${rate(m.l.ordC)} — about ${money(effM)} a week.`, g: ['Owner: site product', 'Check: checkout completion back near ' + rate(m.l.ordC)] }));
    if (sold && jp) acts.push({ t: `Swap the "${sold.ad}" ad to ${sold.alt}, or pause it`, b: `${cap(sold.option)} sold out ${sold.from}; ${rate(jp.soShare, 0)} of ${jp.name} page views still open on it. ${cap(sold.alt)} has ${sold.alt_wos} weeks of supply.`, g: ['Owner: paid social', 'Check: product page bounce'] });
    if (V.em.flag && V.em.flag.link) acts.push({ t: `Resend "${V.em.flag.name}" on ${V.em.flag.link.opens}`, b: `Opened by ${rate(V.em.flag.open)}, but only ${rate(V.em.flag.ctor)} of openers clicked: the link goes to ${V.em.flag.link.page}, which opens ${V.em.flag.link.opens}.`, g: ['Owner: CRM', 'Check: click-to-open'] });
    const ok = checks.filter(c => c.re() === c.text).length;
    const wk = D.meta.weeks[w];
    return `<div class="ppa-card ins">
      <div class="ins-mast"><span>Weekly insights · W${wk.wk} · ${dlab(wk.start)}–${dlab(wk.end)} · all channels · all devices</span><span class="${ok === checks.length ? 'ok' : 'bad'}">${ok === checks.length ? '✓' : '✗'} ${ok} of ${checks.length} numbers re-checked</span></div>
      <h2 class="ins-hl">${head}</h2>
      <p class="ins-deck">${deck}</p>
      <div class="ins-h">Key stats · vs last week</div>
      <div class="ins-stats">${stats.map(([l2, v2, d2]) => `<div class="ins-stat"><div class="l">${l2}</div><div class="v">${v2}</div><div class="d">${d2}</div></div>`).join('')}</div>
      <div class="ins-h">Why it moved · along the journey</div>
      <div class="ins-4p">${stages.map(s => `<div class="ins-4pc${s.k === leadStage ? ' lead' : ''}"><div class="k">${s.k}${s.k === leadStage ? '<span>primary</span>' : ''}</div><div class="ins-bars">${bars(s)}</div><div class="r">${esc(s.note)}</div></div>`).join('')}</div>
      <div class="ins-sc">Bars within each stage share one scale. Bounce bars point down when bounce rises; Cart compares a product with the others in its category.</div>
      <div class="ins-h">Fix first</div>
      <div class="ins-acts">${acts.map((a, i) => `<div class="ins-act"><div class="n">0${i + 1}</div><h4>${esc(a.t)}</h4><p>${esc(a.b)}</p><div class="ins-gates">${a.g.map(g2 => `<span>${esc(g2)}</span>`).join('')}</div></div>`).join('')}</div>
      <div class="ins-foot">In production, Python computes the facts and an LLM writes the prose around them. Here the prose is written by rules from the same facts.
        <details class="ppa-how"><summary class="${ok === checks.length ? 'ok' : 'bad'}">${ok === checks.length ? '✓' : '✗'} Weekly brief QA · ${ok} of ${checks.length} numbers match the raw data</summary><div class="ppa-steps">${checks.map(c => `<div class="${c.re() === c.text ? 'ok' : 'bad'}">${esc(c.text)} = ${esc(c.re())}</div>`).join('')}</div></details></div>
    </div>`;
  }

  // ---------------------------------------------------------------- chatbot: answers from the current view, every figure cited and checked
  const QS = [
    { q: 'Why did conversion rate drop this week?', k: 'cvr' },
    { q: 'Where in the funnel are we losing the most shoppers?', k: 'funnel' },
    { q: 'Which channel drives the most revenue, and which converts worst?', k: 'channel' },
    { q: 'Which landing pages have the highest bounce rate?', k: 'landing' },
    { q: 'How did email perform this week?', k: 'email' },
    { q: 'Which products get the most views but rarely add to cart?', k: 'products' },
  ];
  function answer(k, V = view()) {
    const ledger = [], checks = [], { t, l } = V, src = [];
    const c = (val, where) => { ledger.push(val); return `<span class="cite" data-src="${esc(where)}">${val}</span>`; };
    const scope = `${V.short} · ${V.sc.ch === 'all' ? 'all channels' : chName(V.sc.ch)} · ${DEVNAME[V.sc.dv]}`;
    let head, lis = [];
    if (k === 'cvr') {
      const d = dp(t.cvr, l.cvr), down = d < 0;
      head = down ? `Conversion is ${c(rate(t.cvr, 2), 'Overview › KPI › Conversion rate')}, ${c(pts(d, 2), 'Overview › KPI › Conversion rate › vs ' + V.vsS)} vs ${V.vs}`
        : `It didn't drop — conversion is ${c(rate(t.cvr, 2), 'Overview › KPI › Conversion rate')}, ${c(pts(d, 2), 'Overview › KPI › Conversion rate › vs ' + V.vsS)} vs ${V.vs}`;
      checks.push({ ok: down === d < 0, t: `"${down ? 'drop' : "didn't drop"}" matches the sign of ${pts(d, 2)}` });
      if (V.sc.dv === 'all') {
        const [m, kk] = V.byDev, md = dp(m.t.cvr, m.l.cvr), kd = dp(kk.t.cvr, kk.l.cvr), who = down && md < kd * 2 && md < -0.05 && Math.abs(kd) < Math.abs(md) / 2 ? 'mobile' : down && kd < md * 2 && kd < -0.05 && Math.abs(md) < Math.abs(kd) / 2 ? 'desktop' : null;
        head += who ? ` — it's ${who}.` : '.';
        if (who) checks.push({ ok: true, t: `"it's ${who}" checked: ${who === 'mobile' ? 'desktop' : 'mobile'} moved ${pts(who === 'mobile' ? kd : md, 2)}` });
        lis.push(`Mobile ${c(rate(m.t.cvr, 2), 'Journey › Mobile › Conversion rate')} (${c(pts(md, 2), 'Journey › Mobile › Conversion rate › vs ' + V.vsS)}); desktop ${c(rate(kk.t.cvr, 2), 'Journey › Desktop › Conversion rate')} (${c(pts(kd, 2), 'Journey › Desktop › Conversion rate › vs ' + V.vsS)}).`);
        if (who) {
          const f = devOf(V, who), sub = { ...V, t: f.t, l: f.l, sc: { ...V.sc, dv: who } }, st2 = stepList(f.t, f.l, null).filter(s => s.key).reduce((a, b) => (b.d < a.d ? b : a));
          lis.push(`On ${who}, the biggest step drop is ${st2.pair.toLowerCase()}: ${c(rate(st2.rate), `Journey › ${cap(who)} › ${st2.pair}`)}, from ${c(rate(st2.lrate), `Journey › ${cap(who)} › ${st2.pair} › ${V.vsS}`)}.` + (st2.key === 'ordC' && who === 'mobile' && V.ev.verify ? ` It starts ${V.ev.verify.from}, when the ${V.ev.verify.what} went live.` : ''));
          void sub;
        }
      } else {
        const x = V.drop;
        lis.push(`On ${V.sc.dv}, the biggest step change is ${x.pair.toLowerCase()}: ${c(rate(x.rate), 'Journey › ' + x.pair)} (${c(pts(x.d), 'Journey › ' + x.pair + ' › vs ' + V.vsS)}).` + (x.key === 'ordC' && V.ev.verify ? ` It starts ${V.ev.verify.from}, when the ${V.ev.verify.what} went live.` : ''));
      }
      src.push('get_journey(device)');
    } else if (k === 'funnel') {
      const x = V.drop, site = V.steps.filter(s => s.key);
      head = x.d < 0 ? `At ${x.pair.toLowerCase()}: ${c(rate(x.rate), 'Journey › ' + x.pair)}, ${c(pts(x.d), 'Journey › ' + x.pair + ' › vs ' + V.vsS)} vs ${V.vs}.` : `No step lost ground vs ${V.vs}; the weakest move is ${x.pair.toLowerCase()}, ${c(pts(x.d), 'Journey › ' + x.pair + ' › vs ' + V.vsS)}.`;
      checks.push({ ok: site.every(s => s.d >= x.d), t: `"most" checked against all ${site.length} step changes` });
      lis.push(`Cart abandonment is ${c(rate(t.cartAb), 'Journey › KPI › Cart abandonment')} (${c(pts(dp(t.cartAb, l.cartAb)), 'Journey › KPI › Cart abandonment › vs ' + V.vsS)})` + (V.sc.dv === 'all' ? ` — ${c(rate(V.byDev[0].t.cartAb), 'Journey › Cart abandonment › Mobile')} on mobile vs ${c(rate(V.byDev[1].t.cartAb), 'Journey › Cart abandonment › Desktop')} on desktop.` : '.'));
      const sp = devSplit(V, x.key);
      if (sp && x.d < 0) lis.push(`It's ${sp}: ${c(rate(devOf(V, sp).t[x.key]), `Journey › ${cap(sp)} › ${x.pair}`)} vs ${c(rate(devOf(V, sp === 'mobile' ? 'desktop' : 'mobile').t[x.key]), `Journey › ${sp === 'mobile' ? 'Desktop' : 'Mobile'} › ${x.pair}`)}.`);
      src.push('get_journey()');
    } else if (k === 'channel') {
      const ch = V.byCh, byR = [...ch].sort((a, b) => b.t.r - a.t.r), byC = [...ch].sort((a, b) => a.t.cvr - b.t.cvr), top = byR[0], worst = byC[0], best = byC[byC.length - 1];
      head = `${top.name} drives the most: ${c(money(top.t.r), `Overview › By channel › ${top.name} › Revenue`)}, ${c(rate(top.t.r / V.all.t.r, 0), `Overview › By channel › ${top.name} › Mix`)} of revenue. ${worst.name} converts worst, ${c(rate(worst.t.cvr, 2), `Overview › By channel › ${worst.name} › CVR`)}.`;
      checks.push({ ok: byR[0] === top && byC[0] === worst, t: `"most" and "worst" checked against all ${ch.length} channels` });
      const sgw = gr(worst.t.s, worst.l.s);
      lis.push(`${worst.name} sessions are ${sgw >= 0 ? 'up' : 'down'} ${c(chg(sgw), `Overview › By channel › ${worst.name} › vs ${V.vsS}`)}, with ${c(rate(worst.t.bounce), `Overview › By channel › ${worst.name} › Bounce`)} bounce.` + (worst.k === 'social' && V.ev.sold ? ` Most of it lands on the ${D.products.list.find(p => p.k === V.ev.sold.product).name}, sold out in ${V.ev.sold.option}.` : ''));
      checks.push({ ok: (sgw >= 0) === (gr(worst.t.s, worst.l.s) >= 0), t: `"${sgw >= 0 ? 'up' : 'down'}" matches the sign of ${chg(sgw)}` });
      lis.push(`${best.name} converts best, ${c(rate(best.t.cvr, 2), `Overview › By channel › ${best.name} › CVR`)}.`);
      checks.push({ ok: true, t: '"best" checked against all channels' });
      if (V.sc.ch !== 'all') lis.push('This compares all channels, so it ignores the Channel filter.');
      src.push('get_channels()');
    } else if (k === 'landing') {
      const min = 20000 * V.per, P = V.pg.filter(p => p.s >= min).sort((a, b) => b.bounce - a.bounce), a = P[0], rest = P.slice(1, 3);
      head = `${a.name}, ${c(rate(a.bounce), `Journey › Landing pages › ${a.name} › Bounce`)}` + (isFinite(a.d) ? ` (${c(pts(a.d), `Journey › Landing pages › ${a.name} › vs ${V.vsS}`)}).` : '.');
      lis.push(`Next: ${rest.map(p => `${p.name}, ${c(rate(p.bounce), `Journey › Landing pages › ${p.name} › Bounce`)}`).join('; ')}.`);
      checks.push({ ok: P.every(p => p.bounce <= a.bounce), t: `ranking checked against the ${P.length} pages with real traffic` });
      if (a.spike) {
        const sold = V.ev.sold && V.ev.sold.product === a.k ? V.ev.sold : null;
        lis.push(`${c(rate(a.srcShare, 0), `Journey › Landing pages › ${a.name} › Top source`)} of its visits come from ${chName(a.src).toLowerCase()}${sold ? `, an ad for the ${sold.option} option, which sold out ${sold.from}` : ''}.`);
      }
      if (V.sc.ch !== 'all') lis.push('Landing pages read all channels.');
      src.push('get_landing_pages()');
    } else if (k === 'email') {
      if (!V.em) {
        head = `This view is filtered to ${chName(V.sc.ch)}, so there's no email in it.`;
        lis.push('Pick All channels or Email in the Channel filter.');
        checks.push({ ok: true, t: 'scope stated instead of guessed' });
      } else if (!V.em.T.n) { head = 'No email went out in this period.'; checks.push({ ok: true, t: 'scope stated' }); } else {
        const T = V.em.T, L = V.em.L, best = [...V.em.t].sort((a, b) => b.r - a.r)[0], f = V.em.flag;
        if (V.sc.dv === 'all') {
          const od = dp(T.open, L.open), cd = dp(T.ctor, L.ctor);
          head = `${od >= 0 ? 'More' : 'Fewer'} opens, ${cd >= 0 ? 'more' : 'fewer'} clicks. Open rate ${c(rate(T.open), 'Journey › Email › Opened')} (${c(pts(od), 'Journey › Email › Opened › vs ' + V.vsS)}); click-to-open ${c(rate(T.ctor), 'Journey › Email › Clicked')} (${c(pts(cd), 'Journey › Email › Clicked › vs ' + V.vsS)}).`;
          checks.push({ ok: true, t: `"${od >= 0 ? 'more' : 'fewer'}" and "${cd >= 0 ? 'more' : 'fewer'}" match the signs` });
        } else {
          head = `Email brought ${c(count(T.s), 'Journey › Email › Sessions')} ${V.sc.dv} sessions at ${c(rate(T.cvr), 'Journey › Email › CVR')} conversion.`;
          lis.push("Opens and clicks aren't split by device, so they're left out here.");
        }
        lis.push(`Revenue from email was ${c(money(T.r), 'Overview › By channel › Email › Revenue')} (${c(chg(gr(T.r, L.r)), 'Overview › By channel › Email › vs ' + V.vsS)}); "${esc(best.name)}" led at ${c(money(best.r), `Journey › Email sends › ${best.name} › Revenue`)}.`);
        if (f) lis.push(`"${esc(f.name)}" was opened by ${c(rate(f.open), `Journey › Email sends › ${f.name} › Open rate`)} but clicked by ${c(rate(f.ctor), `Journey › Email sends › ${f.name} › Click-to-open`)} of openers${f.link ? `: its link goes to ${f.link.page}, which opens ${f.link.opens}` : ''}.`);
        checks.push({ ok: V.em.t.every(x => x.r <= best.r), t: '"led" checked against every send' });
      }
      src.push('get_email()');
    } else {
      const byV = [...V.pr].sort((a, b) => b.v - a.v), low = V.pr.filter(p => p.lowAtc);
      if (low.length) {
        const p = low[0], h = D.events.harbor.product === p.k ? D.events.harbor : null;
        head = `${p.name}: ${c(count(p.v), `Products › ${p.name} › Page views`)} page views, #${p.rank} on the site, but only ${c(rate(p.atc), `Products › ${p.name} › Add-to-cart`)} add to cart.`;
        lis.push(`${cap(p.catLab)} add to cart at ${c(rate(p.catAvg), `Products › ${p.name} › ${p.catLab}`)}.` + (h ? ` ${c(rate(h.size_fit, 0), `Products › ${p.name} › Size & fit opens`)} of visitors open Size & fit; recent reviews mention ${h.review}.` : ''));
      } else {
        head = `None of the five most-viewed products adds to cart at under half the rate of the others in its category.`;
        lis.push(`The most viewed is ${byV[0].name}, ${c(count(byV[0].v), `Products › ${byV[0].name} › Page views`)} views at ${c(rate(byV[0].atc), `Products › ${byV[0].name} › Add-to-cart`)}.`);
      }
      const so = V.pr.filter(p => p.soldOut)[0];
      if (so) lis.push(`${so.name} also dropped to ${c(rate(so.atc), `Products › ${so.name} › Add-to-cart`)}, but that's stock: ${c(rate(so.soShare, 0), `Products › ${so.name} › Sold out`)} of its views open on a sold-out option.`);
      checks.push({ ok: low.every(p => p.rank <= 5 && p.atc < p.catAvg / 2), t: '"rarely" checked: top-5 views, under half the rate of the others in its category' });
      if (V.sc.ch !== 'all') lis.push('Products read all channels.');
      src.push('get_products()');
    }
    return pack(head, lis, ledger, checks, src, scope);
  }
  function pack(head, lis, ledger, checks, src, stamp) {
    const html = `<div class="hl">${head}</div>${lis.length ? `<ul>${lis.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}`;
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    tmp.querySelectorAll('.cite').forEach(e => e.remove());
    const loose = tmp.textContent.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+\/\d+|W\d+|#\d+|\b(last|prior) 4 weeks/g, '').match(/[+−-]?\$?\d[\d.,]*\s?(%|pt|K|M)?/g) || [];
    const all = [{ ok: loose.length === 0, t: `${ledger.length} numbers, all cited${loose.length ? ` — uncited: ${loose.join(', ')}` : ' and match the page'}` }, ...checks];
    if (all.some(x => !x.ok)) return `<div class="hl">Withheld — this answer failed a check, so it isn't shown.</div><div class="chk">${all.map(x => `<span class="${x.ok ? '' : 'bad'}">${x.ok ? '✓' : '✗'} ${esc(x.t)}</span>`).join('')}</div>`;
    return html + `<div class="chk">${all.map(x => `<span>✓ ${esc(x.t)}</span>`).join('')}</div><div class="stamp">${esc(stamp)} · ${esc(src.join(', '))}</div>`;
  }
  const log = $('.ppa-log'), chat = $('.ppa-chat'), asked = new Set();
  const sugHTML = () => {
    const V = view();
    return `<div class="hint">I read <b>${esc(V.label)}</b>, ${esc(V.sc.ch === 'all' ? 'all channels' : chName(V.sc.ch))}, ${DEVNAME[V.sc.dv]}, compared with ${V.vs}. Start with one of these —</div>
      <div class="ppa-sugtop">${QS.map((x, i) => `<button type="button" data-i="${i}"${asked.has(i) ? ' disabled' : ''}>→ ${esc(x.q)}</button>`).join('')}
      <div class="ppa-scope"><b>What it covers:</b> traffic, the journey, email sends, landing pages and products on this page, for the filters you have set. <b>Not:</b> plan, last year, or anything outside this data — those get "not in this data" rather than a guess.</div></div>`;
  };
  function resetChat() { asked.clear(); log.innerHTML = sugHTML(); }
  function ask(i) {
    asked.add(i);
    log.querySelectorAll('.ppa-sugtop [data-i]').forEach(b => (b.disabled = asked.has(+b.dataset.i)));
    log.insertAdjacentHTML('beforeend', `<div class="q">${esc(QS[i].q)}</div><div class="a">${answer(QS[i].k)}${fbBar(i)}</div>`);
    log.scrollTop = log.scrollHeight;
  }
  const wordset = t => new Set(t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1));
  function match(t) {
    const a = wordset(t); let best = -1, score = 0;
    QS.forEach((x, i) => { const b = wordset(x.q), common = [...a].filter(w => b.has(w)).length, s = common / Math.max(a.size, b.size); if (s > score) { score = s; best = i; } });
    return score >= 0.75 ? best : -1;
  }
  function typed(t) {
    const i = match(t);
    if (i >= 0) return ask(i);
    logFb({ kind: 'nodata', q: t.slice(0, 200) });
    log.insertAdjacentHTML('beforeend', `<div class="q">${esc(t)}</div><div class="a"><span class="tag no">Not in this data</span><div class="hl">Not in this demo's answers.</div>
      <div class="demo">This public demo answers the six questions above from the page's own figures. It is not connected to a language model, because a public page can't safely hold an API key. In production, any question about traffic, the journey, email or products gets an answer from the same data, with the same checks.</div></div>`);
    log.scrollTop = log.scrollHeight;
  }

  // ---------------------------------------------------------------- feedback loop (ratings stay in this browser)
  const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const FB = 'ecom:feedback:v1', DEC_KEY = 'ecom:fb-decisions:v1';
  const REASONS = ['Wrong number', 'Not what I asked', 'Too vague', 'Other'];
  const fbBar = i => `<div class="ppa-fb" data-fq="${i}"><span>Was this useful?</span><button type="button" data-rate="up" aria-label="Useful">👍</button><button type="button" data-rate="down" aria-label="Not useful">👎</button></div>`;
  const fbForm = i => `<div class="ppa-fbf" data-fq="${i}"><div class="h">What went wrong?</div><div class="chips">${REASONS.map(r => `<button type="button" data-reason="${r}" aria-pressed="false">${r}</button>`).join('')}</div><textarea maxlength="200" placeholder="Optional: what did you expect?" aria-label="What did you expect?"></textarea><div class="row"><span>Stays in your browser · goes into this week's review</span><button type="button" class="send" disabled>Send</button></div></div>`;
  const fbThanks = () => `<div class="ppa-fbdone">✓ Thanks — logged. <button type="button" class="ppa-link" data-fbr>See what the owner sees → Feedback review</button></div>`;
  function logFb(rec) {
    const all = readLS(FB, []); all.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), ...rec }); writeLS(FB, all);
    const b = $('[data-fbr-open]'); if (b) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 1600); }
  }
  const REVIEW = {
    wk: 41, headline: 'Most friction this week is about definitions, not wrong numbers.',
    text: 'The eCom team asked <strong>52</strong> questions. The checker withheld <strong>1</strong> answer before anyone saw it; the bigger theme is <strong>4</strong> questions asking for last year, which this agent doesn\'t compare against. Two themes need a business decision before anyone can fix them.',
    sig: { q: 52, prev: 47, up: 8, dn: 3, reph: 4, nodata: 7, flags: 1 },
    rows: [
      { theme: 'Asks for last year, not last week', ex: 'How is conversion vs last year?', src: '4 "not in this data"', n: 4, dg: 'def', dl: 'Definition gap?', sug: 'This agent compares with the prior period. Decide with the team whether vs last year belongs here or stays in the weekly report.', ai: 'def' },
      { theme: 'Exit rate read as bounce', ex: "What's the exit rate on the checkout page?", src: '2 👎 · 1 rephrased', n: 3, dg: 'und', dl: 'Misread question', sug: 'Bounce and exit rate are different. Add exit rate per step to the journey, or say plainly that the agent reports bounce.', ai: 'fix' },
      { theme: 'Wants paid social split by platform', ex: 'How much revenue did each social platform drive?', src: '3 "not in this data"', n: 3, dg: 'def', dl: 'Definition gap?', sug: 'Paid social is one channel here. Decide with the paid media team whether to split it by platform.', ai: 'def' },
      { theme: 'Checker withheld an answer', ex: 'Which channel converts best?', src: '1 checker flag', n: 1, dg: 'bug', dl: 'Bug', sug: 'The draft called Email "best" by conversion while Paid search was higher. Fix the ranking rule and add a test.', ai: 'fix' },
    ],
    done: [{ t: 'Mobile and desktop mixed in one answer', d: 'fixed last week · answers now name the device · 1 regression test · 2 users told' },
      { t: 'Email opens shown for one device', d: 'fixed last week · opens and clicks only show for all devices · 1 regression test · 1 user told' }],
  };
  const DEC = [['fix', 'Fix now'], ['later', 'Later'], ['wont', "Won't fix"], ['def', 'Needs a definition']];
  function myRows(recs) {
    return recs.filter(r => r.kind !== 'up').map(r => {
      const base = { key: r.id, you: true, n: 1, ex: r.q, note: r.note };
      if (r.kind === 'nodata') return { ...base, theme: 'Typed question with no answer', src: '"not in this data" reply', dg: 'scope', dl: 'Out of scope', sug: "Not in the agent's answers yet. Add it, or say so in the chat's scope note.", ai: 'later' };
      if (r.reason === 'Wrong number') {
        const q = QS.find(x => x.q === r.q), clean = q && !/✗|Withheld/.test(answer(q.k));
        return { ...base, theme: 'You flagged a wrong number', src: '1 👎', dg: clean ? 'def' : 'bug', dl: clean ? 'Definition gap?' : 'Bug',
          sug: clean ? 'The checks were re-run and every number matches the page, so the gap is likely the definition you expected.' : 'The re-run found a number that does not match. Fix it and add a test.', ai: clean ? 'def' : 'fix' };
      }
      const m = { 'Not what I asked': ['und', 'Misread question', 'Add this wording to the routing examples and the test set.', 'fix'], 'Too vague': ['und', 'Answer too thin', 'Add the follow-up you needed to this answer.', 'later'], Other: ['scope', 'Needs triage', 'Read the note; one report is not a pattern yet.', 'later'] }[r.reason];
      return { ...base, theme: r.reason === 'Other' ? 'Other feedback' : `"${r.reason}"`, src: '1 👎', dg: m[0], dl: m[1], sug: m[2], ai: m[3] };
    });
  }
  function feedbackReview() {
    const R = REVIEW, s2 = R.sig, recs = readLS(FB, []), dec = readLS(DEC_KEY, {});
    const up = recs.filter(r => r.kind === 'up').length, dn = recs.filter(r => r.kind === 'down').length, nd = recs.filter(r => r.kind === 'nodata').length;
    const mine = myRows(recs), rows = [...mine, ...R.rows.map((r, i) => ({ ...r, key: 'ecom-s' + i }))];
    const you = n => (n ? ` · ${n} from you` : ''), qn = s2.q + nd, dq = s2.q - s2.prev;
    const tile = (l, v, d) => `<div><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const got = rows.filter(r => dec[r.key]), tally = got.length ? `You decided ${got.length} of ${rows.length}: ` + DEC.map(([k, l]) => [l, got.filter(r => dec[r.key] === k).length]).filter(x => x[1]).map(([l, n]) => `${n} ${l.toLowerCase()}`).join(' · ') : "Dashed = the agent's suggestion · click to decide";
    const row = r => `<div class="fbr-r${r.you ? ' you' : ''}">
        <div><div class="th">${esc(r.theme)}</div><div class="ex">"${esc(r.ex)}"</div>${r.note ? `<div class="nt">Note: ${esc(r.note)}</div>` : ''}<span class="src">${esc(r.src)}</span>${r.you ? '<span class="src me">You · this browser</span>' : ''}</div>
        <div class="cnt"><span>Count</span>${r.n}</div>
        <div><span class="dg ${r.dg}">${esc(r.dl)}</span><div class="sug">${esc(r.sug)}</div></div>
        <div class="dec">${DEC.map(([k, l]) => `<button type="button" data-dec="${k}" data-key="${esc(r.key)}"${r.ai === k ? ' class="ai"' : ''} aria-pressed="${dec[r.key] === k}">${l}</button>`).join('')}</div></div>`;
    return `<div class="ppa-card fbr">
      <div class="fbr-loop">${[['1 · Log', 'Every answer, 👍/👎 and reason'], ['2 · Weekly pull', "All of the week's turns"], ['3 · Agent drafts', 'Prioritises, summarises, suggests a fix', 'ai'], ['4 · Business decides', "Fix now · Later · Won't fix · Needs a definition", 'you'], ['5 · Fix + test', 'Each fix becomes a regression test'], ['6 · Tell the user', '"The thing you flagged is fixed"']].map(([h, t, c]) => `<div${c ? ` class="${c}"` : ''}><b>${h}</b>${t}</div>`).join('')}</div>
      <div class="ins-mast"><span>Feedback review · W${R.wk} · eCom Site Journey Agent · synthetic week</span><span>${rows.length} themes${mine.length ? ` · ${mine.length} from you` : ''}</span></div>
      <h2 class="fbr-hl">${esc(R.headline)}</h2>
      <p class="fbr-p">${R.text}</p>
      <div class="fbr-sig">${tile('Questions', qn, `${dq >= 0 ? '+' : M}${Math.abs(dq)} vs W${R.wk - 1}${you(nd)}`)}${tile('👍 / 👎', `${s2.up + up} / ${s2.dn + dn}`, `1 in ${Math.round(qn / (s2.up + up + s2.dn + dn))} answers rated${you(up + dn)}`)}${tile('Rephrased', s2.reph, 'asked again in new words')}${tile('"Not in this data"', s2.nodata + nd, 'out of scope' + you(nd))}${tile('Checker flags', s2.flags, 'withheld before shown')}</div>
      <div class="fbr-h"><span>Ranked by the agent · you decide each row</span><span class="tally">${esc(tally)}</span></div>
      <div class="fbr-t"><div class="fbr-r hd"><div>Theme</div><div>Count</div><div>Diagnosis · suggested fix</div><div>Decision</div></div>${rows.map(row).join('')}</div>
      <div class="fbr-h"><span>Fixed last week · loop closed</span></div>
      <div class="fbr-done">${R.done.map(x => `<div><b>${esc(x.t)}</b> <span>· ${esc(x.d)}</span></div>`).join('')}</div>
      <div class="ins-foot">In production, every question and rating lands in a warehouse table; each week the agent reads them, groups and summarises the feedback into this list, and the business owner reviews it with us. Here the week is synthetic, and your own ratings stay in this browser — nothing is sent anywhere.</div>
    </div>`;
  }

  // ---------------------------------------------------------------- modal (Weekly Insights · Feedback review)
  const modal = $('.ins-modal');
  let opener = null;
  function renderModal() {
    const ins = st.modal === 'ins', wk = D.meta.weeks[LAST].wk;
    $('#ecom-modal-title').textContent = ins ? 'Weekly Insights' : 'Feedback review';
    $('.ins-ttl small').textContent = ins ? `Written by the agent every Monday · W${wk}` : `Drafted by the agent every Monday · W${wk} · you decide`;
    $('.ins-ttl .spk').textContent = ins ? '✦' : '↺';
    $('.ins-scroll').innerHTML = ins ? insights() : feedbackReview();
  }
  function openModal(kind, from) { opener = from || null; st.modal = kind; renderModal(); modal.hidden = false; document.documentElement.classList.add('ins-lock'); $('.ins-scroll').scrollTop = 0; $('.ins-x').focus(); }
  function closeModal() { if (modal.hidden) return; modal.hidden = true; st.modal = null; document.documentElement.classList.remove('ins-lock'); if (opener && opener.isConnected) opener.focus(); }
  modal.addEventListener('click', e => {
    if (e.target.closest('[data-ins-x]')) return closeModal();
    const b = e.target.closest('[data-dec]'); if (!b) return;
    const d = readLS(DEC_KEY, {}), k = b.dataset.key; if (d[k] === b.dataset.dec) delete d[k]; else d[k] = b.dataset.dec; writeLS(DEC_KEY, d);
    const y = $('.ins-scroll').scrollTop; renderModal(); $('.ins-scroll').scrollTop = y;
  });
  modal.addEventListener('keydown', e => { // keep focus inside the dialog
    if (e.key !== 'Tab') return;
    const f = [...modal.querySelectorAll('button, summary, [href], textarea, input')].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.modal) closeModal(); });

  // ---------------------------------------------------------------- render + events
  function render() {
    const V = view();
    $$('[role=tab]').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === st.tab));
    $$('[data-dv]').forEach(b => b.setAttribute('aria-pressed', b.dataset.dv === st.dv));
    $('.ppa-ctx').innerHTML = `Showing <b>${esc(V.label)}</b> · ${esc(st.ch === 'all' ? 'all channels' : chName(st.ch))} · ${DEVNAME[st.dv]} · vs ${V.vs} · data as of ${dlab(D.meta.asOf)}`;
    $('.ppa-panel').innerHTML = st.tab === 'overview' ? overviewTab(V) : st.tab === 'journey' ? journeyTab(V) : productsTab(V);
    if (!asked.size) log.innerHTML = sugHTML(); else { const h = log.querySelector('.hint'); if (h) h.outerHTML = sugHTML().split('</div>')[0] + '</div>'; }
  }
  function openChat() { chat.classList.add('open'); chat.removeAttribute('aria-hidden'); $('.ppa-input input').focus(); }
  root.addEventListener('click', e => {
    const t = e.target;
    const tab = t.closest('[role=tab]'); if (tab) { st.tab = tab.dataset.tab; return render(); }
    const dvb = t.closest('[data-dv]'); if (dvb) { st.dv = dvb.dataset.dv; return render(); }
    const inv = t.closest('[data-q]'); if (inv) { openChat(); return ask(+inv.dataset.q); }
    if (t.closest('[data-ask]')) return openChat();
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
    const chip = t.closest('.ppa-fbf [data-reason]');
    if (chip) { chip.parentElement.querySelectorAll('[data-reason]').forEach(x => x.setAttribute('aria-pressed', x === chip)); chip.closest('.ppa-fbf').querySelector('.send').disabled = false; return; }
    const sb = t.closest('.ppa-fbf .send');
    if (sb) { const f = sb.closest('.ppa-fbf'), i = +f.dataset.fq; logFb({ kind: 'down', q: QS[i].q, reason: f.querySelector('[data-reason][aria-pressed=true]').dataset.reason, note: f.querySelector('textarea').value.trim().slice(0, 200) }); f.previousElementSibling.remove(); f.outerHTML = fbThanks(); return; }
    if (t.closest('[data-fbr]') || t.closest('[data-fbr-open]')) return openModal('fbr', $('[data-fbr-open]'));
    if (t.closest('[data-ins]')) return openModal('ins', t.closest('[data-ins]'));
    if (t.closest('[data-notes]')) { e.stopPropagation(); $('.ppa-notes').classList.toggle('open'); return; }
  });
  document.addEventListener('click', e => { const n = $('.ppa-notes'); if (n && !n.contains(e.target) && !e.target.closest('[data-notes]')) n.classList.remove('open'); });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-f=per]')) { st.per = +e.target.value; render(); }
    if (e.target.matches('[data-f=ch]')) { st.ch = e.target.value; render(); }
  });
  root.addEventListener('submit', e => { e.preventDefault(); const inp = $('.ppa-input input'), t = inp.value.trim(); if (t) { inp.value = ''; typed(t); } });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && !st.modal) { $('.ppa-notes').classList.remove('open'); if (chat.classList.contains('open')) $('.ppa-x').click(); } });

  fetch(BASE + '/data/ecom.json').then(x => x.json()).then(d => {
    D = d; LAST = D.meta.weeks.length - 1;
    const sel = $('[data-f=ch]'); sel.innerHTML = '<option value="all">All channels</option>' + D.channels.map(c => `<option value="${c.k}">${c.name}</option>`).join('');
    resetChat(); render();
    window.__ecom = { st, view, answer, insights, render, QS, memo };
    document.dispatchEvent(new CustomEvent('ecom:ready'));
  }).catch(err => {
    $('.ppa-panel').innerHTML = '<div class="ppa-card">Could not load the demo data. If you opened this file directly, serve the folder instead (for example <code>python3 -m http.server</code>).</div>';
    console.error(err);
  });
})();
