const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
let pty = null;
try {
  pty = require('node-pty');
} catch (err) {
  console.warn('node-pty is not available:', err.message);
}

let mainWindow;
let terminalPty = null;
const detachedPanelWindows = new Map();
let isQuitting = false;

// 앱 데이터 저장 경로
const APP_DATA_DIR = path.join(os.homedir(), '.mdviewer');
const FAVORITES_FILE = path.join(APP_DATA_DIR, 'favorites.json');
const MEMOS_DIR = path.join(APP_DATA_DIR, 'memos');
const SUPPORTED_FILE_RE = /\.(md|markdown|html|htm)$/i;
const TERMINAL_THEME_COLORS = {
  foreground: '#d8dee9',
  background: '#1f2433',
  cursor: '#ffffff'
};

function shouldOpenExternalUrl(rawUrl) {
  if (!rawUrl) return false;
  try {
    const { protocol } = new URL(rawUrl);
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
  } catch (err) {
    return false;
  }
}

function attachExternalLinkHandlers(win) {
  if (!win || win.isDestroyed()) return;

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternalUrl(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!shouldOpenExternalUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });
}

function ensureAppDirs() {
  if (!fs.existsSync(APP_DATA_DIR)) fs.mkdirSync(APP_DATA_DIR, { recursive: true });
  if (!fs.existsSync(MEMOS_DIR)) fs.mkdirSync(MEMOS_DIR, { recursive: true });
}

function createTerminalEnv(cwd) {
  const env = { ...process.env };
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'Apple_Terminal';
  env.LANG = 'ko_KR.UTF-8';
  env.LC_CTYPE = 'ko_KR.UTF-8';
  env.PWD = cwd;

  delete env.NO_COLOR;
  delete env.LC_ALL;

  return env;
}

function toOscRgb(hex) {
  const normalized = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return 'rgb:0000/0000/0000';
  const r = normalized.slice(0, 2);
  const g = normalized.slice(2, 4);
  const b = normalized.slice(4, 6);
  return `rgb:${r}${r}/${g}${g}/${b}${b}`;
}

function respondToOscColorQueries(spawnedPty, data) {
  if (!data || typeof data !== 'string') return data;
  return data.replace(/\x1b\](10|11|12);\?(?:\x07|\x1b\\)/g, (_match, code) => {
    const color =
      code === '10'
        ? TERMINAL_THEME_COLORS.foreground
        : code === '11'
          ? TERMINAL_THEME_COLORS.background
          : TERMINAL_THEME_COLORS.cursor;
    try {
      spawnedPty.write(`\x1b]${code};${toOscRgb(color)}\x07`);
    } catch (err) {}
    return '';
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  attachExternalLinkHandlers(mainWindow);

  // 닫기 전 미저장 확인은 renderer에서 처리 (before-unload)
  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    // renderer에서 close-requested 이벤트로 처리
    e.preventDefault();
    mainWindow.webContents.send('app-close-requested');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getAllRendererWindows() {
  return [mainWindow, ...detachedPanelWindows.values()]
    .filter(win => win && !win.isDestroyed());
}

function broadcastToRenderers(channel, ...args) {
  getAllRendererWindows().forEach(win => win.webContents.send(channel, ...args));
}

function createDetachedPanelWindow(panel, title) {
  const existingWindow = detachedPanelWindows.get(panel);
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.focus();
    return existingWindow;
  }

  const panelWindow = new BrowserWindow({
    width: panel === 'terminal' ? 900 : 760,
    height: panel === 'terminal' ? 560 : 700,
    minWidth: 420,
    minHeight: 320,
    title: title || 'MDViewer',
    backgroundColor: panel === 'terminal' ? '#1f2433' : '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  detachedPanelWindows.set(panel, panelWindow);
  panelWindow.loadFile(path.join(__dirname, 'panel-window.html'), {
    query: { panel, title: title || panel }
  });
  attachExternalLinkHandlers(panelWindow);
  panelWindow.on('closed', () => {
    detachedPanelWindows.delete(panel);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('detached-panel-closed', panel);
    }
  });
  return panelWindow;
}

app.whenReady().then(() => {
  ensureAppDirs();
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// renderer에서 실제 종료 허가 시 호출
ipcMain.on('confirm-close', () => {
  isQuitting = true;
  if (terminalPty) {
    terminalPty.kill();
    terminalPty = null;
  }
  detachedPanelWindows.forEach(win => {
    if (win && !win.isDestroyed()) win.destroy();
  });
  detachedPanelWindows.clear();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
    mainWindow.destroy();
  }
  setImmediate(() => app.quit());
});

function createMenu() {
  const template = [
    {
      label: 'MDViewer',
      submenu: [
        { label: 'MDViewer 정보', role: 'about' },
        { type: 'separator' },
        { label: '숨기기', role: 'hide' },
        { label: '다른 앱 숨기기', role: 'hideOthers' },
        { type: 'separator' },
        { label: '종료', role: 'quit' }
      ]
    },
    {
      label: '파일',
      submenu: [
        {
          label: '폴더 열기',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => openFolder()
        },
        {
          label: '파일 열기',
          accelerator: 'CmdOrCtrl+O',
          click: () => openFile()
        },
        { type: 'separator' },
        {
          label: '저장',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('save-file')
        },
        { type: 'separator' },
        {
          label: '메모 내보내기 (Markdown)',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow.webContents.send('export-memos')
        }
      ]
    },
    {
      label: '편집',
      submenu: [
        {
          label: '실행 취소',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow.webContents.send('editor-undo')
        },
        {
          label: '다시 실행',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => mainWindow.webContents.send('editor-redo')
        },
        { type: 'separator' },
        { label: '잘라내기', role: 'cut' },
        { label: '복사', role: 'copy' },
        { label: '붙여넣기', role: 'paste' },
        { label: '전체 선택', role: 'selectAll' },
        { type: 'separator' },
        {
          label: '전문 복사',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => mainWindow.webContents.send('copy-all-content')
        }
      ]
    },
    {
      label: '보기',
      submenu: [
        {
          label: '다크 모드 전환',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => mainWindow.webContents.send('toggle-dark-mode')
        },
        { type: 'separator' },
        { label: '실제 크기', role: 'resetZoom' },
        { label: '확대', role: 'zoomIn' },
        { label: '축소', role: 'zoomOut' },
        { type: 'separator' },
        { label: '전체 화면', role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function openFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    mainWindow.webContents.send('folder-opened', result.filePaths[0]);
  }
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown / HTML', extensions: ['md', 'markdown', 'html', 'htm'] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    mainWindow.webContents.send('file-opened', result.filePaths[0]);
  }
}

// ===== IPC 핸들러 =====

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('open-detached-panel', async (event, payload = {}) => {
  try {
    createDetachedPanelWindow(payload.panel, payload.title);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('close-detached-panel', async (event, panel) => {
  try {
    const panelWindow = detachedPanelWindows.get(panel);
    if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('focus-detached-panel', async (event, panel) => {
  try {
    const panelWindow = detachedPanelWindows.get(panel);
    if (!panelWindow || panelWindow.isDestroyed()) {
      return { success: false, error: 'panel window not found' };
    }
    if (panelWindow.isMinimized()) panelWindow.restore();
    panelWindow.show();
    panelWindow.focus();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


ipcMain.on('panel-window-ready', (event, panel) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('detached-panel-ready', panel);
  }
});

ipcMain.on('detached-panel-state', (event, payload = {}) => {
  const panelWindow = detachedPanelWindows.get(payload.panel);
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('detached-panel-state', payload);
  }
});

ipcMain.on('detached-editor-input', (event, content) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('detached-editor-input', content);
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 깊이 제한 없는 디렉토리 읽기 (비동기 버전 - 메인 스레드 블로킹 방지)
ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const items = await readDirRecursiveAsync(dirPath, dirPath);
    return { success: true, items };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

async function readDirRecursiveAsync(basePath, currentPath, depth = 0) {
  if (depth > 100) return [];

  let entries;
  try {
    entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
  } catch (e) {
    return [];
  }

  const items = [];

  // 디렉토리와 파일 병렬 처리
  const dirEntries = entries.filter(e => !e.name.startsWith('.') && e.isDirectory());
  const fileEntries = entries.filter(e => !e.name.startsWith('.') && e.isFile() && SUPPORTED_FILE_RE.test(e.name));

  // 파일 먼저 추가
  for (const entry of fileEntries) {
    const fullPath = path.join(currentPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);
    items.push({ type: 'file', name: entry.name, path: fullPath, relativePath });
  }

  // 디렉토리 병렬 재귀 탐색
  const dirResults = await Promise.all(
    dirEntries.map(async (entry) => {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      const children = await readDirRecursiveAsync(basePath, fullPath, depth + 1);
      if (children.length > 0) {
        return { type: 'directory', name: entry.name, path: fullPath, relativePath, children };
      }
      return null;
    })
  );

  for (const dir of dirResults) {
    if (dir) items.push(dir);
  }

  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

ipcMain.handle('pick-terminal-paths', async (event, payload = {}) => {
  const lang = payload.lang === 'en' ? 'en' : 'ko';
  const mode = payload.mode === 'folder' ? 'folder' : 'file';
  const labels = lang === 'en'
    ? {
        fileTitle: 'Insert File Path',
        folderTitle: 'Insert Folder Path',
        fileButton: 'Insert File',
        folderButton: 'Insert Folder'
      }
    : {
        fileTitle: '파일 경로 삽입',
        folderTitle: '폴더 경로 삽입',
        fileButton: '파일 삽입',
        folderButton: '폴더 삽입'
      };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: mode === 'folder' ? labels.folderTitle : labels.fileTitle,
    buttonLabel: mode === 'folder' ? labels.folderButton : labels.fileButton,
    properties: mode === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections']
  });

  if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
  return { success: true, paths: result.filePaths };
});

ipcMain.handle('search-in-directory', async (event, dirPath, query) => {
  try {
    const results = [];
    searchFiles(dirPath, query, results);
    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function searchFiles(dirPath, query, results, depth = 0) {
  if (depth > 100) return;
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (e) {
    return;
  }
  const lowerQuery = query.toLowerCase();

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      searchFiles(fullPath, query, results, depth + 1);
    } else if (entry.isFile() && SUPPORTED_FILE_RE.test(entry.name)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const matches = [];

        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(lowerQuery)) {
            matches.push({
              lineNumber: index + 1,
              line: line.trim(),
              context: line.trim()
            });
          }
        });

        if (matches.length > 0 || entry.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            path: fullPath,
            name: entry.name,
            matches: matches.slice(0, 5)
          });
        }
      } catch (e) {}
    }
  }
}

ipcMain.handle('get-file-stats', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      success: true,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString()
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-locations', async () => {
  try {
    const homeDir = os.homedir();
    const seen = new Set();
    const locations = [];

    const addLocation = (name, itemPath, type) => {
      try {
        if (!fs.existsSync(itemPath)) return;
        const realPath = fs.realpathSync(itemPath);
        if (seen.has(realPath)) return;
        seen.add(realPath);
        locations.push({ name, path: itemPath, type });
      } catch (e) {}
    };

    addLocation('Home', homeDir, 'home');

    const volumesDir = '/Volumes';
    if (fs.existsSync(volumesDir)) {
      const volumeNames = await fs.promises.readdir(volumesDir);
      for (const volumeName of volumeNames) {
        if (volumeName.startsWith('.')) continue;
        if (volumeName === 'MDViewer') continue;
        const volumePath = path.join(volumesDir, volumeName);
        try {
          if (fs.lstatSync(volumePath).isSymbolicLink()) continue;
          if (fs.realpathSync(volumePath) === '/') continue;
        } catch (e) {
          continue;
        }
        addLocation(volumeName, volumePath, 'drive');
      }
    }

    return { success: true, locations };
  } catch (err) {
    return { success: false, error: err.message, locations: [] };
  }
});

// ===== 즐겨찾기 =====

ipcMain.handle('get-favorites', async () => {
  try {
    if (!fs.existsSync(FAVORITES_FILE)) return { success: true, favorites: [] };
    const data = JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf-8'));
    return { success: true, favorites: data };
  } catch (err) {
    return { success: true, favorites: [] };
  }
});

ipcMain.handle('save-favorites', async (event, favorites) => {
  try {
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favorites, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== 메모 =====

// 파일 경로를 안전한 파일명으로 변환
function memoFileName(filePath) {
  return filePath.replace(/[/\\:*?"<>|]/g, '_') + '.json';
}

function updateMemoPath(oldPath, newPath) {
  const oldMemoFile = path.join(MEMOS_DIR, memoFileName(oldPath));
  if (!fs.existsSync(oldMemoFile)) return;

  const newMemoFile = path.join(MEMOS_DIR, memoFileName(newPath));
  try {
    const data = JSON.parse(fs.readFileSync(oldMemoFile, 'utf-8'));
    data.__filePath__ = newPath;
    fs.writeFileSync(newMemoFile, JSON.stringify(data, null, 2), 'utf-8');
    if (oldMemoFile !== newMemoFile) fs.rmSync(oldMemoFile, { force: true });
  } catch (err) {
    try {
      if (oldMemoFile !== newMemoFile) fs.renameSync(oldMemoFile, newMemoFile);
    } catch (e) {}
  }
}

function updateMemoPathsForTree(oldRootPath, newRootPath) {
  if (!fs.existsSync(MEMOS_DIR)) return;
  const oldPrefix = oldRootPath + path.sep;
  const memoFiles = fs.readdirSync(MEMOS_DIR).filter(file => file.endsWith('.json'));
  for (const file of memoFiles) {
    try {
      const memoPath = path.join(MEMOS_DIR, file);
      const data = JSON.parse(fs.readFileSync(memoPath, 'utf-8'));
      const filePath = data.__filePath__;
      if (!filePath) continue;
      if (filePath === oldRootPath || filePath.startsWith(oldPrefix)) {
        const relativePath = path.relative(oldRootPath, filePath);
        const nextPath = relativePath ? path.join(newRootPath, relativePath) : newRootPath;
        data.__filePath__ = nextPath;
        const nextMemoPath = path.join(MEMOS_DIR, memoFileName(nextPath));
        fs.writeFileSync(nextMemoPath, JSON.stringify(data, null, 2), 'utf-8');
        if (memoPath !== nextMemoPath) fs.rmSync(memoPath, { force: true });
      }
    } catch (e) {}
  }
}

function removeMemoPathsForTree(rootPath) {
  if (!fs.existsSync(MEMOS_DIR)) return;
  const rootPrefix = rootPath + path.sep;
  const memoFiles = fs.readdirSync(MEMOS_DIR).filter(file => file.endsWith('.json'));
  for (const file of memoFiles) {
    try {
      const memoPath = path.join(MEMOS_DIR, file);
      const data = JSON.parse(fs.readFileSync(memoPath, 'utf-8'));
      const filePath = data.__filePath__;
      if (filePath === rootPath || (filePath && filePath.startsWith(rootPrefix))) {
        fs.rmSync(memoPath, { force: true });
      }
    } catch (e) {}
  }
}

function isSubPath(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return !!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

ipcMain.handle('get-memos', async (event, filePath) => {
  try {
    const memoFile = path.join(MEMOS_DIR, memoFileName(filePath));
    if (!fs.existsSync(memoFile)) return { success: true, memos: {} };
    const data = JSON.parse(fs.readFileSync(memoFile, 'utf-8'));
    // __filePath__ 메타키 제외하고 반환
    const { __filePath__: _fp, ...memos } = data;
    return { success: true, memos };
  } catch (err) {
    return { success: true, memos: {} };
  }
});

ipcMain.handle('save-memos', async (event, filePath, memos) => {
  try {
    const memoFile = path.join(MEMOS_DIR, memoFileName(filePath));
    // 원본 경로를 __filePath__ 키로 함께 저장 (전체 메모 목록 조회 시 사용)
    const dataToSave = { __filePath__: filePath, ...memos };
    fs.writeFileSync(memoFile, JSON.stringify(dataToSave, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== 전체 메모 목록 조회 =====
ipcMain.handle('get-all-memos', async () => {
  try {
    if (!fs.existsSync(MEMOS_DIR)) return { success: true, allMemos: [] };
    const files = await fs.promises.readdir(MEMOS_DIR);
    const allMemos = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.promises.readFile(path.join(MEMOS_DIR, file), 'utf-8');
        const memos = JSON.parse(raw);
        if (Object.keys(memos).length === 0) continue;
        const filePath = memos.__filePath__ || null;
        const { __filePath__: _fp, ...cleanMemos } = memos;
        if (Object.keys(cleanMemos).length === 0) continue;
        allMemos.push({ filePath, memos: cleanMemos });
      } catch (e) { /* 손상된 파일 무시 */ }
    }
    return { success: true, allMemos };
  } catch (err) {
    return { success: false, allMemos: [] };
  }
});

// ===== 메모 Markdown 파일로 내보내기 =====

ipcMain.handle('export-memos-to-file', async (event, markdownContent, defaultName) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || 'memos.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });
    if (result.canceled) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, markdownContent, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== 새 파일 저장 다이얼로그 =====

ipcMain.handle('save-new-file-dialog', async (event, defaultContent) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    });
    if (result.canceled) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, defaultContent, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== 컨텍스트 메뉴 =====

ipcMain.handle('show-file-operation-confirm', async (event, payload = {}) => {
  const action = payload.action;
  const lang = payload.lang === 'en' ? 'en' : 'ko';
  const itemType = lang === 'en'
    ? (payload.itemType === 'selection' ? 'items' : (payload.itemType === 'directory' ? 'folder' : 'file'))
    : (payload.itemType === 'selection' ? '항목' : (payload.itemType === 'directory' ? '폴더' : '파일'));
  const itemName = payload.itemName || itemType;
  const targetName = payload.targetName || '';
  const newName = payload.newName || '';
  const messages = lang === 'en'
    ? {
        rename: {
          type: 'question',
          title: 'Confirm Rename',
          message: `Rename "${itemName}" to "${newName}"?`,
          detail: 'The file explorer will refresh after the change.',
          button: 'Rename'
        },
        delete: {
          type: 'warning',
          title: 'Confirm Delete',
          message: `Move "${itemName}" ${itemType} to the Trash?`,
          detail: 'The item will be moved to the macOS Trash.',
          button: 'Delete'
        },
        move: {
          type: 'question',
          title: 'Confirm Move',
          message: `Move "${itemName}" ${itemType} to "${targetName}"?`,
          detail: 'The file explorer will refresh after the move.',
          button: 'Move'
        }
      }
    : {
        rename: {
          type: 'question',
          title: '이름 변경 확인',
          message: `"${itemName}"의 이름을 "${newName}"(으)로 변경할까요?`,
          detail: '변경 후 파일 탐색기가 새로고침됩니다.',
          button: '변경'
        },
        delete: {
          type: 'warning',
          title: '삭제 확인',
          message: `"${itemName}" ${itemType}을(를) 삭제할까요?`,
          detail: '항목은 macOS 휴지통으로 이동됩니다.',
          button: '삭제'
        },
        move: {
          type: 'question',
          title: '이동 확인',
          message: `"${itemName}" ${itemType}을(를) "${targetName}" 폴더로 이동할까요?`,
          detail: '이동 후 파일 탐색기가 새로고침됩니다.',
          button: '이동'
        }
      };
  const config = messages[action];
  if (!config) return { confirmed: false, dontAskAgain: false };

  const result = await dialog.showMessageBox(mainWindow, {
    type: config.type,
    title: config.title,
    message: config.message,
    detail: config.detail,
    buttons: [config.button, lang === 'en' ? 'Cancel' : '취소'],
    defaultId: action === 'delete' ? 1 : 0,
    cancelId: 1,
    checkboxLabel: lang === 'en' ? "Don't ask again" : '다시 묻지 않기',
    checkboxChecked: false,
    noLink: true
  });

  return {
    confirmed: result.response === 0,
    dontAskAgain: result.response === 0 && !!result.checkboxChecked
  };
});

ipcMain.handle('show-terminal-open-dialog', async (event, payload = {}) => {
  const lang = payload.lang === 'en' ? 'en' : 'ko';
  const itemName = payload.itemName || (lang === 'en' ? 'this location' : '이 위치');
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const copy = lang === 'en'
    ? {
        title: 'Open Terminal',
        message: `How do you want to open the terminal for "${itemName}"?`,
        detail: 'The choice can apply only for this app run.',
        buttons: ['Open Internally', 'Open Externally', 'Cancel'],
        checkbox: 'Use this choice for the rest of this app run'
      }
    : {
        title: '터미널 열기',
        message: `"${itemName}" 위치에서 터미널을 어떻게 열까요?`,
        detail: '선택은 이번 앱 실행 동안에만 유지할 수 있습니다.',
        buttons: ['내부 터미널에서 열기', '외부 터미널에서 열기', '취소'],
        checkbox: '이번 앱 실행 동안 이 방식으로 열기'
      };

  const result = await dialog.showMessageBox(win, {
    type: 'question',
    title: copy.title,
    message: copy.message,
    detail: copy.detail,
    buttons: copy.buttons,
    defaultId: 0,
    cancelId: 2,
    checkboxLabel: copy.checkbox,
    checkboxChecked: false,
    noLink: true
  });

  return {
    action: result.response === 0 ? 'internal' : result.response === 1 ? 'external' : 'cancel',
    rememberForSession: result.response !== 2 && !!result.checkboxChecked
  };
});

ipcMain.handle('show-terminal-reuse-dialog', async (event, payload = {}) => {
  const lang = payload.lang === 'en' ? 'en' : 'ko';
  const targetName = payload.targetName || (lang === 'en' ? 'the selected path' : '선택한 경로');
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const copy = lang === 'en'
    ? {
        title: 'Switch Internal Terminal',
        message: `Reuse the current internal terminal for "${targetName}"?`,
        detail: 'The current terminal session will restart in the selected path.',
        buttons: ['Switch Terminal', 'Cancel'],
        checkbox: "Don't ask again during this app run"
      }
    : {
        title: '내부 터미널 전환',
        message: `"${targetName}" 경로로 현재 내부 터미널을 전환할까요?`,
        detail: '현재 내부 터미널 세션이 선택한 경로에서 다시 시작됩니다.',
        buttons: ['터미널 전환', '취소'],
        checkbox: '이번 앱 실행 동안 다시 묻지 않기'
      };

  const result = await dialog.showMessageBox(win, {
    type: 'question',
    title: copy.title,
    message: copy.message,
    detail: copy.detail,
    buttons: copy.buttons,
    defaultId: 0,
    cancelId: 1,
    checkboxLabel: copy.checkbox,
    checkboxChecked: false,
    noLink: true
  });

  return {
    confirmed: result.response === 0,
    rememberForSession: result.response === 0 && !!result.checkboxChecked
  };
});

ipcMain.handle('show-context-menu', async (event, itemPath, itemType) => {
  return new Promise((resolve) => {
    const isDir = itemType === 'directory';
    const menuTemplate = [
      {
        label: isDir ? '폴더 정보' : '파일 정보',
        click: () => resolve({ action: 'info' })
      },
      {
        label: 'Finder에서 열기',
        click: () => {
          shell.showItemInFolder(itemPath);
          resolve({ action: 'finder' });
        }
      },
      { type: 'separator' },
      {
        label: '이름 변경',
        click: () => resolve({ action: 'rename' })
      },
      { type: 'separator' },
      ...(isDir ? [{
        label: '터미널에서 열기',
        click: () => {
          const { exec } = require('child_process');
          exec(`open -a Terminal "${itemPath}"`);
          resolve({ action: 'terminal' });
        }
      }] : [])
    ];
    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup({ window: mainWindow, callback: () => resolve({ action: null }) });
  });
});

ipcMain.handle('rename-item', async (event, oldPath, newName) => {
  try {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    if (fs.existsSync(newPath)) {
      return { success: false, error: '같은 이름의 파일/폴더가 이미 존재합니다.' };
    }
    fs.renameSync(oldPath, newPath);
    const stats = fs.statSync(newPath);
    if (stats.isDirectory()) updateMemoPathsForTree(oldPath, newPath);
    else updateMemoPath(oldPath, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-item', async (event, itemPath) => {
  try {
    const stats = fs.statSync(itemPath);
    await shell.trashItem(itemPath);
    if (stats.isDirectory()) removeMemoPathsForTree(itemPath);
    else removeMemoPathsForTree(itemPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('move-item', async (event, itemPath, targetDirPath) => {
  try {
    const stats = fs.statSync(itemPath);
    const targetStats = fs.statSync(targetDirPath);
    if (!targetStats.isDirectory()) {
      return { success: false, error: '대상 위치가 폴더가 아닙니다.' };
    }

    const sourceDir = path.dirname(itemPath);
    if (sourceDir === targetDirPath) {
      return { success: false, error: '이미 같은 폴더에 있습니다.' };
    }

    if (stats.isDirectory() && (targetDirPath === itemPath || isSubPath(itemPath, targetDirPath))) {
      return { success: false, error: '폴더를 자기 자신 또는 하위 폴더로 이동할 수 없습니다.' };
    }

    const newPath = path.join(targetDirPath, path.basename(itemPath));
    if (fs.existsSync(newPath)) {
      return { success: false, error: '대상 폴더에 같은 이름의 파일/폴더가 이미 존재합니다.' };
    }

    fs.renameSync(itemPath, newPath);
    if (stats.isDirectory()) updateMemoPathsForTree(itemPath, newPath);
    else updateMemoPath(itemPath, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-item-info', async (event, itemPath) => {
  try {
    const stats = fs.statSync(itemPath);
    const isDir = stats.isDirectory();
    let fileCount = 0;
    let totalSize = 0;
    if (isDir) {
      const countFiles = (dir) => {
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            if (e.name.startsWith('.')) continue;
            const fp = path.join(dir, e.name);
            if (e.isDirectory()) countFiles(fp);
            else if (SUPPORTED_FILE_RE.test(e.name)) {
              fileCount++;
              totalSize += fs.statSync(fp).size;
            }
          }
        } catch (e) {}
      };
      countFiles(itemPath);
    } else {
      totalSize = stats.size;
    }
    return {
      success: true,
      name: path.basename(itemPath),
      fullPath: itemPath,
      isDirectory: isDir,
      size: totalSize,
      fileCount,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString()
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== 터미널/Finder 열기 =====

ipcMain.handle('open-in-terminal', async (event, dirPath) => {
  try {
    const { exec } = require('child_process');
    // dirPath가 파일이면 해당 디렉토리로
    const fs = require('fs');
    const targetDir = fs.statSync(dirPath).isDirectory() ? dirPath : require('path').dirname(dirPath);
    exec(`open -a Terminal "${targetDir}"`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('terminal-start', async (event, options = {}) => {
  try {
    if (!pty) {
      return { success: false, error: 'node-pty is not available' };
    }

    const previousPty = terminalPty;
    if (previousPty) {
      terminalPty = null;
      previousPty.kill();
    }

    const requestedCwd = options.cwd || os.homedir();
    let cwd = os.homedir();
    try {
      const stat = fs.statSync(requestedCwd);
      cwd = stat.isDirectory() ? requestedCwd : path.dirname(requestedCwd);
    } catch (e) {}

    const shellPath = process.env.SHELL || os.userInfo().shell || '/bin/zsh';
    const spawnedPty = pty.spawn(shellPath, ['-l'], {
      name: 'xterm-256color',
      cols: Math.max(20, Number(options.cols) || 80),
      rows: Math.max(8, Number(options.rows) || 24),
      cwd,
      env: createTerminalEnv(cwd)
    });
    terminalPty = spawnedPty;

    spawnedPty.onData((data) => {
      if (terminalPty !== spawnedPty) return;
      const renderedData = respondToOscColorQueries(spawnedPty, data);
      if (renderedData) broadcastToRenderers('terminal-data', renderedData);
    });

    spawnedPty.onExit(({ exitCode }) => {
      if (terminalPty !== spawnedPty) return;
      terminalPty = null;
      broadcastToRenderers('terminal-exit', exitCode);
    });

    return { success: true, cwd };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on('terminal-input', (event, data) => {
  if (terminalPty) terminalPty.write(data);
});

ipcMain.on('terminal-resize', (event, size = {}) => {
  if (!terminalPty) return;
  const cols = Math.max(20, Number(size.cols) || 80);
  const rows = Math.max(8, Number(size.rows) || 24);
  terminalPty.resize(cols, rows);
});

ipcMain.handle('terminal-stop', async () => {
  try {
    if (terminalPty) {
      terminalPty.kill();
      terminalPty = null;
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('show-in-finder', async (event, itemPath) => {
  try {
    shell.showItemInFolder(itemPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== 미저장 확인 다이얼로그 =====

ipcMain.handle('show-unsaved-dialog', async (event, filename) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '저장하지 않은 변경사항',
    message: `"${filename}"에 저장하지 않은 변경사항이 있습니다.`,
    detail: '저장하지 않고 닫으면 변경사항이 사라집니다.',
    buttons: ['저장', '저장하지 않음', '취소'],
    defaultId: 0,
    cancelId: 2
  });
  return { button: result.response }; // 0=저장, 1=저장안함, 2=취소
});

ipcMain.handle('show-close-confirm-dialog', async (event, lang = 'ko') => {
  const isEn = lang === 'en';
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    title: isEn ? 'Close MDViewer' : 'MDViewer 종료',
    message: isEn ? 'Do you want to close MDViewer?' : '종료하시겠습니까?',
    detail: isEn
      ? 'Any unsaved files will be checked before the app closes.'
      : '저장되지 않은 파일이 있으면 종료 전에 확인합니다.',
    buttons: [isEn ? 'Close' : '종료', isEn ? 'Cancel' : '취소'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  return { confirmed: result.response === 0 };
});
