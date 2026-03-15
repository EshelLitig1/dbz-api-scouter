import React from 'react';
import './KeyValueEditor.css';

const mkRow = () => ({
  id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  key: '',
  value: '',
  enabled: true,
});

export default function KeyValueEditor({ items, onChange, placeholder = {} }) {
  const update = (id, field, val) => {
    let updated = items.map((item) => (item.id === id ? { ...item, [field]: val } : item));
    // Auto-append empty row when editing the last row
    const last = updated[updated.length - 1];
    if (last && last.id === id && (last.key || last.value)) {
      updated = [...updated, mkRow()];
    }
    onChange(updated);
  };

  const remove = (id) => {
    const filtered = items.filter((item) => item.id !== id);
    onChange(filtered.length ? filtered : [mkRow()]);
  };

  return (
    <div className="kv-editor">
      <div className="kv-header">
        <span className="kv-col-check" />
        <span className="kv-col-key">KEY</span>
        <span className="kv-col-val">VALUE</span>
        <span className="kv-col-del" />
      </div>

      {items.map((item) => (
        <div key={item.id} className={`kv-row ${!item.enabled ? 'kv-disabled' : ''}`}>
          <input
            type="checkbox"
            className="kv-check"
            checked={item.enabled}
            onChange={(e) => update(item.id, 'enabled', e.target.checked)}
          />
          <input
            className="kv-input kv-key"
            type="text"
            value={item.key}
            placeholder={placeholder.key || 'key'}
            onChange={(e) => update(item.id, 'key', e.target.value)}
          />
          <input
            className="kv-input kv-val"
            type="text"
            value={item.value}
            placeholder={placeholder.value || 'value'}
            onChange={(e) => update(item.id, 'value', e.target.value)}
          />
          <button className="kv-del" onClick={() => remove(item.id)} title="Remove">×</button>
        </div>
      ))}
    </div>
  );
}
