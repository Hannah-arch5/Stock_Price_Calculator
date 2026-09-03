const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    toggleWindowSize: () => ipcRenderer.send('toggle-window-size'),
    recordSize: (index) => ipcRenderer.send('record-size', index),
    fetchFinancialData: (url) => ipcRenderer.invoke('fetch-financial-data', url),
    
    fetchYahoo: (symbol) => ipcRenderer.invoke('fetch-yahoo', symbol),
    translateText: (text, targetLang) => ipcRenderer.invoke('translate-text', text, targetLang),
    queryZotero: (dbPath, action, collectionId) => ipcRenderer.invoke('query-zotero', { dbPath, action, collectionId }),
    loadData: () => ipcRenderer.invoke('load-data'),
    saveData: (dataStr) => ipcRenderer.send('save-data', dataStr),
    dumpLocalStorage: (data) => ipcRenderer.send('dump-local-storage', data),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    openPDFWindow: (pdfPath) => ipcRenderer.send('open-pdf-window', pdfPath),
    openPDFByKey: (key) => ipcRenderer.invoke('open-pdf-by-key', key),
    fetchZoteroAPI: (url) => ipcRenderer.invoke('fetch-zotero-api', url),
    getSyncServerInfo: () => ipcRenderer.invoke('get-sync-server-info'),
    getGDriveSyncUrl: () => ipcRenderer.invoke('get-gdrive-sync-url'),
    saveGDriveSyncUrl: (url) => ipcRenderer.invoke('save-gdrive-sync-url', url)
});
