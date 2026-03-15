import React, { useState } from 'react';
import KeyValueEditor from './KeyValueEditor';
import './RequestBuilder.css';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
const METHOD_COLORS = {
  GET: '#00c8ff', POST: '#00ff88', PUT: '#ffd700',
  DELETE: '#ff2d00', PATCH: '#ff6b00', HEAD: '#a78bfa', OPTIONS: '#f0abfc',
};

export default function RequestBuilder({ tab, updateTab, onSend }) {
  const [section, setSection] = useState('Params');

  const paramCount  = tab.params.filter((p) => p.key && p.enabled).length;
  const headerCount = tab.headers.filter((h) => h.key && h.enabled).length;

  const sectionTabs = [
    { label: 'Params',  badge: paramCount  || null },
    { label: 'Headers', badge: headerCount || null },
    { label: 'Body',    badge: tab.body ? '●' : null },
    { label: 'Auth',    badge: tab.auth?.type !== 'none' ? '●' : null },
  ];

  return (
    <div className="req-builder">
      {/* URL Bar */}
      <div className="url-bar">
        <select
          className="method-select"
          value={tab.method}
          style={{ color: METHOD_COLORS[tab.method] || '#fff' }}
          onChange={(e) => updateTab({ method: e.target.value })}
        >
          {METHODS.map((m) => (
            <option key={m} value={m} style={{ color: METHOD_COLORS[m] }}>{m}</option>
          ))}
        </select>

        <input
          className="url-input"
          type="text"
          placeholder="https://api.example.com/endpoint"
          value={tab.url}
          onChange={(e) => updateTab({ url: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
        />

        <button
          className={`send-btn ${tab.loading ? 'send-loading' : ''}`}
          onClick={onSend}
          disabled={tab.loading || !tab.url}
        >
          {tab.loading
            ? <span className="loading-dots">CHARGING<span>...</span></span>
            : <>⚡ RELEASE KI!</>
          }
        </button>
      </div>

      {/* HTTP warning */}
      {tab.url && tab.url.startsWith('http://') && (
        <div className="http-warning">
          ⚠ Insecure connection — this request uses HTTP, not HTTPS. Your API keys and data may be visible on the network.
        </div>
      )}

      {/* Section tabs */}
      <div className="section-tabs">
        {sectionTabs.map(({ label, badge }) => (
          <button
            key={label}
            className={`stab ${section === label ? 'stab-active' : ''}`}
            onClick={() => setSection(label)}
          >
            {label}
            {badge !== null && <span className="stab-badge">{badge}</span>}
          </button>
        ))}
      </div>

      {/* Section body */}
      <div className="section-body">
        {section === 'Params' && (
          <KeyValueEditor
            items={tab.params}
            onChange={(params) => updateTab({ params })}
            placeholder={{ key: 'param_name', value: 'value' }}
          />
        )}

        {section === 'Headers' && (
          <KeyValueEditor
            items={tab.headers}
            onChange={(headers) => updateTab({ headers })}
            placeholder={{ key: 'Header-Name', value: 'value' }}
          />
        )}

        {section === 'Body' && (
          <div className="body-section">
            <div className="body-types">
              {[['json','JSON'],['text','Raw Text'],['form','Form Data']].map(([v, l]) => (
                <button
                  key={v}
                  className={`btype ${tab.bodyType === v ? 'btype-active' : ''}`}
                  onClick={() => updateTab({ bodyType: v })}
                >
                  {l}
                </button>
              ))}
            </div>
            {tab.bodyType === 'form' ? (
              <KeyValueEditor
                items={tab.params}
                onChange={(params) => updateTab({ params })}
                placeholder={{ key: 'field', value: 'value' }}
              />
            ) : (
              <textarea
                className="body-textarea"
                value={tab.body}
                onChange={(e) => updateTab({ body: e.target.value })}
                placeholder={tab.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Request body...'}
                spellCheck={false}
              />
            )}
          </div>
        )}

        {section === 'Auth' && (
          <div className="auth-section">
            <div className="auth-row">
              <label>TYPE</label>
              <select
                value={tab.auth?.type || 'none'}
                onChange={(e) => updateTab({ auth: { ...tab.auth, type: e.target.value } })}
              >
                <option value="none">No Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="basic">Basic Auth</option>
                <option value="apikey">API Key</option>
              </select>
            </div>

            {tab.auth?.type === 'bearer' && (
              <div className="auth-row">
                <label>TOKEN</label>
                <input
                  type="text"
                  value={tab.auth.token || ''}
                  onChange={(e) => updateTab({ auth: { ...tab.auth, token: e.target.value } })}
                  placeholder="Bearer token..."
                />
              </div>
            )}

            {tab.auth?.type === 'basic' && (
              <>
                <div className="auth-row">
                  <label>USERNAME</label>
                  <input
                    type="text"
                    value={tab.auth.username || ''}
                    onChange={(e) => updateTab({ auth: { ...tab.auth, username: e.target.value } })}
                    placeholder="username"
                  />
                </div>
                <div className="auth-row">
                  <label>PASSWORD</label>
                  <input
                    type="password"
                    value={tab.auth.password || ''}
                    onChange={(e) => updateTab({ auth: { ...tab.auth, password: e.target.value } })}
                    placeholder="password"
                  />
                </div>
              </>
            )}

            {tab.auth?.type === 'apikey' && (
              <>
                <div className="auth-row">
                  <label>KEY NAME</label>
                  <input
                    type="text"
                    value={tab.auth.keyName || ''}
                    onChange={(e) => updateTab({ auth: { ...tab.auth, keyName: e.target.value } })}
                    placeholder="X-API-Key"
                  />
                </div>
                <div className="auth-row">
                  <label>VALUE</label>
                  <input
                    type="text"
                    value={tab.auth.keyValue || ''}
                    onChange={(e) => updateTab({ auth: { ...tab.auth, keyValue: e.target.value } })}
                    placeholder="your-api-key"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
