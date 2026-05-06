const { app, BrowserWindow, Menu, ipcMain, net, shell } = require('electron')
const path = require('path')

const POS_URL = process.env.NSB_POS_URL || 'https://nsbpos-ia77.vercel.app/pos'
const APP_ICON = path.join(__dirname, '..', 'img', 'Img_1756804186972 (1) (1).ico')

let mainWindow = null
let showingOffline = false

function getOfflineHtml(message = 'No internet connection') {
  const safeMessage = String(message).replace(/[<>&"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
  })[char])

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NSB POS Offline</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      background: #f6f7fb;
      color: #111827;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px;
    }
    main {
      width: min(520px, 100%);
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
      padding: 34px;
    }
    .mark {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 8px;
      background: #fff4e5;
      color: #f7941d;
      margin-bottom: 22px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    p {
      margin: 0 0 16px;
      color: #536079;
      line-height: 1.55;
    }
    code {
      display: block;
      width: 100%;
      overflow-wrap: anywhere;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: #f9fafb;
      padding: 12px;
      color: #111827;
      font-family: Consolas, monospace;
      font-size: 13px;
    }
    button {
      margin-top: 24px;
      min-height: 44px;
      border: 0;
      border-radius: 8px;
      background: #ff941f;
      color: #fff;
      padding: 0 20px;
      font: 700 14px Inter, Segoe UI, Arial, sans-serif;
      cursor: pointer;
    }
    button:active { transform: translateY(1px); }
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M2 8.82A16.2 16.2 0 0 1 12 5a16.2 16.2 0 0 1 10 3.82" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M5.5 12.2A10.9 10.9 0 0 1 12 10a10.9 10.9 0 0 1 6.5 2.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M9 15.6A5.3 5.3 0 0 1 12 14.7a5.3 5.3 0 0 1 3 .9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="m4 4 16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>
    <h1>No internet connection</h1>
    <p>${safeMessage}. Connect this machine to the internet, then retry NSB POS.</p>
    <code>${POS_URL}</code>
    <button type="button" onclick="window.nsbDesktop.retry()">Retry POS</button>
  </main>
</body>
</html>`
}

function loadOffline(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  showingOffline = true
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getOfflineHtml(message))}`)
}

function loadPos() {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (!net.isOnline()) {
    loadOffline('This machine is offline')
    return
  }

  showingOffline = false
  mainWindow.loadURL(POS_URL)
}

function createWindow() {
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: 'NSB POS',
    icon: APP_ICON,
    backgroundColor: '#f6f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (isMainFrame && !validatedUrl.startsWith('data:')) {
      loadOffline(errorDescription || `Could not load POS (${errorCode})`)
    }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key.toLowerCase() === 'r' && input.control) {
      event.preventDefault()
      loadPos()
    }
  })

  loadPos()
}

ipcMain.handle('desktop:retry-pos', () => {
  loadPos()
})

app.whenReady().then(createWindow)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else if (showingOffline) {
    loadPos()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
