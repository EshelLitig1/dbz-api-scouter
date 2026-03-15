import React from 'react';
import './TitleBar.css';

const METHOD_COLORS = {
  GET: '#00c8ff', POST: '#00ff88', PUT: '#ffd700',
  DELETE: '#ff2d00', PATCH: '#ff6b00', HEAD: '#a78bfa', OPTIONS: '#f0abfc',
};

export default function TitleBar({ tabs, activeTabId, onAddTab, onCloseTab, onSelectTab, view, onViewChange }) {
  return (
    <div className="titlebar">
      <div className="titlebar-brand">
        <span className="brand-bolt">⚡</span>
        <span className="brand-name">SCOUTER</span>
        <span className="brand-sub">API CLIENT</span>
      </div>

      {/* Request tabs — hidden in runner mode */}
      {view !== 'runner' && (
        <div className="titlebar-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab ${tab.id === activeTabId ? 'tab-active' : ''}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="tab-method" style={{ color: METHOD_COLORS[tab.method] || '#fff' }}>
                {tab.method}
              </span>
              <span className="tab-name">{tab.name || 'New Request'}</span>
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              >
                ×
              </button>
            </div>
          ))}
          <button className="tab-add" onClick={onAddTab} title="New Request">+</button>
        </div>
      )}

      {view === 'runner' && <div className="titlebar-tabs" />}

      {/* Mode toggle */}
      <div className="titlebar-mode">
        <button
          className={`mode-btn ${view === 'request' ? 'mode-active' : ''}`}
          onClick={() => onViewChange('request')}
          title="Request Builder"
        >
          ⚡ SCOUTER
        </button>
        <button
          className={`mode-btn mode-runner ${view === 'runner' ? 'mode-active mode-runner-active' : ''}`}
          onClick={() => onViewChange('runner')}
          title="Battle Runner"
        >
          🐉 RUNNER
        </button>
      </div>

      <div className="titlebar-controls">
        <button className="wc wc-min" onClick={() => window.electronAPI?.minimize()} title="Minimize" />
        <button className="wc wc-max" onClick={() => window.electronAPI?.maximize()} title="Maximize" />
        <button className="wc wc-close" onClick={() => window.electronAPI?.close()} title="Close" />
      </div>
    </div>
  );
}
