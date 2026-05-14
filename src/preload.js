const { contextBridge, ipcRenderer, clipboard, webUtils } = require('electron');
const { fileURLToPath } = require('url');

function dedupePaths(paths) {
  return [...new Set((paths || []).filter(Boolean))];
}

function parseClipboardPathText(raw) {
  if (!raw) return [];
  const entries = String(raw)
    .split(/[\r\n\0]+/)
    .map(entry => entry.trim())
    .filter(Boolean);

  const results = [];
  entries.forEach(entry => {
    if (entry.startsWith('#')) return;
    if (entry.startsWith('file://')) {
      try {
        results.push(fileURLToPath(entry));
        return;
      } catch (err) {}
    }
    if (entry.startsWith('/')) results.push(entry);
  });
  return dedupePaths(results);
}

function readClipboardFilePaths() {
  const results = [];
  const formats = clipboard.availableFormats();

  formats.forEach(format => {
    if (!/file-url|uri-list/i.test(format)) return;
    try {
      const buffer = clipboard.readBuffer(format);
      if (buffer?.length) results.push(...parseClipboardPathText(buffer.toString('utf8')));
    } catch (err) {}
  });

  results.push(...parseClipboardPathText(clipboard.readText()));
  return dedupePaths(results);
}

function getPathForDraggedFile(file) {
  if (!file) return '';
  try {
    const resolved = webUtils.getPathForFile(file);
    if (resolved) return resolved;
  } catch (err) {}
  return file.path || '';
}

contextBridge.exposeInMainWorld('electronAPI', {
  // 파일 시스템
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  getLocations: () => ipcRenderer.invoke('get-locations'),
  searchInDirectory: (dirPath, query) => ipcRenderer.invoke('search-in-directory', dirPath, query),
  getFileStats: (filePath) => ipcRenderer.invoke('get-file-stats', filePath),

  // 즐겨찾기
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  saveFavorites: (favorites) => ipcRenderer.invoke('save-favorites', favorites),

  // 메모
  getMemos: (filePath) => ipcRenderer.invoke('get-memos', filePath),
  saveMemos: (filePath, memos) => ipcRenderer.invoke('save-memos', filePath, memos),
  getAllMemos: () => ipcRenderer.invoke('get-all-memos'),
  exportMemosToFile: (content, defaultName) => ipcRenderer.invoke('export-memos-to-file', content, defaultName),
  saveNewFileDialog: (defaultContent) => ipcRenderer.invoke('save-new-file-dialog', defaultContent),

  // 컨텍스트 메뉴
  showContextMenu: (itemPath, itemType) => ipcRenderer.invoke('show-context-menu', itemPath, itemType),
  showFileOperationConfirm: (payload) => ipcRenderer.invoke('show-file-operation-confirm', payload),
  renameItem: (oldPath, newName) => ipcRenderer.invoke('rename-item', oldPath, newName),
  deleteItem: (itemPath) => ipcRenderer.invoke('delete-item', itemPath),
  moveItem: (itemPath, targetDirPath) => ipcRenderer.invoke('move-item', itemPath, targetDirPath),
  getItemInfo: (itemPath) => ipcRenderer.invoke('get-item-info', itemPath),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 패널 분리 창
  openDetachedPanel: (payload) => ipcRenderer.invoke('open-detached-panel', payload),
  closeDetachedPanel: (panel) => ipcRenderer.invoke('close-detached-panel', panel),
  updateDetachedPanel: (payload) => ipcRenderer.send('detached-panel-state', payload),
  sendPanelWindowReady: (panel) => ipcRenderer.send('panel-window-ready', panel),
  sendDetachedEditorInput: (content) => ipcRenderer.send('detached-editor-input', content),
  onDetachedPanelState: (callback) => ipcRenderer.on('detached-panel-state', (event, payload) => callback(payload)),
  onDetachedPanelReady: (callback) => ipcRenderer.on('detached-panel-ready', (event, panel) => callback(panel)),
  onDetachedPanelClosed: (callback) => ipcRenderer.on('detached-panel-closed', (event, panel) => callback(panel)),
  onDetachedEditorInput: (callback) => ipcRenderer.on('detached-editor-input', (event, content) => callback(content)),

  // 터미널/Finder 열기
  openInTerminal: (dirPath) => ipcRenderer.invoke('open-in-terminal', dirPath),
  showInFinder: (itemPath) => ipcRenderer.invoke('show-in-finder', itemPath),
  showTerminalOpenDialog: (payload) => ipcRenderer.invoke('show-terminal-open-dialog', payload),
  showTerminalReuseDialog: (payload) => ipcRenderer.invoke('show-terminal-reuse-dialog', payload),
  pickTerminalPaths: (payload) => ipcRenderer.invoke('pick-terminal-paths', payload),
  focusDetachedPanel: (panel) => ipcRenderer.invoke('focus-detached-panel', panel),
  readClipboardText: () => clipboard.readText(),
  writeClipboardText: (text) => clipboard.writeText(text),
  readClipboardFilePaths: () => readClipboardFilePaths(),
  getPathForDraggedFile: (file) => getPathForDraggedFile(file),

  // 내장 터미널
  startTerminal: (options) => ipcRenderer.invoke('terminal-start', options),
  stopTerminal: () => ipcRenderer.invoke('terminal-stop'),
  sendTerminalInput: (data) => ipcRenderer.send('terminal-input', data),
  resizeTerminal: (size) => ipcRenderer.send('terminal-resize', size),
  onTerminalData: (callback) => ipcRenderer.on('terminal-data', (event, data) => callback(data)),
  onTerminalExit: (callback) => ipcRenderer.on('terminal-exit', (event, code) => callback(code)),

  // 미저장 확인
  showUnsavedDialog: (filename) => ipcRenderer.invoke('show-unsaved-dialog', filename),
  showCloseConfirmDialog: (lang) => ipcRenderer.invoke('show-close-confirm-dialog', lang),

  // 앱 종료 확인
  confirmClose: () => ipcRenderer.send('confirm-close'),

  // IPC 이벤트 수신
  onFolderOpened: (callback) => ipcRenderer.on('folder-opened', (event, path) => callback(path)),
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, path) => callback(path)),
  onSaveFile: (callback) => ipcRenderer.on('save-file', () => callback()),
  onToggleDarkMode: (callback) => ipcRenderer.on('toggle-dark-mode', () => callback()),
  onEditorUndo: (callback) => ipcRenderer.on('editor-undo', () => callback()),
  onEditorRedo: (callback) => ipcRenderer.on('editor-redo', () => callback()),
  onCopyAllContent: (callback) => ipcRenderer.on('copy-all-content', () => callback()),
  onExportMemos: (callback) => ipcRenderer.on('export-memos', () => callback()),
  onAppCloseRequested: (callback) => ipcRenderer.on('app-close-requested', () => callback()),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
