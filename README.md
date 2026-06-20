# EcoSwap AI 🌿
### Scan. Understand. Choose Better.

Detects plastic from photos or webcam, shows environmental impact with emotional storytelling, and suggests sustainable alternatives — powered by **Google Gemini (FREE)**.

<p align="center">
  <a href="https://www.youtube.com/watch?v=YOUR_VIDEO_ID">
    <img src="https://img.youtube.com/vi/YOUR_VIDEO_ID/maxresdefault.jpg" alt="EcoSwap AI demo video preview" width="600" />
    <br />
    <img src="https://img.shields.io/badge/▶-Watch%20Demo%20on%20YouTube-red?style=for-the-badge&logo=youtube" alt="Watch Now" />
  </a>
</p>

---

## ⚡ Quick Start

### Step 1 — Get your FREE Gemini API key
1. Go to **[aistudio.google.com](https://aistudio.google.com)**
2. Sign in with Google → click **"Get API Key"**
3. Copy your key

> ✅ No credit card needed. Free tier = **1,500 requests/day** forever.

### Step 2 — Add it to the app
```bash
cp js/config.example.js js/config.js
```
Then open `js/config.js` and replace the placeholder with your key:
```js
const CONFIG = {
  GEMINI_API_KEY: 'your_actual_gemini_api_key_here'
};
```

---

## ▶ Run the App

Double-click `index.html` in your browser.

> 💡 For webcam support on some browsers, run a local server:
> ```bash
> python3 -m http.server 8080
> # then open http://localhost:8080
> ```

## 📁 Project Structure

```
ecoswap/
├── index.html              Single-page app
├── css/
│   └── style.css           Dark beige + green border theme
├── js/
│   ├── app.js               All logic (webcam, upload, Gemini AI, render)
│   └── config.example.js    Copy → config.js and add your API keys
├── .env                     Reference for environment variables
├── .gitignore
└── README.md
```

> ⚠️ `js/config.js` is in `.gitignore` — your API keys will never be committed.

---

## ✨ Features

| Feature | Details |
|---|---|
| 📁 Upload Image | Drag & drop or click — JPG, PNG, WEBP |
| 📷 Webcam | Live capture with retake option |
| 🧠 AI Detection | Plastic type, code, recyclability, toxicity, confidence % |
| 🌍 Impact Story | Animated decomposition timeline + harm stats + affected animal |
| 💬 Emotional Quote | AI-generated devastating truth about that specific plastic |
| 🛒 Sustainable Alternatives | 5 eco products, budget → premium, with category icons |
| 💰 Price Filter | Filter alternatives by min/max price, sorted low to high |
| 🌐 Multi-Marketplace | Switch between Amazon India, US, UK, Germany, Canada, Australia, Japan — prices and links update together |

---

## 🛠️ Built With

- **Google Gemini 2.5 Flash Lite** — multimodal plastic detection & environmental analysis
- **Vanilla JavaScript, HTML5, CSS3** — no framework, no build step
- **MediaDevices API** — webcam capture

---

♻️ Choose better. Live greener.

---
📧 **Email** — [jayavarshinijayakumaran11@gmail.com](mailto:jayavarshinijayakumaran11@gmail.com)

🙌 **Connect** — [LinkedIn: Jayavarshini Jayakumaran](https://www.linkedin.com/in/jayavarshini-jayakumaran)

📄 **License** — [MIT](LICENSE)

<p align="center"><b>Finish what you started 💻</b></p>
