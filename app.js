/* html2canvas - lazy loaded on first export */
var _h2cLoaded = false;
var _h2cCallbacks = [];
function ensureH2C(cb) {
  if (typeof html2canvas !== 'undefined') { cb(); return; }
  _h2cCallbacks.push(cb);
  if (_h2cLoaded) return;
  _h2cLoaded = true;
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  s.onload = function () { _h2cCallbacks.forEach(function (fn) { fn(); }); _h2cCallbacks = []; };
  s.onerror = function () {
    // CDN failed â€” try inline fallback via blob
    toast('Export failed: html2canvas could not load. Check internet connection.', 'var(--red)');
    _h2cLoaded = false; _h2cCallbacks = [];
  };
  document.head.appendChild(s);
}

/* JSZip and XLSX are loaded from CDN script tags in the HTML shell. */

// â•â•â• CORE STATE â•â•â•
let pngW = 0, pngH = 0, dispScale = 1;
let isDirty = false, curName = 'Untitled Card';
let curCardId = null, curFolderId = null; // â˜… Track loaded card by ID, not name
let LIB = { folders: [] };
let bulkBGSrc = '', bulkBGW = 0, bulkBGH = 0, bulkLogos = {}, bulkRows = [];
const BULK_PRESET_LOGO_OPTIONS = [
  { id: 'light', label: 'Light Logo ZIP', fileName: 'Light.zip', description: 'Use the bundled light-theme logo pack' },
  { id: 'dark', label: 'Dark Logo ZIP', fileName: 'Dark.zip', description: 'Use the bundled dark-theme logo pack' }
];
const BULK_PRESET_SHEET_OPTIONS = [
  { id: 'april14', label: 'sale data 14 April.xlsx', fileName: 'sale data 14 April.xlsx', description: 'Use the bundled sales sheet' }
];
let bulkSelectedPresetLogo = BULK_PRESET_LOGO_OPTIONS[0].id;
let bulkSelectedPresetSheet = BULK_PRESET_SHEET_OPTIONS[0].id;
let bulkLogoSourceMode = 'existing';
let bulkSheetSourceMode = 'existing';
let bulkExistingSourcesInitialized = false;
let ctxTarget = { fid: null, cid: null };
let folderEditScope = null;
let folderEditBaseData = null;
let folderEditInitialData = null;
let lastFolderSyncSnapshot = null;
let libraryPinnedFolderId = null;
let folderSyncPause = 0;
let folderThumbRefreshTimer = null;
const cardThumbRefreshTimers = new Map();
let folderModalSource = 'library';
let folderModalResolve = null;
let folderRenameFid = null;
const folderSyncBaseByCard = new Map();
const exportRenderCache = new Map();
const EXPORT_RENDER_CACHE_LIMIT = 24;
const LIB_STORAGE_KEY = 'ucs4';
const LIB_API_ENDPOINT = '/api/library';
const LIB_API_META_ENDPOINT = '/api/library/meta';
const STATIC_DEPLOY_MODE = !!window.UCS_STATIC_MODE || location.protocol === 'file:';
const LIB_CONFLICT_CACHE_KEY = 'ucs4_pending_conflict';
const LAST_OPENED_CARD_KEY = 'ucs4_last_open_card';
let libSyncTimer = null;
let libServerAvailable = false;
let libLoadStarted = false;
let libSyncInFlight = false;
let libRevision = 0;
let libUpdatedAt = '';
let libPollTimer = null;
let libRemoteUpdateQueued = false;
let draftSaveTimer = null;
let editorBaselineHash = '';
let librarySearchTerm = '';
let libraryActiveTag = '';
let bulkValidationState = { errors: [], warnings: [], info: [] };
const EDITOR_DRAFT_KEY = 'ucs4_editor_draft';
const BANNER_DRAFT_KEY = 'ucs4_banner_draft';
const MAX_SHARED_ASSETS = 18;
const STAGE_GUIDE_PADDING = 24;
const SNAP_THRESHOLD_PCT = 1.25;
let offerAutoCenterFrame = 0;
const DSCALES = { badge: { x: 1, y: 1 }, subtitle: { x: 1, y: 1 }, offer: { x: 1, y: 1 }, pricing: { x: 1, y: 1 } };


let editorMutationVersion = 0;


const DPOS = { badge: { top: 12, left: 50 }, subtitle: { top: 24, left: 50 }, offer: { top: 47, left: 50 }, pricing: { top: 68, left: 50 } };
let pos = JSON.parse(JSON.stringify(DPOS));
let elemScale = JSON.parse(JSON.stringify(DSCALES));
let offerAutoCenter = true;
const FOLDER_OVERRIDE_KEYS = [
  'subtitle', 'bignum', 'months', 'free', 'sublabel',
  'szLogo', 'szSubtitle', 'szBignum', 'szMonths', 'szFree', 'szSublabel', 'sublabelGap', 'szOrig', 'szFinal',
  'cSubtitle', 'cBignum', 'cMonths', 'cFree', 'cSublabel', 'cOrig', 'cOrigStrike', 'cFinal',
  'bgSrc', 'logoSrc', 'activeLogoName', 'offerAutoCenter', 'pngW', 'pngH', 'pos', 'elemScale'
];

const BANNER_SIZE = {
  outerW: 1440,
  outerH: 280,
  innerX: 64,
  innerY: 48,
  innerW: 1312,
  innerH: 219,
  innerRadius: 40
};

const BANNER_TEMPLATES = {
  'nifty-expiry': {
    label: 'Nifty Expiry Sale',
    kicker: 'NIFTY EXPIRY',
    headline: 'SALE',
    support: 'Premium market opportunity',
    accent: '#2f83ff',
    outerMode: 'gradient',
    outerColor: '#ffffff',
    outerGradStart: '#f6fbff',
    outerGradEnd: '#e8f3ff',
    prompt:
      'Premium homepage banner for a stock-market expiry sale. Create a high-end financial promo visual with a clean pale-blue inner card, a strong bullish sculpture on the left, a strong bearish sculpture on the right, glassy architecture or market skyline accents, soft cinematic lighting, and a clear central safe band for a text overlay. No text, no logos, no watermark, no UI frames. Keep the composition modern, premium, and uncluttered.'
  },
  'bull-bear': {
    label: 'Bull / Bear Market',
    kicker: 'BULL VS BEAR',
    headline: 'MARKET BATTLE',
    support: 'Momentum, contrast, and tension',
    accent: '#4aa7ff',
    outerMode: 'gradient',
    outerColor: '#ffffff',
    outerGradStart: '#ecf6ff',
    outerGradEnd: '#d7e8ff',
    prompt:
      'Premium financial banner artwork with a bullish figure on the left and a bearish figure on the right, dramatic blue lighting, clean central safe space, glossy finance-brand atmosphere, strong contrast, no text, no logos, no watermark, no interface chrome.'
  },
  'blue-market': {
    label: 'Blue Market Spotlight',
    kicker: 'MARKET SPOTLIGHT',
    headline: 'TOP SLOT',
    support: 'Polished, modern, and conversion focused',
    accent: '#3ab8ff',
    outerMode: 'solid',
    outerColor: '#f4f9ff',
    outerGradStart: '#f4f9ff',
    outerGradEnd: '#eaf4ff',
    prompt:
      'Modern blue finance banner background for a homepage top slot. Use a premium gradient, subtle architectural shapes, soft motion streaks, and a clean center band with balanced left-right visual weight. No text, no logos, no watermark, no UI frames.'
  }
};

let bannerState = {
  templateId: 'nifty-expiry',
  prompt: BANNER_TEMPLATES['nifty-expiry'].prompt,
  kicker: BANNER_TEMPLATES['nifty-expiry'].kicker,
  headline: BANNER_TEMPLATES['nifty-expiry'].headline,
  support: BANNER_TEMPLATES['nifty-expiry'].support,
  accent: BANNER_TEMPLATES['nifty-expiry'].accent,
  outerMode: BANNER_TEMPLATES['nifty-expiry'].outerMode,
  outerColor: BANNER_TEMPLATES['nifty-expiry'].outerColor,
  outerGradStart: BANNER_TEMPLATES['nifty-expiry'].outerGradStart,
  outerGradEnd: BANNER_TEMPLATES['nifty-expiry'].outerGradEnd,
  artSrc: '',
  artScale: 100,
  artY: 0,
  titleSize: 86,
  status: 'Local preview',
  source: 'local'
};
let bannerImage = null;
let bannerImageToken = 0;
let bannerRenderQueued = 0;
let bannerDraftLoaded = false;

// â•â•â• UTILS â•â•â•
const $ = id => document.getElementById(id);
const v = id => $(id).value;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const jclone = obj => obj ? JSON.parse(JSON.stringify(obj)) : obj;
const escapeHtml = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const SAFE_ID_RE = /^[A-Za-z0-9_-]{3,80}$/;
const SAFE_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i;
const DEBUG_TOOLS_KEY = 'ucs4_debug_tools';

function isDebugToolsEnabled() {
  try {
    return new URLSearchParams(window.location.search).has('debug') ||
      localStorage.getItem(DEBUG_TOOLS_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function normalizeEntityId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return SAFE_ID_RE.test(id) ? id : uid();
}

function normalizeTextList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(value => String(value == null ? '' : value).trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeImageSrc(value) {
  const src = typeof value === 'string' ? value.trim() : '';
  return SAFE_IMAGE_RE.test(src) ? src : '';
}

function initDebugTools() {
  const btn = $('fix-all-btn');
  if (btn) btn.hidden = !isDebugToolsEnabled();
}

function hasServerApi() {
  return !!window.fetch && !STATIC_DEPLOY_MODE;
}

function initStaticDeployModeNotice() {
  if (!STATIC_DEPLOY_MODE) return;
  const note = $('banner-note');
  if (note) {
    note.textContent = 'Static GitHub Pages mode: Gemini image generation and shared server sync are disabled. Designs are saved in this browser only.';
  }
}

function reportClientIssue(level, ...args) {
  if (!isDebugToolsEnabled()) return;
  const logger = window.console && window.console[level];
  if (typeof logger === 'function') logger.apply(window.console, args);
}

function getBulkPresetLogoOption(id) {
  return BULK_PRESET_LOGO_OPTIONS.find(opt => opt.id === id) || BULK_PRESET_LOGO_OPTIONS[0];
}

function getBulkPresetSheetOption(id) {
  return BULK_PRESET_SHEET_OPTIONS.find(opt => opt.id === id) || BULK_PRESET_SHEET_OPTIONS[0];
}

function setBulkSourceNote(id, kind, text) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('existing', 'upload', 'error');
  el.classList.add(kind || 'existing');
  el.textContent = text;
}

function renderBulkExistingSelectors() {
  document.querySelectorAll('[data-bulk-logo-option]').forEach(btn => {
    const active = btn.getAttribute('data-bulk-logo-option') === bulkSelectedPresetLogo;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const sheetSel = $('bulk-sheet-select');
  if (sheetSel) sheetSel.value = bulkSelectedPresetSheet;
}

async function fetchExistingBulkFileBlob(fileName) {
  const res = await fetch(encodeURI(fileName), { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load ' + fileName);
  return await res.blob();
}

async function loadBulkLogosFromZipBlob(blob, label, options) {
  const opts = options || {};
  const zip = await JSZip.loadAsync(blob);
  bulkLogos = {};
  const imgFiles = Object.keys(zip.files).filter(n => !zip.files[n].dir && /\.(png|jpg|jpeg|webp|svg)$/i.test(n));
  for (const fname of imgFiles) {
    const imgBlob = await zip.files[fname].async('blob');
    const url = await blobToURL(imgBlob, fname);
    bulkLogos[fname.split('/').pop()] = url;
  }
  const count = Object.keys(bulkLogos).length;
  $('bulk-zip-txt').innerHTML = 'Loaded ' + escapeHtml(label) + '<br><span style="font-size:10px;opacity:.6">' + count + ' images found</span>';
  $('bulk-zip-box').classList.add('ok');
  $('zip-found').style.display = 'block';
  $('zip-found').textContent = 'Found: ' + Object.keys(bulkLogos).join(', ');
  bulkValidationState = validateBulkRows(bulkRows);
  renderBulkValidation();
  if (!opts.quiet) toast(count + ' logos loaded!');
  return count;
}

async function parseBulkRowsFromBlob(blob, filename) {
  if (filename.toLowerCase().endsWith('.csv')) {
    const text = await blob.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('CSV is empty or has only headers');
    const rawHdrs = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
    const hdrs = rawHdrs.map(h => h.toLowerCase().replace(/[\s\-]+/g, '_'));
    const expectedCols = hdrs.length;
    let rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = parseCSVLine(lines[i], expectedCols);
      const row = {};
      hdrs.forEach((h, j) => row[h] = (vals[j] || '').replace(/^"|"$/g, '').trim());
      const nameVal = row.card_name || row.name || '';
      if (nameVal && !nameVal.startsWith('e.g')) rows.push(row);
    }
    return rows;
  }
  if (typeof XLSX === 'undefined') throw new Error('XLSX library not loaded - please refresh the page');
  const data = new Uint8Array(await blob.arrayBuffer());
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  return raw.map(r => {
    const normalized = {};
    Object.keys(r).forEach(k => {
      const nk = k.trim().toLowerCase().replace(/[\s\-\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
      normalized[nk] = String(r[k] === null || r[k] === undefined ? '' : r[k]).trim();
    });
    return normalized;
  }).filter(r => {
    const nameVal = r.card_name || r.name || r.cardname || '';
    return nameVal && !nameVal.startsWith('e.g') && nameVal !== '';
  });
}

async function loadBulkSheetFromBlob(filename, blob, options) {
  const rows = await parseBulkRowsFromBlob(blob, filename);
  finishExcelLoad(filename, rows);
  return rows;
}

async function selectBulkPresetLogo(id, quiet) {
  const opt = getBulkPresetLogoOption(id);
  bulkSelectedPresetLogo = opt.id;
  bulkLogoSourceMode = 'existing';
  renderBulkExistingSelectors();
  setBulkSourceNote('bulk-logo-source-note', 'existing', 'Using existing file: ' + opt.fileName + '. Upload a new ZIP anytime to override it.');
  try {
    const blob = await fetchExistingBulkFileBlob(opt.fileName);
    await loadBulkLogosFromZipBlob(blob, opt.fileName, { quiet: !!quiet });
  } catch (err) {
    setBulkSourceNote('bulk-logo-source-note', 'error', 'Could not load ' + opt.fileName + '. Upload a ZIP instead.');
    toast('Existing logo ZIP error: ' + err.message, 'var(--red)');
    reportClientIssue('error', err);
  }
}

async function selectBulkPresetSheet(id, quiet) {
  const opt = getBulkPresetSheetOption(id);
  bulkSelectedPresetSheet = opt.id;
  bulkSheetSourceMode = 'existing';
  renderBulkExistingSelectors();
  setBulkSourceNote('bulk-sheet-source-note', 'existing', 'Using existing data file: ' + opt.fileName + '. Upload a new file anytime to override it.');
  try {
    const blob = await fetchExistingBulkFileBlob(opt.fileName);
    await loadBulkSheetFromBlob(opt.fileName, blob, { quiet: !!quiet });
  } catch (err) {
    setBulkSourceNote('bulk-sheet-source-note', 'error', 'Could not load ' + opt.fileName + '. Upload a CSV / XLSX instead.');
    toast('Existing sheet error: ' + err.message, 'var(--red)');
    reportClientIssue('error', err);
  }
}

function ensureBulkExistingSources() {
  renderBulkExistingSelectors();
  if (bulkExistingSourcesInitialized) return;
  bulkExistingSourcesInitialized = true;
  selectBulkPresetLogo(bulkSelectedPresetLogo, true);
  selectBulkPresetSheet(bulkSelectedPresetSheet, true);
}

function getFolderById(fid) {
  return LIB.folders.find(f => f.id === fid) || null;
}

function getCardById(fid, cid) {
  const folder = getFolderById(fid);
  if (!folder) return null;
  return folder.cards.find(c => c.id === cid) || null;
}

function ensureFolderSharedOverrides(folder) {
  if (!folder) return {};
  if (!folder.sharedOverrides || typeof folder.sharedOverrides !== 'object') folder.sharedOverrides = {};
  return folder.sharedOverrides;
}

function getEffectiveCardData(fid, data) {
  return jclone(data || {});
}

function normalizeLibShape(data) {
  if (!data || typeof data !== 'object') return { folders: [] };
  if (!Array.isArray(data.folders)) data.folders = [];
  data.folders = data.folders.map(folder => {
    const sourceFolder = folder && typeof folder === 'object' ? folder : {};
    const sharedOverrides = sourceFolder.sharedOverrides && typeof sourceFolder.sharedOverrides === 'object'
      ? { ...sourceFolder.sharedOverrides }
      : {};
    if (sharedOverrides.bgSrc) sharedOverrides.bgSrc = normalizeImageSrc(sharedOverrides.bgSrc);
    if (sharedOverrides.logoSrc) sharedOverrides.logoSrc = normalizeImageSrc(sharedOverrides.logoSrc);
    return {
      ...sourceFolder,
      id: normalizeEntityId(sourceFolder.id),
      name: String(sourceFolder.name || 'Untitled Folder'),
      tags: normalizeTextList(sourceFolder.tags),
      cards: Array.isArray(sourceFolder.cards) ? sourceFolder.cards.map(card => {
        const sourceCard = card && typeof card === 'object' ? card : {};
        const cardData = sourceCard.data && typeof sourceCard.data === 'object' ? jclone(sourceCard.data) : {};
        if (cardData.bgSrc) cardData.bgSrc = normalizeImageSrc(cardData.bgSrc);
        if (cardData.logoSrc) cardData.logoSrc = normalizeImageSrc(cardData.logoSrc);
        return {
          ...sourceCard,
          id: normalizeEntityId(sourceCard.id),
          name: String(sourceCard.name || 'Untitled Card'),
          date: String(sourceCard.date || ''),
          thumb: normalizeImageSrc(sourceCard.thumb),
          thumbHash: String(sourceCard.thumbHash || ''),
          tags: normalizeTextList(sourceCard.tags),
          data: cardData
        };
      }) : [],
      sharedOverrides
    };
  });
  data.folders.forEach(isolateFolderCardDataRefs);
  const assets = data.assets && typeof data.assets === 'object' ? data.assets : {};
  data.assets = {
    backgrounds: Array.isArray(assets.backgrounds)
      ? assets.backgrounds.map(asset => {
        const sourceAsset = asset && typeof asset === 'object' ? asset : {};
        return {
          ...sourceAsset,
          id: normalizeEntityId(sourceAsset.id),
          name: String(sourceAsset.name || 'Background'),
          src: normalizeImageSrc(sourceAsset.src)
        };
      }).filter(asset => asset.src)
      : [],
    logos: Array.isArray(assets.logos)
      ? assets.logos.map(asset => {
        const sourceAsset = asset && typeof asset === 'object' ? asset : {};
        return {
          ...sourceAsset,
          id: normalizeEntityId(sourceAsset.id),
          name: String(sourceAsset.name || 'Logo'),
          src: normalizeImageSrc(sourceAsset.src)
        };
      }).filter(asset => asset.src)
      : []
  };
  return data;
}

function buildLocalLibCachePayload(source) {
  const data = normalizeLibShape(jclone(source || { folders: [] }));
  data.folders.forEach(folder => {
    folder.cards.forEach(card => {
      card.thumb = '';
      card.thumbHash = '';
      if (card.data) {
        card.data.bgSrc = '';
        card.data.logoSrc = '';
      }
    });
  });
  data.assets = { backgrounds: [], logos: [] };
  return data;
}

function readLocalLibCache() {
  try {
    const raw = localStorage.getItem(LIB_STORAGE_KEY);
    return raw ? normalizeLibShape(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

function writeLocalLibCache(showWarning) {
  const lite = buildLocalLibCachePayload(LIB);
  try {
    localStorage.setItem(LIB_STORAGE_KEY, JSON.stringify(lite));
    return true;
  }
  catch (e) {
    if (showWarning !== false) toast('Browser cache full: local metadata cache not updated', 'var(--yellow)');
    return false;
  }
}

function saveLastOpenedCard(fid, cid) {
  if (!fid || !cid) return;
  try {
    localStorage.setItem(LAST_OPENED_CARD_KEY, JSON.stringify({ fid, cid }));
  } catch (e) { }
}

function readLastOpenedCard() {
  try {
    const raw = localStorage.getItem(LAST_OPENED_CARD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setEditorEmptyState(isEmpty) {
  const stage = $('card-stage');
  const shell = document.querySelector('.stage-shell');
  const preview = document.querySelector('.preview');
  const posBar = document.querySelector('.pos-bar');
  const transformBox = $('transform-box');
  const placeholder = $('card-ph');
  if (stage) {
    stage.classList.toggle('is-empty', !!isEmpty);
    stage.dataset.empty = isEmpty ? '1' : '0';
  }
  if (shell) shell.classList.toggle('is-empty', !!isEmpty);
  if (preview) preview.classList.toggle('is-empty', !!isEmpty);
  if (posBar) posBar.classList.toggle('is-empty', !!isEmpty);
  if (placeholder) placeholder.style.display = isEmpty ? 'flex' : 'none';
  if (posBar) {
    const hint = posBar.querySelector('.pos-hint');
    if (hint) hint.textContent = isEmpty ? 'Upload a PNG to start designing' : 'Click & drag to reposition';
  }
  if (transformBox && isEmpty) transformBox.classList.remove('on');
  if (isEmpty) clearSelectedElement();
}

function parseTags(text) {
  if (!text) return [];
  return Array.from(new Set(
    String(text)
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean)
      .slice(0, 12)
  ));
}

function tagsToText(tags) {
  return (Array.isArray(tags) ? tags : []).join(', ');
}

function getBannerTemplate(templateId) {
  return BANNER_TEMPLATES[templateId] || BANNER_TEMPLATES['nifty-expiry'];
}

function setBannerStatus(text, tone) {
  const chip = $('banner-status');
  if (!chip) return;
  chip.textContent = text;
  chip.dataset.tone = tone || '';
}

function saveBannerDraft() {
  try {
    localStorage.setItem(BANNER_DRAFT_KEY, JSON.stringify(bannerState));
    return true;
  } catch (err) {
    return false;
  }
}

function readBannerDraft() {
  try {
    const raw = localStorage.getItem(BANNER_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function syncBannerInput(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = value == null ? '' : String(value);
}

function syncBannerSlider(id) {
  const slider = $(id);
  const num = $(id + '-num');
  if (!slider || !num) return;
  num.value = slider.value;
}

function syncBannerNumber(id) {
  const num = $(id + '-num');
  const slider = $(id);
  if (!slider || !num) return;
  const min = Number(slider.min || 0);
  const max = Number(slider.max || 0);
  let value = Number(num.value || slider.value || 0);
  if (Number.isFinite(min)) value = Math.max(min, value);
  if (Number.isFinite(max) && max > min) value = Math.min(max, value);
  slider.value = value;
  num.value = value;
}

function syncBannerInputsFromState() {
  syncBannerInput('banner-template', bannerState.templateId);
  syncBannerInput('banner-prompt', bannerState.prompt);
  syncBannerInput('banner-outer-mode', bannerState.outerMode);
  syncBannerInput('banner-outer-color', bannerState.outerColor);
  syncBannerInput('banner-outer-grad-start', bannerState.outerGradStart);
  syncBannerInput('banner-outer-grad-end', bannerState.outerGradEnd);
  syncBannerInput('banner-kicker', bannerState.kicker);
  syncBannerInput('banner-headline', bannerState.headline);
  syncBannerInput('banner-support', bannerState.support);
  syncBannerInput('banner-art-scale', bannerState.artScale);
  syncBannerInput('banner-art-scale-num', bannerState.artScale);
  syncBannerInput('banner-art-y', bannerState.artY);
  syncBannerInput('banner-art-y-num', bannerState.artY);
  syncBannerInput('banner-title-size', bannerState.titleSize);
  syncBannerInput('banner-title-size-num', bannerState.titleSize);
  syncBannerInput('banner-accent', bannerState.accent);
  updateBannerOuterControls();
}

function initEditorSections() {
  const sections = Array.from(document.querySelectorAll('#tab-editor .lpanel .sec'));
  sections.forEach(sec => {
    if (sec.dataset.sectionInit === '1') return;
    const title = sec.textContent.trim();
    sec.dataset.sectionInit = '1';
    sec.classList.add('sec-toggleable');
    sec.innerHTML = `
      <span class="sec-label">${title}</span>
      <span class="sec-hint">Current card only</span>
      <button type="button" class="sec-toggle-btn" aria-label="Toggle ${title} section">-</button>
    `;
  });

  const toggleSection = (sec, forceState) => {
    if (!sec) return;
    const collapsed = typeof forceState === 'boolean' ? forceState : !sec.classList.contains('is-collapsed');
    sec.classList.toggle('is-collapsed', collapsed);
    const btn = sec.querySelector('.sec-toggle-btn');
    if (btn) {
      btn.textContent = collapsed ? '+' : '-';
      btn.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${sec.dataset.sectionTitle || sec.textContent.trim()} section`);
    }
    let node = sec.nextElementSibling;
    while (node && !node.classList.contains('sec')) {
      if (!node.dataset.sectionKeepVisible) node.style.display = collapsed ? 'none' : '';
      node = node.nextElementSibling;
    }
  };

  sections.forEach(sec => {
    if (!sec.dataset.sectionBound) {
      sec.dataset.sectionBound = '1';
      sec.addEventListener('click', e => {
        if (e.target.closest('.sec-toggle-btn')) return;
        toggleSection(sec);
      });
      const btn = sec.querySelector('.sec-toggle-btn');
      if (btn) {
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          toggleSection(sec);
        });
      }
    }
    if (!sec.dataset.sectionTitle) sec.dataset.sectionTitle = sec.querySelector('.sec-label')?.textContent?.trim() || sec.textContent.trim();
    toggleSection(sec, false);
  });
}

function updateBannerOuterControls() {
  const mode = (bannerState.outerMode || 'solid').toLowerCase();
  const solidActive = mode === 'solid';
  const gradientActive = mode === 'gradient';
  const baseInput = $('banner-outer-color');
  const gradStart = $('banner-outer-grad-start');
  const gradEnd = $('banner-outer-grad-end');
  const fields = [baseInput, gradStart, gradEnd].filter(Boolean);
  fields.forEach(el => {
    const wrap = el && el.parentElement;
    if (wrap) wrap.style.opacity = '1';
    if (el) el.disabled = false;
  });
  if (baseInput) {
    baseInput.disabled = gradientActive;
    if (baseInput.parentElement) {
      baseInput.parentElement.style.opacity = gradientActive ? '0.5' : '1';
    }
  }
  [gradStart, gradEnd].forEach(el => {
    if (!el) return;
    el.disabled = solidActive;
    if (el.parentElement) {
      el.parentElement.style.opacity = solidActive ? '0.5' : '1';
    }
  });
}

function applyBannerTemplate(templateId, opts = {}) {
  const template = getBannerTemplate(templateId);
  bannerState.templateId = templateId;
  bannerState.prompt = template.prompt;
  bannerState.outerMode = template.outerMode;
  bannerState.outerColor = template.outerColor;
  bannerState.outerGradStart = template.outerGradStart;
  bannerState.outerGradEnd = template.outerGradEnd;
  bannerState.kicker = template.kicker;
  bannerState.headline = template.headline;
  bannerState.support = template.support;
  bannerState.accent = template.accent;
  if (opts.resetArt !== false) {
    bannerState.artSrc = '';
    bannerState.source = 'local';
    bannerImage = null;
  }
  bannerState.status = bannerState.source === 'gemini' ? 'Gemini art ready' : 'Local preview';
  syncBannerInputsFromState();
  saveBannerDraft();
  scheduleBannerRender();
}

function loadBannerDraft() {
  if (bannerDraftLoaded) return;
  bannerDraftLoaded = true;
  const saved = readBannerDraft();
  const template = getBannerTemplate((saved && saved.templateId) || bannerState.templateId);
  bannerState = {
    ...bannerState,
    ...template,
    ...(saved || {})
  };
  bannerState.templateId = bannerState.templateId || 'nifty-expiry';
  const activeTemplate = getBannerTemplate(bannerState.templateId);
  bannerState.prompt = bannerState.prompt || activeTemplate.prompt;
  bannerState.outerMode = bannerState.outerMode || activeTemplate.outerMode || 'solid';
  bannerState.outerColor = bannerState.outerColor || activeTemplate.outerColor || '#ffffff';
  bannerState.outerGradStart = bannerState.outerGradStart || activeTemplate.outerGradStart || '#ffffff';
  bannerState.outerGradEnd = bannerState.outerGradEnd || activeTemplate.outerGradEnd || '#eaf4ff';
  bannerState.kicker = bannerState.kicker || activeTemplate.kicker;
  bannerState.headline = bannerState.headline || activeTemplate.headline;
  bannerState.support = bannerState.support || activeTemplate.support;
  bannerState.accent = bannerState.accent || activeTemplate.accent;
  bannerState.artScale = Math.max(80, Math.min(140, parseInt(bannerState.artScale, 10) || 100));
  bannerState.artY = Math.max(-40, Math.min(40, parseInt(bannerState.artY, 10) || 0));
  bannerState.titleSize = Math.max(54, Math.min(112, parseInt(bannerState.titleSize, 10) || 86));
  bannerState.source = bannerState.artSrc ? 'gemini' : 'local';
  if (bannerState.artSrc) {
    loadBannerArt(bannerState.artSrc, { silent: true, sourceMode: 'gemini' });
  }
  syncBannerInputsFromState();
  scheduleBannerRender();
}

function onBannerTemplateChange() {
  const nextId = $('banner-template') ? $('banner-template').value : bannerState.templateId;
  applyBannerTemplate(nextId);
  const note = $('banner-note');
  if (note && nextId === 'nifty-expiry') {
    note.textContent = 'The generated artwork is clipped inside the 1312 × 219 safe area.';
  }
}

function onBannerDraftChange() {
  if ($('banner-template')) bannerState.templateId = $('banner-template').value;
  if ($('banner-prompt')) bannerState.prompt = $('banner-prompt').value;
  if ($('banner-outer-mode')) bannerState.outerMode = $('banner-outer-mode').value;
  if ($('banner-outer-color')) bannerState.outerColor = $('banner-outer-color').value;
  if ($('banner-outer-grad-start')) bannerState.outerGradStart = $('banner-outer-grad-start').value;
  if ($('banner-outer-grad-end')) bannerState.outerGradEnd = $('banner-outer-grad-end').value;
  if ($('banner-kicker')) bannerState.kicker = $('banner-kicker').value;
  if ($('banner-headline')) bannerState.headline = $('banner-headline').value;
  if ($('banner-support')) bannerState.support = $('banner-support').value;
  if ($('banner-art-scale')) bannerState.artScale = parseInt($('banner-art-scale').value, 10) || 100;
  if ($('banner-art-y')) bannerState.artY = parseInt($('banner-art-y').value, 10) || 0;
  if ($('banner-title-size')) bannerState.titleSize = parseInt($('banner-title-size').value, 10) || 86;
  if ($('banner-accent')) bannerState.accent = $('banner-accent').value;
  bannerState.status = bannerState.source === 'gemini' ? 'Gemini art ready' : 'Local preview';
  updateBannerOuterControls();
  saveBannerDraft();
  scheduleBannerRender();
}

function scheduleBannerRender() {
  if (bannerRenderQueued) return;
  bannerRenderQueued = requestAnimationFrame(() => {
    bannerRenderQueued = 0;
    renderBannerCanvas();
  });
}

function loadBannerArt(src, options = {}) {
  bannerState.artSrc = src || '';
  const sourceMode = options.sourceMode || 'gemini';
  if (!src) {
    bannerImage = null;
    bannerState.source = 'local';
    bannerState.status = 'Local preview';
    if (!options.silent) {
      saveBannerDraft();
      scheduleBannerRender();
    }
    return;
  }
  const token = ++bannerImageToken;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (token !== bannerImageToken) return;
    bannerImage = img;
    bannerState.source = sourceMode;
    bannerState.status = 'Gemini art ready';
    saveBannerDraft();
    scheduleBannerRender();
  };
  img.onerror = () => {
    if (token !== bannerImageToken) return;
    bannerImage = null;
    bannerState.source = 'local';
    bannerState.status = 'Local preview';
    if (!options.silent) {
      saveBannerDraft();
      scheduleBannerRender();
    }
  };
  img.src = src;
  if (img.complete && img.naturalWidth > 0) {
    bannerImage = img;
    bannerState.source = sourceMode;
    bannerState.status = 'Gemini art ready';
  }
}

function drawRoundedTopRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w / 2, h / 2)));
  ctx.beginPath();
  ctx.moveTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function drawImageCover(ctx, img, x, y, w, h, zoom, offsetY) {
  if (!img || !img.naturalWidth || !img.naturalHeight) return;
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = w / h;
  let drawW = w;
  let drawH = h;
  if (imgRatio > boxRatio) {
    drawH = h;
    drawW = h * imgRatio;
  } else {
    drawW = w;
    drawH = w / imgRatio;
  }
  const scale = Math.max(0.1, (zoom || 100) / 100);
  drawW *= scale;
  drawH *= scale;
  const cx = x + w / 2;
  const cy = y + h / 2 + (offsetY || 0);
  ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
}

function drawBannerFallbackArt(ctx) {
  const { innerX, innerY, innerW, innerH } = BANNER_SIZE;
  const wash = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY + innerH);
  wash.addColorStop(0, 'rgba(120, 178, 255, 0.22)');
  wash.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
  wash.addColorStop(1, 'rgba(74, 142, 255, 0.18)');
  ctx.fillStyle = wash;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  const glow = ctx.createRadialGradient(
    innerX + innerW * 0.52,
    innerY + innerH * 0.34,
    10,
    innerX + innerW * 0.52,
    innerY + innerH * 0.34,
    innerW * 0.42
  );
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
  glow.addColorStop(0.55, 'rgba(255, 255, 255, 0.08)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = 'rgba(56, 116, 210, 0.45)';
  ctx.beginPath();
  ctx.moveTo(innerX, innerY + innerH * 0.7);
  ctx.quadraticCurveTo(innerX + innerW * 0.26, innerY + innerH * 0.46, innerX + innerW * 0.5, innerY + innerH * 0.66);
  ctx.quadraticCurveTo(innerX + innerW * 0.74, innerY + innerH * 0.87, innerX + innerW, innerY + innerH * 0.58);
  ctx.lineTo(innerX + innerW, innerY + innerH);
  ctx.lineTo(innerX, innerY + innerH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBannerText(ctx) {
  const { innerX, innerY, innerW, innerH } = BANNER_SIZE;
  const accent = bannerState.accent || '#2f83ff';
  const kicker = (bannerState.kicker || '').trim();
  const headline = (bannerState.headline || '').trim();
  const support = (bannerState.support || '').trim();
  const centerX = innerX + innerW / 2;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (kicker) {
    ctx.font = '800 26px Inter, sans-serif';
    const measure = ctx.measureText(kicker);
    const padX = 20;
    const pillW = Math.max(130, measure.width + padX * 2);
    const pillH = 44;
    const pillX = centerX - pillW / 2;
    const pillY = innerY + 18;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.9)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    drawRoundedTopRectPath(ctx, pillX, pillY, pillW, pillH, 18);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f4f8ff';
    ctx.fillText(kicker, centerX, pillY + pillH / 2 + 1);
  }

  if (headline) {
    const headlineSize = Math.max(54, Math.min(112, parseInt(bannerState.titleSize, 10) || 86));
    const titleY = innerY + 108;
    const titleParts = headline.split('\n').filter(Boolean);
    ctx.font = `900 ${headlineSize}px Inter, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.26)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
    ctx.strokeStyle = 'rgba(18, 20, 30, 0.96)';
    ctx.lineWidth = 11;
    ctx.fillStyle = '#ffffff';
    if (titleParts.length > 1) {
      const firstY = titleY - headlineSize * 0.34;
      const secondY = titleY + headlineSize * 0.48;
      ctx.strokeText(titleParts[0], centerX, firstY);
      ctx.fillText(titleParts[0], centerX, firstY);
      ctx.font = `900 ${Math.round(headlineSize * 1.14)}px Inter, sans-serif`;
      ctx.strokeText(titleParts[1], centerX, secondY);
      ctx.fillText(titleParts[1], centerX, secondY);
    } else {
      ctx.strokeText(headline, centerX, titleY);
      ctx.fillText(headline, centerX, titleY);
    }
    ctx.shadowBlur = 0;
  }

  if (support) {
    ctx.font = '600 24px Inter, sans-serif';
    ctx.fillStyle = accent;
    ctx.shadowColor = 'rgba(47, 131, 255, 0.18)';
    ctx.shadowBlur = 12;
    ctx.fillText(support, centerX, innerY + innerH - 30);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function renderBannerCanvas() {
  const canvas = $('banner-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = BANNER_SIZE.outerW;
  canvas.height = BANNER_SIZE.outerH;

  const { outerW, outerH, innerX, innerY, innerW, innerH, innerRadius } = BANNER_SIZE;
  ctx.clearRect(0, 0, outerW, outerH);

  if ((bannerState.outerMode || 'solid') === 'gradient') {
    const outerGrad = ctx.createLinearGradient(0, 0, outerW, outerH);
    outerGrad.addColorStop(0, bannerState.outerGradStart || '#f6fbff');
    outerGrad.addColorStop(1, bannerState.outerGradEnd || '#eaf4ff');
    ctx.fillStyle = outerGrad;
  } else {
    ctx.fillStyle = bannerState.outerColor || '#ffffff';
  }
  ctx.fillRect(0, 0, outerW, outerH);
  if ((bannerState.outerMode || 'solid') === 'gradient') {
    const skyGlow = ctx.createRadialGradient(outerW * 0.5, 18, 10, outerW * 0.5, 42, outerW * 0.48);
    skyGlow.addColorStop(0, 'rgba(124, 195, 255, 0.22)');
    skyGlow.addColorStop(1, 'rgba(124, 195, 255, 0)');
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, 0, outerW, outerH);
  }

  ctx.save();
  drawRoundedTopRectPath(ctx, innerX, innerY, innerW, innerH, innerRadius);
  ctx.clip();

  const innerGrad = ctx.createLinearGradient(0, innerY, 0, innerY + innerH);
  innerGrad.addColorStop(0, '#fefefe');
  innerGrad.addColorStop(0.42, '#eef7ff');
  innerGrad.addColorStop(1, '#d8eaff');
  ctx.fillStyle = innerGrad;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  if (bannerImage && bannerImage.complete && bannerImage.naturalWidth > 0) {
    drawImageCover(ctx, bannerImage, innerX, innerY, innerW, innerH, bannerState.artScale, bannerState.artY);
  } else {
    drawBannerFallbackArt(ctx);
  }

  const vignette = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerH);
  vignette.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  vignette.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
  vignette.addColorStop(1, 'rgba(255, 255, 255, 0.12)');
  ctx.fillStyle = vignette;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  drawBannerText(ctx);
  ctx.restore();

  const chip = $('banner-status');
  if (chip) {
    chip.textContent =
      bannerState.source === 'gemini'
        ? 'Gemini art ready'
        : 'Local preview';
  }
}

function buildBannerPrompt() {
  const template = getBannerTemplate(bannerState.templateId);
  const userPrompt = (bannerState.prompt || '').trim();
  const lines = [
    template.prompt,
    'Banner text overlay will be drawn separately by code. Use the art only for the background and decorative elements.',
    'Keep a strong safe band through the center. Leave room for a pill-style kicker near the top and large headline copy in the middle.',
    `Primary vibe: ${template.label}.`,
    userPrompt ? `Additional user direction: ${userPrompt}` : ''
  ];
  return lines.filter(Boolean).join('\n');
}

async function generateBannerArt() {
  onBannerDraftChange();
  if (STATIC_DEPLOY_MODE) {
    bannerState.source = 'local';
    bannerState.status = 'Local preview';
    const note = $('banner-note');
    if (note) note.textContent = 'Static GitHub Pages mode does not include the Gemini backend. Showing local preview instead.';
    setBannerStatus('Local preview', 'warn');
    toast('Gemini backend is not available on GitHub Pages static hosting.', 'var(--yellow)');
    scheduleBannerRender();
    return;
  }
  const prompt = buildBannerPrompt();
  const note = $('banner-note');
  if (note) note.textContent = 'Generating banner visual with Gemini...';
  setBannerStatus('Generating...', 'warn');
  try {
    const res = await fetch('/api/banner/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: bannerState.templateId,
        prompt,
        accent: bannerState.accent,
        kicker: bannerState.kicker,
        headline: bannerState.headline,
        support: bannerState.support
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Banner generation failed');
    }
    const blockedByReferrer = !!data.blockedByReferrer;
    if (data.artDataUrl) {
      loadBannerArt(data.artDataUrl, { sourceMode: 'gemini' });
      bannerState.status = 'Gemini art ready';
      bannerState.source = 'gemini';
      saveBannerDraft();
      if (note) note.textContent = 'Gemini art ready. You can still fine-tune the text and crop controls.';
      setBannerStatus('Gemini art ready', 'live');
      toast('Banner art generated!');
      return;
    }
    bannerState.source = 'local';
    bannerState.status = blockedByReferrer
      ? 'Gemini blocked by key restrictions'
      : 'Local preview';
    if (note) {
      if (blockedByReferrer) {
        note.textContent = 'Gemini is configured, but this API key blocks the current referrer. Showing local preview until the allowed referrer is used.';
      } else {
        note.textContent = data.error
          ? `Gemini returned: ${data.error}. Showing local banner preview instead.`
          : 'No image returned. Showing the local banner preview instead.';
      }
    }
    setBannerStatus(blockedByReferrer ? 'Gemini blocked' : 'Local preview', 'warn');
    scheduleBannerRender();
  } catch (err) {
    reportClientIssue('warn', 'Banner generation failed:', err);
    bannerState.source = 'local';
    bannerState.status = 'Local preview';
    if (note) note.textContent = 'Gemini is unavailable right now. Showing the local banner preview.';
    setBannerStatus('Local preview', 'warn');
    toast('Banner generation unavailable - using local preview', 'var(--yellow)');
    scheduleBannerRender();
  }
}

function exportBannerPng() {
  const canvas = $('banner-canvas');
  if (!canvas) return;
  const name = (bannerState.headline || bannerState.kicker || 'banner')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'homepage-banner';
  canvas.toBlob(blob => {
    if (!blob) {
      toast('Banner export failed', 'var(--red)');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
    toast('Banner PNG downloaded!');
  }, 'image/png');
}

function ensureAssetBuckets() {
  LIB = normalizeLibShape(LIB);
  return LIB.assets;
}

function sanitizeAssetName(name, fallback) {
  const value = (name || fallback || 'Asset').toString().trim();
  return value.replace(/\.[^.]+$/, '') || fallback || 'Asset';
}

function makeAssetMeta(type, src, name, extra) {
  return {
    id: uid(),
    type,
    src,
    name: sanitizeAssetName(name, type === 'background' ? 'Background' : 'Logo'),
    createdAt: new Date().toISOString(),
    ...extra
  };
}

function upsertSharedAsset(type, src, name, extra) {
  if (!src) return null;
  const buckets = ensureAssetBuckets();
  const key = type === 'background' ? 'backgrounds' : 'logos';
  const list = buckets[key];
  const existing = list.find(item => item.src === src || item.name === sanitizeAssetName(name, item.name));
  if (existing) {
    existing.src = src;
    existing.name = sanitizeAssetName(name, existing.name);
    Object.assign(existing, extra || {});
    existing.updatedAt = new Date().toISOString();
    saveLib();
    renderAssetManager();
    return existing;
  }
  const asset = makeAssetMeta(type, src, name, extra);
  list.unshift(asset);
  if (list.length > MAX_SHARED_ASSETS) list.length = MAX_SHARED_ASSETS;
  saveLib();
  renderAssetManager();
  return asset;
}

function removeSharedAsset(type, assetId) {
  const key = type === 'background' ? 'backgrounds' : 'logos';
  const list = ensureAssetBuckets()[key];
  const next = list.filter(asset => asset.id !== assetId);
  LIB.assets[key] = next;
  saveLib();
  renderAssetManager();
  toast('Asset removed');
}

function setAutosaveChip(text, tone) {
  const chip = $('autosave-chip');
  if (!chip) return;
  chip.textContent = text;
  chip.classList.remove('live', 'warn');
  if (tone) chip.classList.add(tone);
}

function applyLibMetaFromResponse(res) {
  const revision = parseInt(res.headers.get('X-Library-Revision') || '0', 10);
  libRevision = Number.isFinite(revision) ? revision : 0;
  libUpdatedAt = res.headers.get('X-Library-Updated-At') || '';
  libServerAvailable = true;
}

function hasPendingLibSync() {
  return !!libSyncTimer || libSyncInFlight;
}

function mergeLibraries(serverLib, localLib) {
  const remote = normalizeLibShape(jclone(serverLib));
  const local = normalizeLibShape(jclone(localLib));
  const remoteFolders = new Map(remote.folders.map(folder => [folder.id, folder]));
  const mergedFolders = [];

  local.folders.forEach(localFolder => {
    const remoteFolder = remoteFolders.get(localFolder.id);
    if (!remoteFolder) {
      mergedFolders.push(localFolder);
      return;
    }
    const remoteCardMap = new Map((remoteFolder.cards || []).map(card => [card.id, card]));
    const localCards = Array.isArray(localFolder.cards) ? localFolder.cards : [];
    const mergedCards = [];
    localCards.forEach(localCard => {
      mergedCards.push(localCard);
      remoteCardMap.delete(localCard.id);
    });
    remoteCardMap.forEach(remoteCard => mergedCards.push(remoteCard));
    mergedFolders.push({
      ...remoteFolder,
      ...localFolder,
      sharedOverrides: (localFolder.sharedOverrides && typeof localFolder.sharedOverrides === 'object')
        ? localFolder.sharedOverrides
        : (remoteFolder.sharedOverrides || {}),
      cards: mergedCards
    });
    remoteFolders.delete(localFolder.id);
  });

  remoteFolders.forEach(remoteFolder => mergedFolders.push(remoteFolder));
  return { folders: mergedFolders };
}

async function fetchServerMeta() {
  if (!hasServerApi()) return null;
  try {
    const res = await fetch(LIB_API_META_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    applyLibMetaFromResponse(res);
    return await res.json();
  } catch (e) {
    libServerAvailable = false;
    return null;
  }
}

async function fetchServerLib() {
  if (!hasServerApi()) return null;
  try {
    const res = await fetch(LIB_API_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    applyLibMetaFromResponse(res);
    return normalizeLibShape(await res.json());
  } catch (e) {
    libServerAvailable = false;
    return null;
  }
}

async function pushServerLib(snapshot, silent, attempt) {
  if (!hasServerApi()) return false;
  libSyncInFlight = true;
  try {
    const res = await fetch(LIB_API_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Library-Revision': String(libRevision || 0)
      },
      body: JSON.stringify(snapshot || LIB)
    });
    const payload = await res.json().catch(() => null);
    if (payload && payload.conflict) {
      applyLibMetaFromResponse(res);
      const merged = mergeLibraries(payload && payload.library, snapshot || LIB);
      localStorage.setItem(LIB_CONFLICT_CACHE_KEY, JSON.stringify(buildLocalLibCachePayload(snapshot || LIB)));
      LIB = merged;
      writeLocalLibCache(false);
      renderLib();
      updateSelUI();
      updateFolderEditBanner();
      if ((attempt || 0) < 1) {
        return await pushServerLib(merged, silent, (attempt || 0) + 1);
      }
      if (!silent) toast('Server library changed elsewhere. Merged the latest copy and kept your edits.', 'var(--yellow)');
      return false;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    applyLibMetaFromResponse(res);
    libRemoteUpdateQueued = false;
    localStorage.removeItem(LIB_CONFLICT_CACHE_KEY);
    return true;
  } catch (e) {
    libServerAvailable = false;
    if (!silent) toast('Server sync failed. Data kept in this browser cache.', 'var(--yellow)');
    reportClientIssue('warn', 'Server sync failed:', e);
    return false;
  } finally {
    libSyncInFlight = false;
  }
}

function queueServerLibSync(silent) {
  if (!hasServerApi()) return;
  const snapshot = jclone(LIB);
  clearTimeout(libSyncTimer);
  libSyncTimer = setTimeout(() => {
    libSyncTimer = null;
    pushServerLib(snapshot, silent !== false, 0);
  }, 350);
}

async function refreshLibFromServer(silent) {
  const remote = await fetchServerLib();
  if (!remote) return false;
  LIB = remote;
  libRemoteUpdateQueued = false;
  writeLocalLibCache(false);
  renderLib();
  renderAssetManager();
  renderBulkValidation();
  refreshBulkFolders();
  updateSelUI();
  updateFolderEditBanner();
  if (!silent) toast('Library refreshed from server', 'var(--accent)');
  return true;
}

function startLibPolling() {
  if (!hasServerApi() || libPollTimer) return;
  libPollTimer = setInterval(async () => {
    if (hasPendingLibSync()) return;
    const meta = await fetchServerMeta();
    if (!meta) return;
    if ((meta.revision || 0) > libRevision) {
      if (isDirty) {
        if (!libRemoteUpdateQueued) {
          toast('New library changes are available on the server. Save current work, then reload.', 'var(--yellow)');
          libRemoteUpdateQueued = true;
        }
        return;
      }
      await refreshLibFromServer(true);
    }
  }, 15000);
}

function flushServerLibSync() {
  if (!hasServerApi() || !hasPendingLibSync()) return;
  const snapshot = jclone(LIB);
  clearTimeout(libSyncTimer);
  libSyncTimer = null;
  try {
    fetch(LIB_API_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Library-Revision': String(libRevision || 0)
      },
      body: JSON.stringify(snapshot),
      keepalive: true
    });
  } catch (e) {
    reportClientIssue('warn', 'Flush sync failed:', e);
  }
}

function migrateLegacyFolderOverrides(folder) {
  const shared = ensureFolderSharedOverrides(folder);
  const keys = Object.keys(shared);
  if (!keys.length) return false;
  (folder.cards || []).forEach(card => {
    if (!card || !card.data) return;
    FOLDER_OVERRIDE_KEYS.forEach(key => {
      if (shared[key] !== undefined) card.data[key] = jclone(shared[key]);
    });
  });
  folder.sharedOverrides = {};
  return true;
}

function updateFolderEditBanner() {
  const banner = $('folder-sync-banner');
  const text = $('folder-sync-banner-text');
  const btn = $('folder-sync-apply');
  if (!banner) return;
  if (!folderEditScope) {
    banner.style.display = 'none';
    if (text) text.textContent = '';
    if (btn) btn.disabled = true;
    return;
  }
  const folder = getFolderById(folderEditScope.fid);
  banner.style.display = 'flex';
  if (text) {
    text.textContent = folder
      ? 'Editing this card only in folder: ' + folder.name
      : 'Editing this card only. Use Apply to All Cards to sync this folder.';
  }
  if (btn) btn.disabled = false;
}

function syncLibraryFolderOpenState() {
  const fids = new Set();
  if (curFolderId) fids.add(curFolderId);
  if (libraryPinnedFolderId) fids.add(libraryPinnedFolderId);
  if (folderEditScope && folderEditScope.fid) fids.add(folderEditScope.fid);
  selectedCards.forEach(sel => {
    if (sel && sel.fid) fids.add(sel.fid);
  });
  fids.forEach(fid => {
    const fc = $('fc-' + fid);
    const ar = $('arr-' + fid);
    if (fc) fc.classList.add('op');
    if (ar) ar.classList.add('op');
  });
}

function clearFolderEditScope() {
  folderEditScope = null;
  folderEditBaseData = null;
  folderEditInitialData = null;
  lastFolderSyncSnapshot = null;
  updateFolderEditBanner();
}

function folderEditBaseKey(fid, cid) {
  return fid && cid ? fid + '::' + cid : '';
}

function rememberFolderEditBase(fid, cid, data) {
  const key = folderEditBaseKey(fid, cid);
  if (!key) return;
  folderSyncBaseByCard.set(key, jclone(data || {}));
}

function getRememberedFolderEditBase(fid, cid, fallback) {
  const key = folderEditBaseKey(fid, cid);
  if (!key) return jclone(fallback || {});
  if (folderSyncBaseByCard.has(key)) return jclone(folderSyncBaseByCard.get(key));
  const base = jclone(fallback || {});
  folderSyncBaseByCard.set(key, jclone(base));
  return base;
}

function isolateFolderCardDataRefs(folder) {
  if (!folder || !Array.isArray(folder.cards)) return;
  const seen = new Set();
  folder.cards.forEach(card => {
    if (!card || !card.data || typeof card.data !== 'object') return;
    if (seen.has(card.data)) card.data = jclone(card.data);
    else seen.add(card.data);
  });
}

function cardExportCacheKey(d, fid, fmt, q) {
  return [fid || 'global', fmt || 'jpeg', q || 0, getStateHash(d || {})].join('|');
}

function cacheCardExportResult(key, result) {
  if (!key || !result) return;
  if (exportRenderCache.has(key)) exportRenderCache.delete(key);
  exportRenderCache.set(key, { dataUrl: result.dataUrl, ext: result.ext });
  while (exportRenderCache.size > EXPORT_RENDER_CACHE_LIMIT) {
    const oldest = exportRenderCache.keys().next().value;
    if (!oldest) break;
    exportRenderCache.delete(oldest);
  }
}

function getCachedCardExportResult(key) {
  if (!key || !exportRenderCache.has(key)) return null;
  const cached = exportRenderCache.get(key);
  exportRenderCache.delete(key);
  exportRenderCache.set(key, cached);
  return { dataUrl: cached.dataUrl, ext: cached.ext };
}

function refreshLibraryCardEntry(fid, cid, opts) {
  const options = opts || {};
  const card = getCardById(fid, cid);
  if (!card) return false;
  const el = $('ci-' + cid);
  if (!el) return false;
  const thumbEl = el.querySelector('.ci-thumb');
  const nameEl = el.querySelector('.ci-name');
  const dateEl = el.querySelector('.ci-date');
  if (nameEl) nameEl.textContent = card.name || '';
  if (dateEl) dateEl.textContent = card.date || '';
  if (thumbEl && options.thumb !== false) {
    thumbEl.innerHTML = card.thumb ? `<img src="${escapeHtml(card.thumb)}" alt="">` : 'PNG';
  }
  el.classList.toggle('selected', isSelected(cid));
  return true;
}

function scheduleCardThumbRefresh(fid, cid) {
  if (!fid || !cid) return;
  const key = folderEditBaseKey(fid, cid);
  if (!key) return;
  clearTimeout(cardThumbRefreshTimers.get(key));
  cardThumbRefreshTimers.delete(key);
  const timer = setTimeout(() => {
    cardThumbRefreshTimers.delete(key);
    refreshCardThumb(fid, cid);
  }, 900);
  cardThumbRefreshTimers.set(key, timer);
}

async function refreshCardThumb(fid, cid) {
  const folder = getFolderById(fid);
  if (!folder) return;
  const card = folder.cards.find(c => c.id === cid);
  if (!card || !card.data || !card.data.bgSrc || card.data.bgSrc.length < 10) return;
  const effective = getEffectiveCardData(fid, card.data);
  const hash = getStateHash(effective);
  if (card.thumb && card.thumbHash === hash) return;
  const savedState = getData();
  const savedName = curName;
  const savedCardId = curCardId;
  const savedFolderId = curFolderId;
  const savedScope = folderEditScope ? { ...folderEditScope } : null;
  const savedBase = jclone(folderEditBaseData);
  const savedSnapshot = jclone(lastFolderSyncSnapshot);
  const savedMutationVersion = editorMutationVersion;
  beginFolderSyncPause();
  try {
    await loadCardDataForExport(effective);
    card.thumb = await snap();
    card.thumbHash = hash;
    saveLib();
    refreshLibraryCardEntry(fid, cid, { thumb: true });
  } catch (err) {
    reportClientIssue('error', 'refreshCardThumb error:', err);
  } finally {
    const editorChangedDuringRefresh =
      editorMutationVersion !== savedMutationVersion ||
      curCardId !== savedCardId ||
      curFolderId !== savedFolderId ||
      curName !== savedName ||
      JSON.stringify(folderEditScope || null) !== JSON.stringify(savedScope || null);

    if (!editorChangedDuringRefresh) {
      setData(savedState);
      curName = savedName;
      $('cur-name').textContent = savedName;
      curCardId = savedCardId;
      curFolderId = savedFolderId;
      folderEditScope = savedScope;
      folderEditBaseData = savedBase;
      lastFolderSyncSnapshot = savedSnapshot || captureFolderSyncState();
    } else {
      lastFolderSyncSnapshot = folderEditScope ? captureFolderSyncState() : null;
    }
    endFolderSyncPause();
    updateFolderEditBanner();
  }
}

function beginFolderSyncPause() {
  folderSyncPause++;
}

function endFolderSyncPause() {
  folderSyncPause = Math.max(0, folderSyncPause - 1);
  if (folderSyncPause === 0 && folderEditScope) {
    lastFolderSyncSnapshot = captureFolderSyncState();
    updateFolderEditBanner();
  }
}

function captureFolderSyncState() {
  const state = getData();
  const picked = {};
  FOLDER_OVERRIDE_KEYS.forEach(key => {
    picked[key] = jclone(state[key]);
  });
  return picked;
}

async function applyCurrentCardToFolder() {
  flushCurrentCardAutoSave();
  if (isDirty) saveDraftNow();
  if (!folderEditScope || !curFolderId || curFolderId !== folderEditScope.fid) {
    toast('Open a card from a folder first', 'var(--red)');
    return;
  }
  const folder = getFolderById(folderEditScope.fid);
  if (!folder || !folder.cards || !folder.cards.length) {
    toast('Folder not found', 'var(--red)');
    return;
  }
  isolateFolderCardDataRefs(folder);

  const source = getData();
  const base = jclone(folderEditInitialData || folderEditBaseData || getRememberedFolderEditBase(folderEditScope.fid, folderEditScope.cid, folderEditBaseData || {}));
  const changedKeys = FOLDER_OVERRIDE_KEYS.filter(key => {
    const prev = key === 'pos' ? JSON.stringify(base[key] || {}) : JSON.stringify(base[key] ?? '');
    const next = key === 'pos' ? JSON.stringify(source[key] || {}) : JSON.stringify(source[key] ?? '');
    return prev !== next;
  });
  if (!changedKeys.length) {
    toast('Make a change in this card first, then click Apply to All Cards', 'var(--yellow)');
    return;
  }

  folder.cards.forEach(card => {
    if (!card || !card.data) return;
    changedKeys.forEach(key => {
      if (source[key] !== undefined) card.data[key] = jclone(source[key]);
    });
    rememberFolderEditBase(folder.id, card.id, card.data);
  });
  folder.sharedOverrides = {};
  const currentCard = getCardById(folderEditScope.fid, folderEditScope.cid);
  if (currentCard) {
    folderEditBaseData = jclone(currentCard.data);
    folderEditInitialData = jclone(currentCard.data);
  }
  libraryPinnedFolderId = folder.id;
  lastFolderSyncSnapshot = captureFolderSyncState();
  saveLib();
  renderLib();
  updateSelUI();
  syncLibraryFolderOpenState();
  updateFolderEditBanner();
  await refreshFolderThumbs(folder.id);
  toast('Applied ' + changedKeys.length + ' changed field' + (changedKeys.length === 1 ? '' : 's') + ' to all ' + folder.cards.length + ' cards in "' + folder.name + '"');
}

async function refreshFolderThumbs(fid) {
  const folder = getFolderById(fid);
  if (!folder || !folder.cards || !folder.cards.length) return;
  folderSyncPause++;
  const savedData = getData();
  const savedName = curName;
  const savedCardId = curCardId;
  const savedFolderId = curFolderId;
  const savedScope = folderEditScope ? { ...folderEditScope } : null;
  const savedBase = jclone(folderEditBaseData);
  const savedSnapshot = jclone(lastFolderSyncSnapshot);
  const savedMutationVersion = editorMutationVersion;
  try {
    for (const card of folder.cards) {
      if (!card.data || !card.data.bgSrc) continue;
      const effective = getEffectiveCardData(fid, card.data);
      const hash = getStateHash(effective);
      if (card.thumb && card.thumbHash === hash) continue;
      await loadCardDataForExport(effective);
      card.thumb = await snap();
      card.thumbHash = hash;
      refreshLibraryCardEntry(fid, card.id, { thumb: true });
    }
    saveLib();
    renderLib();
    updateSelUI();
  } catch (err) {
    reportClientIssue('error', 'refreshFolderThumbs error:', err);
  } finally {
    const editorChangedDuringRefresh =
      editorMutationVersion !== savedMutationVersion ||
      curCardId !== savedCardId ||
      curFolderId !== savedFolderId ||
      curName !== savedName ||
      JSON.stringify(folderEditScope || null) !== JSON.stringify(savedScope || null);

    if (!editorChangedDuringRefresh) {
      setData(savedData);
      curName = savedName;
      $('cur-name').textContent = savedName;
      curCardId = savedCardId;
      curFolderId = savedFolderId;
      folderEditScope = savedScope;
      folderEditBaseData = savedBase;
      lastFolderSyncSnapshot = savedSnapshot || captureFolderSyncState();
    } else {
      lastFolderSyncSnapshot = folderEditScope ? captureFolderSyncState() : null;
    }
    endFolderSyncPause();
    updateFolderEditBanner();
  }
}

function scheduleFolderThumbRefresh(fid) {
  if (!fid) return;
  clearTimeout(folderThumbRefreshTimer);
  folderThumbRefreshTimer = setTimeout(() => {
    refreshFolderThumbs(fid);
  }, 1200);
}

function sync(s, d) { $(d).textContent = $(s).value; dirty(); }
// Sync slider â†’ number input
function syncNum(sid) {
  const slider = $(sid); const num = $(sid + '-num');
  if (num) num.value = slider.value;
  dirty();
}
// Sync number input â†’ slider
function syncSlider(sid) {
  const num = $(sid + '-num'); const slider = $(sid);
  if (!num || !slider) return;
  let val = parseInt(num.value) || parseInt(slider.min) || 1;
  const mn = parseInt(slider.min) || 1, mx = parseInt(slider.max) || 999;
  val = Math.max(mn, Math.min(mx, val));
  // expand slider max if user types higher value
  if (val > mx) slider.max = val + 50;
  slider.value = val; num.value = val;
  dirty();
}
function dirty() {
  editorMutationVersion++;
  isDirty = true;
  $('udot').classList.add('on');
  queueDraftAutosave();
  queueCurrentCardAutoSave();
}
function clean(statusText, tone) {
  isDirty = false;
  $('udot').classList.remove('on');
  if (statusText) setAutosaveChip(statusText, tone);
}

function syncEditorDirtyToBaseline() {
  if (getStateHash() === editorBaselineHash) {
    discardDraft(false);
    clean('Draft idle');
    return;
  }
  isDirty = true;
  $('udot').classList.add('on');
  queueDraftAutosave();
}

function toast(msg, col) {
  const t = $('toast'); t.textContent = msg;
  t.style.background = col || 'var(--green)';
  t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2600);
}

function setSz(sid, vid, val) {
  const s = $(sid); if (!s) return;
  if (val > parseInt(s.max)) s.max = val + 50;
  s.value = val;
  if ($(vid)) $(vid).textContent = val;
  const num = $(sid + '-num'); if (num) num.value = val;
}

// â•â•â• TABS â•â•â•
function switchTab(tab) {
  $('tab-editor').style.display = tab === 'editor' ? 'flex' : 'none';
  $('tab-banner').style.display = tab === 'banner' ? 'flex' : 'none';
  $('tab-banner').classList.toggle('active', tab === 'banner');
  $('tab-bulk').classList.toggle('active', tab === 'bulk');
  $('nav-editor').classList.toggle('active', tab === 'editor');
  $('nav-banner').classList.toggle('active', tab === 'banner');
  $('nav-bulk').classList.toggle('active', tab === 'bulk');
  if (tab === 'banner') {
    loadBannerDraft();
    scheduleBannerRender();
  }
  if (tab === 'bulk') {
    ensureBulkExistingSources();
    refreshBulkFolders();
    renderBulkValidation();
  }
}

// â•â•â• RENDER â•â•â•
function render() {
  const lsz = parseInt(v('sz-logo')) || 34;
  $('tx-logo').style.height = lsz + 'px';
  $('tx-logo').style.width = 'auto';
  $('tx-logo').style.maxWidth = 'none';
  $('tx-badge-emoji').style.fontSize = lsz + 'px';

  $('tx-subtitle').textContent = v('f-subtitle');
  $('tx-subtitle').style.fontSize = v('sz-subtitle') + 'px';
  $('tx-subtitle').style.color = v('c-subtitle');

  $('tx-bignum').textContent = v('f-bignum');
  $('tx-bignum').style.fontSize = v('sz-bignum') + 'px';
  $('tx-bignum').style.color = v('c-bignum');
  $('tx-months').textContent = v('f-months');
  $('tx-months').style.fontSize = v('sz-months') + 'px';
  $('tx-months').style.color = v('c-months');
  $('tx-free').textContent = v('f-free');
  $('tx-free').style.fontSize = v('sz-free') + 'px';
  $('tx-free').style.color = v('c-free');
  syncOfferLabelWidths();

  $('tx-sublabel').textContent = v('f-sublabel');
  $('tx-sublabel').style.fontSize = v('sz-sublabel') + 'px';
  $('tx-sublabel').style.color = v('c-sublabel');
  const hasSublabel = !!(v('f-sublabel') && v('f-sublabel').trim());
  const sublabelGap = Math.max(0, parseInt(v('gap-sublabel'), 10) || 10);
  $('tx-sublabel').style.display = hasSublabel ? 'block' : 'none';
  $('tx-sublabel').style.marginTop = hasSublabel ? sublabelGap + 'px' : '0';
  $('tx-sublabel').style.opacity = hasSublabel ? '1' : '0';
  $('tx-sublabel').style.pointerEvents = hasSublabel ? 'auto' : 'none';

  $('tx-orig').textContent = '₹' + v('f-orig');
  $('tx-orig').style.fontSize = v('sz-orig') + 'px';
  $('tx-orig').style.color = v('c-orig');
  $('tx-orig').style.setProperty('--strike-color', v('c-orig-strike') || v('c-orig'));
  $('tx-final').textContent = '₹' + v('f-final');
  $('tx-final').style.fontSize = v('sz-final') + 'px';
  $('tx-final').style.color = v('c-final');
  queueOfferAutoCenter(true);
  queueTransformBoxUpdate();
}

// â•â•â• DRAG â•â•â•
function syncOfferLabelWidths() {
  const months = $('tx-months');
  const free = $('tx-free');
  if (!months || !free || !months.parentElement) return;

  const labelCol = months.parentElement;
  months.style.display = 'block';
  months.style.whiteSpace = 'nowrap';
  months.style.width = '';
  months.style.alignSelf = 'flex-start';
  months.style.textAlign = 'left';
  months.style.transform = 'none';
  months.style.transformOrigin = 'left center';

  free.style.display = 'block';
  free.style.whiteSpace = 'nowrap';
  free.style.width = '';
  free.style.alignSelf = 'flex-start';
  free.style.textAlign = 'left';

  labelCol.style.width = 'auto';

  const targetWidth = free.getBoundingClientRect().width;
  const naturalMonthsWidth = months.getBoundingClientRect().width;
  if (!targetWidth || !naturalMonthsWidth) return;

  labelCol.style.width = targetWidth + 'px';
  free.style.width = targetWidth + 'px';
  months.style.width = naturalMonthsWidth + 'px';

  const scaleX = targetWidth / naturalMonthsWidth;
  months.style.transform = 'scaleX(' + Math.max(0.7, Math.min(1.8, scaleX)).toFixed(4) + ')';
}

const ENAMES = { badge: 'Logo/Badge', subtitle: 'Subtitle', offer: 'Offer Block', sublabel: 'Description', pricing: 'Pricing' };
const K2ID = { badge: 'tx-badge', subtitle: 'tx-subtitle', offer: 'tx-offer', pricing: 'tx-pricing' };
const RESIZE_SIZE_FIELDS = {
  badge: ['sz-logo'],
  subtitle: ['sz-subtitle'],
  offer: ['sz-bignum', 'sz-months', 'sz-free', 'sz-sublabel'],
  pricing: ['sz-orig', 'sz-final']
};
const SIZE_VALUE_IDS = {
  'sz-logo': 'sv-logo',
  'sz-subtitle': 'sv-subtitle',
  'sz-bignum': 'sv-bignum',
  'sz-months': 'sv-months',
  'sz-free': 'sv-free',
  'sz-sublabel': 'sv-sublabel',
  'sz-orig': 'sv-orig',
  'sz-final': 'sv-final'
};
let selEl = null, dragging = false, dsx = 0, dsy = 0, elsl = 0, elst = 0;
let dragChanged = false;
let transformFrame = 0;
let resizeState = null;

function cloneScaleState(scaleState) {
  const merged = JSON.parse(JSON.stringify(DSCALES));
  if (!scaleState || typeof scaleState !== 'object') return merged;
  Object.keys(merged).forEach(key => {
    const source = scaleState[key] || {};
    const x = parseFloat(source.x);
    const y = parseFloat(source.y);
    merged[key] = {
      x: isFinite(x) && x > 0 ? +x.toFixed(4) : 1,
      y: isFinite(y) && y > 0 ? +y.toFixed(4) : 1
    };
  });
  return merged;
}

function ensureElemScale() {
  elemScale = cloneScaleState(elemScale);
  return elemScale;
}

function getElemScale(key) {
  const scales = ensureElemScale();
  return scales[key] || { x: 1, y: 1 };
}

function getElementTransform(key) {
  return 'translateX(-50%)';
}

function applyElementTransform(key, el) {
  const target = el || $(K2ID[key]);
  if (!target) return;
  target.style.transform = getElementTransform(key);
}

function queueTransformBoxUpdate() {
  if (typeof window === 'undefined') return;
  if (transformFrame) cancelAnimationFrame(transformFrame);
  transformFrame = requestAnimationFrame(() => {
    transformFrame = 0;
    updateTransformBox();
  });
}

function clearSelectedElement() {
  if (resizeState) stopResize();
  if (selEl) selEl.classList.remove('sel', 'drag');
  selEl = null;
  if ($('pos-sel')) $('pos-sel').style.display = 'none';
  queueTransformBoxUpdate();
}

function shouldPreserveCanvasSelection(target) {
  return !!(target && (
    target.closest('.tx-el') ||
    target.closest('#card-stage') ||
    target.closest('.transform-box') ||
    target.closest('.pos-bar') ||
    target.closest('.sel-bar') ||
    target.closest('.mo.on') ||
    target.closest('.upbox') ||
    target.closest('#draft-banner') ||
    target.closest('#folder-sync-banner') ||
    target.closest('input') ||
    target.closest('textarea') ||
    target.closest('select') ||
    target.closest('button') ||
    target.closest('label')
  ));
}

function getElementBoundsWithinStage(key) {
  const stage = $('card-stage');
  const el = $(K2ID[key]);
  if (!stage || !el) return null;
  const stageRect = stage.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const baseWidth = el.offsetWidth || width;
  const baseHeight = el.offsetHeight || height;
  return {
    left: rect.left - stageRect.left,
    top: rect.top - stageRect.top,
    right: rect.right - stageRect.left,
    bottom: rect.bottom - stageRect.top,
    width,
    height,
    centerX: rect.left - stageRect.left + width / 2,
    centerY: rect.top - stageRect.top + height / 2,
    baseWidth,
    baseHeight
  };
}

function clampResizeFactor(factor) {
  if (!isFinite(factor)) return 1;
  return Math.max(0.2, Math.min(6, factor));
}

function captureResizeSeed(key) {
  const fields = RESIZE_SIZE_FIELDS[key] || [];
  const seed = {};
  fields.forEach(field => {
    const slider = $(field);
    seed[field] = slider ? (parseInt(slider.value, 10) || 1) : 1;
  });
  return seed;
}

function applyResizeFactor(key, factor) {
  const seed = resizeState && resizeState.seedSizes ? resizeState.seedSizes : captureResizeSeed(key);
  Object.keys(seed).forEach(field => {
    const base = seed[field] || 1;
    const next = Math.max(8, Math.min(400, Math.round(base * factor)));
    setSz(field, SIZE_VALUE_IDS[field] || '', next);
  });
  render();
}

function keepElementInsideStage(key, anchorModeX, anchorModeY, referenceBounds) {
  const stage = $('card-stage');
  const bounds = getElementBoundsWithinStage(key);
  if (!stage || !bounds || !pos[key] || !referenceBounds) return;
  const stageW = stage.offsetWidth || 1;
  const stageH = stage.offsetHeight || 1;

  let desiredCenterX = referenceBounds.centerX;
  if (anchorModeX === 'left') desiredCenterX = referenceBounds.left + bounds.width / 2;
  if (anchorModeX === 'right') desiredCenterX = referenceBounds.right - bounds.width / 2;

  let desiredTop = referenceBounds.top;
  if (anchorModeY === 'bottom') desiredTop = referenceBounds.bottom - bounds.height;
  if (anchorModeY === 'center') desiredTop = referenceBounds.centerY - bounds.height / 2;

  const clampedCenterX = Math.max(bounds.width / 2, Math.min(stageW - bounds.width / 2, desiredCenterX));
  const clampedTop = Math.max(0, Math.min(stageH - bounds.height, desiredTop));

  pos[key].left = +((clampedCenterX / stageW) * 100).toFixed(2);
  pos[key].top = +((clampedTop / stageH) * 100).toFixed(2);
  syncElementPlacement(key);
}

function updateTransformBox() {
  const box = $('transform-box');
  if (!box) return;
  if (!selEl || !selEl.dataset || !selEl.dataset.key) {
    box.classList.remove('on');
    return;
  }
  const key = selEl.dataset.key;
  const bounds = getElementBoundsWithinStage(key);
  if (!bounds || !bounds.width || !bounds.height) {
    box.classList.remove('on');
    return;
  }
  box.style.left = bounds.left + 'px';
  box.style.top = bounds.top + 'px';
  box.style.width = bounds.width + 'px';
  box.style.height = bounds.height + 'px';
  if ($('transform-box-label')) $('transform-box-label').textContent = ENAMES[key] || 'Transform';
  box.classList.add('on');
}

function syncSelectedPositionInputs(key) {
  if (!key || !pos[key]) return;
  updPB(pos[key].left, pos[key].top);
  if ($('le-y-slider')) { $('le-y-slider').value = pos[key].top; $('le-y-num').value = pos[key].top.toFixed(1); }
  if ($('le-x-slider')) { $('le-x-slider').value = pos[key].left; $('le-x-num').value = pos[key].left.toFixed(1); }
}

function syncElementPlacement(key) {
  const el = $(K2ID[key]);
  if (!el || !pos[key]) return;
  el.style.top = pos[key].top + '%';
  el.style.left = pos[key].left + '%';
  applyElementTransform(key, el);
}

function applyPos() {
  Object.keys(pos).forEach(syncElementPlacement);
  queueTransformBoxUpdate();
}

function queueOfferAutoCenter(force) {
  if (typeof window === 'undefined') return;
  if (offerAutoCenterFrame) cancelAnimationFrame(offerAutoCenterFrame);
  offerAutoCenterFrame = requestAnimationFrame(() => {
    offerAutoCenterFrame = requestAnimationFrame(() => {
      offerAutoCenterFrame = 0;
      syncOfferAutoCenter(force);
    });
  });
}

function syncOfferAutoCenter(force) {
  if (!force && !offerAutoCenter) return;
  const stage = $('card-stage');
  const subtitle = $('tx-subtitle');
  const offer = $('tx-offer');
  const pricing = $('tx-pricing');
  if (!stage || !subtitle || !offer || !pricing) return;
  if (!stage.offsetHeight || !subtitle.offsetHeight || !offer.offsetHeight || !pricing.offsetHeight) return;

  const getVerticalBounds = (el) => {
    if (el.id === 'tx-offer') {
      const kids = Array.from(el.children).filter(child => {
        const st = getComputedStyle(child);
        return st.display !== 'none' && child.offsetHeight > 0;
      });
      if (kids.length) {
        const stageRect = stage.getBoundingClientRect();
        const rects = kids.map(child => child.getBoundingClientRect());
        const top = Math.min(...rects.map(rect => rect.top - stageRect.top));
        const bottom = Math.max(...rects.map(rect => rect.bottom - stageRect.top));
        return { top, bottom };
      }
    }
    const stageRect = stage.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return { top: rect.top - stageRect.top, bottom: rect.bottom - stageRect.top };
  };

  const subtitleBounds = getVerticalBounds(subtitle);
  const offerBounds = getVerticalBounds(offer);
  const pricingBounds = getVerticalBounds(pricing);
  const gap = pricingBounds.top - subtitleBounds.bottom;
  const offerContentHeight = offerBounds.bottom - offerBounds.top;
  if (gap <= offerContentHeight) return;

  const offerLayoutTopPx = stage.offsetHeight * ((pos.offer && pos.offer.top) || 0) / 100;
  const offerContentOffsetTop = offerBounds.top - offerLayoutTopPx;
  const targetContentTop = subtitleBounds.bottom + ((gap - offerContentHeight) / 2);
  const centeredTopPx = targetContentTop - offerContentOffsetTop;
  const clampedTopPx = Math.max(0, Math.min(stage.offsetHeight - offer.offsetHeight, centeredTopPx));
  const topPct = +(clampedTopPx / stage.offsetHeight * 100).toFixed(2);

  pos.offer.top = topPct;
  pos.offer.left = 50;
  syncElementPlacement('offer');
  queueTransformBoxUpdate();
}

function renderStageRulers() {
  const x = $('stage-ruler-x');
  const y = $('stage-ruler-y');
  if (!x || !y) return;
  const marks = [0, 25, 50, 75, 100];
  x.innerHTML = marks.map(mark => `<span>${mark}</span>`).join('');
  y.innerHTML = marks.map(mark => `<span>${mark}</span>`).join('');
}

function setStageGuide(id, axis, pct) {
  const guide = $(id);
  const stage = $('card-stage');
  if (!guide || !stage) return;
  const stageW = stage.offsetWidth || stage.getBoundingClientRect().width || 0;
  const stageH = stage.offsetHeight || stage.getBoundingClientRect().height || 0;
  if (axis === 'x') {
    guide.style.left = (STAGE_GUIDE_PADDING + (stageW * pct / 100)) + 'px';
  } else {
    guide.style.top = (STAGE_GUIDE_PADDING + (stageH * pct / 100)) + 'px';
  }
  guide.classList.add('on');
}

function hideSnapGuides() {
  if ($('guide-v')) $('guide-v').classList.remove('on');
  if ($('guide-h')) $('guide-h').classList.remove('on');
}

function applyDragSnap(leftPct, topPct, key) {
  const result = { left: leftPct, top: topPct };
  const xTargets = [{ pct: 50 }];
  const yTargets = [{ pct: 50 }];
  Object.keys(pos).forEach(otherKey => {
    if (otherKey === key || !pos[otherKey]) return;
    xTargets.push({ pct: pos[otherKey].left });
    yTargets.push({ pct: pos[otherKey].top });
  });

  const nearestX = xTargets
    .map(target => ({ ...target, delta: Math.abs(target.pct - leftPct) }))
    .sort((a, b) => a.delta - b.delta)[0];
  const nearestY = yTargets
    .map(target => ({ ...target, delta: Math.abs(target.pct - topPct) }))
    .sort((a, b) => a.delta - b.delta)[0];

  if (nearestX && nearestX.delta <= SNAP_THRESHOLD_PCT) {
    result.left = nearestX.pct;
    setStageGuide('guide-v', 'x', nearestX.pct);
  } else if ($('guide-v')) {
    $('guide-v').classList.remove('on');
  }

  if (nearestY && nearestY.delta <= SNAP_THRESHOLD_PCT) {
    result.top = nearestY.pct;
    setStageGuide('guide-h', 'y', nearestY.pct);
  } else if ($('guide-h')) {
    $('guide-h').classList.remove('on');
  }

  return result;
}

function initDrag() {
  document.querySelectorAll('.tx-el').forEach(e => {
    e.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      startDragPatched(ev.clientX, ev.clientY, ev.currentTarget);
    });
    e.addEventListener('touchstart', ev => {
      ev.preventDefault();
      startDragPatched(ev.touches[0].clientX, ev.touches[0].clientY, ev.currentTarget);
    }, { passive: false });
  });
  document.addEventListener('mousemove', ev => { if (dragging) doDrag(ev.clientX, ev.clientY); });
  document.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      hideSnapGuides();
      if (selEl) selEl.classList.remove('drag');
      if (dragChanged) {
        pushUndo();
        dragChanged = false;
      }
      queueTransformBoxUpdate();
    }
  });
  document.addEventListener('touchmove', ev => { if (dragging) { ev.preventDefault(); doDrag(ev.touches[0].clientX, ev.touches[0].clientY); } }, { passive: false });
  document.addEventListener('touchend', () => {
    if (dragging) {
      dragging = false;
      hideSnapGuides();
      if (selEl) selEl.classList.remove('drag');
      if (dragChanged) {
        pushUndo();
        dragChanged = false;
      }
      queueTransformBoxUpdate();
    }
  });
}

function startDrag(cx, cy, elem) {
  if (selEl) selEl.classList.remove('sel');
  selEl = elem; elem.classList.add('sel', 'drag'); dragging = true;
  dragChanged = false;
  dsx = cx; dsy = cy;
  const key = elem.dataset.key;
  elsl = pos[key] ? pos[key].left : 50;
  elst = pos[key] ? pos[key].top : 50;
  $('pos-sel').style.display = 'inline';
  $('pos-nm').textContent = ENAMES[key] || 'Element';
  updPB(elsl, elst);
  queueTransformBoxUpdate();
}

function doDrag(cx, cy) {
  if (!dragging || !selEl) return;
  const sr = $('card-stage').getBoundingClientRect();
  const k = selEl.dataset.key;
  const nl = Math.max(0, Math.min(100, elsl + (cx - dsx) / sr.width * 100));
  const nt = Math.max(0, Math.min(95, elst + (cy - dsy) / sr.height * 100));
  const snapped = applyDragSnap(nl, nt, k);
  if (Math.abs(snapped.left - elsl) > 0.01 || Math.abs(snapped.top - elst) > 0.01) {
    dragChanged = true;
  }
  if (pos[k]) { pos[k].top = +snapped.top.toFixed(2); pos[k].left = +snapped.left.toFixed(2); }
  syncElementPlacement(k);
  if (k === 'offer') offerAutoCenter = false;
  if (k === 'subtitle' || k === 'pricing') syncOfferAutoCenter(true);
  updPB(snapped.left, snapped.top); dirty();
  queueTransformBoxUpdate();
}

function updPB(l, t) { $('pos-x').textContent = l.toFixed(1); $('pos-y').textContent = t.toFixed(1); }
function resetPos() { pos = JSON.parse(JSON.stringify(DPOS)); offerAutoCenter = true; applyPos(); render(); clearSelectedElement(); dirty(); toast('Positions reset!'); }

function initTransformBox() {
  const box = $('transform-box');
  if (!box) return;
  box.querySelectorAll('.transform-handle').forEach(handle => {
    handle.addEventListener('mousedown', ev => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      startResize(ev.clientX, ev.clientY, handle.dataset.handle, ev.shiftKey, ev.altKey);
    });
    handle.addEventListener('touchstart', ev => {
      if (!ev.touches || !ev.touches.length) return;
      ev.preventDefault();
      ev.stopPropagation();
      startResize(ev.touches[0].clientX, ev.touches[0].clientY, handle.dataset.handle, false, false);
    }, { passive: false });
  });

  document.addEventListener('mousemove', ev => {
    if (!resizeState) return;
    doResize(ev.clientX, ev.clientY, ev.shiftKey, ev.altKey);
  });
  document.addEventListener('mouseup', stopResize);
  document.addEventListener('touchmove', ev => {
    if (!resizeState || !ev.touches || !ev.touches.length) return;
    ev.preventDefault();
    doResize(ev.touches[0].clientX, ev.touches[0].clientY, resizeState.shiftKey, resizeState.altKey);
  }, { passive: false });
  document.addEventListener('touchend', stopResize);
}

function startResize(cx, cy, handle, shiftKey, altKey) {
  if (!selEl || !selEl.dataset || !selEl.dataset.key) return;
  const key = selEl.dataset.key;
  const stage = $('card-stage');
  const bounds = getElementBoundsWithinStage(key);
  if (!stage || !bounds || !bounds.baseWidth || !bounds.baseHeight) return;
  resizeState = {
    key,
    handle,
    stageW: stage.offsetWidth || 1,
    stageH: stage.offsetHeight || 1,
    startX: cx,
    startY: cy,
    startBounds: bounds,
    startPos: jclone(pos[key]),
    seedSizes: captureResizeSeed(key),
    shiftKey: !!shiftKey,
    altKey: !!altKey,
    changed: false
  };
  selEl.classList.add('drag');
  const box = $('transform-box');
  if (box) box.classList.add('resizing');
}

function doResize(cx, cy, shiftKey, altKey) {
  if (!resizeState) return;
  const key = resizeState.key;
  const handle = resizeState.handle;
  const bounds = resizeState.startBounds;
  const hasX = /e|w/.test(handle);
  const hasY = /n|s/.test(handle);
  const useShift = !!shiftKey;
  const useAlt = !!altKey;
  const dx = cx - resizeState.startX;
  const dy = cy - resizeState.startY;
  const xMultiplier = useAlt ? 2 : 1;
  const yMultiplier = useAlt ? 2 : 1;

  let scaleX = 1;
  let scaleY = 1;
  if (handle.indexOf('e') !== -1) scaleX = (bounds.width + dx * xMultiplier) / bounds.width;
  if (handle.indexOf('w') !== -1) scaleX = (bounds.width - dx * xMultiplier) / bounds.width;
  if (handle.indexOf('s') !== -1) scaleY = (bounds.height + dy * yMultiplier) / bounds.height;
  if (handle.indexOf('n') !== -1) scaleY = (bounds.height - dy * yMultiplier) / bounds.height;

  scaleX = clampResizeFactor(scaleX);
  scaleY = clampResizeFactor(scaleY);

  let factor = 1;
  if (hasX && hasY) {
    if (useShift) {
      factor = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    } else {
      factor = (scaleX + scaleY) / 2;
    }
  } else if (hasX) {
    factor = scaleX;
  } else if (hasY) {
    factor = scaleY;
  }
  factor = clampResizeFactor(factor);
  const fitX = hasX ? ((resizeState.stageW - 8) / Math.max(bounds.width, 1)) : Infinity;
  const fitY = hasY ? ((resizeState.stageH - 8) / Math.max(bounds.height, 1)) : Infinity;
  factor = Math.max(0.2, Math.min(factor, fitX, fitY, 4));

  applyResizeFactor(key, factor);
  if (key === 'subtitle' || key === 'pricing') syncOfferAutoCenter(true);

  const anchorModeX = useAlt ? 'center' : handle.indexOf('e') !== -1 ? 'left' : handle.indexOf('w') !== -1 ? 'right' : 'center';
  const anchorModeY = useAlt ? 'center' : handle.indexOf('s') !== -1 ? 'top' : handle.indexOf('n') !== -1 ? 'bottom' : 'top';
  keepElementInsideStage(key, anchorModeX, anchorModeY, bounds);
  syncSelectedPositionInputs(key);
  dirty();
  resizeState.factor = factor;
  queueTransformBoxUpdate();
  resizeState.changed = Math.abs(factor - 1) > 0.01;
}

function stopResize() {
  if (!resizeState) return;
  const changed = resizeState.changed;
  resizeState = null;
  const box = $('transform-box');
  if (box) box.classList.remove('resizing');
  if (selEl) selEl.classList.remove('drag');
  queueTransformBoxUpdate();
  if (changed) pushUndo();
}

// â•â•â• FILE UPLOADS â•â•â•
function applyEditorBackground(src, meta) {
  pngW = meta.width; pngH = meta.height;
  dispScale = Math.min(1, 500 / pngW);
  const dW = Math.round(pngW * dispScale), dH = Math.round(pngH * dispScale);
  const stage = $('card-stage');
  stage.style.width = dW + 'px'; stage.style.height = dH + 'px'; stage.dataset.scale = dispScale;
  $('card-bg-img').src = src; $('card-bg-img').style.display = 'block'; $('card-ph').style.display = 'none';
  setEditorEmptyState(false);
  $('bg-ico').textContent = 'OK';
  $('bg-txt').innerHTML = escapeHtml(meta.name) + '<br><span style="font-size:9px;opacity:.5">' + pngW + ' x ' + pngH + 'px</span>';
  $('bg-box').classList.add('ok');
  const r = pngW / 616;
  setSz('sz-subtitle', 'sv-subtitle', Math.round(35 * r));
  setSz('sz-bignum', 'sv-bignum', Math.round(103 * r));
  setSz('sz-months', 'sv-months', Math.round(28 * r));
  setSz('sz-free', 'sv-free', Math.round(56 * r));
  setSz('sz-sublabel', 'sv-sublabel', Math.round(22 * r));
  setSz('sz-orig', 'sv-orig', Math.round(30 * r));
  setSz('sz-final', 'sv-final', Math.round(52 * r));
  showHint();
  renderStageRulers();
  render();
}

function handleBG(e) {
  const file = e.target.files[0]; if (!file) return;
  readURL(file, src => {
    const tmp = new Image();
    tmp.onload = () => {
      applyEditorBackground(src, {
        name: file.name,
        width: tmp.naturalWidth,
        height: tmp.naturalHeight
      });
      upsertSharedAsset('background', src, file.name, { width: tmp.naturalWidth, height: tmp.naturalHeight });
      dirty();
      pushUndo();

      // â˜… AUTO-APPLY: agar selected cards hain toh BG seedha apply + save
      if (typeof selectedCards !== 'undefined' && selectedCards.length > 0) {
        let count = 0;
        selectedCards.forEach(({ fid, cid }) => {
          const folder = LIB.folders.find(f => f.id === fid);
          if (!folder) return;
          const card = folder.cards.find(c => c.id === cid);
          if (!card || !card.data) return;
          card.data.bgSrc = src;
          card.data.pngW = pngW;
          card.data.pngH = pngH;
          count++;
        });
        if (count > 0) {
          saveLib();
          renderLib();
          // Selection persist rahe â€” clear mat karo
          // Sirf highlight refresh karo
          updateSelUI();
          toast('BG applied & saved to ' + count + ' selected card' + (count !== 1 ? 's' : '') + '!');
        }
      }
    };
    tmp.src = src;
  });
}

function handleLogo(e) {
  if (!e || !e.target || !e.target.files || !e.target.files.length) return;
  handleLogoUpload(e);
}

function readURL(file, cb) { const r = new FileReader(); r.onload = e => cb(e.target.result); r.readAsDataURL(file); }
function showHint() { $('dhint').classList.add('on'); setTimeout(() => $('dhint').classList.remove('on'), 3500); }

// â•â•â• EXPORT â•â•â•
async function renderToCanvas(scale) {
  const stage = $('card-stage');
  if (selEl) selEl.classList.remove('sel', 'drag');
  const transformBox = $('transform-box');
  const hadTransformBox = !!(transformBox && transformBox.classList.contains('on'));
  try {
    if (transformBox) transformBox.classList.remove('on');
    const s = scale || (1 / (parseFloat(stage.dataset.scale) || 1));
    // Ensure html2canvas is loaded (lazy loaded on first export)
    await new Promise(res => ensureH2C(res));
    return await html2canvas(stage, { scale: s, useCORS: true, allowTaint: true, backgroundColor: null, logging: false, width: stage.offsetWidth, height: stage.offsetHeight });
  } finally {
    if (selEl) selEl.classList.add('sel');
    if (hadTransformBox) queueTransformBoxUpdate();
  }
}

async function exportPNGDownload() {
  return exportWithFormat();
}

async function snap() {
  if (!pngW) return null;
  const transformBox = $('transform-box');
  const hadTransformBox = !!(transformBox && transformBox.classList.contains('on'));
  try {
    if (transformBox) transformBox.classList.remove('on');
    await new Promise(res => ensureH2C(res));
    const c = await html2canvas($('card-stage'), { scale: 0.25, useCORS: true, allowTaint: true, backgroundColor: null, logging: false });
    return c.toDataURL('image/jpeg', .5);
  } catch (e) { return null; }
  finally {
    if (hadTransformBox) queueTransformBoxUpdate();
  }
}

// â•â•â• CARD DATA â•â•â•
function getData() {
  return {
    subtitle: v('f-subtitle'), bignum: v('f-bignum'), months: v('f-months'), free: v('f-free'),
    sublabel: v('f-sublabel'), orig: v('f-orig'), final: v('f-final'),
    szLogo: v('sz-logo'), szSubtitle: v('sz-subtitle'), szBignum: v('sz-bignum'),
    szMonths: v('sz-months'), szFree: v('sz-free'), szSublabel: v('sz-sublabel'),
    sublabelGap: v('gap-sublabel'),
    szOrig: v('sz-orig'), szFinal: v('sz-final'),
    cSubtitle: v('c-subtitle'), cBignum: v('c-bignum'), cMonths: v('c-months'),
    cFree: v('c-free'), cSublabel: v('c-sublabel'), cOrig: v('c-orig'), cOrigStrike: v('c-orig-strike'), cFinal: v('c-final'),
    bgSrc: $('card-bg-img').getAttribute('src') || '', logoSrc: $('tx-logo').getAttribute('src') || '',
    activeLogoName,
    offerAutoCenter,
    pngW, pngH, pos: JSON.parse(JSON.stringify(pos)),
    elemScale: JSON.parse(JSON.stringify(DSCALES))
  };
}

function setData(d) {
  offerAutoCenter = d.offerAutoCenter !== undefined ? !!d.offerAutoCenter : true;
  [['f-subtitle', d.subtitle], ['f-bignum', d.bignum], ['f-months', d.months], ['f-free', d.free],
  ['f-sublabel', d.sublabel], ['f-orig', d.orig], ['f-final', d.final],
  ['c-subtitle', d.cSubtitle], ['c-bignum', d.cBignum], ['c-months', d.cMonths],
  ['c-free', d.cFree], ['c-sublabel', d.cSublabel], ['c-orig', d.cOrig], ['c-orig-strike', d.cOrigStrike !== undefined ? d.cOrigStrike : d.cOrig], ['c-final', d.cFinal]
  ].forEach(([id, val]) => { if (val !== undefined && $(id)) $(id).value = val; });

  setSz('sz-logo', 'sv-logo', parseInt(d.szLogo) || 34);
  setSz('sz-subtitle', 'sv-subtitle', parseInt(d.szSubtitle) || 35);
  setSz('sz-bignum', 'sv-bignum', parseInt(d.szBignum) || 103);
  setSz('sz-months', 'sv-months', parseInt(d.szMonths) || 28);
  setSz('sz-free', 'sv-free', parseInt(d.szFree) || 56);
  setSz('sz-sublabel', 'sv-sublabel', parseInt(d.szSublabel) || 22);
  setSz('gap-sublabel', null, parseInt(d.sublabelGap, 10) || 10);
  setSz('sz-orig', 'sv-orig', parseInt(d.szOrig) || 30);
  setSz('sz-final', 'sv-final', parseInt(d.szFinal) || 52);

  // Apply positions first
  pos = d.pos ? JSON.parse(JSON.stringify(d.pos)) : JSON.parse(JSON.stringify(DPOS));
  elemScale = JSON.parse(JSON.stringify(DSCALES));
  applyPos();

  // Set bg image â€” â˜… FIXED: handle cached + always ensure render
  if (d.bgSrc && d.bgSrc.length > 10) {
    pngW = d.pngW || 616; pngH = d.pngH || 635; dispScale = Math.min(1, 500 / pngW);
    const dW = Math.round(pngW * dispScale), dH = Math.round(pngH * dispScale);
    const stage = $('card-stage');
    stage.style.width = dW + 'px'; stage.style.height = dH + 'px'; stage.dataset.scale = dispScale;
    $('card-ph').style.display = 'none';
    setEditorEmptyState(false);
    $('bg-ico').textContent = 'OK'; $('bg-txt').innerHTML = 'Loaded ' + pngW + ' x ' + pngH + 'px'; $('bg-box').classList.add('ok');
    const bgImg = $('card-bg-img');
    if (bgImg.src === d.bgSrc && bgImg.complete && bgImg.naturalWidth > 0) {
      bgImg.style.display = 'block';
      render();
    } else {
      bgImg.onload = () => { bgImg.style.display = 'block'; render(); };
      bgImg.onerror = () => { bgImg.style.display = 'none'; render(); };
      bgImg.src = d.bgSrc;
    }
  } else {
    pngW = 0; pngH = 0;
    $('card-bg-img').src = ''; $('card-bg-img').style.display = 'none'; $('card-ph').style.display = 'flex';
    setEditorEmptyState(true);
    $('bg-ico').textContent = 'PNG';
    $('bg-txt').innerHTML = 'Upload card background<br><span style="font-size:9px;opacity:.5">Artboard = exact PNG size</span>';
    $('bg-box').classList.remove('ok');
  }

  // Set logo â€” â˜… FIXED: handle cached images + ensure render
  if (d.logoSrc && d.logoSrc.length > 10) {
    const logoImg = $('tx-logo');
    const applyLogo = () => {
      logoImg.style.display = 'inline-block';
      $('tx-badge-emoji').style.display = 'none';
      syncActiveLogoUI(d.activeLogoName || null);
      render();
    };
    if (logoImg.src === d.logoSrc && logoImg.complete && logoImg.naturalWidth > 0) {
      // Already loaded & cached â€” just show it
      applyLogo();
    } else {
      logoImg.onload = applyLogo;
      logoImg.onerror = () => {
        // Logo failed to load â€” show emoji fallback
        logoImg.src = ''; logoImg.style.display = 'none';
        $('tx-badge-emoji').style.display = 'inline';
        render();
      };
      logoImg.src = d.logoSrc;
    }
  } else {
    $('tx-logo').src = ''; $('tx-logo').style.display = 'none';
    $('tx-badge-emoji').style.display = 'inline';
    syncActiveLogoUI(null);
  }

  render(); // immediate render for text/color/size changes
}

// â•â•â• LIBRARY â•â•â•
function saveLib() {
  writeLocalLibCache(true);
  queueServerLibSync(true);
}

async function loadLib() {
  if (libLoadStarted) return;
  libLoadStarted = true;
  const localCache = readLocalLibCache();
  const serverLib = await fetchServerLib();
  if (serverLib && (serverLib.folders.length || !localCache || !localCache.folders.length)) {
    LIB = serverLib;
  } else if (localCache) {
    LIB = localCache;
    if (serverLib && !serverLib.folders.length && localCache.folders.length) {
      queueServerLibSync(true);
    }
  } else if (serverLib) {
    LIB = serverLib;
  } else {
    LIB = { folders: [] };
  }
  LIB = normalizeLibShape(LIB);
  let migrated = false;
  (LIB.folders || []).forEach(f => {
    ensureFolderSharedOverrides(f);
    if (migrateLegacyFolderOverrides(f)) migrated = true;
  });
  const pendingConflict = localStorage.getItem(LIB_CONFLICT_CACHE_KEY);
  if (pendingConflict && serverLib) {
    try {
      const merged = mergeLibraries(serverLib, JSON.parse(pendingConflict));
      LIB = merged;
      writeLocalLibCache(false);
      await pushServerLib(merged, true, 0);
      localStorage.removeItem(LIB_CONFLICT_CACHE_KEY);
    } catch (e) { }
  }
  writeLocalLibCache(false);
  if (migrated) saveLib();
  renderLib();
  renderAssetManager();
  renderBulkValidation();
  refreshBulkFolders();
  maybeRestoreStartupCard();
  startLibPolling();
}

function findBestStartupCard() {
  const remembered = readLastOpenedCard();
  if (remembered && remembered.fid && remembered.cid) {
    const rememberedCard = getCardById(remembered.fid, remembered.cid);
    if (rememberedCard && rememberedCard.data && rememberedCard.data.bgSrc) {
      return { fid: remembered.fid, cid: remembered.cid, card: rememberedCard };
    }
  }

  let fallback = null;
  for (const folder of (LIB.folders || [])) {
    for (const card of (folder.cards || [])) {
      if (!fallback) fallback = { fid: folder.id, cid: card.id, card };
      if (card && card.data && card.data.bgSrc) {
        return { fid: folder.id, cid: card.id, card };
      }
    }
  }
  return fallback;
}

function maybeRestoreStartupCard() {
  if (curCardId || curFolderId || pngW || readDraft()) return;
  const startupCard = findBestStartupCard();
  if (startupCard && startupCard.fid && startupCard.cid) {
    loadCard(startupCard.fid, startupCard.cid, { silent: true });
    return;
  }
  if ((LIB.folders || []).length) switchRTab('library');
}

function setLibrarySearch(value) {
  librarySearchTerm = (value || '').trim().toLowerCase();
  renderLib();
}

function toggleLibraryTagFilter(tag) {
  libraryActiveTag = libraryActiveTag === tag ? '' : tag;
  renderLib();
}

function getLibraryTags() {
  const tags = new Set();
  (LIB.folders || []).forEach(folder => {
    (folder.tags || []).forEach(tag => tags.add(tag));
    (folder.cards || []).forEach(card => (card.tags || []).forEach(tag => tags.add(tag)));
  });
  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

function renderLibraryTagFilters() {
  const wrap = $('lib-tag-filters');
  if (!wrap) return;
  const tags = getLibraryTags();
  if (!tags.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = '';
  tags.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-chip' + (libraryActiveTag === tag ? ' active' : '');
    btn.textContent = tag;
    btn.addEventListener('click', () => toggleLibraryTagFilter(tag));
    wrap.appendChild(btn);
  });
}

function matchesLibraryFilter(folder, card) {
  const search = librarySearchTerm;
  const tag = libraryActiveTag;
  const folderTags = folder.tags || [];
  const cardTags = card && card.tags ? card.tags : [];
  const hay = [
    folder.name || '',
    folderTags.join(' '),
    card ? card.name || '' : '',
    cardTags.join(' ')
  ].join(' ').toLowerCase();
  const searchOk = !search || hay.includes(search);
  const tagOk = !tag || folderTags.includes(tag) || cardTags.includes(tag);
  return searchOk && tagOk;
}

function renderLib() {
  const c = $('lib-list');
  renderLibraryTagFilters();
  const openIds = new Set(
    Array.from(c.querySelectorAll('.folder-cards.op')).map(el => el.id.replace('fc-', ''))
  );
  if (curFolderId) openIds.add(curFolderId);
  if (libraryPinnedFolderId) openIds.add(libraryPinnedFolderId);
  if (folderEditScope && folderEditScope.fid) openIds.add(folderEditScope.fid);
  selectedCards.forEach(sel => {
    if (sel && sel.fid) openIds.add(sel.fid);
  });

  const filtered = [];
  (LIB.folders || []).forEach(folder => {
    const folderMatch = matchesLibraryFilter(folder, null);
    const matchedCards = (folder.cards || []).filter(card => matchesLibraryFilter(folder, card));
    if (!librarySearchTerm && !libraryActiveTag) {
      filtered.push({ folder, cards: folder.cards || [] });
      return;
    }
    if (folderMatch) {
      filtered.push({ folder, cards: folder.cards || [] });
      return;
    }
    if (matchedCards.length) {
      filtered.push({ folder, cards: matchedCards });
    }
  });

  const prioritizedIds = [];
  [folderEditScope && folderEditScope.fid, curFolderId, libraryPinnedFolderId].forEach(fid => {
    if (fid && !prioritizedIds.includes(fid)) prioritizedIds.push(fid);
  });
  prioritizedIds.forEach(fid => {
    const idx = filtered.findIndex(entry => entry.folder && entry.folder.id === fid);
    if (idx > 0) {
      filtered.unshift(filtered.splice(idx, 1)[0]);
    }
  });

  if (!filtered.length) {
    c.innerHTML = '<div class="library-empty">No folders or cards match your search.</div>';
    updateSelUI();
    return;
  }

  c.innerHTML = '';
  filtered.forEach(entry => {
    const f = entry.folder;
    const visibleCards = entry.cards || [];
    const isOpen = librarySearchTerm || libraryActiveTag ? true : openIds.has(f.id);
    const folderIsActive = curFolderId === f.id || (folderEditScope && folderEditScope.fid === f.id);
    const folderTagHtml = (f.tags || []).length
      ? `<div class="folder-tags">${f.tags.slice(0, 4).map(tag => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('')}</div>`
      : '';
    const countLabel = visibleCards.length === (f.cards || []).length
      ? String((f.cards || []).length)
      : `${visibleCards.length}/${(f.cards || []).length}`;
    const div = document.createElement('div'); div.className = 'folder-item';
    div.innerHTML = `
      <div class="folder-hd${folderIsActive ? ' active' : ''}" onclick="toggleF('${f.id}')" oncontextmenu="showFolderCtx(event,'${f.id}')">
        <span class="farr${isOpen ? ' op' : ''}" id="arr-${f.id}">v</span>
        <span>LIB</span>
        <span class="fname">${escapeHtml(f.name)}</span>
        <span class="fcnt">${countLabel}</span>
        <button class="fdel" title="Options" onclick="event.stopPropagation();showFolderCtx(event,'${f.id}')">...</button>
      </div>
      ${folderTagHtml}
      <div class="folder-cards${isOpen ? ' op' : ''}" id="fc-${f.id}">
        ${!visibleCards.length ? '<div style="font-size:10px;color:var(--muted);padding:4px 2px;">Empty</div>'
        : visibleCards.map(card => {
          const tags = (card.tags || []).slice(0, 3).map(tag => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('');
          const isEditing = curFolderId === f.id && curCardId === card.id;
          return `
          <div class="ci${isEditing ? ' current' : ''}" id="ci-${card.id}" data-fid="${f.id}" data-cid="${card.id}" oncontextmenu="showCtx(event,'${f.id}','${card.id}')" onclick="document.querySelectorAll('.ci.kb-focus').forEach(c=>c.classList.remove('kb-focus'));handleCardClick(event,'${f.id}','${card.id}')" ondblclick="loadCard('${f.id}','${card.id}')">
            ${isEditing ? '<div class="ci-badge editing">Editing</div>' : ''}
            <div class="ci-thumb">${card.thumb ? `<img src="${escapeHtml(card.thumb)}" alt="">` : 'PNG'}</div>
            <div class="ci-info">
              <div class="ci-name" title="${escapeHtml(card.name)}">${escapeHtml(card.name)}</div>
              <div class="ci-date">${escapeHtml(card.date || '')}</div>
              ${tags ? `<div class="ci-tags">${tags}</div>` : ''}
            </div>
            <div class="ci-acts">
              <button class="ca" onclick="event.stopPropagation();showCtx(event,'${f.id}','${card.id}')">...</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    c.appendChild(div);
  });
  updateSelUI();
}

function toggleF(fid) { $('fc-' + fid).classList.toggle('op'); $('arr-' + fid).classList.toggle('op'); }

function openSave() {
  const sel = $('save-folder');
  sel.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Select folder --';
  sel.appendChild(defaultOpt);
  LIB.folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    sel.appendChild(opt);
  });
  $('save-name').value = curName === 'Untitled Card' ? '' : curName;
  $('save-new-folder').value = '';
  const currentFolder = curFolderId ? getFolderById(curFolderId) : null;
  const currentCard = currentFolder && curCardId ? getCardById(curFolderId, curCardId) : null;
  $('save-tags').value = currentCard ? tagsToText(currentCard.tags) : '';
  if (curFolderId) sel.value = curFolderId;
  openModal('mo-save');
}

async function saveCard() {
  const name = $('save-name').value.trim();
  if (!name) { toast('Enter card name!', 'var(--red)'); return; }
  const cardTags = parseTags($('save-tags').value);
  let fid = $('save-folder').value || curFolderId || '';
  const nfn = $('save-new-folder').value.trim();
  if (nfn) {
    const nf = {
      id: uid(),
      name: nfn,
      tags: [],
      cards: [],
      sharedOverrides: {}
    };
    LIB.folders.push(nf); fid = nf.id;
  }
  if (!fid) { toast('Select or create a folder!', 'var(--red)'); return; }
  const thumb = await snap();
  const folder = LIB.folders.find(f => f.id === fid);
  if (!folder) { toast('Folder not found!', 'var(--red)'); return; }
  isolateFolderCardDataRefs(folder);
  const canUpdateInPlace = !!(curCardId && curFolderId && fid === curFolderId && !nfn);
  let target = null;
  if (canUpdateInPlace) {
    target = folder.cards.find(c => c.id === curCardId) || null;
  }
  const payload = {
    name,
    tags: cardTags,
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }),
    thumb,
    data: jclone(getData())
  };
  if (target) {
    target.name = payload.name;
    target.tags = payload.tags;
    target.date = payload.date;
    target.thumb = payload.thumb;
    target.data = jclone(payload.data);
    } else {
      const newId = uid();
      folder.cards.push({ id: newId, ...payload, data: jclone(payload.data) });
    curCardId = newId;
    curFolderId = fid;
  }
  curName = name;
  $('cur-name').textContent = name;
  if (!curFolderId) curFolderId = fid;
  saveLib();
  renderLib();
  closeModal('mo-save');
  captureEditorBaseline();
  discardDraft(false);
  clean('Saved to library', 'live');
  toast((target ? 'Updated in ' : 'Saved to ') + '"' + folder.name + '"!');
  setTimeout(() => { const fc = $('fc-' + fid), ar = $('arr-' + fid); if (fc) fc.classList.add('op'); if (ar) ar.classList.add('op'); }, 120);
}

function loadCard(fid, cid, opts) {
  const options = opts || {};
  if (isDirty) saveDraftNow();
  flushCurrentCardAutoSave();
  const folder = LIB.folders.find(f => f.id === fid); if (!folder) return;
  const card = folder.cards.find(c => c.id === cid); if (!card || !card.data) return;
  curName = card.name; $('cur-name').textContent = card.name;
  curCardId = cid; curFolderId = fid;
  saveLastOpenedCard(fid, cid);
  libraryPinnedFolderId = fid;
  ensureFolderSharedOverrides(folder);
  folderEditScope = { fid, cid };
  folderEditBaseData = getRememberedFolderEditBase(fid, cid, card.data);
  folderEditInitialData = jclone(card.data);
  beginFolderSyncPause();
  setData(getEffectiveCardData(fid, card.data));
  endFolderSyncPause();
  lastFolderSyncSnapshot = captureFolderSyncState();
  updateFolderEditBanner();
  captureEditorBaseline();
  resetUndoHistory();
  updateDraftBanner(null);
  clean(readDraft() ? 'Draft available' : 'Draft idle', readDraft() ? 'warn' : '');
  renderLayerList();
  updateSelUI();
  syncLibraryFolderOpenState();
  if (!options.silent) toast('Loaded: ' + card.name);
  switchTab('editor');
}

function delFolder(fid) {
  openConfirmDialog({
    title: 'Delete folder?',
    message: 'Delete this folder and all cards inside it? This cannot be undone.',
    confirmText: 'Delete Folder'
  }).then(ok => {
    if (!ok) return;
    const doomed = getFolderById(fid);
    if (doomed && doomed.cards) {
      doomed.cards.forEach(card => folderSyncBaseByCard.delete(folderEditBaseKey(fid, card.id)));
    }
    if (libraryPinnedFolderId === fid) libraryPinnedFolderId = null;
    LIB.folders = LIB.folders.filter(f => f.id !== fid); saveLib(); renderLib(); toast('Folder deleted');
  });
}

async function dlAll() {
  if (typeof JSZip === 'undefined') {
    toast('ZIP library not loaded - please refresh the page', 'var(--red)');
    return;
  }
  let total = 0;
  LIB.folders.forEach(f => {
    total += f.cards.filter(c => c.data && c.data.bgSrc && c.data.bgSrc.length >= 10).length;
  });
  if (!total) { toast('No exportable cards in library!', 'var(--red)'); return; }
  toast('Preparing ZIP for ' + total + ' cards...');
  mountEditorRenderHost();
  await delay(120);
  await new Promise(res => ensureH2C(res));
  const savedEditor = captureEditorSessionState();
  const zip = new JSZip();
  let done = 0;
  beginFolderSyncPause();
  try {
    for (const folder of LIB.folders) {
      const zipFolder = zip.folder(sanitizeExportName(folder.name));
      for (const card of folder.cards) {
        if (!card.data || !card.data.bgSrc || card.data.bgSrc.length < 10) continue;
        try {
            const { dataUrl, ext } = await renderCardExportData(card.data, folder.id);
          const fname = sanitizeExportName(card.name) + '.' + ext;
          zipFolder.file(fname, dataUrlToBlob(dataUrl));
          done++;
          toast('Adding to ZIP ' + done + '/' + total + ': ' + card.name);
        } catch (e) {
          reportClientIssue('error', 'dlAll zip error:', e);
        }
      }
    }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(zipBlob, getLibraryZipName() + '.zip');
      toast('All ' + done + ' cards zipped and downloaded!');
  } finally {
    restoreEditorSessionState(savedEditor);
    unmountEditorRenderHost();
    endFolderSyncPause();
  }
}

// â•â•â• CONTEXT MENU â•â•â•
function showCtx(e, fid, cid) {
  e.preventDefault(); e.stopPropagation();
  ctxTarget = { fid, cid };
  const ctx = $('ctx'); ctx.style.display = 'block';
  let x = e.clientX, y = e.clientY;
  if (x + 175 > window.innerWidth) x = window.innerWidth - 180;
  if (y + 165 > window.innerHeight) y = window.innerHeight - 170;
  ctx.style.left = x + 'px'; ctx.style.top = y + 'px';
}
function hideCtx() { $('ctx').style.display = 'none'; }
document.addEventListener('click', hideCtx);

function ctxLoad() { hideCtx(); const { fid, cid } = ctxTarget; if (fid) loadCard(fid, cid); }

function ctxCopy() {
  hideCtx();
  const { fid, cid } = ctxTarget;
  const folder = LIB.folders.find(f => f.id === fid); if (!folder) return;
  const card = folder.cards.find(c => c.id === cid); if (!card) return;
  const copy = {
    id: uid(), name: card.name + ' (copy)',
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }),
    thumb: card.thumb,
    data: JSON.parse(JSON.stringify(card.data))
  };
  folder.cards.push(copy);
  copy.thumbHash = card.thumbHash || getStateHash(card.data);
  rememberFolderEditBase(fid, copy.id, copy.data);
  saveLib(); renderLib(); toast('"' + copy.name + '" created!');
  setTimeout(() => { const fc = $('fc-' + fid), ar = $('arr-' + fid); if (fc) fc.classList.add('op'); if (ar) ar.classList.add('op'); }, 120);
}

async function ctxExport() {
  hideCtx();
  const { fid, cid } = ctxTarget;
  const folder = LIB.folders.find(f => f.id === fid); if (!folder) return;
  const card = folder.cards.find(c => c.id === cid); if (!card || !card.data) return;
  loadCard(fid, cid); await delay(300);
  const c = await renderToCanvas();
  const a = document.createElement('a'); a.download = card.name.replace(/[^a-z0-9]/gi, '_') + '.png'; a.href = c.toDataURL('image/png'); a.click();
  toast('Exported!');
}

function ctxDelete() {
  hideCtx();
  const { fid, cid } = ctxTarget;
  const folder = LIB.folders.find(f => f.id === fid); if (!folder) return;
  folderSyncBaseByCard.delete(folderEditBaseKey(fid, cid));
  folder.cards = folder.cards.filter(c => c.id !== cid); saveLib(); renderLib(); toast('Card deleted');
}

// â•â•â• NEW / RENAME â•â•â•
function openNewCard() {
  $('new-sub').textContent = isDirty ? 'Unsaved changes. Save first or start fresh.' : 'Start with a clean artboard.';
  openModal('mo-new');
}

function doNew() {
  if (isDirty) saveDraftNow();
  flushCurrentCardAutoSave();
  offerAutoCenter = true;
  elemScale = JSON.parse(JSON.stringify(DSCALES));
  $('f-subtitle').value = 'Stock + F&O Ideas';
  $('f-bignum').value = '9'; $('f-months').value = 'MONTHS'; $('f-free').value = 'FREE';
  $('f-sublabel').value = 'on 6 Months Plan'; $('f-orig').value = '18,599'; $('f-final').value = '5,999';
  'logo:34,subtitle:35,bignum:86,months:28,free:47,sublabel:22,orig:28,final:50'.split(',').forEach(p => {
    const [k, val] = p.split(':'); setSz('sz-' + k, 'sv-' + k, +val);
  });
  setSz('gap-sublabel', null, 10);
  $('c-subtitle').value = '#8fa3b8'; $('c-bignum').value = '#1BA8E8'; $('c-months').value = '#1a1a2e';
  $('c-free').value = '#1BA8E8'; $('c-sublabel').value = '#6a7a9a'; $('c-orig').value = '#aab0c0'; $('c-orig-strike').value = '#aab0c0'; $('c-final').value = '#1a1a2e';
  $('card-bg-img').src = ''; $('card-bg-img').style.display = 'none'; $('card-ph').style.display = 'flex';
  setEditorEmptyState(true);
  $('bg-ico').textContent = 'PNG'; $('bg-txt').innerHTML = 'Upload card background<br><span style="font-size:9px;opacity:.5">Artboard = exact PNG size</span>'; $('bg-box').classList.remove('ok');
  $('tx-logo').src = ''; $('tx-logo').style.display = 'none'; $('tx-badge-emoji').style.display = 'inline';
  syncActiveLogoUI(null);
  $('tx-badge-emoji').textContent = 'LOGO'; if ($('logo-multi-ico')) $('logo-multi-ico').textContent = 'LOGO'; if ($('logo-multi-txt')) $('logo-multi-txt').innerHTML = 'Upload SVG / PNG logos<br><span style="font-size:9px;opacity:.5">Select multiple files at once</span>'; if ($('logo-upload-box')) $('logo-upload-box').classList.remove('ok');
  pngW = 0; pngH = 0; pos = JSON.parse(JSON.stringify(DPOS)); applyPos();
  clearSelectedElement();
  curName = 'Untitled Card'; $('cur-name').textContent = 'Untitled Card';
  curCardId = null; curFolderId = null; // â˜… Reset tracking
  clearFolderEditScope();
  render();
  closeModal('mo-new');
  captureEditorBaseline();
  resetUndoHistory();
  updateDraftBanner(null);
  clean(readDraft() ? 'Draft available' : 'Draft idle', readDraft() ? 'warn' : '');
  toast('New card!');
}

function openRename() { $('rename-inp').value = curName; openModal('mo-rename'); setTimeout(() => $('rename-inp').focus(), 100); }
function doRename() {
  const n = $('rename-inp').value.trim();
  if (!n) return;

  const prevName = curName;
  curName = n;
  $('cur-name').textContent = n;
  closeModal('mo-rename');

  if (curCardId && curFolderId) {
    const folder = LIB.folders.find(f => f.id === curFolderId);
    const card = folder && folder.cards.find(c => c.id === curCardId);
    if (card) {
      card.name = n;
      saveLib();
      renderLib();
      setTimeout(() => {
        const fc = $('fc-' + curFolderId), ar = $('arr-' + curFolderId);
        if (fc) fc.classList.add('op');
        if (ar) ar.classList.add('op');
      }, 100);
    }
  }

  if (prevName !== n) dirty();
  toast('Renamed!');
}

// â•â•â• FOLDER MODAL â•â•â•
function openFolderModal(source) {
  if (folderModalResolve) {
    folderModalResolve(null);
    folderModalResolve = null;
  }
  folderModalSource = source === 'bulk' ? 'bulk' : 'library';
  openModal('mo-folder');
  $('folder-inp').value = '';
  if ($('folder-tags-inp')) $('folder-tags-inp').value = '';
  const title = $('folder-modal-title');
  const sub = $('folder-modal-sub');
  const note = $('folder-modal-note');
  if (title) title.textContent = folderModalSource === 'bulk' ? 'Create Folder for Bulk Cards' : 'New Folder';
  if (sub) sub.textContent = folderModalSource === 'bulk'
    ? 'Create a library folder, then choose it for bulk generation.'
    : 'Create a folder to organize cards, previews, and exports.';
  if (note) note.textContent = folderModalSource === 'bulk'
    ? 'Tip: the new folder will be selected automatically in the bulk generator.'
    : 'Tip: folders can be searched, copied, renamed, and exported later.';
  setTimeout(() => $('folder-inp').focus(), 100);
  return new Promise(resolve => {
    folderModalResolve = resolve;
  });
}

function closeFolderModal(result) {
  const resolve = folderModalResolve;
  folderModalResolve = null;
  folderModalSource = 'library';
  closeModal('mo-folder');
  if (resolve) resolve(result ?? null);
}
function openFolderRenameModal(fid) {
  const folder = getFolderById(fid);
  if (!folder) return;
  folderRenameFid = fid;
  const modal = $('mo-folder-rename');
  if (!modal) return;
  $('folder-rename-inp').value = folder.name || '';
  $('folder-rename-tags-inp').value = tagsToText(folder.tags || []);
  $('folder-rename-title').textContent = 'Rename Folder';
  $('folder-rename-sub').textContent = 'Update the folder title and tags without affecting the cards inside.';
  openModal('mo-folder-rename');
  setTimeout(() => $('folder-rename-inp').focus(), 100);
}
function closeFolderRenameModal() {
  folderRenameFid = null;
  closeModal('mo-folder-rename');
}
function doFolderRename() {
  const folder = getFolderById(folderRenameFid);
  if (!folder) return closeFolderRenameModal();
  const name = $('folder-rename-inp').value.trim();
  if (!name) { toast('Enter folder name!', 'var(--red)'); return; }
  folder.name = name;
  folder.tags = parseTags($('folder-rename-tags-inp').value);
  saveLib();
  renderLib();
  closeFolderRenameModal();
  toast('Folder renamed to "' + folder.name + '"');
}
['folder-inp', 'folder-tags-inp'].forEach(id => {
  const el = $(id);
  if (el) {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        mkFolder();
      }
    });
  }
});
function mkFolder(name) {
  const n = name || ($('folder-inp') && $('folder-inp').value.trim());
  if (!n) { toast('Enter folder name!', 'var(--red)'); return null; }
  const f = {
    id: uid(),
    name: n,
    tags: parseTags($('folder-tags-inp') ? $('folder-tags-inp').value : ''),
    cards: [],
    sharedOverrides: {}
  };
  LIB.folders.push(f); saveLib(); renderLib();
  if (folderModalSource === 'bulk') {
    libraryPinnedFolderId = f.id;
    curFolderId = f.id;
    refreshBulkFolders();
    if ($('bulk-fsel')) $('bulk-fsel').value = f.id;
  }
  if (folderModalResolve) {
    const resolveId = folderModalResolve;
    folderModalResolve = null;
    resolveId(f.id);
  }
  if (!name) closeFolderModal(f.id);
  toast('Folder "' + n + '" created!'); return f.id;
}

// â•â•â• BULK GENERATOR â•â•â•
function dlTemplate() {
  const csv = 'card_name,subtitle,big_number,months_label,free_label,description,original_price,final_price,logo_filename\n' +
    'PRO Super Diwali,Stock + F&O Ideas,9,MONTHS,FREE,on 6 Months Plan,18599,5999,univest.png\n' +
    'PRO Gold Holi,Premium Research,6,MONTHS,FREE,on Annual Plan,12000,3999,gold_logo.png\n' +
    'Commodity Special,MCX + NCDEX Calls,3,MONTHS,FREE,on 3 Months Plan,8000,2499,commodity.png';
  const a = document.createElement('a');
  a.download = 'univest_cards_template.csv';
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.click(); toast('Template downloaded!');
}

function handleBulkBG(e) {
  const file = e.target.files[0]; if (!file) return;
  readURL(file, src => {
    const tmp = new Image();
    tmp.onload = () => {
      bulkBGSrc = src; bulkBGW = tmp.naturalWidth; bulkBGH = tmp.naturalHeight;
  $('bulk-bg-txt').innerHTML = 'Loaded ' + escapeHtml(file.name) + '<br><span style="font-size:10px;opacity:.6">' + bulkBGW + ' x ' + bulkBGH + 'px</span>';
      $('bulk-bg-box').classList.add('ok');
      bulkValidationState = validateBulkRows(bulkRows);
      renderBulkValidation();
      toast('Background set!');
    };
    tmp.src = src;
  });
}

async function handleLogosZip(e) {
  const file = e.target.files[0]; if (!file) return;
  toast('Reading ZIP...');
  try {
    bulkLogoSourceMode = 'upload';
    await loadBulkLogosFromZipBlob(file, file.name, { quiet: false });
    renderBulkExistingSelectors();
    setBulkSourceNote('bulk-logo-source-note', 'upload', 'Using uploaded ZIP: ' + file.name + '. It overrides the selected existing logo pack.');
  } catch (err) { toast('ZIP error: ' + err.message, 'var(--red)'); reportClientIssue('error', err); }
}

// Convert any image blob (including SVG) â†’ PNG data URL
// SVGs are rasterized via canvas using viewBox dimensions (not naturalWidth which is 0 for SVGs without w/h attrs)
function svgToPng(svgText, cb) {
  // Parse true dimensions from viewBox or width/height attributes
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  let W = 0, H = 0;
  if (svgEl) {
    const vb = svgEl.getAttribute('viewBox');
    if (vb) { const p = vb.trim().split(/[\s,]+/); W = parseFloat(p[2]) || 0; H = parseFloat(p[3]) || 0; }
    if (!W) W = parseFloat(svgEl.getAttribute('width')) || 0;
    if (!H) H = parseFloat(svgEl.getAttribute('height')) || 0;
    // Ensure SVG has explicit width/height so browser can size it
    if (!svgEl.getAttribute('width')) svgEl.setAttribute('width', W || 300);
    if (!svgEl.getAttribute('height')) svgEl.setAttribute('height', H || 100);
  }
  if (!W || !H) { W = 300; H = 100; } // safe fallback for dimensionless SVGs
  const SCALE = 3; // 3x for crisp rendering
  const cvs = document.createElement('canvas');
  cvs.width = W * SCALE; cvs.height = H * SCALE;
  const ctx = cvs.getContext('2d');
  const fixed = new XMLSerializer().serializeToString(svgEl || doc.documentElement);
  const blob2 = new Blob([fixed], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob2);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, W * SCALE, H * SCALE);
    URL.revokeObjectURL(url);
    cb(cvs.toDataURL('image/png'));
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    // last resort: base64 SVG (may not render in html2canvas but at least shows in preview)
    cb('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(fixed))));
  };
  img.src = url;
}

function blobToURL(blob, filename) {
  return new Promise((res, rej) => {
    const isSVG = filename && /\.svg$/i.test(filename);
    if (isSVG) {
      const reader = new FileReader();
      reader.onload = e => svgToPng(e.target.result, res);
      reader.onerror = rej;
      reader.readAsText(blob);
    } else {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    }
  });
}

function handleExcelLegacyOriginal(e) {
  const file = e.target.files[0]; if (!file) return;
  const inp = $('bulk-xl-inp');

  // Use FileReader â€” works in all browsers including file:// protocol
  const reader = new FileReader();

  reader.onerror = () => toast('Could not read file!', 'var(--red)');

  if (file.name.toLowerCase().endsWith('.csv')) {
    reader.onload = function (ev) {
      try {
        const text = ev.target.result;
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) { toast('CSV is empty or has only headers', 'var(--red)'); return; }

        // Normalize header names
        const rawHdrs = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
        const hdrs = rawHdrs.map(h => h.toLowerCase().replace(/[\s\-]+/g, '_'));
        const expectedCols = hdrs.length;

        let rows = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const vals = parseCSVLine(lines[i], expectedCols);
          const row = {}; hdrs.forEach((h, j) => row[h] = (vals[j] || '').replace(/^"|"$/g, '').trim());
          // Accept row if it has card_name OR name column
          const nameVal = row.card_name || row.name || '';
          if (nameVal && !nameVal.startsWith('e.g')) rows.push(row);
        }
        finishExcelLoad(file.name, rows);
      } catch (err) { toast('CSV parse error: ' + err.message, 'var(--red)'); reportClientIssue('error', err); }
    };
    reader.readAsText(file);

  } else {
    // XLSX / XLS
    reader.onload = function (ev) {
      try {
        if (typeof XLSX === 'undefined') {
          toast('XLSX library not loaded - please refresh the page', 'var(--red)');
          return;
        }
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // sheet_to_json gives objects keyed by header row
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

        const rows = raw.map(r => {
          const n = {};
          Object.keys(r).forEach(k => {
            // Normalize key: lowercase, spaces to underscore, strip special chars
            const nk = k.trim().toLowerCase().replace(/[\s\-\/]+/g, '_').replace(/[^a-z0-9_]/g, '');
            n[nk] = String(r[k] === null || r[k] === undefined ? '' : r[k]).trim();
          });
          return n;
        }).filter(r => {
          const nameVal = r.card_name || r.name || r.cardname || '';
          return nameVal && !nameVal.startsWith('e.g') && nameVal !== '';
        });

        finishExcelLoad(file.name, rows);
      } catch (err) { toast('Excel parse error: ' + err.message, 'var(--red)'); reportClientIssue('error', 'XLSX error:', err); }
    };
    reader.readAsArrayBuffer(file);
  }

  // Reset input so same file can be re-uploaded
  inp.value = '';
}

function handleExcel(e) {
  const file = e.target.files[0]; if (!file) return;
  const inp = $('bulk-xl-inp');
  bulkSheetSourceMode = 'upload';
  loadBulkSheetFromBlob(file.name, file, { quiet: false })
    .then(() => {
      renderBulkExistingSelectors();
      setBulkSourceNote('bulk-sheet-source-note', 'upload', 'Using uploaded file: ' + file.name + '. It overrides the selected existing data file.');
    })
    .catch(err => {
      toast((file.name.toLowerCase().endsWith('.csv') ? 'CSV parse error: ' : 'Excel parse error: ') + err.message, 'var(--red)');
      reportClientIssue('error', err);
    })
    .finally(() => {
      inp.value = '';
    });
}

function finishExcelLoad(filename, rows) {
  bulkRows = rows;
  bulkValidationState = validateBulkRows(rows);
  const count = rows.length;
  $('bulk-xl-txt').innerHTML = (count > 0 ? 'Loaded ' : 'Warning: ') + escapeHtml(filename) +
    '<br><span style="font-size:10px;opacity:.6">' +
    (count > 0 ? count + ' cards found' : '0 rows - check column names match template') +
    '</span>';
  $('bulk-xl-box').classList.toggle('ok', count > 0);

  if (count === 0) {
    // Show what columns were found to help debug
    toast('0 rows found! Check column names match template CSV', 'var(--red)');
    $('xl-preview').style.display = 'block';
    $('xl-preview').innerHTML = '<div class="genprev" style="color:#f87171;font-size:11px;">' +
      'No data rows found. Make sure your Excel has a <b>card_name</b> column.<br>' +
      'Download the template (Step 1) and use the same column headers.</div>';
    renderBulkValidation();
    return;
  }

  showXLPreview(rows);
  renderBulkValidation();
  toast(count + ' rows loaded!');
}

function parseCSVLine(line, expectedCols) {
  // Standard RFC-4180 CSV parsing with quote handling
  const result = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);

  // If we have more cols than expected, merge adjacent purely-numeric fields
  // This handles unquoted thousand-separator commas like 10,999 â†’ "10,999"
  if (expectedCols && result.length > expectedCols) {
    const merged = [...result];
    let i = 0;
    while (i < merged.length - 1 && merged.length > expectedCols) {
      const a = merged[i], b = merged[i + 1];
      // If a is digits (possibly with leading â‚¹/Rs) and b is exactly 3 digits â†’ merge
      if (/^[â‚¹Rs ]*\d+$/.test(a.trim()) && /^\d{3}$/.test(b.trim())) {
        merged.splice(i, 2, a.trim() + ',' + b.trim());
      } else {
        i++;
      }
    }
    return merged;
  }
  return result;
}

function showXLPreview(rows) {
  if (!rows.length) return;
  const keys = ['card_name', 'subtitle', 'big_number', 'original_price', 'final_price', 'logo_filename'];
  const shown = rows.slice(0, 4);
  $('xl-preview').style.display = 'block';
  $('xl-preview').innerHTML = `<div class="genprev"><table>
    <tr>${keys.map(k => `<th>${escapeHtml(k)}</th>`).join('')}</tr>
    ${shown.map(r => `<tr>${keys.map(k => `<td>${escapeHtml(r[k] || '-')}</td>`).join('')}</tr>`).join('')}
    ${rows.length > 4 ? `<tr><td colspan="${keys.length}" style="color:var(--muted);text-align:center;font-style:italic;">...+${rows.length - 4} more</td></tr>` : ''}
  </table></div>`;
}

function normalizeLogoMatchKey(name) {
  return String(name || '')
    .trim()
    .split(/[\\/]/)
    .pop()
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeLogoMatchKey(name) {
  return normalizeLogoMatchKey(name)
    .split(' ')
    .filter(Boolean)
    .filter(token => !['light', 'dark', 'logo', 'logos', 'theme'].includes(token))
    .map(token => {
      if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
      if (token.endsWith('s') && token.length > 4 && !token.endsWith('ss')) return token.slice(0, -1);
      return token;
    })
    .join(' ')
    .trim();
}

function findBulkLogoKey(name) {
  const keys = Object.keys(bulkLogos || {});
  if (!keys.length) return null;

  const raw = normalizeLogoMatchKey(name);
  if (!raw) return null;
  const canonical = canonicalizeLogoMatchKey(name);

  const entries = keys.map(key => ({
    key,
    raw: normalizeLogoMatchKey(key),
    canonical: canonicalizeLogoMatchKey(key)
  }));

  const exactRaw = entries.find(entry => entry.raw === raw);
  if (exactRaw) return exactRaw.key;

  if (canonical) {
    const exactCanonical = entries.find(entry => entry.canonical === canonical);
    if (exactCanonical) return exactCanonical.key;
  }

  const rawMatch = entries.find(entry => entry.raw.includes(raw) || raw.includes(entry.raw));
  if (rawMatch) return rawMatch.key;

  if (canonical) {
    const canonicalMatch = entries.find(entry => entry.canonical.includes(canonical) || canonical.includes(entry.canonical));
    if (canonicalMatch) return canonicalMatch.key;
  }

  return null;
}

function resolveBulkLogoSrc(name) {
  const key = findBulkLogoKey(name);
  return key ? bulkLogos[key] : null;
}

function validateBulkRows(rows) {
  const state = { errors: [], warnings: [], info: [] };
  if (!bulkBGSrc) state.errors.push('Step 2 background PNG is required before generation.');
  if (!rows.length) {
    state.errors.push('Upload a CSV or XLSX file with at least one valid row.');
    return state;
  }

  const seenNames = new Set();
  const pricePattern = /^[₹Rs.\s,\d]+$/i;

  rows.forEach((row, index) => {
    const label = `Row ${index + 1}${row.card_name ? ` (${row.card_name})` : ''}`;
    if (!String(row.card_name || '').trim()) state.errors.push(label + ': missing card_name');
    if (!String(row.big_number || '').trim()) state.errors.push(label + ': missing big_number');
    if (!String(row.final_price || '').trim()) state.errors.push(label + ': missing final_price');

    const cardKey = String(row.card_name || '').trim().toLowerCase();
    if (cardKey) {
      if (seenNames.has(cardKey)) state.warnings.push(label + ': duplicate card_name');
      seenNames.add(cardKey);
    }

    ['original_price', 'final_price'].forEach(field => {
      const value = String(row[field] || '').trim();
      if (value && !pricePattern.test(value)) {
        state.warnings.push(label + `: ${field} has non-standard formatting`);
      }
    });

    const logoFilename = String(row.logo_filename || '').trim();
    if (logoFilename && !findBulkLogoKey(logoFilename)) {
      state.warnings.push(label + `: logo "${logoFilename}" was not found in the uploaded ZIP`);
    }
  });

  state.info.push(rows.length + ' bulk row' + (rows.length === 1 ? '' : 's') + ' ready for preview');
  if (!Object.keys(bulkLogos || {}).length) {
    state.info.push('No logo ZIP uploaded yet. Rows without a matching logo will render without a logo.');
  }
  return state;
}

function renderBulkValidation() {
  const wrap = $('xl-validation');
  if (!wrap) return;
  const hasRows = Array.isArray(bulkRows) && bulkRows.length > 0;
  const hasState = hasRows || bulkValidationState.errors.length || bulkValidationState.warnings.length || bulkValidationState.info.length;
  if (!hasState) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }

  const tone = bulkValidationState.errors.length
    ? 'error'
    : (bulkValidationState.warnings.length ? 'warn' : 'ok');
  const items = [
    ...bulkValidationState.errors.map(text => ({ tone: 'error', text })),
    ...bulkValidationState.warnings.map(text => ({ tone: 'warn', text })),
    ...bulkValidationState.info.map(text => ({ tone: 'info', text }))
  ];
  const visibleItems = items.slice(0, 12);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div class="validation-panel ${tone}">
      <div class="validation-title">
        Validation
        <span>${bulkValidationState.errors.length} errors, ${bulkValidationState.warnings.length} warnings</span>
      </div>
      <div class="validation-list">
        ${visibleItems.map(item => `<div class="validation-item ${item.tone}">${escapeHtml(item.text)}</div>`).join('')}
        ${hiddenCount ? `<div class="validation-item info">+${hiddenCount} more validation notes</div>` : ''}
      </div>
    </div>
  `;
}

function refreshBulkFolders() {
  const sel = $('bulk-fsel');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Select or create folder --';
  sel.appendChild(defaultOpt);
  LIB.folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    sel.appendChild(opt);
  });
  if (prev && LIB.folders.some(f => f.id === prev)) sel.value = prev;
}

function createBulkFolder() {
  openFolderModal('bulk');
}

const delay = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
async function settleForExport() {
  await nextFrame();
  await nextFrame();
}

// Format price numbers: 10999 â†’ "10,999" | already formatted "10,999" stays same
function formatPrice(val) {
  if (val === '' || val === null || val === undefined) return '';
  const s = String(val).trim();
  if (!s) return '';

  // Strip prefix symbols like â‚¹, Rs, spaces
  const prefix = s.match(/^[â‚¹Rs\s]*/)[0];
  const rest = s.slice(prefix.length).trim();

  // Extract pure numeric part (remove existing commas for reprocessing)
  const cleaned = rest.replace(/,/g, '');
  const n = parseInt(cleaned, 10);
  if (isNaN(n)) return s; // has non-numeric chars â€” return as-is

  // Indian number format:
  // â‰¤3 digits: no comma (999)
  // 4 digits: 1+3 â†’ 1,999
  // 5 digits: 2+3 â†’ 10,999
  // 6 digits: 3+3 â†’ 1,00,000 â†’ but for prices use plain 1,00,000
  const num = n.toString();
  let formatted;
  if (num.length <= 3) {
    formatted = num;
  } else {
    const last3 = num.slice(-3);
    const rest2 = num.slice(0, -3);
    // For Indian lakhs: group remaining in 2s from right
    const grouped = rest2.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formatted = grouped + ',' + last3;
  }
  return prefix + formatted;
}

function setBulkGenerateButtons(isRunning, mode) {
  const genBtn = $('gen-btn');
  const genDlBtn = $('gen-dl-btn');
  const genZipBtn = $('gen-zip-btn');
  if (!genBtn || !genDlBtn || !genZipBtn) return;
  genBtn.disabled = isRunning;
  genDlBtn.disabled = isRunning;
  genZipBtn.disabled = isRunning;
  genBtn.textContent = isRunning && mode === 'generate' ? 'Working...' : 'Generate Only';
  genDlBtn.textContent = isRunning && mode === 'download' ? 'Working...' : 'Generate + Download';
  genZipBtn.textContent = isRunning && mode === 'zip' ? 'Working...' : 'Download ZIP';
}

function startGenerateOnly() {
  return startGenerate(false);
}

function startGenerateAndDownload() {
  return startGenerate(true);
}

function sanitizeExportName(name) {
  return (name || 'card').replace(/[^a-z0-9\-_ ]/gi, '_').trim() || 'card';
}

function getLibraryZipName() {
  const activeFolder = curFolderId ? getFolderById(curFolderId) : null;
  if (activeFolder && activeFolder.name) return sanitizeExportName(activeFolder.name);
  const openFolderEl = $('lib-list') ? $('lib-list').querySelector('.folder-cards.op') : null;
  if (openFolderEl) {
    const openFolderId = openFolderEl.id ? openFolderEl.id.replace(/^fc-/, '') : '';
    const openFolder = openFolderId ? getFolderById(openFolderId) : null;
    if (openFolder && openFolder.name) return sanitizeExportName(openFolder.name);
  }
  if (LIB.folders.length === 1 && LIB.folders[0] && LIB.folders[0].name) {
    return sanitizeExportName(LIB.folders[0].name);
  }
  return sanitizeExportName(($('lib-title') && $('lib-title').textContent) || 'library_all_cards');
}

function dataUrlToBlob(dataUrl) {
  const byteString = atob(dataUrl.split(',')[1]);
  const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: mimeString });
}

function triggerBlobDownload(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 1000);
}

async function loadCardDataForExport(d) {
  const bgImg = $('card-bg-img');
  pngW = d.pngW || 616;
  pngH = d.pngH || 635;
  dispScale = Math.min(1, 500 / pngW);
  const stage = $('card-stage');
  stage.style.width = Math.round(pngW * dispScale) + 'px';
  stage.style.height = Math.round(pngH * dispScale) + 'px';
  stage.dataset.scale = dispScale;
  $('card-ph').style.display = 'none';

  await new Promise(res => {
    bgImg.onload = res;
    bgImg.onerror = res;
    bgImg.src = '';
    bgImg.src = d.bgSrc;
  });
  bgImg.style.display = 'block';

  const logoImg = $('tx-logo');
  if (d.logoSrc && d.logoSrc.length > 10) {
    await new Promise(res => {
      logoImg.onload = res;
      logoImg.onerror = res;
      logoImg.src = '';
      logoImg.src = d.logoSrc;
    });
    logoImg.style.display = 'inline-block';
    $('tx-badge-emoji').style.display = 'none';
  } else {
    logoImg.src = '';
    logoImg.style.display = 'none';
    $('tx-badge-emoji').style.display = 'inline';
  }

  setData(d);
  await settleForExport();
}

async function renderCardExportData(d, fid, fmtOverride) {
  const fmt = fmtOverride || window.exportFmt || 'jpeg';
  const q = parseInt(($('jpeg-q-slider') && $('jpeg-q-slider').value) || 60) / 100;
  const cacheKey = cardExportCacheKey(fid ? getEffectiveCardData(fid, d) : d, fid, fmt, q);
  const cached = getCachedCardExportResult(cacheKey);
  if (cached) return cached;
  await loadCardDataForExport(fid ? getEffectiveCardData(fid, d) : d);
  const canvas = await renderToCanvas();
  if (fmt === 'png') {
    const result = { dataUrl: canvas.toDataURL('image/png'), ext: 'png' };
    cacheCardExportResult(cacheKey, result);
    return result;
  }
  const result = { dataUrl: compressToTarget(canvas, q), ext: 'jpg' };
  cacheCardExportResult(cacheKey, result);
  return result;
}

function restoreEditorAfterExport(savedState, savedName, savedCardId, savedFolderId) {
  setData(savedState);
  curName = savedName;
  $('cur-name').textContent = savedName;
  curCardId = savedCardId;
  curFolderId = savedFolderId;
  lastFolderSyncSnapshot = folderEditScope ? captureFolderSyncState() : null;
  updateFolderEditBanner();
}

function mountEditorRenderHost() {
  const editorTab = $('tab-editor');
  if (!editorTab) return;
  editorTab.classList.add('bulk-render-host');
  editorTab.style.display = 'flex';
}

function unmountEditorRenderHost() {
  const editorTab = $('tab-editor');
  if (!editorTab) return;
  editorTab.classList.remove('bulk-render-host');
  if (!$('nav-editor').classList.contains('active')) {
    editorTab.style.display = 'none';
  }
}

function captureEditorSessionState() {
  return {
    data: getData(),
    name: curName,
    cardId: curCardId,
    folderId: curFolderId,
    folderEditScope: folderEditScope ? { ...folderEditScope } : null,
    folderEditBaseData: jclone(folderEditBaseData),
    folderEditInitialData: jclone(folderEditInitialData),
    lastFolderSyncSnapshot: jclone(lastFolderSyncSnapshot)
  };
}

function restoreEditorSessionState(saved) {
  if (!saved) return;
  restoreEditorAfterExport(saved.data, saved.name, saved.cardId, saved.folderId);
  folderEditScope = saved.folderEditScope ? { ...saved.folderEditScope } : null;
  folderEditBaseData = jclone(saved.folderEditBaseData);
  folderEditInitialData = jclone(saved.folderEditInitialData);
  lastFolderSyncSnapshot = jclone(saved.lastFolderSyncSnapshot);
  updateFolderEditBanner();
  renderLayerList();
  syncLibraryFolderOpenState();
  updateSelUI();
}

function updateBulkProgress(current, total, message) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  $('prog-bar').style.width = pct + '%';
  $('prog-txt').textContent = message;
}

async function downloadBulkZip() {
  if (typeof JSZip === 'undefined') {
    toast('ZIP library not loaded - please refresh the page', 'var(--red)');
    return;
  }
  const fid = $('bulk-fsel').value;
  if (!fid) {
    toast('Select a library folder first', 'var(--red)');
    return;
  }
  const folder = LIB.folders.find(f => f.id === fid);
  if (!folder) {
    toast('Selected folder not found', 'var(--red)');
    return;
  }
  const cards = folder.cards.filter(c => c.data && c.data.bgSrc && c.data.bgSrc.length > 10);
  if (!cards.length) {
    toast('No exportable cards in selected folder', 'var(--red)');
    return;
  }

  setBulkGenerateButtons(true, 'zip');
  $('gen-prog').style.display = 'block';
  updateBulkProgress(0, cards.length, 'Preparing ZIP...');
  mountEditorRenderHost();
  await delay(120);
  await new Promise(res => ensureH2C(res));

  const savedEditor = captureEditorSessionState();

  const zip = new JSZip();
  let done = 0;
  beginFolderSyncPause();
  try {
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      updateBulkProgress(i, cards.length, `Adding ${i + 1}/${cards.length}: ${card.name}`);
      const { dataUrl, ext } = await renderCardExportData(card.data, fid);
      const fname = sanitizeExportName(card.name) + '.' + ext;
      zip.file(fname, dataUrlToBlob(dataUrl));
      done++;
    }
    updateBulkProgress(cards.length, cards.length, `Building ZIP (${done} cards)...`);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerBlobDownload(zipBlob, sanitizeExportName(folder.name) + '.zip');
    toast(done + ' cards zipped and downloaded!');
  } catch (err) {
    reportClientIssue('error', 'ZIP export error:', err);
    toast('ZIP export failed', 'var(--red)');
  } finally {
    restoreEditorSessionState(savedEditor);
    unmountEditorRenderHost();
    endFolderSyncPause();
    setBulkGenerateButtons(false);
  }
}

async function startGenerate(downloadAfterGenerate) {
  if (!bulkBGSrc) { toast('Upload background PNG first! (Step 2)', 'var(--red)'); return; }
  if (!bulkRows.length) { toast('Upload CSV/Excel first! (Step 4)', 'var(--red)'); return; }
  bulkValidationState = validateBulkRows(bulkRows);
  renderBulkValidation();
  if (bulkValidationState.errors.length) {
    toast('Fix validation errors before generating cards', 'var(--red)');
    return;
  }
  let fid = $('bulk-fsel').value;
  if (!fid) {
    fid = await openFolderModal('bulk');
    if (!fid) return;
  }
  const folder = LIB.folders.find(f => f.id === fid);
  if (!folder) {
    toast('Selected folder not found', 'var(--red)');
    return;
  }
  libraryPinnedFolderId = fid;
  const total = bulkRows.length;
  $('gen-prog').style.display = 'block';
  setBulkGenerateButtons(true, downloadAfterGenerate ? 'download' : 'generate');
  updateBulkProgress(0, total, `Preparing ${total} cards...`);
  saveDraftNow();
  flushCurrentCardAutoSave();
  const savedEditor = captureEditorSessionState();
  clearFolderEditScope();
  mountEditorRenderHost();
  beginFolderSyncPause();

  try {
    // load BG into editor
    pngW = bulkBGW; pngH = bulkBGH;
    dispScale = Math.min(1, 500 / pngW);
    const dW = Math.round(pngW * dispScale), dH = Math.round(pngH * dispScale);
    const stage = $('card-stage');
    stage.style.width = dW + 'px'; stage.style.height = dH + 'px'; stage.dataset.scale = dispScale;
    $('card-bg-img').src = bulkBGSrc; $('card-bg-img').style.display = 'block'; $('card-ph').style.display = 'none';
    setEditorEmptyState(false);

    await delay(120);
    await settleForExport();

    let generatedCount = 0;
    let failedCount = 0;
    const failedRows = [];

    for (let i = 0; i < total; i++) {
      const row = bulkRows[i];
      updateBulkProgress(i, total, `Generating ${i + 1}/${total}: ${row.card_name}`);

      // Apply row to editor
      if (row.subtitle !== undefined) $('f-subtitle').value = row.subtitle;
      if (row.big_number !== undefined) $('f-bignum').value = row.big_number;
      if (row.months_label !== undefined) $('f-months').value = row.months_label;
      if (row.free_label !== undefined) $('f-free').value = row.free_label;
      if (row.description !== undefined) $('f-sublabel').value = row.description;
      if (row.original_price !== undefined) $('f-orig').value = formatPrice(row.original_price);
      if (row.final_price !== undefined) $('f-final').value = formatPrice(row.final_price);

      // Apply bulk colors
      const bCols = getBulkColors();
      $('c-bignum').value = bCols.bignum; $('c-months').value = bCols.months;
      $('c-free').value = bCols.free; $('c-subtitle').value = bCols.subtitle;
      $('c-orig').value = bCols.orig; $('c-orig-strike').value = bCols.origStrike; $('c-final').value = bCols.final;

      // logo â€” smart matching: exact, case-insensitive, with/without extension
      const lf = (row.logo_filename || '').trim();
      const logoSrc = lf ? resolveBulkLogoSrc(lf) : null;
      if (logoSrc) {
        $('tx-logo').src = logoSrc; $('tx-logo').style.display = 'inline-block'; $('tx-badge-emoji').style.display = 'none';
      } else {
        $('tx-logo').src = ''; $('tx-logo').style.display = 'none'; $('tx-badge-emoji').style.display = 'inline';
      }
      render();
      await settleForExport();

      try {
        const c = await renderToCanvas();
        const thumb = c.toDataURL('image/jpeg', .35);
        folder.cards.push({ id: uid(), name: row.card_name, date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }), thumb, data: { ...getData(), bgSrc: bulkBGSrc, pngW, pngH } });
        generatedCount++;
        if (generatedCount % 5 === 0 || i === total - 1) saveLib();
        if (downloadAfterGenerate) {
          const a = document.createElement('a');
          const fmt = window.exportFmt || 'jpeg';
          const q = parseInt(($('jpeg-q-slider') && $('jpeg-q-slider').value) || 60) / 100;
          const ext = fmt === 'png' ? 'png' : 'jpg';
          const dataUrl = fmt === 'png' ? c.toDataURL('image/png') : compressToTarget(c, q);
          a.download = (row.card_name || 'card_' + (i + 1)).replace(/[^a-z0-9]/gi, '_') + '.' + ext;
          a.href = dataUrl;
          a.click();
          await delay(250);
        } else {
          await delay(30);
        }
      } catch (err) {
        failedCount++;
        failedRows.push(row.card_name || ('Row ' + (i + 1)));
        reportClientIssue('error', 'Bulk row ' + (i + 1) + ' error:', err);
        updateBulkProgress(i + 1, total, `Skipped ${row.card_name || ('row ' + (i + 1))} (${failedCount} failed)`);
        await delay(40);
      }
    }

    updateBulkProgress(
      total,
      total,
      failedCount
        ? `Completed ${generatedCount}/${total} cards (${failedCount} failed)`
        : `All ${generatedCount} cards generated successfully!`
    );
    curFolderId = fid;
    saveLib(); renderLib(); refreshBulkFolders();
    if (failedCount) {
      toast(`Generated ${generatedCount}/${total} cards. ${failedCount} row(s) failed.`, 'var(--yellow)');
      reportClientIssue('warn', 'Bulk generation failed rows:', failedRows);
    } else {
      toast(
        downloadAfterGenerate
          ? generatedCount + ' cards generated, saved, and downloaded!'
          : generatedCount + ' cards generated and saved to library!'
      );
    }
    setTimeout(() => { const fc = $('fc-' + fid), ar = $('arr-' + fid); if (fc) fc.classList.add('op'); if (ar) ar.classList.add('op'); }, 500);
  } finally {
    restoreEditorSessionState(savedEditor);
    unmountEditorRenderHost();
    setBulkGenerateButtons(false);
    endFolderSyncPause();
  }
}

// â•â•â• MODALS â•â•â•
function openModal(id) { $(id).classList.add('on'); }
function closeModal(id) { $(id).classList.remove('on'); }
let confirmDialogResolve = null;
function openConfirmDialog(opts = {}) {
  if (confirmDialogResolve) closeConfirmDialog(false);
  $('confirm-title').textContent = opts.title || 'Are you sure?';
  $('confirm-message').textContent = opts.message || '';
  $('confirm-ok').textContent = opts.confirmText || 'Delete';
  $('confirm-cancel').textContent = opts.cancelText || 'Cancel';
  $('confirm-ok').classList.toggle('mb-danger', opts.danger !== false);
  $('confirm-ok').classList.toggle('mb-s', opts.danger === false);
  openModal('mo-confirm');
  setTimeout(() => $('confirm-ok').focus(), 0);
  return new Promise(resolve => { confirmDialogResolve = resolve; });
}
function closeConfirmDialog(result) {
  const resolve = confirmDialogResolve;
  confirmDialogResolve = null;
  closeModal('mo-confirm');
  if (resolve) resolve(!!result);
}
function acceptConfirmDialog() { closeConfirmDialog(true); }
function cancelConfirmDialog() { closeConfirmDialog(false); }
document.querySelectorAll('.mo').forEach(m => m.addEventListener('click', e => {
  if (e.target !== m) return;
  if (m.id === 'mo-confirm') cancelConfirmDialog();
  else if (m.id === 'mo-folder') closeFolderModal(null);
  else if (m.id === 'mo-folder-rename') closeFolderRenameModal();
  else m.classList.remove('on');
}));
function shouldUseNativeTextUndo(target) {
  if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return false;
  if (target.closest('.mo.on')) return true;
  if (target.id === 'lib-search') return true;
  if (target.closest('#tab-bulk')) return true;
  if (target.closest('#rpane-library')) return true;
  return false;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('mo-confirm') && $('mo-confirm').classList.contains('on')) cancelConfirmDialog();
    document.querySelectorAll('.mo.on').forEach(m => {
      if (m.id === 'mo-folder') closeFolderModal(null);
      else if (m.id === 'mo-folder-rename') closeFolderRenameModal();
      else m.classList.remove('on');
    });
    hideCtx();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); ctrlSave(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); exportPNGDownload(); }
  // Undo: Ctrl+Z (only when not typing in an input)
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
    if (shouldUseNativeTextUndo(document.activeElement)) return;
    e.preventDefault(); doUndo(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyZ') {
    if (shouldUseNativeTextUndo(document.activeElement)) return;
    e.preventDefault(); doUndo(); return;
  }
  // Redo: Ctrl+Shift+Z or Ctrl+Y
  if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.code === 'KeyZ') || e.code === 'KeyY')) {
    if (shouldUseNativeTextUndo(document.activeElement)) return;
    e.preventDefault(); doRedo(); return;
  }
});

// â•â•â• CLICK OUTSIDE DESELECT DRAG â•â•â•
document.addEventListener('DOMContentLoaded', () => {
  initDebugTools();
  initStaticDeployModeNotice();
  const stage = $('card-stage');
  const stageShell = document.querySelector('.stage-shell');
  stage.addEventListener('mousedown', e => {
    if (e.target === $('card-stage') || e.target === $('card-bg-img')) {
      clearSelectedElement();
    }
  });
  if (stageShell) {
    stageShell.addEventListener('click', e => {
      const clickedInteractive = e.target.closest('.tx-el') ||
        e.target.closest('.transform-box') ||
        e.target.closest('.pos-bar') ||
        e.target.closest('.stage-ruler') ||
        e.target.closest('.stage-guide');
      if (!clickedInteractive) clearSelectedElement();
    });
  }
  const preview = document.querySelector('.preview');
  if (preview) {
    preview.addEventListener('click', e => {
      const clickedCanvasArea = e.target.closest('#card-stage') ||
        e.target.closest('.transform-box') ||
        e.target.closest('.pos-bar') ||
        e.target.closest('#draft-banner') ||
        e.target.closest('#folder-sync-banner');
      if (!clickedCanvasArea) clearSelectedElement();
    });
  }
  initDrag();
  initTransformBox();
  loadBannerDraft();
  scheduleBannerRender();
  setEditorEmptyState(!pngW);
  applyPos();
  render();
  renderStageRulers();
  renderAssetManager();
  renderBulkValidation();
  initEditorSections();
  loadLib();
  setTimeout(() => {
    autoSpace(true);
    renderLayerList();
    captureEditorBaseline();
    resetUndoHistory();
    clean('Draft idle');
    maybeShowDraftRecovery();
  }, 300);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => scheduleBannerRender());
  }
});
window.addEventListener('resize', () => { renderStageRulers(); queueTransformBoxUpdate(); });
window.addEventListener('pagehide', flushServerLibSync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushServerLibSync();
});
window.addEventListener('online', () => {
  if (readLocalLibCache()) queueServerLibSync(false);
  refreshLibFromServer(true);
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// LOGOS â€” multi-file upload + grid
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let uploadedLogos = {}; // {name: dataURL}
let activeLogoName = null;

function handleLogoUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  let loaded = 0;
  const total = files.length;

  function checkDone() {
    loaded++;
    if (loaded === total) {
      $('logo-multi-ico').textContent = 'DONE';
  $('logo-multi-txt').innerHTML = total + ' logo(s) uploaded<br><span style="font-size:9px;opacity:.5">Click a logo below to apply</span>';
      $('logo-upload-box').classList.add('ok');
      renderLogoGrid();
      toast(total + ' logos loaded!');
    }
  }

  files.forEach(file => {
    const name = file.name.replace(/\.[^.]+$/, '');
    const isSVG = /\.svg$/i.test(file.name);
    if (isSVG) {
      // Rasterize SVG to PNG using viewBox-aware svgToPng
      const reader = new FileReader();
      reader.onload = ev => {
        svgToPng(ev.target.result, pngDataUrl => {
          uploadedLogos[name] = pngDataUrl;
          upsertSharedAsset('logo', pngDataUrl, name, { sourceName: file.name });
          checkDone();
        });
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = ev => {
        uploadedLogos[name] = ev.target.result;
        upsertSharedAsset('logo', ev.target.result, name, { sourceName: file.name });
        checkDone();
      };
      reader.readAsDataURL(file);
    }
  });
}

function renderLogoGrid() {
  const grid = $('logo-grid');
  grid.innerHTML = '';
  const names = Object.keys(uploadedLogos);
  if (!names.length) return;
  names.forEach(name => {
    const btn = document.createElement('button');
    btn.style.cssText = 'background:#090c15;border:1.5px solid var(--b2);border-radius:6px;padding:6px 4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;transition:all .15s;width:100%;';
    btn.dataset.logoName = name;
    const img = document.createElement('img');
    img.src = uploadedLogos[name];
    img.style.cssText = 'height:26px;width:auto;max-width:100%;object-fit:contain;pointer-events:none;';
    const lbl = document.createElement('div');
    lbl.textContent = name;
    lbl.style.cssText = 'font-size:9px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;width:100%;text-align:center;';
    btn.appendChild(img);
    btn.appendChild(lbl);
    btn.addEventListener('click', () => applyLogoByName(name, btn));
    btn.addEventListener('mouseenter', () => { if (name !== activeLogoName) btn.style.borderColor = 'var(--accent)'; });
    btn.addEventListener('mouseleave', () => { if (name !== activeLogoName) btn.style.borderColor = 'var(--b2)'; });
    // highlight if active
    if (name === activeLogoName) {
      btn.style.borderColor = 'var(--accent)';
      btn.style.background = '#0a1528';
    }
    grid.appendChild(btn);
  });
}

function renderAssetManager() {
  const assets = ensureAssetBuckets();
  const bgGrid = $('asset-bg-grid');
  const logoGrid = $('asset-logo-grid');
  if (bgGrid) {
    if (!assets.backgrounds.length) {
      bgGrid.innerHTML = '<div class="asset-empty">Uploaded backgrounds will appear here.</div>';
    } else {
      bgGrid.innerHTML = assets.backgrounds.map(asset => `
        <div class="asset-item" onclick="applyBackgroundAsset('${escapeHtml(asset.id)}')">
          <button class="asset-remove" onclick="event.stopPropagation();removeSharedAsset('background','${escapeHtml(asset.id)}')">x</button>
          <img class="asset-thumb" src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.name)}" />
          <div class="asset-meta">${escapeHtml(asset.name)}</div>
        </div>
      `).join('');
    }
  }
  if (logoGrid) {
    if (!assets.logos.length) {
      logoGrid.innerHTML = '<div class="asset-empty">Uploaded logos will appear here.</div>';
    } else {
      logoGrid.innerHTML = assets.logos.map(asset => `
        <div class="asset-item" onclick="applyLogoAsset('${escapeHtml(asset.id)}')">
          <button class="asset-remove" onclick="event.stopPropagation();removeSharedAsset('logo','${escapeHtml(asset.id)}')">x</button>
          <img class="asset-thumb logo" src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.name)}" />
          <div class="asset-meta">${escapeHtml(asset.name)}</div>
        </div>
      `).join('');
    }
  }
}

function applyBackgroundAsset(assetId) {
  const asset = ensureAssetBuckets().backgrounds.find(item => item.id === assetId);
  if (!asset) return;
  applyEditorBackground(asset.src, {
    name: asset.name,
    width: asset.width || 616,
    height: asset.height || 635
  });
  dirty();
  pushUndo();
  toast('Background asset applied');
}

function applyLogoAsset(assetId) {
  const asset = ensureAssetBuckets().logos.find(item => item.id === assetId);
  if (!asset) return;
  uploadedLogos[asset.name] = asset.src;
  renderLogoGrid();
  applyLogoByName(asset.name);
  toast('Logo asset applied');
}

function applyLogoByName(name, btnEl) {
  const src = uploadedLogos[name];
  if (!src) return;
  activeLogoName = name;
  $('tx-logo').src = src;
  $('tx-logo').style.display = 'inline-block';
  $('tx-badge-emoji').style.display = 'none';
  $('active-logo-name').style.display = 'block';
  $('aln-text').textContent = name;
  // update grid highlights
  document.querySelectorAll('#logo-grid button').forEach(b => {
    const isSel = b.dataset.logoName === name;
    b.style.borderColor = isSel ? 'var(--accent)' : 'var(--b2)';
    b.style.background = isSel ? '#0a1528' : '#090c15';
  });
  dirty();
  pushUndo();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// UNDO / REDO â€” Photoshop style
// Max 50 states, per-session only
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let undoStack = [];
let redoStack = [];
let undoLock = false; // prevent recursive pushes

function getState() {
  return {
    curName,
    data: getData()
  };
}

function applyState(state) {
  undoLock = true;
  curName = state.curName || 'Untitled Card';
  $('cur-name').textContent = curName;
  setData(state.data || {});
  renderLogoGrid();
  renderLayerList();
  undoLock = false;
}

function getStateHash(state) {
  return JSON.stringify(state || getState());
}

function readDraft() {
  try {
    const raw = localStorage.getItem(EDITOR_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function updateDraftBanner(draft) {
  const banner = $('draft-banner');
  if (!banner) return;
  if (!draft) {
    banner.style.display = 'none';
    return;
  }
  $('draft-banner-text').textContent = 'Recovered draft from ' + new Date(draft.savedAt).toLocaleString('en-IN') + '. Restore it before continuing?';
  banner.style.display = 'flex';
}

function captureEditorBaseline() {
  editorBaselineHash = getStateHash();
}

function hasMeaningfulDraftChanges() {
  return getStateHash() !== editorBaselineHash;
}

function saveDraftNow() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
  if (!hasMeaningfulDraftChanges()) {
    discardDraft(false);
    return;
  }
  const draft = {
    savedAt: new Date().toISOString(),
    state: getState(),
    uploadedLogos: jclone(uploadedLogos),
    curCardId,
    curFolderId
  };
  try {
    localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(draft));
    setAutosaveChip('Draft saved', 'live');
  } catch (e) {
    setAutosaveChip('Draft cache full', 'warn');
  }
}

function queueDraftAutosave() {
  clearTimeout(draftSaveTimer);
  setAutosaveChip('Saving draft...', 'live');
  draftSaveTimer = setTimeout(saveDraftNow, 900);
}

let cardAutoSaveTimer = null;

function saveCurrentCardToLibrary() {
  if (!curCardId || !curFolderId) return false;
  const folder = getFolderById(curFolderId);
  if (!folder) return false;
  const card = folder.cards.find(c => c.id === curCardId);
  if (!card) return false;
  isolateFolderCardDataRefs(folder);
  card.data = jclone(getData());
  card.name = curName;
  card.date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  saveLib();
  refreshLibraryCardEntry(folder.id, card.id, { thumb: false }) || renderLib();
  updateSelUI();
  syncLibraryFolderOpenState();
  captureEditorBaseline();
  clean('Autosaved', 'live');
  return true;
}

function flushCurrentCardAutoSave() {
  clearTimeout(cardAutoSaveTimer);
  cardAutoSaveTimer = null;
  return saveCurrentCardToLibrary();
}

function queueCurrentCardAutoSave() {
  if (!curCardId || !curFolderId) return;
  clearTimeout(cardAutoSaveTimer);
  cardAutoSaveTimer = setTimeout(() => {
    cardAutoSaveTimer = null;
    saveCurrentCardToLibrary();
  }, 700);
}

function discardDraft(showToast) {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
  localStorage.removeItem(EDITOR_DRAFT_KEY);
  updateDraftBanner(null);
  setAutosaveChip('Draft idle');
  if (showToast) toast('Draft discarded');
}

function restoreDraft() {
  const draft = readDraft();
  if (!draft || !draft.state) return;
  uploadedLogos = jclone(draft.uploadedLogos || {});
  renderLogoGrid();
  applyState(draft.state);
  curCardId = draft.curCardId || null;
  curFolderId = draft.curFolderId || null;
  dirty();
  pushUndo();
  updateDraftBanner(null);
  setAutosaveChip('Draft restored', 'live');
  toast('Draft restored!');
}

function maybeShowDraftRecovery() {
  const draft = readDraft();
  if (!draft || !draft.state) {
    setAutosaveChip('Draft idle');
    return;
  }
  if (getStateHash(draft.state) === editorBaselineHash && !Object.keys(draft.uploadedLogos || {}).length) {
    discardDraft(false);
    return;
  }
  updateDraftBanner(draft);
  setAutosaveChip('Draft available', 'warn');
}

function resetUndoHistory() {
  undoStack = [getState()];
  redoStack = [];
  updateUndoIndicator();
}

function pushUndo() {
  if (undoLock) return;
  const state = getState();
  if (undoStack.length && getStateHash(undoStack[undoStack.length - 1]) === getStateHash(state)) {
    updateUndoIndicator();
    return;
  }
  undoStack.push(state);
  if (undoStack.length > 60) undoStack.shift();
  redoStack = []; // clear redo on new action
  updateUndoIndicator();
}

function doUndo() {
  if (undoStack.length <= 1) { toast('Nothing to undo', 'var(--muted)'); return; }
  // push current to redo
  redoStack.push(undoStack.pop());
  const prev = undoStack[undoStack.length - 1];
  applyState(prev);
  editorMutationVersion++;
  syncEditorDirtyToBaseline();
  updateUndoIndicator();
  toast('â†© Undo');
}

function doRedo() {
  if (!redoStack.length) { toast('Nothing to redo', 'var(--muted)'); return; }
  const next = redoStack.pop();
  undoStack.push(next);
  applyState(next);
  editorMutationVersion++;
  syncEditorDirtyToBaseline();
  updateUndoIndicator();
  toast('â†ª Redo');
}

function updateUndoIndicator() {
  if ($('undo-btn')) $('undo-btn').disabled = undoStack.length <= 1;
  if ($('redo-btn')) $('redo-btn').disabled = !redoStack.length;
}

// Debounced push â€” don't push on every keystroke, wait 600ms after stop
let undoTimer = null;
function debouncedPushUndo() {
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => pushUndo(), 600);
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Ctrl+S â€” Save current card to library
// (updates existing if same name, else opens save modal)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function ctrlSave() {
  // â˜… Find by exact card ID, not by name â€” prevents overwriting other cards
  let found = null;
  let foundFolder = null;
  if (curCardId && curFolderId) {
    for (const folder of LIB.folders) {
      if (folder.id !== curFolderId) continue;
      const card = folder.cards.find(c => c.id === curCardId);
      if (card) { found = card; foundFolder = folder; break; }
    }
  }
  if (found && foundFolder) {
    // Update in place â€” only THIS card
    const thumb = await snap();
    found.data = getData();
    found.thumb = thumb;
    found.name = curName; // sync name if renamed
    found.date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
    saveLib();
    renderLib();
    captureEditorBaseline();
    discardDraft(false);
    clean('Saved to library', 'live');
    toast('ðŸ’¾ Saved: ' + curName);
    // keep folder open
    setTimeout(() => {
      const fc = $('fc-' + foundFolder.id), ar = $('arr-' + foundFolder.id);
      if (fc) fc.classList.add('op'); if (ar) ar.classList.add('op');
    }, 100);
  } else {
    // No existing card loaded â€” open save modal
    openSave();
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CONTEXT MENU RENAME (library card)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ctxRename() {
  hideCtx();
  const { fid, cid } = ctxTarget;
  const folder = LIB.folders.find(f => f.id === fid); if (!folder) return;
  const card = folder.cards.find(c => c.id === cid); if (!card) return;
  $('lib-rename-inp').value = card.name;
  $('lib-tags-inp').value = tagsToText(card.tags);
  $('mo-lib-rename').dataset.fid = fid;
  $('mo-lib-rename').dataset.cid = cid;
  openModal('mo-lib-rename');
  setTimeout(() => $('lib-rename-inp').focus(), 100);
}

function doLibRename() {
  const fid = $('mo-lib-rename').dataset.fid;
  const cid = $('mo-lib-rename').dataset.cid;
  const newName = $('lib-rename-inp').value.trim();
  if (!newName) { toast('Enter a name!', 'var(--red)'); return; }
  const folder = LIB.folders.find(f => f.id === fid); if (!folder) return;
  const card = folder.cards.find(c => c.id === cid); if (!card) return;
  const oldName = card.name;
  card.name = newName;
  card.tags = parseTags($('lib-tags-inp').value);
  // if this is the currently loaded card, update chip
  if (curName === oldName) { curName = newName; $('cur-name').textContent = newName; }
  saveLib(); renderLib(); closeModal('mo-lib-rename');
  setTimeout(() => {
    const fc = $('fc-' + fid), ar = $('arr-' + fid);
    if (fc) fc.classList.add('op'); if (ar) ar.classList.add('op');
  }, 100);
  toast('Renamed to "' + newName + '"!');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PATCH getData/setData for logo name
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function syncActiveLogoUI(name) {
  activeLogoName = name || null;
  $('active-logo-name').style.display = activeLogoName ? 'block' : 'none';
  $('aln-text').textContent = activeLogoName || '';
  renderLogoGrid();
}


// â•â•â• EXPORT FORMAT â•â•â•
window.exportFmt = 'png';

function setExportFmt(fmt) {
  window.exportFmt = fmt;
  $('export-main-btn').textContent = 'Download ' + fmt.toUpperCase();
  // update quality row visibility
  const m = $('export-menu');
  m.querySelectorAll('.exp-q-row').forEach(r => r.style.display = fmt === 'jpeg' ? 'flex' : 'none');
  // keep menu open so user can adjust quality
  if (fmt === 'png') m.style.display = 'none';
}

function toggleExportMenu(e) {
  e.stopPropagation();
  e.preventDefault();
  const m = $('export-menu');
  const isOpen = m.style.display === 'block';
  m.style.display = isOpen ? 'none' : 'block';
  // show quality row only for jpeg
  const qRows = m.querySelectorAll('.exp-q-row');
  qRows.forEach(r => r.style.display = window.exportFmt === 'jpeg' ? 'flex' : 'none');
}
// Close export menu on outside click â€” but NOT when clicking inside it
document.addEventListener('click', (e) => {
  const m = $('export-menu');
  if (m && !m.contains(e.target) && e.target.id !== 'export-main-btn') {
    m.style.display = 'none';
  }
});

// Compress canvas to target ~40KB using binary search on quality
function compressToTarget(canvas, startQ) {
  // Try from given quality down to find something under 40KB
  let q = startQ || 0.6;
  let dataUrl = canvas.toDataURL('image/jpeg', q);
  // estimate size: base64 length * 0.75 bytes
  let sz = dataUrl.length * 0.75;
  // If already under 40KB, done
  if (sz <= 40960) return dataUrl;
  // Binary search: go lower
  let lo = 0.05, hi = q;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const t = canvas.toDataURL('image/jpeg', mid);
    const s = t.length * 0.75;
    if (s > 40960) hi = mid;
    else { lo = mid; dataUrl = t; }
  }
  return dataUrl;
}

async function exportWithFormat() {
  if (!pngW) { toast('Upload background PNG first!', 'var(--red)'); return; }
  const btn = $('export-main-btn');
  btn.textContent = 'Working...'; btn.disabled = true;
  try {
    const c = await renderToCanvas();
    const fmt = window.exportFmt || 'png';
    const q = parseInt($('jpeg-q-slider').value) / 100;
    let dataUrl, ext;
    if (fmt === 'png') {
      dataUrl = c.toDataURL('image/png');
      ext = 'png';
    } else {
      dataUrl = compressToTarget(c, q);
      ext = 'jpg';
    }
    const kb = Math.round(dataUrl.length * 0.75 / 1024);
    showSizeHint(kb, fmt.toUpperCase());
    // â˜… Blob download â€” reliable, always works
    const byteString = atob(dataUrl.split(',')[1]);
    const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let j = 0; j < byteString.length; j++) ia[j] = byteString.charCodeAt(j);
    const blob = new Blob([ab], { type: mimeString });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none'; document.body.appendChild(a);
    a.download = curName.replace(/[^a-z0-9]/gi, '_') + '.' + ext;
    a.href = blobUrl; a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
    toast('Exported ' + kb + 'KB ' + fmt.toUpperCase() + '!');
  } catch (err) { toast('Export error', 'var(--red)'); reportClientIssue('error', err); }
  btn.textContent = 'Download ' + (window.exportFmt || 'png').toUpperCase();
  btn.disabled = false;
}

function showSizeHint(kb, fmt) {
  const h = $('size-hint');
  if (!h) return;
  h.style.display = 'inline';
  h.textContent = kb + ' KB - ' + fmt;
  clearTimeout(window._sizeHintTimer);
  window._sizeHintTimer = setTimeout(() => { h.style.display = 'none'; }, 8000);
}

// Override old export function to use new one

// â•â•â• BULK COLORS â•â•â•
function getBulkColors() {
  return {
    bignum: ($('bulk-c-bignum') && $('bulk-c-bignum').value) || '#1BA8E8',
    months: ($('bulk-c-months') && $('bulk-c-months').value) || '#1a1a2e',
    free: ($('bulk-c-free') && $('bulk-c-free').value) || '#1BA8E8',
    subtitle: ($('bulk-c-subtitle') && $('bulk-c-subtitle').value) || '#8fa3b8',
    orig: ($('bulk-c-orig') && $('bulk-c-orig').value) || '#aab0c0',
    origStrike: ($('bulk-c-orig-strike') && $('bulk-c-orig-strike').value) || (($('bulk-c-orig') && $('bulk-c-orig').value) || '#aab0c0'),
    final: ($('bulk-c-final') && $('bulk-c-final').value) || '#1a1a2e',
  };
}

// â•â•â• FIX ctxExport to use format â•â•â•
async function ctxExport() {
  hideCtx();
  const { fid, cid } = ctxTarget;
  const folder = LIB.folders.find(f => f.id === fid); if (!folder) return;
  const card = folder.cards.find(c => c.id === cid); if (!card || !card.data) return;
  loadCard(fid, cid); await delay(300);
  const c = await renderToCanvas();
  const fmt = window.exportFmt || 'png';
  const q = parseInt(($('jpeg-q-slider') && $('jpeg-q-slider').value) || 60) / 100;
  let dataUrl, ext;
  if (fmt === 'png') { dataUrl = c.toDataURL('image/png'); ext = 'png'; }
  else { dataUrl = compressToTarget(c, q); ext = 'jpg'; }
  const a = document.createElement('a');
  a.download = card.name.replace(/[^a-z0-9]/gi, '_') + '.' + ext;
  a.href = dataUrl; a.click();
  const kb = Math.round(dataUrl.length * 0.75 / 1024);
  toast('Exported ' + kb + 'KB!');
}

// â•â•â• FOLDER CONTEXT MENU â•â•â•
let ctxFolderFid = null;

function showFolderCtx(e, fid) {
  e.preventDefault(); e.stopPropagation();
  ctxFolderFid = fid;
  // hide card ctx if open
  $('ctx').style.display = 'none';
  const m = $('fctx'); m.style.display = 'block';
  let x = e.clientX, y = e.clientY;
  if (x + 185 > window.innerWidth) x = window.innerWidth - 190;
  if (y + 100 > window.innerHeight) y = window.innerHeight - 110;
  m.style.left = x + 'px'; m.style.top = y + 'px';
}
function hideFolderCtx() { $('fctx').style.display = 'none'; }

document.addEventListener('click', hideFolderCtx);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideFolderCtx(); });

async function fctxDownload() {
  hideFolderCtx();
  const folder = LIB.folders.find(f => f.id === ctxFolderFid);
  if (!folder) return;
  const cards = folder.cards.filter(c => c.data && c.data.bgSrc && c.data.bgSrc.length > 10);
  if (!cards.length) { toast('No exportable cards in folder', 'var(--red)'); return; }

  // â˜… Always use <a> download â€” NO permission popup, works everywhere
  switchTab('editor');
  await delay(200);

  const savedState = getData();
  const savedBgSrc = $('card-bg-img').src;
  const savedLogoSrc = $('tx-logo').src;
  const savedName = curName;
  const savedCardId = curCardId;
  const savedFolderId = curFolderId;
  beginFolderSyncPause();

  const fmt = window.exportFmt || 'jpeg';
  const q = parseInt(($('jpeg-q-slider') && $('jpeg-q-slider').value) || 60) / 100;

  let done = 0;
  toast('Downloading ' + cards.length + ' cards...');

  // â˜… Ensure html2canvas is loaded BEFORE the loop
  await new Promise(res => ensureH2C(res));

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const d = getEffectiveCardData(folder.id, card.data);

    // Load BG â€” wait for actual load
    const bgImg = $('card-bg-img');
    pngW = d.pngW || 616; pngH = d.pngH || 635;
    dispScale = Math.min(1, 500 / pngW);
    const stage = $('card-stage');
    stage.style.width = Math.round(pngW * dispScale) + 'px';
    stage.style.height = Math.round(pngH * dispScale) + 'px';
    stage.dataset.scale = dispScale;
    $('card-ph').style.display = 'none';

    // â˜… Always reload BG to avoid stale cache
    await new Promise(res => {
      bgImg.onload = res;
      bgImg.onerror = res;
      bgImg.src = '';
      setTimeout(() => { bgImg.src = d.bgSrc; }, 20);
    });
    bgImg.style.display = 'block';

    // Load logo
    const logoImg = $('tx-logo');
    if (d.logoSrc && d.logoSrc.length > 10) {
      await new Promise(res => {
        logoImg.onload = res;
        logoImg.onerror = res;
        logoImg.src = '';
        setTimeout(() => { logoImg.src = d.logoSrc; }, 20);
      });
      logoImg.style.display = 'inline-block'; $('tx-badge-emoji').style.display = 'none';
    } else {
      logoImg.src = ''; logoImg.style.display = 'none'; $('tx-badge-emoji').style.display = 'inline';
    }

    setData(d);
    await delay(300);

    try {
      if (selEl) selEl.classList.remove('sel', 'drag');
      const transformBox = $('transform-box');
      const hadTransformBox = !!(transformBox && transformBox.classList.contains('on'));
      if (transformBox) transformBox.classList.remove('on');
      const canvas = await html2canvas(stage, {
        scale: 1 / (parseFloat(stage.dataset.scale) || 1),
        useCORS: true, allowTaint: true, backgroundColor: null, logging: false,
        width: stage.offsetWidth, height: stage.offsetHeight
      });
      if (hadTransformBox) queueTransformBoxUpdate();
      if (!canvas) { toast('Could not render: ' + card.name, 'var(--yellow)'); continue; }

      let dataUrl, ext;
      if (fmt === 'png') { dataUrl = canvas.toDataURL('image/png'); ext = 'png'; }
      else { dataUrl = compressToTarget(canvas, q); ext = 'jpg'; }

      const fname = (folder.name.replace(/[^a-z0-9]/gi, '_') + '__' + card.name.replace(/[^a-z0-9\-_ ]/gi, '_')).trim() + '.' + ext;

      // â˜… Reliable blob download â€” works in all browsers, no permission needed
      const byteString = atob(dataUrl.split(',')[1]);
      const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let j = 0; j < byteString.length; j++) ia[j] = byteString.charCodeAt(j);
      const blob = new Blob([ab], { type: mimeString });
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      // Cleanup after a delay
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);

      done++;
      toast('Downloaded ' + done + '/' + cards.length + ': ' + card.name);
      await delay(800); // â˜… Longer delay between downloads to let browser process
    } catch (err) {
      reportClientIssue('error', 'Download error [' + card.name + ']:', err);
      toast('Error: ' + card.name, 'var(--yellow)');
    }
  }

  // Restore editor state
  setData(savedState);
  curName = savedName; $('cur-name').textContent = savedName;
  curCardId = savedCardId; curFolderId = savedFolderId;
  endFolderSyncPause();

  toast(done + '/' + cards.length + ' cards downloaded!');
}

// â”€â”€ Folder Rename â”€â”€
async function fctxDownloadZip() {
  hideFolderCtx();
  const folder = LIB.folders.find(f => f.id === ctxFolderFid);
  if (!folder) return;

  const cards = folder.cards.filter(c => c.data && c.data.bgSrc && c.data.bgSrc.length > 10);
  if (!cards.length) {
    toast('No exportable cards in folder', 'var(--red)');
    return;
  }

  if (typeof JSZip === 'undefined') {
    toast('ZIP library not loaded - please refresh the page', 'var(--red)');
    return;
  }

  switchTab('editor');
  await delay(200);
  await new Promise(res => ensureH2C(res));

  const savedState = getData();
  const savedName = curName;
  const savedCardId = curCardId;
  const savedFolderId = curFolderId;
  beginFolderSyncPause();

  const zip = new JSZip();
  let done = 0;

  $('gen-prog').style.display = 'block';
  $('prog-bar').style.width = '0%';
  $('prog-txt').textContent = 'Preparing ZIP...';
  toast('Preparing ZIP for ' + cards.length + ' cards...');

  try {
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      $('prog-bar').style.width = Math.round((i / cards.length) * 100) + '%';
      $('prog-txt').textContent = `Adding ${i + 1}/${cards.length}: ${card.name}`;
      const { dataUrl, ext } = await renderCardExportData(card.data, folder.id);
      zip.file(sanitizeExportName(card.name) + '.' + ext, dataUrlToBlob(dataUrl));
      done++;
    }
    $('prog-bar').style.width = '100%';
    $('prog-txt').textContent = `Building ZIP (${done} cards)...`;
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerBlobDownload(zipBlob, sanitizeExportName(folder.name) + '.zip');
    toast(done + ' cards zipped and downloaded!');
  } catch (err) {
    reportClientIssue('error', 'Folder ZIP export error:', err);
    toast('ZIP export failed', 'var(--red)');
  } finally {
    setData(savedState);
    curName = savedName; $('cur-name').textContent = savedName;
    curCardId = savedCardId; curFolderId = savedFolderId;
    endFolderSyncPause();
  }
}

function fctxRename() {
  hideFolderCtx();
  openFolderRenameModal(ctxFolderFid);
}

// â”€â”€ Folder Copy (deep clone, all cards) â”€â”€
function fctxCopy() {
  hideFolderCtx();
  const folder = LIB.folders.find(f => f.id === ctxFolderFid);
  if (!folder) return;
  const copy = {
    id: uid(),
    name: folder.name + ' (copy)',
    sharedOverrides: jclone(folder.sharedOverrides || {}),
    cards: folder.cards.map(c => ({
      id: uid(),
      name: c.name,
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }),
      thumb: c.thumb,
      data: JSON.parse(JSON.stringify(c.data)) // deep clone â€” original untouched
    }))
  };
  LIB.folders.push(copy);
  saveLib(); renderLib();
  toast('"' + copy.name + '" created with ' + copy.cards.length + ' cards');
}

// â”€â”€ Download selected cards â”€â”€
async function selDownload() {
  if (!selectedCards.length) return;
  const cards = selectedCards.map(({ fid, cid }) => {
    const folder = LIB.folders.find(f => f.id === fid);
    const card = folder ? folder.cards.find(c => c.id === cid) : null;
    return card ? { fid, card } : null;
  }).filter(entry => entry && entry.card && entry.card.data && entry.card.data.bgSrc && entry.card.data.bgSrc.length > 10);

  if (!cards.length) { toast('Selected cards have no background - save cards first', 'var(--red)'); return; }

  // â˜… No permission popup â€” always direct download
  switchTab('editor');
  await delay(200);
  await new Promise(res => ensureH2C(res));

  const savedState = getData();
  const savedName = curName;
  const savedCardId = curCardId;
  const savedFolderId = curFolderId;
  const fmt = window.exportFmt || 'jpeg';
  const q = parseInt(($('jpeg-q-slider') && $('jpeg-q-slider').value) || 60) / 100;
  beginFolderSyncPause();

  let done = 0;
  toast('Downloading ' + cards.length + ' selected cards...');

  for (let i = 0; i < cards.length; i++) {
    const entry = cards[i];
    const card = entry.card;
    const d = getEffectiveCardData(entry.fid, card.data);

    const bgImg = $('card-bg-img');
    pngW = d.pngW || 616; pngH = d.pngH || 635;
    dispScale = Math.min(1, 500 / pngW);
    const stage = $('card-stage');
    stage.style.width = Math.round(pngW * dispScale) + 'px';
    stage.style.height = Math.round(pngH * dispScale) + 'px';
    stage.dataset.scale = dispScale;
    $('card-ph').style.display = 'none';

    await new Promise(res => { bgImg.onload = res; bgImg.onerror = res; bgImg.src = ''; setTimeout(() => { bgImg.src = d.bgSrc; }, 20); });
    bgImg.style.display = 'block';

    const logoImg = $('tx-logo');
    if (d.logoSrc && d.logoSrc.length > 10) {
      await new Promise(res => { logoImg.onload = res; logoImg.onerror = res; logoImg.src = ''; setTimeout(() => { logoImg.src = d.logoSrc; }, 20); });
      logoImg.style.display = 'inline-block'; $('tx-badge-emoji').style.display = 'none';
    } else {
      logoImg.src = ''; logoImg.style.display = 'none'; $('tx-badge-emoji').style.display = 'inline';
    }

    setData(d);
    await delay(300);

    try {
      if (selEl) selEl.classList.remove('sel', 'drag');
      const transformBox = $('transform-box');
      const hadTransformBox = !!(transformBox && transformBox.classList.contains('on'));
      if (transformBox) transformBox.classList.remove('on');
      const canvas = await html2canvas(stage, {
        scale: 1 / (parseFloat(stage.dataset.scale) || 1),
        useCORS: true, allowTaint: true, backgroundColor: null, logging: false,
        width: stage.offsetWidth, height: stage.offsetHeight
      });
      if (hadTransformBox) queueTransformBoxUpdate();
      if (!canvas) { toast('Skipped: ' + card.name, 'var(--yellow)'); continue; }

      let dataUrl, ext;
      if (fmt === 'png') { dataUrl = canvas.toDataURL('image/png'); ext = 'png'; }
      else { dataUrl = compressToTarget(canvas, q); ext = 'jpg'; }

      const fname = card.name.replace(/[^a-z0-9\-_ ]/gi, '_').trim() + '.' + ext;

      // â˜… Blob download â€” reliable, no permission
      const byteString = atob(dataUrl.split(',')[1]);
      const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let j = 0; j < byteString.length; j++) ia[j] = byteString.charCodeAt(j);
      const blob = new Blob([ab], { type: mimeString });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none'; a.href = blobUrl; a.download = fname;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);

      done++;
      const kb = Math.round(dataUrl.length * 0.75 / 1024);
      toast('Downloaded ' + done + '/' + cards.length + ': ' + card.name + ' (' + kb + 'KB)');
      await delay(800);
    } catch (err) {
      reportClientIssue('error', 'selDownload error:', err);
      toast('Error: ' + card.name, 'var(--yellow)');
    }
  }

  setData(savedState);
  curName = savedName; $('cur-name').textContent = savedName;
  curCardId = savedCardId; curFolderId = savedFolderId;
  endFolderSyncPause();
  clearSelection();
  toast(done + ' cards downloaded!');
}

async function fctxDelete() {
  hideFolderCtx();
  const folder = LIB.folders.find(f => f.id === ctxFolderFid);
  if (!folder) return;
  const ok = await openConfirmDialog({
    title: 'Delete folder?',
    message: `Delete "${folder.name}" and all ${folder.cards.length} cards inside? This cannot be undone.`,
    confirmText: 'Delete Folder'
  });
  if (!ok) return;
  if (folder.cards) folder.cards.forEach(card => folderSyncBaseByCard.delete(folderEditBaseKey(folder.id, card.id)));
  if (libraryPinnedFolderId === folder.id) libraryPinnedFolderId = null;
  LIB.folders = LIB.folders.filter(f => f.id !== ctxFolderFid);
  saveLib(); renderLib();
  toast('Folder deleted');
}

// â•â•â• AUTO VERTICAL SPACING â•â•â•
// Uses exact proportions from reference card (pixel-measured):
// badge center 6.5%, subtitle 21%, offer 36%, pricing 68%
// Bottom 23% reserved for "Claim Now" button area
function autoSpace(silent) {
  offerAutoCenter = true;
  const stage = $('card-stage');
  if (!stage || !stage.offsetHeight) return;
  const stageH = stage.offsetHeight;

  // sublabel is now INSIDE tx-offer, so only 4 draggable elements
  const items = [
    { key: 'badge', el: $('tx-badge') },
    { key: 'subtitle', el: $('tx-subtitle') },
    { key: 'offer', el: $('tx-offer') },
    { key: 'pricing', el: $('tx-pricing') },
  ];

  // Measure actual rendered heights (in % of stage)
  const heights = items.map(item => {
    const h = item.el ? item.el.getBoundingClientRect().height : 0;
    return Math.max((h / stageH) * 100, 2);
  });
  const totalContentPct = heights.reduce((a, b) => a + b, 0);
  const topPad = 12;
  const botPad = 23;
  const usable = 100 - topPad - botPad - totalContentPct;
  const gap = Math.max(1.5, usable / (items.length - 1));

  let currentTop = topPad;
  items.forEach((item, i) => {
    pos[item.key] = { top: +currentTop.toFixed(2), left: 50 };
    currentTop += heights[i] + gap;
  });

  applyPos();
  render();
  if (!silent) dirty();
  if (!silent) toast('Auto-spaced!');
}

// Override render to hide empty sublabel and keep offer centered visually

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MULTI-SELECT â€” click to select, shift+click for range
// Double-click to open/edit a card
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let selectedCards = []; // [{fid, cid}]
let lastClickedIdx = -1; // global flat index for shift-range

// Build flat ordered list of all cards across all folders (topâ†’bottom as rendered)
function getAllCardsFlat() {
  const all = [];
  LIB.folders.forEach(f => f.cards.forEach(c => all.push({ fid: f.id, cid: c.id })));
  return all;
}

function getCardFlatIdx(cid) {
  return getAllCardsFlat().findIndex(c => c.cid === cid);
}

function isSelected(cid) {
  return selectedCards.some(s => s.cid === cid);
}
function handleCardClick(e, fid, cid) {
  if (e.button === 2) return;
  const isPlainClick = !e.ctrlKey && !e.metaKey && !e.shiftKey;
  const flatIdx = getCardFlatIdx(cid);

  if (e.shiftKey && lastClickedIdx >= 0 && lastClickedIdx !== flatIdx) {
    const all = getAllCardsFlat();
    const lo = Math.min(lastClickedIdx, flatIdx);
    const hi = Math.max(lastClickedIdx, flatIdx);
    for (let i = lo; i <= hi; i++) {
      const c = all[i];
      if (!isSelected(c.cid)) selectedCards.push(c);
    }
    lastClickedIdx = flatIdx;
    updateSelUI();
  } else {
    if (isPlainClick) {
      selectedCards = [{ fid, cid }];
    } else {
      const idx = selectedCards.findIndex(s => s.cid === cid);
      if (idx >= 0) {
        selectedCards.splice(idx, 1);
      } else {
        selectedCards.push({ fid, cid });
      }
    }
    lastClickedIdx = flatIdx;
    updateSelUI();
  }

  if (isPlainClick && selectedCards.length === 1 && selectedCards[0].fid === fid && selectedCards[0].cid === cid) {
    if (curFolderId !== fid || curCardId !== cid) {
      loadCard(fid, cid, { silent: true });
    } else {
      updateSelUI();
    }
  }
}

function clearSelection() {
  selectedCards = [];
  lastClickedIdx = -1;
  updateSelUI();
}
function selDeselect() { clearSelection(); }

function updateSelUI() {
  // Refresh card highlight in library list
  document.querySelectorAll('.ci').forEach(el => {
    el.classList.toggle('selected', isSelected(el.dataset.cid));
    el.classList.toggle('current', el.dataset.fid === String(curFolderId) && el.dataset.cid === String(curCardId));
  });
  document.querySelectorAll('.ci-badge.editing').forEach(badge => badge.remove());
  document.querySelectorAll('.ci.current').forEach(el => {
    if (!el.querySelector('.ci-badge.editing')) {
      const badge = document.createElement('div');
      badge.className = 'ci-badge editing';
      badge.textContent = 'Editing';
      el.appendChild(badge);
    }
  });
  document.querySelectorAll('.folder-hd').forEach(el => {
    const folderItem = el.closest('.folder-item');
    const folderCards = folderItem ? folderItem.querySelector('.folder-cards') : null;
    const fid = folderCards && folderCards.id ? folderCards.id.replace('fc-', '') : '';
    el.classList.toggle('active', !!fid && fid === String(curFolderId));
  });
  const cnt = selectedCards.length;
  const bar = $('sel-bar');
  if (cnt > 0) {
    bar.classList.add('on');
    $('sel-count').textContent = cnt;
  } else {
    bar.classList.remove('on');
  }
  // qprev removed â€” library list is fully scrollable now
  syncLibraryFolderOpenState();
}

function openSelectedCard() {
  if (selectedCards.length !== 1) return;
  const { fid, cid } = selectedCards[0];
  clearSelection();
  loadCard(fid, cid);
}

// Apply current editor BG to all selected cards
async function selApplyBG() {
  if (!selectedCards.length) return;
  const bgImg = $('card-bg-img');
  const bgSrc = bgImg && bgImg.src && bgImg.src.startsWith('data:') ? bgImg.src : null;
  if (!bgSrc || !pngW) {
    toast('First load a background image in the Editor tab!', 'var(--red)');
    return;
  }
  let count = 0;
  selectedCards.forEach(({ fid, cid }) => {
    const folder = LIB.folders.find(f => f.id === fid);
    if (!folder) return;
    const card = folder.cards.find(c => c.id === cid);
    if (!card || !card.data) return;
    card.data.bgSrc = bgSrc;
    card.data.pngW = pngW;
    card.data.pngH = pngH;
    count++;
  });
  saveLib();
  renderLib(); // refresh thumbnails
  updateSelUI(); // refresh highlights without clearing selection
  toast('BG applied to ' + count + ' card' + (count !== 1 ? 's' : '') + '! Selection kept - upload new BG to replace.');
}

// Escape key or outside click clears selection
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') clearSelection();
});
document.addEventListener('click', e => {
  if (selEl && !shouldPreserveCanvasSelection(e.target)) {
    clearSelectedElement();
  }
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// LAYER PANEL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const LAYERS = [
  { key: 'badge', icon: 'L', name: 'Logo / Badge', hasText: false, hasColor: false, hasSz: 'sz-logo' },
  { key: 'subtitle', icon: 'T', name: 'Subtitle', hasText: 'f-subtitle', hasColor: 'c-subtitle', hasSz: 'sz-subtitle' },
  {
    key: 'offer', icon: 'O', name: '# MONTHS FREE + Plan', hasText: false, hasColor: false, hasSz: false,
    subfields: [
      { label: 'Big #', text: 'f-bignum', color: 'c-bignum', sz: 'sz-bignum' },
      { label: 'MONTHS', text: 'f-months', color: 'c-months', sz: 'sz-months' },
      { label: 'FREE', text: 'f-free', color: 'c-free', sz: 'sz-free' },
      { label: 'Plan', text: 'f-sublabel', color: 'c-sublabel', sz: 'sz-sublabel' },
    ]
  },
  {
    key: 'pricing', icon: 'R', name: 'Pricing', hasText: false, hasColor: false, hasSz: false,
    subfields: [
      { label: 'Original', text: 'f-orig', color: 'c-orig', sz: 'sz-orig' },
      { label: 'Strike Line', color: 'c-orig-strike' },
      { label: 'Final', text: 'f-final', color: 'c-final', sz: 'sz-final' },
    ]
  },
];

let activeLayerKey = null;

function switchRTab(tab) {
  document.querySelectorAll('.rpanel-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rpanel-pane').forEach(p => p.classList.remove('active'));
  $('rtab-' + tab).classList.add('active');
  $('rpane-' + tab).classList.add('active');
  // Clear kb-focus when switching tabs
  document.querySelectorAll('.ci.kb-focus').forEach(c => c.classList.remove('kb-focus'));
}

function renderLayerList() {
  const list = $('layer-list');
  if (!list) return;
  list.innerHTML = '';
  LAYERS.forEach(layer => {
    const el = document.createElement('div');
    const isActive = activeLayerKey === layer.key;
    const isSelected = selectedLayerKeys.includes(layer.key);
    el.className = 'layer-item' + (isActive ? ' active' : isSelected ? ' selected' : '');
    el.dataset.key = layer.key;
    // Get a preview value to show
    let previewVal = '';
    if (layer.hasText) previewVal = v(layer.hasText) || '';
    else if (layer.subfields) previewVal = layer.subfields.map(sf => (sf.text ? v(sf.text) : '')).filter(Boolean).join(' ').substring(0, 20);
    el.innerHTML = `
      <span class="layer-icon">${layer.icon}</span>
      <span class="layer-name">${escapeHtml(layer.name)}</span>
      <span class="layer-val" title="${escapeHtml(previewVal)}">${escapeHtml(previewVal)}</span>
    `;
    el.addEventListener('click', (e) => selectLayer(layer.key, e.shiftKey));
    list.appendChild(el);
  });
}

// Track multi-selected layers for shift+click range
let selectedLayerKeys = [];

function selectLayer(key, shiftHeld) {
  const layerKeys = LAYERS.map(l => l.key);
  const idx = layerKeys.indexOf(key);

  if (shiftHeld && selectedLayerKeys.length > 0) {
    // Shift+click: select range from last selected to this
    const lastKey = selectedLayerKeys[selectedLayerKeys.length - 1];
    const lastIdx = layerKeys.indexOf(lastKey);
    const [from, to] = [Math.min(idx, lastIdx), Math.max(idx, lastIdx)];
    // Add all keys in range to selection
    for (let i = from; i <= to; i++) {
      const k = layerKeys[i];
      if (!selectedLayerKeys.includes(k)) selectedLayerKeys.push(k);
    }
  } else {
    // Normal click: select only this one
    selectedLayerKeys = [key];
  }

  activeLayerKey = key; // last clicked is "active" for edit panel
  renderLayerList();

  // Highlight on canvas â€” show last selected element
  document.querySelectorAll('.tx-el').forEach(e => e.classList.remove('sel'));
  const el = $(K2ID[key]);
  if (el) {
    el.classList.add('sel');
    selEl = el;
    $('pos-sel').style.display = 'inline';
    $('pos-nm').textContent = selectedLayerKeys.length > 1
      ? selectedLayerKeys.length + ' layers'
      : (ENAMES[key] || key);
    syncSelectedPositionInputs(key);
    queueTransformBoxUpdate();
  }

  // Populate edit panel
  const layer = LAYERS.find(l => l.key === key);
  if (!layer) return;
  openLayerEdit(layer);
}

function openLayerEdit(layer) {
  const edit = $('layer-edit');
  edit.classList.add('on');
  $('le-name').textContent = layer.name;

  if (layer.subfields) {
    // Multi-field layer â€” build dynamic rows
    buildSubfieldEdit(layer);
  } else {
    // Single element
    $('le-text-row').style.display = layer.hasText ? 'flex' : 'none';
    $('le-color-row').style.display = layer.hasColor ? 'flex' : 'none';
    $('le-size-row').style.display = layer.hasSz ? 'flex' : 'none';

    if (layer.hasText) $('le-text').value = v(layer.hasText) || '';
    if (layer.hasColor) {
      const col = v(layer.hasColor) || '#ffffff';
      $('le-color').value = col;
      $('le-color-hex').textContent = col;
    }
    if (layer.hasSz) {
      const sz = parseInt(v(layer.hasSz)) || 35;
      $('le-size-slider').value = sz;
      $('le-size-num').value = sz;
    }

    // Pos sliders
    const k = layer.key;
    if (pos[k]) {
      $('le-y-slider').value = pos[k].top;
      $('le-y-num').value = pos[k].top;
      $('le-x-slider').value = pos[k].left;
      $('le-x-num').value = pos[k].left;
    }

    // Wire text input to correct field
    $('le-text').oninput = function () {
      if (layer.hasText && $(layer.hasText)) {
        $(layer.hasText).value = this.value;
        render(); renderLayerList();
        dirty(); debouncedPushUndo();
      }
    };
    $('le-color').oninput = function () {
      if (layer.hasColor && $(layer.hasColor)) {
        $(layer.hasColor).value = this.value;
        $('le-color-hex').textContent = this.value;
        render();
        dirty(); debouncedPushUndo();
      }
    };
  }
}

function buildSubfieldEdit(layer) {
  // Replace static rows with dynamic subfield rows
  $('le-text-row').style.display = 'none';
  $('le-color-row').style.display = 'none';
  $('le-size-row').style.display = 'none';

  // Remove old dynamic rows
  document.querySelectorAll('.le-dynamic').forEach(el => el.remove());

  const edit = $('layer-edit');
  // Pos sliders stay at end â€” insert before them
  const posY = $('le-y-slider').closest('.le-row');

  layer.subfields.forEach(sf => {
    const row = document.createElement('div');
    row.className = 'le-dynamic';

    const lbl = document.createElement('div');
    lbl.className = 'le-group-title';
    lbl.textContent = sf.label;
    row.appendChild(lbl);

    // Text
    if (sf.text) {
      const tr = document.createElement('div');
      tr.className = 'le-row';
      tr.innerHTML = `<span class="le-lbl">Text</span>`;
      const inp = document.createElement('input');
      inp.className = 'le-inp'; inp.value = v(sf.text) || '';
      inp.oninput = function () {
        if ($(sf.text)) { $(sf.text).value = this.value; render(); renderLayerList(); dirty(); debouncedPushUndo(); }
      };
      tr.appendChild(inp); row.appendChild(tr);
    }

    const controls = document.createElement('div');
    controls.className = 'le-pair-grid';

    const colorCard = document.createElement('div');
    colorCard.className = 'le-mini-card';
    const colorNote = document.createElement('span');
    colorNote.className = 'le-inline-note';
    colorNote.textContent = 'Color';
    const col = document.createElement('input');
    col.type = 'color'; col.className = 'le-color';
    col.value = v(sf.color) || '#ffffff';
    col.oninput = function () {
      if ($(sf.color)) { $(sf.color).value = this.value; render(); dirty(); debouncedPushUndo(); }
    };
    colorCard.appendChild(colorNote);
    colorCard.appendChild(col);
    controls.appendChild(colorCard);

    if (sf.sz) {
      const sizeCard = document.createElement('div');
      sizeCard.className = 'le-mini-card le-mini-card-size';
      const szSpan = document.createElement('span');
      szSpan.className = 'le-inline-note';
      szSpan.textContent = 'Size';
      const szInp = document.createElement('input');
      szInp.type = 'number'; szInp.className = 'le-num';
      szInp.value = parseInt(v(sf.sz)) || 35;
      szInp.oninput = function () {
        const val = Math.max(8, Math.min(400, parseInt(this.value) || 35));
        const slider = $(sf.sz), numEl = $(sf.sz + '-num');
        if (slider) { if (val > parseInt(slider.max)) slider.max = val + 50; slider.value = val; }
        if (numEl) numEl.value = val;
        render(); dirty(); debouncedPushUndo();
      };
      sizeCard.appendChild(szSpan);
      sizeCard.appendChild(szInp);
      controls.appendChild(sizeCard);
    }

    row.appendChild(controls);
    edit.insertBefore(row, posY);
  });

  // Wire pos sliders for the layer key
  const k = layer.key;
  if (pos[k]) {
    $('le-y-slider').value = pos[k].top;
    $('le-y-num').value = pos[k].top;
    $('le-x-slider').value = pos[k].left;
    $('le-x-num').value = pos[k].left;
  }
}

function leApply() {
  // Called by simple single-field elements
  render(); dirty(); debouncedPushUndo();
}

function leSizeSync(val) {
  const v2 = Math.max(8, Math.min(400, parseInt(val) || 35));
  $('le-size-slider').value = v2;
  $('le-size-num').value = v2;
  const layer = LAYERS.find(l => l.key === activeLayerKey);
  if (layer && layer.hasSz) {
    const slider = $(layer.hasSz), numEl = $(layer.hasSz + '-num');
    if (slider) { if (v2 > parseInt(slider.max)) slider.max = v2 + 50; slider.value = v2; }
    if (numEl) numEl.value = v2;
    render(); dirty(); debouncedPushUndo();
  }
}

function lePosSync(axis, val) {
  const v2 = parseFloat(val) || 0;
  if (axis === 'y') {
    $('le-y-slider').value = v2; $('le-y-num').value = v2;
    if (activeLayerKey && pos[activeLayerKey]) {
      pos[activeLayerKey].top = v2;
      if (activeLayerKey === 'offer') offerAutoCenter = false;
      syncElementPlacement(activeLayerKey);
      if (activeLayerKey === 'subtitle' || activeLayerKey === 'pricing') syncOfferAutoCenter(true);
      syncSelectedPositionInputs(activeLayerKey);
    }
  } else {
    $('le-x-slider').value = v2; $('le-x-num').value = v2;
    if (activeLayerKey && pos[activeLayerKey]) {
      pos[activeLayerKey].left = v2;
      if (activeLayerKey === 'offer') offerAutoCenter = false;
      syncElementPlacement(activeLayerKey);
      if (activeLayerKey === 'subtitle' || activeLayerKey === 'pricing') syncOfferAutoCenter(true);
      syncSelectedPositionInputs(activeLayerKey);
    }
  }
  dirty(); debouncedPushUndo();
}

// â”€â”€ Keyboard navigation â”€â”€
// LIBRARY tab: Only block plain keys when focus is inside library panel
// EDITOR tab: Arrow keys nudge selected element, Delete hides, CTRL+C/V copy/paste
let clipboardElement = null; // â˜… Stores copied element data for CTRL+C/V

document.addEventListener('keydown', function (e) {
  // Always allow typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

  // â˜… CTRL/CMD shortcuts always work everywhere (C, V, S, Z, E)
  if (e.ctrlKey || e.metaKey) {
    // CTRL+C: Copy selected element
    if (e.key === 'c' && selEl) {
      e.preventDefault();
      const k = selEl.dataset.key;
      if (!k || !pos[k]) return;
      clipboardElement = {
        key: k,
        pos: JSON.parse(JSON.stringify(pos[k])),
        scale: jclone(getElemScale(k)),
        data: {}
      };
      const layer = LAYERS.find(l => l.key === k);
      if (layer) {
        if (layer.hasText) clipboardElement.data.text = v(layer.hasText);
        if (layer.hasColor) clipboardElement.data.color = v(layer.hasColor);
        if (layer.hasSz) clipboardElement.data.sz = v(layer.hasSz);
        if (layer.subfields) {
          clipboardElement.data.subfields = {};
          layer.subfields.forEach(sf => {
            clipboardElement.data.subfields[sf.label] = {
              text: sf.text ? v(sf.text) : '',
              color: sf.color ? v(sf.color) : '',
              sz: sf.sz ? v(sf.sz) : ''
            };
          });
        }
      }
      toast('ðŸ“‹ Copied: ' + (ENAMES[k] || k));
      return;
    }

    // CTRL+V: Paste element to current card
    if (e.key === 'v' && clipboardElement) {
      e.preventDefault();
      const k = clipboardElement.key;
      if (!pos[k]) return;
      pos[k] = JSON.parse(JSON.stringify(clipboardElement.pos));
      ensureElemScale();
      elemScale[k] = jclone(clipboardElement.scale || DSCALES[k] || { x: 1, y: 1 });
      applyPos();
      const layer = LAYERS.find(l => l.key === k);
      if (layer && clipboardElement.data) {
        if (layer.hasText && clipboardElement.data.text !== undefined) $(layer.hasText).value = clipboardElement.data.text;
        if (layer.hasColor && clipboardElement.data.color !== undefined) $(layer.hasColor).value = clipboardElement.data.color;
        if (layer.hasSz && clipboardElement.data.sz !== undefined) {
          setSz(layer.hasSz, '', parseInt(clipboardElement.data.sz) || 35);
        }
        if (layer.subfields && clipboardElement.data.subfields) {
          layer.subfields.forEach(sf => {
            const saved = clipboardElement.data.subfields[sf.label];
            if (!saved) return;
            if (sf.text && saved.text) $(sf.text).value = saved.text;
            if (sf.color && saved.color) $(sf.color).value = saved.color;
            if (sf.sz && saved.sz) {
              setSz(sf.sz, '', parseInt(saved.sz) || 35);
            }
          });
        }
      }
      render(); renderLayerList(); dirty(); pushUndo();
      toast('ðŸ“‹ Pasted: ' + (ENAMES[k] || k) + ' â†’ same position & style');
      return;
    }

    // All other CTRL shortcuts (S, Z, E etc) handled by the other listener
    return;
  }

  // â”€â”€ Check if focus is inside library panel â”€â”€
  const libPane = $('rpane-library');
  const libActive = libPane && libPane.classList.contains('active');
  const focusInLib = libActive && (e.target.closest('#rpane-library') || e.target.closest('.lib-list') || e.target.closest('.sel-bar'));

  // â˜… If focus is inside library panel AND no element selected on canvas, block keys
  if (focusInLib && !selEl) {
    return;
  }

  // â”€â”€ DELETE key: Clear selected element â”€â”€
  if ((e.key === 'Delete' || e.key === 'Backspace') && selEl) {
    e.preventDefault();
    const k = selEl.dataset.key;
    if (!k) return;
    const layer = LAYERS.find(l => l.key === k);
    if (layer) {
      if (layer.hasText) $(layer.hasText).value = '';
      if (layer.subfields) {
        layer.subfields.forEach(sf => { if (sf.text) $(sf.text).value = ''; });
      }
      if (k === 'badge') {
        $('tx-logo').src = ''; $('tx-logo').style.display = 'none';
        $('tx-badge-emoji').style.display = 'none';
      }
    }
    render(); renderLayerList(); dirty(); pushUndo();
    toast('ðŸ—‘ Cleared: ' + (ENAMES[k] || k));
    return;
  }

  // â”€â”€ LAYERS panel: Up/Down to switch active layer (only when no element selected) â”€â”€
  const layersPane = $('rpane-layers');
  const layersActive = layersPane && layersPane.classList.contains('active');
  if (layersActive && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !selEl) {
    e.preventDefault();
    const keys = LAYERS.map(l => l.key);
    const curIdx = keys.indexOf(activeLayerKey);
    let nextIdx = curIdx;
    if (e.key === 'ArrowDown') nextIdx = Math.min(keys.length - 1, curIdx + 1);
    else nextIdx = Math.max(0, curIdx - 1);
    if (nextIdx !== curIdx) selectLayer(keys[nextIdx], false);
    return;
  }

  // â”€â”€ EDITOR canvas element nudge â€” Arrow keys â”€â”€
  if (!selEl) return;
  const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  if (!arrows.includes(e.key)) return;
  e.preventDefault();
  // â˜… Step: 1% normal, 0.2% with Shift for fine, 3% with Alt for big
  const step = e.altKey ? 3 : e.shiftKey ? 0.2 : 1;
  const k = selEl.dataset.key;
  if (!pos[k]) return;
  if (e.key === 'ArrowUp') pos[k].top = Math.max(0, +(pos[k].top - step).toFixed(2));
  if (e.key === 'ArrowDown') pos[k].top = Math.min(95, +(pos[k].top + step).toFixed(2));
  if (e.key === 'ArrowLeft') pos[k].left = Math.max(0, +(pos[k].left - step).toFixed(2));
  if (e.key === 'ArrowRight') pos[k].left = Math.min(100, +(pos[k].left + step).toFixed(2));
  syncElementPlacement(k);
  syncSelectedPositionInputs(k);
  dirty();
  debouncedPushUndo();
}, true);

// When a tx-el is clicked/dragged, sync the layer panel
const _origStartDrag = startDrag;
// Patch startDrag to also select layer in panel
function startDragPatched(cx, cy, elem) {
  _origStartDrag(cx, cy, elem);
  const key = elem.dataset.key;
  if (key && key !== activeLayerKey) {
    activeLayerKey = key;
    renderLayerList();
    const layer = LAYERS.find(l => l.key === key);
    if (layer) openLayerEdit(layer);
    // Scroll layer into view
    const li = document.querySelector('.layer-item[data-key="' + key + '"]');
    if (li) li.scrollIntoView({ block: 'nearest' });
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ”§ AUTOMATED DEBUG / FIX ALL BUTTON
// One-tap fix for common issues
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function runAutoDebug() {
  if (!isDebugToolsEnabled()) {
    toast('Repair tools are disabled in production.', 'var(--yellow)');
    return;
  }
  let fixes = 0;
  let issues = [];

  // â”€â”€ 1. Fix Logo Display â”€â”€
  const logoImg = $('tx-logo');
  const logoSrc = logoImg ? logoImg.src : '';
  if (logoSrc && logoSrc.length > 10) {
    if (!logoImg.complete || logoImg.naturalWidth === 0) {
      issues.push('Logo image not loaded â€” reloading');
      const src = logoSrc;
      logoImg.src = '';
      await new Promise(r => setTimeout(r, 50));
      logoImg.onload = () => { logoImg.style.display = 'inline-block'; $('tx-badge-emoji').style.display = 'none'; render(); };
      logoImg.onerror = () => { logoImg.style.display = 'none'; $('tx-badge-emoji').style.display = 'inline'; render(); };
      logoImg.src = src;
      fixes++;
    } else {
      // Ensure visibility
      if (logoImg.style.display !== 'inline-block') {
        logoImg.style.display = 'inline-block';
        $('tx-badge-emoji').style.display = 'none';
        issues.push('Logo was hidden â€” made visible');
        fixes++;
      }
    }
  }

  // â”€â”€ 2. Fix BG Image â”€â”€
  const bgImg = $('card-bg-img');
  if (bgImg && bgImg.src && bgImg.src.length > 10) {
    if (!bgImg.complete || bgImg.naturalWidth === 0) {
      issues.push('BG image not loaded â€” reloading');
      const src = bgImg.src;
      bgImg.src = '';
      await new Promise(r => setTimeout(r, 50));
      bgImg.onload = () => { bgImg.style.display = 'block'; render(); };
      bgImg.src = src;
      fixes++;
    } else if (bgImg.style.display === 'none') {
      bgImg.style.display = 'block';
      $('card-ph').style.display = 'none';
      issues.push('BG was hidden â€” made visible');
      fixes++;
    }
  }

  // â”€â”€ 3. Fix Positions â”€â”€
  Object.keys(pos).forEach(k => {
    if (pos[k].top == null || isNaN(pos[k].top)) { pos[k].top = DPOS[k] ? DPOS[k].top : 50; fixes++; issues.push('Fixed NaN position for ' + k); }
    if (pos[k].left == null || isNaN(pos[k].left)) { pos[k].left = DPOS[k] ? DPOS[k].left : 50; fixes++; issues.push('Fixed NaN position for ' + k); }
  });
  applyPos();

  // â”€â”€ 4. Fix Stage Dimensions â”€â”€
  const stage = $('card-stage');
  if (pngW > 0 && pngH > 0) {
    const dW = Math.round(pngW * dispScale), dH = Math.round(pngH * dispScale);
    if (stage.offsetWidth < 10 || stage.offsetHeight < 10) {
      stage.style.width = dW + 'px';
      stage.style.height = dH + 'px';
      issues.push('Stage had zero dimensions â€” fixed');
      fixes++;
    }
  }

  // â”€â”€ 5. Fix Library Storage â”€â”€
  try {
    const stored = localStorage.getItem(LIB_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      let libFixed = 0;
      (parsed.folders || []).forEach(f => {
        (f.cards || []).forEach(c => {
          if (!c.id) { c.id = uid(); libFixed++; }
          if (!c.data) { libFixed++; }
        });
      });
      if (libFixed > 0) {
        LIB = parsed;
        saveLib();
        renderLib();
        issues.push('Fixed ' + libFixed + ' corrupt library entries');
        fixes++;
      }
    }
  } catch (e) {
    issues.push('Library data corrupt â€” could not parse');
  }

  // â”€â”€ 6. Fix Card Tracking â”€â”€
  if (curName !== 'Untitled Card' && !curCardId) {
    // Try to find the current card in library
    for (const folder of LIB.folders) {
      const card = folder.cards.find(c => c.name === curName);
      if (card) {
        curCardId = card.id;
        curFolderId = folder.id;
        issues.push('Re-linked editor to library card: ' + curName);
        fixes++;
        break;
      }
    }
  }

  // â”€â”€ 7. Force Re-render â”€â”€
  render();
  renderLayerList();
  renderLogoGrid();

  // â”€â”€ 8. Fix html2canvas cache â”€â”€
  if (typeof html2canvas !== 'undefined') {
    issues.push('html2canvas ready âœ“');
  } else {
    issues.push('html2canvas not loaded â€” will load on first export');
    ensureH2C(() => { });
  }

  // â”€â”€ Report â”€â”€
  if (fixes === 0) {
    toast('âœ… All good! No issues found.', 'var(--green)');
  } else {
    toast('Fixed ' + fixes + ' issue' + (fixes !== 1 ? 's' : '') + '!', 'var(--accent)');
  }

}
