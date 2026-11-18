# freyali22.github.io

Personal site of **Freya Li**, data science & analytics manager in New York. I build AI agents that business teams actually use.

**Live site:** https://freyali22.github.io

## What's here

| Path | What it is |
|---|---|
| `index.html` | Homepage: intro, agent projects, skills, experience, resume |
| `agents/product-performance/` | **Product Performance Agent**: weekly sales, product and inventory insights, plus a chat agent whose tool calls run in your browser |
| `agents/ceo-brief/` | **CEO Morning Brief**: schedule, sales, news and share price, plus a chat that answers only from the brief |
| `agents/ecom-funnel/` | **eCom Site Journey Agent**: follows shoppers from the email to the order, finds the step that broke, and says why |
| `agents/qa/` | **QA Agent**: re-checks the other agents' answers against the source data and turns confirmed mistakes into release tests |

Each demo page opens with a 30-second "Try it" guide: read the brief, ask the agent, rate the answer.

## About the demos

- **Synthetic data, fictional brand.** Every number comes from `agents/*/data/generate.py` (fixed seed) for a made-up brand, Sunday Studio.
- **Runs in the browser.** No backend and no API keys. Chat answers are computed from the page's own data, and ratings stay in your browser's `localStorage`. Nothing is sent anywhere.
- **Plain HTML, CSS and JavaScript**, hosted on GitHub Pages.

© 2026 Freya Li
