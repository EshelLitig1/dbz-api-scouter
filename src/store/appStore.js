import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const SENSITIVE_HEADERS = new Set([
  'authorization', 'x-api-key', 'api-key', 'x-auth-token', 'cookie', 'set-cookie',
]);

export function serializeRequest(req) {
  return {
    v: 1,
    name: req.name,
    method: req.method,
    url: req.url,
    params: req.params ?? [],
    headers: (req.headers ?? []).map((h) =>
      SENSITIVE_HEADERS.has((h.key || '').toLowerCase()) ? { ...h, value: '' } : h
    ),
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
      // Session state (not persisted — resets each launch)
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
      partialize: (s) => ({
        collections: s.collections,
        history: s.history,
        environments: s.environments,
        activeEnvId: s.activeEnvId,
      }),
    }
  )
);
