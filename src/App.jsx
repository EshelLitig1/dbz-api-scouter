import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import RequestBuilder from './components/RequestBuilder';
import ResponseViewer from './components/ResponseViewer';
import Runner from './components/Runner';
import { useAppStore } from './store/appStore';
import './App.css';

export default function App() {
  const [view, setView] = useState('request');
  const { tabs, activeTabId, addTab, closeTab, setActiveTab, updateTab, addToHistory } =
    useAppStore();

  const activeTab = useAppStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]
  );

  // Register a pre-close save so the window waits for disk write before quitting
  useEffect(() => {
    window.electronAPI?.onBeforeClose(async () => {
      const s = useAppStore.getState();
      await window.electronAPI.saveStore(JSON.stringify({
        collections: s.collections,
        history:     s.history,
        environments: s.environments,
        activeEnvId: s.activeEnvId,
        tabs:        s.tabs.map((t) => ({ ...t, response: null, loading: false })),
        activeTabId: s.activeTabId,
      }));
    });
  }, []);

  const handleSend = async () => {
    if (!activeTab || !activeTab.url) return;

    updateTab(activeTab.id, { loading: true, response: null });

    // Build final URL with enabled query params
    let url = activeTab.url;
    const enabledParams = activeTab.params.filter((p) => p.key && p.enabled);
    if (enabledParams.length) {
      const qs = new URLSearchParams(enabledParams.map((p) => [p.key, p.value])).toString();
      url += (url.includes('?') ? '&' : '?') + qs;
    }

    // Build headers
    const headers = {};
    activeTab.headers.filter((h) => h.key && h.enabled).forEach((h) => {
      headers[h.key] = h.value;
    });

    // Auto Content-Type for JSON body
    if (activeTab.bodyType === 'json' && activeTab.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Apply auth
    const auth = activeTab.auth;
    if (auth?.type === 'bearer' && auth.token) {
      headers['Authorization'] = `Bearer ${auth.token}`;
    } else if (auth?.type === 'basic' && auth.username) {
      headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password || ''}`)}`;
    } else if (auth?.type === 'apikey' && auth.keyName && auth.keyValue) {
      headers[auth.keyName] = auth.keyValue;
    }

    const result = await window.electronAPI?.sendRequest({
      method: activeTab.method,
      url,
      headers,
      body: ['GET', 'HEAD'].includes(activeTab.method) ? null : activeTab.body || null,
    });

    updateTab(activeTab.id, { loading: false, response: result });
    if (result) {
      addToHistory({ method: activeTab.method, url: activeTab.url, status: result.status || 0 });
    }
  };

  return (
    <div className="app">
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId || tabs[0]?.id}
        onAddTab={addTab}
        onCloseTab={closeTab}
        onSelectTab={setActiveTab}
        view={view}
        onViewChange={setView}
      />
      <div className="app-body">
        {view === 'runner' ? (
          <Runner />
        ) : (
          <>
            <Sidebar activeTab={activeTab} updateTab={(u) => updateTab(activeTab?.id, u)} />
            <main className="main-content">
              {activeTab && (
                <>
                  <RequestBuilder
                    tab={activeTab}
                    updateTab={(u) => updateTab(activeTab.id, u)}
                    onSend={handleSend}
                  />
                  <ResponseViewer response={activeTab.response} loading={activeTab.loading} />
                </>
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
}
