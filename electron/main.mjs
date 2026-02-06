import electron from 'electron';
const { app, BrowserWindow, session, shell } = electron;
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('process.type:', process.type);
console.log('electron:', typeof electron);
console.log('app:', typeof app);

// 检查 app 是否可用
if (!app) {
  console.error('Error: app is not available. Make sure this is running in Electron.');
  process.exit(1);
}

// 开发环境检测
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// 禁用开发环境的安全警告
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// 检测端口是否可用
function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, () => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// 查找 Vite 开发服务器端口
async function findDevServerPort() {
  const ports = [5173, 5174, 5175, 5176, 5177];
  for (const port of ports) {
    if (await checkPort(port)) {
      return port;
    }
  }
  return 5173;
}

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  if (isDev) {
    const port = await findDevServerPort();
    console.log(`Loading dev server at port ${port}`);
    mainWindow.loadURL(`http://localhost:${port}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 处理窗口控制按钮点击事件
  mainWindow.webContents.on('ipc-message', (event, channel, ...args) => {
    if (channel === 'window-minimize') {
      mainWindow.minimize();
    } else if (channel === 'window-maximize') {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    } else if (channel === 'window-close') {
      mainWindow.close();
    }
  });

  // 注册快捷键打开开发者工具
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

app.whenReady().then(() => {
  console.log('App is ready, creating window...');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
      contents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      contents.on('did-finish-load', () => {
        contents.insertCSS(`
          html, body {
            overflow: auto !important;
            height: 100% !important;
            -webkit-overflow-scrolling: touch !important;
          }
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(128, 128, 128, 0.5);
            border-radius: 4px;
          }
        `).catch(() => {});
      });

      contents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
