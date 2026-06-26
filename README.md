# EcoSwap AI

Scan a plastic item from a photo or webcam. It identifies what the plastic is, shows you exactly how damaging it is for the environment, and suggests 5 sustainable alternatives you can buy right now — matched to the exact item you scanned.

Uses Google Gemini 2.0 Flash for vision + analysis. No backend server needed.

<p align="center">
  <a href="https://www.youtube.com/watch?v=YOUR_VIDEO_ID">
    <img src="https://img.youtube.com/vi/YOUR_VIDEO_ID/maxresdefault.jpg" alt="EcoSwap AI demo video" width="600" />
    <br />
    <img src="https://img.shields.io/badge/▶-Watch%20Demo%20on%20YouTube-red?style=for-the-badge&logo=youtube" alt="Watch Demo" />
  </a>
</p>

---

## How it works

The browser never calls Gemini directly. Every request goes through a Cloudflare Worker which holds the API key server-side and enforces per-IP rate limits. Each scan is a single Gemini call — detection and full analysis happen in one pass.

```
browser (index.html + js/app.js)
   → Cloudflare Worker (cloudflare-worker/worker.js)
       → checks rate limit (5/min, 120/day per IP)
       → attaches GEMINI_API_KEY
   → Gemini 2.0 Flash API
```

## Setting up your own deployment

### 1. Deploy the Cloudflare Worker

Install wrangler and log in:
```bash
npm install -g wrangler
wrangler login
```

From the `cloudflare-worker/` folder, create a KV namespace for rate limiting:
```bash
cd cloudflare-worker
wrangler kv namespace create RATE_LIMIT_KV
```
Paste the `id` it gives you into `wrangler.toml` under `kv_namespaces`.

Add your Gemini API key as a secret (get one free at [aistudio.google.com](https://aistudio.google.com)):
```bash
wrangler secret put GEMINI_API_KEY
```

Deploy:
```bash
wrangler deploy
```

### 2. Point the frontend at your Worker

Copy the Worker URL it prints and update `js/app.js`:
```js
const API_URL = 'https://your-worker-name.your-account.workers.dev';
```

### 3. Run locally

Open `index.html` directly, or use a local server for reliable webcam access:
```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

No npm install, no build step — it's plain HTML/CSS/JS.

---

## Project structure

```
EcoSwap-AI/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
└── cloudflare-worker/
    ├── worker.js
    └── wrangler.toml
```

## Features

- Upload an image or use your webcam (front or rear camera)
- Detects any size plastic item — small sachets, large jerry cans, packaging, bottles, bags
- Identifies plastic type (#1 PET through #7 Other), recyclability, confidence score
- Environmental impact: decomposition timeline, harm stats, most affected animal, emotional context
- 5 sustainable alternatives — each one matched exactly to the detected item (not a generic category)
- Budget to premium ordering, realistic prices per marketplace
- Amazon links for 7 marketplaces: India, US, UK, Germany, Canada, Australia, Japan
- Clear "not plastic" feedback when a non-plastic item is scanned, with material identified

## Tech stack

- **AI:** Google Gemini 2.0 Flash (vision + generation, single call per scan)
- **Proxy / key security:** Cloudflare Workers + KV (free tier)
- **Frontend:** Vanilla HTML, CSS, JavaScript — no framework, no build tool

## Security note

The Gemini API key lives exclusively in Cloudflare Workers as an encrypted secret. It is never in the frontend code, never in this repo. Any old key that was previously exposed has been revoked.

---

**Contact**

Email — jayavarshinijayakumaran11@gmail.com  
LinkedIn — https://www.linkedin.com/in/jayavarshini-jayakumaran

**License** — MIT
