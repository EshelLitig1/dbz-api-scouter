const { contextBridge, ipcRenderer } = require('electron');

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
});
