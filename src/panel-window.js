const params = new URLSearchParams(window.location.search);
const panel = params.get('panel') || 'preview';
const initialTitle = params.get('title') || 'MDViewer';

const shell = document.getElementById('detached-panel-shell');
const titleEl = document.getElementById('detached-panel-title');
const contentEl = document.getElementById('detached-panel-content');
const dockButton = document.getElementById('btn-dock-panel');
const detachedActions = document.getElementById('detached-panel-actions');
const detachedTerminalCopyButton = document.getElementById('btn-detached-terminal-copy');
const detachedTerminalInsertFileButton = document.getElementById('btn-detached-terminal-insert-file');
const detachedTerminalInsertFolderButton = document.getElementById('btn-detached-terminal-insert-folder');
const detachedTerminalPasteButton = document.getElementById('btn-detached-terminal-paste');
const detachedTerminalRestartButton = document.getElementById('btn-detached-terminal-restart');
const detachedTerminalPasteModal = document.getElementById('detached-terminal-paste-modal');
const detachedTerminalPasteTitle = document.getElementById('detached-terminal-paste-title');
const detachedTerminalPasteInput = document.getElementById('detached-terminal-paste-input');
const detachedTerminalPasteClose = document.getElementById('detached-terminal-paste-close');
const detachedTerminalPasteCancel = document.getElementById('btn-detached-terminal-paste-cancel');
const detachedTerminalPasteConfirm = document.getElementById('btn-detached-terminal-paste-confirm');

let terminal = null;
let fitAddon = null;
let terminalStarted = false;
let latestState = null;
let editorEl = null;
let previewEl = null;
let terminalComposing = false;
let lastDetachedTerminalSelection = '';

const strings = {
  ko: {
    dockPanel: '도킹',
    terminalLoadFailed: '터미널을 불러오지 못했습니다.',
    copy: '복사',
    insertFile: '파일 삽입',
    insertFolder: '폴더 삽입',
    terminalPaste: '텍스트 삽입',
    terminalPastePlaceholder: '여기에 붙여넣고 터미널로 보냅니다',
    insert: '삽입',
    cancel: '취소',
    terminalRestart: '재시작'
  },
  en: {
    dockPanel: 'Dock',
    terminalLoadFailed: 'Failed to load terminal.',
    copy: 'Copy',
    insertFile: 'Insert File',
    insertFolder: 'Insert Folder',
    terminalPaste: 'Insert Text',
    terminalPastePlaceholder: 'Paste here, then send it to the terminal',
    insert: 'Insert',
    cancel: 'Cancel',
    terminalRestart: 'Restart'
  }
};

function getStrings(lang) {
  return strings[lang] || strings.ko;
}

function focusTerminalInput() {
  if (!terminal) return;
  terminal.focus();
  if (terminal.textarea && typeof terminal.textarea.focus === 'function') {
    terminal.textarea.focus();
  }
}

function isDetachedTerminalContext(target = document.activeElement) {
  if (panel !== 'terminal') return false;
  if (target && contentEl?.contains(target)) return true;
  if (target && terminal?.textarea && target === terminal.textarea) return true;
  return true;
}

function isDetachedTerminalPasteModalOpen() {
  return detachedTerminalPasteModal?.style.display !== 'none';
}

function setTitle(title) {
  const nextTitle = title || initialTitle;
  document.title = nextTitle;
  titleEl.textContent = nextTitle;
}

function applyI18n(state) {
  const s = getStrings(state?.lang);
  dockButton.textContent = s.dockPanel;
  if (detachedTerminalCopyButton) detachedTerminalCopyButton.querySelector('span').textContent = s.copy;
  if (detachedTerminalInsertFileButton) detachedTerminalInsertFileButton.querySelector('span').textContent = s.insertFile;
  if (detachedTerminalInsertFolderButton) detachedTerminalInsertFolderButton.querySelector('span').textContent = s.insertFolder;
  if (detachedTerminalPasteButton) detachedTerminalPasteButton.querySelector('span').textContent = s.terminalPaste;
  if (detachedTerminalRestartButton) detachedTerminalRestartButton.querySelector('span').textContent = s.terminalRestart;
  if (detachedTerminalPasteTitle) detachedTerminalPasteTitle.textContent = s.terminalPaste;
  if (detachedTerminalPasteInput) detachedTerminalPasteInput.placeholder = s.terminalPastePlaceholder;
  if (detachedTerminalPasteCancel) detachedTerminalPasteCancel.textContent = s.cancel;
  if (detachedTerminalPasteConfirm) detachedTerminalPasteConfirm.textContent = s.insert;
}

function getTerminalTheme() {
  return {
    background: '#1f2433',
    foreground: '#d8dee9',
    cursor: '#ffffff',
    selectionBackground: '#3b4252'
  };
}

function renderEditor(state) {
  if (!editorEl) {
    editorEl = document.createElement('textarea');
    editorEl.className = 'detached-editor';
    editorEl.spellcheck = false;
    editorEl.addEventListener('input', () => {
      window.electronAPI.sendDetachedEditorInput(editorEl.value);
    });
    contentEl.innerHTML = '';
    contentEl.appendChild(editorEl);
  }
  if (editorEl.value !== (state.content || '')) editorEl.value = state.content || '';
  editorEl.placeholder = state.placeholder || '';
}

function renderPreview(state) {
  if (!previewEl) {
    previewEl = document.createElement('div');
    previewEl.className = 'preview-content detached-preview-content';
    contentEl.innerHTML = '';
    contentEl.appendChild(previewEl);
  }
  previewEl.classList.toggle('html-preview-mode', !!state.htmlPreviewMode);
  previewEl.innerHTML = state.html || '';
}

function estimateTerminalSize() {
  if (fitAddon) {
    const proposed = fitAddon.proposeDimensions();
    if (proposed?.cols && proposed?.rows) return proposed;
  }
  return { cols: terminal?.cols || 80, rows: terminal?.rows || 24 };
}

function resizeTerminal() {
  if (!terminal) return;
  if (fitAddon) {
    try { fitAddon.fit(); } catch (e) {}
  }
  if (terminalStarted) window.electronAPI.resizeTerminal(estimateTerminalSize());
}

function sendTerminalSequence(sequence) {
  if (!sequence || !terminalStarted) return;
  window.electronAPI.sendTerminalInput(sequence);
}

function getDetachedTerminalSelectionText() {
  if (terminal?.hasSelection && terminal.hasSelection()) {
    const selection = terminal.getSelection();
    if (selection) return selection;
  }
  const browserSelection = window.getSelection?.()?.toString?.() || '';
  if (browserSelection.trim()) return browserSelection;
  return lastDetachedTerminalSelection || '';
}

function captureDetachedTerminalSelection() {
  const selection = getDetachedTerminalSelectionText();
  if (selection) lastDetachedTerminalSelection = selection;
  return lastDetachedTerminalSelection || '';
}

async function writeClipboardTextSafely(text) {
  if (!text) return false;
  try {
    window.electronAPI.writeClipboardText(text);
  } catch (err) {}
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {}
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    return true;
  } catch (err) {
    return false;
  }
}

function normalizeTerminalPasteText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function buildTerminalPasteSequence(text) {
  const normalizedText = normalizeTerminalPasteText(text);
  if (!normalizedText) return '';
  return `\x1b[200~${normalizedText}\x1b[201~`;
}

async function copyTerminalSelection() {
  const selection = captureDetachedTerminalSelection();
  if (!selection) return false;
  return writeClipboardTextSafely(selection);
}

async function ensureDetachedTerminalStarted(cwd) {
  if (terminalStarted) return true;
  terminal?.writeln('Starting zsh...');
  const result = await window.electronAPI.startTerminal({
    cwd: cwd || latestState?.cwd,
    ...estimateTerminalSize()
  });
  if (!result?.success) {
    terminal?.writeln(`Failed to start terminal: ${result?.error || 'unknown error'}`);
    return false;
  }
  terminalStarted = true;
  return true;
}

async function pasteTextIntoTerminal(text) {
  const pasteSequence = buildTerminalPasteSequence(text);
  if (!pasteSequence) return false;
  const ready = await ensureDetachedTerminalStarted(latestState?.cwd);
  if (!ready) return false;
  focusTerminalInput();
  sendTerminalSequence(pasteSequence);
  return true;
}

async function pasteIntoTerminal() {
  const text = window.electronAPI.readClipboardText();
  return pasteTextIntoTerminal(text);
}

function openDetachedTerminalPasteModal() {
  if (!detachedTerminalPasteModal || !detachedTerminalPasteInput) return;
  detachedTerminalPasteInput.value = '';
  detachedTerminalPasteModal.style.display = 'flex';
  setTimeout(() => {
    detachedTerminalPasteInput.focus();
    detachedTerminalPasteInput.select();
  }, 0);
}

function closeDetachedTerminalPasteModal() {
  if (!detachedTerminalPasteModal || !detachedTerminalPasteInput) return;
  detachedTerminalPasteModal.style.display = 'none';
  detachedTerminalPasteInput.value = '';
  setTimeout(() => focusTerminalInput(), 0);
}

async function confirmDetachedTerminalPasteModal() {
  const text = detachedTerminalPasteInput?.value || '';
  if (!text.trim()) {
    closeDetachedTerminalPasteModal();
    return false;
  }
  const success = await pasteTextIntoTerminal(text);
  closeDetachedTerminalPasteModal();
  return success;
}

async function handleDetachedInsertTerminalPaths(mode) {
  const result = await window.electronAPI.pickTerminalPaths({
    mode,
    lang: latestState?.lang || 'ko'
  });
  if (!result?.success || !result.paths?.length) return false;
  await insertDroppedPaths(result.paths);
  focusTerminalInput();
  return true;
}

async function restartDetachedTerminal() {
  await window.electronAPI.stopTerminal();
  terminalStarted = false;
  if (terminal) terminal.clear();
  return ensureDetachedTerminalStarted(latestState?.cwd);
}

function resolveClipboardFilePaths(clipboardData) {
  const eventPaths = getDroppedPaths(clipboardData);
  if (eventPaths.length) return [...new Set(eventPaths)];
  return window.electronAPI.readClipboardFilePaths?.() || [];
}

function shellEscapePath(targetPath) {
  return `'${String(targetPath || '').replace(/'/g, `'\\''`)}'`;
}

function decodeDraggedPaths(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? [...new Set(parsed.filter(Boolean))] : [];
  } catch (e) {
    return [];
  }
}

function parseExternalPathText(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[\r\n\0]+/)
    .map(entry => entry.trim())
    .filter(Boolean)
    .flatMap(entry => {
      if (entry.startsWith('#')) return [];
      if (entry.startsWith('file://')) {
        try {
          const url = new URL(entry);
          return [decodeURIComponent(url.pathname)];
        } catch (e) {
          return [];
        }
      }
      return entry.startsWith('/') ? [entry] : [];
    });
}

function hasTerminalDroppableData(dataTransfer) {
  if (!dataTransfer) return false;
  if ((dataTransfer.files?.length || 0) > 0) return true;
  if (Array.from(dataTransfer.items || []).some(item => item.kind === 'file')) return true;
  const types = Array.from(dataTransfer.types || []);
  if (types.includes('Files')) return true;
  if (types.some(type => /uri-list|file-url/i.test(type))) return true;
  return !!dataTransfer.getData('application/x-mdviewer-paths') || !!dataTransfer.getData('text/plain');
}

function getDroppedPaths(dataTransfer) {
  if (!dataTransfer) return [];
  const filePaths = Array.from(dataTransfer.files || [])
    .map(file => window.electronAPI.getPathForDraggedFile?.(file) || file?.path)
    .filter(Boolean);
  if (filePaths.length) return [...new Set(filePaths)];

  const itemPaths = Array.from(dataTransfer.items || [])
    .map(item => {
      const file = item?.getAsFile?.();
      return window.electronAPI.getPathForDraggedFile?.(file) || file?.path;
    })
    .filter(Boolean);
  if (itemPaths.length) return [...new Set(itemPaths)];

  const customPaths = decodeDraggedPaths(dataTransfer.getData('application/x-mdviewer-paths'));
  if (customPaths.length) return customPaths;

  return [
    ...parseExternalPathText(dataTransfer.getData('text/uri-list')),
    ...parseExternalPathText(dataTransfer.getData('text/plain'))
  ];
}

async function insertDroppedPaths(paths) {
  const nextPaths = [...new Set(paths.filter(Boolean))];
  if (!nextPaths.length) return;
  const ready = await ensureDetachedTerminalStarted(latestState?.cwd);
  if (!ready) return;
  sendTerminalSequence(`${nextPaths.map(shellEscapePath).join(' ')} `);
}

function isHangulImeKey(key) {
  return /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(key || '');
}

function translateTerminalKey(event) {
  if (event.metaKey && event.key === 'Backspace') return '\x15';
  if (event.altKey && event.key === 'Backspace') return '\x17';
  if (event.metaKey || event.altKey) return null;

  if (event.ctrlKey && event.key && event.key.length === 1) {
    const upper = event.key.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') {
      return String.fromCharCode(upper.charCodeAt(0) - 64);
    }
  }

  switch (event.key) {
    case 'Enter': return '\r';
    case 'Backspace': return '\x7f';
    case 'Tab': return '\t';
    case 'Escape': return '\x1b';
    case 'ArrowUp': return '\x1b[A';
    case 'ArrowDown': return '\x1b[B';
    case 'ArrowRight': return '\x1b[C';
    case 'ArrowLeft': return '\x1b[D';
    case 'Home': return '\x1b[H';
    case 'End': return '\x1b[F';
    case 'Delete': return '\x1b[3~';
    case 'PageUp': return '\x1b[5~';
    case 'PageDown': return '\x1b[6~';
    default:
      if (!event.ctrlKey && event.key && event.key.length === 1) return event.key;
      return null;
  }
}

function installDetachedTerminalInputBridge(target) {
  target.addEventListener('mousedown', () => {
    setTimeout(() => focusTerminalInput(), 0);
  });
  target.addEventListener('click', () => {
    setTimeout(() => focusTerminalInput(), 0);
  });
  target.addEventListener('mouseup', () => {
    setTimeout(() => {
      captureDetachedTerminalSelection();
    }, 0);
  });
  document.addEventListener('selectionchange', () => {
    if (panel !== 'terminal') return;
    captureDetachedTerminalSelection();
  });
  window.addEventListener('focus', () => {
    setTimeout(() => focusTerminalInput(), 0);
  });
  target.addEventListener('dragover', (event) => {
    if (!hasTerminalDroppableData(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    target.classList.add('drop-target');
    focusTerminalInput();
  });
  target.addEventListener('dragleave', (event) => {
    if (!target.contains(event.relatedTarget)) target.classList.remove('drop-target');
  });
  target.addEventListener('drop', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const droppedPaths = getDroppedPaths(event.dataTransfer);
    if (!droppedPaths.length) return;
    target.classList.remove('drop-target');
    await insertDroppedPaths(droppedPaths);
    focusTerminalInput();
  });
  window.addEventListener('dragover', (event) => {
    if (!hasTerminalDroppableData(event.dataTransfer)) return;
    event.preventDefault();
  }, true);
  window.addEventListener('drop', (event) => {
    if (!hasTerminalDroppableData(event.dataTransfer)) return;
    event.preventDefault();
  }, true);
  document.addEventListener('copy', (event) => {
    if (panel !== 'terminal') return;
    const selection = captureDetachedTerminalSelection();
    if (!selection) return;
    event.preventDefault();
    event.clipboardData?.setData('text/plain', selection);
    void writeClipboardTextSafely(selection);
  }, true);
  document.addEventListener('paste', async (event) => {
    if (panel !== 'terminal') return;
    if (isDetachedTerminalPasteModalOpen() || event.target === detachedTerminalPasteInput || event.target?.closest?.('.terminal-paste-modal')) return;
    const pastedPaths = resolveClipboardFilePaths(event.clipboardData);
    if (pastedPaths.length) {
      event.preventDefault();
      await insertDroppedPaths(pastedPaths);
      return;
    }
    const pastedText = event.clipboardData?.getData('text/plain') || window.electronAPI.readClipboardText();
    if (!pastedText) return;
    event.preventDefault();
    await pasteTextIntoTerminal(pastedText);
  }, true);
  document.addEventListener('keydown', (event) => {
    if (panel !== 'terminal') return;
    if (isDetachedTerminalPasteModalOpen() && (event.target === detachedTerminalPasteInput || event.target?.closest?.('.terminal-paste-modal'))) return;
    if (event.metaKey && !event.shiftKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'v' && isDetachedTerminalContext(event.target)) {
      event.preventDefault();
      openDetachedTerminalPasteModal();
      return;
    }
    if (event.metaKey && !event.shiftKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c' && isDetachedTerminalContext(event.target)) {
      const selection = captureDetachedTerminalSelection();
      if (!selection) return;
      event.preventDefault();
      void writeClipboardTextSafely(selection);
      return;
    }
    if (!terminalStarted) return;
    if (terminalComposing || event.isComposing) return;
    const useFallbackInput = document.activeElement !== terminal?.textarea;
    if (!useFallbackInput && !(event.altKey && event.key === 'Backspace') && !(event.metaKey && event.key === 'Backspace')) return;
    const sequence = translateTerminalKey(event);
    if (!sequence) return;
    event.preventDefault();
    sendTerminalSequence(sequence);
  }, true);
  if (terminal?.textarea) {
    installDetachedTerminalTextareaBridge();
    terminal.textarea.addEventListener('compositionstart', () => {
      terminalComposing = true;
    });
    terminal.textarea.addEventListener('compositionend', () => {
      terminalComposing = false;
    });
  }
}

function installDetachedTerminalTextareaBridge() {
  const textarea = terminal?.textarea;
  if (!textarea || textarea.dataset.mdviewerBridgeInstalled === 'true') return;
  textarea.dataset.mdviewerBridgeInstalled = 'true';

  textarea.addEventListener('paste', async (event) => {
    if (panel !== 'terminal') return;
    if (isDetachedTerminalPasteModalOpen()) return;
    event.preventDefault();
    const pastedPaths = resolveClipboardFilePaths(event.clipboardData);
    if (pastedPaths.length) {
      await insertDroppedPaths(pastedPaths);
      return;
    }
    const pastedText = event.clipboardData?.getData('text/plain') || window.electronAPI.readClipboardText();
    if (!pastedText) return;
    await pasteTextIntoTerminal(pastedText);
  });

  textarea.addEventListener('keydown', (event) => {
    if (panel !== 'terminal') return;
    if (isDetachedTerminalPasteModalOpen() && (event.target === detachedTerminalPasteInput || event.target?.closest?.('.terminal-paste-modal'))) return;
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      openDetachedTerminalPasteModal();
      return;
    }
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
      const selection = captureDetachedTerminalSelection();
      if (!selection) return;
      event.preventDefault();
      void writeClipboardTextSafely(selection);
      return;
    }
    if (!terminalStarted) return;
    if (terminalComposing || event.isComposing) return;
    const useFallbackInput = document.activeElement !== textarea;
    if (!useFallbackInput && !(event.altKey && event.key === 'Backspace') && !(event.metaKey && event.key === 'Backspace')) return;
    const sequence = translateTerminalKey(event);
    if (!sequence) return;
    event.preventDefault();
    sendTerminalSequence(sequence);
  });
}

async function renderTerminal(state) {
  if (terminal) {
    terminalStarted = !!state?.terminalStarted;
    if (terminalStarted) {
      setTimeout(() => focusTerminalInput(), 0);
    }
    return;
  }
  contentEl.innerHTML = '<div class="terminal-container detached-terminal-container" id="detached-terminal"></div>';
  const target = document.getElementById('detached-terminal');
  const TerminalCtor = window.Terminal;
  const FitAddonCtor = window.FitAddon?.FitAddon;
  const s = getStrings(state?.lang);
  if (!TerminalCtor || !target) {
    if (target) target.textContent = s.terminalLoadFailed;
    return;
  }
  terminal = new TerminalCtor({
    cursorBlink: true,
    fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.3,
    theme: getTerminalTheme()
  });
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true;
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
      const selection = captureDetachedTerminalSelection();
      if (!selection) return true;
      void writeClipboardTextSafely(selection);
      return false;
    }
    return true;
  });
  terminal.onSelectionChange(() => {
    setTimeout(() => {
      captureDetachedTerminalSelection();
    }, 0);
  });
  if (FitAddonCtor) {
    fitAddon = new FitAddonCtor();
    terminal.loadAddon(fitAddon);
  }
  terminal.onData((data) => {
    if (!data || !terminalStarted) return;
    window.electronAPI.sendTerminalInput(data);
  });
  terminal.open(target);
  target.tabIndex = 0;
  document.addEventListener('keydown', (event) => {
    if (!terminalStarted) return;
    if (isDetachedTerminalPasteModalOpen()) return;
    const activeEl = document.activeElement;
    if (activeEl === detachedTerminalPasteInput || activeEl?.closest?.('.terminal-paste-modal')) return;
    if (event.target && ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(event.target.tagName)) return;
    focusTerminalInput();
  });
  installDetachedTerminalInputBridge(target);
  requestAnimationFrame(async () => {
    resizeTerminal();
    terminalStarted = !!state?.terminalStarted;
    if (!terminalStarted) {
      await ensureDetachedTerminalStarted(state.cwd);
    }
    setTimeout(() => focusTerminalInput(), 0);
  });
}

function applyState(state) {
  latestState = state;
  setTitle(state.title);
  applyI18n(state);
  if (panel === 'terminal') {
    terminalStarted = !!state?.terminalStarted;
  }
  document.body.classList.toggle('dark-mode', !!state.isDarkMode && panel !== 'terminal');
  document.body.classList.toggle('light-mode', !state.isDarkMode || panel === 'terminal');
  shell.dataset.panel = panel;
  if (detachedActions) detachedActions.style.display = panel === 'terminal' ? 'flex' : 'none';
  if (panel === 'editor') renderEditor(state);
  if (panel === 'preview') renderPreview(state);
  if (panel === 'terminal') renderTerminal(state);
}

dockButton.addEventListener('click', () => window.electronAPI.closeDetachedPanel(panel));
detachedTerminalCopyButton?.addEventListener('click', () => { void copyTerminalSelection(); });
detachedTerminalInsertFileButton?.addEventListener('click', () => { void handleDetachedInsertTerminalPaths('file'); });
detachedTerminalInsertFolderButton?.addEventListener('click', () => { void handleDetachedInsertTerminalPaths('folder'); });
detachedTerminalPasteButton?.addEventListener('click', openDetachedTerminalPasteModal);
detachedTerminalRestartButton?.addEventListener('click', () => { void restartDetachedTerminal(); });
detachedTerminalPasteClose?.addEventListener('click', closeDetachedTerminalPasteModal);
detachedTerminalPasteCancel?.addEventListener('click', closeDetachedTerminalPasteModal);
detachedTerminalPasteConfirm?.addEventListener('click', () => { void confirmDetachedTerminalPasteModal(); });
detachedTerminalPasteModal?.addEventListener('click', (event) => {
  if (event.target === detachedTerminalPasteModal) closeDetachedTerminalPasteModal();
});
detachedTerminalPasteInput?.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    void confirmDetachedTerminalPasteModal();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDetachedTerminalPasteModal();
  }
});
window.addEventListener('resize', () => setTimeout(resizeTerminal, 50));

window.electronAPI.onDetachedPanelState((payload) => {
  if (payload.panel !== panel) return;
  applyState(payload.state || {});
});
window.electronAPI.onTerminalData((data) => {
  if (terminal) terminal.write(data);
});
window.electronAPI.onTerminalExit((code) => {
  terminalStarted = false;
  if (terminal) terminal.writeln(`\r\n[terminal exited: ${code}]`);
});
setTitle(initialTitle);
window.electronAPI.sendPanelWindowReady(panel);
