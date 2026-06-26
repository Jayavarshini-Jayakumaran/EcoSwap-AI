/* ============================================
   ECOSWAP AI — app.js
   Single-pass analysis (1 API call)
   Strict: item-matched alternatives, all AI-generated
   ============================================ */

const API_URL = 'https://ecoswap-ai-proxy.jayavarshini-jayakumaran.workers.dev';

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

let currentMarketplace    = 'IN';
let resultMarketplaceCode = 'IN';

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
  canvas.width  = video.videoWidth;
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

// ─── ANALYZE ──────────────────────────────────
async function analyzeImage() {
  if (!currentImageBase64) return;

  showLoading(true);
  const requestId = ++analysisRequestId;
  const requestMarketplaceCode = currentMarketplace;
  const market = MARKETPLACES[requestMarketplaceCode];

  // ── MASTER PROMPT ──────────────────────────────────────────────────────────
  // Instructions are layered in priority order so the model reads them clearly.
  // The core goal: identify exactly what is in the image, determine if it's
  // plastic, and if so, give 100% accurate, item-specific environmental data
  // and alternatives that replace THIS exact item (not a generic category).
  // ───────────────────────────────────────────────────────────────────────────
  const prompt = `You are an expert materials scientist, environmental analyst, and visual recognition system combined.

════════════════════════════════════════════
STEP 1 — IDENTIFY THE ITEM WITH PRECISION
════════════════════════════════════════════

Examine the image VERY carefully. Items may be large or small, near or far, fully visible or partially shown.
Look at: shape, color, texture, label/text if visible, size context, surface finish, packaging features.

Write a highly specific description. Examples of the precision expected:
- NOT "a bottle" → YES "a 500ml single-use transparent PET mineral water bottle with a blue flip-top cap and a paper label"
- NOT "a bag" → YES "a thin transparent LDPE polybag, like used for produce/bread, heat-sealed at the top"
- NOT "a container" → YES "a white #5 PP yogurt cup, approximately 150g size, with a foil peel-off lid"
- NOT "straws" → YES "a bundle of individually wrapped single-use white polypropylene drinking straws"

════════════════════════════════════════════
STEP 2 — IS IT PLASTIC?
════════════════════════════════════════════

PLASTIC = synthetic polymer material made entirely or predominantly of plastic.
This includes: bottles, bags, containers, cups, straws, wrapping, packaging film, cutlery, trays, pouches, sachets, sacks, jerry cans, buckets, cling film, foam packaging.

NOT PLASTIC — reject these even if they contain small plastic parts:
• Electronics / appliances (phones, laptops, TVs, remotes, irons, kettles, cameras)
• Clothing / fabric / textiles
• Metal items (cans, tins, aluminium foil, steel containers)
• Glass items (jars, bottles, windows)
• Paper / cardboard (boxes, bags, cartons — unless they have a significant plastic coating/layer)
• Natural items (fruits, vegetables, wood, plants, animals, food)
• People / body parts
• Composite products where plastic is clearly secondary (e.g. a pen is mostly plastic but it's a stationery item, not a disposable plastic item in the environmental sense)

EDGE CASES — scan these items:
• Tetra packs / juice boxes with plastic spout → YES (plastic coating + spout)
• Bubble wrap → YES
• Plastic-coated paper cups → YES (note the plastic lining)
• Styrofoam / EPS foam → YES (#6 PS)
• Plastic ziplock bags → YES
• PVC pipe / hose → YES
• Plastic toys → YES (note this)

If NOT plastic → respond with the NOT-PLASTIC JSON below.
If YES plastic → respond with the PLASTIC JSON below.

SPECIAL CASE — ELECTRONICS (phones, tablets, laptops, cameras, etc.):
These are correctly classified as NOT PLASTIC (the device itself isn't a single-use plastic item).
However, the most common plastic accessory paired with a phone/tablet is its protective case, which is
usually synthetic (TPU/silicone/PC plastic) and replaced often. So for these items specifically, in addition
to the rejection explanation, suggest ONE sustainable case alternative (e.g. biodegradable bamboo/cork phone
case, compostable plant-based case, recycled-ocean-plastic case) using the "suggestedAlternative" field below.
Only include "suggestedAlternative" for phones/tablets/electronics with a case-like accessory — omit it
(set to null) for everything else that's not plastic (metal cans, glass jars, clothing, food, etc.).

════════════════════════════════════════════
STEP 3A — IF NOT PLASTIC
════════════════════════════════════════════

Respond ONLY with this exact JSON (no markdown, no backticks, no explanation):
{
  "detected": false,
  "objectDescription": "describe exactly what you see",
  "material": "the actual material (metal / glass / fabric / paper / food / electronic / etc.)",
  "rejectionReason": "Clear, friendly 1-2 sentence explanation of why this is not a scannable plastic item and what the user should try instead.",
  "suggestedAlternative": null
}

If the item is a phone/tablet/electronic device, instead populate suggestedAlternative like this:
{
  "detected": false,
  "objectDescription": "describe exactly what you see",
  "material": "electronic device",
  "rejectionReason": "Friendly 1-2 sentence explanation that this is an electronic device, not a single-use plastic item — but mention that its case/accessories often are.",
  "suggestedAlternative": {
    "name": "Specific product name as commonly sold",
    "brand": "Real brand available in ${market.label}",
    "description": "How this sustainable phone case replaces a typical plastic phone case for this device.",
    "price": "${market.symbol}XXX–${market.symbol}XXX",
    "priceValue": 0,
    "imageCategory": "phone_case",
    "badge": "Eco Pick",
    "amazonSearchQuery": "biodegradable bamboo phone case compostable"
  }
}

════════════════════════════════════════════
STEP 3B — IF PLASTIC
════════════════════════════════════════════

ALL fields below must be generated fresh from your knowledge about THIS specific plastic item.
NOTHING should be generic or copy-pasted — every sentence must refer to the exact item identified.

PLASTIC TYPE REFERENCE:
#1 PET  — water/soda bottles, food jars, blister packs
#2 HDPE — milk jugs, shampoo bottles, detergent bottles, grocery bags, jerry cans
#3 PVC  — pipes, hoses, credit cards, blister packaging, floor mats, cables
#4 LDPE — cling wrap, bread bags, produce bags, squeezable bottles, bubble wrap
#5 PP   — yogurt cups, bottle caps, straws, food containers, takeaway boxes, potato chip bags
#6 PS   — styrofoam cups, foam trays, CD cases, disposable cutlery, plastic egg cartons
#7 Other — multi-layer pouches, baby bottles, large water coolers, composite packaging

ALTERNATIVE RULES — THE MOST CRITICAL SECTION:
Each alternative must be a DIRECT replacement for the EXACT item identified.
Think: "If someone has THIS item and wants to stop using single-use plastic for it,
what sustainable product would they buy instead?"

Examples of correct matching:
• Single-use PET water bottle → stainless steel / glass water bottle of similar size
• Plastic grocery bag → cotton tote bag, jute bag
• Plastic straw → metal straw, bamboo straw, glass straw
• Plastic wrap / cling film → beeswax wrap, silicone stretch lids, reusable silicone food bags
• Styrofoam coffee cup → reusable coffee cup / travel mug
• Plastic food container / takeaway box → glass food container, stainless steel tiffin
• Plastic cutlery → bamboo cutlery, stainless steel cutlery set
• Shampoo bottle → shampoo bar, refillable dispenser
• Plastic produce bag / bread bag → mesh produce bag, cloth bag
• Bubble wrap → recycled paper padding, honeycomb paper wrap
• PVC pipe → not a consumer item, skip — offer to describe material alternatives
• Plastic toy → wooden toy, fabric toy (flag that this category is noted)
• Ziplock bag → reusable silicone bag

Respond ONLY with this exact JSON (no markdown, no backticks):
{
  "detected": true,
  "plasticCode": "1",
  "plasticName": "PET",
  "plasticFullName": "Polyethylene Terephthalate",
  "confidence": 94,
  "objectDescription": "Highly specific description of the exact item seen in the image",
  "color": "exact observed color",
  "condition": "New / Used / Worn",
  "estimatedAge": "< 1 year",
  "recyclingCode": "#1",
  "globalUsagePercent": "18",
  "decompositionYears": 450,
  "recyclable": "Widely Recyclable",
  "toxicity": "Low",
  "commonUses": "Specific real-world uses of this exact plastic type, not generic",
  "impactHeadline": "A punchy, emotionally resonant sentence about THIS specific item's environmental harm. Must name the item specifically.",
  "timelineEvents": [
    { "label": "You are born", "year": 0 },
    { "label": "You die (avg. lifespan)", "year": 73 },
    { "label": "This plastic halfway broken down", "year": 225 },
    { "label": "Fully decomposed", "year": 450 }
  ],
  "harmStats": [
    { "icon": "🐟", "stat": "XX% of fish", "desc": "Specific statistic about THIS plastic type's harm to marine life — do not use generic plastic stats" },
    { "icon": "🌊", "stat": "X million tonnes", "desc": "Specific ocean/waterway pollution fact about THIS plastic type" },
    { "icon": "🧪", "stat": "X chemicals", "desc": "Specific chemical leaching or health risk from THIS plastic type" },
    { "icon": "♻️", "stat": "Only XX% recycled", "desc": "Real recycling rate or barrier for THIS specific plastic type" }
  ],
  "affectedAnimal": {
    "icon": "🐢",
    "name": "Most impacted animal species for this plastic type",
    "desc": "Specific, real, cited-style impact on that animal from this plastic type. Include a statistic."
  },
  "emotionalQuote": "2-3 sentences about THIS exact item. Make the reader viscerally understand the environmental cost of THIS specific object — not plastic in general.",
  "alternatives": [
    {
      "name": "Specific product name as commonly sold",
      "brand": "Specific real brand that makes this",
      "description": "Exactly how this replaces the detected item. Be specific about size, function, material.",
      "price": "${market.symbol}XXX–${market.symbol}XXX",
      "priceValue": 350,
      "imageCategory": "steel_water_bottle",
      "badge": "Top Pick",
      "amazonSearchQuery": "stainless steel water bottle 500ml BPA free reusable"
    },
    {
      "name": "...", "brand": "...", "description": "...", "price": "...", "priceValue": 0,
      "imageCategory": "...", "badge": "Eco Certified", "amazonSearchQuery": "..."
    },
    {
      "name": "...", "brand": "...", "description": "...", "price": "...", "priceValue": 0,
      "imageCategory": "...", "badge": "Best Value", "amazonSearchQuery": "..."
    },
    {
      "name": "...", "brand": "...", "description": "...", "price": "...", "priceValue": 0,
      "imageCategory": "...", "badge": "Stylish Pick", "amazonSearchQuery": "..."
    },
    {
      "name": "...", "brand": "...", "description": "...", "price": "...", "priceValue": 0,
      "imageCategory": "...", "badge": "Premium", "amazonSearchQuery": "..."
    }
  ]
}

STRICT RULES — ALTERNATIVES:
1. All 5 alternatives must directly replace the EXACT item detected — not the category, not a similar item.
   If the image shows a 1-litre plastic milk jug, all 5 alternatives must be reusable milk containers or
   refillable milk alternatives — NOT generic water bottles.
2. Alternatives vary by price: cheapest first → premium last.
3. Prices must be realistic for ${market.label} market in ${market.code} using "${market.symbol}" symbol.
4. priceValue = a single number (the middle of the price range).
5. imageCategory must be EXACTLY one of:
   steel_water_bottle | insulated_flask | glass_water_bottle | silicone_food_bag |
   cotton_tote_bag | mesh_produce_bag | beeswax_food_wrap | bamboo_cutlery_set |
   glass_food_container | reusable_coffee_cup | metal_straw_set | reusable_shopping_bag
   Choose the category that best matches what the alternative actually IS.
6. amazonSearchQuery must be 4–8 words that would find THIS exact alternative on Amazon.
   Include material + product type + key features. Avoid vague terms like "eco friendly product".
7. brand should be a real brand available in ${market.label} — e.g. Milton, Cello, Borosil for India;
   Hydro Flask, Klean Kanteen, Stasher for US/UK. If uncertain, use a plausible real brand.

STRICT RULES — DATA ACCURACY:
• decompositionYears, globalUsagePercent, harmStats, affectedAnimal — must reflect real published data for THIS plastic type.
• Do NOT invent statistics. Use known ranges if exact figures are uncertain.
• confidence = your visual certainty that this IS the specific plastic type identified (0–100).
• Return ONLY raw JSON. No markdown. No explanation before or after.`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: currentImageMime, data: currentImageBase64 } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.15,       // low temp = more deterministic, fewer hallucinations
          maxOutputTokens: 2800,   // enough for full JSON with 5 alternatives
          topP: 0.9,
          topK: 40
        }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.error?.message || `API error ${response.status}`;
      if (response.status === 429 || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        showLoading(false); showQuotaError(); return;
      }
      throw new Error(errMsg);
    }

    const data  = await response.json();
    const raw   = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      // try to salvage partial JSON
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) result = JSON.parse(match[0]);
      else throw new Error('Could not parse the analysis result. Please try again.');
    }

    showLoading(false);
    if (requestId !== analysisRequestId) return;

    if (!result.detected) {
      showNotPlasticModal(
        result.rejectionReason || `This doesn't appear to be a plastic item.`,
        result.objectDescription || '',
        result.material || '',
        result.suggestedAlternative || null
      );
      return;
    }

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
function showNotPlasticModal(reason, objectDesc, material, suggestedAlternative) {
  const existing = document.getElementById('notPlasticModal');
  if (existing) existing.remove();

  const materialTag = material
    ? `<div style="display:inline-block;background:#3a362f;border:1px solid #5aad4e;border-radius:4px;padding:0.2rem 0.6rem;font-size:0.78rem;color:#5aad4e;font-family:'Space Mono',monospace;margin-bottom:1rem;">MATERIAL DETECTED: ${material.toUpperCase()}</div>`
    : '';

  const descTag = objectDesc
    ? `<div style="background:#3a362f;border-left:3px solid #5aad4e;padding:0.7rem 0.9rem;border-radius:4px;margin-bottom:1.2rem;text-align:left;font-size:0.84rem;color:#b8a48a;font-style:italic;">"${objectDesc}"</div>`
    : '';

  const altTag = suggestedAlternative
    ? `<div style="background:#3a362f;border:1.5px solid #2d5a27;border-radius:6px;padding:0.9rem;margin-bottom:1.4rem;text-align:left;">
        <div style="color:#5aad4e;font-size:0.75rem;font-family:'Space Mono',monospace;margin-bottom:0.5rem;">🌿 SUSTAINABLE SWAP FOR ITS CASE</div>
        <div style="color:#e8dcc8;font-size:0.92rem;font-weight:600;">${suggestedAlternative.name}${suggestedAlternative.brand ? ' — ' + suggestedAlternative.brand : ''}</div>
        <div style="color:#b8a48a;font-size:0.84rem;line-height:1.6;margin:0.3rem 0 0.6rem;">${suggestedAlternative.description || ''}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="color:#5aad4e;font-size:0.88rem;font-weight:600;">${suggestedAlternative.price || ''}</span>
          <a href="${buildAmazonSearchUrl(suggestedAlternative)}" target="_blank" rel="noopener noreferrer" style="color:#e8dcc8;background:#2d5a27;border:1px solid #5aad4e;border-radius:5px;padding:0.4rem 0.9rem;font-size:0.8rem;text-decoration:none;">Shop on ${getResultMarketplace().domain} →</a>
        </div>
      </div>`
    : '';

  const modal = document.createElement('div');
  modal.id = 'notPlasticModal';
  modal.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(43,38,32,0.93);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:1.5rem;`;
  modal.innerHTML = `
    <div style="background:#33302a;border:1.5px solid #2d5a27;border-radius:10px;padding:2rem;max-width:480px;width:100%;text-align:center;font-family:'Space Grotesk',sans-serif;">
      <div style="font-size:2.8rem;margin-bottom:0.8rem;">🔍</div>
      <h2 style="color:#e8dcc8;font-size:1.2rem;margin-bottom:0.6rem;">Not a Single-Use Plastic Item</h2>
      ${materialTag}
      ${descTag}
      <p style="color:#b8a48a;font-size:0.88rem;line-height:1.7;margin-bottom:1.4rem;">${reason}</p>
      ${altTag}
      <div style="background:#3a362f;border:1.5px solid #2d5a27;border-radius:6px;padding:0.9rem;margin-bottom:1.4rem;text-align:left;">
        <div style="color:#5aad4e;font-size:0.75rem;font-family:'Space Mono',monospace;margin-bottom:0.5rem;">✅ ITEMS YOU CAN SCAN</div>
        <div style="color:#e8dcc8;font-size:0.83rem;line-height:1.7;">
          • Plastic water / soda / juice bottles<br>
          • Plastic bags, wrapping, cling film<br>
          • Plastic food containers, cups, trays<br>
          • Straws, cutlery, styrofoam packaging<br>
          • Shampoo / detergent / lotion bottles<br>
          • Plastic pouches, sachets, zip-lock bags<br>
          • Bubble wrap, plastic mailers
        </div>
      </div>
      <button onclick="document.getElementById('notPlasticModal').remove()" style="background:#2d5a27;border:1.5px solid #5aad4e;color:#e8dcc8;padding:0.65rem 1.8rem;border-radius:6px;font-family:'Space Grotesk',sans-serif;font-size:0.92rem;font-weight:600;cursor:pointer;">
        Try Another Image
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
  phone_case: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="28" y="10" width="44" height="80" rx="10" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <rect x="36" y="18" width="28" height="46" rx="3" fill="var(--green-glow)"/>
    <circle cx="50" cy="74" r="4" fill="none" stroke="var(--green-bright)" stroke-width="1.5"/>
    <rect x="44" y="14" width="12" height="2.5" rx="1.2" fill="var(--beige-mid)"/>
  </svg>`,
  reusable_shopping_bag: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M30 30 Q30 12 50 12 Q70 12 70 30" fill="none" stroke="var(--beige-mid)" stroke-width="4"/>
    <path d="M18 30 L82 30 L76 88 L24 88 Z" fill="var(--bg-input)" stroke="var(--green-bright)" stroke-width="2.5"/>
    <path d="M30 50 L70 50" stroke="var(--green-bright)" stroke-width="2" opacity="0.5"/>
    <path d="M27 60 L73 60" stroke="var(--green-bright)" stroke-width="2" opacity="0.5"/>
  </svg>`,
};

function getCategoryIcon(category) { return CATEGORY_ICONS[category] || null; }
function altCardImageId(idx)       { return `altImg_${idx}`; }

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
function buildAmazonSearchUrl(alt) {
  const query   = alt.amazonSearchQuery ? alt.amazonSearchQuery.trim() : [alt.name, alt.brand].filter(Boolean).join(' ');
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
