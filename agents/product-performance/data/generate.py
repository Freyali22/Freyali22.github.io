#!/usr/bin/env python3
"""Synthetic data for the Product Performance Agent demo (fictional brand: Sunday Studio).

Seeded, so every run writes the same files:  python3 generate.py
Reads  ../config/<region>.json  (currency, fiscal calendar, channels, thresholds)
Writes ./<region>.json          (weekly sales + inventory + the chatbot's pre-recorded answers)

Grain: year (this year / last year) x fiscal week (13) x channel x product family.
Each region has one planted story (STORIES) so the agent has something to find.
The chatbot answers are written from the emitted rows; every number in them carries a
spec that the page re-computes in the browser (a second, independent implementation).
"""
import datetime as dt
import glob
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = 16  # first seed in a scan where every planted story and answer claim holds
N_WEEKS = 13
LATEST_SUN = dt.date(2026, 11, 8)  # start of the latest complete week (Sunday-start calendars)

# id, name, category, share of a normal week, USD price, new this year
FAMILIES = [
    ("harbor", "Harbor Parka", "Outerwear", 0.000, 245, True),
    ("field", "Field Jacket", "Outerwear", 0.075, 198, False),
    ("vest", "Quilted Vest", "Outerwear", 0.045, 128, False),
    ("cloud", "Cloud Crew", "Knitwear", 0.095, 98, False),
    ("fisher", "Fisherman Cardigan", "Knitwear", 0.060, 148, False),
    ("merino", "Merino Turtleneck", "Knitwear", 0.050, 118, False),
    ("straight", "Weekend Straight", "Denim & Pants", 0.085, 98, False),
    ("wide", "Wide-Leg Trouser", "Denim & Pants", 0.055, 108, False),
    ("court", "Courtside Sneaker", "Footwear", 0.080, 135, False),
    ("ridge", "Ridge Boot", "Footwear", 0.050, 185, False),
    ("tote", "Market Tote", "Bags", 0.070, 78, False),
    ("mini", "Mini Crossbody", "Bags", 0.050, 92, False),
    ("pack", "Day Pack", "Bags", 0.040, 110, False),
    ("throw", "Linen Throw", "Home & Gifts", 0.030, 120, False),
    ("candle", "Soy Candle", "Home & Gifts", 0.045, 38, False),
]
FID = [f[0] for f in FAMILIES]
SEASONAL = {"Outerwear": 0.55, "Knitwear": 0.35}  # extra lift from first to last week (autumn)

# Region scale: last-year weekly net sales in local currency, local price per USD,
# channel share of sales + price multiplier (outlet / concessions sell below full price).
REGION = {
    "na": dict(base=2_350_000, px=1.0, ch=[(0.50, 1.00), (0.20, 0.65), (0.30, 0.97)]),
    "uk": dict(base=820_000, px=0.80, ch=[(0.55, 1.00), (0.15, 0.95), (0.30, 0.97)]),
    "jp": dict(base=262_000_000, px=150.0, ch=[(0.45, 1.00), (0.30, 1.00), (0.25, 0.97)]),
}

# Planted stories. trend = this-year multiplier on everything; fam/ch multipliers ramp
# linearly from the first to the last week: (start, end). cover = weeks-of-supply path.
STORIES = {
    "na": dict(  # a new parka carries the growth and is selling out; denim is soft and piling up
        trend=0.975,
        fam={"straight": (0.97, 0.84), "wide": (1.00, 0.95)},
        launch=("harbor", 3, 0.042),  # family, week index it launches, share of a normal week at full run-rate
        ch={},
        cover={"harbor": (10.0, 2.6), "straight": (9.0, 19.0)},
        new_rate={"harbor": 0.56}, genz={"harbor": 0.47},
    ),
    "uk": dict(  # knitwear falls and stock builds while outerwear grows; online grows while stores fall
        trend=1.00,
        fam={"cloud": (0.95, 0.74), "fisher": (0.97, 0.80), "merino": (0.98, 0.86), "field": (1.04, 1.16)},
        launch=("harbor", 6, 0.020),
        ch={"Stores": (0.97, 0.89), "Online": (1.04, 1.12)},
        cover={"cloud": (9.5, 22.0), "fisher": (9.0, 17.5)},
        new_rate={}, genz={},
    ),
    "jp": dict(  # flat overall: bags (Mini Crossbody) offset denim and department stores
        trend=0.965,
        fam={"mini": (1.15, 1.55), "tote": (1.03, 1.12), "straight": (0.94, 0.85), "wide": (0.95, 0.88)},
        launch=("harbor", 5, 0.012),
        ch={"Department stores": (0.97, 0.89)},
        cover={"mini": (8.0, 3.2)},
        new_rate={"mini": 0.45}, genz={"mini": 0.44},
    ),
}

# Customer stories (this year only). new_ch: new-customer rate multiplier by channel (ramps);
# genz_ch: Gen Z share of new customers by channel; ret_mix: generation mix of returning orders.
GENS = ["gz", "mil", "gx", "bb"]  # Gen Z, Millennial, Gen X, Boomer
RET_MIX = {"ly": [0.12, 0.45, 0.29, 0.14], "ty": [0.13, 0.45, 0.28, 0.14]}
NEW_REST = [0.50, 0.32, 0.18]  # how non-Gen-Z new customers split: Millennial, Gen X, Boomer
CUST = {
    "na": dict(new_ch={}, genz_ch={}, genz_ramp=(0.22, 0.27), ret_mix_ch={}),  # Gen Z share of new keeps climbing
    "uk": dict(new_ch={"Stores": (0.97, 0.84), "Online": (1.06, 1.26)}, genz_ch={"Online": 0.30, "Stores": 0.17}, genz_ramp=None, ret_mix_ch={}),
    "jp": dict(new_ch={}, genz_ch={}, genz_ramp=None, ret_mix_ch={"Department stores": [0.17, 0.51, 0.23, 0.09]}),  # older shoppers leave dept stores
}


def split(n, weights, rng):
    """Split n into integer parts by noisy weights; parts always sum to n."""
    w = [x * rng.uniform(0.92, 1.08) for x in weights]
    t = sum(w)
    raw = [n * x / t for x in w]
    out = [math.floor(x) for x in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - out[i], reverse=True)[: n - sum(out)]:
        out[i] += 1
    return out


WEEK_W = {  # weekly volume shape, both years build towards the holidays
    "ty": [0.88, 0.90, 0.89, 0.92, 0.94, 0.93, 0.96, 0.98, 0.97, 1.00, 1.03, 1.05, 1.08],
    "ly": [0.89, 0.90, 0.91, 0.91, 0.94, 0.95, 0.95, 0.98, 1.00, 1.00, 1.02, 1.05, 1.07],
}


def ramp(pair, i):
    a, b = pair
    return a + (b - a) * i / (N_WEEKS - 1)


def calendar(cfg):
    start_shift = 1 if cfg["fiscal"]["week_starts"] == "Mon" else 0
    fy0 = dt.date.fromisoformat(cfg["fiscal"]["year_starts"])
    weeks = []
    for i in range(N_WEEKS):
        s = LATEST_SUN + dt.timedelta(days=start_shift - 7 * (N_WEEKS - 1 - i))
        e = s + dt.timedelta(days=6)
        weeks.append({
            "wk": (s - fy0).days // 7 + 1,
            "ty": [s.isoformat(), e.isoformat()],
            "ly": [(s - dt.timedelta(days=364)).isoformat(), (e - dt.timedelta(days=364)).isoformat()],
        })
    return weeks


def build(region, cfg, rng):
    R, S, CU = REGION[region], STORIES[region], CUST[region]
    crng = random.Random(f"{SEED}-{region}-customers")
    chans = cfg["channels"]
    share_total = sum(f[3] for f in FAMILIES)
    sales_rows, units = [], {y: [[0] * len(FAMILIES) for _ in range(N_WEEKS)] for y in (0, 1)}
    for y, yk in ((0, "ty"), (1, "ly")):
        for w in range(N_WEEKS):
            for c, ch in enumerate(chans):
                ch_share, ch_px = R["ch"][c]
                for f, (fid, _, cat, share, usd, is_new) in enumerate(FAMILIES):
                    s = share / share_total
                    lfam, lweek, lshare = S["launch"]
                    if fid == lfam:
                        if y == 1 or w < lweek:
                            continue
                        s = lshare * min(1.0, 0.45 + 0.2 * (w - lweek)) / share_total
                    s *= 1 + SEASONAL.get(cat, 0) * w / (N_WEEKS - 1)
                    exp = R["base"] * WEEK_W[yk][w] * ch_share * s
                    if y == 0:
                        exp *= S["trend"]
                        if fid in S["fam"]:
                            exp *= ramp(S["fam"][fid], w)
                        if ch in S["ch"]:
                            exp *= ramp(S["ch"][ch], w)
                    exp *= math.exp(rng.gauss(0, 0.045))
                    price = usd * R["px"] * ch_px * rng.uniform(0.97, 1.03) * (1.0 if y == 0 else 0.985)
                    u = max(1, round(exp / price))
                    sales = round(u * price)
                    orders = max(1, round(u / rng.uniform(1.08, 1.18)))
                    nr = S["new_rate"].get(fid, 0.31 if y == 0 else 0.29) if y == 0 else 0.29
                    gz = S["genz"].get(fid, 0.22) if y == 0 else 0.20
                    if y == 0:
                        if ch in CU["new_ch"]:
                            nr *= ramp(CU["new_ch"][ch], w)
                        if fid not in S["genz"]:
                            if ch in CU["genz_ch"]:
                                gz = CU["genz_ch"][ch]
                            elif CU["genz_ramp"]:
                                gz = ramp(CU["genz_ramp"], w)
                    new = round(orders * nr * rng.uniform(0.92, 1.08))
                    genz = round(new * gz * rng.uniform(0.9, 1.1))
                    # customer detail from its own random stream, so it never moves the numbers above
                    new_rest = split(new - genz, NEW_REST, crng)
                    mix = CU["ret_mix_ch"].get(ch, RET_MIX[yk]) if y == 0 else RET_MIX[yk]
                    ret = split(orders - new, mix, crng)
                    ords = [genz + ret[0]] + [new_rest[i] + ret[i + 1] for i in range(3)]
                    sales_new = round(sales * new / orders * crng.uniform(0.88, 0.96))  # new customers spend a little less per order
                    sales_rows.append([y, w, c, f, sales, u, orders, new, genz, *ords, *new_rest, sales_new])
                    units[y][w][f] += u
    inv_rows = []
    for y in (0, 1):
        for f, fid in enumerate(FID):
            for w in range(N_WEEKS):
                hist = [units[y][k][f] for k in range(max(0, w - 3), w + 1)]
                avg4 = sum(hist) / len(hist)
                if avg4 == 0:
                    continue
                if y == 0 and fid in S["cover"]:
                    cover = ramp(S["cover"][fid], w) * rng.uniform(0.97, 1.03)
                else:
                    cover = (8.0 if y == 0 else 8.4) * rng.uniform(0.9, 1.1)
                inv_rows.append([y, w, f, round(avg4 * cover)])
    return sales_rows, inv_rows


# ---------------------------------------------------------------- metrics (spec-driven)
# The page has its own implementation of exactly these specs (app.js -> metric()).
COLS = ["y", "w", "c", "f", "sales", "units", "orders", "new", "genz",
        "ord_gz", "ord_mil", "ord_gx", "ord_bb", "new_mil", "new_gx", "new_bb", "sales_new"]


class Engine:
    def __init__(self, d):
        self.d = d
        self.fam = {f["id"]: i for i, f in enumerate(d["families"])}

    def weeks(self, p):
        n = len(self.d["weeks"])
        if p == "p4":  # the 4 weeks before the latest one: the trend the latest week is read against
            return set(range(n - 5, n - 1))
        return set(range(n - {"latest": 1, "l4": 4, "l13": 13}[p], n))

    def total(self, field, y, sp):
        if isinstance(field, list):
            return sum(self.total(f, y, sp) for f in field)
        ws = self.weeks(sp.get("p", "latest"))
        fi = COLS.index(field)
        tot = 0
        for r in self.d["sales"]:
            if r[0] != y or r[1] not in ws:
                continue
            fam = self.d["families"][r[3]]
            if "fam" in sp and fam["id"] != sp["fam"]:
                continue
            if "cat" in sp and fam["cat"] != sp["cat"]:
                continue
            if "ch" in sp and self.d["channels"][r[2]] != sp["ch"]:
                continue
            if sp.get("excl_new") and fam["new"]:
                continue
            if "excl_cat" in sp and fam["cat"] == sp["excl_cat"]:
                continue
            tot += r[fi]
        return tot

    def on_hand(self, f, w):
        return next(r[3] for r in self.d["inv"] if r[0] == 0 and r[1] == w and r[2] == f)

    def metric(self, sp):
        m = sp["m"]
        if m == "sales":
            return self.total("sales", 0 if sp.get("y", "ty") == "ty" else 1, sp)
        if m == "chg":
            ty, ly = self.total(sp["of"], 0, sp), self.total(sp["of"], 1, sp)
            return (ty / ly - 1) * 100
        if m == "delta":
            return self.total(sp["of"], 0, sp) - self.total(sp["of"], 1, sp)
        if m == "contrib":  # pts of total growth: this scope's change ÷ the whole business last year
            of = sp.get("of", "sales")
            return (self.total(of, 0, sp) - self.total(of, 1, sp)) / self.total("sales", 1, {"p": sp.get("p", "latest")}) * 100
        if m == "sum":  # plain total of a field, e.g. new customers
            return self.total(sp["of"], 1 if sp.get("y") == "ly" else 0, sp)
        if m == "aur":
            y = 1 if sp.get("y") == "ly" else 0
            return self.total("sales", y, sp) / self.total("units", y, sp)
        if m == "aur_chg":
            return (self.metric({**sp, "m": "aur"}) / self.metric({**sp, "m": "aur", "y": "ly"}) - 1) * 100
        if m == "diff":  # e.g. this week's % vs LY minus the prior 4 weeks' (momentum)
            return self.metric(sp["a"]) - self.metric(sp["b"])
        if m in ("wos", "avg_units", "reorder", "excess"):
            f = self.fam[sp["fam"]]
            last = len(self.d["weeks"]) - 1
            avg = self.total("units", 0, {"fam": sp["fam"], "p": "l4"}) / 4
            if m == "avg_units":
                return avg
            oh = self.on_hand(f, last)
            if m == "wos":
                return oh / avg
            if m == "excess":  # units above `target` weeks of supply
                return math.floor(max(0, oh - sp["target"] * avg) / 10 + 0.5) * 10
            return math.floor(max(0, sp["target"] * avg - oh) / 10 + 0.5) * 10
        if m == "mix":  # share of the whole period, e.g. one channel's share of sales (or of new customers)
            of = sp.get("of", "sales")
            return self.total(of, 0, sp) / self.total(of, 0, {"p": sp.get("p", "latest")}) * 100
        if m == "share":
            y = 1 if sp.get("y") == "ly" else 0
            return self.total(sp["num"], y, sp) / self.total(sp["den"], y, sp) * 100
        raise ValueError(m)


SYM = {"USD": "$", "GBP": "£", "JPY": "¥"}


def fmt(x, kind, cur):
    if kind == "money":
        s, a = SYM[cur], abs(x)
        sign = "−" if x < 0 else ""
        if cur == "JPY":
            body = f"{a / 1e9:.2f}B" if a >= 1e9 else f"{a / 1e6:.0f}M" if a >= 1e6 else f"{a / 1e3:.0f}K"
        else:
            body = f"{a / 1e6:.2f}M" if a >= 1e6 else f"{a / 1e3:.0f}K" if a >= 1e3 else f"{a:.0f}"
        return f"{sign}{s}{body}"
    if kind == "pct_signed":
        if f"{abs(x):.1f}" == "0.0":
            return "0.0%"
        return ("+" if x >= 0 else "−") + f"{abs(x):.1f}%"
    if kind == "pct":
        return f"{x:.0f}%"
    if kind == "pts":
        if f"{abs(x):.1f}" == "0.0":
            return "0.0 pts"
        return ("+" if x >= 0 else "−") + f"{abs(x):.1f} pts"
    if kind == "price2":  # average unit retail: cents for $/£, whole yen
        return SYM[cur] + (f"{math.floor(x + 0.5):,}" if cur == "JPY" else f"{x:,.2f}")
    if kind == "weeks":
        return f"{x:.1f}"
    if kind == "int":
        return f"{math.floor(x + 0.5):,}"  # half-up, same as the page
    raise ValueError(kind)


class Answer:
    """Write an answer with {n} slots; each slot is a (spec, format) the page re-checks."""

    def __init__(self, eng, cur):
        self.eng, self.cur = eng, cur

    def __call__(self, q, template, nums, calls):
        checks = []
        vals = []
        for sp, kind in nums:
            t = fmt(self.eng.metric(sp), kind, self.cur)
            vals.append(t)
            checks.append({"spec": sp, "fmt": kind, "text": t})
        return {"q": q, "a": template.format(*vals), "calls": calls, "checks": checks}


def claims(region, eng):
    """Every qualitative word in the answers (flat, more than, the soft spot ...) must hold."""
    M = eng.metric
    tot = {"m": "delta", "of": "sales"}
    chg = lambda **k: M({"m": "chg", "of": "sales", **k})
    def gz_index_top(p="latest"):  # family whose new customers skew most Gen Z (families with a real base only)
        fams = [f["id"] for f in eng.d["families"] if eng.total("new", 0, {"fam": f["id"], "p": p}) >= 40]
        return max(fams, key=lambda f: eng.total("genz", 0, {"fam": f, "p": p}) / eng.total("new", 0, {"fam": f, "p": p}))
    cchg = lambda of, **k: M({"m": "chg", "of": of, **k})
    if region == "na":
        assert cchg("genz") > 30 and gz_index_top() == "harbor" and gz_index_top("l4") == "harbor"
        assert cchg("genz") > max(cchg(f) for f in ("new_mil", "new_gx", "new_bb")), "Gen Z must be the fastest-growing group"
        assert M({"m": "share", "num": "genz", "den": "new"}) > M({"m": "share", "num": "genz", "den": "new", "y": "ly"})
    if region == "uk":
        assert cchg("new", ch="Stores") < 0 < cchg("new", ch="Online")
        assert M({"m": "share", "num": "genz", "den": "new", "ch": "Online"}) > M({"m": "share", "num": "genz", "den": "new", "ch": "Stores"}) + 8
    if region == "jp":
        assert cchg(["ord_gx", "ord_bb"], ch="Department stores") < -20 < cchg("ord_gz", ch="Department stores")
        assert gz_index_top("l4") == "mini"
    if region == "na":
        assert M({**tot, "fam": "harbor"}) > M(tot), "Harbor must exceed the whole increase"
        assert M({"m": "share", "num": "new", "den": "orders", "fam": "harbor", "p": "l4"}) > 50
        assert chg(fam="straight") < -10 and 4 <= chg() <= 9 and chg(excl_new=True) < 0
    if region == "uk":
        assert chg() < 0 and chg(excl_cat="Knitwear") > 0
        assert all(chg(fam=f) < 0 for f in ("cloud", "fisher", "merino"))
        assert min(("cloud", "fisher", "merino"), key=lambda f: chg(fam=f)) == "cloud"
        assert chg(ch="Stores") < 0 < chg(ch="Online")
        cats = {f["cat"] for f in eng.d["families"]}
        assert max(cats, key=lambda c: chg(cat=c)) == "Outerwear"
    if region == "jp":
        assert abs(chg()) < 2, "JP must read flat"
        assert chg(cat="Bags") > 0 > chg(cat="Denim & Pants")
        assert M({**tot, "fam": "mini"}) > 0.5 * M({**tot, "cat": "Bags"})
        assert min(eng.d["channels"], key=lambda c: chg(ch=c)) == "Department stores"


def chat(region, d, cfg):
    eng = Engine(d)
    claims(region, eng)
    A = Answer(eng, cfg["currency"])
    wk = d["weeks"][-1]["wk"]
    lo, hi = cfg["thresholds"]["low_stock_weeks"], cfg["thresholds"]["overstock_weeks"]
    T = {"m": "sales", "y": "ty"}
    chg = lambda **k: ({"m": "chg", "of": "sales", **k}, "pct_signed")
    # tool calls the page runs live (app.js -> TOOLS); answers are written from their results
    S = lambda **a: ["get_sales", a]
    INV = lambda **a: ["get_inventory", a]
    CUS = lambda **a: ["get_customers", a]
    if region == "na":
        return [
            A("How did last week go?",
              f"Net sales were {{}} in week {wk}, {{}} vs last year. Units were {{}}. The Harbor Parka, new this year, added {{}} on its own — more than the whole increase.",
              [(T, "money"), chg(), ({"m": "chg", "of": "units"}, "pct_signed"), ({"m": "sales", "fam": "harbor"}, "money")],
              [S(), S(group_by="family")]),
            A("What's driving growth?",
              "All of it, and more, comes from one new product. Without the Harbor Parka, sales were {} vs last year. Outerwear overall is {}.",
              [chg(excl_new=True), chg(cat="Outerwear")],
              [S(group_by="family"), S(exclude_new=True), S(category="Outerwear")]),
            A("What should I reorder?",
              f"The Harbor Parka. It has {{}} weeks of supply left, below the {lo}-week floor, and is selling about {{}} units a week. That leaves a gap of about {{}} units to an 8-week target, before any open orders or inbound stock, which this data doesn't hold.",
              [({"m": "wos", "fam": "harbor"}, "weeks"), ({"m": "avg_units", "fam": "harbor"}, "int"),
               ({"m": "reorder", "fam": "harbor", "target": 8}, "int")],
              [INV(), INV(family="harbor")]),
            A("Who is buying the Harbor Parka?",
              "Mostly people new to the brand. Over the last four weeks, {} of its orders came from new customers, against {} for the brand overall. {} of those new customers are Gen Z.",
              [({"m": "share", "num": "new", "den": "orders", "fam": "harbor", "p": "l4"}, "pct"),
               ({"m": "share", "num": "new", "den": "orders", "p": "l4"}, "pct"),
               ({"m": "share", "num": "genz", "den": "new", "fam": "harbor", "p": "l4"}, "pct")],
              [CUS(family="harbor", period="l4"), CUS(period="l4")]),
            A("Where's the risk?",
              f"Weekend Straight. Sales are {{}} vs last year and it has {{}} weeks of supply, above the {hi}-week ceiling. Worth planning a markdown before the holidays.",
              [chg(fam="straight"), ({"m": "wos", "fam": "straight"}, "weeks")],
              [S(group_by="family"), INV()]),
            A("How are we doing with Gen Z?",
              f"It is the fastest-growing group. Gen Z new customers are {{}} vs last year in week {wk}, and they are now {{}} of all new customers, up from {{}}. The Harbor Parka skews most Gen Z: {{}} of its new customers are Gen Z.",
              [({"m": "chg", "of": "genz"}, "pct_signed"), ({"m": "share", "num": "genz", "den": "new"}, "pct"),
               ({"m": "share", "num": "genz", "den": "new", "y": "ly"}, "pct"), ({"m": "share", "num": "genz", "den": "new", "fam": "harbor"}, "pct")],
              [CUS(by="generation"), CUS(by="family")]),
        ]
    if region == "uk":
        return [
            A("How did last week go?",
              f"Net sales were {{}} in week {wk}, {{}} vs last year. Knitwear is the drag at {{}}, or {{}}; everything else is {{}}.",
              [(T, "money"), chg(), chg(cat="Knitwear"), ({"m": "delta", "of": "sales", "cat": "Knitwear"}, "money"), chg(excl_cat="Knitwear")],
              [S(), S(group_by="category"), S(exclude_category="Knitwear")]),
            A("Why is knitwear down?",
              f"Every knitwear family is down, the Cloud Crew most at {{}}. Stock has not slowed down with sales: it has {{}} weeks of supply, against a {hi}-week ceiling. I'd hold the next delivery and plan a markdown.",
              [chg(fam="cloud"), ({"m": "wos", "fam": "cloud"}, "weeks")],
              [S(category="Knitwear", group_by="family"), INV(family="cloud")]),
            A("Stores or online?",
              "Two different stories. Stores are {} vs last year, while online is {}. Online is now {} of sales.",
              [chg(ch="Stores"), chg(ch="Online"), ({"m": "mix", "ch": "Online"}, "pct")],
              [S(group_by="channel")]),
            A("What's still working?",
              "Outerwear. The Field Jacket is {} vs last year and outerwear overall is {}.",
              [chg(fam="field"), chg(cat="Outerwear")],
              [S(group_by="category"), S(category="Outerwear", group_by="family")]),
            A("Where are new customers coming from?",
              "More and more from online. New customers there are {} vs last year, while stores are {}. Online now brings in {} of new customers, and {} of them are Gen Z, against {} in stores.",
              [({"m": "chg", "of": "new", "ch": "Online"}, "pct_signed"), ({"m": "chg", "of": "new", "ch": "Stores"}, "pct_signed"),
               ({"m": "mix", "of": "new", "ch": "Online"}, "pct"), ({"m": "share", "num": "genz", "den": "new", "ch": "Online"}, "pct"),
               ({"m": "share", "num": "genz", "den": "new", "ch": "Stores"}, "pct")],
              [CUS(by="channel")]),
        ]
    return [
        A("How did last week go?",
          f"Net sales were {{}} in week {wk}, {{}} vs last year — flat on the surface. Bags are {{}} and are offsetting denim, which is {{}}.",
          [(T, "money"), chg(), chg(cat="Bags"), chg(cat="Denim & Pants")],
          [S(), S(group_by="category")]),
        A("What's behind the bags growth?",
          "Mostly the Mini Crossbody, which is {} vs last year and added {}. Over the last four weeks, {} of its orders came from new customers.",
          [chg(fam="mini"), ({"m": "delta", "of": "sales", "fam": "mini"}, "money"),
           ({"m": "share", "num": "new", "den": "orders", "fam": "mini", "p": "l4"}, "pct")],
          [S(category="Bags", group_by="family"), CUS(family="mini", period="l4")]),
        A("Where is stock thin?",
          f"The Mini Crossbody has {{}} weeks of supply, under the {lo}-week floor. It sells about {{}} units a week; the gap to an 8-week target is about {{}} units, before any open orders or inbound stock, which this data doesn't hold.",
          [({"m": "wos", "fam": "mini"}, "weeks"), ({"m": "avg_units", "fam": "mini"}, "int"),
           ({"m": "reorder", "fam": "mini", "target": 8}, "int")],
          [INV(), INV(family="mini")]),
        A("How are department stores doing?",
          "They are the soft spot: {} vs last year, while stores are {} and online {}.",
          [chg(ch="Department stores"), chg(ch="Stores"), chg(ch="Online")],
          [S(group_by="channel")]),
        A("Whose orders are falling in department stores?",
          "Older customers', faster than the rest. Gen X and Boomer orders in department stores are {} vs last year, while Gen Z orders there are {}. Across the brand, Gen Z new customers are {}.",
          [({"m": "chg", "of": ["ord_gx", "ord_bb"], "ch": "Department stores"}, "pct_signed"), ({"m": "chg", "of": "ord_gz", "ch": "Department stores"}, "pct_signed"),
           ({"m": "chg", "of": "genz"}, "pct_signed")],
          [CUS(by="generation", channel="Department stores"), CUS(by="generation")]),
    ]


# ---------------------------------------------------------------- weekly insights brief
# Same shape as the production Buying Weekly Insights Agent: headline -> deck -> key stats with
# momentum tags -> why it moved (4P) -> actions with gates -> bottom line -> drill questions.
# The prose is written here from computed facts; every number in it is a (spec, format) the page
# re-checks, and every claim word is asserted against the data first.
class Brief:
    def __init__(self, eng, cur):
        self.eng, self.cur, self.checks = eng, cur, []

    def v(self, sp, kind):  # a checked number, plain (stat-card values, bars)
        t = fmt(self.eng.metric(sp), kind, self.cur)
        c = {"spec": sp, "fmt": kind, "text": t}
        if c not in self.checks:
            self.checks.append(c)
        return t

    def n(self, sp, kind):  # a checked number, bold inside prose
        return f"<strong>{self.v(sp, kind)}</strong>"


def momentum(level, delta):
    """Momentum tag from the level (sign) and its change vs the prior 4 weeks (pts)."""
    if abs(delta) <= 1.5:
        return "In line vs prior 4 wks", "flat"
    if level >= 0:
        return ("Accelerating · Fav" if delta > 0 else "Softening · Fav"), "fav"
    return ("Recovering · Unfav" if delta > 0 else "Decelerating · Unfav"), "unfav"


def brief(region, d, cfg):
    eng = Engine(d)
    B = Brief(eng, cfg["currency"])
    n, v, x = B.n, B.v, eng.metric
    lo, hi = cfg["thresholds"]["low_stock_weeks"], cfg["thresholds"]["overstock_weeks"]
    wk = d["weeks"][-1]["wk"]
    chans = d["channels"]
    S = {"m": "sales", "y": "ty", "p": "latest"}
    SLY = lambda **k: {"m": "sales", "y": "ly", "p": "latest", **k}
    chg = lambda of="sales", p="latest", **k: {"m": "chg", "of": of, "p": p, **k}
    con = lambda p="latest", **k: {"m": "contrib", "p": p, **k}
    aur = lambda **k: {"m": "aur", "p": "latest", **k}
    achg = lambda p="latest", **k: {"m": "aur_chg", "p": p, **k}
    dif = lambda a, b: {"m": "diff", "a": a, "b": b}
    wos = lambda f: {"m": "wos", "fam": f}
    S_ = lambda **k: ["get_sales", k]

    def arr(sp, kind="pct_signed"):  # arrowed, coloured change for stat cards
        val, t = x(sp), v(sp, kind)
        c, a = ("up", "▲ ") if val > 0.05 else ("dn", "▼ ") if val < -0.05 else ("", "")
        return f'<b class="{c}">{a}{t}</b>'

    def stat(label, value, sub, level, delta):
        tag, cls = momentum(level, delta)
        return {"l": label, "v": value, "d": sub, "tag": tag, "cls": cls}

    def bar(label, sp, kind="pts"):
        return {"label": label, "v": x(sp), "t": v(sp, kind)}

    cats = sorted({f["cat"] for f in d["families"]}, key=lambda c: -x(con(cat=c)))
    up = x(chg()) >= 0
    prim = cats[0] if up else cats[-1]  # production rule: biggest positive contributor if up, biggest drag if down
    stats = [
        stat("Net sales", v(S, "money"), f"{arr(chg())} vs LY · prior 4 wks {v(chg(p='p4'), 'pct_signed')}",
             x(chg()), x(dif(chg(), chg(p="p4")))),
        stat(f"Primary {'driver' if up else 'drag'} · {prim}", v(con(cat=prim), "pts"),
             f"{arr(chg(cat=prim))} vs LY · prior 4 wks {v(con(p='p4', cat=prim), 'pts')}",
             x(con(cat=prim)), x(dif(con(cat=prim), con(p="p4", cat=prim)))),
        stat("Average unit retail", v(aur(), "price2"), f"{arr(achg())} vs LY · prior 4 wks {v({'m': 'aur', 'p': 'p4'}, 'price2')}",
             x(achg()), x(dif(achg(), achg(p="p4")))),
        stat("New customers", v({"m": "sum", "of": "new", "p": "latest"}, "int"),
             f"{arr(chg('new'))} vs LY · prior 4 wks {v(chg('new', p='p4'), 'pct_signed')}",
             x(chg("new")), x(dif(chg("new"), chg("new", p="p4")))),
    ]
    by_ch = sorted(chans, key=lambda c: -x(con(ch=c)))
    ret = dif(con(), con(of="sales_new"))
    p4 = [
        {"k": "Product", "lead": True, "bars": [bar(c, con(cat=c)) for c in cats]},
        {"k": "Place", "bars": [bar(c, con(ch=c)) for c in by_ch]},
        {"k": "People", "bars": [bar("New", con(of="sales_new")), bar("Returning", ret)]},
        {"k": "Price", "own_scale": True, "bars": [bar("AUR", achg(), "pct_signed"), bar("Units", chg("units"), "pct_signed")]},
    ]

    def drill(q, t, b, calls):
        return {"q": q, "t": t, "b": b, "calls": calls}

    if region == "na":
        o, dn, h, st = "Outerwear", "Denim & Pants", "harbor", "straight"
        assert prim == o and cats[-1] == dn
        assert x({"m": "delta", "of": "sales", "fam": h}) > x({"m": "delta", "of": "sales"})  # "more than the whole increase"
        assert x(con(fam=h)) / x(con(cat=o)) > 0.85 and x(dif(chg(), chg(p="p4"))) > 0  # "nearly all of it", "up from"
        assert all(x(chg(ch=c)) > 0 for c in chans) and x(chg(excl_new=True)) < 0
        assert x(chg("units", fam=st)) < -10 and x(achg(fam=st)) > 0 and x(chg("units", fam=st, p="p4")) < -10  # demand, not price
        assert x(wos(h)) < lo and x(wos(st)) > hi and x(achg()) > 0 > x(chg("units"))
        assert all(x({"m": "sales", "y": "ty", "p": "latest", "fam": h, "ch": c}) > 0 for c in chans)
        lo_ch = min(chans, key=lambda c: x(chg(ch=c)))
        hi_ch = max(chans, key=lambda c: x(chg(ch=c)))
        out = dict(
            headline="One new parka is carrying the week — the <em>Harbor Parka</em> added more than the whole increase, while denim keeps sliding.",
            deck=f"Net sales were {n(S, 'money')}, {n(chg(), 'pct_signed')} vs LY — up from {n(chg(p='p4'), 'pct_signed')} over the prior four weeks "
                 f"({n(dif(chg(), chg(p='p4')), 'pts')}). <em>Outerwear</em> is the engine at {n(con(cat=o), 'pts')}, and nearly all of it is one product new this year: "
                 f"the <em>Harbor Parka</em> ({n({'m': 'delta', 'of': 'sales', 'fam': h}, 'money')}, {n(con(fam=h), 'pts')}). "
                 f"Take it out and the week is {n(chg(excl_new=True), 'pct_signed')}.",
            why=f"Product leads. Outerwear is {n(chg(cat=o), 'pct_signed')} vs LY, and the <em>Harbor Parka</em> is new to line — no LY comparison. "
                f"<em>Denim &amp; Pants</em> is the drag at {n(con(cat=dn), 'pts')} ({n(chg(cat=dn), 'pct_signed')}), and it isn't a one-week dip: "
                f"<em>Weekend Straight</em> is {n(chg(fam=st), 'pct_signed')}, against {n(chg(fam=st, p='p4'), 'pct_signed')} over the prior four weeks. "
                f"All {len(chans)} channels grew, so this is a product story, not a channel one.",
            notes=["One new family carries it; one category is a structural drag.",
                   f"All {len(chans)} channels up, {n(chg(ch=lo_ch), 'pct_signed')} to {n(chg(ch=hi_ch), 'pct_signed')}. Broad-based.",
                   f"First-time customers bring {n({'m': 'delta', 'of': 'sales_new'}, 'money')} of the {n({'m': 'delta', 'of': 'sales'}, 'money')} gain. "
                   f"Gen Z new customers {n(chg('genz'), 'pct_signed')}.",
                   f"Growth is price and mix, not volume — at {n(aur(fam=h), 'price2')} the parka lifts the average."],
            actions=[
                {"t": "Chase the Harbor Parka before it sells out.",
                 "b": f"{n(wos(h), 'weeks')} weeks of cover against a {lo}-week floor, selling about {n({'m': 'avg_units', 'fam': h}, 'int')} a week. "
                      f"The gap to an 8-week target is about {n({'m': 'reorder', 'fam': h, 'target': 8}, 'int')} units — indicative: the buyer nets off open POs "
                      f"and inbound, and checks lead time and size mix, before raising the order.",
                 "g": ["Lever · Inventory", "Direction · Buy up", "Target · 8 weeks of cover"]},
                {"t": "Stop feeding Weekend Straight.",
                 "b": f"{n(wos(st), 'weeks')} weeks of cover against a {hi}-week ceiling, with units {n(chg('units', fam=st), 'pct_signed')} vs LY. "
                      f"About {n({'m': 'excess', 'fam': st, 'target': hi}, 'int')} units sit above the {hi}-week ceiling, and "
                      f"{n({'m': 'excess', 'fam': st, 'target': 8}, 'int')} above the 8-week target — hold open receipts until it is back under the ceiling.",
                 "g": ["Lever · Open-to-buy", "Direction · Hold", f"Target · under {hi} weeks"]},
                {"t": "Turn the parka's new customers into repeat ones.",
                 "b": f"{n({'m': 'share', 'num': 'sales_new', 'den': 'sales', 'fam': h}, 'pct')} of Harbor Parka sales came from first-time customers, against "
                      f"{n({'m': 'share', 'num': 'sales_new', 'den': 'sales'}, 'pct')} for the brand; {n({'m': 'sum', 'of': 'genz', 'fam': h}, 'int')} of its "
                      f"{n({'m': 'sum', 'of': 'new', 'fam': h}, 'int')} new customers are Gen Z.",
                 "g": ["Lever · CRM", "Direction · Retain", f"Target · track 2nd purchase from W{wk + 1}"]},
            ],
            bottom="This week's growth is one product deep. Is the Harbor Parka a one-season hit or the start of an outerwear franchise — and can supply keep up long enough to find out?",
            drills=[
                drill("What does the week look like without the Harbor Parka?", f"{n(chg(excl_new=True), 'pct_signed')} vs LY.",
                      f"{n({**S, 'excl_new': True}, 'money')} against {n(SLY(excl_new=True), 'money')} last year. The rest of Outerwear is only "
                      f"{n(chg(cat=o, excl_new=True), 'pct_signed')}; Denim &amp; Pants takes {n(con(cat=dn), 'pts')}.",
                      [S_(exclude_new=True), S_(group_by="category")]),
                drill("Is denim a price problem or a demand problem?", "Demand — units are falling while price holds.",
                      f"Weekend Straight units are {n(chg('units', fam=st), 'pct_signed')} vs LY with average price {n(achg(fam=st), 'pct_signed')} "
                      f"({n(aur(fam=st), 'price2')} vs {n(aur(fam=st, y='ly'), 'price2')}), the same pattern as the prior four weeks "
                      f"(units {n(chg('units', fam=st, p='p4'), 'pct_signed')}). This data has no markdown split, so the brief can't say whether a promotion would move it.",
                      [S_(family=st), ["get_trend", {"family": st}]]),
                drill("Is the parka selling in every channel?", f"Yes — all {len(chans)}.",
                      ", ".join(f"{c} {n({**S, 'fam': h, 'ch': c}, 'money')}" for c in chans) + " this week.",
                      [S_(family=h, group_by="channel")]),
            ],
        )
    elif region == "uk":
        k, o, cl, fi, fj, h = "Knitwear", "Outerwear", "cloud", "fisher", "field", "harbor"
        assert prim == k and cats[0] == o and x(chg()) < 0
        assert x(chg()) > x(chg(p="p4")) and abs(x(dif(chg(), chg(p="p4")))) <= 1.5  # "a little better"
        assert all(x(chg(fam=f["id"])) < 0 for f in d["families"] if f["cat"] == k)
        assert x(chg(cat=k, p="p4")) < -10 and x(chg(ch="Stores")) < 0 < x(chg(ch="Online"))
        assert x(chg(ch="Online")) > x(chg(ch="Online", p="p4")) and x(chg(ch="Stores")) < x(chg(ch="Stores", p="p4"))
        assert x(wos(cl)) > hi and x(wos(fi)) > hi and x(chg(excl_cat=k)) > 0
        assert x(chg("new", ch="Online")) > 0 > x(chg("new", ch="Stores")) and x(achg()) > 0 > x(chg("units"))
        assert x(chg("units", fam=cl)) < -10
        assert x(chg(cat=o)) > 0 and x(con(cat=o)) > 0  # headline: Outerwear grows
        cl_price = x(achg(fam=cl))
        out = dict(
            headline=f"Knitwear and stores are pulling the week down — <em>Knitwear</em> is {n(chg(cat=k), 'pct_signed')} and Cloud Crew stock is piling up, while Outerwear and Online grow.",
            deck=f"Net sales were {n(S, 'money')}, {n(chg(), 'pct_signed')} vs LY — a little better than {n(chg(p='p4'), 'pct_signed')} over the prior four weeks. "
                 f"<em>Knitwear</em> is the biggest drag at {n(con(cat=k), 'pts')}; Outerwear offsets {n(con(cat=o), 'pts')}. "
                 f"By channel the week splits in two: Stores {n(chg(ch='Stores'), 'pct_signed')}, Online {n(chg(ch='Online'), 'pct_signed')}.",
            why=f"Knitwear is the story: all three families are down, led by <em>Cloud Crew</em> at {n(chg(fam=cl), 'pct_signed')} ({n(con(fam=cl), 'pts')}), "
                f"and it isn't one week — Knitwear was {n(chg(cat=k, p='p4'), 'pct_signed')} over the prior four weeks too. Outerwear holds up, with "
                f"<em>Field Jacket</em> {n(chg(fam=fj), 'pct_signed')} and the new Harbor Parka adding {n(con(fam=h), 'pts')}. "
                f"Stores take {n(con(ch='Stores'), 'pts')} while Online adds {n(con(ch='Online'), 'pts')}, up from {n(chg(ch='Online', p='p4'), 'pct_signed')} over the prior four weeks.",
            notes=["Knitwear and Outerwear pull in opposite directions.",
                   "Stores and Online are moving apart, and the gap is widening.",
                   f"Sales to returning customers take {n(ret, 'pts')}; new customers add {n(con(of='sales_new'), 'pts')}, mostly online — "
                   f"new customers {n(chg('new', ch='Online'), 'pct_signed')} online, {n(chg('new', ch='Stores'), 'pct_signed')} in stores.",
                   f"Fewer, pricier items: AUR {n(achg(), 'pct_signed')} on units {n(chg('units'), 'pct_signed')}."],
            actions=[
                {"t": "Cut Cloud Crew receipts.",
                 "b": f"{n(wos(cl), 'weeks')} weeks of cover against a {hi}-week ceiling, with units {n(chg('units', fam=cl), 'pct_signed')} vs LY. "
                      f"About {n({'m': 'excess', 'fam': cl, 'target': hi}, 'int')} units sit above the {hi}-week ceiling, and "
                      f"{n({'m': 'excess', 'fam': cl, 'target': 8}, 'int')} above the 8-week target.",
                 "g": ["Lever · Open-to-buy", "Direction · Cut", f"Target · under {hi} weeks"]},
                {"t": "Test a markdown on Fisherman Cardigan before it follows.",
                 "b": f"{n(wos(fi), 'weeks')} weeks of cover, also over the {hi}-week ceiling, with sales {n(chg(fam=fi), 'pct_signed')} vs LY.",
                 "g": ["Lever · Markdown", "Direction · Test", f"Target · under {hi} weeks"]},
                {"t": "Test more Online spend before moving budget.",
                 "b": f"Online is {n(chg(ch='Online'), 'pct_signed')} vs LY, up from {n(chg(ch='Online', p='p4'), 'pct_signed')} over the prior four weeks, "
                      f"and now brings {n({'m': 'mix', 'ch': 'Online'}, 'pct')} of sales. Growth alone doesn't show what extra spend would add — "
                      f"a holdout test does, before the next pound moves.",
                 "g": ["Lever · Channel mix", "Direction · Test", "Target · incremental sales per pound"]},
            ],
            bottom="Knitwear is down while Outerwear is up, so a mild autumn is a hypothesis to check against regional weather, not the explanation. "
                   "The stores gap is the bigger question: if Online keeps taking share, the store plan needs rethinking, not waiting out.",
            drills=[
                drill("What would the week look like without Knitwear?", f"{n(chg(excl_cat=k), 'pct_signed')} vs LY.",
                      f"{n({**S, 'excl_cat': k}, 'money')} against {n(SLY(excl_cat=k), 'money')} last year. The rest of the range is growing; Knitwear alone turns the week negative.",
                      [S_(exclude_category=k)]),
                drill("Is knitwear a price problem or a demand problem?",
                      "Demand — fewer units at a steady price." if abs(cl_price) < 3 else "Demand, with price moving too.",
                      f"Cloud Crew units are {n(chg('units', fam=cl), 'pct_signed')} vs LY with average price {n(achg(fam=cl), 'pct_signed')} "
                      f"({n(aur(fam=cl), 'price2')} vs {n(aur(fam=cl, y='ly'), 'price2')}). Shoppers are buying fewer jumpers, not cheaper ones.",
                      [S_(family=cl), ["get_inventory", {"family": cl}]]),
                drill("Which channel is losing most?", "Stores — and it's getting worse.",
                      f"Stores are {n(chg(ch='Stores'), 'pct_signed')} against {n(chg(ch='Stores', p='p4'), 'pct_signed')} over the prior four weeks. "
                      + ", ".join(f"{c} {n(chg(ch=c), 'pct_signed')}" for c in chans if c != "Stores") + ".",
                      [S_(group_by="channel")]),
            ],
        )
    else:  # jp
        dn, bg, mi, st, wi, ds = "Denim & Pants", "Bags", "mini", "straight", "wide", "Department stores"
        old = ["ord_gx", "ord_bb"]
        assert prim == dn and cats[0] == bg and x(chg()) < 0 and x(chg()) > x(chg(p="p4"))
        assert x(con(fam=mi)) / x(con(cat=bg)) > 0.8 and x(con(ch=ds)) < x(con(cat=dn))  # "nearly all", dept stores worse than denim
        assert x(chg(fam=st)) < 0 and x(chg(fam=wi)) < 0 and x(chg(cat=dn, p="p4")) < -10
        assert x(chg(ch=ds)) < x(chg(ch=ds, p="p4")) and x(chg(ch="Stores")) > 0 and x(chg(fam=mi)) > x(chg(fam=mi, p="p4"))
        assert x(wos(mi)) < lo and lo < x(wos(st)) < hi and lo < x(wos(wi)) < hi
        assert x(chg(old, ch=ds)) < x(chg("orders", ch=ds)) < 0 and x(chg(excl_cat=bg)) < x(chg())
        assert all(x({**S, "fam": mi, "ch": c}) > 0 for c in chans) and x(chg("units")) < 0
        assert x(chg("units", fam=st)) < -10
        out = dict(
            headline=f"A flat week held up by one bag — <em>Mini Crossbody</em> is {n(chg(fam=mi), 'pct_signed')} with {n(wos(mi), 'weeks')} weeks of stock left, while denim and department stores drag.",
            deck=f"Net sales were {n(S, 'money')}, {n(chg(), 'pct_signed')} vs LY, better than {n(chg(p='p4'), 'pct_signed')} over the prior four weeks. "
                 f"<em>Denim &amp; Pants</em> is the biggest product drag at {n(con(cat=dn), 'pts')}, and department stores take {n(con(ch=ds), 'pts')}. "
                 f"<em>Bags</em> cover most of it at {n(con(cat=bg), 'pts')}, nearly all from the Mini Crossbody ({n(con(fam=mi), 'pts')}).",
            why=f"Two drags, one engine. Denim is down in both families — <em>Weekend Straight</em> {n(chg(fam=st), 'pct_signed')}, <em>Wide-Leg Trouser</em> "
                f"{n(chg(fam=wi), 'pct_signed')} — and has been for weeks ({n(chg(cat=dn, p='p4'), 'pct_signed')} over the prior four). Department stores are "
                f"{n(chg(ch=ds), 'pct_signed')}, worse than {n(chg(ch=ds, p='p4'), 'pct_signed')} before, while Stores grew {n(chg(ch='Stores'), 'pct_signed')}. "
                f"The Mini Crossbody is speeding up: {n(chg(fam=mi), 'pct_signed')} against {n(chg(fam=mi, p='p4'), 'pct_signed')} over the prior four weeks.",
            notes=["One bag offsets denim.",
                   "Department stores lose what Stores gain.",
                   f"Sales to returning customers take {n(ret, 'pts')}; in department stores, Gen X and Boomer orders are {n(chg(old, ch=ds), 'pct_signed')}.",
                   f"The drop is volume: units {n(chg('units'), 'pct_signed')}, AUR {n(achg(), 'pct_signed')}."],
            actions=[
                {"t": "Size a Mini Crossbody reorder now.",
                 "b": f"{n(wos(mi), 'weeks')} weeks of cover against a {lo}-week floor, selling about {n({'m': 'avg_units', 'fam': mi}, 'int')} a week. "
                      f"The gap to an 8-week target is about {n({'m': 'reorder', 'fam': mi, 'target': 8}, 'int')} units — indicative: the buyer nets off open POs "
                      f"and inbound, and checks lead time and size mix, before raising the order.",
                 "g": ["Lever · Inventory", "Direction · Buy up", "Target · 8 weeks of cover"]},
                {"t": "Plan denim to the trend, not to last year.",
                 "b": f"Denim is {n(chg(cat=dn), 'pct_signed')} vs LY and {n(chg(cat=dn, p='p4'), 'pct_signed')} over the prior four weeks. Stock is still in range "
                      f"({n(wos(st), 'weeks')} and {n(wos(wi), 'weeks')} weeks), so fix the next buy rather than mark down.",
                 "g": ["Lever · Buy plan", "Direction · Cut depth", "Target · plan at the current run-rate"]},
                {"t": "Find out why older shoppers buy less in department stores.",
                 "b": f"Gen X and Boomer orders there are {n(chg(old, ch=ds), 'pct_signed')} vs LY, against {n(chg('orders', ch=ds), 'pct_signed')} for all department-store orders.",
                 "g": ["Lever · Assortment", "Direction · Retain", "Target · back to flat vs LY"]},
            ],
            bottom="The week is flat because one bag is covering for denim and department stores. If the Mini Crossbody sells out before the reorder lands, nothing is left covering.",
            drills=[
                drill("What would the week look like without Bags?", f"{n(chg(excl_cat=bg), 'pct_signed')} vs LY.",
                      f"{n({**S, 'excl_cat': bg}, 'money')} against {n(SLY(excl_cat=bg), 'money')} last year — Bags are the difference between a flat week and a soft one.",
                      [S_(exclude_category=bg)]),
                drill("Is the Mini Crossbody selling in every channel?", f"Yes — all {len(chans)}.",
                      ", ".join(f"{c} {n({**S, 'fam': mi, 'ch': c}, 'money')}" for c in chans) + " this week.",
                      [S_(family=mi, group_by="channel")]),
                drill("Is denim a price problem or a demand problem?", "Demand — units are falling.",
                      f"Weekend Straight units are {n(chg('units', fam=st), 'pct_signed')} vs LY, with average price {n(achg(fam=st), 'pct_signed')} "
                      f"({n(aur(fam=st), 'price2')} vs {n(aur(fam=st, y='ly'), 'price2')}). This data has no markdown split, so the brief can't say whether a promotion would move it.",
                      [S_(family=st), ["get_trend", {"family": st}]]),
            ],
        )
    out.update(wk=wk, stats=stats, p4=p4)
    for i, note in enumerate(out.pop("notes")):
        p4[i]["note"] = note
    out["checks"] = B.checks
    return out


# ---------------------------------------------------------------- weekly feedback review (synthetic week)
# What the production feedback agent drafts each Monday from the logged turns and ratings: themes ranked,
# diagnosed, with a suggested decision for the business reviewer. The week is synthetic; the visitor's own
# ratings are added in the browser. dg = diagnosis class, ai = the agent's suggested decision.
REVIEW = {  # q = questions, up = 👍; each theme lists the feedback events behind it (dn = 👎, reph = rephrased, nodata, flag)
    "na": dict(hero="Harbor Parka", q=148, up=11, prev=148 - 12,
               c=[dict(dn=4, reph=3), dict(reph=3, dn=1), dict(nodata=6), dict(flag=1), dict(reph=3)]),
    "uk": dict(hero="Cloud Crew", q=96, up=7, prev=96 - 8,
               c=[dict(dn=3, reph=2), dict(reph=2, dn=1), dict(nodata=5), dict(flag=1), dict(reph=2)]),
    "jp": dict(hero="Mini Crossbody", q=121, up=9, prev=121 + 5,
               c=[dict(dn=2, reph=4), dict(reph=1, dn=1), dict(nodata=4), dict(flag=1), dict(reph=2)]),
}
SRC = dict(dn="👎", reph="rephrased", nodata="“no data” replies", flag="checker flag")


def review(region, d):
    r = REVIEW[region]
    q, up, comp = r["q"], r["up"], r["c"]
    # every tile is the sum of the theme rows' events, so the review reconciles by construction
    tot = {k: sum(c.get(k, 0) for c in comp) for k in SRC}
    dn, reph, nodata, flags = tot["dn"], tot["reph"], tot["nodata"], tot["flag"]
    n = [sum(c.values()) for c in comp]
    src = lambda c: " · ".join(f"{v} {SRC[k] if k != 'flag' or v == 1 else 'checker flags'}" for k, v in c.items())
    hero = r["hero"]
    rows = [
        dict(theme="Month names read as “last 4 weeks”", ex="How did October go?", src=src(comp[0]), n=n[0],
             dg="und", dl="Misread period", sug="Map month names to the fiscal calendar before choosing a period.", ai="fix"),
        dict(theme="“Sell-through” answered as weeks of supply", ex=f"What's sell-through on the {hero}?", src=src(comp[1]), n=n[1],
             dg="def", dl="Definition gap", sug="No agreed formula yet. Proposed: units sold ÷ (units sold + on hand).", ai="def"),
        dict(theme="Store-level questions", ex=f"Which stores sold the most {hero}?", src=src(comp[2]), n=n[2],
             dg="scope", dl="Out of scope", sug="Data is region-level. Add store grain, or say so in “What it covers”.", ai="later"),
        dict(theme="Gen Z share quoted for the wrong period", ex="Gen Z share of new customers, last 13 weeks?", src=src(comp[3]), n=n[3],
             dg="bug", dl="Bug", sug="Period not passed to get_customers. Fix, and add a 13-week test case.", ai="fix"),
        dict(theme="“Chase” not understood as reorder", ex="Which styles should I chase?", src=src(comp[4]), n=n[4],
             dg="und", dl="Vocabulary", sug="Add buyer synonyms: chase, top up, re-buy → reorder.", ai="fix"),
    ]
    assert n[0] == max(n) and q > up + dn and flags == 1  # headline text: "Only 1 answer had a number the checker flagged"
    assert sum(x["n"] for x in rows) == dn + reph + nodata + flags  # theme counts == tile totals
    third = next(c for c in d["channels"] if c not in ("Stores", "Online"))
    return dict(
        wk=d["weeks"][-1]["wk"],
        headline="Most friction this week is about time periods and definitions, not wrong numbers.",
        text=f"Buyers asked <strong>{q}</strong> questions. Only <strong>{flags}</strong> answer had a number the checker flagged; the bigger theme is "
             f"<strong>{n[0]}</strong> questions where “October” or “last month” was read as the last 4 weeks. One theme needs a business definition before anyone can fix it.",
        sig=dict(q=q, prev=r["prev"], up=up, dn=dn, reph=reph, nodata=nodata, flags=flags),
        rows=rows,
        done=[dict(t=f"{third[:-1] if third.endswith('s') else third} sales mixed into Stores", d="fixed last week · 2 regression tests added · 3 users told"),
              dict(t="“Top sellers” sorted by units, not sales", d="fixed last week · 1 regression test added · 1 user told")],
    )


def main():
    for path in sorted(glob.glob(os.path.join(HERE, "..", "config", "*.json"))):
        cfg = json.load(open(path))
        region = cfg["region"]
        rng = random.Random(f"{SEED}-{region}")  # own stream per region: tuning one never moves another
        sales, inv = build(region, cfg, rng)
        d = {
            "region": region,
            "as_of": (LATEST_SUN + dt.timedelta(days=8)).isoformat(),
            "weeks": calendar(cfg),
            "channels": cfg["channels"],
            "families": [{"id": f[0], "name": f[1], "cat": f[2], "new": f[5]} for f in FAMILIES],
            "cols": COLS,
            "sales": sales,
            "inv_cols": ["y", "w", "f", "on_hand"],
            "inv": inv,
        }
        d["chat"] = chat(region, d, cfg)
        d["insights"] = brief(region, d, cfg)
        d["review"] = review(region, d)
        out = os.path.join(HERE, f"{region}.json")
        with open(out, "w") as fh:
            json.dump(d, fh, separators=(",", ":"), ensure_ascii=False)
        print(f"{region}: {len(sales)} sales rows, {len(inv)} inventory rows, {os.path.getsize(out) / 1024:.0f} KB")
        for c in d["chat"]:
            print("  Q:", c["q"])
            print("  A:", c["a"])


if __name__ == "__main__":
    main()
