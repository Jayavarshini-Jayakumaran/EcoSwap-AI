# EcoSwap AI

Scan a plastic item from a photo or webcam and it'll tell you what it is, how bad it is for the environment, and suggest sustainable alternatives to swap it for. Uses Google Gemini for the analysis.

<p align="center">
  <a href="https://www.youtube.com/watch?v=YOUR_VIDEO_ID">
    <img src="https://img.youtube.com/vi/YOUR_VIDEO_ID/maxresdefault.jpg" alt="EcoSwap AI demo video preview" width="600" />
    <br />
    <img src="https://img.shields.io/badge/▶-Watch%20Demo%20on%20YouTube-red?style=for-the-badge&logo=youtube" alt="Watch Now" />
  </a>
</p>

---

## How it's set up

The browser doesn't call Gemini directly. It hits a small Cloudflare Worker, which holds the actual Gemini key and forwards the request. The Worker also rate-limits by IP (5/min, 60/day) so the quota doesn't get wiped out by one person hammering it.

```
browser (index.html + js/app.js)
   -> Cloudflare Worker (cloudflare-worker/worker.js)
      -> checks rate limit, attaches key
   -> Gemini API
```

Earlier version had the key sitting in the frontend code, which is why the quota kept getting exhausted - anyone could grab the key from devtools, or the shared free-tier limit ran out fast since each scan = 2 Gemini calls.

## Setting up your own copy

You only need this part if you're running your own deployment, not just viewing the live demo.

1. Install wrangler and log in:
```bash
npm install -g wrangler
wrangler login
```

2. From the `cloudflare-worker` folder, create a KV namespace for rate limiting:
```bash
cd cloudflare-worker
wrangler kv namespace create RATE_LIMIT_KV
```
Paste the id it gives you into `wrangler.toml`.

3. Add your Gemini key as a secret (get one free at aistudio.google.com):
```bash
wrangler secret put GEMINI_API_KEY
```

4. Deploy:
```bash
wrangler deploy
```

5. Take the URL it prints and put it in `js/app.js`:
```js
const API_URL = 'https://your-worker-url.workers.dev';
```

## Running it

Just open `index.html` in a browser, or run a local server for more reliable webcam access:
```bash
python3 -m http.server 8080
```

## Project structure

```
EcoSwap-AI/
  index.html
  css/style.css
  js/app.js
  cloudflare-worker/
    worker.js
    wrangler.toml
```

## Features

- Upload or webcam capture
- Identifies plastic type, recyclability, confidence score
- Environmental impact breakdown (decomposition time, harm to wildlife, etc)
- Suggests 5 sustainable alternatives, budget to premium
- Filter alternatives by price
- Switch between Amazon marketplaces (India, US, UK, Germany, Canada, Australia, Japan)

## Built with

- Google Gemini 2.0 Flash
- Cloudflare Workers + KV (free tier)
- Plain JS/HTML/CSS, no framework

## Note on security

The key used to be exposed in the frontend code. That key has been revoked. Nothing Gemini-related is in the browser or repo anymore - the only secret lives in Cloudflare.

---

Email - jayavarshinijayakumaran11@gmail.com

LinkedIn - https://www.linkedin.com/in/jayavarshini-jayakumaran

License - MIT
