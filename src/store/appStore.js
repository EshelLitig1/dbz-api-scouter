import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Secure storage ────────────────────────────────────────────────────────
// Uses Electron's safeStorage (OS keychain / DPAPI / libsecret) to encrypt
// saved collections, history and environments at rest.
// Falls back to localStorage when running outside Electron (e.g. browser dev).
const secureStorage = {
  getItem: async () => {
    if (window.electronAPI?.loadStore) {
      return window.electronAPI.loadStore();
    }
    return localStorage.getItem('dbz-scouter-store');
  },
  setItem: async (_, value) => {
    if (window.electronAPI?.saveStore) {
      await window.electronAPI.saveStore(value);
    } else {
      localStorage.setItem('dbz-scouter-store', value);
    }
  },
  removeItem: async () => {
    if (window.electronAPI?.saveStore) {
      window.electronAPI.saveStore('');
    } else {
      localStorage.removeItem('dbz-scouter-store');
    }
  },
};

// Any header whose name contains these substrings gets its value stripped on share
const SENSITIVE_PATTERNS = [
  'auth', 'token', 'secret', 'key', 'password', 'passwd', 'credential',
  'cookie', 'session', 'bearer', 'private', 'access',
];

export function serializeRequest(req) {
  return {
    v: 1,
    name: req.name,
    method: req.method,
    url: req.url,
    params: req.params ?? [],
    headers: (req.headers ?? []).map((h) => {
      const lower = (h.key || '').toLowerCase();
      const isSensitive = SENSITIVE_PATTERNS.some((p) => lower.includes(p));
      return isSensitive ? { ...h, value: '' } : h;
    }),
    body: req.body ?? '',
    bodyType: req.bodyType ?? 'json',
    auth: { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '' },
  };
}

export function encodeShareCode(req) {
  const json = JSON.stringify(serializeRequest(req));
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeShareCode(code) {
  const json = decodeURIComponent(escape(atob(code.trim())));
  return JSON.parse(json);
}

export const mkRow = () => ({
  id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  key: '',
  value: '',
  enabled: true,
});

export const createTab = (overrides = {}) => ({
  id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: 'New Request',
  method: 'GET',
  url: '',
  params: [mkRow()],
  headers: [mkRow()],
  body: '',
  bodyType: 'json',
  auth: { type: 'none', token: '', username: '', password: '', keyName: '', keyValue: '' },
  response: null,
  loading: false,
  ...overrides,
});

const initialTab = createTab();

export const useAppStore = create(
  persist(
    (set) => ({
      // Tab state (persisted — restored on next launch)
      tabs: [initialTab],
      activeTabId: initialTab.id,

      // Persisted state
      collections: [],
      history: [],
      environments: [{ id: 'none', name: 'No Environment', variables: {} }],
      activeEnvId: 'none',

      // Tab actions
      addTab: () => {
        const tab = createTab();
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
      },
      closeTab: (id) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => t.id !== id);
          if (!tabs.length) {
            const tab = createTab();
            return { tabs: [tab], activeTabId: tab.id };
          }
          const idx = s.tabs.findIndex((t) => t.id === id);
          const activeTabId =
            s.activeTabId === id
              ? tabs[Math.max(0, idx - 1)].id
              : s.activeTabId;
          return { tabs, activeTabId };
        }),
      setActiveTab: (id) => set({ activeTabId: id }),
      updateTab: (id, updates) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),

      // History
      addToHistory: (entry) =>
        set((s) => ({
          history: [
            { ...entry, id: Date.now().toString(), ts: Date.now() },
            ...s.history,
          ].slice(0, 100),
        })),
      clearHistory: () => set({ history: [] }),

      // Collections
      saveRequest: (collectionName, request) =>
        set((s) => {
          const col = s.collections.find((c) => c.name === collectionName);
          const req = { ...request, id: Date.now().toString() };
          if (col) {
            return {
              collections: s.collections.map((c) =>
                c.id === col.id ? { ...c, requests: [...c.requests, req] } : c
              ),
            };
          }
          return {
            collections: [
              ...s.collections,
              { id: Date.now().toString(), name: collectionName, requests: [req] },
            ],
          };
        }),
      deleteRequest: (colId, reqId) =>
        set((s) => ({
          collections: s.collections.map((c) =>
            c.id === colId ? { ...c, requests: c.requests.filter((r) => r.id !== reqId) } : c
          ),
        })),
      deleteCollection: (colId) =>
        set((s) => ({ collections: s.collections.filter((c) => c.id !== colId) })),
      importCollection: (collection) =>
        set((s) => {
          const stamp = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
          const requests = collection.requests.map((r) => ({ ...r, id: stamp() }));
          const existing = s.collections.find((c) => c.name === collection.name);
          if (existing) {
            return {
              collections: s.collections.map((c) =>
                c.id === existing.id ? { ...c, requests: [...c.requests, ...requests] } : c
              ),
            };
          }
          return {
            collections: [...s.collections, { id: stamp(), name: collection.name, requests }],
          };
        }),

      // Environments
      setActiveEnv: (id) => set({ activeEnvId: id }),
      addEnvironment: (name) =>
        set((s) => ({
          environments: [
            ...s.environments,
            { id: Date.now().toString(), name, variables: {} },
          ],
        })),
    }),
    {
      name: 'dbz-scouter-store',
      storage: secureStorage,
      partialize: (s) => ({
        collections: s.collections,
        history: s.history,
        environments: s.environments,
        activeEnvId: s.activeEnvId,
        // Persist tabs but strip transient runtime state
        tabs: s.tabs.map((t) => ({ ...t, response: null, loading: false })),
        activeTabId: s.activeTabId,
      }),
    }
  )
);
