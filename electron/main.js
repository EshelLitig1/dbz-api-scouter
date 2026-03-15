const { app, BrowserWindow, ipcMain, safeStorage, session } = require('electron');
const path = require('path');
const fs   = require('fs');

const isDev    = process.env.NODE_ENV === 'development';
const STORE_FILE = path.join(app.getPath('userData'), 'scouter.dat');
const ALLOWED_METHODS = new Set(['GET','POST','PUT','DELETE','PATCH','HEAD','OPTIONS']);

let mainWindow;

/* ─────────────────────────────────────────────
   Window
───────────────────────────────────────────── */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0812',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // ✅ renderer is isolated from Node
      nodeIntegration: false,   // ✅ renderer cannot access Node APIs
      sandbox: true,            // ✅ renderer runs in sandboxed process
      webSecurity: true,        // ✅ Same-Origin policy enforced
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5280');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // ── Content Security Policy ──────────────────────────────────────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data:",
            "connect-src 'self'",   // renderer makes NO direct API calls
          ].join('; '),
        ],
      },
    });
  });

  createWindow();

  // ── Auto-updater (production only) ──────────────────────────────────────
  if (!isDev) {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.checkForUpdatesAndNotify();
    } catch (_) { /* electron-updater may not be installed in dev */ }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ─────────────────────────────────────────────
   Window controls
───────────────────────────────────────────── */
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

/* ─────────────────────────────────────────────
   Encrypted store  (OS-level encryption via safeStorage)
───────────────────────────────────────────── */
ipcMain.handle('store-load', () => {
  try {
    if (!fs.existsSync(STORE_FILE)) return null;
    const raw = fs.readFileSync(STORE_FILE);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw);
    }
    return raw.toString('utf8');
  } catch (err) {
    console.error('[store-load]', err.message);
    return null;
  }
});

ipcMain.handle('store-save', (_, data) => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(STORE_FILE, safeStorage.encryptString(String(data)));
    } else {
      fs.writeFileSync(STORE_FILE, String(data), 'utf8');
    }
    return true;
  } catch (err) {
    console.error('[store-save]', err.message);
    return false;
  }
});

/* ─────────────────────────────────────────────
   HTTP Request handler
   All external requests go through main process — renderer never
   touches the network directly (no CORS issues, no webSecurity bypass needed)
───────────────────────────────────────────── */
ipcMain.handle('send-request', async (_, { method, url, headers, body }) => {
  // ── Validate method ──
  const upperMethod = (method || '').toUpperCase();
  if (!ALLOWED_METHODS.has(upperMethod)) {
    return { error: `Method "${method}" is not allowed.`, status: 0 };
  }

  // ── Validate URL ──
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { error: 'Invalid URL. Must be a valid HTTP or HTTPS URL.', status: 0 };
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { error: `Protocol "${parsedUrl.protocol}" is not supported. Use HTTP or HTTPS.`, status: 0 };
  }

  // ── Sanitize headers (strip hop-by-hop) ──
  const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection']);
  const safeHeaders = {};
  if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (k && !FORBIDDEN_HEADERS.has(k.toLowerCase())) {
        safeHeaders[k] = String(v);
      }
    }
  }

  // ── Execute request with timeout ──
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const options = {
      method: upperMethod,
      headers: safeHeaders,
      signal: controller.signal,
    };
    if (body && !['GET', 'HEAD'].includes(upperMethod)) {
      options.body = String(body);
    }

    const start = Date.now();
    const res   = await fetch(url, options);
    const elapsed = Date.now() - start;

    const resHeaders = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });

    const text = await res.text();
    return {
      status:     res.status,
      statusText: res.statusText,
      headers:    resHeaders,
      body:       text,
      time:       elapsed,
      size:       new TextEncoder().encode(text).length,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'Request timed out after 30 seconds.', status: 0 };
    }
    return { error: err.message, status: 0, statusText: 'Network Error' };
  } finally {
    clearTimeout(timer);
  }
});

/* ─────────────────────────────────────────────
   GitHub Gist  (runs in main process — renderer cannot call GitHub directly)
───────────────────────────────────────────── */
ipcMain.handle('gist-upload', async (_, payload) => {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid payload');
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept':       'application/vnd.github+json',
      'User-Agent':   'DBZ-API-Scouter',
    },
    body: JSON.stringify({
      description: `DBZ API Scouter — ${payload.name || payload.url || 'Request'}`,
      public: false,
      files: { 'dbz-scouter-request.json': { content: JSON.stringify(payload, null, 2) } },
    }),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  return res.json();
});

ipcMain.handle('gist-fetch', async (_, gistId) => {
  // Strict gist ID validation
  if (typeof gistId !== 'string' || !/^[0-9a-f]{20,40}$/i.test(gistId.trim())) {
    throw new Error('Invalid gist ID format');
  }
  const res = await fetch(`https://api.github.com/gists/${gistId.trim()}`, {
    headers: {
      'Accept':     'application/vnd.github+json',
      'User-Agent': 'DBZ-API-Scouter',
    },
  });
  if (!res.ok) throw new Error(`Gist not found (${res.status})`);
  const data = await res.json();
  const content = Object.values(data.files)[0]?.content;
  if (!content) throw new Error('Gist is empty');
  return JSON.parse(content);
});
