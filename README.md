# EcoSwap AI 🌿
### Scan. Understand. Choose Better.

Detects plastic from photos or webcam, shows environmental impact with emotional storytelling, and suggests sustainable alternatives — powered by **Google Gemini 1.5 Flash (FREE)**.

---

## ⚡ Quick Start (2 steps)

### Step 1 — Get your FREE Gemini API key
1. Go to **[aistudio.google.com](https://aistudio.google.com)**
2. Sign in with Google → click **"Get API Key"**
3. Copy your key

> ✅ No credit card needed. Free tier = **1,500 requests/day** forever.

### Step 2 — Add it to the app
Open `js/app.js` and replace **line 8**:

```js
const API_KEY = 'YOUR_GEMINI_API_KEY';
```

---

## ▶ Run the App

**Option A — Open directly:**
Double-click `index.html` in your browser.

**Option B — Local server (needed for webcam on some browsers):**
```bash
# Python
python3 -m http.server 8080
# then open http://localhost:8080

## 📁 Project Structure

```
plastiq/
├── index.html         Single-page app
├── css/
│   └── style.css      Dark beige + green border theme
├── js/
│   └── app.js         All logic (webcam, upload, Gemini AI, render)
└── README.md
```

---

## ✨ Features

| Feature | Details |
|---|---|
| 📁 Upload Image | Drag & drop or click — JPG, PNG, WEBP |
| 📷 Webcam | Live capture with retake option |
| 🧠 AI Detection | Plastic type, code, recyclability, toxicity, confidence % |
| 🌍 Impact Story | Animated decomposition timeline + harm stats + affected animal |
| 💬 Emotional Quote | AI-generated devastating truth about that specific plastic |
| 🛒 Alternatives | 3 eco products matched to item type, with Amazon links |

---

## 🚀 Deploy for Free

Push to GitHub → connect to [Vercel](https://vercel.com) or [Netlify](https://netlify.com) → deploy as static site. No build step needed.

> ⚠️ For public deployment, move the API call to a serverless function to protect your API key.

---

## 🔧 Customization

| What | Where |
|---|---|
| API Key | `js/app.js` line 8 |
| Colors | `css/style.css` `:root` variables |
| AI Prompt | `analyzeImage()` function in `js/app.js` |
| Model | Change `gemini-1.5-flash` to `gemini-1.5-pro` for better accuracy |

---

Built with ♻️ using Vanilla JS + Google Gemini AI
