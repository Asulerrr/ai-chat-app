const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 可以在这里添加需要的 API
  platform: process.platform,
  isElectron: true,
  
  // 窗口控制 API
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // 剪贴板 API - 用于将图片写入系统剪贴板，以便粘贴到 AI webview
  writeImageToClipboard: (dataURL) => ipcRenderer.invoke('clipboard-write-image', dataURL),
  clearClipboard: () => ipcRenderer.invoke('clipboard-clear')
});
