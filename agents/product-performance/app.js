// Product Performance Agent — one shared core. Everything region-specific (currency, fiscal
// calendar, channels, thresholds) comes from config/<region>.json; data from data/<region>.json.
(function () {
  const root = document.getElementById('ppa');
  if (!root) return;
  const BASE = root.dataset.base || '.';
  const SYM = { USD: '$', GBP: '£', JPY: '¥' };
  const M = '−';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { region: 'na', p: 'latest', ch: '', tab: 'overview', modal: null }; // modal: null | 'ins' | 'fbr'
  const cache = {};
  let D, C, E; // data, config, engine for the current region
  const $ = s => root.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- formatting
  // money / pct_signed / pct / weeks / int mirror fmt() in data/generate.py exactly.
  function fmt(x, kind, cur = C.currency) {
    if (x == null || !isFinite(x)) return '—';
    if (kind === 'money') {
      const a = Math.abs(x), sign = x < 0 ? M : '';
      let b;
      if (cur === 'JPY') b = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(0) + 'M' : (a / 1e3).toFixed(0) + 'K';
      else b = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(0) + 'K' : a.toFixed(0);
      return sign + SYM[cur] + b;
    }
    if (kind === 'signed_money') return (x >= 0 ? '+' : '') + fmt(x, 'money', cur);
    if (kind === 'pct_signed') return Math.abs(x).toFixed(1) === '0.0' ? '0.0%' : (x >= 0 ? '+' : M) + Math.abs(x).toFixed(1) + '%';
    if (kind === 'pct') return x.toFixed(0) + '%';
    if (kind === 'pts') return Math.abs(x).toFixed(1) === '0.0' ? '0.0 pts' : (x >= 0 ? '+' : M) + Math.abs(x).toFixed(1) + ' pts';
    if (kind === 'price2') return SYM[cur] + (cur === 'JPY' ? Math.floor(x + 0.5).toLocaleString('en-US') : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    if (kind === 'weeks') return x.toFixed(1);
    if (kind === 'int') return Math.floor(x + 0.5).toLocaleString('en-US');
    if (kind === 'price') return SYM[cur] + Math.round(x).toLocaleString('en-US');
  }
  function axisMoney(x) {
    const s = SYM[C.currency];
    if (x === 0) return s + '0';
    if (x >= 1e9) return s + +(x / 1e9).toFixed(1) + 'B';
    if (x >= 1e6) return s + +(x / 1e6).toFixed(1) + 'M';
    return s + +(x / 1e3).toFixed(0) + 'K';
  }
  const cls = x => (x == null ? 'flat' : x > 0.05 ? 'pos' : x < -0.05 ? 'neg' : 'flat');
  const arrow = x => (x > 0.05 ? '▲ ' : x < -0.05 ? '▼ ' : '');
  const date = iso => new Date(iso + 'T12:00:00').toLocaleDateString(C.locale, { month: 'short', day: 'numeric' });

  // ---------------------------------------------------------------- spec engine (QA re-check)
  // Independent of the Python that wrote the answers: same spec, second implementation.
  function Engine(d) {
    this.d = d; this.n = d.weeks.length; this.C = {}; this.fi = {};
    d.cols.forEach((c, i) => (this.C[c] = i));
    d.families.forEach((f, i) => (this.fi[f.id] = i));
  }
  Engine.prototype.total = function (field, y, sp) {
    if (Array.isArray(field)) return field.reduce((t, f) => t + this.total(f, y, sp), 0);
    // p4 = the 4 weeks before the latest one (the trend the weekly brief reads the latest week against)
    const p = sp.p || 'latest', a = p === 'p4' ? this.n - 5 : this.n - { latest: 1, l4: 4, l13: 13 }[p], b = p === 'p4' ? this.n - 1 : this.n, ci = this.C[field];
    let t = 0;
    for (const r of this.d.sales) {
      if (r[0] !== y || r[1] < a || r[1] >= b) continue;
      const f = this.d.families[r[3]];
      if (sp.fam && f.id !== sp.fam) continue;
      if (sp.cat && f.cat !== sp.cat) continue;
      if (sp.ch && this.d.channels[r[2]] !== sp.ch) continue;
      if (sp.excl_new && f.new) continue;
      if (sp.excl_cat && f.cat === sp.excl_cat) continue;
      t += r[ci];
    }
    return t;
  };
  Engine.prototype.metric = function (sp) {
    const T = (f, y, s) => this.total(f, y, s);
    switch (sp.m) {
      case 'sales': return T('sales', sp.y === 'ly' ? 1 : 0, sp);
      case 'chg': return (T(sp.of, 0, sp) / T(sp.of, 1, sp) - 1) * 100;
      case 'delta': return T(sp.of, 0, sp) - T(sp.of, 1, sp);
      case 'mix': { const of = sp.of || 'sales'; return (T(of, 0, sp) / T(of, 0, { p: sp.p || 'latest' })) * 100; }
      case 'share': { const y = sp.y === 'ly' ? 1 : 0; return (T(sp.num, y, sp) / T(sp.den, y, sp)) * 100; }
      case 'sum': return T(sp.of, sp.y === 'ly' ? 1 : 0, sp);
      case 'contrib': { const of = sp.of || 'sales'; return ((T(of, 0, sp) - T(of, 1, sp)) / T('sales', 1, { p: sp.p || 'latest' })) * 100; }
      case 'aur': { const y = sp.y === 'ly' ? 1 : 0; return T('sales', y, sp) / T('units', y, sp); }
      case 'aur_chg': return (this.metric({ ...sp, m: 'aur', y: 'ty' }) / this.metric({ ...sp, m: 'aur', y: 'ly' }) - 1) * 100;
      case 'diff': return this.metric(sp.a) - this.metric(sp.b);
      case 'wos': case 'avg_units': case 'reorder': case 'excess': {
        const avg = T('units', 0, { fam: sp.fam, p: 'l4' }) / 4;
        if (sp.m === 'avg_units') return avg;
        const f = this.fi[sp.fam];
        const oh = this.d.inv.find(r => r[0] === 0 && r[1] === this.n - 1 && r[2] === f)[3];
        if (sp.m === 'wos') return oh / avg;
        return Math.floor(Math.max(0, sp.m === 'excess' ? oh - sp.target * avg : sp.target * avg - oh) / 10 + 0.5) * 10;
      }
    }
    throw new Error('unknown metric ' + sp.m);
  };
  function describe(sp) {
    if (sp.m === 'diff') return `${describe(sp.a)} − ${describe(sp.b)}`;
    const fam = sp.fam && D.families.find(f => f.id === sp.fam).name;
    const scope = [fam, sp.cat, sp.ch, sp.excl_new && 'excl. new products', sp.excl_cat && 'excl. ' + sp.excl_cat].filter(Boolean).join(' · ') || 'all';
    const per = sp.p === 'p4' ? 'prior 4 wks' : (sp.p || 'latest') === 'l4' || sp.m === 'avg_units' ? 'last 4 wks' : 'W' + D.weeks[D.weeks.length - 1].wk;
    const FIELD = { sales: 'sales', units: 'units', orders: 'orders', new: 'new customers', genz: 'Gen Z new customers', ord_gz: 'Gen Z orders', 'ord_gx,ord_bb': 'Gen X + Boomer orders', sales_new: 'new-customer sales' };
    const fl = f => FIELD[String(f)] || String(f);
    const what = {
      sales: 'net sales', chg: fl(sp.of) + ' vs LY', delta: 'sales change',
      wos: 'weeks of supply', avg_units: 'avg weekly units', reorder: 'units to ' + sp.target + ' wks', excess: 'units above ' + sp.target + ' wks',
      sum: fl(sp.of), contrib: fl(sp.of || 'sales') + ' contribution (pts of LY sales)', aur: 'avg unit retail' + (sp.y === 'ly' ? ' (LY)' : ''), aur_chg: 'avg unit retail vs LY',
      mix: 'share of ' + fl(sp.of || 'sales'), share: sp.num === 'sales_new' ? 'new-customer share of sales' : (sp.num === 'genz' ? 'Gen Z' : 'new customers') + ' ÷ ' + (sp.den === 'new' ? 'new customers' : 'orders') + (sp.y === 'ly' ? ' (LY)' : ''),
    }[sp.m];
    return `${what} · ${scope} · ${['wos', 'reorder', 'excess'].includes(sp.m) ? 'end W' + D.weeks[D.weeks.length - 1].wk : per}`;
  }

  // ---------------------------------------------------------------- view model
  function view() {
    const d = D, n = d.weeks.length, a = n - { latest: 1, l4: 4, l13: 13 }[st.p], F = d.families.length;
    const ci = st.ch ? d.channels.indexOf(st.ch) : -1;
    // metric columns after y,w,c,f: 0 sales 1 units 2 orders 3 new 4 genz 5-8 orders by generation
    // (gz mil gx bb) 9-11 new by generation (mil gx bb) 12 sales from new customers
    const NM = d.cols.length - 4, z = () => Array(NM).fill(0);
    const fam = d.families.map((meta, i) => ({ i, meta, ty: z(), ly: z() }));
    const wk = [Array(n).fill(0), Array(n).fill(0)], wkN = [Array(n).fill(0), Array(n).fill(0)], wkG = [Array(n).fill(0), Array(n).fill(0)];
    const u4 = [Array(F).fill(0), Array(F).fill(0)]; // all-channel units, last 4 weeks (inventory is not split by channel)
    for (const r of d.sales) {
      if (r[1] >= n - 4) u4[r[0]][r[3]] += r[5];
      if (ci >= 0 && r[2] !== ci) continue;
      wk[r[0]][r[1]] += r[4]; wkN[r[0]][r[1]] += r[7]; wkG[r[0]][r[1]] += r[8];
      if (r[1] < a) continue;
      const t = fam[r[3]][r[0] ? 'ly' : 'ty'];
      for (let j = 0; j < NM; j++) t[j] += r[4 + j];
    }
    const oh = [Array(F).fill(0), Array(F).fill(0)];
    for (const r of d.inv) if (r[1] === n - 1) oh[r[0]][r[2]] = r[3];
    fam.forEach((f, i) => {
      f.oh = oh[0][i]; f.ohLy = oh[1][i]; f.avg = u4[0][i] / 4; f.avgLy = u4[1][i] / 4;
      f.wos = f.avg ? f.oh / f.avg : null; f.wosLy = f.avgLy ? f.ohLy / f.avgLy : null;
      f.delta = f.ty[0] - f.ly[0]; f.chg = f.ly[0] ? (f.ty[0] / f.ly[0] - 1) * 100 : null;
    });
    const sum = k => fam.reduce((t, f) => t.map((v, j) => v + f[k][j]), z());
    const ty = sum('ty'), ly = sum('ly');
    const inv = { oh: 0, ohLy: 0, avg: 0, avgLy: 0 };
    fam.forEach(f => { inv.oh += f.oh; inv.ohLy += f.ohLy; inv.avg += f.avg; inv.avgLy += f.avgLy; });
    inv.wos = inv.oh / inv.avg; inv.wosLy = inv.ohLy / inv.avgLy;
    const cats = [];
    fam.forEach(f => {
      let c = cats.find(c => c.name === f.meta.cat);
      if (!c) cats.push((c = { name: f.meta.cat, ty: 0, ly: 0 }));
      c.ty += f.ty[0]; c.ly += f.ly[0];
    });
    cats.forEach(c => (c.chg = c.ly ? (c.ty / c.ly - 1) * 100 : null));
    const pc = (t, l) => (l ? (t / l - 1) * 100 : null);
    return { fam, ty, ly, wk, wkN, wkG, a, n, inv, cats, chg: pc(ty[0], ly[0]), uChg: pc(ty[1], ly[1]), pChg: pc(ty[0] / ty[1], ly[0] / ly[1]) };
  }

  function alerts(v) {
    const th = C.thresholds, out = [];
    v.fam.forEach(f => {
      const nm = f.meta.name, s = f.chg == null ? 'new this year' : 'sales ' + fmt(f.chg, 'pct_signed');
      if (f.wos != null && f.wos < th.low_stock_weeks)
        out.push({ lv: 'crit', tag: 'Reorder', f, txt: `${fmt(f.wos, 'weeks')} weeks of supply, below the ${th.low_stock_weeks}-week floor · ${s}` });
      else if (f.wos != null && f.wos > th.overstock_weeks)
        out.push({ lv: 'warn', tag: 'Markdown risk', f, txt: `${fmt(f.wos, 'weeks')} weeks of supply, above the ${th.overstock_weeks}-week ceiling · ${s}` });
      else if (f.chg != null && f.chg <= -th.flag_change_pct)
        out.push({ lv: 'info', tag: 'Watch', f, txt: `Sales ${fmt(f.chg, 'pct_signed')} vs last year (${fmt(f.delta, 'signed_money')})` });
    });
    const rank = { crit: 0, warn: 1, info: 2 };
    return out.sort((a, b) => rank[a.lv] - rank[b.lv] || Math.abs(b.f.delta) - Math.abs(a.f.delta));
  }

  // ---------------------------------------------------------------- pieces
  const kpi = (l, v, d, txt) => `<div class="ppa-kpi"><div class="l">${l}</div><div class="v${txt ? ' txt' : ''}">${v}</div><div class="d">${d}</div></div>`;
  const vsLy = (x, ly) => `<b class="${cls(x)}">${arrow(x)}${fmt(x, 'pct_signed')}</b> vs LY${ly != null ? ' · LY ' + ly : ''}`;
  const sumList = rows => `<dl class="ppa-sum">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  function alertBox(list) {
    const act = list.filter(a => a.lv !== 'info').length;
    const items = list.length
      ? list.map(a => `<li class="${a.lv}"><b><span class="tag ${a.lv}">${a.tag}</span>${esc(a.f ? a.f.meta.name : a.name)}</b><span>${a.txt}</span>${a.f ? `<button type="button" class="ppa-inv" data-inv="${a.f.i}" data-kind="${a.lv}">Investigate →</button>` : ''}</li>`).join('')
      : '<li class="none">Nothing unusual in this view.</li>';
    return `<div><div class="ppa-al-h"><span>Alerts</span><span>${act} to act on · ${list.length} total</span></div><ul class="ppa-al">${items}</ul></div>`;
  }
  const names = (arr, f) => { const p = arr.map(f); return p.length < 2 ? p.join('') : p.slice(0, -1).join(', ') + ' and ' + p[p.length - 1]; };
  const famTag = f => esc(f.meta.name) + (f.meta.new ? '<span class="newtag">NEW</span>' : '');

  // ---------------------------------------------------------------- tabs
  function overview(v) {
    const th = C.thresholds, up = v.fam.filter(f => f.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 2);
    const dn = v.fam.filter(f => f.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2);
    const nw = v.fam.filter(f => f.meta.new && f.ty[0] > 0);
    const nwSales = nw.reduce((s, f) => s + f.ty[0], 0);
    const low = v.fam.filter(f => f.wos != null && f.wos < th.low_stock_weeks).length;
    const hi = v.fam.filter(f => f.wos != null && f.wos > th.overstock_weeks).length;
    const rows = [
      ['Sales', `Net sales ${fmt(v.ty[0], 'money')}, ${fmt(v.chg, 'pct_signed')} vs last year. Units ${fmt(v.uChg, 'pct_signed')}, average price ${fmt(v.pChg, 'pct_signed')}.`],
      ['Drivers', up.length ? 'Biggest gains: ' + names(up, f => `${esc(f.meta.name)} (${fmt(f.delta, 'signed_money')}${f.meta.new ? ', new this year' : ''})`) + '.' : 'No family grew vs last year.'],
      ['Drags', dn.length ? 'Biggest declines: ' + names(dn, f => `${esc(f.meta.name)} (${fmt(f.delta, 'signed_money')}, ${fmt(f.chg, 'pct_signed')})`) + '.' : 'No family declined vs last year.'],
    ];
    if (nwSales > 0) {
      const ex = v.fam.filter(f => !f.meta.new), t = ex.reduce((s, f) => s + f.ty[0], 0), l = ex.reduce((s, f) => s + f.ly[0], 0);
      rows.push(['New products', `Products new this year added ${fmt(nwSales, 'money')}; without them, sales were ${fmt((t / l - 1) * 100, 'pct_signed')}.`]);
    }
    rows.push(['Inventory', `${low ? low : 'No'} ${low === 1 ? 'family' : 'families'} below ${th.low_stock_weeks} weeks of supply, ${hi} above ${th.overstock_weeks}. Overall ${fmt(v.inv.wos, 'weeks')} weeks (LY ${fmt(v.inv.wosLy, 'weeks')}).`]);
    rows.push(['Customers', `New customers placed ${fmt((v.ty[3] / v.ty[2]) * 100, 'pct')} of orders (last year ${fmt((v.ly[3] / v.ly[2]) * 100, 'pct')}).`]);
    // how the summary was written: the same tools, then a QA re-check through the independent engine
    const sp = { p: st.p, ...(st.ch ? { ch: st.ch } : {}) }, args = { period: st.p, ...(st.ch ? { channel: st.ch } : {}) };
    const chk = [{ spec: { m: 'sales', ...sp }, fmt: 'money', text: fmt(v.ty[0], 'money') }, { spec: { m: 'chg', of: 'sales', ...sp }, fmt: 'pct_signed', text: fmt(v.chg, 'pct_signed') },
      { spec: { m: 'chg', of: 'units', ...sp }, fmt: 'pct_signed', text: fmt(v.uChg, 'pct_signed') },
      ...up.concat(dn).map(f => ({ spec: { m: 'delta', of: 'sales', fam: f.meta.id, ...sp }, fmt: 'signed_money', text: fmt(f.delta, 'signed_money') }))];
    const calls = [['get_sales', args], ['get_sales', { ...args, group_by: 'family' }], ['get_inventory', {}], ['get_customers', args]];
    const pipe = `<div class="ppa-pipe" hidden><div class="ppa-trace">${calls.map(([n, a]) => toolLine(n, a, TOOLS[n](a))).join('')}${card('Write the summary', 'write_summary', rows.length + ' lines · written from rules in this demo; an LLM writes it in production', ' calc')}</div>${qaBlock(chk)}</div>`;
    const catRows = v.cats.slice().sort((a, b) => b.ty - a.ty).map(c =>
      `<tr><td>${esc(c.name)}</td><td class="n">${fmt(c.ty, 'money')}</td><td class="n ${cls(c.chg)}">${fmt(c.chg, 'pct_signed')}</td><td class="n">${fmt((c.ty / v.ty[0]) * 100, 'pct')}</td></tr>`).join('');
    return `
      <section class="ppa-card">
        <div class="ppa-kick">1 · Overview — how did the business do?</div>
        <div class="ppa-kpis">
          ${kpi('Net sales', fmt(v.ty[0], 'money'), vsLy(v.chg, fmt(v.ly[0], 'money')))}
          ${kpi('Units sold', fmt(v.ty[1], 'int'), vsLy(v.uChg, fmt(v.ly[1], 'int')))}
          ${kpi('Average price', fmt(v.ty[0] / v.ty[1], 'price'), vsLy(v.pChg, fmt(v.ly[0] / v.ly[1], 'price')))}
          ${kpi('Weeks of supply', fmt(v.inv.wos, 'weeks'), `<b class="flat">${(v.inv.wos - v.inv.wosLy >= 0 ? '+' : M) + Math.abs(v.inv.wos - v.inv.wosLy).toFixed(1)} wks</b> vs LY · end of W${D.weeks[v.n - 1].wk}`)}
        </div>
        <div class="ppa-ins"><div><div class="ppa-al-h"><span>Summary</span><button type="button" class="ppa-link" data-pipe aria-expanded="false">How this was written</button></div>${pipe}${sumList(rows)}</div>${alertBox(alerts(v))}</div>
      </section>
      <div class="ppa-grid">
        <section class="ppa-card"><h3>Weekly net sales</h3><div class="sub">This year vs last year, same fiscal weeks. Shaded = selected period.</div>
          <div class="ppa-chart" data-chart="line"></div>
          <div class="ppa-legend"><span><i style="border-color:var(--ty)"></i>This year (${esc(C.fiscal.year)})</span><span><i style="border-color:#8f8b80;border-top-style:dashed"></i>Last year (${esc(C.fiscal.last_year)})</span></div>
        </section>
        <section class="ppa-card"><h3>By category</h3><div class="sub">Selected period, vs last year</div>
          <div class="ppa-tw"><table><thead><tr><th>Category</th><th class="n">Net sales</th><th class="n">vs LY</th><th class="n">Mix</th></tr></thead>
          <tbody>${catRows}</tbody><tfoot><tr><td>Total</td><td class="n">${fmt(v.ty[0], 'money')}</td><td class="n ${cls(v.chg)}">${fmt(v.chg, 'pct_signed')}</td><td class="n">100%</td></tr></tfoot></table></div>
        </section>
      </div>`;
  }

  function products(v) {
    const comp = v.fam.filter(f => f.chg != null), up = comp.filter(f => f.chg > 0);
    const nw = v.fam.filter(f => f.meta.new && f.ty[0] > 0);
    const byDelta = v.fam.slice().sort((a, b) => b.delta - a.delta), top = byDelta[0], bot = byDelta[byDelta.length - 1];
    const nShare = (v.ty[3] / v.ty[2]) * 100, nShareLy = (v.ly[3] / v.ly[2]) * 100;
    const tShare = (top.ty[3] / top.ty[2]) * 100, tGz = top.ty[3] ? (top.ty[4] / top.ty[3]) * 100 : 0, gz = (v.ty[4] / v.ty[3]) * 100;
    const strong = comp.filter(f => f.chg >= C.thresholds.flag_change_pct).sort((a, b) => b.chg - a.chg);
    const weak = comp.filter(f => f.chg <= -C.thresholds.flag_change_pct).sort((a, b) => a.chg - b.chg);
    const rows = [
      ['Growing', `${up.length} of ${comp.length} families are up vs last year${nw.length ? `, plus ${nw.length} new this year` : ''}. ` +
        (strong.length ? 'Up ' + C.thresholds.flag_change_pct + '%+: ' + names(strong, f => `${esc(f.meta.name)} (${fmt(f.chg, 'pct_signed')})`) + '.' : '')],
      ['Top driver', `${esc(top.meta.name)} added ${fmt(top.delta, 'signed_money')}${top.meta.new ? ' in its first season' : ` (${fmt(top.chg, 'pct_signed')})`}.`],
      ["Who's buying", `${fmt(tShare, 'pct')} of ${esc(top.meta.name)} orders came from new customers (brand ${fmt(nShare, 'pct')}); Gen Z are ${fmt(tGz, 'pct')} of those new customers (brand ${fmt(gz, 'pct')}).`],
      ['Declining', weak.length ? 'Down ' + C.thresholds.flag_change_pct + '%+: ' + names(weak, f => `${esc(f.meta.name)} (${fmt(f.chg, 'pct_signed')}, ${fmt(f.wos, 'weeks')} wks of supply)`) + '.' : `No family is down more than ${C.thresholds.flag_change_pct}%.`],
    ];
    const tr = v.fam.slice().sort((a, b) => b.ty[0] - a.ty[0]).map(f => `<tr>
      <td>${famTag(f)}</td><td>${esc(f.meta.cat)}</td><td class="n">${fmt(f.ty[0], 'money')}</td>
      <td class="n ${cls(f.chg)}">${f.chg == null ? '<span class="flat">new</span>' : fmt(f.chg, 'pct_signed')}</td>
      <td class="n">${fmt(f.ty[1], 'int')}</td><td class="n">${fmt(f.ty[0] / f.ty[1], 'price')}</td>
      <td class="n">${fmt(f.wos, 'weeks')}</td><td class="n">${fmt((f.ty[3] / f.ty[2]) * 100, 'pct')}</td>
      <td class="n">${f.ty[3] ? fmt((f.ty[4] / f.ty[3]) * 100, 'pct') : '—'}</td></tr>`).join('');
    return `
      <section class="ppa-card">
        <div class="ppa-kick">2 · Products — what is selling, and to whom?</div>
        <div class="ppa-kpis">
          ${kpi('Families up vs LY', `${up.length} of ${comp.length}`, nw.length ? `+ ${nw.length} new this year` : 'no new families')}
          ${kpi('Top driver', esc(top.meta.name), `<b class="${cls(top.delta)}">${fmt(top.delta, 'signed_money')}</b> vs LY`, 1)}
          ${kpi('Biggest drag', esc(bot.meta.name), `<b class="${cls(bot.delta)}">${fmt(bot.delta, 'signed_money')}</b> vs LY`, 1)}
          ${kpi('Orders from new customers', fmt(nShare, 'pct'), `<b class="flat">${fmt(nShare - nShareLy, 'pts')}</b> vs LY · LY ${fmt(nShareLy, 'pct')}`)}
        </div>
        <div class="ppa-ins"><div><div class="ppa-al-h"><span>Summary</span></div>${sumList(rows)}</div>${alertBox(alerts(v))}</div>
      </section>
      <section class="ppa-card"><h3>What moved sales vs last year</h3><div class="sub">Change in net sales by product family, selected period. Largest gain at the top.</div>
        <div class="ppa-chart" data-chart="contrib"></div>
        <div class="ppa-legend"><span><i class="sq" style="background:var(--up)"></i>Added sales</span><span><i class="sq" style="background:var(--dn)"></i>Lost sales</span></div>
      </section>
      <section class="ppa-card"><h3>Product families</h3><div class="sub">Selected period. Weeks of supply is at the end of W${D.weeks[v.n - 1].wk}, all channels.</div>
        <div class="ppa-tw"><table><thead><tr><th>Family</th><th>Category</th><th class="n">Net sales</th><th class="n">vs LY</th><th class="n">Units</th><th class="n">Avg price</th><th class="n">Wks supply</th><th class="n">New-cust. orders</th><th class="n">Gen Z of new</th></tr></thead><tbody>${tr}</tbody></table></div>
      </section>`;
  }

  // ---- Customers: new vs returning, Gen Z, gateway products
  const GENS = [['Gen Z', 4], ['Millennial', 9], ['Gen X', 10], ['Boomer', 11]]; // index into view() metric arrays
  function custStats(v) {
    const T = v.ty, L = v.ly, p = st.p;
    const c = {
      newChg: pc(T[3], L[3]), gzChg: pc(T[4], L[4]), ret: T[2] - T[3], retLy: L[2] - L[3],
      nShare: (T[3] / T[2]) * 100, nShareLy: (L[3] / L[2]) * 100, gShare: (T[4] / T[3]) * 100, gShareLy: (L[4] / L[3]) * 100,
      aovN: T[12] / T[3], aovR: (T[0] - T[12]) / (T[2] - T[3]),
      gens: GENS.map(([k, i]) => ({ k, ty: T[i], ly: L[i], chg: pc(T[i], L[i]) })),
    };
    c.retChg = pc(c.ret, c.retLy);
    c.minNew = { latest: 40, l4: 120, l13: 300 }[p];
    c.gate = v.fam.filter(f => f.ty[3] >= c.minNew).map(f => ({ f, gz: f.ty[4], share: (f.ty[4] / f.ty[3]) * 100 }))
      .map(r => ({ ...r, idx: (r.share / c.gShare) * 100 })).sort((a, b) => b.idx - a.idx);
    c.chs = C.channels.map(ch => {
      const s = { p, ch }, nT = E.total('new', 0, s), nL = E.total('new', 1, s);
      return { ch, nT, chg: pc(nT, nL), gz: (E.total('genz', 0, s) / nT) * 100, old: pc(E.total(['ord_gx', 'ord_bb'], 0, s), E.total(['ord_gx', 'ord_bb'], 1, s)) };
    });
    const tot = c.chs.reduce((t, r) => t + r.nT, 0);
    c.chs.forEach(r => (r.mix = (r.nT / tot) * 100));
    return c;
  }
  function custAlerts(c) {
    const th = C.thresholds, out = [];
    if (c.gzChg < 0) out.push({ lv: 'warn', tag: 'Gen Z falling', name: 'Gen Z new customers', txt: `${fmt(c.gzChg, 'pct_signed')} vs last year` });
    if (!st.ch) c.chs.forEach(r => {
      if (r.chg <= -th.flag_change_pct) out.push({ lv: 'warn', tag: 'New customers falling', name: r.ch, txt: `New customers ${fmt(r.chg, 'pct_signed')} vs last year · ${fmt(r.mix, 'pct')} of all new customers` });
      if (r.old <= -2 * th.flag_change_pct) out.push({ lv: 'warn', tag: 'Older customers leaving', name: r.ch, txt: `Gen X + Boomer orders ${fmt(r.old, 'pct_signed')} vs last year` });
    });
    if (c.retChg < -3 && c.newChg > 0) out.push({ lv: 'info', tag: 'Watch', name: 'Returning customers', txt: `${fmt(c.retChg, 'pct_signed')} vs last year while new customers grow ${fmt(c.newChg, 'pct_signed')}` });
    return out;
  }
  function customers(v) {
    const c = custStats(v), T = v.ty, L = v.ly, top = c.gate[0];
    const growing = c.gens.filter(g => g.chg > 0), fastest = c.gens.slice().sort((a, b) => b.chg - a.chg)[0];
    const gzWord = fastest.k !== 'Gen Z' ? `behind ${fastest.k} (${fmt(fastest.chg, 'pct_signed')})` : growing.length === 1 ? 'the only generation growing' : 'the fastest-growing generation';
    const byMix = c.chs.slice().sort((a, b) => b.mix - a.mix), byGz = c.chs.slice().sort((a, b) => b.gz - a.gz);
    const gzSpread = byGz[0].gz - byGz[byGz.length - 1].gz;
    const rows = [
      ['New customers', `${fmt(T[3], 'int')} new customers, ${fmt(c.newChg, 'pct_signed')} vs last year; returning customers ${fmt(c.retChg, 'pct_signed')}.`],
      ['Gen Z', `Gen Z new customers ${fmt(c.gzChg, 'pct_signed')} — ${gzWord}. Now ${fmt(c.gShare, 'pct')} of new customers (last year ${fmt(c.gShareLy, 'pct')}).`],
      ['Gateway product', !top ? 'Not enough new customers in this view.' : top.idx >= 120
        ? `${esc(top.f.meta.name)}: ${fmt(top.share, 'pct')} of its new customers are Gen Z, index ${Math.round(top.idx)} vs the brand.`
        : `No product stands out — the highest, ${esc(top.f.meta.name)}, is at index ${Math.round(top.idx)} (100 = brand average).`],
      ['Where from', st.ch ? `Showing ${esc(st.ch)} only — clear the channel filter to compare channels.`
        : c.chs.map(r => `${esc(r.ch)} ${fmt(r.chg, 'pct_signed')}`).join(' · ') + ` new customers vs last year; ${esc(byMix[0].ch)} brings ${fmt(byMix[0].mix, 'pct')} of them.` +
          (gzSpread >= 8 ? ` Gen Z share of new: ${esc(byGz[0].ch)} ${fmt(byGz[0].gz, 'pct')} vs ${esc(byGz[byGz.length - 1].ch)} ${fmt(byGz[byGz.length - 1].gz, 'pct')}.` : '')],
      ['Spend', `New customers spend ${fmt(c.aovN, 'price')} per order vs ${fmt(c.aovR, 'price')} for returning.`],
    ];
    const gate = c.gate.slice(0, 6), mxI = Math.max(...gate.map(r => r.idx), 120);
    const tr = gate.map((r, i) => `<tr><td>${famTag(r.f)}</td><td class="n">${fmt(r.gz, 'int')}</td><td class="n">${fmt(r.share, 'pct')}</td>
      <td><span class="ppa-ibar${i === 0 && r.idx >= 120 ? ' hi' : ''}" style="width:${(r.idx / mxI) * 140}px"></span>${Math.round(r.idx)}</td></tr>`).join('');
    const pts = x => `<b class="flat">${fmt(x, 'pts')}</b> vs LY`;
    return `
      <section class="ppa-card">
        <div class="ppa-kick">3 · Customers — who is buying, and are we winning new ones?</div>
        <div class="ppa-kpis">
          ${kpi('New customers', fmt(T[3], 'int'), vsLy(c.newChg, fmt(L[3], 'int')))}
          ${kpi('Orders from new customers', fmt(c.nShare, 'pct'), `${pts(c.nShare - c.nShareLy)} · LY ${fmt(c.nShareLy, 'pct')}`)}
          ${kpi('Gen Z share of new', fmt(c.gShare, 'pct'), `${pts(c.gShare - c.gShareLy)} · LY ${fmt(c.gShareLy, 'pct')}`)}
          ${kpi('Gen Z new customers', fmt(T[4], 'int'), vsLy(c.gzChg, fmt(L[4], 'int')))}
        </div>
        <div class="ppa-ins"><div><div class="ppa-al-h"><span>Summary</span></div>${sumList(rows)}</div>${alertBox(custAlerts(c))}</div>
      </section>
      <div class="ppa-grid even">
        <section class="ppa-card"><h3>Gen Z share of new customers</h3><div class="sub">Weekly, this year vs last year. Shaded = selected period.</div>
          <div class="ppa-chart" data-chart="gzline"></div>
          <div class="ppa-legend"><span><i style="border-color:var(--ty)"></i>This year</span><span><i style="border-color:#8f8b80;border-top-style:dashed"></i>Last year</span></div>
        </section>
        <section class="ppa-card"><h3>New customers by generation</h3><div class="sub">Selected period, this year vs last year</div>
          <div class="ppa-chart" data-chart="gens"></div>
          <div class="ppa-legend"><span><i class="sq" style="background:var(--ty)"></i>Gen Z, this year</span><span><i class="sq" style="background:#c9a77c"></i>Other generations, this year</span><span><i class="sq" style="background:#ddd7cb"></i>Last year</span></div>
        </section>
      </div>
      <section class="ppa-card"><h3>Gateway products for Gen Z</h3><div class="sub">Families whose new customers skew most Gen Z; 100 = brand average. Families with at least ${c.minNew} new customers in the period.</div>
        <div class="ppa-tw"><table><thead><tr><th>Family</th><th class="n">Gen Z new customers</th><th class="n">Gen Z of its new</th><th>Index vs brand</th></tr></thead><tbody>${tr}</tbody></table></div>
      </section>`;
  }
  function genChart(el, v) {
    const c = custStats(v), W = Math.max(300, el.clientWidth), row = 48, lab = W < 460 ? 78 : 92, H = c.gens.length * row + 4;
    const mx = Math.max(...c.gens.flatMap(g => [g.ty, g.ly])), right = 64, sc = x => lab + (x / mx) * (W - lab - right - 70);
    let g = '';
    c.gens.forEach((r, i) => {
      const y0 = i * row + 4, col = r.k === 'Gen Z' ? 'var(--ty)' : '#c9a77c';
      g += `<g class="r" data-k="${i}"><rect x="0" y="${y0 - 2}" width="${W}" height="${row}" fill="transparent"/>
        <text class="lbl" x="${lab - 10}" y="${y0 + 21}" text-anchor="end">${r.k}</text>
        <path d="${hbar(lab, sc(r.ty), y0 + 7, 13)}" fill="${col}"/><path d="${hbar(lab, sc(r.ly), y0 + 24, 13)}" fill="#ddd7cb"/>
        <text class="val" x="${sc(r.ty) + 6}" y="${y0 + 11}">${fmt(r.ty, 'int')}</text><text x="${sc(r.ly) + 6}" y="${y0 + 28}">${fmt(r.ly, 'int')} LY</text>
        <text x="${W - 4}" y="${y0 + 21}" text-anchor="end" style="fill:${r.chg >= 0 ? 'var(--ok)' : 'var(--err)'};font-weight:600">${fmt(r.chg, 'pct_signed')}</text></g>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="New customers by generation, this year vs last year">${g}</svg>`;
    el.querySelectorAll('.r').forEach(r => {
      const it = c.gens[r.dataset.k];
      r.addEventListener('pointermove', ev => { el.querySelectorAll('.r').forEach(o => (o.style.opacity = o === r ? 1 : 0.55)); showTip(`<b>${it.k}</b><br>New customers ${fmt(it.ty, 'int')}<br><span class="m">Last year ${fmt(it.ly, 'int')}</span><br>${fmt(it.chg, 'pct_signed')} vs LY`, ev); });
      r.addEventListener('pointerleave', () => { el.querySelectorAll('.r').forEach(o => (o.style.opacity = 1)); hideTip(); });
    });
  }

  function inventory(v) {
    const th = C.thresholds, al = alerts(v).filter(a => a.lv !== 'info');
    const low = v.fam.filter(f => f.wos != null && f.wos < th.low_stock_weeks), hi = v.fam.filter(f => f.wos != null && f.wos > th.overstock_weeks);
    const ohChg = (v.inv.oh / v.inv.ohLy - 1) * 100, uChg = (v.inv.avg / v.inv.avgLy - 1) * 100;
    const rows = [
      ['Overall', `${fmt(v.inv.wos, 'weeks')} weeks of supply vs ${fmt(v.inv.wosLy, 'weeks')} last year. Units on hand ${fmt(ohChg, 'pct_signed')}, while weekly units sold are ${fmt(uChg, 'pct_signed')}.`],
      ['Running low', low.length ? names(low, f => `${esc(f.meta.name)} (${fmt(f.wos, 'weeks')} wks)`) + ` — under the ${th.low_stock_weeks}-week floor.` : `Nothing under the ${th.low_stock_weeks}-week floor.`],
      ['Too deep', hi.length ? names(hi, f => `${esc(f.meta.name)} (${fmt(f.wos, 'weeks')} wks)`) + ` — over the ${th.overstock_weeks}-week ceiling.` : `Nothing over the ${th.overstock_weeks}-week ceiling.`],
    ];
    const rank = f => (f.wos < th.low_stock_weeks ? 0 : f.wos > th.overstock_weeks ? 1 : 2);
    const tr = v.fam.filter(f => f.wos != null).sort((a, b) => rank(a) - rank(b) || a.wos - b.wos).map(f => {
      const need = Math.floor(Math.max(0, 8 * f.avg - f.oh) / 10 + 0.5) * 10;
      const act = rank(f) === 0 ? `<span class="tag crit">Reorder</span>~${fmt(need, 'int')}` : rank(f) === 1 ? '<span class="tag warn">Markdown</span>' : '<span class="flat">—</span>';
      return `<tr><td>${famTag(f)}</td><td class="n">${fmt(f.oh, 'int')}</td><td class="n">${fmt(f.avg, 'int')}</td><td class="n"><b>${fmt(f.wos, 'weeks')}</b></td><td class="n">${fmt(f.wosLy, 'weeks')}</td><td>${act}</td></tr>`;
    }).join('');
    return `
      <section class="ppa-card">
        <div class="ppa-kick">4 · Inventory — do we have the right stock?</div>
        <div class="ppa-kpis">
          ${kpi('Units on hand', fmt(v.inv.oh, 'int'), vsLy(ohChg, fmt(v.inv.ohLy, 'int')))}
          ${kpi('Weeks of supply', fmt(v.inv.wos, 'weeks'), `LY ${fmt(v.inv.wosLy, 'weeks')} · end of W${D.weeks[v.n - 1].wk}`)}
          ${kpi('Running low', String(low.length), `families under ${th.low_stock_weeks} weeks`)}
          ${kpi('Too deep', String(hi.length), `families over ${th.overstock_weeks} weeks`)}
        </div>
        <div class="ppa-ins"><div><div class="ppa-al-h"><span>Summary</span></div>${sumList(rows)}</div>${alertBox(al)}</div>
      </section>
      <div class="ppa-grid even">
        <section class="ppa-card"><h3>Weeks of supply by family</h3><div class="sub">End of W${D.weeks[v.n - 1].wk}, all channels. Lines = thresholds from this region's config.</div>
          <div class="ppa-chart" data-chart="wos"></div>
          <div class="ppa-legend"><span><i class="sq" style="background:var(--crit)"></i>Under ${th.low_stock_weeks} wks</span><span><i class="sq" style="background:var(--warn)"></i>Over ${th.overstock_weeks} wks</span><span><i class="sq" style="background:var(--neutral)"></i>In range</span></div>
        </section>
        <section class="ppa-card"><h3>What to do</h3><div class="sub">Reorder quantity brings a family back to 8 weeks of supply.</div>
          <div class="ppa-tw"><table><thead><tr><th>Family</th><th class="n">On hand</th><th class="n">Units/wk</th><th class="n">Wks</th><th class="n">LY</th><th>Action</th></tr></thead><tbody>${tr}</tbody></table></div>
        </section>
      </div>`;
  }

  // ---------------------------------------------------------------- charts (hand-built SVG)
  const tip = $('.ppa-tip');
  function showTip(html, ev) {
    tip.innerHTML = html; tip.classList.add('on');
    const r = root.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = ev.clientX - r.left + 14, y = ev.clientY - r.top - th - 10;
    if (x + tw > r.width - 8) x = ev.clientX - r.left - tw - 14;
    if (y < 8) y = ev.clientY - r.top + 16;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => tip.classList.remove('on');
  function niceStep(max, n = 4) {
    const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw);
  }
  function hbar(x0, x1, yc, h) {
    const r = Math.min(4, Math.abs(x1 - x0)), y0 = yc - h / 2, y1 = yc + h / 2, s = x1 >= x0 ? 1 : -1;
    return `M${x0},${y0}H${x1 - s * r}Q${x1},${y0} ${x1},${y0 + r}V${y1 - r}Q${x1},${y1} ${x1 - s * r},${y1}H${x0}Z`;
  }

  function lineChart(el, v, o = {}) {
    // o: {ty, ly, axis, val, diff, zero, aria} — defaults draw weekly net sales
    const W = Math.max(300, el.clientWidth), H = 232, m = { l: 50, r: W < 460 ? 12 : 74, t: 12, b: 26 }, n = v.n;
    const ty = o.ty || v.wk[0], ly = o.ly || v.wk[1], ax = o.axis || axisMoney, val = o.val || (x => fmt(x, 'money'));
    const diff = o.diff || ((a, b) => fmt((a / b - 1) * 100, 'pct_signed') + ' vs LY');
    const hiV = Math.max(...ty, ...ly), loV = Math.min(...ty, ...ly);
    const step = o.zero === false ? niceStep(hiV - loV || 1, 3) : niceStep(hiV);
    const lo = o.zero === false ? Math.max(0, Math.floor(loV / step) * step - step) : 0, mx = Math.ceil(hiV / step) * step;
    const x = i => m.l + (i * (W - m.l - m.r)) / (n - 1), y = val => m.t + (1 - (val - lo) / (mx - lo)) * (H - m.t - m.b), hw = (W - m.l - m.r) / (n - 1) / 2;
    let g = `<rect x="${x(v.a) - hw}" y="${m.t}" width="${x(n - 1) - x(v.a) + 2 * hw}" height="${H - m.t - m.b}" fill="var(--paper-2)" rx="4"/>`;
    for (let t = lo; t <= mx + 1e-9; t += step) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${t > lo ? 'var(--grid)' : '#c3c2b7'}"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${ax(t)}</text>`;
    const every = W < 560 ? 2 : 1;
    D.weeks.forEach((w, i) => { if ((n - 1 - i) % every === 0) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">W${w.wk}</text>`; });
    const path = a => a.map((val, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(val).toFixed(1)).join('');
    g += `<path d="${path(ly)}" fill="none" stroke="#8f8b80" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>`;
    g += `<path d="${path(ty)}" fill="none" stroke="var(--ty)" stroke-width="2" stroke-linejoin="round"/>`;
    g += `<circle cx="${x(n - 1)}" cy="${y(ty[n - 1])}" r="4" fill="var(--ty)" stroke="var(--card)" stroke-width="2"/>`;
    if (W >= 460) { // direct end labels, pushed apart if they collide
      let a = y(ty[n - 1]), b = y(ly[n - 1]);
      if (Math.abs(a - b) < 15) { const mid = (a + b) / 2, s = a <= b ? -1 : 1; a = mid + s * 7.5; b = mid - s * 7.5; }
      g += `<text class="lbl" x="${x(n - 1) + 10}" y="${a + 4}">This year</text><text x="${x(n - 1) + 10}" y="${b + 4}">Last year</text>`;
    }
    g += `<g class="hov" style="display:none"><line y1="${m.t}" y2="${H - m.b}" stroke="var(--ink-2)" stroke-width="1"/><circle r="4.5" fill="var(--ty)" stroke="var(--card)" stroke-width="2"/><circle r="4.5" fill="#8f8b80" stroke="var(--card)" stroke-width="2"/></g>`;
    g += `<rect class="hit" x="${m.l - hw}" y="0" width="${W - m.l - m.r + 2 * hw}" height="${H}" fill="transparent"/>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(o.aria || 'Weekly net sales, this year vs last year')}">${g}</svg>`;
    const hov = el.querySelector('.hov'), [ln, c1, c2] = hov.children;
    const move = ev => {
      const r = el.querySelector('svg').getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
      hov.style.display = ''; ln.setAttribute('x1', x(i)); ln.setAttribute('x2', x(i));
      c1.setAttribute('cx', x(i)); c1.setAttribute('cy', y(ty[i])); c2.setAttribute('cx', x(i)); c2.setAttribute('cy', y(ly[i]));
      const w = D.weeks[i];
      showTip(`<b>W${w.wk}</b> <span class="m">${date(w.ty[0])}–${date(w.ty[1])}</span><br>This year ${val(ty[i])}<br><span class="m">Last year ${val(ly[i])}</span><br>${diff(ty[i], ly[i])}`, ev);
    };
    const hit = el.querySelector('.hit');
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', () => { hov.style.display = 'none'; hideTip(); });
  }

  function barRows(el, items, opt) {
    // items: [{label, val, color, text, tip}] — one row each, ranked by the caller
    const W = Math.max(300, el.clientWidth), row = 26, bh = 14, lab = W < 460 ? 112 : 150, pad = 64;
    const H = items.length * row + (opt.top || 0) + 6, lo = Math.min(0, ...items.map(i => i.val)), hi = Math.max(opt.min || 0, ...items.map(i => i.val));
    const x0 = lab + (lo < 0 ? pad : 8), x1 = W - pad, sc = v => x0 + ((v - lo) / (hi - lo || 1)) * (x1 - x0);
    let g = opt.under ? opt.under(sc, H) : '';
    g += `<line x1="${sc(0)}" x2="${sc(0)}" y1="${opt.top || 0}" y2="${H - 2}" stroke="#c3c2b7"/>`;
    items.forEach((it, k) => {
      const yc = (opt.top || 0) + k * row + row / 2, xa = sc(0), xb = sc(it.val), right = it.val >= 0;
      g += `<g class="r" data-k="${k}"><rect x="0" y="${yc - row / 2}" width="${W}" height="${row}" fill="transparent"/>`;
      g += `<text class="lbl" x="${lab - 10}" y="${yc + 4}" text-anchor="end">${esc(it.label)}</text>`;
      g += `<path d="${hbar(xa, xb, yc, bh)}" fill="${it.color}"/>`;
      g += `<text class="val" x="${right ? xb + 6 : xb - 6}" y="${yc + 4}" text-anchor="${right ? 'start' : 'end'}">${it.text}</text></g>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(opt.aria)}">${g}</svg>`;
    el.querySelectorAll('.r').forEach(r => {
      r.addEventListener('pointermove', ev => { r.style.opacity = 1; el.querySelectorAll('.r').forEach(o => (o.style.opacity = o === r ? 1 : 0.55)); showTip(items[r.dataset.k].tip, ev); });
      r.addEventListener('pointerleave', () => { el.querySelectorAll('.r').forEach(o => (o.style.opacity = 1)); hideTip(); });
    });
  }

  function drawCharts(v) {
    root.querySelectorAll('[data-chart]').forEach(el => {
      const k = el.dataset.chart;
      if (k === 'line') return lineChart(el, v);
      if (k === 'gzline') return lineChart(el, v, {
        ty: v.wkG[0].map((g, i) => (g / v.wkN[0][i]) * 100), ly: v.wkG[1].map((g, i) => (g / v.wkN[1][i]) * 100), zero: false,
        axis: t => t.toFixed(0) + '%', val: t => t.toFixed(1) + '%', diff: (a, b) => fmt(a - b, 'pts') + ' vs LY', aria: 'Gen Z share of new customers by week, this year vs last year' });
      if (k === 'gens') return genChart(el, v);
      if (k === 'contrib') {
        const items = v.fam.slice().sort((a, b) => b.delta - a.delta).map(f => ({
          label: f.meta.name, val: f.delta, color: f.delta >= 0 ? 'var(--up)' : 'var(--dn)', text: fmt(f.delta, 'signed_money'),
          tip: `<b>${esc(f.meta.name)}</b>${f.meta.new ? ' <span class="m">new this year</span>' : ''}<br>This year ${fmt(f.ty[0], 'money')}<br><span class="m">Last year ${fmt(f.ly[0], 'money')}</span><br>${f.chg == null ? 'no sales last year' : fmt(f.chg, 'pct_signed') + ' vs LY'}`,
        }));
        return barRows(el, items, { aria: 'Change in net sales by product family' });
      }
      if (k === 'wos') {
        const th = C.thresholds;
        const items = v.fam.filter(f => f.wos != null).sort((a, b) => b.wos - a.wos).map(f => {
          const s = f.wos < th.low_stock_weeks ? 'crit' : f.wos > th.overstock_weeks ? 'warn' : '';
          return {
            label: f.meta.name, val: f.wos, color: s ? `var(--${s})` : 'var(--neutral)',
            text: fmt(f.wos, 'weeks') + (s === 'crit' ? ' · low' : s === 'warn' ? ' · deep' : ''),
            tip: `<b>${esc(f.meta.name)}</b><br>${fmt(f.oh, 'int')} units on hand<br>${fmt(f.avg, 'int')} units/week (last 4)<br>${fmt(f.wos, 'weeks')} weeks <span class="m">· LY ${fmt(f.wosLy, 'weeks')}</span>`,
          };
        });
        return barRows(el, items, {
          aria: 'Weeks of supply by product family', top: 18, min: th.overstock_weeks + 2,
          under: (sc, H) => [[th.low_stock_weeks, 'floor'], [th.overstock_weeks, 'ceiling']].map(([t, l]) =>
            `<line x1="${sc(t)}" x2="${sc(t)}" y1="14" y2="${H - 2}" stroke="var(--ink-2)" stroke-dasharray="3 3"/><text x="${sc(t)}" y="10" text-anchor="middle">${l} ${t}</text>`).join(''),
        });
      }
    });
  }

  // ---------------------------------------------------------------- tools (what the agent can call)
  // Real functions over the data. The chatbot replay, the Investigate loop and the summary pipeline
  // all call these, live in the browser.
  const TOOL_DOCS = [
    ['get_sales', 'Sales', 'This year vs last year, for any period or channel, split by product family, category or channel'],
    ['get_trend', 'Weekly trend', 'Week-by-week sales for one product family, this year vs last year'],
    ['get_inventory', 'Inventory', 'Units on hand, weekly sales rate and weeks of supply, against the stock thresholds'],
    ['get_customers', 'Customers', 'New vs returning customers and the Gen Z share — for one family, or split by generation, channel or family'],
  ];
  const famName = id => D.families.find(f => f.id === id).name;
  const famIdx = id => D.families.findIndex(f => f.id === id);
  function spOf(a) {
    const s = { p: a.period || 'latest' };
    if (a.channel) s.ch = a.channel;
    if (a.family) s.fam = a.family;
    if (a.category) s.cat = a.category;
    if (a.exclude_new) s.excl_new = true;
    if (a.exclude_category) s.excl_cat = a.exclude_category;
    return s;
  }
  function weekTotal(field, y, w, sp) {
    const ci = D.cols.indexOf(field);
    let t = 0;
    for (const r of D.sales) {
      if (r[0] !== y || r[1] !== w) continue;
      if (sp.fam && D.families[r[3]].id !== sp.fam) continue;
      if (sp.ch && D.channels[r[2]] !== sp.ch) continue;
      t += r[ci];
    }
    return t;
  }
  const pc = (t, l) => (l ? (t / l - 1) * 100 : null);
  const TOOLS = {
    get_sales(a) {
      const base = spOf(a);
      const one = s => { const ty = E.total('sales', 0, s), ly = E.total('sales', 1, s); return { ty, ly, delta: ty - ly, chg: pc(ty, ly) }; };
      if (!a.group_by) {
        const r = one(base); r.uChg = pc(E.total('units', 0, base), E.total('units', 1, base));
        return { data: r, text: `net sales ${fmt(r.ty, 'money')} · ${fmt(r.chg, 'pct_signed')} vs LY (${fmt(r.delta, 'signed_money')}) · units ${fmt(r.uChg, 'pct_signed')}` };
      }
      const key = { channel: 'ch', category: 'cat', family: 'fam' }[a.group_by];
      const keys = a.group_by === 'channel' ? D.channels : a.group_by === 'category' ? [...new Set(D.families.map(f => f.cat))]
        : D.families.filter(f => !a.category || f.cat === a.category).map(f => f.id);
      const rows = keys.map(k => ({ id: k, key: a.group_by === 'family' ? famName(k) : k, ...one({ ...base, [key]: k }) })).sort((x, y) => y.delta - x.delta);
      const f = r => r.chg == null ? `${r.key} (new this year, ${fmt(r.delta, 'signed_money')})` : `${r.key} ${fmt(r.chg, 'pct_signed')} (${fmt(r.delta, 'signed_money')})`;
      const unit = { family: ['family', 'families'], category: ['category', 'categories'], channel: ['channel', 'channels'] }[a.group_by];
      const tot = rows.reduce((t, r) => t + r.ty, 0);
      rows.forEach(r => (r.mix = (r.ty / tot) * 100));
      return { data: rows, text: rows.length <= 4 ? rows.map(r => `${f(r)} ${fmt(r.mix, 'pct')} of sales`).join(' · ') : `${rows.length} ${unit[rows.length === 1 ? 0 : 1]} · top ${f(rows[0])} · bottom ${f(rows[rows.length - 1])}` };
    },
    get_trend(a) {
      const n = D.weeks.length, k = a.weeks || 4, sp = { fam: a.family, ch: a.channel };
      const rows = [];
      for (let w = n - k; w < n; w++) {
        const ty = weekTotal('sales', 0, w, sp), ly = weekTotal('sales', 1, w, sp);
        rows.push({ wk: D.weeks[w].wk, ty, ly, chg: pc(ty, ly) });
      }
      return { data: rows, text: rows.map(r => `W${r.wk} ${fmt(r.ty, 'money')}${r.chg == null ? '' : ' ' + fmt(r.chg, 'pct_signed')}`).join(' · ') };
    },
    get_inventory(a) {
      const th = C.thresholds, last = D.weeks.length - 1;
      const one = id => {
        const i = famIdx(id), oh = (D.inv.find(r => r[0] === 0 && r[1] === last && r[2] === i) || [0, 0, 0, 0])[3];
        const avg = E.total('units', 0, { fam: id, p: 'l4' }) / 4;
        return { id, name: famName(id), oh, avg, wos: avg ? oh / avg : null };
      };
      if (a.family) {
        const r = one(a.family);
        r.to8 = Math.floor(Math.max(0, 8 * r.avg - r.oh) / 10 + 0.5) * 10; // units needed to get back to 8 weeks of supply
        return { data: r, text: `${fmt(r.oh, 'int')} on hand · ${fmt(r.avg, 'int')}/wk · ${fmt(r.wos, 'weeks')} weeks (floor ${th.low_stock_weeks}, ceiling ${th.overstock_weeks})` + (r.to8 > 0 ? ` · ${fmt(r.to8, 'int')} units to reach 8 weeks` : '') };
      }
      const rows = D.families.map(f => one(f.id)).filter(r => r.wos != null).sort((x, y) => x.wos - y.wos);
      const low = rows.filter(r => r.wos < th.low_stock_weeks).length, hi = rows.filter(r => r.wos > th.overstock_weeks).length;
      return { data: rows, text: `${rows.length} families · ${low} under ${th.low_stock_weeks} wks, ${hi} over ${th.overstock_weeks} · lowest ${rows[0].name} ${fmt(rows[0].wos, 'weeks')} · highest ${rows[rows.length - 1].name} ${fmt(rows[rows.length - 1].wos, 'weeks')}` };
    },
    get_customers(a) {
      if (a.by) return customersBy(a);
      const s = spOf(a), b = spOf({ period: a.period, channel: a.channel });
      const share = sp => ({ nw: (E.total('new', 0, sp) / E.total('orders', 0, sp)) * 100, gz: (E.total('genz', 0, sp) / E.total('new', 0, sp)) * 100 });
      const r = share(s), brand = share(b);
      return { data: { ...r, brand }, text: `${a.family ? famName(a.family) : 'all families'}: ${fmt(r.nw, 'pct')} of orders from new customers · Gen Z ${fmt(r.gz, 'pct')} of new` + (a.family ? ` (brand ${fmt(brand.nw, 'pct')} · ${fmt(brand.gz, 'pct')})` : '') };
    },
  };
  const GEN = [['Gen Z', 'genz', 'ord_gz'], ['Millennial', 'new_mil', 'ord_mil'], ['Gen X', 'new_gx', 'ord_gx'], ['Boomer', 'new_bb', 'ord_bb']];
  function customersBy(a) {
    const base = spOf(a);
    const row = (key, sp) => {
      const nT = E.total('new', 0, sp), nL = E.total('new', 1, sp), gT = E.total('genz', 0, sp), gL = E.total('genz', 1, sp);
      return { key, new: nT, newLy: nL, newChg: pc(nT, nL), genz: gT, genzLy: gL, genzChg: pc(gT, gL), gzShare: nT ? (gT / nT) * 100 : null, gzShareLy: nL ? (gL / nL) * 100 : null };
    };
    if (a.by === 'generation') {
      const rows = GEN.map(([key, nf, of]) => {
        const nT = E.total(nf, 0, base), nL = E.total(nf, 1, base), oT = E.total(of, 0, base), oL = E.total(of, 1, base);
        return { key, new: nT, newLy: nL, newChg: pc(nT, nL), orders: oT, ordersLy: oL, ordersChg: pc(oT, oL) };
      });
      const gzS = (E.total('genz', 0, base) / E.total('new', 0, base)) * 100, gzSL = (E.total('genz', 1, base) / E.total('new', 1, base)) * 100;
      const old = pc(E.total(['ord_gx', 'ord_bb'], 0, base), E.total(['ord_gx', 'ord_bb'], 1, base));
      return { data: rows, text: 'New customers vs LY: ' + rows.map(r => `${r.key} ${fmt(r.newChg, 'pct_signed')}`).join(' · ') + ' | Orders vs LY: ' + rows.map(r => `${r.key} ${fmt(r.ordersChg, 'pct_signed')}`).join(' · ') +
        ` (Gen X + Boomer ${fmt(old, 'pct_signed')}) | Gen Z share of new: ${fmt(gzS, 'pct')} (LY ${fmt(gzSL, 'pct')})` };
    }
    if (a.by === 'channel') {
      const tot = E.total('new', 0, base);
      const rows = D.channels.map(c => ({ ...row(c, { ...base, ch: c }), mix: (E.total('new', 0, { ...base, ch: c }) / tot) * 100 }));
      return { data: rows, text: rows.map(r => `${r.key} ${fmt(r.newChg, 'pct_signed')} (${fmt(r.mix, 'pct')} of new, Gen Z ${fmt(r.gzShare, 'pct')})`).join(' · ') };
    }
    const brand = row('all', base);
    const rows = D.families.map(f => ({ id: f.id, ...row(f.meta ? f.meta.name : f.name, { ...base, fam: f.id }) }))
      .filter(r => r.new >= 40).map(r => ({ ...r, index: (r.gzShare / brand.gzShare) * 100 })).sort((x, y) => y.index - x.index);
    return { data: { rows, brand }, text: `${rows.length} families · most Gen Z: ${rows[0].key} ${fmt(rows[0].gzShare, 'pct')} of new (index ${Math.round(rows[0].index)}) · brand ${fmt(brand.gzShare, 'pct')}` };
  }
  const callStr = (name, args) => `${name}(${Object.entries(args).map(([k, v]) => `${k}=${typeof v === 'string' ? '"' + v + '"' : v}`).join(', ')})`;
  const PER = { latest: 'latest week', l4: 'last 4 weeks', l13: 'last 13 weeks' };
  function toolLabel(name, a) {
    const who = a.family ? famName(a.family) : null, per = PER[a.period || 'latest'];
    if (name === 'get_sales') return ['Sales' + (a.group_by ? ' by ' + (a.group_by === 'family' ? 'product family' : a.group_by) : ''),
      who, a.category, a.channel, a.exclude_new ? 'excluding new products' : null, a.exclude_category ? 'excluding ' + a.exclude_category : null, per].filter(Boolean).join(' · ');
    if (name === 'get_trend') return `Weekly trend · ${who} · last ${a.weeks || 4} weeks` + (a.channel ? ' · ' + a.channel : '');
    if (name === 'get_inventory') return 'Inventory · ' + (who || 'all families');
    if (name === 'get_customers') return 'Customers' + (a.by ? ' by ' + (a.by === 'family' ? 'product family' : a.by) : ' · ' + (who || 'all families')) + (a.channel ? ' · ' + a.channel : '') + ' · ' + per;
    return name;
  }
  const card = (label, tag, text, cls = '') => `<div class="ppa-call${cls}"><div class="h"><b>${esc(label)}</b>${tag ? `<span class="tool" title="${esc(tag)}">${esc(tag.replace(/\(.*/, ''))}</span>` : ''}</div>${String(text).split(' | ').map((t, _, all) => { const k = all.length > 1 ? t.indexOf(': ') : -1; return `<div class="r">${k > 0 && k < 28 ? `<b>${esc(t.slice(0, k + 1))}</b> ${esc(t.slice(k + 2))}` : esc(t)}</div>`; }).join('')}</div>`;
  const toolLine = (name, args, r) => card(toolLabel(name, args), callStr(name, args), r.text);
  const wait = ms => new Promise(res => setTimeout(res, reduce ? 0 : ms));
  function qaBlock(checks, label) {
    const res = checks.map(c => { const got = fmt(E.metric(c.spec), c.fmt); return { ok: got === c.text, line: `${describe(c.spec)} = ${got}` }; });
    const ok = res.filter(r => r.ok).length, all = ok === res.length;
    return `<details class="ppa-how"><summary class="${all ? 'ok' : 'bad'}">${all ? '✓' : '✗'} ${label || 'QA check'} · ${ok} of ${res.length} numbers match the data</summary><div class="ppa-steps">${res.map(r => `<div class="${r.ok ? 'ok' : 'bad'}">${esc(r.line)}</div>`).join('')}</div></details>`;
  }

  // ---------------------------------------------------------------- chat (scripted answers to the suggested questions; tool calls run live)
  const chat = $('.ppa-chat'), log = $('.ppa-log'), sug = $('.ppa-sug'), chatTitle = $('.ppa-chat-h b'), chatSub = $('.ppa-chat-h small');
  let mode = 'chat', chatHTML = '', busy = false;
  const toolsList = () => `<details class="ppa-tools"><summary>Tools the agent can call (${TOOL_DOCS.length})</summary><ul>${TOOL_DOCS.map(([n, t, d]) => `<li><b>${esc(t)}</b> <span class="tool">${n}</span><span>${esc(d)}</span></li>`).join('')}</ul></details>`;
  // Suggested questions + "what it covers" sit at the TOP of the conversation (same as the production chatbot);
  // the conversation flows below them.
  const sugTop = () => {
    const wk = D.weeks[D.weeks.length - 1];
    return `<div class="hint">I read the numbers for <b>W${wk.wk}</b> (${date(wk.ty[0])}–${date(wk.ty[1])}), all channels, ${esc(C.name)}. Start with one of these —</div>
      <div class="ppa-sugtop">${D.chat.map((c, i) => `<button type="button" data-i="${i}"${c.asked ? ' disabled' : ''}>→ ${esc(c.q)}</button>`).join('')}
      <div class="ppa-scope"><b>What it covers:</b> ${esc(C.name)}, W${wk.wk}, all channels — sales, inventory and customer numbers in this demo, plus metric definitions. <b>Not:</b> other regions in one answer, or anything outside this data. It answers the suggested questions; the tool calls behind each answer run live and every number is re-checked.</div>
      ${toolsList()}</div>`;
  };
  function resetChat() { $('.ppa-input').hidden = false; log.innerHTML = sugTop(); chatHTML = ''; sug.hidden = true; sug.innerHTML = ''; }
  const syncSug = () => log.querySelectorAll('.ppa-sugtop button[data-i]').forEach(b => (b.disabled = busy || !!D.chat[+b.dataset.i].asked));
  log.addEventListener('click', e => { const b = e.target.closest('.ppa-sugtop button[data-i]'); if (b && mode === 'chat' && !b.disabled) ask(+b.dataset.i); });
  // Free-text box: a typed question that matches a suggested one gets that answer; anything else gets an honest demo note.
  const words = t => new Set(t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1));
  function match(t) {
    const a = words(t);
    let best = -1, score = 0;
    D.chat.forEach((c, i) => { const b = words(c.q), common = [...a].filter(w => b.has(w)).length, s = common / Math.max(a.size, b.size); if (s > score) { score = s; best = i; } });
    return score >= 0.75 ? best : -1;
  }
  $('.ppa-input').addEventListener('submit', e => {
    e.preventDefault();
    const inp = $('.ppa-input input'), t = inp.value.trim();
    if (!t || busy || mode !== 'chat') return;
    inp.value = '';
    const i = match(t);
    if (i >= 0) return ask(i);
    logFb({ kind: 'nodata', q: t.slice(0, 200) }); // a typed question with no answer is a signal for the weekly review
    const open = D.chat.map((c, k) => [c, k]).filter(([c]) => !c.asked).slice(0, 3);
    log.insertAdjacentHTML('beforeend', `<div class="q">${esc(t)}</div><div class="a ppa-demo"><b>Demo only — free-form questions aren't answered here.</b> This public page isn't connected to a language model, because a public site can't safely hold an API key. In the production agent, buyers ask in their own words and the answer comes from the same tools.${open.length ? ` Try one of these:<div class="ppa-sugtop">${open.map(([c, k]) => `<button type="button" data-i="${k}">→ ${esc(c.q)}</button>`).join('')}</div>` : ''}</div>`);
    log.scrollTop = log.scrollHeight;
  });
  function setMode(m, title, sub) {
    if (mode === 'chat' && m !== 'chat') chatHTML = log.innerHTML;
    mode = m; chatTitle.textContent = title; chatSub.textContent = sub;
    $('.ppa-input').hidden = m !== 'chat';
    if (m === 'chat') { if (chatHTML) { log.innerHTML = chatHTML; sug.hidden = true; sug.innerHTML = ''; syncSug(); } else resetChat(); }
    else sug.hidden = false;
  }
  function openDrawer() { chat.classList.add('open'); chat.removeAttribute('aria-hidden'); $('.ppa-x').focus(); }
  async function ask(i) {
    if (busy) return; busy = true;
    const item = D.chat[i];
    syncSug();
    log.insertAdjacentHTML('beforeend', `<div class="q">${esc(item.q)}</div><div class="ppa-trace"></div>`);
    const trace = log.lastElementChild;
    for (const [name, args] of item.calls) {
      await wait(420);
      trace.insertAdjacentHTML('beforeend', toolLine(name, args, TOOLS[name](args)));
      log.scrollTop = log.scrollHeight;
    }
    await wait(300);
    log.insertAdjacentHTML('beforeend', '<div class="a"></div>');
    const a = log.lastElementChild, words = item.a.split(' ');
    for (let k = 1; k <= words.length && !reduce; k++) { a.textContent = words.slice(0, k).join(' '); log.scrollTop = log.scrollHeight; await wait(26); }
    let html = esc(item.a);
    item.checks.forEach(c => { html = html.replace(esc(c.text), `<mark title="${esc(describe(c.spec))}">${esc(c.text)}</mark>`); });
    a.innerHTML = html + qaBlock(item.checks.map(c => ({ ...c, text: item.a.includes(c.text) ? c.text : '∅' }))) + fbBar(i);
    item.asked = true; busy = false;
    syncSug();
    log.scrollTop = log.scrollHeight;
  }

  // ---------------------------------------------------------------- Investigate: a bounded agent loop
  // Each step picks one tool from the menu based on the previous result. Here a fixed policy picks;
  // a fixed policy picks from the tool menu. Max MAX steps, then a human decides.
  const MAX = 6;
  async function investigate(i, kind) {
    if (busy) return; busy = true;
    const f = D.families[i], id = f.id, th = C.thresholds, ch = st.ch || undefined, p = st.p;
    setMode('run', 'Agent run · ' + f.name, 'Agent loop · max ' + MAX + ' steps · you approve the result');
    sug.innerHTML = '<button type="button" class="ppa-back">← Back to questions</button>' + toolsList();
    sug.querySelector('.ppa-back').addEventListener('click', () => { if (!busy) setMode('chat', 'Ask the agent', 'Tool calls run live · every number re-checked'); });
    openDrawer();
    log.innerHTML = `<div class="hint">The agent investigates one alert. Each step chooses the next tool from what the last result showed, and stops after ${MAX} steps at most. A fixed policy makes those choices from the tool menu, so you see the same steps every time.</div>`;
    let n = 0;
    const checks = [];
    const step = async (why, name, args, decide) => {
      n++;
      const r = name ? TOOLS[name](args) : null;
      const d = decide(r && r.data);
      log.insertAdjacentHTML('beforeend', `<div class="ppa-step"><div class="sn">Step ${n} of ${MAX}</div><div class="why">${esc(why)}</div>${r ? toolLine(name, args, r) : card('Calculation', '', d.calc, ' calc')}<div class="dec">${d.text}</div></div>`);
      log.scrollTop = log.scrollHeight;
      await wait(750);
      return d;
    };
    const opt = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    let rec;
    if (kind === 'crit') {
      const inv = await step('Confirm the stock problem.', 'get_inventory', { family: id }, d => ({ d, text: `${fmt(d.wos, 'weeks')} weeks is under the ${th.low_stock_weeks}-week floor. Next: is the demand real, or a one-week spike?` }));
      checks.push({ spec: { m: 'wos', fam: id }, fmt: 'weeks', text: fmt(inv.d.wos, 'weeks') });
      const tr = await step('Check the trend before ordering more.', 'get_trend', opt({ family: id, weeks: 4, channel: ch }), d => {
        const last = d[d.length - 1].ty, prev = (d[0].ty + d[1].ty + d[2].ty) / 3, x = pc(last, prev);
        const s = x >= -5 ? 'steady or rising — not a spike' : x >= -20 ? 'a little softer' : 'cooling fast';
        return { cooling: x < -20, text: `Last week ${fmt(last, 'money')} vs a ${fmt(prev, 'money')} average for the three weeks before (${fmt(x, 'pct_signed')}): ${s}. Next: who is buying it?` };
      });
      const cu = await step('Check who drives the demand.', 'get_customers', { family: id, period: 'l4' }, d => {
        const lift = d.nw - d.brand.nw;
        return { text: lift > 10 ? `${fmt(d.nw, 'pct')} of orders come from new customers, ${fmt(lift, 'pts').replace(' pts', '')} points above the brand. It is pulling in new people, so demand looks durable.` : `New-customer share is close to the brand average (${fmt(d.nw, 'pct')} vs ${fmt(d.brand.nw, 'pct')}): demand comes from existing customers.` };
      });
      await step('See which channel the stock should go to.', 'get_sales', { family: id, group_by: 'channel', period: 'l4' }, d => {
        const tot = d.reduce((s, r) => s + r.ty, 0), top = d.slice().sort((a, b) => b.ty - a.ty)[0];
        return { text: `${top.key} sells the most: ${fmt((top.ty / tot) * 100, 'pct')} of its last-4-week sales.` };
      });
      const target = tr.cooling ? 6 : 8;
      const need = Math.floor(Math.max(0, target * inv.d.avg - inv.d.oh) / 10 + 0.5) * 10;
      await step(`Size the order to ${target} weeks of cover${tr.cooling ? ' (shorter, because demand is cooling)' : ''}.`, null, null, () => ({
        calc: `${target} × ${fmt(inv.d.avg, 'int')} units/wk − ${fmt(inv.d.oh, 'int')} on hand ≈ ${fmt(need, 'int')}`, text: `About ${fmt(need, 'int')} units.` }));
      checks.push({ spec: { m: 'reorder', fam: id, target }, fmt: 'int', text: fmt(need, 'int') }, { spec: { m: 'avg_units', fam: id }, fmt: 'int', text: fmt(inv.d.avg, 'int') });
      rec = `Reorder about <b>${fmt(need, 'int')} units</b> of ${esc(f.name)} to get back to ${target} weeks of supply.`;
    } else if (kind === 'warn') {
      const inv = await step('Confirm the stock problem.', 'get_inventory', { family: id }, d => ({ d, text: `${fmt(d.wos, 'weeks')} weeks is over the ${th.overstock_weeks}-week ceiling. Next: is it still selling?` }));
      checks.push({ spec: { m: 'wos', fam: id }, fmt: 'weeks', text: fmt(inv.d.wos, 'weeks') });
      const tr = await step('Check the sales trend vs last year.', 'get_trend', opt({ family: id, weeks: 4, channel: ch }), d => {
        const down = d.filter(r => r.chg != null && r.chg < -th.flag_change_pct / 2).length;
        return { falling: down >= 3, text: down >= 3 ? `Down vs last year in ${down} of the last 4 weeks: the slowdown is sustained. Next: is it everywhere, or one channel?` : `Only ${down} of the last 4 weeks are clearly down: it still sells close to last year, so stock is deep but moving.` };
      });
      let rebalance = null;
      if (tr.falling) {
        rebalance = (await step('Find where the decline is.', 'get_sales', { family: id, group_by: 'channel', period: 'l4' }, d => {
          const best = d[0], worst = d[d.length - 1], spread = (best.chg || 0) - (worst.chg || 0);
          return { to: spread > 15 && best.chg > 0 ? best.key : null, text: spread > 15 && best.chg > 0 ? `${worst.key} is ${fmt(worst.chg, 'pct_signed')} but ${best.key} is ${fmt(best.chg, 'pct_signed')}: part of the stock can move there.` : `Down in every channel (${d.map(r => `${r.key} ${fmt(r.chg, 'pct_signed')}`).join(', ')}): it is not a channel problem.` };
        })).to;
      }
      const excess = Math.floor(Math.max(0, inv.d.oh - th.overstock_weeks * inv.d.avg) / 10 + 0.5) * 10;
      await step('Size the excess.', null, null, () => ({ calc: `${fmt(inv.d.oh, 'int')} on hand − ${th.overstock_weeks} wks × ${fmt(inv.d.avg, 'int')} units/wk ≈ ${fmt(excess, 'int')}`, text: `About ${fmt(excess, 'int')} units above the ceiling.` }));
      rec = !tr.falling ? `Hold the next delivery of ${esc(f.name)}; no markdown yet — re-check in two weeks.`
        : rebalance ? `Hold the next delivery and move stock to <b>${esc(rebalance)}</b>; plan a markdown on what is left of the <b>${fmt(excess, 'int')} excess units</b>.`
          : `Hold the next delivery of ${esc(f.name)} and plan a markdown on about <b>${fmt(excess, 'int')} units</b>.`;
    } else {
      const sl = await step('Find where the drop is.', 'get_sales', opt({ family: id, group_by: 'channel', period: p }), d => ({ text: `Weakest channel: ${d[d.length - 1].key} ${fmt(d[d.length - 1].chg, 'pct_signed')}. Next: one bad week, or a trend?` }));
      const tr = await step('Check whether it is one week or a trend.', 'get_trend', opt({ family: id, weeks: 4, channel: ch }), d => {
        const down = d.filter(r => r.chg != null && r.chg < -th.flag_change_pct / 2).length;
        return { sustained: down >= 3, text: down >= 3 ? `Down in ${down} of the last 4 weeks: a trend.` : `Down in only ${down} of the last 4 weeks: probably a one-off.` };
      });
      await step('Check the stock position.', 'get_inventory', { family: id }, d => ({ text: d.wos > th.overstock_weeks ? 'Stock is already deep.' : d.wos < th.low_stock_weeks ? 'Stock is thin — part of the drop may be missing sizes.' : `${fmt(d.wos, 'weeks')} weeks — in range, so no stock action needed.` }));
      rec = tr.sustained ? `Flag ${esc(f.name)} to the buyer: a sustained decline, worth a look at assortment and the next buy.` : `No action this week; the agent re-checks ${esc(f.name)} next week.`;
      void sl;
    }
    log.insertAdjacentHTML('beforeend', `<div class="ppa-rec"><div class="sn">Recommendation · ${n} of ${MAX} steps used</div><p>${rec}</p>${checks.length ? qaBlock(checks, 'Self-check') : ''}<div class="btns"><button type="button" class="ppa-btn dark" data-dec="ok">Approve</button><button type="button" class="ppa-btn" data-dec="no">Dismiss</button></div></div>`);
    const box = log.lastElementChild;
    box.querySelectorAll('[data-dec]').forEach(b => b.addEventListener('click', () => {
      box.querySelector('.btns').outerHTML = b.dataset.dec === 'ok' ? '<div class="done">✓ Approved — added to this week\'s action list. (Demo: nothing is sent.)</div>' : '<div class="done muted">Dismissed — the agent will look again next week.</div>';
    }));
    log.scrollTop = log.scrollHeight;
    busy = false;
  }
  // Clear: wipe the conversation (or an agent run) and start again from the suggested questions
  $('.ppa-clear').addEventListener('click', () => {
    if (busy) return;
    D.chat.forEach(c => delete c.asked);
    clearFb();
    chatHTML = ''; mode = 'chat'; chatTitle.textContent = 'Ask the agent'; chatSub.textContent = 'Tool calls run live · every number re-checked';
    resetChat(); log.scrollTop = 0;
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-inv]');
    if (b) return investigate(+b.dataset.inv, b.dataset.kind);
    const t = e.target.closest('[data-pipe]');
    if (t) { const box = t.parentElement.nextElementSibling, open = box.hidden; box.hidden = !open; t.setAttribute('aria-expanded', open); t.textContent = open ? 'Hide' : 'How this was written'; }
  });
  $('[data-ask]').addEventListener('click', () => { if (busy) return openDrawer(); if (mode !== 'chat') setMode('chat', 'Ask the agent', 'Tool calls run live · every number re-checked'); openDrawer(); });
  $('.ppa-x').addEventListener('click', () => { chat.classList.remove('open'); chat.setAttribute('aria-hidden', 'true'); $('[data-ask]').focus(); });
  const notes = $('.ppa-notes');
  $('[data-notes]').addEventListener('click', e => { e.stopPropagation(); notes.classList.toggle('open'); });
  document.addEventListener('click', e => { if (!notes.contains(e.target)) notes.classList.remove('open'); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && !st.modal) { notes.classList.remove('open'); if (chat.classList.contains('open')) $('.ppa-x').click(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.modal) closeModal(); });
  $('[data-ins]').addEventListener('click', e => (st.modal === 'ins' ? closeModal() : openModal('ins', e.currentTarget)));
  $('[data-fbr-open]').addEventListener('click', e => openModal('fbr', e.currentTarget));
  root.querySelectorAll('[data-ins-x]').forEach(b => b.addEventListener('click', closeModal));
  $('.ins-modal').addEventListener('click', e => {
    const b = e.target.closest('[data-dec]');
    if (!b) return;
    const d = readLS(DEC_KEY, {}), k = b.dataset.key;
    if (d[k] === b.dataset.dec) delete d[k]; else d[k] = b.dataset.dec;
    writeLS(DEC_KEY, d);
    const y = $('.ins-scroll').scrollTop; renderModal(); $('.ins-scroll').scrollTop = y;
  });

  // ---------------------------------------------------------------- Weekly Insights (the agent's own weekly brief)
  // Same shape as the production Buying Weekly Insights Agent. Prose comes from data/generate.py;
  // every number in it is re-computed here, and must actually appear in the brief, before it counts as ✓.
  const sgn = x => (x > 0.05 ? 'up' : x < -0.05 ? 'dn' : '');
  function insights() {
    const b = D.insights, w = D.weeks[D.weeks.length - 1];
    const pmax = Math.max(...b.p4.filter(g => !g.own_scale).flatMap(g => g.bars.map(r => Math.abs(r.v))));
    const bars = g => {
      const mx = g.own_scale ? Math.max(...g.bars.map(r => Math.abs(r.v))) : pmax;
      return g.bars.map(r => `<div class="ins-br"><span>${esc(r.label)}</span><span class="t"><i class="${r.v < 0 ? 'neg' : 'pos'}" style="width:${((Math.abs(r.v) / mx) * 100).toFixed(1)}%"></i></span><span class="n ${sgn(r.v)}">${esc(r.t)}</span></div>`).join('');
    };
    const body = `
      <h2 class="ins-hl">${b.headline}</h2>
      <p class="ins-deck">${b.deck}</p>
      <div class="ins-h">Key stats · vs LY · momentum vs the prior 4 weeks</div>
      <div class="ins-stats">${b.stats.map(k => `<div class="ins-stat"><div class="l">${esc(k.l)}</div><div class="v">${esc(k.v)}</div><div class="d">${k.d}</div><span class="ins-tag ${k.cls}">${esc(k.tag)}</span></div>`).join('')}</div>
      <div class="ins-h">Why it moved</div>
      <p class="ins-p">${b.why}</p>
      <div class="ins-4p">${b.p4.map(g => `<div class="ins-4pc${g.lead ? ' lead' : ''}"><div class="k">${g.k}${g.lead ? '<span>primary</span>' : ''}</div><div class="ins-bars">${bars(g)}</div><div class="r">${g.note}</div></div>`).join('')}</div>
      <div class="ins-sc">Bars: pts of the total change vs LY, on one scale across Product, Place and People; Price shows % vs LY.</div>
      <div class="ins-h">Actions</div>
      <div class="ins-acts">${b.actions.map((a, i) => `<div class="ins-act"><div class="n">0${i + 1}</div><h4>${esc(a.t)}</h4><p>${a.b}</p><div class="ins-gates">${a.g.map(t => `<span>${esc(t)}</span>`).join('')}</div></div>`).join('')}</div>
      <div class="ins-bl"><div class="h">Bottom line</div><p>“${esc(b.bottom)}”</p></div>
      <div class="ins-h">Drill in</div>
      ${b.drills.map((q, i) => `<details class="ins-drill" data-drill="${i}"${i === 0 ? ' open' : ''}><summary>${esc(q.q)}</summary><div class="a"><b class="t">${q.t}</b>${q.b}<div class="ppa-trace">${q.calls.map(([n, a]) => toolLine(n, a, TOOLS[n](a))).join('')}</div></div></details>`).join('')}`;
    const checks = b.checks.map(c => ({ ...c, text: body.includes(c.text) ? c.text : '∅' }));
    const ok = checks.filter(c => fmt(E.metric(c.spec), c.fmt) === c.text).length;
    return `<div class="ppa-card ins">
      <div class="ins-mast"><span>Weekly insights · W${w.wk} · ${date(w.ty[0])}–${date(w.ty[1])} · ${esc(C.name)} · all channels</span><span class="${ok === checks.length ? 'ok' : 'bad'}">${ok === checks.length ? '✓' : '✗'} ${ok} of ${checks.length} numbers re-checked</span></div>
      ${body}
      <div class="ins-foot">In production, Python computes the facts and an LLM writes the prose around them. Here the prose is written from the same facts, and every number is re-computed in your browser.${qaBlock(checks, 'Weekly brief QA')}</div>
    </div>`;
  }
  // ---------------------------------------------------------------- weekly feedback review (AI drafts, business decides)
  // Ratings stay in this browser (localStorage); nothing is sent anywhere. The seeded week comes from data/generate.py.
  const FB_KEY = 'ppa-feedback-v1', DEC_KEY = 'ppa-review-decisions-v1';
  function readLS(k, dflt) { try { return JSON.parse(localStorage.getItem(k)) ?? dflt; } catch (e) { return dflt; } }
  function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: feedback just isn't kept */ } }
  const myFb = () => readLS(FB_KEY, []).filter(r => r.region === st.region);
  function logFb(rec) {
    const all = readLS(FB_KEY, []);
    all.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), region: st.region, ...rec });
    writeLS(FB_KEY, all); pulseFbLink();
  }
  function clearFb() {
    const all = readLS(FB_KEY, []), gone = new Set(all.filter(r => r.region === st.region).map(r => r.id)), d = readLS(DEC_KEY, {});
    gone.forEach(id => delete d[id]);
    writeLS(FB_KEY, all.filter(r => !gone.has(r.id))); writeLS(DEC_KEY, d);
  }
  function pulseFbLink() { const b = $('[data-fbr-open]'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); clearTimeout(pulseFbLink.t); pulseFbLink.t = setTimeout(() => b.classList.remove('pulse'), 1600); }
  const REASONS = ['Wrong number', 'Not what I asked', 'Too vague', 'Other'];
  const fbBar = i => `<div class="ppa-fb" data-fq="${i}"><span>Was this useful?</span><button type="button" data-rate="up" aria-label="Useful">👍</button><button type="button" data-rate="down" aria-label="Not useful">👎</button></div>`;
  const fbForm = i => `<div class="ppa-fbf" data-fq="${i}"><div class="h">What went wrong?</div><div class="chips">${REASONS.map(r => `<button type="button" data-reason="${r}" aria-pressed="false">${r}</button>`).join('')}</div><textarea maxlength="200" placeholder="Optional: what did you expect?" aria-label="What did you expect?"></textarea><div class="row"><span>Stays in your browser · goes into this week's review</span><button type="button" class="send" disabled>Send</button></div></div>`;
  const fbThanks = () => `<div class="ppa-fbdone">✓ Thanks — logged. <button type="button" class="ppa-link" data-fbr>See what the owner sees → Feedback review</button></div>`;
  log.addEventListener('click', e => {
    const r = e.target.closest('[data-rate]');
    if (r) {
      const box = r.closest('.ppa-fb'), i = +box.dataset.fq;
      if (r.dataset.rate === 'up') { logFb({ kind: 'up', i, q: D.chat[i].q }); box.outerHTML = fbThanks(); return; }
      box.querySelectorAll('[data-rate]').forEach(b => b.classList.toggle('on', b === r));
      if (!(box.nextElementSibling && box.nextElementSibling.classList.contains('ppa-fbf'))) box.insertAdjacentHTML('afterend', fbForm(i));
      return;
    }
    const c = e.target.closest('.ppa-fbf [data-reason]');
    if (c) { c.parentElement.querySelectorAll('[data-reason]').forEach(x => x.setAttribute('aria-pressed', x === c)); c.closest('.ppa-fbf').querySelector('.send').disabled = false; return; }
    const sb = e.target.closest('.ppa-fbf .send');
    if (sb) {
      const f = sb.closest('.ppa-fbf'), i = +f.dataset.fq;
      logFb({ kind: 'down', i, q: D.chat[i].q, reason: f.querySelector('[data-reason][aria-pressed=true]').dataset.reason, note: f.querySelector('textarea').value.trim().slice(0, 200) });
      f.previousElementSibling.remove(); f.outerHTML = fbThanks(); log.scrollTop = log.scrollHeight; return;
    }
    if (e.target.closest('[data-fbr]')) openModal('fbr', $('[data-fbr-open]'));
  });
  const DEC = [['fix', 'Fix now'], ['later', 'Later'], ['wont', "Won't fix"], ['def', 'Needs a definition']];
  function myRows(recs) {
    return recs.filter(r => r.kind !== 'up').map(r => {
      const base = { key: r.id, you: true, n: 1, ex: r.q, note: r.note };
      if (r.kind === 'nodata') return { ...base, theme: 'Typed question with no answer', src: '“no data” reply', dg: 'scope', dl: 'Out of scope', sug: "Not in this agent's answers yet. Add it, or say so in “What it covers”.", ai: 'later' };
      if (r.reason === 'Wrong number') { // the agent re-runs the answer's checks before it diagnoses
        const ck = D.chat[r.i].checks, ok = ck.filter(c => fmt(E.metric(c.spec), c.fmt) === c.text).length, all = ok === ck.length;
        return { ...base, theme: 'You flagged a wrong number', src: '1 👎', dg: all ? 'def' : 'bug', dl: all ? 'Definition gap?' : 'Bug',
          sug: all ? `The agent re-ran the checks: ${ok} of ${ck.length} numbers match the data, so the gap is likely the definition you expected.` : `The re-run found ${ck.length - ok} number(s) that don't match. Fix, and add a test case.`, ai: all ? 'def' : 'fix' };
      }
      const m = { 'Not what I asked': ['und', 'Misread question', 'Add this wording to the routing examples and the test set.', 'fix'], 'Too vague': ['und', 'Answer too thin', 'Add the follow-up you needed to this answer.', 'later'], Other: ['scope', 'Needs triage', 'Read the note; one report is not a pattern yet.', 'later'] }[r.reason];
      return { ...base, theme: r.reason === 'Other' ? 'Other feedback' : `“${r.reason}”`, src: '1 👎', dg: m[0], dl: m[1], sug: m[2], ai: m[3] };
    });
  }
  function feedbackReview() {
    const R = D.review, s = R.sig, recs = myFb(), dec = readLS(DEC_KEY, {});
    const up = recs.filter(r => r.kind === 'up').length, dn = recs.filter(r => r.kind === 'down').length, nd = recs.filter(r => r.kind === 'nodata').length;
    const mine = myRows(recs), rows = [...mine, ...R.rows.map((r, i) => ({ ...r, key: st.region + '-s' + i }))];
    const you = k => (k ? ` · ${k} from you` : ''), q = s.q + nd, dq = s.q - s.prev;
    const tile = (l, v, d) => `<div><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const got = rows.filter(r => dec[r.key]), tally = got.length ? `You decided ${got.length} of ${rows.length}: ` + DEC.map(([k, l]) => [l, got.filter(r => dec[r.key] === k).length]).filter(x => x[1]).map(([l, n]) => `${n} ${l.toLowerCase()}`).join(' · ') : 'Dashed = the agent\'s suggestion · click to decide';
    const row = r => `<div class="fbr-r${r.you ? ' you' : ''}">
        <div><div class="th">${esc(r.theme)}</div><div class="ex">“${esc(r.ex)}”</div>${r.note ? `<div class="nt">Note: ${esc(r.note)}</div>` : ''}<span class="src">${esc(r.src)}</span>${r.you ? '<span class="src me">You · this browser</span>' : ''}</div>
        <div class="cnt"><span>Count</span>${r.n}</div>
        <div><span class="dg ${r.dg}">${esc(r.dl)}</span><div class="sug">${esc(r.sug)}</div></div>
        <div class="dec">${DEC.map(([k, l]) => `<button type="button" data-dec="${k}" data-key="${esc(r.key)}"${r.ai === k ? ' class="ai"' : ''} aria-pressed="${dec[r.key] === k}">${l}</button>`).join('')}</div></div>`;
    return `<div class="ppa-card fbr">
      <div class="fbr-loop">${[['1 · Log', 'Every answer, 👍/👎 and reason'], ['2 · Weekly pull', "All of the week's turns"], ['3 · Agent drafts', 'Prioritises, summarises, suggests a fix', 'ai'], ['4 · Business decides', "Fix now · Later · Won't fix · Needs a definition", 'you'], ['5 · Fix + test', 'Each fix becomes a regression test'], ['6 · Tell the user', '“The thing you flagged is fixed”']].map(([h, t, c]) => `<div${c ? ` class="${c}"` : ''}><b>${h}</b>${t}</div>`).join('')}</div>
      <div class="ins-mast"><span>Feedback review · W${R.wk} · ${esc(C.name)} · synthetic week</span><span>${rows.length} themes${mine.length ? ` · ${mine.length} from you` : ''}</span></div>
      <h2 class="fbr-hl">${esc(R.headline)}</h2>
      <p class="fbr-p">${R.text}</p>
      <div class="fbr-sig">${tile('Questions', q, `${dq >= 0 ? '+' : M}${Math.abs(dq)} vs W${R.wk - 1}${you(nd)}`)}${tile('👍 / 👎', `${s.up + up} / ${s.dn + dn}`, `1 in ${Math.round(q / (s.up + up + s.dn + dn))} answers rated${you(up + dn)}`)}${tile('Rephrased', s.reph, 'asked again in new words')}${tile('“No data” replies', s.nodata + nd, 'out of scope' + you(nd))}${tile('Checker flags', s.flags, 'blocked before shown')}</div>
      <div class="fbr-h"><span>Ranked by the agent · you decide each row</span><span class="tally">${esc(tally)}</span></div>
      <div class="fbr-t"><div class="fbr-r hd"><div>Theme</div><div>Count</div><div>Diagnosis · suggested fix</div><div>Decision</div></div>${rows.map(row).join('')}</div>
      <div class="fbr-h"><span>Fixed last week · loop closed</span></div>
      <div class="fbr-done">${R.done.map(x => `<div><b>${esc(x.t)}</b> <span>· ${esc(x.d)}</span></div>`).join('')}</div>
      <div class="ins-foot">In production, every turn and rating lands in a warehouse table; each week the agent reads them, prioritises and summarises the feedback into this list, and the business team reviews it with us. Here the week is synthetic, and your own ratings stay in this browser — nothing is sent anywhere.</div>
    </div>`;
  }

  // ---------------------------------------------------------------- modal (Weekly Insights · Feedback review)
  // Opens as a newsletter over the dashboard (same as the production agent's modal); the dashboard stays put behind it.
  const modal = $('.ins-modal');
  let opener = null;
  function renderModal() {
    const wk = D.weeks[D.weeks.length - 1].wk, ins = st.modal === 'ins';
    $('#ins-title').textContent = ins ? 'Weekly Insights' : 'Feedback review';
    $('.ins-ttl small').textContent = ins ? 'Written by the agent every week · W' + wk : `Drafted by the agent every Monday · W${wk} · you decide`;
    $('.ins-reg').hidden = !ins;
    $('.ins-scroll').innerHTML = ins ? insights() : feedbackReview();
  }
  function openModal(kind, from) {
    st.modal = kind; opener = from || null;
    modal.hidden = false; document.documentElement.classList.add('ins-lock');
    $('[data-ins]').setAttribute('aria-pressed', kind === 'ins');
    renderModal(); $('.ins-scroll').scrollTop = 0; $('.ins-x').focus();
  }
  function closeModal() {
    if (!st.modal) return;
    st.modal = null; modal.hidden = true; document.documentElement.classList.remove('ins-lock');
    $('[data-ins]').setAttribute('aria-pressed', false);
    (opener && opener.isConnected ? opener : $('[data-ins]')).focus();
  }

  // ---------------------------------------------------------------- render
  function context(v) {
    const w0 = D.weeks[v.a], w1 = D.weeks[v.n - 1];
    const wk = v.a === v.n - 1 ? `<b>W${w1.wk}</b>` : `<b>W${w0.wk}–W${w1.wk}</b>`;
    return `Showing ${wk} (${date(w0.ty[0])}–${date(w1.ty[1])}) · ${esc(C.name)} · ${st.ch ? esc(st.ch) : 'all channels'} · ${esc(C.fiscal.year)} vs ${esc(C.fiscal.last_year)}, same fiscal weeks · data as of ${date(D.as_of)}`;
  }
  function render() {
    const v = view();
    $('.ppa-ctx').innerHTML = context(v);
    $('.ppa-panel').innerHTML = { overview, products, customers, inventory }[st.tab](v);
    drawCharts(v);
    root._v = v;
    if (st.modal) renderModal();
  }
  function setChannels() {
    const sel = $('[data-f="ch"]');
    if (!C.channels.includes(st.ch)) st.ch = '';
    sel.innerHTML = '<option value="">All channels</option>' + C.channels.map(c => `<option${c === st.ch ? ' selected' : ''}>${esc(c)}</option>`).join('');
  }
  async function load(r) {
    if (!cache[r]) {
      const [d, cText] = await Promise.all([
        fetch(`${BASE}/data/${r}.json`).then(x => x.json()),
        fetch(`${BASE}/config/${r}.json`).then(x => x.text()),
      ]);
      cache[r] = { d, c: JSON.parse(cText), cText };
    }
    return cache[r];
  }
  async function setRegion(r) {
    try {
      const x = await load(r);
      if (busy) return;
      st.region = r; D = x.d; C = x.c; E = new Engine(D);
      D.chat.forEach(c => delete c.asked);
      mode = 'chat'; chatTitle.textContent = 'Ask the agent'; chatSub.textContent = 'Tool calls run live · every number re-checked';
      root.querySelectorAll('[data-r]').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === r));
      setChannels(); resetChat(); render();
      const cfg = document.getElementById('ppa-config');
      if (cfg) {
        cfg.innerHTML = `<span class="k">// config/${r}.json</span>\n` + esc(x.cText.trim())
          .replace(/(&quot;[a-z_]+&quot;)(:)/g, '<span class="k">$1</span>$2')
          .replace(/(: )(&quot;[^&]*&quot;|\d+)/g, '$1<span class="v">$2</span>')
          .replace(/(\[|, )(&quot;[^&]*&quot;)/g, '$1<span class="v">$2</span>');
      }
      document.dispatchEvent(new CustomEvent('ppa:region', { detail: { region: r, config: C } }));
    } catch (e) {
      $('.ppa-panel').innerHTML = `<div class="ppa-card">Could not load the demo data. If you opened this file directly, serve the folder instead (for example <code>python3 -m http.server</code>).</div>`;
      console.error(e);
    }
  }
  root.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => setRegion(b.dataset.r)));
  $('[data-f="p"]').addEventListener('change', e => { st.p = e.target.value; render(); });
  $('[data-f="ch"]').addEventListener('change', e => { st.ch = e.target.value; render(); });
  root.querySelectorAll('[role=tab]').forEach(t => t.addEventListener('click', () => {
    st.tab = t.dataset.tab;
    root.querySelectorAll('[role=tab]').forEach(o => o.setAttribute('aria-selected', o === t));
    render();
  }));
  let rt;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => root._v && drawCharts(root._v), 80); }).observe($('.ppa-body'));
  window.__ppa = { st, setRegion, check: () => D.chat.map(c => c.checks.map(k => [fmt(E.metric(k.spec), k.fmt), k.text])) };
  setRegion('na');
})();
