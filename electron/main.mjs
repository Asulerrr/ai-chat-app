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

// 关键：在 app ready 之前设置 Chromium 命令行参数
// 这些参数帮助隐藏 Electron/自动化特征
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// 更真实的 Chrome User-Agent
const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Google 登录相关的 URL 模式
const GOOGLE_LOGIN_PATTERNS = [
  'accounts.google.com/signin',
  'accounts.google.com/v3/signin',
  'accounts.google.com/ServiceLogin',
  'accounts.google.com/o/oauth2',
  'accounts.google.com/AccountChooser',
  'accounts.google.com/AddSession',
  'accounts.google.com/CheckCookie',
  'accounts.google.com/InteractiveLogin',
];

// 检查 URL 是否是 Google 登录页面
function isGoogleLoginUrl(url) {
  if (!url) return false;
  return GOOGLE_LOGIN_PATTERNS.some(pattern => url.includes(pattern));
}

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

// 存储登录窗口引用
const loginWindows = new Map();

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
  
  // 设置全局 User-Agent
  app.userAgentFallback = CHROME_USER_AGENT;
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
      contents.setUserAgent(CHROME_USER_AGENT);

      // 拦截 webview 中的 Google 登录导航
      // Google 不允许在 Electron webview 中登录，所以我们在系统浏览器中打开
      // 然后通过 cookie 导入的方式同步登录状态
      contents.on('will-navigate', (event, url) => {
        if (isGoogleLoginUrl(url)) {
          console.log('[Webview] 检测到 Google 登录，在系统浏览器中打开...');
          event.preventDefault();
          // 在系统默认浏览器中打开 Google 登录
          shell.openExternal(url);
          // 在 webview 中显示提示信息
          contents.executeJavaScript(
            `(function() {
              var old = document.getElementById('google-login-overlay');
              if (old) old.remove();
              var overlay = document.createElement('div');
              overlay.id = 'google-login-overlay';
              overlay.style.position = 'fixed';
              overlay.style.top = '0';
              overlay.style.left = '0';
              overlay.style.width = '100vw';
              overlay.style.height = '100vh';
              overlay.style.zIndex = '2147483647';
              overlay.style.background = 'rgba(0,0,0,0.92)';
              overlay.style.display = 'flex';
              overlay.style.alignItems = 'center';
              overlay.style.justifyContent = 'center';
              overlay.style.fontFamily = '-apple-system,BlinkMacSystemFont,sans-serif';
              var box = document.createElement('div');
              box.style.textAlign = 'center';
              box.style.color = 'white';
              box.style.maxWidth = '400px';
              box.style.padding = '40px';
              var icon = document.createElement('div');
              icon.style.fontSize = '48px';
              icon.style.marginBottom = '20px';
              icon.textContent = '\\u{1F310}';
              box.appendChild(icon);
              var title = document.createElement('h2');
              title.style.fontSize = '20px';
              title.style.marginBottom = '12px';
              title.style.color = '#4ade80';
              title.textContent = '已在系统浏览器中打开登录页面';
              box.appendChild(title);
              var desc = document.createElement('p');
              desc.style.fontSize = '14px';
              desc.style.color = '#9ca3af';
              desc.style.lineHeight = '1.6';
              desc.style.marginBottom = '24px';
              desc.innerHTML = 'Google 不允许在嵌入式浏览器中登录。<br/>请在弹出的浏览器窗口中完成登录，<br/>然后返回此应用。';
              box.appendChild(desc);
              var hint = document.createElement('p');
              hint.style.fontSize = '13px';
              hint.style.color = '#6b7280';
              hint.style.marginBottom = '24px';
              hint.textContent = '\\u{1F4A1} 提示：Google AI 无需登录即可使用';
              box.appendChild(hint);
              var btn = document.createElement('button');
              btn.textContent = '我知道了';
              btn.style.padding = '10px 32px';
              btn.style.background = '#10b981';
              btn.style.color = 'white';
              btn.style.border = 'none';
              btn.style.borderRadius = '12px';
              btn.style.fontSize = '14px';
              btn.style.cursor = 'pointer';
              btn.style.fontWeight = '500';
              btn.addEventListener('click', function() {
                var el = document.getElementById('google-login-overlay');
                if (el) el.parentNode.removeChild(el);
              });
              box.appendChild(btn);
              overlay.appendChild(box);
              document.body.appendChild(overlay);
            })();`
          ).catch(() => {});
        }
      });

      // 拦截新窗口打开
      contents.setWindowOpenHandler(({ url }) => {
        if (isGoogleLoginUrl(url)) {
          console.log('[Webview] 新窗口请求 Google 登录，在系统浏览器中打开...');
          shell.openExternal(url);
          return { action: 'deny' };
        }
        
        shell.openExternal(url);
        return { action: 'deny' };
      });

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
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
