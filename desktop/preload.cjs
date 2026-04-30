const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nsbDesktop', {
  retry: () => ipcRenderer.invoke('desktop:retry-pos'),
})
