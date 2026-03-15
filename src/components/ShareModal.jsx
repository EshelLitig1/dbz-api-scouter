import React, { useState, useEffect } from 'react';
import { serializeRequest, encodeShareCode, decodeShareCode } from '../store/appStore';
import './ShareModal.css';

const METHOD_COLORS = {
  GET: '#00c8ff', POST: '#00ff88', PUT: '#ffd700',
  DELETE: '#ff2d00', PATCH: '#ff6b00', HEAD: '#a78bfa', OPTIONS: '#f0abfc',
};

const GIST_API = 'https://api.github.com/gists';

async function uploadGist(payload) {
  const json = JSON.stringify(payload, null, 2);
  const res = await fetch(GIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
    body: JSON.stringify({
      description: `DBZ API Scouter — ${payload.name || payload.url}`,
      public: false,
      files: { 'dbz-scouter-request.json': { content: json } },
    }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);
  return res.json();
}

async function fetchGist(input) {
  const match = input.match(/([0-9a-f]{20,})/i);
  if (!match) throw new Error('No valid gist ID found in the input');
  const res = await fetch(`https://api.github.com/gists/${match[1]}`, {
    headers: { 'Accept': 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Gist not found (${res.status})`);
  const data = await res.json();
  const content = Object.values(data.files)[0]?.content;
  if (!content) throw new Error('Gist has no content');
  return JSON.parse(content);
}

function looksLikeGist(input) {
  return input.includes('gist.github.com') || /^[0-9a-f]{20,}$/i.test(input.trim());
}

function validate(payload) {
  if (!payload?.v || !payload?.method || !payload?.url) {
    throw new Error('Invalid scouter data format');
  }
  return payload;
}

export default function ShareModal({ mode, request, collections, onSave, onClose }) {
  // ── Export state ──
  const [gistId, setGistId]       = useState('');
  const [gistUrl, setGistUrl]     = useState('');
  const [shareCode, setShareCode] = useState('');
  const [gistError, setGistError] = useState('');
  const [uploading, setUploading] = useState(false);

  // ── Import state ──
  const [importStep, setImportStep]   = useState('input'); // 'input' | 'preview'
  const [importInput, setImportInput] = useState('');
  const [preview, setPreview]         = useState(null);
  const [targetCol, setTargetCol]     = useState('Imported Attacks');
  const [importing, setImporting]     = useState(false);
  const [importError, setImportError] = useState('');

  // ── Shared ──
  const [copied, setCopied] = useState('');

  // On export mount — generate share code immediately and attempt gist
  useEffect(() => {
    if (mode !== 'export' || !request) return;
    const payload = serializeRequest(request);
    setShareCode(encodeShareCode(request));
    setUploading(true);
    uploadGist(payload)
      .then((data) => {
        setGistId(data.id);
        setGistUrl(data.html_url);
      })
      .catch((e) => setGistError(e.message))
      .finally(() => setUploading(false));
  }, []);

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleImportDecode = async () => {
    setImporting(true);
    setImportError('');
    try {
      let payload;
      const input = importInput.trim();
      if (looksLikeGist(input)) {
        payload = validate(await fetchGist(input));
      } else {
        payload = validate(decodeShareCode(input));
      }
      setPreview(payload);
      setImportStep('preview');
    } catch (e) {
      setImportError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = () => {
    if (!preview || !targetCol.trim()) return;
    onSave(targetCol.trim(), preview);
  };

  /* ─────────────────────── RENDER ─────────────────────── */
  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="sm-header">
          <div className="sm-icon">📡</div>
          <div>
            <div className="sm-title">
              {mode === 'export' ? 'TRANSMIT ATTACK' : 'RECEIVE TRANSMISSION'}
            </div>
            {mode === 'export' && request && (
              <div className="sm-subtitle">
                <span style={{ color: METHOD_COLORS[request.method] || '#fff', fontFamily: 'var(--font-tech)', fontSize: 10 }}>
                  {request.method}
                </span>
                {' '}{request.name}
              </div>
            )}
          </div>
          <button className="sm-close" onClick={onClose}>×</button>
        </div>

        {/* ── EXPORT ── */}
        {mode === 'export' && (
          <div className="sm-body">

            {/* Cloud link */}
            <div className="sm-section">
              <div className="sm-section-title">🌐 CLOUD LINK <span className="sm-badge">via GitHub Gist</span></div>
              <div className="sm-section-sub">Share a secret link — anyone with it can import</div>
              {uploading && (
                <div className="sm-transmitting">
                  <span className="sm-spin">⚡</span> TRANSMITTING TO HYPERBOLIC TIME CHAMBER...
                </div>
              )}
              {!uploading && gistUrl && (
                <div className="sm-code-row">
                  <input className="sm-code-box" readOnly value={gistUrl} />
                  <button className={`sm-copy-btn ${copied === 'url' ? 'sm-copied' : ''}`} onClick={() => copy(gistUrl, 'url')}>
                    {copied === 'url' ? '✓ COPIED' : 'COPY'}
                  </button>
                </div>
              )}
              {!uploading && gistError && (
                <div className="sm-warn">⚠ Gist upload failed: {gistError}<br />Use the offline code below.</div>
              )}
            </div>

            <div className="sm-divider">— OR —</div>

            {/* Offline code */}
            <div className="sm-section">
              <div className="sm-section-title">📋 OFFLINE CODE</div>
              <div className="sm-section-sub">Copy and paste this in email, Slack, or anywhere</div>
              <div className="sm-code-row">
                <textarea className="sm-code-box sm-code-tall" readOnly value={shareCode} />
                <button className={`sm-copy-btn ${copied === 'code' ? 'sm-copied' : ''}`} onClick={() => copy(shareCode, 'code')}>
                  {copied === 'code' ? '✓ COPIED' : 'COPY'}
                </button>
              </div>
            </div>

            <div className="sm-notice">🔒 Auth credentials are stripped before sharing</div>
          </div>
        )}

        {/* ── IMPORT ── */}
        {mode === 'import' && (
          <div className="sm-body">
            {importStep === 'input' && (
              <>
                <div className="sm-section">
                  <div className="sm-section-title">📥 PASTE TRANSMISSION</div>
                  <div className="sm-section-sub">
                    Paste a GitHub Gist URL, gist ID, or an offline share code
                  </div>
                  <textarea
                    className="sm-import-input"
                    value={importInput}
                    onChange={(e) => setImportInput(e.target.value)}
                    placeholder="https://gist.github.com/...   or   offline share code"
                    rows={4}
                    spellCheck={false}
                    autoFocus
                  />
                  {importError && <div className="sm-error">💥 {importError}</div>}
                  <button
                    className="sm-action-btn"
                    onClick={handleImportDecode}
                    disabled={importing || !importInput.trim()}
                  >
                    {importing ? '⚡ DECODING...' : '🔍 DECODE SCOUTER DATA'}
                  </button>
                </div>
              </>
            )}

            {importStep === 'preview' && preview && (
              <>
                <div className="sm-section">
                  <div className="sm-section-title">⚡ TRANSMISSION RECEIVED</div>
                  <div className="sm-preview-card">
                    <div className="sm-preview-row">
                      <span className="sm-prev-method" style={{ color: METHOD_COLORS[preview.method] || '#fff' }}>
                        {preview.method}
                      </span>
                      <span className="sm-prev-name">{preview.name}</span>
                    </div>
                    <div className="sm-prev-url">{preview.url}</div>
                    {preview.body && (
                      <div className="sm-prev-body">
                        {preview.body.slice(0, 120)}{preview.body.length > 120 ? '…' : ''}
                      </div>
                    )}
                    <div className="sm-prev-meta">
                      {preview.headers?.filter(h => h.key).length > 0 && (
                        <span>{preview.headers.filter(h => h.key).length} headers</span>
                      )}
                      {preview.params?.filter(p => p.key).length > 0 && (
                        <span>{preview.params.filter(p => p.key).length} params</span>
                      )}
                    </div>
                  </div>
                  <div className="sm-warn">🔒 Auth credentials were stripped — add yours after importing</div>
                </div>

                <div className="sm-section">
                  <div className="sm-section-title">📁 SAVE TO SAGA</div>
                  <input
                    className="sm-col-input"
                    type="text"
                    value={targetCol}
                    onChange={(e) => setTargetCol(e.target.value)}
                    placeholder="Saga name..."
                    list="import-saga-list"
                  />
                  <datalist id="import-saga-list">
                    {collections.map((c) => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>

                <div className="sm-actions">
                  <button className="sm-back-btn" onClick={() => setImportStep('input')}>← BACK</button>
                  <button
                    className="sm-action-btn sm-absorb-btn"
                    onClick={handleConfirmImport}
                    disabled={!targetCol.trim()}
                  >
                    ⚡ ABSORB INTO SAGA
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
