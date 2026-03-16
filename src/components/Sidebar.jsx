import React, { useState, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import ShareModal from './ShareModal';
import { toPostman, fromPostman } from '../utils/postman';
import './Sidebar.css';

const METHOD_COLORS = {
  GET: '#00c8ff', POST: '#00ff88', PUT: '#ffd700',
  DELETE: '#ff2d00', PATCH: '#ff6b00', HEAD: '#a78bfa', OPTIONS: '#f0abfc',
};

export default function Sidebar({ activeTab, updateTab }) {
  const {
    collections, history, environments, activeEnvId,
    setActiveEnv, clearHistory, deleteCollection, deleteRequest, saveRequest, importCollection,
  } = useAppStore();

  const postmanInputRef = useRef();

  const exportPostman = (col) => {
    const data = JSON.stringify(toPostman(col), null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `${col.name.replace(/[^a-z0-9]/gi, '_')}_postman.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importPostman = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        const col  = fromPostman(json);
        importCollection(col);
        setPostmanMsg(`✓ Imported "${col.name}" — ${col.requests.length} request(s)`);
        setTimeout(() => setPostmanMsg(''), 4000);
      } catch (err) {
        setPostmanMsg(`✗ ${err.message}`);
        setTimeout(() => setPostmanMsg(''), 4000);
      }
    };
    reader.readAsText(file);
  };

  const [postmanMsg, setPostmanMsg] = useState('');

  const [panel, setPanel]       = useState('collections');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveCol, setSaveCol]   = useState('');

  // Share modal state
  const [shareMode, setShareMode]     = useState(null);   // null | 'export' | 'import'
  const [shareTarget, setShareTarget] = useState(null);   // request being exported

  const handleSave = () => {
    if (!activeTab || !saveCol.trim()) return;
    saveRequest(saveCol.trim(), {
      name: saveName.trim() || activeTab.url || 'Request',
      method: activeTab.method,
      url: activeTab.url,
      headers: activeTab.headers,
      params: activeTab.params,
      body: activeTab.body,
      bodyType: activeTab.bodyType,
    });
    setSaveOpen(false);
    setSaveName('');
    setSaveCol('');
  };

  const loadRequest = (req) => {
    updateTab({
      name: req.name,
      method: req.method,
      url: req.url,
      headers: req.headers,
      params: req.params,
      body: req.body || '',
      bodyType: req.bodyType || 'json',
      response: null,
    });
  };

  const openShare = (e, req) => {
    e.stopPropagation();
    setShareTarget(req);
    setShareMode('export');
  };

  const handleImportSave = (collectionName, payload) => {
    saveRequest(collectionName, {
      name: payload.name || 'Imported Request',
      method: payload.method,
      url: payload.url,
      headers: payload.headers || [],
      params: payload.params || [],
      body: payload.body || '',
      bodyType: payload.bodyType || 'json',
    });
    setShareMode(null);
    setShareTarget(null);
  };

  return (
    <aside className="sidebar">
      {/* Dimension (env) selector */}
      <div className="sidebar-env">
        <span className="env-label">⚡ DIMENSION</span>
        <select className="env-select" value={activeEnvId} onChange={(e) => setActiveEnv(e.target.value)}>
          {environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>

      {/* Panel switcher */}
      <div className="sidebar-switcher">
        <button className={`sw-btn ${panel === 'collections' ? 'sw-active' : ''}`} onClick={() => setPanel('collections')}>SAGAS</button>
        <button className={`sw-btn ${panel === 'history'     ? 'sw-active' : ''}`} onClick={() => setPanel('history')}>BATTLE LOG</button>
      </div>

      {/* Actions */}
      <div className="sidebar-actions">
        {panel === 'collections' && (
          <>
            <button className="act-btn" onClick={() => setSaveOpen(true)}>+ SAVE REQUEST</button>
            <button className="act-btn act-share" onClick={() => { setShareTarget(null); setShareMode('import'); }}>
              ↓ IMPORT TRANSMISSION
            </button>
            <button className="act-btn act-postman" onClick={() => postmanInputRef.current?.click()}>
              📥 IMPORT POSTMAN
            </button>
            <input ref={postmanInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importPostman} />
            {postmanMsg && (
              <div className={`postman-msg ${postmanMsg.startsWith('✓') ? 'postman-ok' : 'postman-err'}`}>
                {postmanMsg}
              </div>
            )}
          </>
        )}
        {panel === 'history' && history.length > 0 && (
          <button className="act-btn act-danger" onClick={clearHistory}>CLEAR LOG</button>
        )}
      </div>

      {/* List */}
      <div className="sidebar-list">
        {panel === 'collections' && (
          collections.length === 0
            ? <div className="sb-empty"><p>No sagas yet.</p><p>Save a request to begin.</p></div>
            : collections.map((col) => (
              <div key={col.id} className="collection">
                <div className="col-header">
                  <span className="col-icon">📁</span>
                  <span className="col-name">{col.name}</span>
                  <button className="col-export" onClick={() => exportPostman(col)} title="Export to Postman">📤</button>
                  <button className="col-del" onClick={() => deleteCollection(col.id)}>×</button>
                </div>
                {col.requests.map((req) => (
                  <div key={req.id} className="col-item" onClick={() => loadRequest(req)}>
                    <span className="item-method" style={{ color: METHOD_COLORS[req.method] || '#fff' }}>{req.method}</span>
                    <span className="item-name">{req.name}</span>
                    <button className="item-share" onClick={(e) => openShare(e, req)} title="Share">⬆</button>
                    <button className="item-del" onClick={(e) => { e.stopPropagation(); deleteRequest(col.id, req.id); }}>×</button>
                  </div>
                ))}
              </div>
            ))
        )}

        {panel === 'history' && (
          history.length === 0
            ? <div className="sb-empty"><p>No battles fought yet.</p></div>
            : history.map((h) => (
              <div key={h.id} className="hist-item" onClick={() => updateTab({ method: h.method, url: h.url })}>
                <span className="item-method" style={{ color: METHOD_COLORS[h.method] || '#fff' }}>{h.method}</span>
                <span className="hist-url">{h.url}</span>
                <span className="hist-status" style={{ color: h.status >= 200 && h.status < 300 ? 'var(--green-ok)' : 'var(--red-blast)' }}>{h.status}</span>
              </div>
            ))
        )}
      </div>

      {/* Save modal */}
      {saveOpen && (
        <div className="modal-bg" onClick={() => setSaveOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">⚡ SAVE TO SAGA</div>
            <div className="modal-field">
              <label>REQUEST NAME</label>
              <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)}
                placeholder={activeTab?.url || 'My Request'} autoFocus />
            </div>
            <div className="modal-field">
              <label>SAGA (COLLECTION)</label>
              <input type="text" value={saveCol} onChange={(e) => setSaveCol(e.target.value)}
                placeholder="Frieza Saga, Saiyan Saga..." list="saga-list" />
              <datalist id="saga-list">
                {collections.map((c) => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setSaveOpen(false)}>CANCEL</button>
              <button className="modal-save" onClick={handleSave} disabled={!saveCol.trim()}>SAVE</button>
            </div>
          </div>
        </div>
      )}

      {/* Share / Import modal */}
      {shareMode && (
        <ShareModal
          mode={shareMode}
          request={shareTarget}
          collections={collections}
          onSave={handleImportSave}
          onClose={() => { setShareMode(null); setShareTarget(null); }}
        />
      )}
    </aside>
  );
}
