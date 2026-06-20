// API CONFIG

// Ask visitor for their API key if config.js not present
if (typeof CONFIG === 'undefined') {
  const savedKey = localStorage.getItem('ecoswap_gemini_key');
  const key = savedKey || prompt(
    '🌿 EcoSwap AI needs a FREE Gemini API key to work.\n\n' +
    'Get yours in 30 seconds:\n' +
    '1. Go to aistudio.google.com\n' +
    '2. Sign in with Google → Get API Key\n' +
    '3. Paste it below'
  );
  if (key && key.trim()) {
    localStorage.setItem('ecoswap_gemini_key', key.trim());
    window.CONFIG = { GEMINI_API_KEY: key.trim() };
  } else {
    window.CONFIG = { GEMINI_API_KEY: '' };
  }
}

const API_KEY = (typeof CONFIG !== 'undefined' &&
                 CONFIG.GEMINI_API_KEY &&
                 CONFIG.GEMINI_API_KEY !== 'your_actual_gemini_api_key_here')
  ? CONFIG.GEMINI_API_KEY
  : null;

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

// STATE
let currentImageBase64 = null;
let currentImageMime   = 'image/jpeg';
let webcamStream       = null;
let activeTab          = 'upload';
let loadingMsgTimer    = null;
let lastAlternatives    = []; // cached for client-side price filtering, no re-call needed
let analysisRequestId   = 0;  // guards against stale async responses overwriting newer ones
let resultMarketplaceCode = 'IN'; // marketplace that generated the CURRENTLY DISPLAYED prices/links

// MARKETPLACE / CURRENCY CONFIG
const MARKETPLACES = {
  IN: { domain: 'amazon.in',  symbol: '₹', code: 'INR', label: 'India (₹ INR)' },
  US: { domain: 'amazon.com', symbol: '$', code: 'USD', label: 'United States ($ USD)' },
  UK: { domain: 'amazon.co.uk', symbol: '£', code: 'GBP', label: 'United Kingdom (£ GBP)' },
  DE: { domain: 'amazon.de', symbol: '€', code: 'EUR', label: 'Germany (€ EUR)' },
  CA: { domain: 'amazon.ca', symbol: 'CA$', code: 'CAD', label: 'Canada (CA$ CAD)' },
  AU: { domain: 'amazon.com.au', symbol: 'A$', code: 'AUD', label: 'Australia (A$ AUD)' },
  JP: { domain: 'amazon.co.jp', symbol: '¥', code: 'JPY', label: 'Japan (¥ JPY)' },
};

let currentMarketplace = 'IN'; 

function getMarketplace() {
  return MARKETPLACES[currentMarketplace] || MARKETPLACES.IN;
}

function getResultMarketplace() {
  return MARKETPLACES[resultMarketplaceCode] || MARKETPLACES.IN;
}

function setMarketplace(code) {
  if (MARKETPLACES[code]) {
    currentMarketplace = code;
    const sel = document.getElementById('marketplaceSelect');
    if (sel) sel.value = code;
  }
}

// INIT
document.addEventListener('DOMContentLoaded', () => {
  initFileUpload();
  updateAnalyzeBtn();
  initMarketplaceSelector();
  console.log('EcoSwap AI ready. API key loaded:', !!API_KEY);
});

function initMarketplaceSelector() {
  const sel = document.getElementById('marketplaceSelect');
  if (!sel) return;
  sel.innerHTML = Object.entries(MARKETPLACES)
    .map(([code, m]) => `<option value="${code}" ${code === currentMarketplace ? 'selected' : ''}>${m.label}</option>`)
    .join('');
  sel.addEventListener('change', async e => {
    currentMarketplace = e.target.value;

    // If results are already showing, prices/links are now stale for the new
    // marketplace. Re-run analysis against the stored image so prices, the
    // displayed currency, and the Amazon domain all stay in sync.
    const resultsVisible = !document.getElementById('resultsSection').classList.contains('hidden');
    if (resultsVisible && currentImageBase64) {
      showInfoToast(`Updating prices for ${getMarketplace().label}…`);
      await analyzeImage();
    }
  });
}

// TAB SWITCHING
function switchTab(tab) {
  activeTab = tab;

  document.getElementById('tabUpload').classList.toggle('active', tab === 'upload');
  document.getElementById('tabWebcam').classList.toggle('active', tab === 'webcam');
  document.getElementById('panelUpload').classList.toggle('hidden', tab !== 'upload');
  document.getElementById('panelWebcam').classList.toggle('hidden', tab !== 'webcam');

  if (tab !== 'webcam' && webcamStream) stopWebcam();

  currentImageBase64 = null;
  updateAnalyzeBtn();
}

// FILE UPLOAD 
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
  document.getElementById('fileInput').value             = '';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('dropZone').style.display      = 'block';
  updateAnalyzeBtn();
}

// WEBCAM
async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });

    const video       = document.getElementById('webcamVideo');
    const placeholder = document.getElementById('webcamPlaceholder');

    video.srcObject     = webcamStream;
    video.style.display = 'block';
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

  const capturedImg    = document.getElementById('capturedImg');
  const webcamCaptured = document.getElementById('webcamCaptured');

  capturedImg.src              = dataUrl;
  webcamCaptured.style.display = 'block';
  video.style.display          = 'none';

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

// ANALYZE 
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

  const requestId = ++analysisRequestId; // this request's identity
  const requestMarketplaceCode = currentMarketplace; // snapshot — survives if user flips the dropdown again mid-flight
  const market = MARKETPLACES[requestMarketplaceCode];

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
      "name": "Stasher Reusable Bag",
      "brand": "Stasher",
      "description": "Platinum silicone bags — microwave, dishwasher & freezer safe. Replaces 260 plastic bags/year.",
      "price": "${market.symbol}800–${market.symbol}1200",
      "priceValue": 1000,
      "imageCategory": "silicone_food_bag",
      "badge": "Best Value"
    },
    {
      "name": "Klean Kanteen Classic",
      "brand": "Klean Kanteen",
      "description": "BPA-free steel bottle, lifetime guarantee. Made from 90% post-consumer recycled steel.",
      "price": "${market.symbol}1500–${market.symbol}2200",
      "priceValue": 1800,
      "imageCategory": "steel_water_bottle",
      "badge": "Eco Certified"
    },
    {
      "name": "Hydro Flask Water Bottle",
      "brand": "Hydro Flask",
      "description": "Insulated stainless steel — keeps drinks cold 24h, hot 12h. Zero plastic.",
      "price": "${market.symbol}2500–${market.symbol}3500",
      "priceValue": 3000,
      "imageCategory": "insulated_flask",
      "badge": "Top Pick"
    },
    {
      "name": "S'well Stainless Steel Bottle",
      "brand": "S'well",
      "description": "Triple-walled insulation, leak-proof, no condensation. Wide range of colors.",
      "price": "${market.symbol}2800–${market.symbol}3800",
      "priceValue": 3300,
      "imageCategory": "steel_water_bottle",
      "badge": "Stylish Pick"
    },
    {
      "name": "Larq Self-Cleaning Bottle",
      "brand": "Larq",
      "description": "UV-C self-cleaning technology kills 99% of bacteria. Premium insulated steel.",
      "price": "${market.symbol}6000–${market.symbol}8000",
      "priceValue": 7000,
      "imageCategory": "insulated_flask",
      "badge": "Premium"
    }
  ]
}

If NO plastic is visible, return:
{"detected": false, "message": "No plastic detected in this image. Try a clearer photo of a plastic item."}

RULES:
- Tailor ALL fields to the actual plastic detected in the image
- Provide exactly 5 alternatives, covering a spread from budget to premium
- Match alternatives to the item type (bottle→reusable bottles, bag→reusable bags, etc.)
- ALL prices must be realistic for the ${market.label} marketplace, shown with the "${market.symbol}" symbol and currency code ${market.code}
- Every alternative MUST include "priceValue": a plain number (no symbol, no range) representing the approximate average/mid price in ${market.code}, used for sorting low to high
- Every alternative MUST include "imageCategory": pick the single closest match from this exact fixed list (use the value exactly as written, do not invent new ones): ${CATEGORY_KEYS}
- emotionalQuote must be vivid and human
- impactHeadline must be punchy and emotionally resonant
- Do NOT include a "url" field for alternatives — that is generated separately
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
      const errMsg = err.error?.message || `API error ${response.status}`;

      // Friendly quota error message
      if (response.status === 429 || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        showLoading(false);
        showQuotaError();
        return;
      }

      throw new Error(errMsg);
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

    // If a newer analysis was triggered (e.g. user changed marketplace again
    // while this request was in flight), discard this stale response.
    if (requestId !== analysisRequestId) return;

    if (!result.detected) {
      showError(result.message || 'No plastic detected. Try another image.');
      return;
    }

    renderResults(result, requestMarketplaceCode);

  } catch (err) {
    showLoading(false);
    if (requestId !== analysisRequestId) return; // stale — a newer request superseded this one
    console.error('Analysis error:', err);

    if (err.message.includes('quota') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('exceeded')) {
      showQuotaError();
    } else {
      showError('Analysis failed: ' + err.message);
    }
  }
}

// QUOTA ERROR MODAL 
function showQuotaError() {
  // Remove existing modal if any
  const existing = document.getElementById('quotaModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'quotaModal';
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(43,38,32,0.92);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
    padding: 1.5rem;
  `;
  modal.innerHTML = `
    <div style="
      background: #33302a;
      border: 1.5px solid #2d5a27;
      border-radius: 10px;
      padding: 2rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      font-family: 'Space Grotesk', sans-serif;
    ">
      <div style="font-size: 2.5rem; margin-bottom: 1rem;">⚠️</div>
      <h2 style="color: #e8dcc8; font-size: 1.3rem; margin-bottom: 0.6rem;">Gemini API Quota Exceeded</h2>
      <p style="color: #b8a48a; font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.5rem;">
        Your free Gemini API key has hit its daily or per-minute limit.<br><br>
        <strong style="color:#e8dcc8;">To fix this, do one of the following:</strong>
      </p>
      <div style="text-align:left; display:flex; flex-direction:column; gap:0.8rem; margin-bottom:1.5rem;">
        <div style="background:#3a362f; border:1.5px solid #2d5a27; border-radius:6px; padding:0.9rem;">
          <div style="color:#5aad4e; font-size:0.8rem; font-family:'Space Mono',monospace; margin-bottom:0.3rem;">OPTION 1 — WAIT</div>
          <div style="color:#e8dcc8; font-size:0.88rem;">Free tier resets every minute (15 RPM) and daily (1,500/day). Wait a minute and try again.</div>
        </div>
        <div style="background:#3a362f; border:1.5px solid #2d5a27; border-radius:6px; padding:0.9rem;">
          <div style="color:#5aad4e; font-size:0.8rem; font-family:'Space Mono',monospace; margin-bottom:0.3rem;">OPTION 2 — NEW API KEY</div>
          <div style="color:#e8dcc8; font-size:0.88rem;">Generate a fresh free key at <a href="https://aistudio.google.com" target="_blank" style="color:#5aad4e;">aistudio.google.com</a> and update <code style="background:#2b2620;padding:1px 5px;border-radius:3px;">js/config.js</code>.</div>
        </div>
        <div style="background:#3a362f; border:1.5px solid #2d5a27; border-radius:6px; padding:0.9rem;">
          <div style="color:#5aad4e; font-size:0.8rem; font-family:'Space Mono',monospace; margin-bottom:0.3rem;">OPTION 3 — UPGRADE</div>
          <div style="color:#e8dcc8; font-size:0.88rem;">Enable billing in Google AI Studio for higher limits (pay-per-use, very cheap).</div>
        </div>
      </div>
      <button onclick="document.getElementById('quotaModal').remove()" style="
        background: #2d5a27;
        border: 1.5px solid #5aad4e;
        color: #e8dcc8;
        padding: 0.65rem 1.8rem;
        border-radius: 6px;
        font-family: 'Space Grotesk', sans-serif;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
      ">Got it, I'll fix it</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// RENDER RESULTS
function renderResults(r, marketplaceCode) {
  resultMarketplaceCode = marketplaceCode || currentMarketplace; // pin the marketplace these results belong to
  document.getElementById('inputSection').classList.add('hidden');
  document.getElementById('resultsSection').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

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

  lastAlternatives = r.alternatives || [];
  renderAlternatives(lastAlternatives);
}

// TIMELINE
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

// PRICE FILTER 
let priceFilterMin = null;
let priceFilterMax = null;

function renderPriceFilterBar(alts) {
  const bar = document.getElementById('priceFilterBar');
  if (!bar) return;

  if (!alts.length) {
    bar.innerHTML = '';
    return;
  }

  const values = alts.map(extractPriceValue).filter(v => isFinite(v));
  const lo = Math.floor(Math.min(...values));
  const hi = Math.ceil(Math.max(...values));
  const sym = getResultMarketplace().symbol;

  if (priceFilterMin === null) priceFilterMin = lo;
  if (priceFilterMax === null) priceFilterMax = hi;

  bar.innerHTML = `
    <div class="price-filter-row">
      <span class="price-filter-label">Filter by price</span>
      <div class="price-filter-inputs">
        <label>
          Min
          <input type="number" id="priceMinInput" value="${priceFilterMin}" min="${lo}" max="${hi}" />
        </label>
        <span class="price-filter-sym">${sym}</span>
        <label>
          Max
          <input type="number" id="priceMaxInput" value="${priceFilterMax}" min="${lo}" max="${hi}" />
        </label>
        <span class="price-filter-sym">${sym}</span>
        <button class="btn-secondary" id="priceFilterReset" type="button">Reset</button>
      </div>
    </div>
  `;

  document.getElementById('priceMinInput').addEventListener('input', e => {
    priceFilterMin = e.target.value === '' ? lo : Number(e.target.value);
    filterAndRenderCards();
  });
  document.getElementById('priceMaxInput').addEventListener('input', e => {
    priceFilterMax = e.target.value === '' ? hi : Number(e.target.value);
    filterAndRenderCards();
  });
  document.getElementById('priceFilterReset').addEventListener('click', () => {
    priceFilterMin = lo;
    priceFilterMax = hi;
    renderPriceFilterBar(lastAlternatives);
    filterAndRenderCards();
  });
}

function filterAndRenderCards() {
  const min = priceFilterMin ?? -Infinity;
  const max = priceFilterMax ?? Infinity;
  const filtered = lastAlternatives.filter(a => {
    const v = extractPriceValue(a);
    return v >= min && v <= max;
  });
  renderAlternativeCards(filtered);
}

// PRODUCT VISUALS (hand-built SVG icons)
const CATEGORY_ICONS = {
  steel_water_bottle: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="40" y="8" width="20" height="10" rx="2" fill="var(--beige-mid)"/>
    <rect x="36" y="16" width="28" height="8" rx="2" fill="var(--green-bright)"/>
    <path d="M32 24 L32 36 Q32 40 36 42 L36 84 Q36 90 42 90 L58 90 Q64 90 64 84 L64 42 Q68 40 68 36 L68 24 Z" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <rect x="38" y="50" width="24" height="14" rx="2" fill="var(--green-glow)"/>
  </svg>`,
  insulated_flask: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="42" y="6" width="16" height="8" rx="2" fill="var(--beige-mid)"/>
    <path d="M30 14 L70 14 L66 30 L66 86 Q66 92 60 92 L40 92 Q34 92 34 86 L34 30 Z" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <rect x="38" y="34" width="24" height="40" rx="3" fill="var(--green-glow)"/>
    <circle cx="50" cy="54" r="6" fill="none" stroke="var(--green-bright)" stroke-width="1.5"/>
  </svg>`,
  glass_water_bottle: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="42" y="10" width="16" height="12" rx="2" fill="var(--beige-mid)"/>
    <path d="M40 22 Q40 28 36 34 L36 84 Q36 90 42 90 L58 90 Q64 90 64 84 L64 34 Q60 28 60 22 Z" fill="none" stroke="var(--green-bright)" stroke-width="2.5"/>
    <rect x="40" y="50" width="20" height="30" rx="2" fill="var(--green-glow)"/>
  </svg>`,
  silicone_food_bag: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="22" y="26" width="56" height="56" rx="10" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <path d="M30 26 Q30 14 50 14 Q70 14 70 26" fill="none" stroke="var(--beige-mid)" stroke-width="3"/>
    <rect x="32" y="42" width="36" height="30" rx="4" fill="var(--green-glow)"/>
    <line x1="22" y1="52" x2="78" y2="52" stroke="var(--green-bright)" stroke-width="1.5" stroke-dasharray="3,3"/>
  </svg>`,
  cotton_tote_bag: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M34 32 Q34 16 50 16 Q66 16 66 32" fill="none" stroke="var(--beige-mid)" stroke-width="4"/>
    <rect x="20" y="32" width="60" height="56" rx="4" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <rect x="30" y="46" width="40" height="32" rx="3" fill="var(--green-glow)"/>
  </svg>`,
  mesh_produce_bag: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 18 Q30 10 50 10 Q70 10 70 18" fill="none" stroke="var(--beige-mid)" stroke-width="3"/>
    <path d="M26 18 L74 18 L66 86 Q64 90 60 90 L40 90 Q36 90 34 86 Z" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <g stroke="var(--green-bright)" stroke-width="1" opacity="0.5">
      <line x1="30" y1="30" x2="70" y2="30"/><line x1="31" y1="42" x2="69" y2="42"/>
      <line x1="32" y1="54" x2="68" y2="54"/><line x1="33" y1="66" x2="67" y2="66"/>
      <line x1="38" y1="20" x2="46" y2="86"/><line x1="50" y1="20" x2="50" y2="88"/><line x1="62" y1="20" x2="54" y2="86"/>
    </g>
  </svg>`,
  beeswax_food_wrap: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="14" y="14" width="72" height="72" rx="6" fill="var(--bg-input)" stroke="var(--amber)" stroke-width="2.5" transform="rotate(-4 50 50)"/>
    <path d="M30 50 Q40 38 50 50 Q60 62 70 50" fill="none" stroke="var(--amber)" stroke-width="2.5" transform="rotate(-4 50 50)"/>
    <circle cx="38" cy="42" r="3" fill="var(--amber)" opacity="0.6" transform="rotate(-4 50 50)"/>
    <circle cx="62" cy="58" r="3" fill="var(--amber)" opacity="0.6" transform="rotate(-4 50 50)"/>
  </svg>`,
  bamboo_cutlery_set: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="18" y="14" width="9" height="62" rx="3" fill="var(--beige-mid)"/>
    <path d="M18 14 L18 30 M22.5 14 L22.5 30 M27 14 L27 30" stroke="var(--bg-input)" stroke-width="1.5"/>
    <rect x="45" y="14" width="9" height="62" rx="3" fill="var(--beige-mid)"/>
    <ellipse cx="49.5" cy="20" rx="9" ry="10" fill="var(--beige-mid)"/>
    <path d="M72 14 Q82 14 82 28 Q82 40 72 44 L72 76" fill="none" stroke="var(--beige-mid)" stroke-width="9" stroke-linecap="round"/>
  </svg>`,
  glass_food_container: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="18" width="60" height="14" rx="4" fill="var(--green-bright)"/>
    <rect x="22" y="34" width="56" height="48" rx="6" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <rect x="30" y="44" width="40" height="28" rx="3" fill="var(--green-glow)"/>
  </svg>`,
  reusable_coffee_cup: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M32 28 L68 28 L64 86 Q64 90 60 90 L40 90 Q36 90 36 86 Z" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <ellipse cx="50" cy="28" rx="18" ry="6" fill="var(--green-glow)" stroke="var(--green-bright)" stroke-width="2"/>
    <path d="M68 42 Q82 42 82 56 Q82 68 68 68" fill="none" stroke="var(--green-bright)" stroke-width="3"/>
    <rect x="44" y="10" width="12" height="14" rx="3" fill="var(--beige-mid)"/>
  </svg>`,
  metal_straw_set: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <line x1="30" y1="10" x2="22" y2="90" stroke="var(--green-bright)" stroke-width="5" stroke-linecap="round"/>
    <line x1="50" y1="10" x2="46" y2="90" stroke="var(--beige-mid)" stroke-width="5" stroke-linecap="round"/>
    <line x1="70" y1="10" x2="70" y2="90" stroke="var(--green-bright)" stroke-width="5" stroke-linecap="round"/>
    <rect x="14" y="58" width="72" height="14" rx="7" fill="var(--bg-input)" stroke="var(--border-mid)" stroke-width="1.5"/>
  </svg>`,
  reusable_shopping_bag: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 30 Q30 12 50 12 Q70 12 70 30" fill="none" stroke="var(--beige-mid)" stroke-width="4"/>
    <path d="M18 30 L82 30 L76 88 L24 88 Z" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <path d="M30 50 L70 50" stroke="var(--green-bright)" stroke-width="2" opacity="0.5"/>
    <path d="M27 60 L73 60" stroke="var(--green-bright)" stroke-width="2" opacity="0.5"/>
  </svg>`,
};

const CATEGORY_KEYS = Object.keys(CATEGORY_ICONS).join(', ');

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || null;
}

function altCardImageId(idx) {
  return `altImg_${idx}`;
}

function loadAlternativeImages(sorted) {
  sorted.forEach((alt, idx) => {
    const wrap = document.getElementById(altCardImageId(idx));
    if (!wrap) return;
    const icon = getCategoryIcon(alt.imageCategory);
    if (icon) {
      wrap.innerHTML = `<div class="alt-img-icon">${icon}</div>`;
    } else {
      // Unrecognized/missing category — fallback
      wrap.innerHTML = `<div class="alt-img-fallback">🌿</div>`;
    }
  });
}

// ALTERNATIVES
function extractPriceValue(alt) {
  // Prefer the AI-provided numeric priceValue; fall back to parsing the price string.
  if (typeof alt.priceValue === 'number' && !isNaN(alt.priceValue)) {
    return alt.priceValue;
  }
  const nums = (alt.price || '').match(/[\d.]+/g);
  if (!nums) return Infinity;
  const vals = nums.map(Number);
  return vals.reduce((a, b) => a + b, 0) / vals.length; // average if range
}

function sortAlternativesByPrice(alts) {
  return [...alts].sort((a, b) => extractPriceValue(a) - extractPriceValue(b));
}

function buildAmazonSearchUrl(alt) {
  // Build the search query from name + brand for the most relevant results.
  const query = [alt.name, alt.brand].filter(Boolean).join(' ');
  const encoded = encodeURIComponent(query.trim());
  const domain = getResultMarketplace().domain; // must match the marketplace these prices came from
  return `https://www.${domain}/s?k=${encoded}`;
}

function renderAlternatives(alts) {
  priceFilterMin = null; 
  priceFilterMax = null;
  renderPriceFilterBar(alts);
  filterAndRenderCards();
}

function renderAlternativeCards(alts) {
  const sorted = sortAlternativesByPrice(alts);
  const grid = document.getElementById('alternativesGrid');

  if (!sorted.length) {
    grid.innerHTML = `<p class="alt-empty">No alternatives in this price range. Try widening the filter.</p>`;
    return;
  }

  grid.innerHTML = sorted.map((a, idx) => `
    <div class="alt-card">
      <div class="alt-img-wrap" id="${altCardImageId(idx)}">
        <div class="alt-img-loading">
          <span class="spinner" style="width:22px;height:22px;"></span>
        </div>
        ${a.badge ? `<div class="alt-badge">${a.badge}</div>` : ''}
      </div>
      <div class="alt-body">
        <div class="alt-name">${a.name}</div>
        <div class="alt-brand">${a.brand}</div>
        <div class="alt-desc">${a.description}</div>
        <div class="alt-price">${a.price}</div>
      </div>
      <a class="alt-link" href="${buildAmazonSearchUrl(a)}" target="_blank" rel="noopener noreferrer">
        Shop on ${getResultMarketplace().domain} →
      </a>
    </div>
  `).join('');

  loadAlternativeImages(sorted);
}

// LOADING
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

// ERROR TOAST
function showError(msg) {
  const existing = document.querySelector('.error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className   = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

// INFO TOAST
function showInfoToast(msg) {
  const existing = document.querySelector('.info-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className   = 'error-toast info-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// RESET
function resetApp() {
  currentImageBase64 = null;
  stopWebcam();
  lastAlternatives = [];
  priceFilterMin = null;
  priceFilterMax = null;

  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('inputSection').classList.remove('hidden');

  clearUpload();

  const webcamCaptured    = document.getElementById('webcamCaptured');
  const webcamVideo       = document.getElementById('webcamVideo');
  const webcamPlaceholder = document.getElementById('webcamPlaceholder');

  webcamCaptured.style.display = 'none';
  webcamVideo.style.display    = 'none';
  if (webcamPlaceholder) webcamPlaceholder.style.display = 'block';

  document.getElementById('startCamBtn').classList.remove('hidden');
  document.getElementById('captureBtn').classList.add('hidden');
  document.getElementById('retakeBtn').classList.add('hidden');

  document.getElementById('confBar').style.width = '0%';

  switchTab('upload');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
