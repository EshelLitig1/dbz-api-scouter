const { contextBridge, ipcRenderer } = require('electron');

// Called by App.jsx once — registers the callback to run before the window closes
let _beforeCloseCallback = null;
ipcRenderer.on('app-before-close', async () => {
  if (_beforeCloseCallback) await _beforeCloseCallback();
  ipcRenderer.send('app-save-done');
});

// Expose a minimal, explicitly-typed API surface to the renderer.
// The renderer cannot access Node.js or Electron APIs directly.
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // HTTP requests (routed through main process — no CORS issues)
  sendRequest: (config) => ipcRenderer.invoke('send-request', config),

  // Encrypted persistent store (OS-level encryption via safeStorage)
  loadStore: ()       => ipcRenderer.invoke('store-load'),
  saveStore: (data)   => ipcRenderer.invoke('store-save', data),

  // GitHub Gist sharing (routed through main process)
  uploadGist: (payload)  => ipcRenderer.invoke('gist-upload', payload),
  fetchGist:  (gistId)   => ipcRenderer.invoke('gist-fetch', gistId),

  // Called once by App to register the pre-close save handler
  onBeforeClose: (cb) => { _beforeCloseCallback = cb; },
});
