/* ============================================
   ECOSWAP AI — app.js
   Gemini 2.0 Flash via Google AI Studio (FREE)
   Improved accuracy: strict 2-phase detection
   Amazon links: precise per-product search query
   ============================================ */

// ─── CONFIG ───────────────────────────────────
if (typeof CONFIG === 'undefined') {
  const savedKey = localStorage.getItem('ecoswap_gemini_key');
  const key = savedKey || prompt(
    '🌿 EcoSwap AI needs a FREE Gemini API key.\n\n' +
    'Get yours FREE in 30 seconds:\n' +
    '1. Go to aistudio.google.com\n' +
    '2. Sign in with Google → Get API Key\n' +
    '3. Paste it below\n\n' +
    '(Your key is saved in your browser — you only do this once)'
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
  ? CONFIG.GEMINI_API_KEY : null;

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// ─── STATE ────────────────────────────────────
let currentImageBase64 = null;
let currentImageMime   = 'image/jpeg';
let webcamStream       = null;
let activeTab          = 'upload';
let loadingMsgTimer    = null;
let lastAlternatives   = [];
let analysisRequestId  = 0;

// ─── MARKETPLACES ─────────────────────────────
const MARKETPLACES = {
  IN: { domain: 'amazon.in',     symbol: '₹',   code: 'INR', label: 'India (₹ INR)' },
  US: { domain: 'amazon.com',    symbol: '$',   code: 'USD', label: 'United States ($ USD)' },
  UK: { domain: 'amazon.co.uk',  symbol: '£',   code: 'GBP', label: 'United Kingdom (£ GBP)' },
  DE: { domain: 'amazon.de',     symbol: '€',   code: 'EUR', label: 'Germany (€ EUR)' },
  CA: { domain: 'amazon.ca',     symbol: 'CA$', code: 'CAD', label: 'Canada (CA$ CAD)' },
  AU: { domain: 'amazon.com.au', symbol: 'A$',  code: 'AUD', label: 'Australia (A$ AUD)' },
  JP: { domain: 'amazon.co.jp',  symbol: '¥',   code: 'JPY', label: 'Japan (¥ JPY)' },
};

let currentMarketplace     = 'IN';
let resultMarketplaceCode  = 'IN';

function getMarketplace()       { return MARKETPLACES[currentMarketplace]    || MARKETPLACES.IN; }
function getResultMarketplace() { return MARKETPLACES[resultMarketplaceCode] || MARKETPLACES.IN; }

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFileUpload();
  updateAnalyzeBtn();
});

// ─── TAB SWITCHING ────────────────────────────
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

// ─── FILE UPLOAD ──────────────────────────────
function initFileUpload() {
  const fileInput = document.getElementById('fileInput');
  const dropZone  = document.getElementById('dropZone');

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) handleFileSelected(file);
  });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
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
    document.getElementById('uploadedImg').src = result;
    document.getElementById('uploadPreview').style.display = 'block';
    document.getElementById('dropZone').style.display = 'none';
    updateAnalyzeBtn();
  };
  reader.readAsDataURL(file);
}

function clearUpload() {
  currentImageBase64 = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('dropZone').style.display = 'block';
  updateAnalyzeBtn();
}

// ─── WEBCAM ───────────────────────────────────
async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = document.getElementById('webcamVideo');
    video.srcObject = webcamStream;
    video.style.display = 'block';
    document.getElementById('startCamBtn').classList.add('hidden');
    document.getElementById('captureBtn').classList.remove('hidden');
  } catch (err) {
    showError('Camera access denied. Please allow camera permissions.');
  }
}

function captureFrame() {
  const video  = document.getElementById('webcamVideo');
  const canvas = document.getElementById('webcamCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  currentImageBase64 = dataUrl.split(',')[1];
  currentImageMime   = 'image/jpeg';
  document.getElementById('capturedImg').src = dataUrl;
  document.getElementById('webcamCaptured').style.display = 'block';
  document.getElementById('webcamVideo').style.display = 'none';
  stopWebcam();
  document.getElementById('captureBtn').classList.add('hidden');
  document.getElementById('retakeBtn').classList.remove('hidden');
  updateAnalyzeBtn();
}

function retakePhoto() {
  document.getElementById('webcamCaptured').style.display = 'none';
  document.getElementById('retakeBtn').classList.add('hidden');
  currentImageBase64 = null;
  updateAnalyzeBtn();
  startWebcam();
}

function stopWebcam() {
  if (webcamStream) { webcamStream.getTracks().forEach(t => t.stop()); webcamStream = null; }
}

function updateAnalyzeBtn() {
  const btn = document.getElementById('analyzeBtn');
  if (btn) btn.disabled = !currentImageBase64;
}

// ─── ANALYZE (2-phase) ────────────────────────
async function analyzeImage() {
  if (!currentImageBase64) return;
  if (!API_KEY) {
    showError('API key not set. Reload the page to enter your Gemini API key.');
    return;
  }

  showLoading(true);
  const requestId = ++analysisRequestId;
  const requestMarketplaceCode = currentMarketplace;
  const market = MARKETPLACES[requestMarketplaceCode];

  // ── PHASE 1: Strict object identification ──
  const phase1Prompt = `You are a precise computer vision system. Look at this image very carefully.

STEP 1 — Identify the PRIMARY object in the image.
Describe it in detail: What is it? What material is it made of? What is its shape, color, surface texture?

STEP 2 — Answer these strict questions:
- Is the PRIMARY object made predominantly of PLASTIC? (Answer YES or NO only)
- A plastic object must be a synthetic polymer material. NOT metal, NOT glass, NOT fabric, NOT paper, NOT wood, NOT ceramic.
- If the object is an APPLIANCE (iron, kettle, blender, TV remote, phone) — answer NO even if it has plastic parts. This app is for SINGLE-USE or disposable plastic items.
- If the object is a PERSON, FOOD (without plastic packaging), ANIMAL, PLANT, METAL item, GLASS item — answer NO.

STEP 3 — If YES plastic: identify the specific plastic type:
#1 PET, #2 HDPE, #3 PVC, #4 LDPE, #5 PP, #6 PS, #7 Other
- Clear water/soda bottles → #1 PET
- Milk jugs, shampoo bottles, grocery bags → #2 HDPE
- PVC pipes, credit cards, blister packs → #3 PVC
- Plastic bags, cling wrap, squeeze bottles → #4 LDPE
- Yogurt containers, bottle caps, straws, food containers → #5 PP
- Foam cups, disposable cutlery, CD cases → #6 PS
- Multi-layer, baby bottles, large water cooler jugs → #7 Other

Respond ONLY with this exact JSON (no markdown, no backticks):
{
  "isPlastic": true,
  "objectDescription": "A clear transparent PET water bottle with a blue screw cap",
  "plasticType": "PET",
  "plasticCode": "1",
  "confidence": 92,
  "rejectionReason": null
}

If NOT plastic:
{
  "isPlastic": false,
  "objectDescription": "A black electric iron with a metal soleplate",
  "plasticType": null,
  "plasticCode": null,
  "confidence": 0,
  "rejectionReason": "This is an electric iron/appliance, not a plastic item."
}`;

  try {
    const phase1Response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: currentImageMime, data: currentImageBase64 } },
            { text: phase1Prompt }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
      })
    });

    if (!phase1Response.ok) {
      const err = await phase1Response.json().catch(() => ({}));
      const errMsg = err.error?.message || `API error ${phase1Response.status}`;
      if (phase1Response.status === 429 || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        showLoading(false); showQuotaError(); return;
      }
      throw new Error(errMsg);
    }

    const phase1Data = await phase1Response.json();
    const raw1 = phase1Data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean1 = raw1.replace(/```json|```/g, '').trim();

    let phase1Result;
    try {
      phase1Result = JSON.parse(clean1);
    } catch {
      const match = clean1.match(/\{[\s\S]*\}/);
      phase1Result = match ? JSON.parse(match[0]) : null;
    }

    if (requestId !== analysisRequestId) { showLoading(false); return; }

    if (!phase1Result || !phase1Result.isPlastic) {
      showLoading(false);
      const reason = phase1Result?.rejectionReason ||
        `"${phase1Result?.objectDescription || 'This object'}" does not appear to be a plastic item. Please scan a plastic bottle, bag, container, wrapper, or similar item.`;
      showNotPlasticModal(reason, phase1Result?.objectDescription || '');
      return;
    }

    // ── PHASE 2: Full environmental analysis + precise Amazon search queries ──
    const phase2Prompt = `You are an expert environmental scientist. The image shows: "${phase1Result.objectDescription}". It has been identified as plastic type #${phase1Result.plasticCode} (${phase1Result.plasticType}).

Provide a COMPLETE environmental analysis. Respond ONLY with raw JSON (no markdown, no backticks):

{
  "detected": true,
  "plasticCode": "${phase1Result.plasticCode}",
  "plasticName": "${phase1Result.plasticType}",
  "plasticFullName": "Full chemical name here",
  "confidence": ${phase1Result.confidence},
  "objectDescription": "${phase1Result.objectDescription}",
  "color": "observed color",
  "condition": "New / Used / Worn",
  "estimatedAge": "< 1 year",
  "recyclingCode": "#${phase1Result.plasticCode}",
  "globalUsagePercent": "XX",
  "decompositionYears": 000,
  "recyclable": "Widely Recyclable / Check Locally / Not Recyclable",
  "toxicity": "Low / Medium / High",
  "commonUses": "specific uses for this plastic type",
  "impactHeadline": "A punchy sentence that emotionally conveys the scale of harm — reference the specific item",
  "timelineEvents": [
    { "label": "You are born", "year": 0 },
    { "label": "You die", "year": 80 },
    { "label": "Plastic halfway decomposed", "year": HALF_OF_DECOMPOSITION_YEARS },
    { "label": "Fully decomposed", "year": DECOMPOSITION_YEARS }
  ],
  "harmStats": [
    { "icon": "🐟", "stat": "Specific stat", "desc": "specific to THIS plastic type" },
    { "icon": "🌊", "stat": "Specific stat", "desc": "ocean/water pollution fact" },
    { "icon": "🧪", "stat": "Specific stat", "desc": "chemical/health risk" },
    { "icon": "♻️", "stat": "Specific stat", "desc": "recycling reality" }
  ],
  "affectedAnimal": {
    "icon": "🐢",
    "name": "Most impacted animal",
    "desc": "Specific impact description with a real statistic"
  },
  "emotionalQuote": "2-3 sentences specific to this exact plastic item. Make the reader feel the weight of it.",
  "alternatives": [
    {
      "name": "Exact product name as sold on Amazon",
      "brand": "Exact brand name",
      "description": "Why it replaces the detected plastic — specific benefit",
      "price": "${market.symbol}XXX–${market.symbol}XXX",
      "priceValue": 000,
      "imageCategory": "steel_water_bottle",
      "badge": "Top Pick",
      "amazonSearchQuery": "stainless steel reusable water bottle BPA free"
    },
    {
      "name": "...", "brand": "...", "description": "...", "price": "...", "priceValue": 000,
      "imageCategory": "...", "badge": "Eco Certified",
      "amazonSearchQuery": "specific keyword string that finds this exact product type on Amazon"
    },
    {
      "name": "...", "brand": "...", "description": "...", "price": "...", "priceValue": 000,
      "imageCategory": "...", "badge": "Best Value",
      "amazonSearchQuery": "..."
    },
    {
      "name": "...", "brand": "...", "description": "...", "price": "...", "priceValue": 000,
      "imageCategory": "...", "badge": "Stylish Pick",
      "amazonSearchQuery": "..."
    },
    {
      "name": "...", "brand": "...", "description": "...", "price": "...", "priceValue": 000,
      "imageCategory": "...", "badge": "Premium",
      "amazonSearchQuery": "..."
    }
  ]
}

STRICT RULES:
1. Exactly 5 alternatives, budget to premium order
2. Alternatives MUST directly replace the detected item:
   - Plastic water bottle → reusable steel/glass water bottles
   - Plastic straw → metal or bamboo straws
   - Plastic bag → cotton tote or reusable bags
   - Plastic food container → glass or steel containers
   - Plastic cup → reusable coffee cups
   - Plastic wrap → beeswax wrap or silicone bags
   - Plastic cutlery → bamboo or steel cutlery
3. Prices MUST be realistic for ${market.label} in ${market.code} with "${market.symbol}" symbol
4. priceValue = plain number (average of range) in ${market.code}
5. imageCategory MUST be exactly one of: steel_water_bottle, insulated_flask, glass_water_bottle, silicone_food_bag, cotton_tote_bag, mesh_produce_bag, beeswax_food_wrap, bamboo_cutlery_set, glass_food_container, reusable_coffee_cup, metal_straw_set, reusable_shopping_bag
6. amazonSearchQuery = a precise 4-8 word search string that will find THIS EXACT TYPE of sustainable product on Amazon. Include material (steel/bamboo/glass/silicone), product type, and key feature (reusable/BPA-free/eco). Example: "stainless steel reusable water bottle BPA free 500ml" or "bamboo cutlery set travel case reusable". Do NOT include brand names in the query unless it's a globally known brand like Hydro Flask.
7. emotionalQuote must be specific to THIS item — not generic plastic facts
8. Return ONLY raw JSON`;

    const phase2Response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: currentImageMime, data: currentImageBase64 } },
            { text: phase2Prompt }
          ]
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
      })
    });

    if (!phase2Response.ok) {
      const err = await phase2Response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${phase2Response.status}`);
    }

    const phase2Data = await phase2Response.json();
    const raw2  = phase2Data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean2 = raw2.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(clean2);
    } catch {
      const match = clean2.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error('Could not parse analysis. Please try again.');
    }

    showLoading(false);
    if (requestId !== analysisRequestId) return;

    renderResults(result, requestMarketplaceCode);

  } catch (err) {
    showLoading(false);
    if (requestId !== analysisRequestId) return;
    console.error('Analysis error:', err);
    if (err.message.includes('quota') || err.message.includes('RESOURCE_EXHAUSTED')) {
      showQuotaError();
    } else {
      showError('Analysis failed: ' + err.message);
    }
  }
}

// ─── NOT PLASTIC MODAL ────────────────────────
function showNotPlasticModal(reason, objectDesc) {
  const existing = document.getElementById('notPlasticModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'notPlasticModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(43,38,32,0.93);
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(4px);padding:1.5rem;
  `;
  modal.innerHTML = `
    <div style="background:#33302a;border:1.5px solid #2d5a27;border-radius:10px;
      padding:2rem;max-width:460px;width:100%;text-align:center;
      font-family:'Space Grotesk',sans-serif;">
      <div style="font-size:2.8rem;margin-bottom:1rem;">🔍</div>
      <h2 style="color:#e8dcc8;font-size:1.25rem;margin-bottom:0.7rem;">Not a Plastic Item</h2>
      <p style="color:#b8a48a;font-size:0.9rem;line-height:1.7;margin-bottom:1.5rem;">${reason}</p>
      <div style="background:#3a362f;border:1.5px solid #2d5a27;border-radius:6px;padding:0.9rem;margin-bottom:1.5rem;text-align:left;">
        <div style="color:#5aad4e;font-size:0.75rem;font-family:'Space Mono',monospace;margin-bottom:0.4rem;">WHAT TO SCAN INSTEAD</div>
        <div style="color:#e8dcc8;font-size:0.85rem;line-height:1.6;">
          ✅ Plastic water bottles &amp; soda bottles<br>
          ✅ Plastic bags &amp; wrapping<br>
          ✅ Plastic food containers &amp; cups<br>
          ✅ Plastic straws, cutlery, packaging<br>
          ✅ Shampoo bottles, detergent bottles<br>
          ❌ Appliances, electronics, metals, glass
        </div>
      </div>
      <button onclick="document.getElementById('notPlasticModal').remove()" style="
        background:#2d5a27;border:1.5px solid #5aad4e;color:#e8dcc8;
        padding:0.65rem 1.8rem;border-radius:6px;
        font-family:'Space Grotesk',sans-serif;font-size:0.95rem;font-weight:600;cursor:pointer;">
        Got it — Try Another Image
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

// ─── QUOTA ERROR MODAL ────────────────────────
function showQuotaError() {
  const existing = document.getElementById('quotaModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'quotaModal';
  modal.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(43,38,32,0.92);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:1.5rem;`;
  modal.innerHTML = `
    <div style="background:#33302a;border:1.5px solid #2d5a27;border-radius:10px;padding:2rem;max-width:480px;width:100%;text-align:center;font-family:'Space Grotesk',sans-serif;">
      <div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>
      <h2 style="color:#e8dcc8;font-size:1.3rem;margin-bottom:0.6rem;">Gemini API Quota Exceeded</h2>
      <p style="color:#b8a48a;font-size:0.9rem;line-height:1.6;margin-bottom:1.5rem;">Your free Gemini API key has hit its daily or per-minute limit.</p>
      <div style="text-align:left;display:flex;flex-direction:column;gap:0.8rem;margin-bottom:1.5rem;">
        <div style="background:#3a362f;border:1.5px solid #2d5a27;border-radius:6px;padding:0.9rem;">
          <div style="color:#5aad4e;font-size:0.8rem;font-family:'Space Mono',monospace;margin-bottom:0.3rem;">OPTION 1 — WAIT</div>
          <div style="color:#e8dcc8;font-size:0.88rem;">Free tier resets every minute (15 RPM) and daily (1,500/day). Wait a minute and try again.</div>
        </div>
        <div style="background:#3a362f;border:1.5px solid #2d5a27;border-radius:6px;padding:0.9rem;">
          <div style="color:#5aad4e;font-size:0.8rem;font-family:'Space Mono',monospace;margin-bottom:0.3rem;">OPTION 2 — NEW API KEY</div>
          <div style="color:#e8dcc8;font-size:0.88rem;">Get a fresh free key at <a href="https://aistudio.google.com" target="_blank" style="color:#5aad4e;">aistudio.google.com</a> and reload the page.</div>
        </div>
      </div>
      <button onclick="document.getElementById('quotaModal').remove()" style="background:#2d5a27;border:1.5px solid #5aad4e;color:#e8dcc8;padding:0.65rem 1.8rem;border-radius:6px;font-family:'Space Grotesk',sans-serif;font-size:0.95rem;font-weight:600;cursor:pointer;">Got it</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// ─── RENDER RESULTS ───────────────────────────
function renderResults(r, marketplaceCode) {
  resultMarketplaceCode = marketplaceCode || currentMarketplace;
  document.getElementById('inputSection').classList.add('hidden');
  document.getElementById('resultsSection').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  document.getElementById('plasticCode').textContent     = r.recyclingCode || ('#' + r.plasticCode) || '?';
  document.getElementById('plasticName').textContent     = r.plasticName    || 'Unknown';
  document.getElementById('plasticFullName').textContent = r.plasticFullName || '';

  const confPct = parseInt(r.confidence) || 80;
  setTimeout(() => { document.getElementById('confBar').style.width = confPct + '%'; }, 100);
  document.getElementById('confPct').textContent = confPct + '%';

  const recyclableClass = r.recyclable?.toLowerCase().includes('wide') ? 'safe'
    : r.recyclable?.toLowerCase().includes('not') ? 'danger' : 'warn';
  const toxicityClass = r.toxicity?.toLowerCase().includes('high') ? 'danger'
    : r.toxicity?.toLowerCase().includes('low') ? 'safe' : 'warn';

  document.getElementById('detailsGrid').innerHTML = `
    <div class="detail-item">
      <div class="detail-label">Item Detected</div>
      <div class="detail-value" style="font-size:0.82rem">${r.objectDescription || r.plasticName}</div>
    </div>
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

// ─── TIMELINE ─────────────────────────────────
function renderTimeline(years, events) {
  const track = document.getElementById('timelineTrack');
  const oldFill = track.querySelector('.timeline-fill');
  if (oldFill) oldFill.remove();

  const fill = document.createElement('div');
  fill.className = 'timeline-fill';
  fill.style.width = '0%';
  track.insertBefore(fill, track.firstChild);

  const maxYears = Math.max(years, ...events.map(e => e.year), 100);
  setTimeout(() => { fill.style.width = (years / maxYears * 100) + '%'; }, 200);

  const markers = document.getElementById('timelineMarkers');
  markers.innerHTML = '';

  [{ label: 'Today', year: 0 }, ...events].forEach(ev => {
    const pct = ev.year === 0 ? 2 : (ev.year / maxYears * 100);
    const pin = document.createElement('div');
    pin.className  = 'timeline-pin';
    pin.style.left = Math.min(pct, 96) + '%';
    pin.innerHTML  = `
      <div class="timeline-pin-dot"></div>
      <div class="timeline-pin-label">${ev.year === 0 ? 'Now' : ev.year + 'y'}<br>
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

// ─── PRODUCT SVG ICONS ────────────────────────
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
      <line x1="32" y1="54" x2="68" y2="54"/><line x1="38" y1="20" x2="46" y2="86"/>
      <line x1="50" y1="20" x2="50" y2="88"/><line x1="62" y1="20" x2="54" y2="86"/>
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

function getCategoryIcon(category) { return CATEGORY_ICONS[category] || null; }
function altCardImageId(idx) { return `altImg_${idx}`; }

function loadAlternativeImages(sorted) {
  sorted.forEach((alt, idx) => {
    const wrap = document.getElementById(altCardImageId(idx));
    if (!wrap) return;
    const icon = getCategoryIcon(alt.imageCategory);
    wrap.innerHTML = icon
      ? `<div class="alt-img-icon">${icon}</div>`
      : `<div class="alt-img-fallback">🌿</div>`;
  });
}

// ─── AMAZON LINK BUILDER ──────────────────────
// Uses the AI-generated amazonSearchQuery for a precise, product-matched search
function buildAmazonSearchUrl(alt) {
  // Prefer the AI-generated precise query; fall back to name + brand
  const query = alt.amazonSearchQuery
    ? alt.amazonSearchQuery.trim()
    : [alt.name, alt.brand].filter(Boolean).join(' ');
  const encoded = encodeURIComponent(query);
  const domain  = getResultMarketplace().domain;
  return `https://www.${domain}/s?k=${encoded}`;
}

// ─── ALTERNATIVES RENDER ──────────────────────
function extractPriceValue(alt) {
  if (typeof alt.priceValue === 'number' && !isNaN(alt.priceValue)) return alt.priceValue;
  const nums = (alt.price || '').match(/[\d.]+/g);
  if (!nums) return Infinity;
  const vals = nums.map(Number);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function renderAlternatives(alts) {
  const sorted = [...alts].sort((a, b) => extractPriceValue(a) - extractPriceValue(b));
  const grid   = document.getElementById('alternativesGrid');

  if (!sorted.length) {
    grid.innerHTML = `<p style="color:var(--text-dim);font-size:0.9rem;padding:1.5rem;text-align:center;">No alternatives found.</p>`;
    return;
  }

  grid.innerHTML = sorted.map((a, idx) => `
    <div class="alt-card">
      <div class="alt-img-wrap" id="${altCardImageId(idx)}">
        <div class="alt-img-loading"><span class="spinner" style="width:22px;height:22px;"></span></div>
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
    } else clearInterval(loadingMsgTimer);
  }, 1800);
}

// ─── TOASTS ───────────────────────────────────
function showError(msg) {
  const existing = document.querySelector('.error-toast:not(.info-toast)');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

// ─── RESET ────────────────────────────────────
function resetApp() {
  currentImageBase64 = null;
  stopWebcam();
  lastAlternatives = [];

  document.getElementById('resultsSection').classList.add('hidden');
  document.getElementById('inputSection').classList.remove('hidden');

  clearUpload();

  const webcamCaptured = document.getElementById('webcamCaptured');
  const webcamVideo    = document.getElementById('webcamVideo');
  if (webcamCaptured) webcamCaptured.style.display = 'none';
  if (webcamVideo)    webcamVideo.style.display    = 'none';

  document.getElementById('startCamBtn').classList.remove('hidden');
  document.getElementById('captureBtn').classList.add('hidden');
  document.getElementById('retakeBtn').classList.add('hidden');
  document.getElementById('confBar').style.width = '0%';

  switchTab('upload');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
