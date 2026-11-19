"""QA Agent demo data — fictional brand, synthetic logs.

Reads the three other demo agents' data (Product Performance, CEO Brief, eCom Site Journey) and writes
qa.json: 13 weeks of nightly QA runs (Mon 17 Aug - Sun 15 Nov 2026), plus this week's flagged outputs,
grouped by cause. Every "source" value in a flagged example is computed here from the other agents'
own data, as of the day the question was asked, so a visitor can find it on that agent's page.
Run: python3 generate.py   (seed 19; asserts every story claim before writing)
"""
import json, math, random, datetime as dt
from pathlib import Path

HERE = Path(__file__).parent
AG = HERE.parent.parent
rng = random.Random(19)

PPA = {r: json.load(open(AG / "product-performance/data" / f"{r}.json")) for r in ("na", "uk", "jp")}
CEO = json.load(open(AG / "ceo-brief/data/brief.json"))
ECO = json.load(open(AG / "ecom-funnel/data/ecom.json"))

D0 = dt.date(2026, 8, 17)                      # Monday; 13 QA weeks, Mon-Sun
DAYS = [D0 + dt.timedelta(d) for d in range(91)]
WEEKS = [{"start": str(DAYS[7 * i]), "end": str(DAYS[7 * i + 6])} for i in range(13)]
LW, TW = 11, 12                                # last week, this week (Nov 9-15)
DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
def day_ix(m, d): return (dt.date(2026, m, d) - D0).days
def when(m, d, hm): return f"{DOW[dt.date(2026, m, d).weekday()]} {m}/{d} · {hm}"

# ------------------------------------------------------------------ source values from the other agents
def ppa_fam(r, name): return next(i for i, f in enumerate(PPA[r]["families"]) if f["name"] == name)
def ppa_cat(r, cat): return [i for i, f in enumerate(PPA[r]["families"]) if f["cat"] == cat]
def ppa_sales(r, w, fams=None, ch=None, y=0, col=4):
    return sum(x[col] for x in PPA[r]["sales"] if x[0] == y and x[1] == w and (fams is None or x[3] in fams) and (ch is None or x[2] == ch))
def ppa_vsly(r, w, fams=None, ch=None): return (ppa_sales(r, w, fams, ch) / ppa_sales(r, w, fams, ch, y=1) - 1) * 100
def ppa_wk_ix(r, asked):  # latest week that ended before the question was asked
    ws = PPA[r]["weeks"]
    return max(i for i, w in enumerate(ws) if dt.date.fromisoformat(w["ty"][1]) < asked)
def ppa_onhand(r, w, f): return next(x[3] for x in PPA[r]["inv"] if x[0] == 0 and x[1] == w and x[2] == f)
def ppa_avg_units(r, w, f): return sum(ppa_sales(r, k, [f], col=5) for k in range(w - 3, w + 1)) / 4

close = dict(zip(CEO["stock"]["days"], CEO["stock"]["close"]))
def ceo_sales(a, z): return sum(sum(v[0] for d, v in zip(CEO["days"], r["sales"]) if a <= d <= z) for r in CEO["rows"])

EW = ECO["meta"]["weeks"]
def eco_wk_ix(asked): return max(i for i, w in enumerate(EW) if dt.date.fromisoformat(w["end"]) < asked)
def eco_grid(t, chs=None, devs=None, i=0):
    return sum(ECO["grid"][c][d][t][i] for c in (chs or ECO["grid"]) for d in (devs or ECO["devices"]))

def pct(x, d=1): return ("+" if x > 0 else "−" if x < 0 else "") + f"{abs(x):.{d}f}%"
def usd(x): return f"${x/1e6:.2f}M" if x >= 1e6 else f"${x/1e3:.1f}K"
def gbp(x): return f"£{x/1e6:.2f}M" if x >= 1e6 else f"£{x/1e3:.1f}K"
def jpy(x): return f"¥{x/1e6:.1f}M"

# ------------------------------------------------------------------ this week's causes (23 flagged outputs)
causes = []
def cause(**k): causes.append(k)

# C1 · CEO Morning Brief · late price feed (Mon 11/9): brief + chat quoted Thursday's close as Friday's
thu, fri, wed = close["2026-11-05"], close["2026-11-06"], close["2026-11-04"]
thu_c, fri_c = (thu / wed - 1) * 100, (fri / thu - 1) * 100
assert abs(thu - fri) >= 0.05 and abs(thu_c - fri_c) >= 0.3
cause(id="c-price", agent="ceo", issue="num", by="checker", status="ship", root="late", owner="Data engineering", tests=3,
      title="Late share-price feed", days=[day_ix(11, 9)] * 7, types=["brief"] + ["chat"] * 6,
      summary="the share-price feed landed at 7:40, after the 7:00 brief, so the brief and 6 answers quoted Thursday's close",
      fix="Check the feed's load time before answering. Until the close of the latest completed trading session has loaded (on a Monday morning, Friday's), the brief and chat answers say \"price not updated yet\".",
      shipped="Tue 11/10",
      ex=[{"type": "brief", "when": when(11, 9, "7:00"), "scope": "Morning brief",
           "q": "Morning brief, Mon 11/9 — share price",
           "a": f"SNDY closed at <mark>${thu:.2f}</mark> on Friday, <mark>{pct(thu_c)}</mark> on the day.",
           "claims": [["Close, Fri 11/6", f"${thu:.2f}", f"${fri:.2f} · price table", 0], ["Change on the day", pct(thu_c), pct(fri_c) + " · price table", 0]],
           "judge": [2, 5, 4], "jwhy": "Clear and cited to the price table. Accuracy is low because the checker found both figures are Thursday's, not Friday's.",
           "inl": "Passed — the brief matched the price it read. Friday's close hadn't landed, so it read Thursday's."},
          {"type": "chat", "when": when(11, 9, "7:18"), "scope": "Chatbot",
           "q": "How did our shares do on Friday?",
           "a": f"SNDY closed at <mark>${thu:.2f}</mark> on Friday, <mark>down {abs(thu_c):.1f}%</mark> on the day.",
           "claims": [["Close, Fri 11/6", f"${thu:.2f}", f"${fri:.2f} · price table", 0], ["Change on the day", pct(thu_c), pct(fri_c) + " · price table", 0]],
           "judge": [2, 5, 4], "jwhy": "Answers the question and cites the price table. Accuracy is low because the checker found both figures are Thursday's, not Friday's.",
           "inl": "Passed — the answer matched the price the agent read. Friday's close hadn't landed, so it read Thursday's."}])

# C2 · CEO Brief · "last week" read as the week before last (Mon 11/9, before Sunday's data closed the week)
w_prev2, w_prev, w_last = ceo_sales("2026-10-19", "2026-10-25"), ceo_sales("2026-10-26", "2026-11-01"), ceo_sales("2026-11-02", "2026-11-08")
assert abs(w_prev - w_last) / w_last > 0.002
cause(id="c-lastweek", agent="ceo", issue="scope", by="checker", status="rev", root="late", owner="Agent owner",
      title="\"Last week\" read as the week before", days=[day_ix(11, 9)] * 2, types=["chat"] * 2,
      summary="2 answers on Monday morning read \"last week\" as the week before last, because Sunday's sales hadn't closed the week yet",
      fixY="Confirmed. Draft fix: \"last week\" always means the last full week. Until Sunday's sales land, the answer says the week isn't complete.",
      fixN="Marked as a false alarm. The judge is told why, so it scores this case differently next time.",
      ex=[{"type": "chat", "when": when(11, 9, "8:02"), "scope": "Chatbot",
           "q": "How were sales last week?",
           "a": f"Sales were <mark>{usd(w_prev)}</mark> last week, <mark>{'up' if w_prev > w_prev2 else 'down'} {abs((w_prev / w_prev2 - 1) * 100):.1f}%</mark> on the week before.",
           "claims": [["Sales, last full week (Nov 2–8)", usd(w_prev), usd(w_last) + " · answer used Oct 26 – Nov 1", 0],
                      ["Change vs the week before", pct((w_prev / w_prev2 - 1) * 100), pct((w_last / w_prev - 1) * 100), 0]],
           "judge": [2, 5, 4], "jwhy": "Answers the question in the right shape, but both figures describe the week before last.",
           "inl": "Passed — the agent read the week before last and quoted it correctly. Sunday's sales hadn't closed the week yet."}])

# C3 · CEO Brief · peer margin is not in the data (judge)
peer = CEO["stock"]["peers"][0][0]
cause(id="c-peer", agent="ceo", issue="nodata", by="judge", status="conf", root="guard", owner="Agent owner",
      title="Peer margin isn't in the data", days=[day_ix(11, 11)], types=["chat"],
      summary=f"one answer gave {peer}'s gross margin, which no source holds",
      fix="Draft: peer questions cover share price only; anything else about a peer gets \"not in this data\".",
      ex=[{"type": "chat", "when": when(11, 11, "14:26"), "scope": "Chatbot",
           "q": f"What's {peer}'s gross margin?",
           "a": f"{peer}'s gross margin is <mark>about 61%</mark>, a little below ours.",
           "claims": [[f"{peer} gross margin", "about 61%", "no source — peers have share price only", None]],
           "judge": [1, 4, 1], "jwhy": "No source holds peer margins. The figure is invented, and the comparison with ours rests on it.",
           "inl": "Nothing to compare — no source holds this number, so the claim goes to the judge."}])

# C4 · Product Performance · Japan · "recovering" after one better week (3 answers)
asked = dt.date(2026, 11, 12)
w = ppa_wk_ix("jp", asked); fw = ppa_cat("jp", "Footwear")
v = [ppa_vsly("jp", w - k, fw) for k in (3, 2, 1, 0)]          # oldest .. last full week
assert v[3] > v[2] and v[2] < v[1], v                          # one better week, the one before was worse
jp_wk = PPA["jp"]["weeks"]
cause(id="c-recover", agent="ppa", issue="dir", by="checker", status="conf", root="rule", owner="Agent owner",
      title="\"Recovering\" after one better week", days=[day_ix(11, 12), day_ix(11, 13), day_ix(11, 14)], types=["chat"] * 3,
      summary="\"recovering\" was used after a single better week — 3 answers",
      fix="Draft rule: \"recovering\" and \"rebounding\" only when the last two weeks both improved; otherwise \"better than the week before\".",
      ex=[{"type": "chat", "when": when(11, 12, "10:05"), "scope": "Chatbot · Japan",
           "q": "How is Footwear doing in Japan?",
           "a": f"Footwear is <mark>recovering</mark>: {pct(v[3])} vs LY last week, better than {pct(v[2])} the week before.",
           "claims": [[f"Footwear vs LY, W{jp_wk[w]['wk']}", pct(v[3]), pct(v[3]), 1], [f"Footwear vs LY, W{jp_wk[w-1]['wk']}", pct(v[2]), pct(v[2]), 1],
                      ["\"Recovering\" — needs 2 better weeks", "1 better week", f"W{jp_wk[w-3]['wk']}–W{jp_wk[w]['wk']}: " + ", ".join(f"{x:.1f}".replace("-", "−") for x in v), 0]],
           "judge": [3, 5, 5], "jwhy": f"Both numbers are right. \"Recovering\" overstates one better week — Footwear is still below where it was three weeks ago ({pct(v[0])}).",
           "inl": "Passed — both numbers matched. \"Recovering\" wasn't on its list of direction words yet."}])

# C5 · Product Performance · UK · Bags read Online only (page filter), asked about all channels
asked = dt.date(2026, 11, 11)
w = ppa_wk_ix("uk", asked); bg = ppa_cat("uk", "Bags"); on = PPA["uk"]["channels"].index("Online")
b_all, b_on = ppa_sales("uk", w, bg), ppa_sales("uk", w, bg, on)
c_all, c_on = ppa_vsly("uk", w, bg), ppa_vsly("uk", w, bg, on)
assert abs(c_all - c_on) > 1
cause(id="c-channel", agent="ppa", issue="scope", by="checker", status="ship", root="scope", owner="Agent owner", tests=2,
      title="Asked about all channels, read Online", days=[day_ix(11, 11)], types=["chat"],
      summary="one answer about \"Bags in the UK\" read Online only, because the page was filtered to Online",
      fix="\"In the UK\" means all channels unless the user names one, and every answer says which channels it covers.", shipped="Fri 11/13",
      ex=[{"type": "chat", "when": when(11, 11, "9:30"), "scope": "Chatbot · UK",
           "q": "How did Bags do in the UK last week?",
           "a": f"Bags sold <mark>{gbp(b_on)}</mark> last week, <mark>{pct(c_on)}</mark> vs LY.",
           "claims": [[f"Bags, UK, all channels, W{PPA['uk']['weeks'][w]['wk']}", gbp(b_on), gbp(b_all) + " · answer read Online only", 0], ["Bags vs LY, all channels", pct(c_on), pct(c_all), 0]],
           "judge": [2, 5, 4], "jwhy": "Right category and week, but \"in the UK\" means every channel; the figures are Online only.",
           "inl": "Passed — the page was filtered to Online, and the answer matched what the agent read."}])

# C6 · Product Performance · NA · inventory snapshot stuck (4 answers, Tue-Fri)
asked = dt.date(2026, 11, 10)
w = ppa_wk_ix("na", asked); cc = ppa_fam("na", "Cloud Crew")
avg = ppa_avg_units("na", w, cc)
wos_ok, wos_bad = ppa_onhand("na", w, cc) / avg, ppa_onhand("na", w - 1, cc) / avg
assert abs(wos_ok - wos_bad) >= 0.3, (wos_ok, wos_bad)
cause(id="c-stock", agent="ppa", issue="num", by="checker", status="conf", root="late", owner="Data engineering",
      title="Stock snapshot a week old", days=[day_ix(11, 10), day_ix(11, 11), day_ix(11, 12), day_ix(11, 13)], types=["chat"] * 4,
      summary="the store stock feed stopped updating, so 4 weeks-of-supply answers used the week-before stock",
      fix="Draft: stock is a weekly snapshot, so check that the latest expected one (end of last week) has loaded before answering; if the agent only has an older one, the answer names its date.",
      ex=[{"type": "chat", "when": when(11, 10, "11:40"), "scope": "Chatbot · North America",
           "q": "How many weeks of supply do we have on Cloud Crew?",
           "a": f"Cloud Crew has <mark>{wos_bad:.1f} weeks</mark> of supply, selling about {avg:,.0f} units a week.",
           "claims": [["Weeks of supply, end of last week", f"{wos_bad:.1f}", f"{wos_ok:.1f} · answer used the stock from a week earlier", 0], ["Avg weekly units, last 4 weeks", f"{avg:,.0f}", f"{avg:,.0f}", 1]],
           "judge": [3, 5, 4], "jwhy": "Clear and on-topic; the checker found the stock figure behind it is a week old.",
           "inl": "Passed — the answer matched the stock the agent read. The stock feed hadn't updated since the week before."}])

# C7 · Product Performance · NA · asked to email the numbers; answered with numbers instead (judge)
asked = dt.date(2026, 11, 12)
w = ppa_wk_ix("na", asked); s_na, c_na = ppa_sales("na", w), ppa_vsly("na", w)
cause(id="c-offq", agent="ppa", issue="offq", by="judge", status="conf", root="guard", owner="Agent owner",
      title="Asked to send an email", days=[day_ix(11, 12)], types=["chat"],
      summary="one answer was asked to email the team and replied with sales figures instead of saying it can't",
      fix="Draft: requests to send, share or schedule get \"I can't send messages — here's a link to this view\".",
      ex=[{"type": "chat", "when": when(11, 12, "16:12"), "scope": "Chatbot · North America",
           "q": "Can you send last week's numbers to my team?",
           "a": f"Net sales last week were {usd(s_na)}, {pct(c_na)} vs LY.",
           "claims": [[f"Net sales, W{PPA['na']['weeks'][w]['wk']}", usd(s_na), usd(s_na), 1], ["vs LY", pct(c_na), pct(c_na), 1]],
           "judge": [5, 1, 5], "jwhy": "The numbers are right, but the user asked for an action the agent can't take, and the answer doesn't say so.",
           "inl": "Passed — both numbers matched."}])

# C8 · eCom · returns are not in the data (judge)
cause(id="c-returns", agent="ecom", issue="nodata", by="judge", status="ship", root="guard", owner="Agent owner", tests=1,
      title="Returns aren't in the data", days=[day_ix(11, 10)], types=["chat"],
      summary="one answer gave a reason for returns, which this agent has no data on",
      fix="\"Returns\" joins the out-of-scope list — the agent now answers \"Returns aren't in this data\".", shipped="Wed 11/11",
      ex=[{"type": "chat", "when": when(11, 10, "16:42"), "scope": "Chatbot",
           "q": "Why are returns up on mobile?",
           "a": "Returns are up because shoppers find the <mark>Juniper Tote runs smaller than expected</mark>.",
           "claims": [],
           "judge": [1, 4, 1], "jwhy": "Returns aren't in this agent's data, and no source mentions sizing. The answer invents a cause.",
           "inl": "Nothing to check — the answer has no numbers."}])

# C9 · eCom · click-to-open false alarm (judge didn't know the metric)
asked = dt.date(2026, 11, 15)
t = eco_wk_ix(asked)
sends = [x for x in ECO["email"] if x["w"] == t]
best = max(sends, key=lambda x: x["clicks"] / x["opens"]); ctor = best["clicks"] / best["opens"] * 100
cause(id="c-ctor", agent="ecom", issue="nodata", by="judge", status="fa", root="judge", owner="QA owner",
      title="Judge didn't know click-to-open", days=[day_ix(11, 15)], types=["chat"],
      summary="the judge flagged click-to-open as not in the data; it is one of the eCom agent's metrics",
      fix="False alarm: click-to-open is one of the eCom agent's defined metrics. The judge now reads each agent's metric list before it scores.",
      ex=[{"type": "chat", "when": when(11, 15, "11:15"), "scope": "Chatbot",
           "q": "Which email did best last week?",
           "a": f"\"{best['name']}\" had the best click-to-open: {ctor:.1f}%.",
           "claims": [[f"Click-to-open, \"{best['name']}\"", f"{ctor:.1f}%", f"{ctor:.1f}%", 1], ["Best of the week", "#1", f"#1 of {len(sends)} sends", 1]],
           "judge": [5, 5, 2], "jwhy": "Click-to-open doesn't appear in the cited sources.",
           "inl": "Passed."}])

# C10 · eCom · email revenue read before late orders were matched (Mon 11/9)
asked = dt.date(2026, 11, 9)
t = eco_wk_ix(asked); er = eco_grid(t, ["email"], i=6); er_bad = round(er * 0.926)
cause(id="c-attrib", agent="ecom", issue="num", by="checker", status="conf", root="late", owner="Data engineering",
      title="Email revenue before late orders landed", days=[day_ix(11, 9)], types=["chat"],
      summary="one Monday answer quoted email revenue before the weekend's late orders were matched to their sends",
      fix="Draft: on Mondays, email revenue waits for the 9:00 matching job; before that the answer says the week isn't final.",
      ex=[{"type": "chat", "when": when(11, 9, "8:20"), "scope": "Chatbot",
           "q": "How much revenue did email drive last week?",
           "a": f"Email drove <mark>{usd(er_bad)}</mark> of revenue last week.",
           "claims": [[f"Email revenue, W{EW[t]['wk']}", usd(er_bad), usd(er) + " · after late orders were matched", 0]],
           "judge": [3, 5, 4], "jwhy": "On-topic and cited; the checker found the figure is lower than the final one.",
           "inl": "Passed — the answer matched what the agent read. The weekend's late orders hadn't been matched to their sends yet."}])

# C11 · eCom · asked about mobile, page was on All devices
asked = dt.date(2026, 11, 10)
t = eco_wk_ix(asked)
cv_all = eco_grid(t, i=5) / eco_grid(t, i=0) * 100; cv_mob = eco_grid(t, devs=["mobile"], i=5) / eco_grid(t, devs=["mobile"], i=0) * 100
assert abs(cv_all - cv_mob) > 0.2
cause(id="c-device", agent="ecom", issue="scope", by="checker", status="conf", root="scope", owner="Agent owner",
      title="Asked about mobile, read all devices", days=[day_ix(11, 10)], types=["chat"],
      summary="one answer about mobile conversion read all devices, because the page was on All devices",
      fix="Draft: a device in the question overrides the page's Device filter, and the answer names the device.",
      ex=[{"type": "chat", "when": when(11, 10, "13:05"), "scope": "Chatbot",
           "q": "What was mobile conversion last week?",
           "a": f"Conversion was <mark>{cv_all:.2f}%</mark> last week.",
           "claims": [[f"Conversion rate, mobile, W{EW[t]['wk']}", f"{cv_all:.2f}%", f"{cv_mob:.2f}% · answer read all devices", 0]],
           "judge": [2, 4, 4], "jwhy": "Answers a conversion question, but not for mobile, and doesn't say which devices it covers.",
           "inl": "Passed — the page was on All devices, and the answer matched what the agent read."}])

for c in causes:
    c["n"] = len(c["days"]); assert len(c["types"]) == c["n"]
    c["bad"] = sum(1 for x in c["ex"][-1]["claims"] if x[3] == 0)   # mismatched claims per flagged output

# ------------------------------------------------------------------ nightly grid: day x agent x output type
AGENTS = [{"k": "ppa", "name": "Product Performance", "short": "PPA", "brief": "Weekly Insights", "page": "../product-performance/"},
          {"k": "ceo", "name": "CEO Morning Brief", "short": "CEO", "brief": "morning brief", "page": "../ceo-brief/"},
          {"k": "ecom", "name": "eCom Site Journey", "short": "eCom", "brief": "Weekly Insights", "page": "../ecom-funnel/"}]
FLAGS = {"ppa": [29, 31, 26, 28, 23, 25, 22, 23, 19, 19, 16, 15], "ceo": [13, 12, 13, 11, 11, 9, 10, 8, 8, 7, 7, 6], "ecom": [20, 21, 19, 19, 16, 17, 15, 14, 14, 12, 11, 10]}
CHAT = {"ppa": 87, "ceo": 34, "ecom": 46}                # chat answers a weekday, before weekday shape
SHAPE = [1.25, 1.12, 1.08, 1.04, .98, .52, .44]
CPC = {"ppa": 3.0, "ceo": 4.5, "ecom": 1.5}               # claims per chat answer
CPB = {"ppa": 38, "ceo": 30, "ecom": 26}                  # claims per brief
JUDGE = {"ppa": (4.05, 4.4, 4.6), "ceo": (4.0, 4.4, 4.3), "ecom": (3.95, 4.3, 4.5)}   # week 0, week 11, week 12
TARGET_TW = {"ppa": 612, "ceo": 241, "ecom": 321}

grid = {a["k"]: {"chat": [], "brief": []} for a in AGENTS}   # each day: [outputs, claims, bad, judge x10 sum, flags]
for a in AGENTS:
    k = a["k"]
    for wi in range(13):
        days = range(7 * wi, 7 * wi + 7)
        growth = 1 + 0.004 * wi
        chat = [max(5, round(CHAT[k] * SHAPE[d % 7] * growth * rng.uniform(.9, 1.1))) for d in days]
        if wi == TW:   # this week's chat volume, exact
            diff = TARGET_TW[k] - sum(chat); chat[0] += diff
        briefs = [(3 if k == "ppa" else 1) if d % 7 == 0 else 0 for d in days] if k != "ceo" else [1 if d % 7 < 5 else 0 for d in days]
        j0, j1, j2 = JUDGE[k]
        jw = j2 if wi == TW else j0 + (j1 - j0) * wi / LW + rng.uniform(-.04, .04) if wi < LW else j1
        # flags
        if wi == TW:
            fl = {"chat": [0] * 7, "brief": [0] * 7}; bad = {"chat": [0] * 7, "brief": [0] * 7}
            for c in causes:
                if c["agent"] != k: continue
                for d, ty in zip(c["days"], c["types"]):
                    fl[ty][d - 7 * wi] += 1
                    if c["by"] == "checker": bad[ty][d - 7 * wi] += c["bad"]
        else:
            tot = FLAGS[k][wi]
            nb = 1 if rng.random() < .25 else 0
            fl = {"chat": [0] * 7, "brief": [0] * 7}
            for _ in range(tot - nb): fl["chat"][rng.choices(range(7), weights=chat)[0]] += 1
            if nb: fl["brief"][rng.choice([i for i in range(7) if briefs[i]])] += 1
            bad = {ty: [sum(rng.choice((1, 1, 2)) for _ in range(n) if rng.random() < .8) for n in fl[ty]] for ty in fl}
        for i, d in enumerate(days):
            for ty, n, cp in (("chat", chat[i], CPC[k]), ("brief", briefs[i], CPB[k])):
                cl = round(n * cp * rng.uniform(.93, 1.07)) if n else 0
                js = round(n * 10 * max(1, min(5, jw + rng.uniform(-.06, .06)))) if n else 0
                grid[k][ty].append([n, cl, bad[ty][i], js, fl[ty][i]])

# exact judge averages this week (story: PPA 4.6, CEO 4.3, eCom 4.5) and last week (4.4, 4.4, 4.3 -> all 4.4)
for k, (j_lw, j_tw) in {"ppa": (4.4, 4.6), "ceo": (4.4, 4.3), "ecom": (4.3, 4.5)}.items():
    for wi, target in ((LW, j_lw), (TW, j_tw)):
        cells = [grid[k][ty][d] for ty in ("chat", "brief") for d in range(7 * wi, 7 * wi + 7) if grid[k][ty][d][0]]
        n = sum(c[0] for c in cells); want = round(target * 10 * n); have = sum(c[3] for c in cells)
        cells[0][3] += want - have

# reviewer decisions per week per agent: [reviewed, false alarms]
review = {}
for a in AGENTS:
    k = a["k"]; out = []
    for wi in range(13):
        f = sum(grid[k][ty][d][4] for ty in ("chat", "brief") for d in range(7 * wi, 7 * wi + 7))
        if wi == TW:
            pend = sum(c["n"] for c in causes if c["agent"] == k and c["status"] == "rev")
            fa = sum(c["n"] for c in causes if c["agent"] == k and c["status"] == "fa")
            out.append([f - pend, fa])
        else:
            out.append([f, sum(1 for _ in range(f) if rng.random() < .062)])
    review[k] = out

# the same decisions split by output type and by who raised the flag: {type: [checker reviewed, checker false, judge reviewed, judge false]}
# A separate seed, so the totals above (and everything drawn after them) stay as they were.
rng2 = random.Random(23)
def judge_share(wi): return .31 - .12 * wi / LW + rng2.uniform(-.03, .03)    # judge guards shipped over the quarter, so its share falls
review_by = {}
for a in AGENTS:
    k = a["k"]; out = []
    for wi in range(13):
        row = {}
        if wi == TW:   # from this week's causes: pending flags have no decision yet
            for ty in ("chat", "brief"):
                r = [0, 0, 0, 0]
                for c in causes:
                    if c["agent"] != k or c["status"] == "rev": continue
                    n = c["types"].count(ty); j = 2 if c["by"] == "judge" else 0
                    r[j] += n; r[j + 1] += n if c["status"] == "fa" else 0
                row[ty] = r
        else:
            sh = judge_share(wi)
            flags = [(ty, "judge" if rng2.random() < sh else "checker") for ty in ("chat", "brief")
                     for _ in range(sum(grid[k][ty][d][4] for d in range(7 * wi, 7 * wi + 7)))]
            pool, fa = list(range(len(flags))), set()
            for _ in range(review[k][wi][1]):        # place the week's false alarms; a judge flag is ~7x as likely to be one
                i = rng2.choices(pool, weights=[7 if flags[x][1] == "judge" else 1 for x in pool])[0]
                pool.remove(i); fa.add(i)
            for ty in ("chat", "brief"):
                ix = [i for i, f in enumerate(flags) if f[0] == ty]
                cr = [i for i in ix if flags[i][1] == "checker"]; jr = [i for i in ix if flags[i][1] == "judge"]
                row[ty] = [len(cr), sum(i in fa for i in cr), len(jr), sum(i in fa for i in jr)]
        out.append(row)
    review_by[k] = out

# fixes shipped, last 4 weeks, with release-test numbers assigned in order
FIX_OLD = [(9, "ppa", "Fiscal week labels match the calendar each page uses", 5),
           (10, "ceo", "Peer comparisons use the same three peers as the brief", 3),
           (11, "ppa", "\"Up\" and \"down\" are checked against the period the user asked about", 6),
           (11, "ecom", "Answers only use metrics on the agent's metric list", 4)]
fixes = [{"w": w, "agent": k, "fix": f, "tests": n} for w, k, f, n in FIX_OLD]
fixes += [{"w": TW, "agent": c["agent"], "fix": c["fix"], "tests": c["tests"], "cause": c["id"]} for c in causes if c["status"] == "ship"]
TOTAL_TESTS, ADDED = 512, 68
early = ADDED - sum(f["tests"] for f in fixes)
tests_wk = [0] * 13
for _ in range(early): tests_wk[rng.randrange(0, 9)] += 1
for f in fixes: tests_wk[f["w"]] += f["tests"]
nxt = TOTAL_TESTS - ADDED + 1 + sum(tests_wk[:9])
for f in sorted(fixes, key=lambda f: f["w"]):
    f["from"], f["to"] = nxt, nxt + f["tests"] - 1; nxt += f["tests"]
assert nxt - 1 == TOTAL_TESTS
for c in causes:
    f = next((f for f in fixes if f.get("cause") == c["id"]), None)
    if f: c["test"] = f"#{f['from']}" + (f"–#{f['to']}" if f["to"] > f["from"] else "")

ISSUES = [{"k": "num", "name": "Wrong number", "by": "checker"}, {"k": "dir", "name": "Wrong direction word", "by": "checker"},
          {"k": "scope", "name": "Wrong period or scope", "by": "checker"}, {"k": "rank", "name": "Wrong ranking", "by": "checker"},
          {"k": "nodata", "name": "Not in the data", "by": "judge"}, {"k": "offq", "name": "Didn't answer the question", "by": "judge"}]

# ------------------------------------------------------------------ the story, asserted
def wsum(k, wi, i, ty=("chat", "brief")): return sum(grid[k][t][d][i] for t in ty for d in range(7 * wi, 7 * wi + 7))
def claims():
    tw = {a["k"]: wsum(a["k"], TW, 4) for a in AGENTS}; lw = {a["k"]: wsum(a["k"], LW, 4) for a in AGENTS}
    assert tw == {"ppa": 9, "ceo": 10, "ecom": 4}, tw
    assert lw == {"ppa": 15, "ceo": 6, "ecom": 10}, lw
    assert sum(c["n"] for c in causes) == 23
    assert sum(c["n"] for c in causes if c["status"] == "rev") == 2 and sum(c["n"] for c in causes if c["status"] == "fa") == 1
    assert sum(c["n"] for c in causes if c["root"] == "late") * 2 > 23          # "most read data that arrived late"
    assert max(causes, key=lambda c: c["n"])["id"] == "c-price"
    assert all(c["n"] <= 4 for c in causes if c["id"] != "c-price")              # "no other cause has more than 4"
    briefs = {a["k"]: wsum(a["k"], TW, 0, ("brief",)) for a in AGENTS}
    assert briefs == {"ppa": 3, "ceo": 5, "ecom": 1}, briefs
    for k, want in {"ppa": 4.6, "ceo": 4.3, "ecom": 4.5}.items():
        assert round(wsum(k, TW, 3) / wsum(k, TW, 0) / 10, 1) == want
    allf = sum(wsum(a["k"], TW, 4) for a in AGENTS); allf_lw = sum(lw.values())
    assert allf < allf_lw
    for k in ("ppa", "ecom"): assert tw[k] < lw[k]                                   # last week's fixes worked
    assert tw["ceo"] > lw["ceo"]
    # reviewer decisions by type and detector reconcile with the weekly totals, the grid and this week's causes
    for k in tw:
        for wi in range(13):
            rb = review_by[k][wi]
            assert [sum(rb[t][0] + rb[t][2] for t in rb), sum(rb[t][1] + rb[t][3] for t in rb)] == review[k][wi], (k, wi)
            for t in rb:
                assert 0 <= rb[t][1] <= rb[t][0] and 0 <= rb[t][3] <= rb[t][2]
                pend = sum(c["types"].count(t) for c in causes if c["agent"] == k and c["status"] == "rev") if wi == TW else 0
                assert rb[t][0] + rb[t][2] + pend == wsum(k, wi, 4, (t,)), (k, wi, t)
    tot = lambda wis, j: sum(review_by[k][wi][t][j] for k in tw for wi in wis for t in ("chat", "brief"))
    assert (tot([TW], 2), tot([TW], 3)) == (4, 1) and (tot([TW], 0) + tot([TW], 2), tot([TW], 1) + tot([TW], 3)) == (21, 1)
    hist = range(TW)
    jr, jf, cr, cf = tot(hist, 2), tot(hist, 3), tot(hist, 0), tot(hist, 1)
    assert .12 < jf / jr < .30 and cf / cr < .04, (jf, jr, cf, cr)                   # the judge's flags are the noisier ones
claims()

out = {"meta": {"brand": "Sunday Studio", "asOf": "2026-11-16", "weeks": WEEKS, "lw": LW, "tw": TW, "runAt": "2:00"},
       "agents": AGENTS, "issues": ISSUES, "grid": grid, "review": review_by,"testsWk": tests_wk, "testsTotal": TOTAL_TESTS,
       "fixes": fixes, "causes": causes}
(HERE / "qa.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
tot = sum(wsum(a["k"], TW, 0) for a in AGENTS); cl = sum(wsum(a["k"], TW, 1) for a in AGENTS); bd = sum(wsum(a["k"], TW, 2) for a in AGENTS)
print(f"qa.json written · this week {tot} outputs · {cl} claims · {bd} mismatched ({100-100*bd/cl:.1f}% match) · 23 flags")
for c in causes: print(f"  {c['id']:11} {c['agent']:4} {c['n']} {c['status']:4} {c['ex'][-1]['a'][:90]}")
