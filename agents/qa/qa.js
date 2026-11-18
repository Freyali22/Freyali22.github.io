/* QA Agent demo — fictional brand, synthetic logs.
   Every night the agent re-checks what the other three demo agents wrote: each claim is re-computed
   from the source, an LLM judge scores the rest, and a reviewer decides each flag. One engine (sums over
   day x agent x output type, plus this week's flags grouped by cause) feeds every tab, the Weekly QA
   report and the chatbot. Every sentence is written by rules from those sums, so it follows the filters. */
(function () {
  'use strict';
  const root = document.getElementById('qa');
  if (!root) return;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const BASE = root.dataset.base || '.';
  const M = '−';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let D, TW, LW;
  const st = { tab: 'overview', ag: 'all', ty: 'all', sel: null, modal: null };

  // ---------------------------------------------------------------- format
  const n0 = x => Math.round(x).toLocaleString('en-US');
  const p1 = x => (!isFinite(x) ? '–' : (x * 100).toFixed(1) + '%');
  const sgn = (x, d = 1) => (Math.abs(x) < 0.5 * Math.pow(10, -d) ? (0).toFixed(d) : (x > 0 ? '+' : M) + Math.abs(x).toFixed(d));
  const tone = (x, bad) => (!isFinite(x) || Math.abs(x) < 1e-9 ? 'flat' : (x > 0) !== !!bad ? 'up' : 'dn');
  const arrow = x => (!isFinite(x) || Math.abs(x) < 1e-9 ? '' : x > 0 ? '▲ ' : '▼ ');
  const dd = s => { const [, m, d] = s.split('-'); return [MON[+m - 1], +d]; };
  const wlab = wi => { const w = D.meta.weeks[wi], [m1, d1] = dd(w.start), [m2, d2] = dd(w.end); return m1 === m2 ? `${m1} ${d1}–${d2}` : `${m1} ${d1} – ${m2} ${d2}`; };
  const daySpan = ds => { const u = [...new Set(ds)].sort((a, b) => a - b); return u.length > 2 ? `${dayLab(u[0])} – ${dayLab(u[u.length - 1])}` : u.map(dayLab).join(', '); };
  const dayLab = di => { const w = D.meta.weeks[Math.floor(di / 7)], [m, d] = dd(w.start), dt = new Date(2026, MON.indexOf(m), d + (di % 7)); return `${DOW[di % 7]} ${dt.getMonth() + 1}/${dt.getDate()}`; };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const words = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  const c = (v, src) => `<span class="cite" data-src="${esc(src)}">${v}</span>`;   // a cited figure
  const ct = (v, src) => `<span class="cite-t" data-src="${esc(src)}">${v}</span>`; // a cited passage

  // ---------------------------------------------------------------- engine
  const AG = k => D.agents.find(a => a.k === k);
  const KS = () => (st.ag === 'all' ? D.agents.map(a => a.k) : [st.ag]);
  const TS = () => (st.ty === 'all' ? ['chat', 'brief'] : [st.ty]);
  const TYN = { all: 'all outputs', chat: 'chatbot answers', brief: 'written briefs' };
  function sum(wi, ks = KS(), ts = TS(), days) {
    const r = { out: 0, cl: 0, bad: 0, js: 0, fl: 0 };
    const ds = days || Array.from({ length: 7 }, (_, i) => 7 * wi + i);
    ks.forEach(k => ts.forEach(t => ds.forEach(d => { const x = D.grid[k][t][d]; r.out += x[0]; r.cl += x[1]; r.bad += x[2]; r.js += x[3]; r.fl += x[4]; })));
    r.match = r.cl ? 1 - r.bad / r.cl : NaN; r.judge = r.out ? r.js / r.out / 10 : NaN; r.rate = r.out ? r.fl / r.out : NaN;
    return r;
  }
  const readLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const VERD = 'qa:verdicts:v1';
  function causes(ks = KS(), ts = TS()) {   // this week's flags, grouped by cause, in view (with your verdicts applied)
    const vd = readLS(VERD, {});
    return D.causes.filter(x => ks.includes(x.agent)).map(x => {
      const n = x.types.filter(t => ts.includes(t)).length;
      const ex = x.ex.find(e => ts.includes(e.type)) || x.ex[0];
      const days = x.days.filter((_, i) => ts.includes(x.types[i]));
      const status = x.status === 'rev' && vd[x.id] ? (vd[x.id] === 'y' ? 'conf' : 'fa') : x.status;
      return { ...x, n, ex, days, status, decided: x.status === 'rev' && !!vd[x.id] };
    }).filter(x => x.n > 0);
  }
  const RANK = { rev: 0, conf: 1, ship: 2, fa: 3 };
  const byWorst = (a, b) => RANK[a.status] - RANK[b.status] || b.n - a.n;
  const ST = { rev: 'Needs review', conf: 'Confirmed', ship: 'Fix shipped', fa: 'False alarm' };
  const ISS = k => D.issues.find(i => i.k === k);
  function view() {
    const tw = sum(TW), lw = sum(LW), cs = causes();
    const real = cs.filter(x => x.status === 'conf' || x.status === 'ship'), fa = cs.filter(x => x.status === 'fa'), rev = cs.filter(x => x.status === 'rev');
    const nOf = l => l.reduce((s, x) => s + x.n, 0);
    const label = (st.ag === 'all' ? 'all agents' : AG(st.ag).name) + ' · ' + TYN[st.ty];
    return { tw, lw, cs, real: nOf(real), fa: nOf(fa), rev: nOf(rev), late: nOf(cs.filter(x => x.root === 'late')), label,
      byChecker: nOf(cs.filter(x => x.by === 'checker')), byJudge: nOf(cs.filter(x => x.by === 'judge')), ships: cs.filter(x => x.status === 'ship') };
  }
  const tests = (ks = KS()) => D.fixes.filter(f => f.w === TW && ks.includes(f.agent)).reduce((s, f) => s + f.tests, 0);
  const testRange = l => { const f = l.filter(x => x.tests); if (!f.length) return ''; const a = Math.min(...f.map(x => x.from)), b = Math.max(...f.map(x => x.to)); return a === b ? `#${a}` : `#${a}–#${b}`; };

  // ---------------------------------------------------------------- building blocks
  const kpi = (l, v, d) => `<div class="ppa-kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  const sumList = rows => `<dl class="ppa-sum">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
  function alertBox(list, act, none) {
    const items = list.length
      ? list.map(a => `<li class="${a.lv}"><b><span class="tag ${a.lv}">${esc(a.tag)}</span>${esc(a.name)}</b><span>${esc(a.txt)}</span>${a.go ? `<button type="button" class="ppa-inv" data-go="${a.go}">Investigate →</button>` : ''}</li>`).join('')
      : `<li class="none">${esc(none || 'Nothing to act on in this view.')}</li>`;
    return `<div><div class="ppa-al-h"><span>Alerts</span><span>${act} to act on${list.length ? ' · ' + list.length + ' total' : ''}</span></div><ul class="ppa-al">${items}</ul></div>`;
  }
  const insBox = (rows, al) => `<div class="ppa-ins"><div><div class="ppa-al-h"><span>Summary</span></div>${sumList(rows)}</div>${al}</div>`;
  const by = b => `<span class="by ${b === 'checker' ? 'c' : 'j'}">${b === 'checker' ? 'Checker' : 'Judge'}</span>`;
  const chip = s => `<span class="st ${s}">${ST[s]}</span>`;
  const lwv = (now, prev, bad, fmt) => { const x = now - prev; return `<b class="${tone(x, bad)}">${arrow(x)}${fmt(x)}</b>`; };
  const statusPhrase = x => x.status === 'ship' ? `fix shipped ${x.shipped}` : x.status === 'rev' ? 'a reviewer hasn\'t decided yet' : x.status === 'fa' ? 'a false alarm' : 'fix drafted, waiting on the owner';

  // ---------------------------------------------------------------- Overview
  function overviewTab(V) {
    const { tw, lw } = V, ks = KS(), one = ks.length === 1;
    const ch = sum(TW, ks, ['chat']).out, br = sum(TW, ks, ['brief']).out;
    const top = V.cs.slice().sort((a, b) => b.n - a.n)[0];
    const sumRows = [
      ['Reviewed', `${n0(tw.out)} outputs from ${one ? AG(ks[0]).name : 'three agents'}${st.ty === 'all' ? `: ${n0(ch)} chatbot answers and ${n0(br)} written ${br === 1 ? 'brief' : 'briefs'}` : ''}. Every number, direction word and ranking is re-computed from the source; an LLM judge scores the rest.`],
      ['Claims', `${n0(tw.cl)} checked, ${tw.bad} didn't match the source${!one && tw.bad ? (() => { const w = ks.map(k => [k, sum(TW, [k]).bad]).sort((a, b) => b[1] - a[1])[0]; return ` — ${w[1]} of them in ${AG(w[0]).name}`; })() : ''}.`],
      ['Flagged', `${tw.fl} ${tw.fl === 1 ? 'output' : 'outputs'}, ${tw.fl < lw.fl ? 'down' : tw.fl > lw.fl ? 'up' : 'level'} ${tw.fl === lw.fl ? 'with' : 'from'} ${lw.fl} last week.${!one ? ' ' + ks.map(k => { const a = sum(TW, [k]).fl, b = sum(LW, [k]).fl; return `${AG(k).name} ${b} → ${a}`; }).join(', ') + '.' : ''}`],
    ];
    if (top) sumRows.push(['Biggest issue', `${AG(top.agent).name}: ${top.summary} — ${statusPhrase(top)}.`]);
    sumRows.push(['Reviewers', V.real + V.fa ? `Agreed with ${V.real} of ${V.real + V.fa} flags reviewed.${V.fa ? ` ${plural(V.fa, 'false alarm')}.` : ''}${V.rev ? ` ${V.rev} still waiting.` : ' Nothing waiting.'}` : 'No flags to review in this view.']);
    const al = V.cs.filter(x => x.status !== 'fa').sort((a, b) => b.n - a.n).slice(0, 3).map(x => ({
      lv: x.status === 'ship' ? 'info' : x.n >= 5 || x.status === 'rev' ? (x.status === 'rev' ? 'warn' : 'crit') : 'warn',
      tag: x.status === 'rev' ? 'Needs review' : ISS(x.issue).name, name: `${AG(x.agent).name} · ${x.title}`,
      txt: `${plural(x.n, 'output')} · ${statusPhrase(x)}`, go: x.id }));
    const act = al.filter(a => a.lv !== 'info').length;
    // tables
    const rowsAg = one ? TS().map(t => ({ name: t === 'chat' ? 'Chatbot answers' : 'Written briefs', sub: t === 'brief' ? AG(ks[0]).brief : '', t: sum(TW, ks, [t]), l: sum(LW, ks, [t]) }))
      : ks.map(k => ({ name: AG(k).name, sub: `${n0(sum(TW, [k], ['chat']).out)} chat · ${sum(TW, [k], ['brief']).out} ${AG(k).brief}`, t: sum(TW, [k]), l: sum(LW, [k]) })).map(r => (st.ty === 'all' ? r : { ...r, sub: TYN[st.ty] }));
    const tr = r => `<tr><td>${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td><td class="n">${n0(r.t.out)}</td><td class="n">${n0(r.t.cl)}</td><td class="n">${p1(r.t.match)}</td><td class="n">${r.t.fl}<small>LW ${r.l.fl}</small></td><td class="n">${r.t.judge.toFixed(1)}<small>LW ${r.l.judge.toFixed(1)}</small></td></tr>`;
    const foot = rowsAg.length > 1 ? `<tfoot><tr><td>${one ? 'All outputs' : 'All agents'}</td><td class="n">${n0(tw.out)}</td><td class="n">${n0(tw.cl)}</td><td class="n">${p1(tw.match)}</td><td class="n">${tw.fl}<small>LW ${lw.fl}</small></td><td class="n">${tw.judge.toFixed(1)}<small>LW ${lw.judge.toFixed(1)}</small></td></tr></tfoot>` : '';
    const iss = D.issues.map(i => { const l = V.cs.filter(x => x.issue === i.k); return { ...i, n: l.reduce((s, x) => s + x.n, 0), parts: ks.map(k => [AG(k).short, l.filter(x => x.agent === k).reduce((s, x) => s + x.n, 0)]).filter(p => p[1]) }; }).filter(i => i.n);
    const mx = Math.max(1, ...iss.map(i => i.n));
    const nights = Array.from({ length: 7 }, (_, i) => { const d = 7 * TW + i, s = sum(TW, ks, TS(), [d]), top = V.cs.map(x => [x, x.days.filter(y => y === d).length]).sort((a, b) => b[1] - a[1])[0]; return { d, s, top }; });
    const avgF = nights.reduce((a, x) => a + x.s.fl, 0) / 7;
    return `<section class="ppa-card">
      <div class="ppa-kick">1 · Overview — how good were the agents' answers this week?</div>
      <div class="ppa-kpis">
        ${kpi('Outputs reviewed', n0(tw.out), st.ty === 'all' ? `${n0(ch)} chatbot answers · ${br} ${br === 1 ? 'brief' : 'briefs'}` : `${TYN[st.ty]} · LW ${n0(lw.out)}`)}
        ${kpi('Claims checked', n0(tw.cl), `<b class="${tone(tw.match - lw.match)}">${p1(tw.match)}</b> match the source · LW ${p1(lw.match)}`)}
        ${kpi('Outputs flagged', String(tw.fl), `${lwv(tw.fl, lw.fl, true, x => (x > 0 ? '+' : M) + Math.abs(x))} vs LW ${lw.fl} · ${p1(tw.rate)} of outputs`)}
        ${kpi('Judge score', `${tw.judge.toFixed(1)}<small class="of"> / 5</small>`, `${lwv(+tw.judge.toFixed(1), +lw.judge.toFixed(1), false, x => sgn(x))} vs last week · LW ${lw.judge.toFixed(1)}`)}
      </div>
      ${insBox(sumRows, alertBox(al, act))}
    </section>
    <div class="ppa-grid even">
      <section class="ppa-card"><h3>${one ? 'By output' : 'By agent'}</h3><div class="sub">This week (${wlab(TW)}), ${TYN[st.ty]}. LW = last week.</div>
        <div class="ppa-tw"><table class="ag"><thead><tr><th>${one ? 'Output' : 'Agent'}</th><th class="n">Outputs</th><th class="n">Claims</th><th class="n">Match</th><th class="n">Flagged</th><th class="n">Judge</th></tr></thead>
        <tbody>${rowsAg.map(tr).join('')}</tbody>${foot}</table></div>
      </section>
      <section class="ppa-card"><h3>Flags by issue</h3><div class="sub">This week. Who caught it: the claim checker or the LLM judge.</div>
        ${iss.length ? `<div class="ppa-tw"><table><thead><tr><th>Issue</th><th>Caught by</th><th class="n">Flags</th><th></th></tr></thead>
        <tbody>${iss.map(i => `<tr><td>${esc(i.name)}${!one ? `<small>${i.parts.map(p => p.join(' ')).join(' · ')}</small>` : ''}</td><td>${by(i.by)}</td><td class="n">${i.n}</td><td class="bar"><div class="hb"><i class="${i.by === 'judge' ? 'j' : ''}" style="width:${Math.max(4, i.n / mx * 100)}%"></i></div></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="n">${tw.fl}</td><td></td></tr></tfoot></table></div>` : '<p class="note">No flags in this view this week.</p>'}
        <div class="note">Anything with a right answer goes to the checker, a rule with no opinion. The judge only scores what a rule can't: grounding and relevance.</div>
      </section>
    </div>
    <section class="ppa-card"><h3>Nightly runs</h3><div class="sub">The agent checks the day's outputs every night at ${D.meta.runAt} and flags anything wrong by morning. This week adds up all seven runs.</div>
      <div class="nr">${nights.map(x => { const hot = x.s.fl >= 4 && x.s.fl >= 2 * avgF; return `<div class="${hot ? 'hot' : ''}"><b>${dayLab(x.d)}</b>${n0(x.s.out)} outputs<span class="f">${x.s.fl}</span>flagged${hot && x.top && x.top[1] * 2 > x.s.fl ? ` · ${x.top[1]} ${esc(x.top[0].title.toLowerCase())}` : ''}</div>`; }).join('')}</div>
    </section>`;
  }

  // ---------------------------------------------------------------- Flagged
  function detail(x) {
    const e = x.ex, bad = e.claims.filter(k => k[3] === 0).length, chk = e.claims.filter(k => k[3] != null).length;
    const cl = e.claims.length ? e.claims.map(k => `<li class="${k[3] === 1 ? 'ok' : k[3] === 0 ? 'bad' : 'na'}"><div>${esc(k[0])}<small>answer: ${esc(k[1])}</small></div><div><small>source</small>${esc(k[2])}</div><span class="ic" aria-label="${k[3] === 1 ? 'matches' : k[3] === 0 ? 'does not match' : 'no source'}">${k[3] === 1 ? '✓' : k[3] === 0 ? '✗' : '–'}</span></li>`).join('')
      : '<li class="none">No numbers, rankings or direction words to check — this one goes to the judge.</li>';
    const J = ['Accuracy', 'Relevance', 'Grounding'];
    let fx;
    if (x.status === 'rev') fx = '';
    else if (x.decided) fx = `<div class="fix${x.status === 'fa' ? ' fa' : ''}"><span class="t">${x.status === 'fa' ? 'FALSE ALARM' : 'FIX DRAFTED'}</span>${esc(x.status === 'fa' ? x.fixN : x.fixY)} <button type="button" class="ppa-link" data-undo="${x.id}">Undo</button></div>`;
    else if (x.status === 'fa') fx = `<div class="fix fa"><span class="t">FALSE ALARM</span>${esc(x.fix)}</div>`;
    else fx = `<div class="fix${x.status === 'conf' ? ' draft' : ''}"><span class="t">${x.status === 'ship' ? 'FIX SHIPPED ' + esc(x.shipped).toUpperCase() : 'FIX DRAFTED'}</span>${esc(x.fix)}${x.test ? `<br><span class="test">→ added to release tests ${x.test}</span>` : x.status === 'conf' ? `<br><span class="test dr">Owner: ${esc(x.owner)} · becomes a release test when it ships</span>` : ''}</div>`;
    return `<div class="dt-meta">${esc(AG(x.agent).name)} · ${esc(e.scope)} · ${esc(e.when)} ${chip(x.status)}</div>
      <div class="dt-n">${esc(x.title)} · ${plural(x.n, 'output')} this week · example below</div>
      <div class="dt-q">${e.type === 'brief' ? esc(e.q) : '"' + esc(e.q) + '"'}</div>
      <div class="dt-a">${e.a}</div>
      <div class="dt-h"><span>Claim checker · re-computed from the source</span><span>${chk ? `${chk - bad} of ${chk} match` : 'nothing to check'}</span></div>
      <div class="inl"><b>INLINE CHECK</b>${esc(e.inl)}</div>
      <ul class="claims">${cl}</ul>
      <div class="dt-h"><span>LLM judge</span><span>1–5 · sees the checker's result</span></div>
      <div class="rubric">${e.judge.map((v, i) => `<div><span>${J[i]}</span><b class="${v <= 2 ? 'lo' : ''}">${v}</b></div>`).join('')}</div>
      <div class="why">${esc(e.jwhy)}</div>
      <div class="dt-h"><span>Reviewer</span><span>${x.status === 'rev' ? 'your call' : 'decided'}</span></div>
      <div class="verdict"><button type="button" class="y${x.status === 'conf' || x.status === 'ship' ? ' on' : ''}" data-v="y" data-id="${x.id}"${x.status === 'rev' ? '' : ' disabled'}>✓ Real issue</button><button type="button" class="n${x.status === 'fa' ? ' on' : ''}" data-v="n" data-id="${x.id}"${x.status === 'rev' ? '' : ' disabled'}>✗ False alarm</button></div>
      ${fx}`;
  }
  function flaggedTab(V) {
    const cs = V.cs.slice().sort(byWorst);
    if (!cs.find(x => x.id === st.sel)) st.sel = cs.length ? cs[0].id : null;
    const sel = cs.find(x => x.id === st.sel);
    const ships = V.ships, tn = ships.reduce((s, x) => s + (x.tests || 0), 0);
    return `<section class="ppa-card">
      <div class="ppa-kick">2 · Flagged — what went wrong, and is it real?</div>
      <div class="ppa-kpis">
        ${kpi('Flagged', String(V.tw.fl), `${V.byChecker} by the checker · ${V.byJudge} by the judge`)}
        ${kpi('Confirmed by a reviewer', String(V.real), `real issues · ${plural(V.fa, 'false alarm')}`)}
        ${kpi('Needs review', String(V.rev), V.rev ? 'waiting on the agent owner' : 'every flag has a decision')}
        ${kpi('Fixes shipped', String(ships.length), tn ? `${plural(tn, 'new release test')} · ${D.testsTotal} in total` : `${D.testsTotal} release tests in total`)}
      </div>
    </section>
    <div class="qa-grid">
      <section class="ppa-card"><h3>Flagged outputs, by cause</h3><div class="sub">${plural(V.tw.fl, 'output')} in ${plural(cs.length, 'cause')} · worst first · click one to see how it was checked</div>
        ${cs.length ? `<div class="ppa-tw"><table class="causes"><thead><tr><th>Cause</th><th class="n">Outputs</th><th>Status</th></tr></thead><tbody>
        ${cs.map(x => `<tr data-sel="${x.id}" aria-selected="${x.id === st.sel}" tabindex="0"><td class="wrap">${esc(x.title)}<small>${esc(AG(x.agent).name)} · ${esc(daySpan(x.days))}</small><small class="iss">${by(x.by)} ${esc(ISS(x.issue).name)}</small></td><td class="n">${x.n}</td><td>${chip(x.status)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="note">No flags in this view this week.</p>'}
      </section>
      <section class="ppa-card detail" aria-live="polite">${sel ? detail(sel) : '<p class="note">Nothing to show.</p>'}</section>
    </div>`;
  }

  // ---------------------------------------------------------------- Trends
  function trendsTab(V) {
    const ks = KS(), first = sum(0), now = V.tw;
    const rv = ks.reduce((a, k) => { D.review[k].forEach(([r, f], wi) => { if (wi === TW) return; a.r += r; a.f += f; }); return a; }, { r: 0, f: 0 });
    rv.r += V.real + V.fa; rv.f += V.fa;
    const fx = D.fixes.filter(f => ks.includes(f.agent)).sort((a, b) => b.w - a.w || a.from - b.from);
    const fxN = (f, wi) => sum(wi, [f.agent], ['chat', 'brief']).fl;
    const done = fx.filter(f => f.w < TW).map(f => ({ ...f, a: fxN(f, f.w), b: fxN(f, f.w + 1) })).sort((a, b) => (b.a - b.b) - (a.a - a.b));
    const worse = ks.map(k => [k, sum(TW, [k]).fl - sum(LW, [k]).fl]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1])[0];
    const wTop = worse && causes([worse[0]]).sort((a, b) => b.n - a.n)[0];
    const rows = [
      ['Direction', `Flag rate is ${now.rate < first.rate ? 'down' : 'up'} from ${p1(first.rate)} to ${p1(now.rate)} in 13 weeks${ks.length > 1 && ks.every(k => sum(TW, [k]).rate < sum(0, [k]).rate) ? ', and every agent is lower than it started' : ''}.`],
      done.length ? ['Biggest fix', `${AG(done[0].agent).name}, week of ${wlab(done[0].w)}: ${done[0].fix.charAt(0).toLowerCase() + done[0].fix.slice(1)}. Its flags went ${done[0].a} → ${done[0].b} the week after.`] : ['Fixes', 'No fix shipped in the last four weeks for this view.'],
      ['Watch', worse ? `${AG(worse[0]).name} rose this week (${sum(LW, [worse[0]]).fl} → ${sum(TW, [worse[0]]).fl}). Biggest cause: ${wTop.title.charAt(0).toLowerCase() + wTop.title.slice(1)} — ${statusPhrase(wTop)}.` : 'No agent in this view has more flags than last week.'],
    ];
    const W = 300, H = 112, px = 26, py = 16;
    const series = (ks.length > 1 ? ks : [ks[0]]).map(k => ({ k, v: D.meta.weeks.map((_, wi) => sum(wi, [k]).rate * 100) }));
    const mx = Math.max(4, Math.ceil(Math.max(...series.flatMap(s => s.v)) / 2) * 2);
    const sm = series.map(s => {
      const x = i => px + i * (W - px - 10) / 12, y = v => H - 18 - (v / mx) * (H - 18 - py);
      const grid = Array.from({ length: mx / 2 + 1 }, (_, i) => i * 2).filter(g => g % (mx > 8 ? 4 : 2) === 0).map(g => `<line x1="${px}" x2="${W - 10}" y1="${y(g)}" y2="${y(g)}" stroke="var(--grid)"/><text x="${px - 4}" y="${y(g) + 3}" text-anchor="end">${g}%</text>`).join('');
      const fl = D.fixes.filter(f => f.agent === s.k && f.w < TW).map(f => `<line x1="${x(f.w)}" x2="${x(f.w)}" y1="${py - 4}" y2="${H - 18}" stroke="var(--ok)" stroke-dasharray="2 3"/><text class="fx" x="${x(f.w)}" y="${py - 6}" text-anchor="middle">fix</text>`).join('');
      const last = s.v[12];
      return `<div><div class="t"><span>${esc(AG(s.k).name)}</span><b>${last.toFixed(1)}% <span class="mu">from ${s.v[0].toFixed(1)}%</span></b></div>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(AG(s.k).name)} flag rate, 13 weeks: from ${s.v[0].toFixed(1)}% to ${last.toFixed(1)}%">${grid}${fl}
        <polyline points="${s.v.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="#8b4513" stroke-width="2"/>
        <circle cx="${x(12)}" cy="${y(last)}" r="3.5" fill="#8b4513"/><text x="${px}" y="${H - 4}">${wlab(0).split('–')[0]}</text><text x="${W - 10}" y="${H - 4}" text-anchor="end">${wlab(12).split('–')[0]}</text></svg></div>`;
    }).join('');
    return `<section class="ppa-card">
      <div class="ppa-kick">3 · Trends — are the agents getting better?</div>
      <div class="ppa-kpis">
        ${kpi('Flag rate', p1(now.rate), `<b class="${tone(now.rate - first.rate, true)}">${arrow(now.rate - first.rate)}</b>from ${p1(first.rate)} 13 weeks ago`)}
        ${kpi('Claims matching the source', p1(now.match), `<b class="${tone(now.match - first.match)}">${arrow(now.match - first.match)}</b>from ${p1(first.match)} 13 weeks ago`)}
        ${kpi('Reviewer agreement', p1(1 - rv.f / rv.r).replace('.0%', '%'), `of ${n0(rv.r)} flags reviewed in 13 weeks`)}
        ${kpi('Release tests', String(D.testsTotal), `<b class="up">+${D.testsWk.reduce((a, b) => a + b, 0)}</b> from QA flags in 13 weeks · all agents`)}
      </div>
      ${insBox(rows, alertBox([], 0, 'No fixed mistake has come back. Every confirmed issue runs as a release test before the next release.'))}
    </section>
    <section class="ppa-card"><h3>Flag rate by agent</h3><div class="sub">Share of ${TYN[st.ty]} flagged, weeks of ${wlab(0)} to ${wlab(12)}. Green ticks = a fix shipped.</div><div class="sm3${series.length === 1 ? ' one' : ''}">${sm}</div></section>
    <section class="ppa-card"><h3>Fixes shipped</h3><div class="sub">Last 4 weeks. Each fix adds release tests, so the same mistake is caught before the next release.</div>
      ${fx.length ? `<div class="ppa-tw"><table><thead><tr><th>Week of</th><th>Agent</th><th>Fix</th><th class="n">Agent's flags, that week → next</th><th>Release tests</th></tr></thead><tbody>
      ${fx.map(f => `<tr><td>${wlab(f.w)}</td><td>${esc(AG(f.agent).name)}</td><td class="wrap">${esc(f.fix)}</td><td class="n">${f.w < TW ? `${fxN(f, f.w)} → ${fxN(f, f.w + 1)}` : '<span class="mu">next week</span>'}</td><td><span class="test">${f.from === f.to ? '#' + f.from : `#${f.from}–#${f.to}`}</span></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="note">No fix shipped for this agent in the last four weeks.</p>'}
    </section>`;
  }

  // ---------------------------------------------------------------- Weekly QA report (always all agents, all outputs)
  function report() {
    const ks = D.agents.map(a => a.k), ts = ['chat', 'brief'], tw = sum(TW, ks, ts), lw = sum(LW, ks, ts), cs = causes(ks, ts);
    const late = cs.filter(x => x.root === 'late'), lateN = late.reduce((s, x) => s + x.n, 0);
    const monLate = late.filter(x => x.days.some(d => d % 7 === 0));
    const worked = D.fixes.filter(f => f.w === LW).map(f => [f, sum(LW, [f.agent]).fl, sum(TW, [f.agent]).fl]).filter(x => x[2] < x[1]);
    const up = ks.map(k => [k, sum(LW, [k]).fl, sum(TW, [k]).fl]).filter(x => x[2] > x[1]);
    const open = cs.filter(x => x.status === 'conf' || x.status === 'rev').sort((a, b) => b.n - a.n).slice(0, 3);
    const shipped = cs.filter(x => x.status === 'ship');
    const real = cs.filter(x => x.status === 'conf' || x.status === 'ship').reduce((s, x) => s + x.n, 0), fa = cs.filter(x => x.status === 'fa'), faN = fa.reduce((s, x) => s + x.n, 0);
    const tn = shipped.reduce((s, x) => s + x.tests, 0);
    const stat = (l, v, d) => `<div class="ins-stat"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    return `<div class="ppa-card">
      <div class="ins-mast"><span>QA Agent · three agents · ${n0(tw.out)} outputs · ${wlab(TW)}</span><span class="ok">✓ every figure here comes from the same sums as the page</span></div>
      <h2 class="ins-hl">${tw.fl} outputs flagged, ${tw.fl < lw.fl ? 'down' : 'up'} from ${lw.fl} — <em>${lateN} of them read data that arrived late</em>.</h2>
      <p class="ins-deck">${worked.length ? `Last week's fixes ${words(worked.map(([f, a, b]) => `took ${AG(f.agent).name} from <strong>${a}</strong> flags to <strong>${b}</strong>`))}. ` : ''}${up.map(([k, a, b]) => `${AG(k).name} went the other way, <strong>${a} → ${b}</strong>: ${causes([k], ts).sort((x, y) => y.n - x.n)[0].summary}.`).join(' ')}</p>
      <div class="ins-h">This week</div>
      <div class="ins-stats">
        ${stat('Outputs reviewed', n0(tw.out), `${n0(sum(TW, ks, ['chat']).out)} chat · ${sum(TW, ks, ['brief']).out} briefs`)}
        ${stat('Claims matching', p1(tw.match), `${lwv(tw.match * 100, lw.match * 100, false, x => sgn(x) + ' pt')} vs last week`)}
        ${stat('Flagged', String(tw.fl), `${lwv(tw.fl, lw.fl, true, x => (x > 0 ? '+' : M) + Math.abs(x))} vs last week`)}
        ${stat('Judge score', tw.judge.toFixed(1), `${lwv(+tw.judge.toFixed(1), +lw.judge.toFixed(1), false, x => sgn(x))} vs last week`)}
      </div>
      ${monLate.length >= 2 ? `<div class="ins-h">Pattern</div><p class="ins-p">${plural(monLate.length, 'cause')} went wrong on Monday morning, before the weekend's data had landed: ${[...new Set(monLate.map(x => x.agent))].map(k => `in ${AG(k).name}, ${words(monLate.filter(x => x.agent === k).map(x => esc(x.title.charAt(0).toLowerCase() + x.title.slice(1))))}`).join('; ')}. One rule for every agent would cover them: on Mondays, check each source's load time before answering.</p>` : ''}
      <div class="ins-h">What to fix first</div>
      <div class="ins-acts">${open.map((x, i) => `<div class="ins-act"><div class="n">${i + 1} · ${esc(AG(x.agent).name)} · ${plural(x.n, 'flag')}</div><h4>${esc(x.title)}</h4><p>${esc(cap(x.summary))}. ${esc(x.status === 'rev' ? 'Waiting on a reviewer before a fix is drafted.' : x.fix)}</p><span class="own">${esc(x.owner)} · ${x.status === 'rev' ? 'needs review' : 'to approve'}</span></div>`).join('')}</div>
      <div class="ins-h">Shipped this week</div>
      <p class="ins-p">${shipped.map(x => `${esc(AG(x.agent).name)}: ${esc(x.fix.charAt(0).toLowerCase() + x.fix.slice(1).replace(/\.$/, ''))} (${esc(x.shipped)}).`).join(' ')}</p>
      <div class="ins-h">Checking the judge</div>
      <p class="ins-p">Reviewers agreed with ${real} of ${real + faN} flags.${fa.length ? ` ${cap(plural(faN, 'false alarm'))}: ${esc(fa[0].fix.replace(/^False alarm: /, ''))}` : ''}</p>
      <div class="ins-h">Added to release tests</div>
      <p class="ins-p">${plural(tn, 'new test')} this week (${testRange(D.fixes.filter(f => f.w === TW))}), ${D.testsTotal} in total. Every confirmed issue becomes a test, and every release has to pass them all.</p>
      <div class="ins-foot">Written by the agent every Monday from the week's seven nightly runs. It covers every agent and output, whatever filters the page has.</div>
    </div>`;
  }

  // ---------------------------------------------------------------- chatbot (answers from the view, every figure cited and checked)
  const QS = [
    { k: 'top', q: 'What was the biggest issue this week?' },
    { k: 'fixes', q: "Did last week's fixes work?" },
    { k: 'worse', q: 'Which agent got worse, and why?' },
    { k: 'inline', q: "Why didn't the inline check catch it?" },
    { k: 'review', q: "What's still waiting for review?" },
    { k: 'judge', q: 'How often is the judge wrong?' },
  ];
  function answer(k) {
    const V = view(), ks = KS(), scope = V.label, all = V.tw.fl;
    const cs = V.cs.slice().sort((a, b) => b.n - a.n), top = cs[0];
    let head, lis = [], ledger = [], checks = [], src = [];
    const L = (v, s) => { ledger.push(v); return c(v, s); };
    if (k === 'top') {
      src = ['get_flags(by="cause")'];
      if (!top) return pack('Nothing was flagged in this view this week.', [], ledger, [], src, scope);
      const tie = cs.filter(x => x.n === top.n);
      if (tie.length > 1) {
        head = `No single cause stands out: ${L(tie.length, 'Flagged › causes')} causes have ${L(top.n, 'Flagged › Outputs')} ${top.n === 1 ? 'flag' : 'flags'} each, out of ${L(all, 'Overview › Outputs flagged')}.`;
        tie.forEach(x => lis.push(`${esc(AG(x.agent).name)} · ${esc(x.title)} — ${esc(statusPhrase(x))}.`));
        checks.push({ ok: true, t: `"stands out" checked: ${tie.length} causes tied` });
        return pack(head, lis, ledger, checks, src, scope);
      }
      head = `${esc(top.title)} in ${esc(AG(top.agent).name)}: ${L(top.n, 'Flagged › ' + top.title)} of the week's ${L(all, 'Overview › Outputs flagged')} flags.`;
      lis.push(cap(ct(esc(top.summary), 'Flagged › ' + top.title + ' › summary')) + '.');
      lis.push(top.status === 'ship' ? `The fix shipped ${esc(top.shipped)}: ${ct(esc(top.fix.charAt(0).toLowerCase() + top.fix.slice(1)), 'Flagged › fix')} Release tests ${esc(top.test)} now cover it.` : `Status: ${esc(statusPhrase(top))}.`);
      const second = cs[1];
      checks.push({ ok: !second || second.n < top.n, t: `"biggest" checked: ${second ? `next cause has ${second.n}` : 'only cause in view'}` });
    } else if (k === 'fixes') {
      src = ['get_fixes(weeks=2)'];
      const f = D.fixes.filter(x => x.w === LW && ks.includes(x.agent));
      if (!f.length) {
        const prev = D.fixes.filter(x => x.w < LW && ks.includes(x.agent)).sort((a, b) => b.w - a.w)[0];
        head = `No fix shipped last week for ${esc(ks.length > 1 ? 'these agents' : AG(ks[0]).name)}.`;
        if (prev) lis.push(`The last one was the week of ${esc(wlab(prev.w))}: ${ct(esc(prev.fix.charAt(0).toLowerCase() + prev.fix.slice(1)), 'Trends › Fixes shipped')}. Its flags went ${L(sum(prev.w, [prev.agent], ['chat', 'brief']).fl, 'Trends › Fixes shipped › that week')} → ${L(sum(prev.w + 1, [prev.agent], ['chat', 'brief']).fl, 'Trends › Fixes shipped › next week')}, all outputs.`);
      } else {
        const r = f.map(x => [x, sum(LW, [x.agent], ['chat', 'brief']).fl, sum(TW, [x.agent], ['chat', 'brief']).fl]);
        const cut = r.map(([, a, b]) => (a - b) / a);
        const good = r.filter(([, a, b]) => b < a).length;
        head = good === r.length ? (r.length > 1 ? `Yes — both cut their agent's flags by ${Math.floor(Math.min(...cut) * 10) * 10}% or more.` : `Yes — flags fell by ${Math.floor(cut[0] * 100)}%.`) : `Mixed — ${good} of ${r.length} cut their agent's flags.`;
        r.forEach(([x, a, b]) => lis.push(`${esc(AG(x.agent).name)}, all outputs: ${L(a, 'Trends › Fixes shipped › ' + AG(x.agent).short)} → ${L(b, 'Overview › By agent › ' + AG(x.agent).short)} flags after ${ct(esc(x.fix.charAt(0).toLowerCase() + x.fix.slice(1).replace(/\.$/, '')), 'Trends › Fixes shipped')}.`));
        checks.push({ ok: r.every(([, a, b], i) => Math.abs((a - b) / a - cut[i]) < 1e-9), t: `cuts checked: ${cut.map(x => M + Math.round(x * 100) + '%').join(' and ')}` });
        head = head.replace(/(\d+)%/, m => L(m, 'computed from the flags above'));
      }
    } else if (k === 'worse') {
      src = ['get_flags(by="agent")'];
      const d = ks.map(x => [x, sum(LW, [x]).fl, sum(TW, [x]).fl]).sort((a, b) => (b[2] - b[1]) - (a[2] - a[1]));
      const w = d[0];
      if (!w || w[2] <= w[1]) head = `None — ${ks.length > 1 ? 'every agent in this view' : esc(AG(ks[0]).name)} has no more flags than last week.`;
      else {
        const t = causes([w[0]]).sort((a, b) => b.n - a.n)[0];
        head = `${esc(AG(w[0]).name)}: ${L(w[2], 'Overview › By agent › ' + AG(w[0]).short)} flags, up from ${L(w[1], 'Overview › By agent › LW')}.`;
        lis.push(`Biggest cause: ${esc(t.title.charAt(0).toLowerCase() + t.title.slice(1))}, ${L(t.n, 'Flagged › ' + t.title)} of them — ${ct(esc(t.summary), 'Flagged › summary')}.`);
        lis.push(`Status: ${esc(statusPhrase(t))}.`);
      }
      d.slice(1).filter(x => x[2] < x[1]).forEach(x => lis.push(`${esc(AG(x[0]).name)} improved: ${L(x[1], 'Overview › By agent › LW')} → ${L(x[2], 'Overview › By agent')}.`));
      checks.push({ ok: true, t: `"worse" checked against each agent's change vs last week` });
    } else if (k === 'inline') {
      src = ['get_flags(by="cause")', 'get_checks(cause)'];
      const t = cs.find(x => x.by === 'checker');
      if (!t) return pack('Nothing in this view got past the inline check with a wrong number — the flags here came from the judge.', [], ledger, [], src, scope);
      const bad = t.ex.claims.find(x => x[3] === 0);
      head = `Because the answer matched what the agent read — the data itself was ${t.root === 'late' ? 'late' : t.root === 'scope' ? 'the wrong slice' : 'off'}.`;
      lis.push(`${esc(t.title)} (${esc(AG(t.agent).name)}): ${ct(esc(t.ex.inl.replace(/^Passed — /, '')), 'Flagged › inline check')}`);
      lis.push(`The nightly run doesn't reuse what the agent read. It re-computes from the source: ${ct(esc(bad[0]), 'Flagged › claim checker')} is ${ct(esc(bad[2].split(' · ')[0]), 'Flagged › claim checker › source')}, not ${ct(esc(bad[1]), 'Flagged › claim checker › answer')}.`);
      lis.push('That is why the two checks overlap so little: the inline check catches a misquote; the nightly run catches a wrong input.');
      checks.push({ ok: true, t: 'source value re-computed from the agent\'s own data' });
    } else if (k === 'review') {
      src = ['get_flags(status="needs review")'];
      const r = V.cs.filter(x => x.status === 'rev');
      if (!r.length) head = 'Nothing — every flag in this view has a decision.';
      else {
        head = `${L(V.rev, 'Flagged › Needs review')} ${V.rev === 1 ? 'flag is' : 'flags are'} waiting on a reviewer.`;
        r.forEach(x => lis.push(`${esc(AG(x.agent).name)} · ${esc(x.title)}: ${ct(esc(x.summary), 'Flagged › summary')}. Open it under Flagged to decide.`));
      }
    } else if (k === 'judge') {
      src = ['get_reviews(weeks=13)'];
      const rv = ks.reduce((a, x) => { D.review[x].forEach(([r, f], wi) => { if (wi === TW) return; a.r += r; a.f += f; }); return a; }, { r: 0, f: 0 });
      rv.r += V.real + V.fa; rv.f += V.fa;
      head = `About 1 in ${Math.round(rv.r / Math.max(1, rv.f))} flags: ${L(rv.f, 'Trends › Reviewer agreement › false alarms')} false alarms in ${L(n0(rv.r), 'Trends › Reviewer agreement')} reviewed over 13 weeks.`;
      ledger.push('1 in N');
      const jf = V.cs.filter(x => x.by === 'judge');
      lis.push(`This week the judge raised ${L(jf.reduce((s, x) => s + x.n, 0), 'Flagged › by the judge')} of ${L(all, 'Flagged')} flags${V.fa ? `, and reviewers marked ${L(V.fa, 'Flagged › false alarm')} as a false alarm` : ''}.`);
      const f = V.cs.find(x => x.status === 'fa' && !x.decided);
      if (f) lis.push(`The false alarm: ${ct(esc(f.fix.replace(/^False alarm: /, '')), 'Flagged › ' + f.title)}`);
      checks.push({ ok: rv.f <= rv.r, t: 'counts checked against 13 weeks of reviewer decisions' });
    }
    return pack(head, lis, ledger, checks, src, scope);
  }
  function pack(head, lis, ledger, checks, src, stamp) {
    const html = `<div class="hl">${head}</div>${lis.length ? `<ul>${lis.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}`;
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const nCited = tmp.querySelectorAll('.cite').length + [...tmp.querySelectorAll('.cite-t')].filter(e => /\d/.test(e.textContent.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+\/\d+|#\d+|\b\d+:\d\d\b/g, ''))).length;
    tmp.querySelectorAll('.cite, .cite-t').forEach(e => e.remove());
    const loose = tmp.textContent.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+\/\d+|#\d+|\b\d+:\d\d\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+(–\d+)?|1 in \d+|\b13 weeks\b/g, '').match(/[+−-]?[$£¥]?\d[\d.,]*\s?(%|pt|K|M)?/g) || [];
    const all = [{ ok: loose.length === 0, t: `${nCited} ${nCited === 1 ? 'figure' : 'figures'}, all cited${loose.length ? ` — uncited: ${loose.join(', ')}` : ' and match the page'}` }, ...checks];
    if (all.some(x => !x.ok)) return `<div class="hl">Withheld — this answer failed a check, so it isn't shown.</div><div class="chk">${all.map(x => `<span class="${x.ok ? '' : 'bad'}">${x.ok ? '✓' : '✗'} ${esc(x.t)}</span>`).join('')}</div>`;
    return html + `<div class="chk">${all.map(x => `<span>✓ ${esc(x.t)}</span>`).join('')}</div><div class="stamp">${esc(wlab(TW))} · ${esc(stamp)} · ${esc(src.join(', '))}</div>`;
  }
  const log = $('.ppa-log'), chat = $('.ppa-chat'), asked = new Set();
  const sugHTML = () => `<div class="hint">I read the QA results for <b>${esc(view().label)}</b>, ${esc(wlab(TW))}. Start with one of these —</div>
      <div class="ppa-sugtop">${QS.map((x, i) => `<button type="button" data-i="${i}"${asked.has(i) ? ' disabled' : ''}>→ ${esc(x.q)}</button>`).join('')}
      <div class="ppa-scope"><b>What it covers:</b> the nightly checks, flags, reviewer decisions and fixes on this page, for the filters you have set. <b>Not:</b> the agents' own business data — ask those agents — or anything outside the QA results.</div></div>`;
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
      <div class="demo">This public demo answers the six questions above from the page's own figures. It is not connected to a language model, because a public page can't safely hold an API key. In production, any question about the checks, flags or fixes gets an answer from the same results, with the same checks.</div></div>`);
    log.scrollTop = log.scrollHeight;
  }

  // ---------------------------------------------------------------- feedback loop (ratings stay in this browser)
  const FB = 'qa:feedback:v1', DEC_KEY = 'qa:fb-decisions:v1';
  const REASONS = ['Wrong number', 'Not what I asked', 'Too vague', 'Other'];
  const fbBar = i => `<div class="ppa-fb" data-fq="${i}"><span>Was this useful?</span><button type="button" data-rate="up" aria-label="Useful">👍</button><button type="button" data-rate="down" aria-label="Not useful">👎</button></div>`;
  const fbForm = i => `<div class="ppa-fbf" data-fq="${i}"><div class="h">What went wrong?</div><div class="chips">${REASONS.map(r => `<button type="button" data-reason="${r}" aria-pressed="false">${r}</button>`).join('')}</div><textarea maxlength="200" placeholder="Optional: what did you expect?" aria-label="What did you expect?"></textarea><div class="row"><span>Stays in your browser · goes into this week's review</span><button type="button" class="send" disabled>Send</button></div></div>`;
  const fbThanks = () => `<div class="ppa-fbdone">✓ Thanks — logged. <button type="button" class="ppa-link" data-fbr>See what the owner sees → Feedback review</button></div>`;
  function logFb(rec) {
    const all = readLS(FB, []); all.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now(), ...rec }); writeLS(FB, all);
    const b = $('[data-fbr-open]'); if (b) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); setTimeout(() => b.classList.remove('pulse'), 1600); }
  }
  const REVIEW = {
    headline: 'Agent owners mostly want to see who was affected.',
    text: 'The agent owners asked <strong>31</strong> questions. The checker withheld <strong>0</strong> answers; the biggest theme is <strong>5</strong> questions asking which users saw a wrong answer, which this agent doesn\'t hold. One theme needs a decision before anyone can fix it.',
    sig: { q: 31, prev: 26, up: 6, dn: 2, reph: 2, nodata: 7, flags: 0 },
    rows: [
      { theme: 'Asks which users saw a wrong answer', ex: 'Who saw the wrong share price on Monday?', src: '5 "not in this data"', n: 5, dg: 'def', dl: 'Definition gap?', sug: 'The QA results hold outputs, not who read them. Decide with the agent owners whether to join user logs, and who may see them.', ai: 'def' },
      { theme: 'Wants flags by region', ex: 'How many flags came from Japan?', src: '2 "not in this data" · 1 rephrased', n: 3, dg: 'und', dl: 'Missing split', sug: 'Each flag already records its region. Add a Region split to the flag list and to this answer.', ai: 'fix' },
      { theme: '"Fixed" read as "deployed everywhere"', ex: 'Is the price fix live in the brief too?', src: '1 👎', n: 1, dg: 'und', dl: 'Answer too thin', sug: 'Say where each fix shipped — chatbot, brief or both — in the answer and in the fixes table.', ai: 'later' },
    ],
    done: [{ t: 'Judge false alarms counted as real issues', d: 'fixed last week · false alarms now leave the flag count · 1 regression test · 1 user told' }],
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
    const mine = myRows(recs), rows = [...mine, ...R.rows.map((r, i) => ({ ...r, key: 'qa-s' + i }))];
    const you = n => (n ? ` · ${n} from you` : ''), qn = s2.q + nd, dq = s2.q - s2.prev;
    const tile = (l, v, d) => `<div><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
    const got = rows.filter(r => dec[r.key]), tally = got.length ? `You decided ${got.length} of ${rows.length}: ` + DEC.map(([k, l]) => [l, got.filter(r => dec[r.key] === k).length]).filter(x => x[1]).map(([l, n]) => `${n} ${l.toLowerCase()}`).join(' · ') : "Dashed = the agent's suggestion · click to decide";
    const row = r => `<div class="fbr-r${r.you ? ' you' : ''}">
        <div><div class="th">${esc(r.theme)}</div><div class="ex">"${esc(r.ex)}"</div>${r.note ? `<div class="nt">Note: ${esc(r.note)}</div>` : ''}<span class="src">${esc(r.src)}</span>${r.you ? '<span class="src me">You · this browser</span>' : ''}</div>
        <div class="cnt"><span>Count</span>${r.n}</div>
        <div><span class="dg ${r.dg}">${esc(r.dl)}</span><div class="sug">${esc(r.sug)}</div></div>
        <div class="dec">${DEC.map(([k, l]) => `<button type="button" data-dec="${k}" data-key="${esc(r.key)}"${r.ai === k ? ' class="ai"' : ''} aria-pressed="${dec[r.key] === k}">${l}</button>`).join('')}</div></div>`;
    return `<div class="ppa-card fbr">
      <div class="fbr-loop">${[['1 · Log', 'Every answer, 👍/👎 and reason'], ['2 · Weekly pull', "All of the week's turns"], ['3 · Agent drafts', 'Prioritises, summarises, suggests a fix', 'ai'], ['4 · Owner decides', "Fix now · Later · Won't fix · Needs a definition", 'you'], ['5 · Fix + test', 'Each fix becomes a regression test'], ['6 · Tell the user', '"The thing you flagged is fixed"']].map(([h, t, c]) => `<div${c ? ` class="${c}"` : ''}><b>${h}</b>${t}</div>`).join('')}</div>
      <div class="ins-mast"><span>Feedback review · ${esc(wlab(TW))} · QA Agent's chatbot · synthetic week</span><span>${rows.length} themes${mine.length ? ` · ${mine.length} from you` : ''}</span></div>
      <h2 class="fbr-hl">${esc(R.headline)}</h2>
      <p class="fbr-p">${R.text}</p>
      <div class="fbr-sig">${tile('Questions', qn, `${dq >= 0 ? '+' : M}${Math.abs(dq)} vs last week${you(nd)}`)}${tile('👍 / 👎', `${s2.up + up} / ${s2.dn + dn}`, `1 in ${Math.round(qn / (s2.up + up + s2.dn + dn))} answers rated${you(up + dn)}`)}${tile('Rephrased', s2.reph, 'asked again in new words')}${tile('"Not in this data"', s2.nodata + nd, 'out of scope' + you(nd))}${tile('Checker flags', s2.flags, 'withheld before shown')}</div>
      <div class="fbr-h"><span>Ranked by the agent · you decide each row</span><span class="tally">${esc(tally)}</span></div>
      <div class="fbr-t"><div class="fbr-r hd"><div>Theme</div><div>Count</div><div>Diagnosis · suggested fix</div><div>Decision</div></div>${rows.map(row).join('')}</div>
      <div class="fbr-h"><span>Fixed last week · loop closed</span></div>
      <div class="fbr-done">${R.done.map(x => `<div><b>${esc(x.t)}</b> <span>· ${esc(x.d)}</span></div>`).join('')}</div>
      <div class="ins-foot">In production, every question and rating lands in a warehouse table; each week the agent groups and summarises the feedback into this list, and the owner decides each row. Here the week is synthetic, and your own ratings stay in this browser — nothing is sent anywhere.</div>
    </div>`;
  }

  // ---------------------------------------------------------------- modal (Weekly QA report · Feedback review)
  const modal = $('.ins-modal');
  // Keyboard focus stays inside the open dialog; in the Try it side-by-side view (html.try-duo) the chat
  // beside it is part of the loop too, so Tab moves between the review and the chat but never behind them.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || modal.hidden) return;
    const zones = [modal].concat(document.documentElement.classList.contains('try-duo') && chat.classList.contains('open') ? [chat] : []);
    const f = zones.flatMap(z => [...z.querySelectorAll('button, summary, [href], textarea, input, select')])
      .filter(x => !x.disabled && x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');
    if (!f.length) return;
    e.preventDefault();
    const i = f.indexOf(document.activeElement);
    f[i === -1 ? 0 : (i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  });
  { // Data notes is a disclosure, not a dialog: tell assistive tech whether it is open
    const nEl = $('.ppa-notes'), nBtn = $('[data-notes]');
    if (nEl && nBtn) {
      nBtn.setAttribute('aria-expanded', 'false'); nBtn.setAttribute('aria-controls', nEl.id || (nEl.id = 'ppa-notes'));
      new MutationObserver(() => nBtn.setAttribute('aria-expanded', nEl.classList.contains('open'))).observe(nEl, { attributes: true, attributeFilter: ['class'] });
    }
  }
  let opener = null;
  function renderModal() {
    const ins = st.modal === 'ins';
    $('#qa-modal-title').textContent = ins ? 'Weekly QA report' : 'Feedback review';
    $('.ins-ttl small').textContent = ins ? `Sent every Monday · ${wlab(TW)} · from 7 nightly runs` : `Drafted by the agent every Monday · ${wlab(TW)} · you decide`;
    $('.ins-ttl .spk').textContent = ins ? '✦' : '↺';
    $('.ins-scroll').innerHTML = ins ? report() : feedbackReview();
  }
  function openModal(kind, from) { opener = from || null; st.modal = kind; renderModal(); modal.hidden = false; document.documentElement.classList.add('ins-lock'); $('.ins-scroll').scrollTop = 0; $('.ins-x').focus(); }
  function closeModal() { if (modal.hidden) return; modal.hidden = true; st.modal = null; document.documentElement.classList.remove('ins-lock'); if (opener && opener.isConnected) opener.focus(); }
  modal.addEventListener('click', e => {
    if (e.target.closest('[data-ins-x]')) return closeModal();
    const b = e.target.closest('[data-dec]'); if (!b) return;
    const d = readLS(DEC_KEY, {}), k = b.dataset.key; if (d[k] === b.dataset.dec) delete d[k]; else d[k] = b.dataset.dec; writeLS(DEC_KEY, d);
    const y = $('.ins-scroll').scrollTop; renderModal(); $('.ins-scroll').scrollTop = y;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && st.modal) closeModal(); });

  // ---------------------------------------------------------------- render + events
  function render() {
    const V = view();
    $$('[role=tab]').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === st.tab));
    $$('[data-ty]').forEach(b => b.setAttribute('aria-pressed', b.dataset.ty === st.ty));
    $('[data-f=ag]').value = st.ag;
    $('.ppa-ctx').innerHTML = `Showing <b>${esc(wlab(TW))}</b> · 7 nightly runs · ${esc(st.ag === 'all' ? 'all agents' : AG(st.ag).name)} · ${TYN[st.ty]} · vs last week (${esc(wlab(LW))})`;
    $('.ppa-panel').innerHTML = st.tab === 'overview' ? overviewTab(V) : st.tab === 'flagged' ? flaggedTab(V) : trendsTab(V);
    if (!asked.size) log.innerHTML = sugHTML(); else { const h = log.querySelector('.hint'); if (h) h.outerHTML = sugHTML().split('</div>')[0] + '</div>'; }
  }
  function openChat() { chat.classList.add('open'); chat.removeAttribute('aria-hidden'); $('.ppa-input input').focus(); }
  function setVerdict(id, v) { const d = readLS(VERD, {}); if (v) d[id] = v; else delete d[id]; writeLS(VERD, d); render(); }
  root.addEventListener('click', e => {
    const t = e.target;
    const tab = t.closest('[role=tab]'); if (tab) { st.tab = tab.dataset.tab; return render(); }
    const tyb = t.closest('[data-ty]'); if (tyb) { st.ty = tyb.dataset.ty; return render(); }
    const go = t.closest('[data-go]'); if (go) { st.tab = 'flagged'; st.sel = go.dataset.go; render(); const d = $('.detail'); if (d) d.scrollIntoView({ block: 'nearest' }); return; }
    const row = t.closest('[data-sel]'); if (row) { st.sel = row.dataset.sel; return render(); }
    const vb = t.closest('[data-v]'); if (vb && !vb.disabled) return setVerdict(vb.dataset.id, vb.dataset.v);
    const ub = t.closest('[data-undo]'); if (ub) return setVerdict(ub.dataset.undo, null);
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
    const chp = t.closest('.ppa-fbf [data-reason]');
    if (chp) { chp.parentElement.querySelectorAll('[data-reason]').forEach(x => x.setAttribute('aria-pressed', x === chp)); chp.closest('.ppa-fbf').querySelector('.send').disabled = false; return; }
    const sb = t.closest('.ppa-fbf .send');
    if (sb) { const f = sb.closest('.ppa-fbf'), i = +f.dataset.fq; logFb({ kind: 'down', q: QS[i].q, reason: f.querySelector('[data-reason][aria-pressed=true]').dataset.reason, note: f.querySelector('textarea').value.trim().slice(0, 200) }); f.previousElementSibling.remove(); f.outerHTML = fbThanks(); return; }
    if (t.closest('[data-fbr]') || t.closest('[data-fbr-open]')) return openModal('fbr', $('[data-fbr-open]'));
    if (t.closest('[data-ins]')) return openModal('ins', t.closest('[data-ins]'));
    if (t.closest('[data-notes]')) { e.stopPropagation(); $('.ppa-notes').classList.toggle('open'); return; }
  });
  root.addEventListener('keydown', e => {
    const row = e.target.closest && e.target.closest('[data-sel]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); st.sel = row.dataset.sel; render(); const n = $(`[data-sel="${st.sel}"]`); if (n) n.focus(); return; }
    if (e.key === 'Escape' && !st.modal) { $('.ppa-notes').classList.remove('open'); if (chat.classList.contains('open')) $('.ppa-x').click(); }
  });
  document.addEventListener('click', e => { const n = $('.ppa-notes'); if (n && !n.contains(e.target) && !e.target.closest('[data-notes]')) n.classList.remove('open'); });
  root.addEventListener('change', e => { if (e.target.matches('[data-f=ag]')) { st.ag = e.target.value; render(); } });
  root.addEventListener('submit', e => { e.preventDefault(); const inp = $('.ppa-input input'), t = inp.value.trim(); if (t) { inp.value = ''; typed(t); } });

  fetch(BASE + '/data/qa.json').then(x => x.json()).then(d => {
    D = d; TW = D.meta.tw; LW = D.meta.lw;
    $('[data-f=ag]').innerHTML = '<option value="all">All agents</option>' + D.agents.map(a => `<option value="${a.k}">${esc(a.name)}</option>`).join('');
    resetChat(); render();
    window.__qa = { st, view, answer, report, render, QS, causes, sum };
    document.dispatchEvent(new CustomEvent('qa:ready'));
  }).catch(err => {
    $('.ppa-panel').innerHTML = '<div class="ppa-card">Could not load the demo data. If you opened this file directly, serve the folder instead (for example <code>python3 -m http.server</code>).</div>';
    console.error(err);
  });
})();
