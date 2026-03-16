import React, { useState, useRef, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import './Runner.css';

/* ── Helpers ── */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCSVLine(lines[0]);
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const vals = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function detectVars(str = '') {
  return [...new Set([...(str.matchAll(/\{\{(\w+)\}\}/g))].map((m) => m[1]))];
}

function interpolate(str = '', vars = {}) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitCancellable(ms, stoppedRef) {
  const step = 80;
  let remaining = ms;
  while (remaining > 0) {
    if (stoppedRef.current) return;
    await sleep(Math.min(step, remaining));
    remaining -= step;
  }
}

const STATUS_COLOR = (s) => {
  if (s >= 200 && s < 300) return 'var(--green-ok)';
  if (s >= 300 && s < 400) return 'var(--yellow)';
  if (s >= 400 && s < 500) return 'var(--orange)';
  if (s >= 500) return 'var(--red-blast)';
  return 'var(--text-dim)';
};

export default function Runner() {
  const { collections } = useAppStore();

  // Selection
  const [selColId, setSelColId]   = useState('');
  const [selReqId, setSelReqId]   = useState('');

  // CSV
  const [csvData, setCsvData]     = useState(null); // { headers, rows }
  const [dragOver, setDragOver]   = useState(false);

  // Variable mapping: { varName -> csvColumn }
  const [varMap, setVarMap]       = useState({});

  // Runner config
  const [delay, setDelay]         = useState(1);

  // Execution state
  const [running, setRunning]       = useState(false);
  const [progress, setProgress]     = useState(0);   // 0-100
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [results, setResults]       = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);

  const stoppedRef = useRef(false);
  const fileInputRef = useRef();

  /* ── Derived ── */
  const selectedCollection = collections.find((c) => c.id === selColId);
  const selectedRequest    = selectedCollection?.requests.find((r) => r.id === selReqId);

  // Detect all {{vars}} in selected request
  const detectedVars = selectedRequest
    ? [
        ...detectVars(selectedRequest.url),
        ...detectVars(selectedRequest.body),
        ...(selectedRequest.headers || []).flatMap((h) => [...detectVars(h.key), ...detectVars(h.value)]),
      ].filter((v, i, a) => a.indexOf(v) === i)
    : [];

  /* ── Handlers ── */
  const loadCSV = (text) => {
    const data = parseCSV(text);
    setCsvData(data);
    // Auto-map variables to same-name CSV columns
    const autoMap = {};
    detectedVars.forEach((v) => {
      if (data.headers.includes(v)) autoMap[v] = v;
    });
    setVarMap(autoMap);
    setResults([]);
    setProgress(0);
    setCurrentIdx(-1);
  };

  const onFileInput = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadCSV(ev.target.result);
    reader.readAsText(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadCSV(ev.target.result);
    reader.readAsText(file);
  };

  const startRunner = async () => {
    if (!selectedRequest || !csvData?.rows.length) return;
    stoppedRef.current = false;
    setRunning(true);
    setResults([]);
    setProgress(0);

    const rows = csvData.rows;

    for (let i = 0; i < rows.length; i++) {
      if (stoppedRef.current) break;

      setCurrentIdx(i);
      setProgress(Math.round((i / rows.length) * 100));

      // Build vars from the CSV row (use varMap mapping + also all column names directly)
      const vars = {};
      rows[i] && Object.entries(rows[i]).forEach(([col, val]) => { vars[col] = val; });
      // Apply explicit mapping overrides
      Object.entries(varMap).forEach(([varName, colName]) => {
        vars[varName] = rows[i][colName] ?? '';
      });

      // Interpolate everything
      const url  = interpolate(selectedRequest.url, vars);
      const body = interpolate(selectedRequest.body || '', vars);

      const headers = {};
      (selectedRequest.headers || []).filter((h) => h.key && h.enabled).forEach((h) => {
        headers[interpolate(h.key, vars)] = interpolate(h.value, vars);
      });
      if (selectedRequest.bodyType === 'json' && body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const startTime = Date.now();
      let result;
      try {
        result = await window.electronAPI?.sendRequest({
          method: selectedRequest.method,
          url,
          headers,
          body: ['GET', 'HEAD'].includes(selectedRequest.method) ? null : body || null,
        });
      } catch (err) {
        result = { error: err.message, status: 0 };
      }

      setResults((prev) => [
        ...prev,
        {
          index: i,
          rowData: rows[i],
          interpolatedUrl: url,
          status:     result?.status ?? 0,
          statusText: result?.statusText ?? '',
          time:       result?.time ?? (Date.now() - startTime),
          body:       result?.body ?? '',
          error:      result?.error ?? null,
        },
      ]);

      if (!stoppedRef.current && i < rows.length - 1 && delay > 0) {
        await waitCancellable(delay * 1000, stoppedRef);
      }
    }

    const finalProgress = stoppedRef.current ? progress : 100;
    setProgress(finalProgress);
    setCurrentIdx(-1);
    setRunning(false);
    if (!stoppedRef.current && rows.length > 10) {
      setShowCelebration(true);
    }
  };

  const stopRunner = () => {
    stoppedRef.current = true;
    setRunning(false);
  };

  const onSelectCol = (colId) => {
    setSelColId(colId);
    setSelReqId('');
    setResults([]);
    setProgress(0);
  };

  const onSelectReq = (reqId) => {
    setSelReqId(reqId);
    setResults([]);
    setProgress(0);
    // Re-auto-map with new request's variables
    if (csvData) {
      const req = selectedCollection?.requests.find((r) => r.id === reqId);
      if (req) {
        const vars = [
          ...detectVars(req.url), ...detectVars(req.body),
          ...(req.headers || []).flatMap((h) => [...detectVars(h.key), ...detectVars(h.value)]),
        ].filter((v, i, a) => a.indexOf(v) === i);
        const autoMap = {};
        vars.forEach((v) => { if (csvData.headers.includes(v)) autoMap[v] = v; });
        setVarMap(autoMap);
      }
    }
  };

  const successCount = results.filter((r) => r.status >= 200 && r.status < 300).length;
  const failCount    = results.filter((r) => r.status === 0 || r.status >= 400).length;

  /* ── Render ── */
  return (
    <div className="runner">
      {/* Header */}
      <div className="runner-header">
        <div className="runner-title">
          <span className="runner-dragon">🐉</span>
          <span>BATTLE SIMULATOR</span>
          <span className="runner-sub">CSV-POWERED ATTACK SEQUENCE</span>
        </div>
      </div>

      <div className="runner-body">
        {/* Left panel — config */}
        <div className="runner-config">

          {/* Step 1 — Select request */}
          <section className="cfg-section">
            <div className="cfg-label">
              <span className="step-num">01</span> SELECT ATTACK
            </div>
            <div className="cfg-row">
              <select
                className="cfg-select"
                value={selColId}
                onChange={(e) => onSelectCol(e.target.value)}
              >
                <option value="">— Choose Saga —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {selColId && (
              <div className="cfg-row">
                <select
                  className="cfg-select"
                  value={selReqId}
                  onChange={(e) => onSelectReq(e.target.value)}
                >
                  <option value="">— Choose Request —</option>
                  {(selectedCollection?.requests || []).map((r) => (
                    <option key={r.id} value={r.id}>
                      [{r.method}] {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedRequest && (
              <div className="req-preview">
                <span className="req-prev-method" style={{ color: 'var(--orange)' }}>
                  {selectedRequest.method}
                </span>
                <span className="req-prev-url">{selectedRequest.url}</span>
              </div>
            )}
          </section>

          {/* Step 2 — Upload CSV */}
          <section className="cfg-section">
            <div className="cfg-label">
              <span className="step-num">02</span> LOAD BATTLE DATA (CSV)
            </div>
            <div
              className={`drop-zone ${dragOver ? 'drop-over' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              {csvData ? (
                <div className="drop-loaded">
                  <span className="drop-icon">📋</span>
                  <div>
                    <div className="drop-filename">{csvData.rows.length} warriors loaded</div>
                    <div className="drop-cols">{csvData.headers.join(', ')}</div>
                  </div>
                  <button className="drop-change" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                    CHANGE
                  </button>
                </div>
              ) : (
                <>
                  <span className="drop-icon">⚡</span>
                  <div className="drop-hint">Drop CSV file here or click to browse</div>
                  <div className="drop-sub">Columns become variables: name → &#123;&#123;name&#125;&#125;</div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={onFileInput}
            />
          </section>

          {/* Step 3 — Variable mapping */}
          {detectedVars.length > 0 && csvData && (
            <section className="cfg-section">
              <div className="cfg-label">
                <span className="step-num">03</span> MAP VARIABLES
              </div>
              <div className="var-table">
                <div className="var-header">
                  <span>VARIABLE</span><span>CSV COLUMN</span>
                </div>
                {detectedVars.map((v) => (
                  <div key={v} className="var-row">
                    <span className="var-name">&#123;&#123;{v}&#125;&#125;</span>
                    <select
                      className="var-select"
                      value={varMap[v] || ''}
                      onChange={(e) => setVarMap((m) => ({ ...m, [v]: e.target.value }))}
                    >
                      <option value="">— skip —</option>
                      {csvData.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Step 4 — Delay */}
          <section className="cfg-section">
            <div className="cfg-label">
              <span className="step-num">{detectedVars.length > 0 && csvData ? '04' : '03'}</span> DELAY BETWEEN ATTACKS
            </div>
            <div className="delay-row">
              <input
                type="number"
                className="delay-input"
                value={delay}
                min={0}
                max={60}
                step={0.5}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
              <span className="delay-unit">seconds</span>
              {delay === 0 && <span className="delay-warn">⚠ No delay — maximum power!</span>}
            </div>
          </section>

          {/* Launch controls */}
          <div className="runner-controls">
            {!running ? (
              <button
                className="btn-start"
                onClick={startRunner}
                disabled={!selectedRequest || !csvData?.rows.length}
              >
                🐉 UNLEASH THE DRAGON!
              </button>
            ) : (
              <button className="btn-stop" onClick={stopRunner}>
                ✋ STOP ATTACK
              </button>
            )}
          </div>
        </div>

        {/* Right panel — results */}
        <div className="runner-results">
          {/* Progress */}
          {(running || results.length > 0) && (
            <div className="progress-section">
              <div className="progress-header">
                <span className="prog-label">KI CHARGE</span>
                <span className="prog-pct">{progress}%</span>
                {results.length > 0 && (
                  <div className="prog-stats">
                    <span style={{ color: 'var(--green-ok)' }}>✓ {successCount}</span>
                    <span style={{ color: 'var(--red-blast)' }}>✗ {failCount}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>/ {csvData?.rows.length ?? 0}</span>
                  </div>
                )}
              </div>
              <div className="progress-bar">
                <div
                  className={`progress-fill ${running ? 'progress-animating' : ''}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {running && currentIdx >= 0 && (
                <div className="prog-current">
                  ⚡ Firing row {currentIdx + 1} of {csvData?.rows.length}…
                </div>
              )}
            </div>
          )}

          {/* Timeline strip */}
          {results.length > 0 && (
            <div className="timeline-strip">
              <span className="tl-label">TIMELINE</span>
              <div className="tl-track">
                {results.map((r) => (
                  <div
                    key={r.index}
                    className={`tl-node ${expandedRow === r.index ? 'tl-node-active' : ''}`}
                    style={{ background: r.error ? 'var(--red-blast)' : STATUS_COLOR(r.status) }}
                    title={`#${r.index + 1} · ${r.error ? 'ERR' : r.status} · ${r.time}ms`}
                    onClick={() => setExpandedRow(expandedRow === r.index ? null : r.index)}
                  />
                ))}
                {running && <div className="tl-node tl-node-pending" />}
              </div>
              <span className="tl-count">{results.length}/{csvData?.rows.length ?? '?'}</span>
            </div>
          )}

          {/* Results table */}
          {results.length > 0 ? (
            <div className="results-table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>STATUS</th>
                    <th>TIME</th>
                    <th>URL</th>
                    <th>PREVIEW</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <React.Fragment key={r.index}>
                      <tr
                        className={`result-row ${expandedRow === r.index ? 'expanded' : ''}`}
                        onClick={() => setExpandedRow(expandedRow === r.index ? null : r.index)}
                      >
                        <td className="rc-idx">{r.index + 1}</td>
                        <td className="rc-status">
                          {r.error ? (
                            <span style={{ color: 'var(--red-blast)' }}>ERR</span>
                          ) : (
                            <span style={{ color: STATUS_COLOR(r.status), fontFamily: 'var(--font-tech)', fontWeight: 700 }}>
                              {r.status}
                            </span>
                          )}
                        </td>
                        <td className="rc-time" style={{ color: 'var(--blue-ki)' }}>
                          {r.time}ms
                        </td>
                        <td className="rc-url">{r.interpolatedUrl}</td>
                        <td className="rc-preview">
                          {r.body?.slice(0, 60)}{r.body?.length > 60 ? '…' : ''}
                        </td>
                      </tr>
                      {expandedRow === r.index && (
                        <tr className="result-detail-row">
                          <td colSpan={5}>
                            <div className="result-detail">
                              <div className="detail-section">
                                <div className="detail-label">ROW DATA</div>
                                <div className="detail-content">
                                  {Object.entries(r.rowData).map(([k, v]) => (
                                    <span key={k} className="data-chip">
                                      <span className="chip-key">{k}</span>
                                      <span className="chip-val">{v}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="detail-section">
                                <div className="detail-label">RESPONSE BODY</div>
                                <pre className="detail-body">
                                  {r.error || (() => {
                                    try {
                                      return JSON.stringify(JSON.parse(r.body), null, 2);
                                    } catch {
                                      return r.body;
                                    }
                                  })()}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !running && (
              <div className="results-empty">
                <div className="results-empty-icon">🐉</div>
                <div className="results-empty-title">AWAITING BATTLE</div>
                <div className="results-empty-sub">Configure your attack sequence on the left, then unleash!</div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Celebration modal */}
      {showCelebration && (
        <div className="cel-overlay" onClick={() => setShowCelebration(false)}>
          <div className="cel-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cel-particles">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="cel-spark"
                  style={{
                    '--angle': `${i * 15}deg`,
                    '--dist': `${90 + (i % 3) * 30}px`,
                    '--delay': `${(i % 6) * 0.08}s`,
                    '--col': ['var(--gold)','var(--orange)','var(--blue-ki)','#fff','var(--green-ok)'][i % 5],
                  }}
                />
              ))}
            </div>
            <div className="cel-dragon">🐉</div>
            <div className="cel-title">MISSION COMPLETE!</div>
            <div className="cel-power">
              ⚡ POWER LEVEL: {(successCount * 9001 + results.length * 137).toLocaleString()} ⚡
            </div>
            <div className="cel-stats">
              <div className="cel-stat-box cel-victories">
                <span className="cel-stat-num">{successCount}</span>
                <span className="cel-stat-lbl">VICTORIES</span>
              </div>
              <div className="cel-stat-box cel-defeats">
                <span className="cel-stat-num">{failCount}</span>
                <span className="cel-stat-lbl">DEFEATS</span>
              </div>
              <div className="cel-stat-box">
                <span className="cel-stat-num">{results.length}</span>
                <span className="cel-stat-lbl">TOTAL</span>
              </div>
            </div>
            <div className="cel-rate">
              {Math.round((successCount / results.length) * 100)}% success rate
            </div>
            <button className="cel-dismiss" onClick={() => setShowCelebration(false)}>
              ⚡ ACKNOWLEDGED
            </button>
          </div>
        </div>
      )}

      {/* CSV Preview */}
      {csvData && csvData.rows.length > 0 && (
        <div className="csv-preview">
          <div className="csv-preview-title">⚡ CSV PREVIEW — {csvData.rows.length} WARRIORS</div>
          <div className="csv-table-wrap">
            <table className="csv-table">
              <thead>
                <tr>{csvData.headers.map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {csvData.rows.slice(0, 4).map((row, i) => (
                  <tr key={i}>
                    {csvData.headers.map((h) => <td key={h}>{row[h]}</td>)}
                  </tr>
                ))}
                {csvData.rows.length > 4 && (
                  <tr>
                    <td colSpan={csvData.headers.length} style={{ color: 'var(--text-dim)', textAlign: 'center' }}>
                      + {csvData.rows.length - 4} more rows…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
