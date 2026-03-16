/**
 * Postman Collection v2.1 ↔ DBZ Scouter conversion utilities.
 * Supports import of v2.0 and v2.1; always exports v2.1.
 */

function mkRow(key = '', value = '', enabled = true) {
  return {
    id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    key,
    value,
    enabled,
  };
}

// ── Our format → Postman v2.1 ─────────────────────────────────────────────────
export function toPostman(collection) {
  return {
    info: {
      _postman_id: `dbz-${Date.now()}`,
      name: collection.name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: collection.requests.map(requestToPostmanItem),
  };
}

function requestToPostmanItem(req) {
  const enabledParams = (req.params || []).filter((p) => p.key && p.enabled);

  // Build URL object
  let rawUrl = req.url || '';
  if (enabledParams.length && req.bodyType !== 'form') {
    const qs = enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    rawUrl += (rawUrl.includes('?') ? '&' : '?') + qs;
  }

  const urlObj = {
    raw: rawUrl,
    query: req.bodyType !== 'form'
      ? (req.params || []).filter((p) => p.key).map((p) => ({
          key: p.key, value: p.value, disabled: !p.enabled,
        }))
      : [],
  };

  const item = {
    name: req.name || 'Request',
    request: {
      method: req.method || 'GET',
      header: (req.headers || []).filter((h) => h.key).map((h) => ({
        key: h.key, value: h.value, disabled: !h.enabled,
      })),
      url: urlObj,
    },
  };

  // Body
  if (req.body && !['GET', 'HEAD'].includes(req.method)) {
    if (req.bodyType === 'json') {
      item.request.body = {
        mode: 'raw',
        raw: req.body,
        options: { raw: { language: 'json' } },
      };
    } else if (req.bodyType === 'text') {
      item.request.body = { mode: 'raw', raw: req.body };
    }
  }
  if (req.bodyType === 'form') {
    item.request.body = {
      mode: 'urlencoded',
      urlencoded: (req.params || []).filter((p) => p.key).map((p) => ({
        key: p.key, value: p.value, disabled: !p.enabled,
      })),
    };
  }

  // Auth
  const auth = req.auth || {};
  if (auth.type === 'bearer') {
    item.request.auth = {
      type: 'bearer',
      bearer: [{ key: 'token', value: auth.token || '', type: 'string' }],
    };
  } else if (auth.type === 'basic') {
    item.request.auth = {
      type: 'basic',
      basic: [
        { key: 'username', value: auth.username || '', type: 'string' },
        { key: 'password', value: auth.password || '', type: 'string' },
      ],
    };
  } else if (auth.type === 'apikey') {
    item.request.auth = {
      type: 'apikey',
      apikey: [
        { key: 'key',   value: auth.keyName  || '', type: 'string' },
        { key: 'value', value: auth.keyValue || '', type: 'string' },
        { key: 'in',    value: 'header',             type: 'string' },
      ],
    };
  }

  return item;
}

// ── Postman v2.0/v2.1 → Our format ────────────────────────────────────────────
export function fromPostman(json) {
  if (!json || typeof json !== 'object') throw new Error('Invalid JSON');
  if (!json.info || !json.item) throw new Error('Not a Postman collection (missing info or item)');

  const requests = [];
  function walk(items) {
    for (const item of items) {
      if (Array.isArray(item.item)) {
        walk(item.item); // folder — flatten
      } else if (item.request) {
        requests.push(parsePostmanRequest(item));
      }
    }
  }
  walk(json.item);

  return { name: json.info.name || 'Imported Collection', requests };
}

function parsePostmanRequest(item) {
  const r = item.request || {};
  const method = (r.method || 'GET').toUpperCase();

  // URL + query params
  let rawUrl = '';
  const params = [];
  if (typeof r.url === 'string') {
    try {
      const u = new URL(r.url);
      rawUrl = `${u.protocol}//${u.host}${u.pathname}`;
      u.searchParams.forEach((v, k) => params.push(mkRow(k, v)));
    } catch {
      rawUrl = r.url;
    }
  } else if (r.url && typeof r.url === 'object') {
    rawUrl = r.url.raw || '';
    // Strip query string from raw url
    try {
      const u = new URL(rawUrl);
      rawUrl = `${u.protocol}//${u.host}${u.pathname}`;
    } catch { /* keep raw */ }
    (r.url.query || []).forEach((q) => params.push(mkRow(q.key, q.value, !q.disabled)));
  }

  // Headers
  const headers = (r.header || []).map((h) => mkRow(h.key, h.value, !h.disabled));

  // Body
  let body = '';
  let bodyType = 'json';
  if (r.body) {
    switch (r.body.mode) {
      case 'raw': {
        body = r.body.raw || '';
        const lang = r.body.options?.raw?.language || '';
        bodyType = lang === 'json' ? 'json' : 'text';
        break;
      }
      case 'urlencoded':
        bodyType = 'form';
        (r.body.urlencoded || []).forEach((f) => params.push(mkRow(f.key, f.value, !f.disabled)));
        break;
      case 'formdata':
        bodyType = 'form';
        (r.body.formdata || []).filter((f) => f.type !== 'file').forEach((f) =>
          params.push(mkRow(f.key, f.value, !f.disabled))
        );
        break;
      case 'graphql':
        body = r.body.graphql?.query || '';
        bodyType = 'text';
        break;
      default:
        body = r.body.raw || '';
    }
  }

  // Auth
  let auth = { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '' };
  if (r.auth) {
    const get = (arr, k) => (arr || []).find((x) => x.key === k)?.value || '';
    if (r.auth.type === 'bearer') {
      auth = { ...auth, type: 'bearer', token: get(r.auth.bearer, 'token') };
    } else if (r.auth.type === 'basic') {
      auth = { ...auth, type: 'basic', username: get(r.auth.basic, 'username'), password: get(r.auth.basic, 'password') };
    } else if (r.auth.type === 'apikey') {
      auth = { ...auth, type: 'apikey', keyName: get(r.auth.apikey, 'key'), keyValue: get(r.auth.apikey, 'value') };
    }
  }

  if (!params.length)  params.push(mkRow());
  if (!headers.length) headers.push(mkRow());

  return { name: item.name || 'Request', method, url: rawUrl, params, headers, body, bodyType, auth };
}
