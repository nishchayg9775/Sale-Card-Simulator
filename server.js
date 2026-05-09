const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { GoogleGenAI } = require('@google/genai');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'server-data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LIB_PATH = path.join(DATA_DIR, 'library.json');
const PORT = Number(process.env.PORT || 5511);
const HOST = process.env.HOST || '0.0.0.0';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const MAX_BODY_BYTES = 100 * 1024 * 1024;
const STORE_SCHEMA_VERSION = 2;
const BACKUP_KEEP = 8;

function serverWarn(...args) {
  if (!IS_PRODUCTION) process.stderr.write(args.map(arg => String(arg)).join(' ') + '\n');
}

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] != null) return;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

loadEnvFile(path.join(ROOT, '.env'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const BANNER_IMAGE_MODEL = process.env.GEMINI_BANNER_MODEL || 'imagen-4.0-generate-001';

let bannerAIClient = null;
let bannerAIModeSignature = '';

function buildBannerAiClient() {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }
  const signature = `gemini:${GEMINI_API_KEY.slice(0, 6)}:${BANNER_IMAGE_MODEL}`;
  if (!bannerAIClient || bannerAIModeSignature !== signature) {
    bannerAIClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    bannerAIModeSignature = signature;
  }
  return { client: bannerAIClient, mode: 'gemini' };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
  '.webp': 'image/webp'
};

const PUBLIC_ROOT_FILES = new Set([
  'Mr. Card Arora.html',
  'app-config.js',
  'app.js',
  'styles.css',
  'Layer 1.png',
  'Light.zip',
  'Dark.zip',
  'sale data 22 April.xlsx'
]);

const BLOCKED_ROOT_NAMES = new Set([
  '.env',
  '.env.example',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'server.js',
  'server.out.log',
  'server.err.log'
]);

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com https://*.googleapis.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join('; ');

function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function buildResponseHeaders(contentType, extraHeaders = {}) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...extraHeaders
  };

  if (contentType) headers['Content-Type'] = contentType;
  if (contentType && contentType.startsWith('text/html')) {
    headers['Content-Security-Policy'] = CONTENT_SECURITY_POLICY;
  }

  return headers;
}

function emptyLibrary() {
  return { folders: [] };
}

const SAFE_ID_RE = /^[A-Za-z0-9_-]{3,80}$/;
const SAFE_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i;

function createSafeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeEntityId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return SAFE_ID_RE.test(id) ? id : createSafeId();
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

function normalizeLibrary(data) {
  const lib = data && typeof data === 'object' ? data : {};
  const folders = Array.isArray(lib.folders) ? lib.folders : [];
  const assets = lib.assets && typeof lib.assets === 'object' ? lib.assets : {};
  return {
    folders: folders.map(folder => {
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
          const cardData = sourceCard.data && typeof sourceCard.data === 'object' ? { ...sourceCard.data } : {};
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
    }),
    assets: {
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
    }
  };
}

function emptyStore() {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    revision: 0,
    updatedAt: null,
    library: emptyLibrary()
  };
}

function normalizeStore(data) {
  if (!data || typeof data !== 'object') return emptyStore();
  if (Array.isArray(data.folders)) {
    return {
      schemaVersion: STORE_SCHEMA_VERSION,
      revision: Number.isFinite(Number(data.revision)) ? Number(data.revision) : 0,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
      library: normalizeLibrary(data)
    };
  }
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    revision: Number.isFinite(Number(data.revision)) ? Number(data.revision) : 0,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    library: normalizeLibrary(data.library)
  };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listBackupFiles() {
  ensureDataDirs();
  return fs.readdirSync(BACKUP_DIR)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const full = path.join(BACKUP_DIR, name);
      return { name, full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function pruneBackups() {
  const backups = listBackupFiles();
  backups.slice(BACKUP_KEEP).forEach(entry => {
    try { fs.unlinkSync(entry.full); } catch (err) { }
  });
}

function writeTextAtomic(targetPath, text) {
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

function backupCurrentStore(rawText, revision) {
  if (!rawText) return;
  ensureDataDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `library-r${revision}-${stamp}.json`);
  fs.writeFileSync(backupPath, rawText, 'utf8');
  pruneBackups();
}

function persistStore(store, options = {}) {
  ensureDataDirs();
  const safeStore = normalizeStore(store);
  const raw = JSON.stringify(safeStore, null, 2);
  const shouldBackup = options.backup !== false && fs.existsSync(LIB_PATH);
  let currentRevision = 0;
  let existingRaw = null;
  if (shouldBackup) {
    try {
      existingRaw = fs.readFileSync(LIB_PATH, 'utf8');
      try {
        currentRevision = normalizeStore(JSON.parse(existingRaw)).revision;
      } catch (err) {
        currentRevision = 0;
      }
    } catch (err) {
      existingRaw = null;
    }
  }
  if (shouldBackup && existingRaw && existingRaw !== raw) {
    backupCurrentStore(existingRaw, currentRevision);
  }
  writeTextAtomic(LIB_PATH, raw);
  return safeStore;
}

function recoverStoreFromBackups() {
  const backups = listBackupFiles();
  for (const entry of backups) {
    try {
      return normalizeStore(readJsonFile(entry.full));
    } catch (err) {
      serverWarn('Skipping invalid backup:', entry.name, err.message);
    }
  }
  return null;
}

function readStore() {
  ensureDataDirs();
  if (!fs.existsSync(LIB_PATH)) {
    return persistStore(emptyStore(), { backup: false });
  }
  try {
    return normalizeStore(readJsonFile(LIB_PATH));
  } catch (err) {
    serverWarn('Primary library read failed, attempting recovery:', err.message);
    const recovered = recoverStoreFromBackups();
    if (recovered) {
      return persistStore(recovered, { backup: false });
    }
    return persistStore(emptyStore(), { backup: false });
  }
}

function writeLibrary(nextLibrary, expectedRevision) {
  const current = readStore();
  if (expectedRevision != null && expectedRevision !== current.revision) {
    return { conflict: true, store: current };
  }
  const nextStore = {
    schemaVersion: STORE_SCHEMA_VERSION,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    library: normalizeLibrary(nextLibrary)
  };
  return { conflict: false, store: persistStore(nextStore) };
}

function resetLibrary(expectedRevision) {
  return writeLibrary(emptyLibrary(), expectedRevision);
}

function metaHeaders(store) {
  return {
    'X-Library-Revision': String(store.revision || 0),
    'X-Library-Updated-At': store.updatedAt || '',
    'X-Library-Schema': String(store.schemaVersion || STORE_SCHEMA_VERSION),
    'Cache-Control': 'no-store'
  };
}

function sendJson(res, code, payload, headers = {}) {
  res.writeHead(code, buildResponseHeaders(MIME['.json'], headers));
  res.end(JSON.stringify(payload));
}

function isTrustedMutatingApiRequest(req) {
  const method = (req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;

  const secFetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite)) {
    return false;
  }

  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    const expectedOrigin = new URL(`http://${req.headers.host || 'localhost'}`).origin;
    return new URL(origin).origin === expectedOrigin;
  } catch (err) {
    return false;
  }
}

function isBlockedStaticPath(resolvedPath) {
  const blockedRoot = path.resolve(DATA_DIR);
  if (resolvedPath === blockedRoot || resolvedPath.startsWith(blockedRoot + path.sep)) return true;

  const blockedDirs = [
    path.resolve(path.join(ROOT, '.qa-tools')),
    path.resolve(path.join(ROOT, 'qa-assets')),
    path.resolve(path.join(ROOT, 'node_modules'))
  ];

  return blockedDirs.some(dir => resolvedPath === dir || resolvedPath.startsWith(dir + path.sep));
}

function isPublicStaticFile(resolvedPath) {
  const relative = path.relative(ROOT, resolvedPath);
  if (!relative || relative.startsWith('..')) return false;
  if (relative.includes(path.sep)) return false;

  const baseName = path.basename(relative);
  if (!baseName || baseName.startsWith('.') || BLOCKED_ROOT_NAMES.has(baseName)) return false;

  return PUBLIC_ROOT_FILES.has(baseName);
}

function serveStatic(req, res, pathname) {
  const relPath = pathname === '/' ? '/Mr.%20Card%20Arora.html' : pathname;
  let filePath;
  try {
    filePath = path.join(ROOT, decodeURIComponent(relPath));
  } catch (err) {
    sendJson(res, 400, { error: 'Bad path' });
    return;
  }

  const resolved = path.resolve(filePath);
  const resolvedRoot = path.resolve(ROOT);
  if (!resolved.startsWith(resolvedRoot) || isBlockedStaticPath(resolved) || !isPublicStaticFile(resolved)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, buildResponseHeaders('text/plain; charset=utf-8'));
      res.end('File not found');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, buildResponseHeaders(MIME[ext] || 'application/octet-stream'));
    fs.createReadStream(resolved).pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function callBannerGeminiImage(prompt) {
  return (async () => {
    try {
      const { client, mode } = buildBannerAiClient();
      const response = await client.models.generateImages({
        model: BANNER_IMAGE_MODEL,
        prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '16:9',
          outputMimeType: 'image/png',
          personGeneration: 'dont_allow'
        }
      });

      const imageBytes = response?.generatedImages?.[0]?.image?.imageBytes || null;
      if (!imageBytes) {
        return { ok: false, error: 'No image returned from Gemini', raw: response, mode };
      }

      const mimeType = response?.generatedImages?.[0]?.image?.mimeType || 'image/png';
      return {
        ok: true,
        artDataUrl: `data:${mimeType};base64,${imageBytes}`,
        raw: response,
        mode
      };
    } catch (err) {
      return { ok: false, error: err.message || 'Gemini request failed' };
    }
  })();
}

function parseExpectedRevision(req) {
  const raw = req.headers['x-library-revision'];
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/') && !isTrustedMutatingApiRequest(req)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  if (url.pathname === '/api/health') {
    const store = readStore();
    sendJson(res, 200, {
      ok: true,
      revision: store.revision,
      updatedAt: store.updatedAt,
      backupCount: listBackupFiles().length
    }, metaHeaders(store));
    return;
  }

  if (url.pathname === '/api/library/meta') {
    const store = readStore();
    sendJson(res, 200, {
      revision: store.revision,
      updatedAt: store.updatedAt,
      schemaVersion: store.schemaVersion,
      backupCount: listBackupFiles().length
    }, metaHeaders(store));
    return;
  }

  if (url.pathname === '/api/banner/generate') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const templateId = typeof body.templateId === 'string' ? body.templateId : 'nifty-expiry';
      const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
      const kicker = typeof body.kicker === 'string' ? body.kicker.trim() : '';
      const support = typeof body.support === 'string' ? body.support.trim() : '';
      const userPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      const templateLabel =
        templateId === 'bull-bear'
          ? 'Bull / Bear Market'
          : templateId === 'blue-market'
            ? 'Blue Market Spotlight'
            : 'Nifty Expiry Sale';
      const finalPrompt = [
        `Create a premium homepage top banner visual for the "${templateLabel}" template.`,
        'The final banner will be composed by code into a 1440x280 outer frame with a 1312x219 inner safe area.',
        'Keep the center band calm and readable. Do not render any text, logos, watermarks, or UI chrome inside the image.',
        'Use a polished finance-brand look with glossy lighting, clean negative space, and a balanced left-right composition.',
        'The image should work as a background layer under separately rendered typography.',
        kicker ? `Kicker text for context only: ${kicker}` : '',
        headline ? `Headline text for context only: ${headline}` : '',
        support ? `Support text for context only: ${support}` : '',
        userPrompt ? `User prompt: ${userPrompt}` : ''
      ].filter(Boolean).join('\n');

      const result = await callBannerGeminiImage(finalPrompt);
      if (!result.ok || !result.artDataUrl) {
        sendJson(res, 200, {
          ok: true,
          fallback: true,
          model: BANNER_IMAGE_MODEL,
          mode: 'gemini',
          error: result.error || 'Gemini art generation unavailable',
          blockedByReferrer: typeof result.error === 'string' && /referer/i.test(result.error),
          artDataUrl: null
        });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        fallback: false,
        model: BANNER_IMAGE_MODEL,
        mode: result.mode || 'gemini',
        artDataUrl: result.artDataUrl
      });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message || 'Invalid banner request' });
    }
    return;
  }

  if (url.pathname === '/favicon.ico') {
    res.writeHead(204, buildResponseHeaders(null));
    res.end();
    return;
  }

  if (url.pathname === '/api/library') {
    if (req.method === 'GET') {
      const store = readStore();
      sendJson(res, 200, store.library, metaHeaders(store));
      return;
    }
    if (req.method === 'PUT') {
      try {
        const raw = await readBody(req);
        const parsed = raw ? JSON.parse(raw) : emptyLibrary();
        const result = writeLibrary(parsed, parseExpectedRevision(req));
        if (result.conflict) {
          sendJson(res, 200, {
            ok: false,
            conflict: true,
            error: 'Revision conflict',
            library: result.store.library,
            revision: result.store.revision,
            updatedAt: result.store.updatedAt
          }, metaHeaders(result.store));
          return;
        }
        sendJson(res, 200, {
          ok: true,
          folders: result.store.library.folders.length,
          revision: result.store.revision,
          updatedAt: result.store.updatedAt
        }, metaHeaders(result.store));
      } catch (err) {
        sendJson(res, err.message === 'Payload too large' ? 413 : 400, { error: err.message });
      }
      return;
    }
    if (req.method === 'DELETE') {
      const result = resetLibrary(parseExpectedRevision(req));
      if (result.conflict) {
        sendJson(res, 200, {
          ok: false,
          conflict: true,
          error: 'Revision conflict',
          library: result.store.library,
          revision: result.store.revision,
          updatedAt: result.store.updatedAt
        }, metaHeaders(result.store));
        return;
      }
      sendJson(res, 200, {
        ok: true,
        revision: result.store.revision,
        updatedAt: result.store.updatedAt
      }, metaHeaders(result.store));
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST);
