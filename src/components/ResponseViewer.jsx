import React, { useState, useMemo } from 'react';
import './ResponseViewer.css';

function getStatusInfo(status) {
  if (status >= 200 && status < 300) return { label: 'POWER LEVEL', color: 'var(--green-ok)', glow: 'var(--glow-green)' };
  if (status >= 300 && status < 400) return { label: 'REDIRECTED',  color: 'var(--yellow)',   glow: '0 0 8px rgba(255,204,0,0.5)' };
  if (status >= 400 && status < 500) return { label: 'BLOCKED',     color: 'var(--orange)',   glow: 'var(--glow-orange)' };
  if (status >= 500)                 return { label: 'DESTROYED',   color: 'var(--red-blast)', glow: 'var(--glow-red)' };
  return { label: 'SCOUTING', color: 'var(--text-dim)', glow: 'none' };
}

function fmtSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Simple JSON syntax highlighter (sanitises HTML first)
function highlight(text) {
  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  try {
    JSON.parse(text); // validate
    return safe.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = 'jn'; // number
        if (/^"/.test(match)) cls = /:$/.test(match) ? 'jk' : 'js'; // key / string
        else if (/true|false/.test(match)) cls = 'jb';
        else if (/null/.test(match)) cls = 'jnu';
        return `<span class="${cls}">${match}</span>`;
      }
    );
  } catch {
    return safe;
  }
}

export default function ResponseViewer({ response, loading }) {
  const [activeTab, setActiveTab] = useState('body');

  const isJson = useMemo(() => {
    if (!response?.body) return false;
    try { JSON.parse(response.body); return true; } catch { return false; }
  }, [response?.body]);

  const prettyBody = useMemo(() => {
    if (!response?.body) return '';
    if (isJson) {
      try { return JSON.stringify(JSON.parse(response.body), null, 2); } catch { /**/ }
    }
    return response.body;
  }, [response?.body, isJson]);

  const highlighted = useMemo(() => highlight(prettyBody), [prettyBody]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="res-viewer res-loading">
        <div className="ki-orb" />
        <div className="ki-label">CHARGING KI...</div>
        <div className="ki-bar"><div className="ki-fill" /></div>
      </div>
    );
  }

  // ── Empty ──
  if (!response) {
    return (
      <div className="res-viewer res-empty">
        <div className="empty-bolt">⚡</div>
        <div className="empty-title">AWAITING BATTLE</div>
        <div className="empty-sub">Send a request to scan the target's power level</div>
      </div>
    );
  }

  // ── Error ──
  if (response.error) {
    return (
      <div className="res-viewer">
        <div className="res-error">
          <span className="err-icon">💥</span>
          <div>
            <div className="err-title">CONNECTION DESTROYED</div>
            <div className="err-msg">{response.error}</div>
          </div>
        </div>
      </div>
    );
  }

  const info = getStatusInfo(response.status);

  return (
    <div className="res-viewer" style={{ animation: 'flash-in 0.2s ease-out' }}>
      {/* Status bar */}
      <div className="res-statusbar">
        <div className="status-badge" style={{ color: info.color, boxShadow: info.glow }}>
          <span className="status-label">{info.label}</span>
          <span className="status-code">{response.status}</span>
          <span className="status-text">{response.statusText}</span>
        </div>

        <div className="res-meta">
          <div className="meta-item">
            <span className="meta-label">TIME</span>
            <span className="meta-val" style={{ color: 'var(--blue-ki)' }}>{response.time}ms</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">SIZE</span>
            <span className="meta-val" style={{ color: 'var(--blue-ki)' }}>{fmtSize(response.size)}</span>
          </div>
        </div>

        <div className="res-tabs">
          <button className={`rtab ${activeTab === 'body' ? 'rtab-active' : ''}`} onClick={() => setActiveTab('body')}>
            Body
          </button>
          <button className={`rtab ${activeTab === 'headers' ? 'rtab-active' : ''}`} onClick={() => setActiveTab('headers')}>
            Headers ({Object.keys(response.headers || {}).length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="res-content">
        {activeTab === 'body' && (
          <pre
            className="res-body"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        )}
        {activeTab === 'headers' && (
          <div className="res-headers">
            {Object.entries(response.headers || {}).map(([k, v]) => (
              <div key={k} className="hdr-row">
                <span className="hdr-key">{k}</span>
                <span className="hdr-sep">:</span>
                <span className="hdr-val">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
