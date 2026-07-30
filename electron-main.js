const { app, BrowserWindow, shell, Menu } = require('electron');
Menu.setApplicationMenu(null);

// ── Set this to your deployed server URL after deploying ──────────────────────
const GAME_URL = process.env.GAME_URL || 'https://grid-card-game-production.up.railway.app';

function createWindow() {
  const win = new BrowserWindow({
    fullscreen: true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
    title:           'Convergence',
    backgroundColor: '#1a1a2e',
    show: false,
  });

  win.loadURL(GAME_URL + '/home.html');

  win.once('ready-to-show', () => {
    win.show();
  });

  // Styled offline/error page if the server can't be reached
  win.webContents.on('did-fail-load', (_event, errorCode) => {
    if (errorCode === -3) return; // ERR_ABORTED — navigation cancelled, not a real failure
    win.webContents.loadURL('data:text/html,' + encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          background: #08060f;
          display: flex; align-items: center; justify-content: center;
          height: 100vh; flex-direction: column; gap: 14px;
          font-family: 'Inter', sans-serif; color: #fbbf24;
          user-select: none;
        }
        h1 { font-size: 22px; letter-spacing: 0.04em; }
        p  { color: #64748b; font-size: 13px; }
        button {
          margin-top: 6px; padding: 10px 28px;
          background: none; border: 1.5px solid rgba(251,191,36,0.6);
          color: #fbbf24; cursor: pointer; font-size: 13px;
          border-radius: 4px; letter-spacing: 0.04em;
          transition: all 0.2s;
        }
        button:hover { background: rgba(251,191,36,0.08); border-color: #fbbf24; }
      </style></head>
      <body>
        <h1>Could not connect</h1>
        <p>Check your internet connection and try again.</p>
        <button onclick="window.location.replace('${GAME_URL}/home.html')">Retry</button>
      </body>
      </html>
    `));
  });

  // Open any target="_blank" links in the user's real browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => app.quit());
}

app.whenReady().then(() => {
  // Silently deny any permission requests (location, camera, mic, etc.)
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
