#!/usr/bin/env python3
"""Synthetic data for the eCom Site Journey Agent demo (fictional brand: Sunday Studio).

Seeded, so every run writes the same file:  python3 generate.py  ->  ./ecom.json

Weekly grain, fiscal weeks W25..W41 (Sun Jul 19 .. Sat Nov 14, 2026):
  grid      week x channel x device -> sessions, engaged sessions, product-view sessions,
            add-to-cart sessions, checkout sessions, orders, revenue
  email     each send -> delivered, opens, clicks (not split by device), and per device the
            sessions, bounced sessions, orders and revenue it brought. The Email channel in
            the grid is built from these sends, so the two always agree.
  landing   week x device x landing page -> sessions, bounced, orders. The pages (plus "All
            other pages") partition the grid's sessions and bounces exactly.
  mix       week x device x landing page -> sessions by channel (channel order as in "channels"). Rows add
            up to the page's sessions and columns to the grid's channel sessions, so a page's top source
            can never claim more visits than its channel had. "src" is its all-device summary per week.
  products  week x device x product -> page views, add-to-carts, orders, demand, and page
            views that opened on a sold-out option
  events    the few facts a real agent reads from other systems: a release note, a stock-out,
            a campaign's link, a product's review theme

Planted in W41 (Nov 8-14), for the page's rules to find on their own:
  * a payment verification step goes live on mobile Tue 11/10 -> mobile checkout -> purchase
    falls ~9 pts; desktop doesn't change
  * a paid social ad for the Juniper Tote in black, which sells out Wed 11/11 -> paid social
    traffic up, its bounce up, the Juniper page's bounce spikes, Juniper demand falls far
    below the site-wide dip
  * "Early access: Cyber week" email: the best open rate, but click-to-open far below the other
    sends (a CTA / audience question), and its link goes to a page that opens Fri 11/20, so most
    of the few who click bounce
  * Harbor Crossbody: one of the most-viewed products every week, add-to-cart rate under half
    the bags average (not new, so it isn't an alert about this week)
Everything else is trend plus noise, so most products move with the site, not in lockstep.
"""
import datetime as dt
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
rnd = random.Random(18)
g = lambda sd: rnd.gauss(0, sd)

NW = 17
W41 = NW - 1
START = dt.date(2026, 7, 19)  # Sunday that opens fiscal W25
WEEKS = [{"wk": 25 + i, "start": str(START + dt.timedelta(7 * i)), "end": str(START + dt.timedelta(7 * i + 6))} for i in range(NW)]
DEV = ["mobile", "desktop"]

# key, name, W40 sessions (K), mobile share, W41 change vs trend
CH = [("search", "Paid search", 282.6, 0.62, 1.012), ("organic", "Organic", 327.8, 0.66, 0.970),
      ("direct", "Direct", 213.2, 0.55, 0.985), ("email", "Email", None, 0.70, None),
      ("social", "Paid social", 159.0, 0.88, 1.145), ("other", "Other", 183.8, 0.60, 0.952)]
ENG_D = {"search": .06, "organic": .02, "direct": .05, "email": .12, "social": -.10, "other": -.02}
PDP_D = {"social": .08, "email": .08}
ATC_D = {"email": .03, "social": -.04}
ORD_M = {"search": 1.05, "organic": 1.0, "direct": 1.03, "email": .85, "social": .80, "other": .96}
AOV_M = {"search": 1.0, "organic": 1.01, "direct": 1.02, "email": .97, "social": .94, "other": .98}


def trend(t):  # site traffic index, W40 = 1.0
    return 1 - 0.011 * (W41 - 1 - t)


def rates(c, d, t):
    j = lambda: 1 + g(.004)
    eng = ((.57 if d == "mobile" else .675) + ENG_D[c]) * j()
    pdp = ((.71 if d == "mobile" else .74) + PDP_D.get(c, 0)) * j()
    atc = ((.197 if d == "mobile" else .232) + ATC_D.get(c, 0)) * j()
    chk = (.474 if d == "mobile" else .483) * j()
    ordr = (.475 if d == "mobile" else .55) * ORD_M[c] * j()
    aov = (163 if d == "mobile" else 182) * AOV_M[c] * (1 + g(.01))
    if t == W41:
        if d == "mobile":
            ordr *= 0.813          # payment verification step, live from Tue 11/10
        if c == "social":
            eng -= 0.114           # the ad lands on a sold-out product page
            atc *= 0.75
    return eng, pdp, atc, chk, ordr, aov


def funnel(s, eng_s, c, d, t, r=None):
    eng, pdp, atc, chk, ordr, aov = r or rates(c, d, t)
    e = eng_s if eng_s is not None else s * eng
    p = e * pdp
    a = p * atc
    k = a * chk
    o = k * ordr
    return [round(s), round(e), round(p), round(a), round(k), round(o), round(o * aov)]


# ---------------------------------------------------------------- email sends
NAMES = ["Weekend edit", "New arrivals", "The knit shop", "Back in stock", "Members' preview", "Fall outerwear",
         "Gifts under $100", "Bestsellers", "Denim week", "Last chance"]
SENDS = []
for t in range(NW):
    if t == W41:
        week = [("Holiday gift guide", 1.10e6, .248, .165, .28, 1.2, None),
                ("Early access: Cyber week", .62e6, .312, .045, .71, .45, {"page": "the early access page", "opens": "Fri 11/20"}),
                ("New arrivals: outerwear", .63e6, .196, .163, .28, 1.0, None)]
    elif t == W41 - 1:
        week = [("Gift guide preview", 1.05e6, .231, .158, .28, 1.1, None), ("Weekend edit", .98e6, .218, .149, .29, 1.0, None)]
    else:
        n1, n2 = rnd.sample(NAMES, 2)
        week = [(n1, rnd.uniform(.9e6, 1.1e6), .22 + g(.006), .152 + g(.006), .28 + g(.01), 1.0, None),
                (n2, rnd.uniform(.85e6, 1.0e6), .215 + g(.006), .148 + g(.006), .29 + g(.01), 1.0, None)]
    for name, dl, orate, ctor, bnc, mult, link in week:
        opens = dl * orate
        clicks = opens * ctor
        sess = clicks * 0.93
        SENDS.append({"w": t, "name": name, "deliv": round(dl), "opens": round(opens), "clicks": round(clicks), "link": link,
                      "_s": {"mobile": sess * .70, "desktop": sess * .30}, "_b": bnc, "_m": mult})

# ---------------------------------------------------------------- grid
grid = {c[0]: {d: [] for d in DEV} for c in CH}
for t in range(NW):
    for key, _, base, mob, w41 in CH:
        for d in DEV:
            r = rates(key, d, t)
            if key == "email":
                ss = [x for x in SENDS if x["w"] == t]
                s = sum(x["_s"][d] for x in ss)
                bounced = sum(x["_s"][d] * x["_b"] * (1.08 if d == "mobile" else .85) for x in ss)
                row = funnel(s, s - bounced, key, d, t, r)
                # split the cell's orders and revenue across the sends: engaged sessions x a per-send pull
                wts = [x["_s"][d] * (1 - x["_b"]) * x["_m"] for x in ss]
                tot = sum(wts)
                for x, wt in zip(ss, wts):
                    x.setdefault("dev", {})[d] = [round(x["_s"][d]), round(x["_s"][d] * x["_b"] * (1.08 if d == "mobile" else .85)),
                                                 row[5] * wt / tot, row[6] * wt / tot]
            else:
                f = (w41 if t == W41 else trend(t) * (1 + g(.015)))
                s = base * 1000 * f * (mob if d == "mobile" else 1 - mob)
                row = funnel(s, None, key, d, t, r)
            grid[key][d].append(row)

# send-level orders/revenue: round so the sends add up to the grid's Email cell exactly
for t in range(NW):
    ss = [x for x in SENDS if x["w"] == t]
    for d in DEV:
        cell = grid["email"][d][t]
        for i, j in ((2, 5), (3, 6)):
            vals = [round(x["dev"][d][i]) for x in ss]
            vals[0] += cell[j] - sum(vals)
            for x, v in zip(ss, vals):
                x["dev"][d][i] = v
        # sends' sessions/bounces must add up to the cell too
        sv = [x["dev"][d][0] for x in ss]
        bv = [x["dev"][d][1] for x in ss]
        ss[0]["dev"][d][0] += cell[0] - sum(sv)
        ss[0]["dev"][d][1] += (cell[0] - cell[1]) - sum(bv)
email = [{"w": x["w"], "name": x["name"], "deliv": x["deliv"], "opens": x["opens"], "clicks": x["clicks"], "link": x["link"], "dev": x["dev"]} for x in SENDS]

# ---------------------------------------------------------------- landing pages (partition of the grid)
# key, name, share of device sessions, bounce desktop, bounce mobile, top source, first week
PAGES = [("home", "Home", .335, .30, .37, "direct", 0), ("gift", "Holiday gift guide", .103, .33, .40, "email", W41 - 2),
         ("juniper", "Juniper Tote", .045, .34, .43, "search", 0), ("outer", "Outerwear", .071, .36, .43, "organic", 0),
         ("sale", "Sale", .06, .41, .48, "search", 0), ("new", "New arrivals", .05, .35, .42, "email", 0)]
landing = {d: {p[0]: [] for p in PAGES + [("rest",)]} for d in DEV}
src = {p[0]: [] for p in PAGES}
pull = {p[0]: [] for p in PAGES}
for t in range(NW):
    for d in DEV:
        tot_s = sum(grid[c][d][t][0] for c in grid)
        tot_b = tot_s - sum(grid[c][d][t][1] for c in grid)
        tot_o = sum(grid[c][d][t][5] for c in grid)
        used = [0, 0, 0]
        for key, _, share, bd, bm, _, first in PAGES:
            if t < first:
                landing[d][key].append([0, 0, 0])
                continue
            sh, b = share * (1 + g(.03)), (bm if d == "mobile" else bd) + g(.006)
            cvr = (.019 if key != "gift" else .026) * (1 + g(.05))
            if key == "juniper" and t == W41:
                sh, b, cvr = .077 * (1.06 if d == "mobile" else .89), (.645 if d == "mobile" else .55), .006
            s = round(tot_s * sh)
            row = [s, round(s * b), round(s * cvr * (tot_o / tot_s) / .019)]
            landing[d][key].append(row)
            used = [u + v for u, v in zip(used, row)]
        rest = [tot_s - used[0], tot_b - used[1], tot_o - used[2]]
        assert .2 < rest[1] / rest[0] < .6, (t, d, rest[1] / rest[0])
        landing[d]["rest"].append(rest)
    # week-to-week pull of each page's main channel (the same draws as before, so the products below don't move)
    for key, *_, top, first in PAGES:
        if key == "juniper":
            pull[key].append(None if t == W41 else (.31 + g(.02)) / .31)
        else:
            pull[key].append((.38 + g(.04)) / .38)

# ---------------------------------------------------------------- landing page x channel (joint, so sources reconcile)
# Each session starts on one page and comes from one channel, so per week x device the page x channel sessions must add
# up to the page totals (rows) and to the grid's channel sessions (columns). Start from an affinity (how much more often a
# channel's visitors start on that page than on the average page) and rake it to both totals; the top source of a page is
# then read from this table, never set on its own.
CHK = [c[0] for c in CH]
AFF = {"home": {"direct": 3.2, "organic": 1.3, "search": .7, "email": .35, "social": .25, "other": 1.1},
       "gift": {"email": 15.0, "social": .8, "search": 1.1, "organic": .9, "direct": .7, "other": .9},
       "juniper": {"search": 2.2, "social": 1.3, "organic": .9, "direct": .6, "email": .5, "other": .8},
       "outer": {"organic": 2.4, "search": 1.2, "direct": .8, "email": .9, "social": .6, "other": .9},
       "sale": {"search": 2.5, "organic": .9, "direct": .7, "email": 1.3, "social": .8, "other": 1.2},
       "new": {"email": 11.0, "organic": 1.1, "search": .9, "direct": .8, "social": .7, "other": .9}}
TOP = {p[0]: p[5] for p in PAGES}
JUNIPER_W41_SOCIAL = .71   # the "Juniper in black" ad: share of the page's W41 sessions that come from paid social


def rake(rows, cols, aff, it=200):
    m = [[a * r * c for a, c in zip(ar, cols)] for ar, r in zip(aff, rows)]
    for _ in range(it):
        for i, r in enumerate(rows):
            s = sum(m[i])
            m[i] = [v * r / s for v in m[i]] if s else m[i]
        for j, c in enumerate(cols):
            s = sum(m[i][j] for i in range(len(rows)))
            for i in range(len(rows)):
                m[i][j] = m[i][j] * c / s if s else 0
    return m


def int_mix(m, rows, cols):
    # pages: largest-remainder rounding to the page total; "All other pages" takes what each channel has left
    out = []
    for i, r in enumerate(rows[:-1]):
        fl = [int(v) for v in m[i]]
        for j in sorted(range(len(fl)), key=lambda j: m[i][j] - fl[j], reverse=True)[:r - sum(fl)]:
            fl[j] += 1
        out.append(fl)
    out.append([c - sum(o[j] for o in out) for j, c in enumerate(cols)])
    assert min(out[-1]) >= 0, out[-1]
    return out


PK = [p[0] for p in PAGES] + ["rest"]
mix = {d: {k: [] for k in PK} for d in DEV}
for t in range(NW):
    def solve(js):
        res = {}
        for d in DEV:
            rows = [landing[d][k][t][0] for k in PK]
            cols = [grid[c][d][t][0] for c in CHK]
            aff = []
            for k in PK:
                if k == "rest":
                    aff.append([1.0] * len(CHK)); continue
                a = dict(AFF[k])
                if k == "juniper" and t == W41:
                    a["social"] = js
                elif pull[k][t] is not None:
                    a[TOP[k]] *= pull[k][t]
                aff.append([a[c] for c in CHK])
            res[d] = int_mix(rake(rows, cols, aff), rows, cols)
        return res
    if t == W41:   # find the social pull that gives the ad's share of Juniper sessions
        lo, hi = 1.0, 200.0
        for _ in range(40):
            mid = (lo * hi) ** .5
            r = solve(mid)
            j = PK.index("juniper"); sh = sum(r[d][j][CHK.index("social")] for d in DEV) / sum(sum(r[d][j]) for d in DEV)
            lo, hi = (mid, hi) if sh < JUNIPER_W41_SOCIAL else (lo, mid)
        r = solve((lo * hi) ** .5)
    else:
        r = solve(None)
    for d in DEV:
        for i, k in enumerate(PK):
            mix[d][k].append(r[d][i])

# reconcile: rows = page sessions, columns = channel sessions, for every week x device
for t in range(NW):
    for d in DEV:
        for k in PK:
            assert sum(mix[d][k][t]) == landing[d][k][t][0] and min(mix[d][k][t]) >= 0, (t, d, k)
        for j, c in enumerate(CHK):
            assert sum(mix[d][k][t][j] for k in PK) == grid[c][d][t][0], (t, d, c)

# top source per page and week, all devices (a summary; the page recomputes it for the filters you pick)
for t in range(NW):
    for k in src:
        by = [sum(mix[d][k][t][j] for d in DEV) for j in range(len(CHK))]
        tot_k = sum(by)
        j = max(range(len(CHK)), key=lambda j: by[j])
        src[k].append([CHK[j], round(by[j] / tot_k, 2) if tot_k else 0])
    # a page's top source can never claim more sessions than its channel had (pages are mutually exclusive starts)
    for c in CHK:
        claimed = sum(src[k][t][1] * sum(landing[d][k][t][0] for d in DEV) for k in src if src[k][t][0] == c)
        assert claimed <= sum(grid[c][d][t][0] for d in DEV), (t, c, claimed)
assert src["juniper"][W41][0] == "social" and abs(src["juniper"][W41][1] - JUNIPER_W41_SOCIAL) <= .01, src["juniper"][W41]

# ---------------------------------------------------------------- products
# key, name, category, price, W40 page views (K), add-to-cart rate
PRODUCTS = [("field", "Field Jacket", "Outerwear", 248, 154, .094), ("merino", "Merino Turtleneck", "Knitwear", 118, 117, .101),
            ("cloud", "Cloud Crew", "Knitwear", 89, 133, .098), ("weekender", "Canvas Weekender", "Bags", 198, 70, .078),
            ("ridge", "Ridge Boot", "Footwear", 168, 88, .072), ("market", "Market Tote", "Bags", 69, 107, .104),
            ("courtside", "Courtside Sneaker", "Footwear", 119, 99, .081), ("vest", "Quilted Vest", "Outerwear", 115, 82, .087),
            ("willow", "Willow Wallet", "Small leather", 49, 94, .126), ("harbor", "Harbor Crossbody", "Bags", 129, 124, .034),
            ("straight", "Weekend Straight", "Denim", 89, 66, .075), ("daypack", "Day Pack", "Bags", 99, 57, .080),
            ("throw", "Linen Throw", "Home", 106, 41, .064), ("juniper", "Juniper Tote", "Bags", 148, 154, .108)]
products = {d: {p[0]: [] for p in PRODUCTS} for d in DEV}
for t in range(NW):
    site_idx = sum(grid[c][d][t][0] for c in grid for d in DEV) / sum(grid[c][d][W41 - 1][0] for c in grid for d in DEV)
    for key, name, cat, price, views, atc in PRODUCTS:
        vf, af, so = site_idx * (1 + g(.022)), 1 + g(.02), max(0, g(.012)) if cat != "Footwear" else abs(.03 + g(.012))
        if t == W41:
            if key == "juniper":
                vf, af, so = 1.25 * (1 + g(.01)), .061 / .108, .41
            elif key == "harbor":
                vf = 1.10
            elif key == "field":
                vf, af = vf * 1.08, af * 1.10   # lead product in the gift guide email: more views, and readier to buy
            else:
                vf *= 0.965  # the ad and the gift guide pull views toward three products
        for d in DEV:
            share = .64 if d == "mobile" else .36
            conv = grid_conv = sum(grid[c][d][t][5] for c in grid) / sum(grid[c][d][t][3] for c in grid)
            v = views * 1000 * vf * share
            a = v * atc * af * (.9 if d == "mobile" else 1.178)
            o = a * conv * .6 * (1 + g(.025))
            products[d][key].append([round(v), round(a), round(o), round(o * price * (1 + g(.02))), round(v * so)])

# ---------------------------------------------------------------- events (from release notes, inventory, the email tool, reviews)
mob_chk = sum(grid[c]["mobile"][W41][4] for c in grid)
reach = round(mob_chk * .93)
events = {
    "verify": {"w": W41, "device": "mobile", "from": "Tue 11/10", "what": "payment verification step", "reach": reach, "exit": round(reach * .34), "median_s": 41},
    "soldout": {"w": W41, "product": "juniper", "option": "black", "from": "Wed 11/11", "alt": "tan", "alt_wos": 11, "ad": "Juniper in black", "channel": "social"},
    "harbor": {"product": "harbor", "size_fit": .41, "review": "a short strap"},
}

out = {"meta": {"brand": "Sunday Studio", "asOf": "2026-11-16", "weeks": WEEKS},
       "channels": [{"k": c[0], "name": c[1]} for c in CH], "devices": DEV,
       "grid": grid, "email": email,
       "landing": {"pages": [{"k": p[0], "name": p[1]} for p in PAGES], "data": landing, "src": src, "mix": mix},
       "products": {"list": [{"k": p[0], "name": p[1], "cat": p[2], "price": p[3]} for p in PRODUCTS], "data": products},
       "events": events}
with open(os.path.join(HERE, "ecom.json"), "w") as f:
    json.dump(out, f, separators=(",", ":"))

# ---------------------------------------------------------------- the story, as the page should read it
def tot(t, d=None, c=None):
    cs = [c] if c else list(grid)
    ds = [d] if d else DEV
    return [sum(grid[x][y][t][i] for x in cs for y in ds) for i in range(7)]
T, L = tot(W41), tot(W41 - 1)
print(f"sessions {T[0]:,} vs {L[0]:,} ({T[0]/L[0]-1:+.1%}) · bounce {1-T[1]/T[0]:.1%} vs {1-L[1]/L[0]:.1%} · cvr {T[5]/T[0]:.2%} vs {L[5]/L[0]:.2%}")
print(f"revenue ${T[6]/1e6:.2f}M vs ${L[6]/1e6:.2f}M ({T[6]/L[6]-1:+.1%}) · aov ${T[6]/T[5]:.0f} vs ${L[6]/L[5]:.0f}")
for d in DEV:
    a, b = tot(W41, d), tot(W41 - 1, d)
    print(f"  {d}: checkout->purchase {a[5]/a[4]:.1%} vs {b[5]/b[4]:.1%} · cart abandon {1-a[5]/a[3]:.1%} vs {1-b[5]/b[3]:.1%}")
for c in grid:
    a, b = tot(W41, c=c), tot(W41 - 1, c=c)
    print(f"  {c:8} sess {a[0]:>8,} {a[0]/b[0]-1:+.1%} bounce {1-a[1]/a[0]:.1%} cvr {a[5]/a[0]:.2%} rev ${a[6]/1e3:,.0f}K {a[6]/b[6]-1:+.1%}")
for x in [e for e in email if e["w"] >= W41 - 1]:
    print(f"  W{25+x['w']} {x['name'][:26]:26} open {x['opens']/x['deliv']:.1%} ctor {x['clicks']/x['opens']:.1%} rev ${sum(v[3] for v in x['dev'].values())/1e3:.0f}K")
jt = sum(landing[d]["juniper"][W41][0] for d in DEV); jb = sum(landing[d]["juniper"][W41][1] for d in DEV)
jl = sum(landing[d]["juniper"][W41 - 1][0] for d in DEV); jlb = sum(landing[d]["juniper"][W41 - 1][1] for d in DEV)
print(f"  juniper page {jt:,} sess, bounce {jb/jt:.1%} vs {jlb/jl:.1%}")
mT, mL = tot(W41, "mobile"), tot(W41 - 1, "mobile")
eff = mT[4] * (mL[5] / mL[4] - mT[5] / mT[4]) * mT[6] / mT[5]
print(f"  mobile checkout effect -${eff/1e3:.0f}K of the -${(L[6]-T[6])/1e3:.0f}K drop ({eff/(L[6]-T[6]):.0%})")
site = T[6] / L[6] - 1
for key, name, *_ in PRODUCTS:
    a = sum(products[d][key][W41][3] for d in DEV); b = sum(products[d][key][W41 - 1][3] for d in DEV)
    v = sum(products[d][key][W41][0] for d in DEV); at = sum(products[d][key][W41][1] for d in DEV)
    print(f"  {name:18} demand ${a/1e3:>5.0f}K {a/b-1:+6.1%}  views {v/1e3:>4.0f}K atc {at/v:.1%}")
