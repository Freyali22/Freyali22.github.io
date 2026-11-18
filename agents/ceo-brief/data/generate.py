#!/usr/bin/env python3
"""Synthetic data for the CEO Morning Brief demo (fictional brand: Sunday Studio).

Seeded, so every run writes the same file:  python3 generate.py  ->  ./brief.json

Daily grain: day (Sun Oct 4 .. Mon Nov 16, 2026) x brand x region, this year and last year
(364 days earlier, same weekday). Weekly grain (2 fiscal weeks, Nov 1-14): category, new
customers, Gen Z and hero products per brand x region.

Two planted data-quality events, for the page's freshness logic to find on its own:
  * Thu 11/12 Europe comes in weak (62% of a normal Thursday) but fully loaded  -> a weak day
  * Mon 11/16 Japan has only loaded 38% of a normal Monday                       -> still loading
Month-to-date totals are scaled to fixed targets so the story reads the same every run.
Schedule, news and share-price content is synthetic too; the page fills every number in it
from the same engine that draws the Sales tab.
"""
import datetime as dt
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
rnd = random.Random(17)

Q_START = dt.date(2026, 10, 4)   # fiscal Q4 (4-5-4): Oct = Oct 4-31, Nov = Nov 1-Dec 5
M_START = dt.date(2026, 11, 1)
AS_OF = dt.date(2026, 11, 15)    # last fully loaded day
LAST = dt.date(2026, 11, 16)     # Japan still loading
DAYS = [Q_START + dt.timedelta(i) for i in range((LAST - Q_START).days + 1)]

# brand, region, MTD (Nov 1-15) TY and LY net sales in $
ROWS = [
    ("Studio", "North America", 10.40e6, 9.830e6),
    ("Studio", "Europe",         4.10e6, 3.612e6),
    ("Studio", "Asia Pacific",   3.50e6, 3.199e6),
    ("Studio", "Japan",          3.10e6, 3.160e6),
    ("Outlet", "North America",  5.20e6, 5.098e6),
    ("Outlet", "Europe",         1.10e6, 1.040e6),
    ("Outlet", "Japan",          1.00e6, 1.049e6),
]
WEEKDAY = [0.86, 0.86, 0.90, 0.95, 1.10, 1.32, 1.18]  # Mon..Sun (date.weekday())
FX = {"Japan": {"ccy": "JPY", "ty": 158.0, "ly": 151.17}}  # local units per USD

COMP_SHARE = 0.91         # share of sales from stores/sites open 1 yr+
GM = {"Studio": (0.712, 0.705), "Outlet": (0.618, 0.613)}  # TY, LY gross margin %
NEW_PER_K = 1.45          # new customers per $1K of sales (TY), tuned below
GENZ_SHARE = 0.34


def r2(x):
    return round(x, 2)


def daily(row_i, ty_target, ly_target):
    """TY and LY daily sales for one row, MTD scaled to target."""
    brand, region = ROWS[row_i][0], ROWS[row_i][1]
    ty, ly = [], []
    for d in DAYS:
        w = WEEKDAY[d.weekday()]
        base = w * (1 + 0.04 * math.sin(d.toordinal() / 5.0 + row_i))
        oct_drag = 0.985 if d < M_START else 1.0           # QTD a touch softer than MTD
        ty.append(base * oct_drag * (1 + rnd.uniform(-0.05, 0.05)))
        ly.append(base * (1 + rnd.uniform(-0.05, 0.05)))
    # planted weak day: Europe, Thu 11/12
    if region == "Europe":
        ty[DAYS.index(dt.date(2026, 11, 12))] *= 0.62
    mtd = [i for i, d in enumerate(DAYS) if M_START <= d <= AS_OF]
    kt = ty_target / sum(ty[i] for i in mtd)
    kl = ly_target / sum(ly[i] for i in mtd)
    ty = [v * kt for v in ty]
    ly = [v * kl for v in ly]
    # planted late load: Japan, Mon 11/16 only partly in
    if region == "Japan":
        ty[-1] *= 0.38
    return ty, ly


rows = []
for i, (brand, region, t, l) in enumerate(ROWS):
    ty, ly = daily(i, t, l)
    gt, gl = GM[brand]
    new_ty = [v / 1000 * NEW_PER_K for v in ty]
    new_ly = [v / 1000 * NEW_PER_K / 1.09 * (l / t) * (t / l) for v in ly]  # tuned to +9% below
    rows.append({
        "brand": brand, "region": region,
        "sales": [[round(a), round(b)] for a, b in zip(ty, ly)],
        "comp": [[round(a * COMP_SHARE * 0.985), round(b * COMP_SHARE)] for a, b in zip(ty, ly)],
        "gm": [[round(a * (gt + rnd.uniform(-0.004, 0.004))), round(b * (gl + rnd.uniform(-0.004, 0.004)))] for a, b in zip(ty, ly)],
        "new": [[round(a), round(b)] for a, b in zip(new_ty, new_ly)],
        "genz": [[round(a * GENZ_SHARE), round(b * 0.325)] for a, b in zip(new_ty, new_ly)],
    })

# tune new-customer counts so the company MTD is 41.2K, +9.0% vs LY
mtd_idx = [i for i, d in enumerate(DAYS) if M_START <= d <= AS_OF]
nt = sum(r["new"][i][0] for r in rows for i in mtd_idx)
nl = sum(r["new"][i][1] for r in rows for i in mtd_idx)
kt, kl = 41200 / nt, 41200 / 1.09 / nl
for r in rows:
    r["new"] = [[round(a * kt), round(b * kl)] for a, b in r["new"]]
    r["genz"] = [[round(a * kt), round(b * kl)] for a, b in r["genz"]]
# tune comp so the company MTD comp is +3.8%
ct = sum(r["comp"][i][0] for r in rows for i in mtd_idx)
cl = sum(r["comp"][i][1] for r in rows for i in mtd_idx)
kc = 1.038 * cl / ct
for r in rows:
    r["comp"] = [[round(a * kc), b] for a, b in r["comp"]]

# ---------------------------------------------------------------- weekly product & customer data (Nov 1-14)
CATS = [  # name, LY share, growth
    ("Knitwear", 0.26, 0.08), ("Outerwear", 0.10, 0.18), ("Bags", 0.18, 0.06),
    ("Denim & Pants", 0.18, 0.04), ("Footwear", 0.16, 0.01), ("Home & Gifts", 0.12, -0.06),
]
HEROES = [  # name, LY share of net sales, growth
    ("Market Tote", 0.0505, 0.22), ("Field Jacket", 0.031, 0.31), ("Cloud Crew", 0.044, -0.03),
]
wk_idx = [i for i, d in enumerate(DAYS) if M_START <= d <= dt.date(2026, 11, 14)]
weekly = []
for r in rows:
    ly_tot = sum(r["sales"][i][1] for i in wk_idx)
    wr = {"brand": r["brand"], "region": r["region"], "cat": {}, "hero": {}}
    for name, sh, g in CATS:
        lyv = ly_tot * sh * (1 + rnd.uniform(-0.03, 0.03))
        wr["cat"][name] = [round(lyv * (1 + g + rnd.uniform(-0.015, 0.015))), round(lyv)]
    for name, sh, g in HEROES:
        lyv = ly_tot * sh * (1 + rnd.uniform(-0.03, 0.03))
        wr["hero"][name] = [round(lyv * (1 + g + rnd.uniform(-0.015, 0.015))), round(lyv)]
    nd_ly = ly_tot * 0.29
    nd_ty = nd_ly * (1.09 + rnd.uniform(-0.01, 0.01))
    wr["new_demand"] = [round(nd_ty), round(nd_ly)]
    gz_ly = nd_ly * 0.31
    wr["genz_new_demand"] = [round(gz_ly * (1.14 + rnd.uniform(-0.01, 0.01))), round(gz_ly)]
    weekly.append(wr)

# ---------------------------------------------------------------- share price (64 trading days to Mon 11/16)
tdays = []
d = LAST
while len(tdays) < 64:
    if d.weekday() < 5:
        tdays.insert(0, d)
    d -= dt.timedelta(1)
px = [41.2]
for _ in range(63):
    px.append(px[-1] * (1 + (rnd.random() - 0.46) * 0.03))
k = 48.72 / px[-1]
px = [p * k for p in px]
px[-2] = 48.72 / 1.012
vol = [round(1.2 + rnd.random() * 0.8, 2) for _ in tdays]
avg30 = sum(vol[-31:-1]) / 30
vol[-1] = round(avg30 * 1.3, 2)
stock = {
    "ticker": "SNDY", "days": [x.isoformat() for x in tdays], "close": [r2(p) for p in px], "volume_m": vol,
    "ytd": 18.4, "target": [46, 58, 53],
    "peers": [["Halden & Co", 0.9, 12.6], ["Northgate Group", 0.6, 7.9], ["Maison Verre", -0.3, 6.8]],
}

out = {
    "brand": "Sunday Studio",
    "brief_day": "2026-11-17",
    "days": [x.isoformat() for x in DAYS],
    "q_start": Q_START.isoformat(), "m_start": M_START.isoformat(),
    "fx": FX,
    "rows": rows,
    "weekly": {"through": "2026-11-14", "from": "2026-11-01", "rows": weekly},
    "stock": stock,
}
with open(os.path.join(HERE, "brief.json"), "w") as f:
    json.dump(out, f, separators=(",", ":"))
print("wrote brief.json", os.path.getsize(os.path.join(HERE, "brief.json")), "bytes")
