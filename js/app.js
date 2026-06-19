// ─── API CONFIG ───────────────────────────────
// Load from js/config.js (gitignored). Copy config.example.js → config.js and add your key.
const API_KEY = (typeof CONFIG !== 'undefined' &&
                 CONFIG.GEMINI_API_KEY &&
                 CONFIG.GEMINI_API_KEY !== 'your_actual_gemini_api_key_here')
  ? CONFIG.GEMINI_API_KEY
  : null;

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ─── STATE ────────────────────────────────────
let currentImageBase64 = null;
let currentImageMime   = 'image/jpeg';
let webcamStream       = null;
let activeTab          = 'upload';
let loadingMsgTimer    = null;

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFileUpload();
  updateAnalyzeBtn();
  console.log('EcoSwap AI ready. API key loaded:', !!API_KEY);
});

// ─── TAB SWITCHING ────────────────────────────
function switchTab(tab) {
  activeTab = tab;

  document.getElementById('tabUpload').classList.toggle('active', tab === 'upload');
  document.getElementById('tabWebcam').classList.toggle('active', tab === 'webcam');
  document.getElementById('panelUpload').classList.toggle('hidden', tab !== 'upload');
  document.getElementById('panelWebcam').classList.toggle('hidden', tab !== 'webcam');

  if (tab !== 'webcam' && webcamStream) stopWebcam();

  // Reset image when switching tabs
  currentImageBase64 = null;
  updateAnalyzeBtn();
}

// ─── FILE UPLOAD ──────────────────────────────
function initFileUpload() {
  const fileInput = document.getElementById('fileInput');
  const dropZone  = document.getElementById('dropZone');

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFileSelected(file);
  });

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragging');
  });

  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileSelected(file);
  });
}

function handleFileSelected(file) {
  currentImageMime = file.type || 'image/jpeg';
  const reader = new FileReader();
  reader.onload = e => {
    const result = e.target.result;
    currentImageBase64 = result.split(',')[1];

    const uploadedImg   = document.getElementById('uploadedImg');
    const uploadPreview = document.getElementById('uploadPreview');
    const dropZone      = document.getElementById('dropZone');

    uploadedImg.src             = result;
    uploadPreview.style.display = 'block';
    dropZone.style.display      = 'none';

    updateAnalyzeBtn();
  };
  reader.readAsDataURL(file);
}

function clearUpload() {
  currentImageBase64 = null;
  document.getElementById('fileInput').value          = '';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('dropZone').style.display      = 'block';
  updateAnalyzeBtn();
}

// ─── WEBCAM ───────────────────────────────────
async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });

    const video       = document.getElementById('webcamVideo');
    const placeholder = document.getElementById('webcamPlaceholder');

    video.srcObject      = webcamStream;
    video.style.display  = 'block';
    if (placeholder) placeholder.style.display = 'none';

    document.getElementById('startCamBtn').classList.add('hidden');
    document.getElementById('captureBtn').classList.remove('hidden');
  } catch (err) {
    showError('Camera access denied. Please allow camera permissions and try again.');
  }
}

function captureFrame() {
  const video  = document.getElementById('webcamVideo');
  const canvas = document.getElementById('webcamCanvas');

  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  const dataUrl          = canvas.toDataURL('image/jpeg', 0.92);
  currentImageBase64     = dataUrl.split(',')[1];
  currentImageMime       = 'image/jpeg';

  const capturedImg      = document.getElementById('capturedImg');
  const webcamCaptured   = document.getElementById('webcamCaptured');

  capturedImg.src                  = dataUrl;
  webcamCaptured.style.display     = 'block';
  video.style.display              = 'none';

  stopWebcam();

  document.getElementById('captureBtn').classList.add('hidden');
  document.getElementById('retakeBtn').classList.remove('hidden');

  updateAnalyzeBtn();
}

function retakePhoto() {
  const webcamCaptured = document.getElementById('webcamCaptured');
  webcamCaptured.style.display = 'none';

  document.getElementById('retakeBtn').classList.add('hidden');

  currentImageBase64 = null;
  updateAnalyzeBtn();

  startWebcam();
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
}

function updateAnalyzeBtn() {
  const btn = document.getElementById('analyzeBtn');
  if (btn) btn.disabled = !currentImageBase64;
}

// ─── ANALYZE ──────────────────────────────────
async function analyzeImage() {
  if (!currentImageBase64) {
    showError('Please upload or capture an image first.');
    return;
  }

  if (!API_KEY) {
    showError('API key not set. Copy js/config.example.js → js/config.js and add your Gemini API key. Get one free at aistudio.google.com');
    return;
  }

  showLoading(true);

  const prompt = `You are an expert environmental scientist and material analyst. Analyze this image and detect any plastic material present.

Respond ONLY with a valid JSON object — no markdown, no backticks, no explanation — just raw JSON:

{
  "detected": true,
  "plasticCode": "1",
  "plasticName": "PET",
  "plasticFullName": "Polyethylene Terephthalate",
  "confidence": 87,
  "color": "Clear/Transparent",
  "condition": "Good",
  "estimatedAge": "< 1 year",
  "recyclingCode": "#1",
  "globalUsagePercent": "30",
  "decompositionYears": 450,
  "recyclable": "Widely Recyclable",
  "toxicity": "Low",
  "commonUses": "Water bottles, food containers, polyester fabric",
  "impactHeadline": "This bottle will outlive 18 generations of your family.",
  "timelineEvents": [
    { "label": "You die", "year": 80 },
    { "label": "Plastic halfway", "year": 225 },
    { "label": "Fully gone", "year": 450 }
  ],
  "harmStats": [
    { "icon": "🐟", "stat": "1M+", "desc": "marine animals killed yearly by this plastic type" },
    { "icon": "🌊", "stat": "8M tons", "desc": "plastic enters oceans every year" },
    { "icon": "🧪", "stat": "BPA risk", "desc": "chemicals leach into food & water" },
    { "icon": "♻️", "stat": "9%", "desc": "of all plastic ever made has been recycled" }
  ],
  "affectedAnimal": {
    "icon": "🐢",
    "name": "Sea Turtle",
    "desc": "Mistakes plastic bags and bottles for jellyfish. Over 52% of sea turtles have ingested plastic."
  },
  "emotionalQuote": "If you dropped this bottle on the day dinosaurs went extinct, it would still be here today. Every piece of plastic ever made still exists somewhere on Earth.",
  "alternatives": [
    {
      "name": "Hydro Flask Water Bottle",
      "brand": "Hydro Flask",
      "description": "Insulated stainless steel — keeps drinks cold 24h, hot 12h. Zero plastic.",
      "price": "~$30–$50",
      "emoji": "🥤",
      "badge": "Top Pick",
      "url": "https://www.amazon.com/s?k=hydro+flask+water+bottle+stainless+steel"
    },
    {
      "name": "Klean Kanteen Classic",
      "brand": "Klean Kanteen",
      "description": "BPA-free steel bottle, lifetime guarantee. Made from 90% post-consumer recycled steel.",
      "price": "~$20–$35",
      "emoji": "♻️",
      "badge": "Eco Certified",
      "url": "https://www.amazon.com/s?k=klean+kanteen+stainless+bottle"
    },
    {
      "name": "Stasher Reusable Bag",
      "brand": "Stasher",
      "description": "Platinum silicone bags — microwave, dishwasher & freezer safe. Replaces 260 plastic bags/year.",
      "price": "~$10–$20",
      "emoji": "🌿",
      "badge": "Best Value",
      "url": "https://www.amazon.com/s?k=stasher+reusable+silicone+bags"
    }
  ]
}

If NO plastic is visible, return:
{"detected": false, "message": "No plastic detected in this image. Try a clearer photo of a plastic item."}

RULES:
- Tailor ALL fields to the actual plastic detected in the image
- Match alternatives to the item type (bottle→reusable bottles, bag→reusable bags, etc.)
- emotionalQuote must be vivid and human
- impactHeadline must be punchy and emotionally resonant
- Return ONLY raw JSON, nothing else`;

  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: currentImageMime, data: currentImageBase64 } },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error('Could not parse AI response. Please try again.');
    }

    showLoading(false);

    if (!result.detected) {
      showError(result.message || 'No plastic detected. Try another image.');
      return;
    }

    renderResults(result);

  } catch (err) {
    showLoading(false);
    console.error('Analysis error:', err);
    showError('Analysis failed: ' + err.message);
  }
}

// ─── RENDER RESULTS ───────────────────────────
function renderResults(r) {
  document.getElementById('inputSection').classList.add('hidden');
  document.getElementById('resultsSection').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Detection card
  document.getElementById('plasticCode').textContent     = r.recyclingCode || r.plasticCode || '?';
  document.getElementById('plasticName').textContent     = r.plasticName    || 'Unknown';
  document.getElementById('plasticFullName').textContent = r.plasticFullName || '';

  const confPct = parseInt(r.confidence) || 80;
  setTimeout(() => {
    document.getElementById('confBar').style.width = confPct + '%';
  }, 100);
  document.getElementById('confPct').textContent = confPct + '%';

  const recyclableClass = r.recyclable?.toLowerCase().includes('wide') ? 'safe'
    : r.recyclable?.toLowerCase().includes('not') ? 'danger' : 'warn';

  const toxicityClass = r.toxicity?.toLowerCase().includes('high') ? 'danger'
    : r.toxicity?.toLowerCase().includes('low') ? 'safe' : 'warn';

  document.getElementById('detailsGrid').innerHTML = `
    <div class="detail-item">
      <div class="detail-label">Decomposition</div>
      <div class="detail-value danger">${r.decompositionYears} years</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Global Usage</div>
      <div class="detail-value warn">${r.globalUsagePercent}% of all plastics</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Recyclable</div>
      <div class="detail-value ${recyclableClass}">${r.recyclable}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Toxicity</div>
      <div class="detail-value ${toxicityClass}">${r.toxicity}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Color</div>
      <div class="detail-value">${r.color || '—'}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Common Uses</div>
      <div class="detail-value" style="font-size:0.82rem">${r.commonUses || '—'}</div>
    </div>
  `;

  // Impact card
  document.getElementById('impactHeadline').textContent = r.impactHeadline || '';
  renderTimeline(r.decompositionYears, r.timelineEvents || []);

  if (r.harmStats?.length) {
    document.getElementById('harmGrid').innerHTML = r.harmStats.map(h => `
      <div class="harm-item">
        <div class="harm-icon">${h.icon}</div>
        <div class="harm-stat">${h.stat}</div>
        <div class="harm-desc">${h.desc}</div>
      </div>
    `).join('');
  }

  if (r.affectedAnimal) {
    document.getElementById('animalIcon').textContent = r.affectedAnimal.icon;
    document.getElementById('animalName').textContent = r.affectedAnimal.name;
    document.getElementById('animalDesc').textContent = r.affectedAnimal.desc;
  }

  document.getElementById('emotionalQuote').textContent = r.emotionalQuote || '';

  // Alternatives
  renderAlternatives(r.alternatives || []);
}

// ─── TIMELINE ─────────────────────────────────
function renderTimeline(years, events) {
  const track = document.getElementById('timelineTrack');

  const oldFill = track.querySelector('.timeline-fill');
  if (oldFill) oldFill.remove();

  const fill = document.createElement('div');
  fill.className   = 'timeline-fill';
  fill.style.width = '0%';
  track.insertBefore(fill, track.firstChild);

  const maxYears = Math.max(years, ...events.map(e => e.year), 100);

  setTimeout(() => {
    fill.style.width = (years / maxYears * 100) + '%';
  }, 200);

  const markers = document.getElementById('timelineMarkers');
  markers.innerHTML = '';

  [{ label: 'Today', year: 0 }, ...events].forEach(ev => {
    const pct = ev.year === 0 ? 2 : (ev.year / maxYears * 100);
    const pin = document.createElement('div');
    pin.className  = 'timeline-pin';
    pin.style.left = Math.min(pct, 96) + '%';
    pin.innerHTML  = `
      <div class="timeline-pin-dot"></div>
      <div class="timeline-pin-label">
        ${ev.year === 0 ? 'Now' : ev.year + 'y'}<br>
        <span style="font-size:0.6rem;opacity:0.8">${ev.label}</span>
      </div>
    `;
    markers.appendChild(pin);
  });

  document.getElementById('timelineLegend').innerHTML = `
    <div class="tl-leg-item"><div class="tl-leg-dot" style="background:#2d5a27"></div> Early stage</div>
    <div class="tl-leg-item"><div class="tl-leg-dot" style="background:#d4a017"></div> Mid decomp</div>
    <div class="tl-leg-item"><div class="tl-leg-dot" style="background:#c0392b"></div> ${years}+ years total</div>
  `;
}

// ─── ALTERNATIVES ─────────────────────────────
function renderAlternatives(alts) {
  document.getElementById('alternativesGrid').innerHTML = alts.map(a => `
    <div class="alt-card">
      <div class="alt-img-wrap">
        <div class="alt-img-placeholder">${a.emoji || '🌿'}</div>
        ${a.badge ? `<div class="alt-badge">${a.badge}</div>` : ''}
      </div>
      <div class="alt-body">
        <div class="alt-name">${a.name}</div>
        <div class="alt-brand">${a.brand}</div>
        <div class="alt-desc">${a.description}</div>
        <div class="alt-price">${a.price}</div>
      </div>
      <a class="alt-link" href="${a.url}" target="_blank" rel="noopener noreferrer">
        Shop on Amazon →
      </a>
    </div>
  `).join('');
}

// ─── LOADING ──────────────────────────────────
function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (show) {
    overlay.classList.remove('hidden');
    animateLoadingMessages();
  } else {
    overlay.classList.add('hidden');
    clearInterval(loadingMsgTimer);
    ['lm1','lm2','lm3','lm4'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = 'lm';
    });
  }
}

function animateLoadingMessages() {
  const ids = ['lm1','lm2','lm3','lm4'];
  let current = 0;
  const first = document.getElementById(ids[0]);
  if (first) first.className = 'lm active';

  loadingMsgTimer = setInterval(() => {
    const cur = document.getElementById(ids[current]);
    if (cur) cur.className = 'lm done';
    current++;
    if (current < ids.length) {
      const next = document.getElementById(ids[current]);
      if (next) next.className = 'lm active';
    } else {
      clearInterval(loadingMsgTimer);
    }
  }, 1800);
}

// ─── ERROR TOAST ──────────────────────────────
function showError(msg) {
  // Remove any existing toast first
  const existing = document.querySelector('.error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className   = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

// ─── RESET ────────────────────────────────────
function resetApp() {
  currentImageBase64 = null;
  stopWebcam();

  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('inputSection').classList.remove('hidden');

  clearUpload();

  const webcamCaptured  = document.getElementById('webcamCaptured');
  const webcamVideo     = document.getElementById('webcamVideo');
  const webcamPlaceholder = document.getElementById('webcamPlaceholder');

  webcamCaptured.style.display = 'none';
  webcamVideo.style.display    = 'none';
  if (webcamPlaceholder) webcamPlaceholder.style.display = 'block';

  document.getElementById('startCamBtn').classList.remove('hidden');
  document.getElementById('captureBtn').classList.add('hidden');
  document.getElementById('retakeBtn').classList.add('hidden');

  // Reset confidence bar
  document.getElementById('confBar').style.width = '0%';

  switchTab('upload');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
