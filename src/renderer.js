// ===== MDViewer Renderer Process =====
const HOME_TAB_ID = '__home__';
const HTML_FILE_RE = /\.(html|htm)$/i;
const SELECTION_SYNC_MIN_LENGTH = 2;
const FILE_OPERATION_CONFIRM_STORAGE_KEY = 'fileOperationConfirmPrefs';
const SECTION_ORDER_DEFAULT_STORAGE_KEY = 'sectionOrderDefaultV3';
const PANEL_PINNED_ACTIONS_STORAGE_KEY = 'panelPinnedActionsV1';
const DEFAULT_SECTION_ORDER = ['locations', 'recent', 'favorites', 'filetree', 'memos'];
const DEFAULT_PANEL_ORDER = ['editor', 'preview', 'terminal'];
const BOOT_AFTER_TYPING_DURATION = 2000;
const BOOT_TYPING_INTERVAL = 62;
const BOOT_LINE_PAUSE = 180;
const BOOT_MID_CARET_DURATION = 900;
const BOOT_CARET_BLINK_DURATION = 900;
// ===== 상태 관리 =====
const state = {
  lang: 'ko',
  currentFolder: null,
  currentFile: null,
  tabs: [],
  activeTabId: null,
  isDarkMode: false,
  viewMode: 'split', // 'split' | 'editor' | 'preview' | 'custom'
  panelOrder: [...DEFAULT_PANEL_ORDER],
  panelVisibility: { editor: true, preview: true, terminal: false },
  detachedPanels: { editor: false, preview: false, terminal: false },
  panelSizes: {},
  isSearchOpen: false,
  searchQuery: '',
  sidebarWidth: 260,
  favorites: [],          // [{ type: 'file'|'directory', path, name }]
  favoriteSortMode: 'custom', // 'custom' | 'name' | 'recent'
  memos: {},              // { [filePath]: { [lineKey]: memoText } }
  activeMemoKey: null,    // 현재 열린 메모의 lineKey
  activeMemoFilePath: null,
  isFavoritesOpen: true,
  isLocationsOpen: true,
  isFileTreeOpen: true,
  isRecentOpen: true,
  isMemosOpen: true,
  recentFiles: [],        // [{ path, name, openedAt }] 최대 5개
  locations: [],           // Finder 스타일 위치 목록
  sectionOrder: [...DEFAULT_SECTION_ORDER], // 섹션 순서
  allMemos: [],            // [{ filePath, memos }] 전체 메모 목록
  // Undo/Redo 스택 (파일별)
  undoStacks: {},   // { [tabId]: [content, ...] }
  redoStacks: {},   // { [tabId]: [content, ...] }
  lastSavedContent: {}, // { [tabId]: content }
  isSelectionSyncing: false,
  folderBackStack: [],
  folderForwardStack: [],
  fileOperationConfirmPrefs: {
    rename: true,
    delete: true,
    move: true,
  },
  draggedTreeItem: null,
  draggedFavoritePath: null,
  selectedTreeItems: [],
  lastSelectedTreePath: null,
  draggedTerminalPaths: [],
  terminal: null,
  terminalFitAddon: null,
  terminalStarted: false,
  terminalListenersReady: false,
  terminalInputBridgeReady: false,
  terminalInputActive: false,
  terminalComposing: false,
  terminalCwd: null,
  terminalOpenModeSession: 'ask',
  terminalReusePromptSession: true,
  lastTerminalSelection: '',
  pinnedPanelActions: {
    editor: [],
    preview: [],
    terminal: [],
  },
};

// ===== DOM 요소 =====
const $ = id => document.getElementById(id);
const dom = {
  body: document.body,
  titlebarFilename: $('titlebar-filename'),
  btnOpenFolder: $('btn-open-folder'),
  btnFolderBack: $('btn-folder-back'),
  btnFolderForward: $('btn-folder-forward'),
  btnWelcomeOpen: $('btn-welcome-open'),
  folderName: $('folder-name'),
  fileTree: $('file-tree'),
  sidebarSearch: $('sidebar-search'),
  searchInput: $('search-input'),
  searchResults: $('search-results'),
  btnClearSearch: $('btn-clear-search'),
  tabsList: $('tabs-list'),
  editor: $('editor'),
  previewContent: $('preview-content'),
  editorPanel: $('editor-panel'),
  previewPanel: $('preview-panel'),
  terminalPanel: $('terminal-panel'),
  terminalContainer: $('terminal-container'),
  terminalEmpty: $('terminal-empty'),
  editorPreviewContainer: $('editor-preview-container'),
  statusPath: $('status-path'),
  statusInfo: $('status-info'),
  btnLang: $('btn-lang'),
  langLabel: $('lang-label'),
  langDropdown: $('lang-dropdown'),
  btnDarkMode: $('btn-dark-mode'),
  btnCloseAllTabs: $('btn-close-all-tabs'),
  btnViewToggle: $('btn-view-toggle'),
  btnToggleEditor: $('btn-toggle-editor'),
  btnTogglePreview: $('btn-toggle-preview'),
  btnToggleTerminal: $('btn-toggle-terminal'),
  editorPinnedActions: $('editor-pinned-actions'),
  previewPinnedActions: $('preview-pinned-actions'),
  terminalPinnedActions: $('terminal-pinned-actions'),
  btnEditorActionsMenu: $('btn-editor-actions-menu'),
  btnPreviewActionsMenu: $('btn-preview-actions-menu'),
  btnTerminalActionsMenu: $('btn-terminal-actions-menu'),
  editorActionsDropdown: $('editor-actions-dropdown'),
  previewActionsDropdown: $('preview-actions-dropdown'),
  terminalActionsDropdown: $('terminal-actions-dropdown'),
  btnTerminalInsertFile: $('btn-terminal-insert-file'),
  btnTerminalInsertFolder: $('btn-terminal-insert-folder'),
  btnTerminalCopy: $('btn-terminal-copy'),
  btnTerminalPaste: $('btn-terminal-paste'),
  btnTerminalRestart: $('btn-terminal-restart'),
  btnTerminalStop: $('btn-terminal-stop'),
  btnEditorActionsConfig: $('btn-editor-actions-config'),
  btnPreviewActionsConfig: $('btn-preview-actions-config'),
  btnTerminalActionsConfig: $('btn-terminal-actions-config'),
  btnDetachEditor: $('btn-detach-editor'),
  btnDetachPreview: $('btn-detach-preview'),
  btnDetachTerminal: $('btn-detach-terminal'),
  sidebar: $('sidebar'),
  resizeHandle: $('resize-handle'),
  tabBar: $('tab-bar'),
  // 즐겨찾기
  locationsHeader: $('locations-header'),
  locationsList: $('locations-list'),
  locationsChevron: $('locations-chevron'),
  btnRefreshLocations: $('btn-refresh-locations'),
  favoritesHeader: $('favorites-header'),
  favoritesList: $('favorites-list'),
  favoritesEmpty: $('favorites-empty'),
  favoritesChevron: $('favorites-chevron'),
  btnFavoritesSort: $('btn-favorites-sort'),
  filetreeHeader: $('filetree-header'),
  filetreeChevron: $('filetree-chevron'),
  btnRefreshFolder: $('btn-refresh-folder'),
  // 패널 액션
  btnCopyAll: $('btn-copy-all'),
  btnRefreshFile: $('btn-refresh-file'),
  btnUndo: $('btn-undo'),
  btnRedo: $('btn-redo'),
  btnSave: $('btn-save'),
  btnApplyMemos: $('btn-apply-memos'),
  btnExportMemos: $('btn-export-memos'),
  // 메모 패널
  memoPanel: $('memo-panel'),
  memoPanelTitle: $('memo-panel-title'),
  memoPanelClose: $('memo-panel-close'),
  memoTextarea: $('memo-textarea'),
  btnMemoSave: $('btn-memo-save'),
  btnMemoDelete: $('btn-memo-delete'),
  // 토스트
  toast: $('toast'),
  // About
  btnAbout: $('btn-about'),
  aboutModal: $('about-modal'),
  aboutVersion: $('about-version'),
  aboutClose: $('about-close'),
  // 최근 본 파일
  recentList: $('recent-list'),
  recentChevron: $('recent-chevron'),
  recentHeader: $('recent-header'),
  // 메모 섹션
  memosHeader: $('memos-header'),
  memosChevron: $('memos-chevron'),
  memosSectionList: $('memos-section-list'),
  memosCountBadge: $('memos-count-badge'),
  // 섹션 컨테이너
  sidebarSections: $('sidebar-sections'),
  // 경로 복사
  statusPathWrap: $('status-path-wrap'),
  btnCopyPath: $('btn-copy-path'),
  // 이름 변경 모달
  renameModal: $('rename-modal'),
  renameModalClose: $('rename-modal-close'),
  renameInput: $('rename-input'),
  btnRenameCancel: $('btn-rename-cancel'),
  btnRenameConfirm: $('btn-rename-confirm'),
  terminalPasteModal: $('terminal-paste-modal'),
  terminalPasteClose: $('terminal-paste-close'),
  terminalPasteInput: $('terminal-paste-input'),
  btnTerminalPasteCancel: $('btn-terminal-paste-cancel'),
  btnTerminalPasteConfirm: $('btn-terminal-paste-confirm'),
  panelActionsConfigModal: $('panel-actions-config-modal'),
  panelActionsConfigTitle: $('panel-actions-config-title'),
  panelActionsConfigBody: $('panel-actions-config-body'),
  panelActionsConfigClose: $('panel-actions-config-close'),
  btnPanelActionsConfigCancel: $('panel-actions-config-cancel'),
  btnPanelActionsConfigConfirm: $('panel-actions-config-confirm'),
  bootOverlay: $('boot-overlay'),
  bootLine1: $('boot-line-1'),
  bootLine2: $('boot-line-2'),
  // 아이템 정보 모달
  itemInfoModal: $('item-info-modal'),
  itemInfoTitle: $('item-info-title'),
  itemInfoClose: $('item-info-close'),
  itemInfoBody: $('item-info-body'),
};

const bootOverlayState = {
  startedAt: 0,
  typingPromise: Promise.resolve(),
};

let activePanelActionsMenu = null;
let pendingPanelActionsConfig = null;
let activePinnedActionContextMenu = null;

const PANEL_ACTION_IDS = {
  editor: ['btn-copy-all', 'btn-refresh-file', 'btn-undo', 'btn-redo', 'btn-save', 'btn-save-home-md'],
  preview: ['btn-reveal-in-tree', 'btn-fav-current', 'btn-apply-memos', 'btn-export-memos'],
  terminal: ['btn-terminal-copy', 'btn-terminal-insert-file', 'btn-terminal-insert-folder', 'btn-terminal-paste', 'btn-terminal-restart'],
};

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function closeAllPanelActionMenus() {
  [
    [dom.btnEditorActionsMenu, dom.editorActionsDropdown],
    [dom.btnPreviewActionsMenu, dom.previewActionsDropdown],
    [dom.btnTerminalActionsMenu, dom.terminalActionsDropdown],
  ].forEach(([button, dropdown]) => {
    if (dropdown) dropdown.style.display = 'none';
    button?.setAttribute('aria-expanded', 'false');
  });
  activePanelActionsMenu = null;
}

function closePinnedActionContextMenu() {
  if (activePinnedActionContextMenu) {
    activePinnedActionContextMenu.remove();
    activePinnedActionContextMenu = null;
  }
}

function normalizePinnedPanelActions(raw) {
  const fallback = { editor: [], preview: [], terminal: [] };
  if (!raw || typeof raw !== 'object') return fallback;
  Object.keys(fallback).forEach(panel => {
    fallback[panel] = Array.isArray(raw[panel])
      ? raw[panel].filter(id => PANEL_ACTION_IDS[panel]?.includes(id))
      : [];
  });
  return fallback;
}

function savePinnedPanelActions() {
  localStorage.setItem(PANEL_PINNED_ACTIONS_STORAGE_KEY, JSON.stringify(state.pinnedPanelActions));
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

function getPinnedActionsContainer(panel) {
  return {
    editor: dom.editorPinnedActions,
    preview: dom.previewPinnedActions,
    terminal: dom.terminalPinnedActions,
  }[panel] || null;
}

function renderPinnedPanelActions(panel) {
  const container = getPinnedActionsContainer(panel);
  if (!container) return;
  container.innerHTML = '';
  const pinnedIds = state.pinnedPanelActions[panel] || [];
  pinnedIds.forEach(actionId => {
    const sourceButton = document.getElementById(actionId);
    if (!sourceButton || sourceButton.style.display === 'none') return;
    const sourceIcon = sourceButton.querySelector('svg');
    const proxy = document.createElement('button');
    proxy.className = 'btn-panel-action btn-panel-pinned-action';
    proxy.type = 'button';
    proxy.dataset.panel = panel;
    proxy.dataset.actionId = actionId;
    proxy.title = sourceButton.title || sourceButton.textContent.trim();
    proxy.innerHTML = sourceIcon ? sourceIcon.outerHTML : '';
    proxy.addEventListener('click', (e) => {
      e.stopPropagation();
      sourceButton.click();
    });
    proxy.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPinnedActionContextMenu(e.clientX, e.clientY, panel, actionId);
    });
    container.appendChild(proxy);
  });
}

function renderAllPinnedPanelActions() {
  renderPinnedPanelActions('editor');
  renderPinnedPanelActions('preview');
  renderPinnedPanelActions('terminal');
}

function openPanelActionsConfig() {}
function closePanelActionsConfig() {}
function confirmPanelActionsConfig() {}

function togglePinnedPanelAction(panel, actionId) {
  const current = new Set(state.pinnedPanelActions[panel] || []);
  if (current.has(actionId)) {
    current.delete(actionId);
  } else {
    current.add(actionId);
  }
  state.pinnedPanelActions[panel] = PANEL_ACTION_IDS[panel].filter(id => current.has(id));
  savePinnedPanelActions();
  renderPinnedPanelActions(panel);
  renderPanelActionPinStates();
}

function openPinnedActionContextMenu(x, y, panel, actionId) {
  closePinnedActionContextMenu();
  const strings = i18nStrings[state.lang || 'ko'];
  const menu = document.createElement('div');
  menu.className = 'context-menu pinned-action-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.innerHTML = `<button type="button" class="context-menu-item pinned-action-context-item">${escapeHtml(strings.unpinHeaderAction || '헤더에서 해제')}</button>`;
  menu.querySelector('button')?.addEventListener('click', () => {
    togglePinnedPanelAction(panel, actionId);
    closePinnedActionContextMenu();
  });
  document.body.appendChild(menu);
  activePinnedActionContextMenu = menu;
}

function renderPanelActionPinStates() {
  document.querySelectorAll('.panel-dropdown-item[data-panel][data-action-id]').forEach(item => {
    const panel = item.dataset.panel;
    const actionId = item.dataset.actionId;
    const pinned = (state.pinnedPanelActions[panel] || []).includes(actionId);
    item.classList.toggle('is-pinned', pinned);
    const pinButton = item.querySelector('.panel-action-pin');
    if (pinButton) {
      pinButton.title = pinned
        ? (i18nStrings[state.lang || 'ko'].unpinHeaderAction || '헤더에서 해제')
        : (i18nStrings[state.lang || 'ko'].pinHeaderAction || '헤더에 고정');
      pinButton.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    }
  });
}

function initPanelActionPinControls() {
  document.querySelectorAll('.panel-actions-dropdown').forEach(dropdown => {
    const panel = dropdown.id.startsWith('editor') ? 'editor' : dropdown.id.startsWith('preview') ? 'preview' : 'terminal';
    dropdown.querySelectorAll('.panel-dropdown-item').forEach(item => {
      if (item.id.endsWith('-actions-config')) {
        item.style.display = 'none';
        return;
      }
      item.dataset.panel = panel;
      item.dataset.actionId = item.id;
      if (item.querySelector('.panel-action-pin')) return;
      const pinButton = document.createElement('button');
      pinButton.type = 'button';
      pinButton.className = 'panel-action-pin';
      pinButton.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 17v4"/>
          <path d="M8 3h8l-1.5 4 3.5 3v1H6v-1l3.5-3L8 3z"/>
        </svg>
      `;
      pinButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePinnedPanelAction(panel, item.id);
      });
      item.appendChild(pinButton);
    });
  });
  renderPanelActionPinStates();
}

function togglePanelActionsMenu(key) {
  const mapping = {
    editor: [dom.btnEditorActionsMenu, dom.editorActionsDropdown],
    preview: [dom.btnPreviewActionsMenu, dom.previewActionsDropdown],
    terminal: [dom.btnTerminalActionsMenu, dom.terminalActionsDropdown],
  };
  const [button, dropdown] = mapping[key] || [];
  if (!button || !dropdown) return;
  const isOpen = activePanelActionsMenu === key && dropdown.style.display !== 'none';
  closeAllPanelActionMenus();
  if (isOpen) return;
  dropdown.style.display = 'flex';
  button.setAttribute('aria-expanded', 'true');
  activePanelActionsMenu = key;
}

function getBootOverlayLines() {
  const lang = localStorage.getItem('lang') === 'en' ? 'en' : 'ko';
  if (lang === 'en') {
    return ['Hello 👋🏻.', 'Preparing your screen....'];
  }
  return ['안녕하세요👋🏻.', '화면을 준비하고 있습니다....'];
}

async function typeBootOverlayLines(lines) {
  const targets = [dom.bootLine1, dom.bootLine2].filter(Boolean);
  targets.forEach(target => {
    target.textContent = '';
    target.classList.remove('is-typing');
  });
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] || '';
    const target = targets[lineIndex];
    if (!target) continue;
    target.classList.add('is-typing');
    for (const char of line) {
      target.textContent += char;
      await wait(BOOT_TYPING_INTERVAL);
    }
    if (lineIndex < lines.length - 1) {
      await wait(BOOT_MID_CARET_DURATION);
      target.classList.remove('is-typing');
      await wait(BOOT_LINE_PAUSE);
    } else {
      target.classList.remove('is-typing');
    }
  }
  const lastTarget = targets[targets.length - 1];
  lastTarget?.classList.add('is-typing');
}

function startBootOverlay() {
  if (!dom.bootOverlay) return;
  bootOverlayState.startedAt = Date.now();
  dom.bootOverlay.classList.remove('is-hidden');
  bootOverlayState.typingPromise = typeBootOverlayLines(getBootOverlayLines());
}

async function finishBootOverlay() {
  if (!dom.bootOverlay) return;
  await bootOverlayState.typingPromise;
  await wait(BOOT_AFTER_TYPING_DURATION);
  dom.bootOverlay.classList.add('is-hidden');
  setTimeout(() => {
    if (dom.bootOverlay?.classList.contains('is-hidden')) {
      dom.bootOverlay.style.display = 'none';
    }
  }, 260);
}

// ===== 앱 초기화 =====
async function init() {
  const savedDarkMode = localStorage.getItem('darkMode') === 'true';
  const savedLang = localStorage.getItem('lang') || 'ko';
  const savedFolder = localStorage.getItem('lastFolder');
  const savedWidth = parseInt(localStorage.getItem('sidebarWidth')) || 260;
  const savedViewMode = localStorage.getItem('viewMode') || 'split';
  const savedPanelOrder = localStorage.getItem('panelOrderV2') || localStorage.getItem('panelOrder') || 'editor-first';
  const savedPanelVisibility = localStorage.getItem('panelVisibility');
  const savedPanelSizes = localStorage.getItem('panelSizes');
  const savedLocationsOpen = localStorage.getItem('locationsOpen') !== 'false';
  const savedFavOpen = localStorage.getItem('favoritesOpen') !== 'false';
  const savedTreeOpen = localStorage.getItem('filetreeOpen') !== 'false';
  const savedRecentOpen = localStorage.getItem('recentOpen') !== 'false';
  const savedMemosOpen = localStorage.getItem('memosOpen') !== 'false';
  const savedFavoriteSortMode = localStorage.getItem('favoriteSortMode') || 'custom';
  const savedSectionOrder = localStorage.getItem('sectionOrder');
  const savedRecentFiles = localStorage.getItem('recentFiles');
  const savedFileOperationConfirmPrefs = localStorage.getItem(FILE_OPERATION_CONFIRM_STORAGE_KEY);
  const savedPinnedPanelActions = localStorage.getItem(PANEL_PINNED_ACTIONS_STORAGE_KEY);
  toggleDarkMode(savedDarkMode);
  setSidebarWidth(savedWidth);
  state.panelOrder = normalizePanelOrder(savedPanelOrder);
  if (savedPanelVisibility) {
    try {
      state.panelVisibility = { ...state.panelVisibility, ...JSON.parse(savedPanelVisibility) };
    } catch(e) {}
  }
  if (savedPanelSizes) {
    try { state.panelSizes = JSON.parse(savedPanelSizes); } catch(e) {}
  }
  setPanelOrder(state.panelOrder);
  setViewMode(savedViewMode, { preserveCustom: true });
  state.isLocationsOpen = savedLocationsOpen;
  state.isFavoritesOpen = savedFavOpen;
  state.isFileTreeOpen = savedTreeOpen;
  state.isRecentOpen = savedRecentOpen;
  state.isMemosOpen = savedMemosOpen;
  state.favoriteSortMode = ['custom', 'name', 'recent'].includes(savedFavoriteSortMode) ? savedFavoriteSortMode : 'custom';
  if (savedSectionOrder) {
    try { state.sectionOrder = JSON.parse(savedSectionOrder); } catch(e) {}
  }
  if (localStorage.getItem(SECTION_ORDER_DEFAULT_STORAGE_KEY) !== 'true') {
    state.sectionOrder = [...DEFAULT_SECTION_ORDER];
    localStorage.setItem('sectionOrder', JSON.stringify(state.sectionOrder));
    localStorage.setItem(SECTION_ORDER_DEFAULT_STORAGE_KEY, 'true');
  }
  state.sectionOrder = normalizeSectionOrder(state.sectionOrder);
  if (savedRecentFiles) {
    try { state.recentFiles = JSON.parse(savedRecentFiles); } catch(e) {}
  }
  if (savedFileOperationConfirmPrefs) {
    try {
      state.fileOperationConfirmPrefs = {
        ...state.fileOperationConfirmPrefs,
        ...JSON.parse(savedFileOperationConfirmPrefs)
      };
    } catch(e) {}
  }
  if (savedPinnedPanelActions) {
    try {
      state.pinnedPanelActions = normalizePinnedPanelActions(JSON.parse(savedPinnedPanelActions));
    } catch (e) {}
  }
  applySectionOrder();
  updateLocationsToggle();
  updateFavoritesToggle();
  updateFileTreeToggle();
  updateRecentToggle();
  updateMemosToggle();
  renderRecentFiles();
  // 언어 초기화
  state.lang = savedLang;
  dom.langLabel.textContent = savedLang === 'ko' ? 'KO' : 'EN';
  document.querySelectorAll('.lang-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === savedLang);
  });
  await loadLocations();
  // 즐겨찾기 불러오기
  await loadFavorites();
  // 전체 메모 불러오기
  await loadAllMemos();
  setupEventListeners();
  setupSectionDragAndDrop();
  setupPanelDragAndDrop();
  setupPanelResizeHandle();
  // 홈 탭 초기화
  initHomeTab();
  // i18n 적용
  applyI18n();
  renderAllPinnedPanelActions();
  updateFolderNavigationButtons();
  if (savedFolder) {
    await openFolder(savedFolder);
  }
}

// ===== 이벤트 리스너 =====
function setupEventListeners() {
  dom.btnOpenFolder.addEventListener('click', handleOpenFolder);
  dom.btnFolderBack?.addEventListener('click', navigateFolderBack);
  dom.btnFolderForward?.addEventListener('click', navigateFolderForward);
  dom.btnWelcomeOpen?.addEventListener('click', handleOpenFolder);
  dom.btnDarkMode.addEventListener('click', () => toggleDarkMode());
  // 언어 선택
  dom.btnLang.addEventListener('click', (e) => { e.stopPropagation(); toggleLangDropdown(); });
  document.querySelectorAll('.lang-option').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#lang-selector')) closeLangDropdown();
    if (!e.target.closest('.panel-actions-menu')) closeAllPanelActionMenus();
    if (!e.target.closest('.pinned-action-context-menu')) closePinnedActionContextMenu();
  });
  // 검색창 항상 표시 - 입력 시 결과 표시
  dom.searchInput.addEventListener('focus', () => {
    if (dom.searchInput.value.trim()) handleSearch();
  });
  dom.btnViewToggle.addEventListener('click', cycleViewMode);
  dom.btnCloseAllTabs?.addEventListener('click', closeAllTabs);
  dom.btnToggleEditor?.addEventListener('click', () => toggleWorkspacePanel('editor'));
  dom.btnTogglePreview?.addEventListener('click', () => toggleWorkspacePanel('preview'));
  dom.btnToggleTerminal?.addEventListener('click', () => toggleWorkspacePanel('terminal'));
  dom.btnEditorActionsMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanelActionsMenu('editor');
  });
  dom.btnPreviewActionsMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanelActionsMenu('preview');
  });
  dom.btnTerminalActionsMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanelActionsMenu('terminal');
  });
  dom.btnTerminalActionsMenu?.addEventListener('mousedown', () => captureEmbeddedTerminalSelection());
  dom.btnTerminalCopy?.addEventListener('mousedown', () => captureEmbeddedTerminalSelection());
  dom.btnTerminalInsertFile?.addEventListener('click', () => handleInsertTerminalPaths('file'));
  dom.btnTerminalInsertFolder?.addEventListener('click', () => handleInsertTerminalPaths('folder'));
  dom.btnTerminalCopy?.addEventListener('click', () => { void copyEmbeddedTerminalSelection(); });
  dom.btnTerminalPaste?.addEventListener('click', openTerminalPasteModal);
  dom.btnTerminalRestart?.addEventListener('click', () => restartTerminal());
  dom.btnTerminalStop?.addEventListener('click', () => stopTerminal());
  dom.btnDetachEditor?.addEventListener('click', () => detachPanel('editor'));
  dom.btnDetachPreview?.addEventListener('click', () => detachPanel('preview'));
  dom.btnDetachTerminal?.addEventListener('click', () => detachPanel('terminal'));
  document.querySelectorAll('.panel-dropdown-item').forEach(button => {
    if (button.closest('#terminal-actions-dropdown')) {
      button.addEventListener('mousedown', () => captureEmbeddedTerminalSelection());
    }
    button.addEventListener('click', () => closeAllPanelActionMenus());
  });
  initPanelActionPinControls();
  document.getElementById('btn-swap-panels')?.addEventListener('click', swapPanels);
  dom.editor.addEventListener('input', handleEditorInput);
  dom.editor.addEventListener('input', debounce(() => renderMarkdown(dom.editor.value), 150));
  dom.editor.addEventListener('mouseup', handleEditorSelectionSync);
  dom.editor.addEventListener('keyup', handleEditorSelectionSync);
  dom.editor.addEventListener('select', handleEditorSelectionSync);
  dom.previewContent.addEventListener('mouseup', handlePreviewSelectionSync);
  document.addEventListener('mousedown', handleSelectionSyncPointerDown);
  dom.fileTree.addEventListener('dragover', handleFileTreeRootDragOver);
  dom.fileTree.addEventListener('dragleave', handleFileTreeRootDragLeave);
  dom.fileTree.addEventListener('drop', handleFileTreeRootDrop);
  setupTerminalDropTargets();
  dom.searchInput.addEventListener('input', debounce(handleSearch, 300));
  dom.btnClearSearch.addEventListener('click', clearSearch);
  document.addEventListener('keydown', handleKeydown);
  setupResizeHandle();

  // 즐겨찾기 토글
  dom.locationsHeader?.addEventListener('click', (e) => {
    if (e.target.closest('.drag-handle, .section-action-btn')) return;
    state.isLocationsOpen = !state.isLocationsOpen;
    updateLocationsToggle();
    localStorage.setItem('locationsOpen', state.isLocationsOpen);
  });
  dom.btnRefreshLocations?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await loadLocations(true);
  });
  dom.btnFavoritesSort?.addEventListener('click', showFavoritesSortMenu);
  dom.favoritesHeader.addEventListener('click', toggleFavoritesSection);
  dom.filetreeHeader.addEventListener('click', toggleFileTreeSection);
  dom.btnRefreshFolder?.addEventListener('click', refreshCurrentFolder);
  // 메모 섹션 토글
  dom.memosHeader?.addEventListener('click', (e) => {
    if (e.target.closest('.drag-handle')) return;
    state.isMemosOpen = !state.isMemosOpen;
    updateMemosToggle();
    localStorage.setItem('memosOpen', state.isMemosOpen);
  });

  // 패널 액션 버튼
  dom.btnCopyAll.addEventListener('click', copyAllContent);
  dom.btnRefreshFile?.addEventListener('click', refreshCurrentFile);
  dom.btnUndo.addEventListener('click', editorUndo);
  dom.btnRedo.addEventListener('click', editorRedo);
  dom.btnSave.addEventListener('click', saveCurrentFile);
  dom.btnApplyMemos?.addEventListener('click', applyMemosToCurrentFile);
  dom.btnExportMemos.addEventListener('click', exportMemos);
  document.getElementById('btn-reveal-in-tree')?.addEventListener('click', () => {
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (tab && tab.path) revealFileInTree(tab.path);
  });
  document.getElementById('btn-fav-current')?.addEventListener('click', () => {
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (tab && tab.path) toggleFavorite({ type: 'file', path: tab.path, name: tab.name });
  });

  // 메모 패널
  dom.memoPanelClose.addEventListener('click', closeMemoPanel);
  dom.btnMemoSave.addEventListener('click', saveMemo);
  dom.btnMemoDelete.addEventListener('click', deleteMemo);

  // 최근 본 파일 섹션 토글
  dom.recentHeader.addEventListener('click', (e) => {
    if (e.target.closest('.drag-handle')) return;
    state.isRecentOpen = !state.isRecentOpen;
    localStorage.setItem('recentOpen', state.isRecentOpen);
    updateRecentToggle();
  });

  // 홈 탭 MD 저장
  document.getElementById('btn-save-home-md').addEventListener('click', saveHomeTabAsMd);

  // 경로 복사 버튼
  if (dom.btnCopyPath) {
    dom.btnCopyPath.addEventListener('click', copyCurrentPath);
  }
  // 이름 변경 모달
  if (dom.renameModalClose) dom.renameModalClose.addEventListener('click', closeRenameModal);
  if (dom.btnRenameCancel) dom.btnRenameCancel.addEventListener('click', closeRenameModal);
  if (dom.btnRenameConfirm) dom.btnRenameConfirm.addEventListener('click', confirmRename);
  if (dom.renameInput) {
    dom.renameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmRename();
      }
    });
  }
  if (dom.renameModal) dom.renameModal.addEventListener('click', (e) => { if (e.target === dom.renameModal) closeRenameModal(); });
  if (dom.terminalPasteClose) dom.terminalPasteClose.addEventListener('click', closeTerminalPasteModal);
  if (dom.btnTerminalPasteCancel) dom.btnTerminalPasteCancel.addEventListener('click', closeTerminalPasteModal);
  if (dom.btnTerminalPasteConfirm) dom.btnTerminalPasteConfirm.addEventListener('click', () => { void confirmTerminalPasteModal(); });
  if (dom.terminalPasteInput) {
    dom.terminalPasteInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void confirmTerminalPasteModal();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTerminalPasteModal();
      }
    });
  }
  if (dom.terminalPasteModal) dom.terminalPasteModal.addEventListener('click', (e) => { if (e.target === dom.terminalPasteModal) closeTerminalPasteModal(); });
  // 아이템 정보 모달
  if (dom.itemInfoClose) dom.itemInfoClose.addEventListener('click', closeItemInfoModal);
  if (dom.itemInfoModal) dom.itemInfoModal.addEventListener('click', (e) => { if (e.target === dom.itemInfoModal) closeItemInfoModal(); });
  // About 모달
  dom.btnAbout.addEventListener('click', openAboutModal);
  dom.aboutClose.addEventListener('click', closeAboutModal);
  dom.aboutModal.addEventListener('click', (e) => {
    if (e.target === dom.aboutModal) closeAboutModal();
  });

  // Electron IPC 이벤트
  window.electronAPI.onFolderOpened(path => openFolder(path));
  window.electronAPI.onFileOpened(path => openFile(path));
  window.electronAPI.onSaveFile(() => saveCurrentFile());
  window.electronAPI.onToggleDarkMode(() => toggleDarkMode());
  window.electronAPI.onEditorUndo(() => editorUndo());
  window.electronAPI.onEditorRedo(() => editorRedo());
  window.electronAPI.onCopyAllContent(() => copyAllContent());
  window.electronAPI.onExportMemos(() => exportMemos());
  window.electronAPI.onAppCloseRequested(() => handleAppClose());
  window.electronAPI.onDetachedPanelReady((panel) => {
    state.detachedPanels[panel] = true;
    if (panel === 'terminal') state.terminalInputActive = false;
    sendDetachedPanelState(panel);
  });
  window.electronAPI.onDetachedPanelClosed((panel) => {
    state.detachedPanels[panel] = false;
    state.panelVisibility[panel] = true;
    syncPanelLayout();
    if (panel === 'terminal') {
      state.terminalInputActive = true;
      requestAnimationFrame(() => setTimeout(() => focusEmbeddedTerminalInput(), 0));
    }
  });
  window.electronAPI.onDetachedEditorInput((content) => {
    if (dom.editor.value === content) return;
    dom.editor.value = content;
    handleEditorInput();
    renderMarkdown(content);
    sendDetachedPanelState('editor');
  });
}

// ===== 앱 종료 처리 =====
async function handleAppClose() {
  const closeConfirm = await window.electronAPI.showCloseConfirmDialog(state.lang || 'ko');
  if (!closeConfirm?.confirmed) return;

  // 미저장 탭 확인
  const unsavedTabs = state.tabs.filter(t => t.modified);
  if (unsavedTabs.length === 0) {
    window.electronAPI.confirmClose();
    return;
  }

  // 미저장 탭이 여러 개면 첫 번째부터 순서대로 처리
  for (const tab of unsavedTabs) {
    const result = await window.electronAPI.showUnsavedDialog(tab.name);
    if (result.button === 0) {
      // 저장
      await window.electronAPI.writeFile(tab.path, tab.content);
    } else if (result.button === 2) {
      // 취소 - 종료 중단
      return;
    }
    // button === 1: 저장하지 않음 → 계속
  }

  window.electronAPI.confirmClose();
}

// ===== 폴더 열기 =====
async function handleOpenFolder() {
  const result = await window.electronAPI.openFolderDialog();
  if (result.success) await openFolder(result.path);
}

async function openFolder(folderPath, options = {}) {
  const { skipHistory = false } = options;
  const s = i18nStrings[state.lang || 'ko'];
  if (isUnsafeRootFolder(folderPath)) {
    showToast(s.rootFolderBlocked, 3500);
    return;
  }
  const previousFolder = state.currentFolder;
  if (!skipHistory && previousFolder && previousFolder !== folderPath) {
    state.folderBackStack.push(previousFolder);
    state.folderForwardStack = [];
  }

  state.currentFolder = folderPath;
  const folderName = folderPath.split('/').pop() || folderPath;
  dom.folderName.textContent = folderName;
  dom.folderName.title = folderPath;
  localStorage.setItem('lastFolder', folderPath);
  updateFolderNavigationButtons();

  const result = await window.electronAPI.readDirectory(folderPath);
  if (result.success) {
    renderFileTree(result.items);
    updateActiveFileInTree(state.currentFile || '');
    renderLocations();
  } else {
    dom.fileTree.innerHTML = `<div class="empty-state"><p>폴더를 읽을 수 없습니다</p></div>`;
  }
}

function isUnsafeRootFolder(folderPath) {
  return folderPath === '/' || folderPath === '/Volumes';
}

async function navigateFolderBack() {
  if (state.folderBackStack.length === 0) return;
  const targetFolder = state.folderBackStack.pop();
  if (state.currentFolder) state.folderForwardStack.push(state.currentFolder);
  await openFolder(targetFolder, { skipHistory: true });
}

async function navigateFolderForward() {
  if (state.folderForwardStack.length === 0) return;
  const targetFolder = state.folderForwardStack.pop();
  if (state.currentFolder) state.folderBackStack.push(state.currentFolder);
  await openFolder(targetFolder, { skipHistory: true });
}

function updateFolderNavigationButtons() {
  if (dom.btnFolderBack) {
    const canGoBack = state.folderBackStack.length > 0;
    dom.btnFolderBack.disabled = !canGoBack;
    dom.btnFolderBack.classList.toggle('btn-disabled', !canGoBack);
  }
  if (dom.btnFolderForward) {
    const canGoForward = state.folderForwardStack.length > 0;
    dom.btnFolderForward.disabled = !canGoForward;
    dom.btnFolderForward.classList.toggle('btn-disabled', !canGoForward);
  }
}

async function refreshCurrentFolder(e) {
  e?.preventDefault();
  e?.stopPropagation();
  const s = i18nStrings[state.lang || 'ko'];
  if (!state.currentFolder) {
    showToast(s.noFolderToRefresh);
    return;
  }

  const openedDirs = getOpenDirectoryPaths();
  dom.btnRefreshFolder?.classList.add('refreshing');
  const result = await window.electronAPI.readDirectory(state.currentFolder);
  dom.btnRefreshFolder?.classList.remove('refreshing');

  if (result.success) {
    renderFileTree(result.items);
    restoreOpenDirectoryPaths(openedDirs);
    updateActiveFileInTree(state.currentFile || '');
    showToast(s.folderRefreshed);
  } else {
    showToast(s.folderRefreshFailed, 3000);
  }
}

function getOpenDirectoryPaths() {
  return Array.from(dom.fileTree.querySelectorAll('.tree-item.directory.open'))
    .map(el => el.querySelector('.tree-item-fav-btn')?.dataset.path)
    .filter(Boolean);
}

function restoreOpenDirectoryPaths(paths) {
  const openSet = new Set(paths);
  dom.fileTree.querySelectorAll('.tree-item.directory').forEach(dirEl => {
    const dirPath = dirEl.querySelector('.tree-item-fav-btn')?.dataset.path;
    if (dirPath && openSet.has(dirPath)) {
      setTreeDirectoryOpen(dirEl, true);
    }
  });
}

function setTreeDirectoryOpen(dirEl, isOpen) {
  const childContainer = dirEl.nextElementSibling;
  if (childContainer && childContainer.classList.contains('tree-children')) {
    childContainer.classList.toggle('open', isOpen);
  }
  dirEl.classList.toggle('open', isOpen);
  const icon = dirEl.querySelector('.tree-item-icon svg');
  if (icon) {
    icon.innerHTML = isOpen
      ? '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>'
      : '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>';
  }
}

// ===== 파일 트리 렌더링 =====
function renderFileTree(items, container = dom.fileTree, depth = 0) {
  const s = i18nStrings[state.lang || 'ko'];
  if (depth === 0) container.innerHTML = '';

  if (items.length === 0 && depth === 0) {
    container.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <p>${s.noMdFiles}</p>
    </div>`;
    return;
  }

  for (const item of items) {
    const el = document.createElement('div');
    el.style.paddingLeft = `${42 + depth * 14}px`;

    if (item.type === 'directory') {
      el.className = 'tree-item directory';
      el.dataset.path = item.path;
      el.dataset.name = item.name;
      el.dataset.type = item.type;
      el.draggable = true;
      const isFav = isFavorite(item.path);
      el.innerHTML = `
        <span class="tree-item-chevron">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </span>
        <span class="tree-item-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <span class="tree-item-name">${escapeHtml(item.name)}</span>
        <button class="tree-item-copy-btn" data-path="${escapeHtml(item.path)}" data-type="directory" data-name="${escapeHtml(item.name)}" title="${s.copyFolderPath}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="tree-item-fav-btn ${isFav ? 'starred' : ''}" data-path="${escapeHtml(item.path)}" data-type="directory" data-name="${escapeHtml(item.name)}" title="${isFav ? '즐겨찾기 제거' : '즐겨찾기 추가'}">★</button>
      `;

      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';

      setupTreeItemDrag(el, item);
      setupTreeDirectoryDrop(el, item);

      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureTreeItemSelectedForContextMenu(item);
        showContextMenu(e, { type: 'directory', path: item.path, name: item.name });
      });
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tree-item-fav-btn, .tree-item-copy-btn')) return;
        if (handleTreeSelectionClick(e, item)) return;
        setTreeSelection([item]);
        const isOpen = childContainer.classList.contains('open');
        setTreeDirectoryOpen(el, !isOpen);
      });

      el.querySelector('.tree-item-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        copyItemPath({ type: 'directory', path: btn.dataset.path, name: btn.dataset.name });
      });

      // 즐겨찾기 버튼
      el.querySelector('.tree-item-fav-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        toggleFavorite({ type: 'directory', path: btn.dataset.path, name: btn.dataset.name });
      });

      container.appendChild(el);
      container.appendChild(childContainer);

      if (item.children && item.children.length > 0) {
        renderFileTree(item.children, childContainer, depth + 1);
      }
    } else {
      el.className = 'tree-item file';
      el.dataset.path = item.path;
      el.dataset.name = item.name;
      el.dataset.type = item.type;
      el.draggable = true;
      const isFav = isFavorite(item.path);
      el.innerHTML = `
        <span class="tree-item-chevron tree-item-chevron-placeholder"></span>
        <span class="tree-item-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </span>
        <span class="tree-item-name">${escapeHtml(item.name)}</span>
        <button class="tree-item-copy-btn" data-path="${escapeHtml(item.path)}" data-type="file" data-name="${escapeHtml(item.name)}" title="${s.copyFilePath}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        <button class="tree-item-fav-btn ${isFav ? 'starred' : ''}" data-path="${escapeHtml(item.path)}" data-type="file" data-name="${escapeHtml(item.name)}" title="${isFav ? '즐겨찾기 제거' : '즐겨찾기 추가'}">★</button>
      `;

      setupTreeItemDrag(el, item);

      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureTreeItemSelectedForContextMenu(item);
        showContextMenu(e, { type: 'file', path: item.path, name: item.name });
      });
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tree-item-fav-btn, .tree-item-copy-btn')) return;
        if (handleTreeSelectionClick(e, item)) return;
        setTreeSelection([item]);
        openFile(item.path);
      });

      el.querySelector('.tree-item-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        copyItemPath({ type: 'file', path: btn.dataset.path, name: btn.dataset.name });
      });

      el.querySelector('.tree-item-fav-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        toggleFavorite({ type: 'file', path: btn.dataset.path, name: btn.dataset.name });
      });

      container.appendChild(el);
    }
  }

  if (depth === 0) updateTreeSelectionUI();
}

function setupTreeItemDrag(el, item) {
  el.addEventListener('dragstart', (e) => {
    if (e.target.closest('.tree-item-fav-btn, .tree-item-copy-btn')) {
      e.preventDefault();
      return;
    }
    if (!isTreeItemSelected(item.path)) setTreeSelection([item]);
    const selectedItems = getSelectedTreeItems();
    state.draggedTreeItem = selectedItems.length > 1
      ? { type: 'selection', path: item.path, name: `${selectedItems.length}개 항목`, items: selectedItems }
      : { type: item.type, path: item.path, name: item.name, items: [item] };
    state.draggedTerminalPaths = selectedItems.map(selected => selected.path);
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copyMove';
    setTerminalDragData(e.dataTransfer, selectedItems.map(selected => selected.path));
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    clearTreeDropTargets();
    state.draggedTreeItem = null;
    state.draggedTerminalPaths = [];
  });
}

function handleTreeSelectionClick(e, item) {
  if (e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    selectTreeRange(item);
    return true;
  }
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
    toggleTreeSelection(item);
    return true;
  }
  return false;
}

function setTreeSelection(items) {
  state.selectedTreeItems = dedupeTreeItems(items);
  state.lastSelectedTreePath = state.selectedTreeItems[0]?.path || null;
  updateTreeSelectionUI();
}

function toggleTreeSelection(item) {
  const exists = state.selectedTreeItems.some(selected => selected.path === item.path);
  state.selectedTreeItems = exists
    ? state.selectedTreeItems.filter(selected => selected.path !== item.path)
    : dedupeTreeItems([...state.selectedTreeItems, item]);
  state.lastSelectedTreePath = item.path;
  updateTreeSelectionUI();
}

function selectTreeRange(item) {
  const rows = getVisibleTreeRows();
  const targetIndex = rows.findIndex(row => row.dataset.path === item.path);
  const anchorPath = state.lastSelectedTreePath || state.selectedTreeItems[0]?.path || item.path;
  const anchorIndex = rows.findIndex(row => row.dataset.path === anchorPath);
  if (targetIndex < 0 || anchorIndex < 0) {
    setTreeSelection([item]);
    return;
  }

  const [start, end] = targetIndex > anchorIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
  state.selectedTreeItems = rows.slice(start, end + 1).map(getTreeItemFromElement).filter(Boolean);
  state.lastSelectedTreePath = anchorPath;
  updateTreeSelectionUI();
}

function ensureTreeItemSelectedForContextMenu(item) {
  if (!isTreeItemSelected(item.path)) setTreeSelection([item]);
}

function isTreeItemSelected(itemPath) {
  return state.selectedTreeItems.some(item => item.path === itemPath);
}

function getSelectedTreeItems() {
  const visiblePaths = new Set(
    getVisibleTreeRows().map(row => row.dataset.path)
  );
  state.selectedTreeItems = state.selectedTreeItems.filter(item => visiblePaths.has(item.path));
  return state.selectedTreeItems;
}

function getVisibleTreeRows() {
  return Array.from(dom.fileTree.querySelectorAll('.tree-item[data-path]'))
    .filter(row => row.offsetParent !== null);
}

function getTreeItemFromElement(el) {
  if (!el?.dataset?.path) return null;
  return { type: el.dataset.type, path: el.dataset.path, name: el.dataset.name || getBaseName(el.dataset.path) };
}

function dedupeTreeItems(items) {
  const map = new Map();
  items.forEach(item => {
    if (item?.path) map.set(item.path, item);
  });
  return Array.from(map.values());
}

function updateTreeSelectionUI() {
  const selectedPaths = new Set(state.selectedTreeItems.map(item => item.path));
  dom.fileTree.querySelectorAll('.tree-item[data-path]').forEach(row => {
    row.classList.toggle('selected', selectedPaths.has(row.dataset.path));
  });
}

function setupTreeDirectoryDrop(el, directoryItem) {
  el.addEventListener('dragover', (e) => {
    if (!isValidMoveTarget(state.draggedTreeItem, directoryItem.path)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    clearTreeDropTargets();
    el.classList.add('drop-target');
  });

  el.addEventListener('dragleave', (e) => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('drop-target');
  });

  el.addEventListener('drop', async (e) => {
    if (!isValidMoveTarget(state.draggedTreeItem, directoryItem.path)) return;
    e.preventDefault();
    e.stopPropagation();
    const draggedItem = state.draggedTreeItem;
    clearTreeDropTargets();
    await moveTreeItem(draggedItem, directoryItem.path, directoryItem.name);
  });
}

function handleFileTreeRootDragOver(e) {
  if (!state.currentFolder || !isValidMoveTarget(state.draggedTreeItem, state.currentFolder)) return;
  if (e.target.closest('.tree-item.directory')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  dom.fileTree.classList.add('drop-target');
}

function handleFileTreeRootDragLeave(e) {
  if (!dom.fileTree.contains(e.relatedTarget)) {
    dom.fileTree.classList.remove('drop-target');
  }
}

async function handleFileTreeRootDrop(e) {
  if (!state.currentFolder || !isValidMoveTarget(state.draggedTreeItem, state.currentFolder)) return;
  if (e.target.closest('.tree-item.directory')) return;
  e.preventDefault();
  const draggedItem = state.draggedTreeItem;
  const targetName = state.currentFolder.split('/').pop() || state.currentFolder;
  clearTreeDropTargets();
  await moveTreeItem(draggedItem, state.currentFolder, targetName);
}

function clearTreeDropTargets() {
  dom.fileTree.classList.remove('drop-target');
  dom.fileTree.querySelectorAll('.tree-item.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function clearTerminalDropTargets() {
  dom.terminalPanel?.classList.remove('drop-target');
  dom.terminalContainer?.classList.remove('drop-target');
  dom.btnToggleTerminal?.classList.remove('drop-target');
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
  if (state.draggedTerminalPaths?.length) return true;
  if (!dataTransfer) return false;
  if ((dataTransfer.files?.length || 0) > 0) return true;
  if (Array.from(dataTransfer.items || []).some(item => item.kind === 'file')) return true;
  const types = Array.from(dataTransfer.types || []);
  if (types.includes('Files')) return true;
  if (types.some(type => /uri-list|file-url/i.test(type))) return true;
  return !!dataTransfer.getData('application/x-mdviewer-paths') || !!dataTransfer.getData('text/plain');
}

function isPointerInsideElement(clientX, clientY, element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function applyTerminalDropHighlight({ overPanel = false, overButton = false } = {}) {
  clearTerminalDropTargets();
  if (overPanel) {
    dom.terminalPanel?.classList.add('drop-target');
    dom.terminalContainer?.classList.add('drop-target');
  }
  if (overButton) {
    dom.btnToggleTerminal?.classList.add('drop-target');
  }
}

async function commitTerminalDrop(droppedPaths) {
  if (!droppedPaths.length) return;
  clearTerminalDropTargets();
  await insertPathsIntoInternalTerminal(droppedPaths);
  state.draggedTreeItem = null;
  state.draggedFavoritePath = null;
  state.draggedTerminalPaths = [];
  clearTreeDropTargets();
  clearFavoriteDropIndicators();
}

function setupTerminalDropTargets() {
  document.addEventListener('dragover', (event) => {
    if (!hasTerminalDroppableData(event.dataTransfer)) return;

    const overVisiblePanel = state.panelVisibility.terminal && isPointerInsideElement(event.clientX, event.clientY, dom.terminalPanel);
    const overToggleButton = isPointerInsideElement(event.clientX, event.clientY, dom.btnToggleTerminal);

    if (!overVisiblePanel && !overToggleButton) {
      clearTerminalDropTargets();
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    applyTerminalDropHighlight({
      overPanel: overVisiblePanel,
      overButton: !overVisiblePanel && overToggleButton
    });
  }, true);

  document.addEventListener('dragleave', (event) => {
    if (event.relatedTarget) return;
    clearTerminalDropTargets();
  }, true);

  document.addEventListener('drop', async (event) => {
    const overVisiblePanel = state.panelVisibility.terminal && isPointerInsideElement(event.clientX, event.clientY, dom.terminalPanel);
    const overToggleButton = isPointerInsideElement(event.clientX, event.clientY, dom.btnToggleTerminal);
    if (!overVisiblePanel && !overToggleButton) return;

    event.preventDefault();
    event.stopPropagation();
    const droppedPaths = getDraggedPathsFromDataTransfer(event.dataTransfer);
    if (!droppedPaths.length) return;
    await commitTerminalDrop(droppedPaths);
  }, true);

  window.addEventListener('dragover', (event) => {
    if (!hasTerminalDroppableData(event.dataTransfer)) return;
    event.preventDefault();
  }, true);

  window.addEventListener('drop', (event) => {
    if (!hasTerminalDroppableData(event.dataTransfer)) return;
    event.preventDefault();
  }, true);
}

function isValidMoveTarget(item, targetDirPath) {
  if (!item || !targetDirPath) return false;
  if (item.type === 'selection') {
    const items = item.items || [];
    return items.length > 0 && items.every(selectedItem => isValidMoveTarget(selectedItem, targetDirPath));
  }
  if (getParentPath(item.path) === targetDirPath) return false;
  if (item.type === 'directory' && (item.path === targetDirPath || isSameOrChildPath(item.path, targetDirPath))) return false;
  return true;
}

// ===== 파일 열기 =====
async function openFile(filePath) {
  const existingTab = state.tabs.find(t => t.path === filePath);
  if (existingTab) {
    activateTab(existingTab.id);
    return;
  }

  const result = await window.electronAPI.readFile(filePath);
  if (!result.success) return;

  const fileName = filePath.split('/').pop();
  const tabId = Date.now().toString();

  const tab = {
    id: tabId,
    path: filePath,
    name: fileName,
    content: result.content,
    modified: false
  };

  state.tabs.push(tab);
  state.undoStacks[tabId] = [result.content];
  state.redoStacks[tabId] = [];
  state.lastSavedContent[tabId] = result.content;
  addRecentFile(filePath, fileName);
  renderRecentFiles();
  activateTab(tabId); // activateTab 내부에서 renderTabs 호출됨
}

// ===== 탭 렌더링 =====
function renderTabs() {
  dom.tabsList.innerHTML = '';
  for (const tab of state.tabs) {
    const isHome = tab.id === HOME_TAB_ID;
    const el = document.createElement('div');
    el.className = `tab-item${tab.id === state.activeTabId ? ' active' : ''}${tab.modified ? ' modified' : ''}${isHome ? ' home-tab' : ''}`;
    el.dataset.tabId = tab.id;
    if (isHome) {
      el.innerHTML = `
        <span class="tree-item-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </span>
        <span class="tab-item-name">${escapeHtml(tab.name)}</span>
      `;
    } else {
      el.innerHTML = `
        <span class="tree-item-icon">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </span>
        <span class="tab-item-name">${escapeHtml(tab.name)}</span>
        <button class="tab-item-close" data-tab-id="${tab.id}">✕</button>
      `;
      el.querySelector('.tab-item-close').addEventListener('click', async (e) => {
        e.stopPropagation();
        await closeTab(tab.id);
      });
    }
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.tab-item-close')) activateTab(tab.id);
    });
    dom.tabsList.appendChild(el);
  }
  updateCloseAllTabsButton();
}

// ===== 탭 활성화 =====
async function activateTab(tabId) {
  const s = i18nStrings[state.lang || 'ko'];
  state.activeTabId = tabId;
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;
  state.currentFile = tab.path || null;
  dom.editor.value = tab.content;
  if (tab.id === HOME_TAB_ID) {
    renderMarkdown(tab.content);
    updateTitlebar('MDViewer');
    dom.statusPath.textContent = '';
    dom.statusInfo.textContent = s.homeTabHint;
    updateToolbarForHomeTab(true);
    const btnExportMemos = document.getElementById('btn-export-memos');
    if (btnExportMemos) btnExportMemos.style.display = 'none';
    const btnApplyMemos = document.getElementById('btn-apply-memos');
    if (btnApplyMemos) btnApplyMemos.style.display = 'none';
    // 홈 탭: 즐겨찾기/위치보기 버튼 숨김
    updatePreviewHeaderButtons(null);
  } else {
    // 메모를 먼저 로드한 후 렌더링 (노란 아이콘 정상 표시를 위해)
    await loadMemosForFile(tab.path);
    renderMarkdown(tab.content);
    updateTitlebar(tab.name);
    updateStatusBar(tab.path, tab.content);
    updateToolbarForHomeTab(false);
    const btnExportMemos = document.getElementById('btn-export-memos');
    if (btnExportMemos) btnExportMemos.style.display = '';
    const btnApplyMemos = document.getElementById('btn-apply-memos');
    if (btnApplyMemos) btnApplyMemos.style.display = isHtmlFilePath(tab.path) ? 'none' : '';
    // 일반 탭: 즐겨찾기/위치보기 버튼 표시 및 상태 업데이트
    updatePreviewHeaderButtons(tab);
    renderMemosSidebar();
  }
  updateUndoRedoButtons();
  renderTabs();
  updateActiveFileInTree(tab.path || '');
  closeMemoPanel();
  const activeTabEl = dom.tabsList.querySelector(`[data-tab-id="${tabId}"]`);
  if (activeTabEl) activeTabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  syncDetachedPanels();
}

// ===== 미리보기 헤더 버튼 상태 업데이트 =====
function updatePreviewHeaderButtons(tab) {
  const btnReveal = document.getElementById('btn-reveal-in-tree');
  const btnFav = document.getElementById('btn-fav-current');
  const btnFavIcon = document.getElementById('btn-fav-current-icon');
  const btnFavLabel = document.getElementById('btn-fav-current-label');
  if (dom.btnPreviewActionsMenu) dom.btnPreviewActionsMenu.style.display = tab ? '' : 'none';

  if (!tab) {
    if (btnReveal) btnReveal.style.display = 'none';
    if (btnFav) btnFav.style.display = 'none';
    renderPinnedPanelActions('preview');
    closeAllPanelActionMenus();
    return;
  }

  if (btnReveal) btnReveal.style.display = '';
  if (btnFav) btnFav.style.display = '';

  const starred = isFavorite(tab.path);
  const strings = i18nStrings[state.lang || 'ko'];
  if (btnFav) btnFav.title = starred ? strings.removeFavorite : strings.addFavorite;
  if (btnFavIcon) {
    btnFavIcon.setAttribute('fill', starred ? 'currentColor' : 'none');
    btnFavIcon.style.color = starred ? '#f5a623' : '';
  }
  if (btnFavLabel) btnFavLabel.textContent = starred ? strings.removeFavorite : strings.addFavorite;
  renderPinnedPanelActions('preview');
}

// ===== 탭 닫기 =====
async function closeTab(tabId) {
  if (tabId === HOME_TAB_ID) return true; // 홈 탭은 닫기 불가
  const idx = state.tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return true;

  const tab = state.tabs[idx];

  // 미저장 확인
  if (tab.modified) {
    const result = await window.electronAPI.showUnsavedDialog(tab.name);
    if (result.button === 0) {
      // 저장
      const saveResult = await window.electronAPI.writeFile(tab.path, tab.content);
      if (!saveResult.success) return false;
    } else if (result.button === 2) {
      // 취소
      return false;
    }
  }

  state.tabs.splice(idx, 1);
  delete state.undoStacks[tabId];
  delete state.redoStacks[tabId];
  delete state.lastSavedContent[tabId];

  if (state.activeTabId === tabId) {
    if (state.tabs.length > 0) {
      const newIdx = Math.min(idx, state.tabs.length - 1);
      await activateTab(state.tabs[newIdx].id);
    } else {
      // 다른 탭이 없으면 홈 탭으로 복귀
      await activateTab(HOME_TAB_ID);
    }
  }

  renderTabs();
  return true;
}

async function closeAllTabs() {
  const s = i18nStrings[state.lang || 'ko'];
  const closableTabs = state.tabs.filter(tab => tab.id !== HOME_TAB_ID);
  if (closableTabs.length === 0) {
    showToast(s.noTabsToClose);
    return;
  }

  for (const tab of closableTabs) {
    const closed = await closeTab(tab.id);
    if (!closed) return;
  }

  await activateTab(HOME_TAB_ID);
  showToast(s.allTabsClosed);
}

function updateCloseAllTabsButton() {
  if (!dom.btnCloseAllTabs) return;
  const hasClosableTabs = state.tabs.some(tab => tab.id !== HOME_TAB_ID);
  dom.btnCloseAllTabs.disabled = !hasClosableTabs;
  dom.btnCloseAllTabs.classList.toggle('btn-disabled', !hasClosableTabs);
}

// ===== Markdown 렌더링 =====
function renderMarkdown(content) {
  if (isHtmlFilePath(state.currentFile)) {
    renderHtmlPreview(content);
    return;
  }

  dom.previewContent.classList.remove('html-preview-mode');

  if (typeof window.marked === 'undefined') {
    dom.previewContent.innerHTML = `<div class="markdown-body"><pre>${escapeHtml(content)}</pre></div>`;
    sendDetachedPanelState('preview');
    return;
  }

  try {
    const html = window.marked.parse(content, {
      gfm: true,
      breaks: true,
      headerIds: true,
      mangle: false
    });

    dom.previewContent.innerHTML = `<div class="markdown-body fade-in">${html}</div>`;

    if (window.hljs) {
      dom.previewContent.querySelectorAll('pre code').forEach(block => {
        window.hljs.highlightElement(block);
      });
    }

    dom.previewContent.querySelectorAll('.markdown-body a[href]').forEach(anchor => {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    });

    // 체크박스 처리
    dom.previewContent.querySelectorAll('li').forEach(li => {
      const text = li.textContent;
      if (text.startsWith('[ ] ') || text.startsWith('[x] ') || text.startsWith('[X] ')) {
        const checked = text.startsWith('[x]') || text.startsWith('[X]');
        li.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''} disabled> ${li.innerHTML.replace(/^\[[ xX]\] /, '')}`;
      }
    });

    // 메모 아이콘 삽입
    injectMemoIcons();
    sendDetachedPanelState('preview');

  } catch (err) {
    dom.previewContent.innerHTML = `<div class="markdown-body"><pre>${escapeHtml(content)}</pre></div>`;
    sendDetachedPanelState('preview');
  }
}

function renderHtmlPreview(content) {
  try {
    dom.previewContent.classList.add('html-preview-mode');
    dom.previewContent.innerHTML = '';

    const frame = document.createElement('iframe');
    frame.className = 'html-preview-frame fade-in';
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.srcdoc = buildHtmlPreviewDocument(content, state.currentFile);
    dom.previewContent.appendChild(frame);
    sendDetachedPanelState('preview');
  } catch (err) {
    dom.previewContent.classList.remove('html-preview-mode');
    dom.previewContent.innerHTML = `<div class="markdown-body"><pre>${escapeHtml(content)}</pre></div>`;
    sendDetachedPanelState('preview');
  }
}

function buildHtmlPreviewDocument(content, filePath) {
  const baseHref = getFileBaseHref(filePath);
  const safeBase = baseHref
    ? `<base href="${escapeHtml(baseHref)}" target="_blank">`
    : '<base target="_blank">';
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline' file: data: http: https:; img-src file: data: http: https:; font-src file: data: http: https:; media-src file: data: http: https:; object-src 'none'; frame-src 'none'; form-action 'none';">`;
  const injectedHead = `${csp}${safeBase}`;
  const previewContent = stripHtmlCspMeta(content);

  if (/<head[\s>]/i.test(previewContent)) {
    return previewContent.replace(/<head([^>]*)>/i, `<head$1>${injectedHead}`);
  }

  if (/<html[\s>]/i.test(previewContent)) {
    return previewContent.replace(/<html([^>]*)>/i, `<html$1><head>${injectedHead}</head>`);
  }

  return `<!doctype html><html><head>${injectedHead}</head><body>${previewContent}</body></html>`;
}

function stripHtmlCspMeta(content) {
  return content.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
}

function getFileBaseHref(filePath) {
  if (!filePath || !filePath.includes('/')) return '';
  const dirPath = filePath.slice(0, filePath.lastIndexOf('/') + 1);
  return 'file://' + dirPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function isHtmlFilePath(filePath) {
  return !!filePath && HTML_FILE_RE.test(filePath);
}

// ===== 에디터/미리보기 선택 영역 동기화 =====
function handleEditorSelectionSync() {
  if (state.isSelectionSyncing || isHtmlFilePath(state.currentFile)) return;
  const selectedText = dom.editor.value
    .slice(dom.editor.selectionStart, dom.editor.selectionEnd)
    .trim();

  if (selectedText.length < SELECTION_SYNC_MIN_LENGTH) {
    clearPreviewSelectionHighlight();
    return;
  }

  state.isSelectionSyncing = true;
  highlightTextInPreview(selectedText);
  state.isSelectionSyncing = false;
}

function handlePreviewSelectionSync() {
  if (state.isSelectionSyncing || isHtmlFilePath(state.currentFile)) return;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  if (!dom.previewContent.contains(selection.anchorNode) || !dom.previewContent.contains(selection.focusNode)) return;

  const selectedText = selection.toString().trim();
  if (selectedText.length < SELECTION_SYNC_MIN_LENGTH) return;

  const range = findTextRangeInEditor(selectedText);
  if (!range) return;

  state.isSelectionSyncing = true;
  dom.editor.focus();
  dom.editor.setSelectionRange(range.start, range.end);
  scrollEditorToPosition(range.start);
  state.isSelectionSyncing = false;
}

function handleSelectionSyncPointerDown(e) {
  if (state.isSelectionSyncing) return;
  const clickedEditor = e.target === dom.editor;
  const clickedPreview = dom.previewContent.contains(e.target);

  if (!clickedEditor) {
    clearPreviewSelectionHighlight();
  }

  if (!clickedPreview) {
    clearPreviewNativeSelection();
  }
}

function highlightTextInPreview(text) {
  clearPreviewSelectionHighlight();
  const markdownBody = dom.previewContent.querySelector('.markdown-body');
  if (!markdownBody) return false;

  const range = findTextRangeInElement(markdownBody, text);
  if (!range) return false;

  const mark = document.createElement('mark');
  mark.className = 'selection-sync-highlight';
  try {
    range.surroundContents(mark);
    mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true;
  } catch (e) {
    return false;
  }
}

function clearPreviewSelectionHighlight() {
  dom.previewContent.querySelectorAll('.selection-sync-highlight').forEach(mark => {
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    parent.normalize();
  });
}

function clearPreviewNativeSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const anchorInPreview = selection.anchorNode && dom.previewContent.contains(selection.anchorNode);
  const focusInPreview = selection.focusNode && dom.previewContent.contains(selection.focusNode);
  if (anchorInPreview || focusInPreview) {
    selection.removeAllRanges();
  }
}

function findTextRangeInElement(root, searchText) {
  const normalizedSearch = normalizeSearchText(searchText);
  if (!normalizedSearch) return null;

  const map = buildTextNodeMap(root);
  const index = findNormalizedIndex(map.text, normalizedSearch);
  if (index < 0) return null;

  const startPoint = map.points[index];
  const endPoint = map.points[index + normalizedSearch.length - 1];
  if (!startPoint || !endPoint) return null;

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset + 1);
  return range;
}

function buildTextNodeMap(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('button, script, style, textarea, .memo-icon-btn')) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let text = '';
  const points = [];
  let lastWasSpace = true;
  let node;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue;
    for (let offset = 0; offset < value.length; offset++) {
      const char = value[offset];
      if (/\s/.test(char)) {
        if (!lastWasSpace) {
          text += ' ';
          points.push({ node, offset });
          lastWasSpace = true;
        }
      } else {
        text += char;
        points.push({ node, offset });
        lastWasSpace = false;
      }
    }
  }
  return { text: text.trim(), points };
}

function findTextRangeInEditor(searchText) {
  const content = dom.editor.value;
  const directIndex = content.indexOf(searchText);
  if (directIndex >= 0) return { start: directIndex, end: directIndex + searchText.length };

  const normalizedSearch = normalizeSearchText(searchText);
  const map = buildStringPositionMap(content);
  const index = findNormalizedIndex(map.text, normalizedSearch);
  if (index < 0) return null;

  const start = map.positions[index];
  const end = map.positions[index + normalizedSearch.length - 1] + 1;
  return { start, end };
}

function buildStringPositionMap(text) {
  let normalized = '';
  const positions = [];
  let lastWasSpace = true;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/\s/.test(char)) {
      if (!lastWasSpace) {
        normalized += ' ';
        positions.push(i);
        lastWasSpace = true;
      }
    } else {
      normalized += char;
      positions.push(i);
      lastWasSpace = false;
    }
  }
  return { text: normalized.trim(), positions };
}

function normalizeSearchText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function findNormalizedIndex(text, searchText) {
  const exactIndex = text.indexOf(searchText);
  if (exactIndex >= 0) return exactIndex;
  return text.toLowerCase().indexOf(searchText.toLowerCase());
}

function scrollEditorToPosition(position) {
  const contentBefore = dom.editor.value.slice(0, position);
  const line = contentBefore.split('\n').length - 1;
  const lineHeight = parseFloat(getComputedStyle(dom.editor).lineHeight) || 20;
  dom.editor.scrollTop = Math.max(0, line * lineHeight - dom.editor.clientHeight / 2);
}

// ===== 메모 아이콘 삽입 =====
function injectMemoIcons() {
  const s = i18nStrings[state.lang || 'ko'];
  if (!state.currentFile) return;
  const memos = state.memos[state.currentFile] || {};
  const markdownBody = dom.previewContent.querySelector('.markdown-body');
  if (!markdownBody) return;

  prepareSoftLineMemoTargets(markdownBody);
  prepareCodeLineMemoTargets(markdownBody);

  const targets = getMemoTargets(markdownBody);
  targets.forEach(({ el, lineKey }) => {
    if (!getMemoLinePreview(el)) return;
    const hasMemo = !!memos[lineKey];

    // 메모가 없는 요소는 hover CSS로만 처리 (DOM 최소화)
    if (!hasMemo) {
      if (!isSplitMemoParent(el)) {
        el.dataset.lineKey = lineKey;
        el.classList.add('memo-hoverable');
      }
      return;
    }

    const btn = document.createElement('button');
    setupMemoButton(btn, lineKey, s.editMemo, true);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMemoPanel(lineKey, getMemoLinePreview(el));
    });

    el.appendChild(btn);
  });

  // hover 시 메모 추가 버튼 표시 (event delegation)
  if (!markdownBody._memoHoverBound) {
    markdownBody._memoHoverBound = true;
    markdownBody.addEventListener('mouseenter', (e) => {
      const el = e.target.closest('.memo-hoverable');
      if (!el || el.querySelector('.memo-icon-btn')) return;
      const lineKey = el.dataset.lineKey;
      const btn = document.createElement('button');
      setupMemoButton(btn, lineKey, s.addMemo, false);
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openMemoPanel(lineKey, getMemoLinePreview(el));
      });
      el.appendChild(btn);
    }, true);
  }
}

function prepareSoftLineMemoTargets(markdownBody) {
  markdownBody.querySelectorAll('p:not([data-memo-soft-lines-ready]), li:not([data-memo-soft-lines-ready])').forEach(el => {
    if (!/<br\s*\/?>/i.test(el.innerHTML)) return;
    if (el.querySelector('ul, ol, table, pre, blockquote')) return;

    const parts = el.innerHTML.split(/<br\s*\/?>/i);
    if (parts.length < 2) return;

    el.innerHTML = parts
      .map(part => `<span class="memo-soft-line">${part.trim() || '&nbsp;'}</span>`)
      .join('');
    el.dataset.memoSoftLinesReady = 'true';
  });
}

function prepareCodeLineMemoTargets(markdownBody) {
  markdownBody.querySelectorAll('pre code:not([data-memo-lines-ready])').forEach(code => {
    const lines = code.innerHTML.split('\n');
    code.innerHTML = lines.map(line => `<span class="memo-code-line">${line || '&nbsp;'}</span>`).join('');
    code.dataset.memoLinesReady = 'true';
  });
}

function getMemoTargets(markdownBody) {
  const targets = [];
  markdownBody.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach((el, idx) => {
    targets.push({ el, lineKey: `line-${idx}` });
  });
  markdownBody.querySelectorAll('.memo-code-line').forEach((el, idx) => {
    targets.push({ el, lineKey: `memo-code-${idx}` });
  });
  markdownBody.querySelectorAll('th, td').forEach((el, idx) => {
    targets.push({ el, lineKey: `memo-table-${idx}` });
  });
  markdownBody.querySelectorAll('.memo-soft-line').forEach((el, idx) => {
    targets.push({ el, lineKey: `memo-soft-${idx}` });
  });
  return targets;
}

function getMemoTargetByKey(lineKey) {
  const markdownBody = dom.previewContent.querySelector('.markdown-body');
  if (!markdownBody) return null;
  const target = getMemoTargets(markdownBody).find(item => item.lineKey === lineKey);
  return target?.el || null;
}

function getMemoLinePreview(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.memo-icon-btn').forEach(btn => btn.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function isSplitMemoParent(el) {
  return (el.matches('p, li') && Array.from(el.children).some(child => child.classList.contains('memo-soft-line')));
}

function setupMemoButton(btn, lineKey, title, hasMemo) {
  btn.className = `memo-icon-btn${hasMemo ? ' has-memo' : ''}`;
  btn.title = title;
  btn.dataset.lineKey = lineKey;
  btn.innerHTML = hasMemo
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
}

function formatMemoKeyLabel(lineKey) {
  if (lineKey.startsWith('line-')) return `줄 ${parseInt(lineKey.replace('line-', ''), 10) + 1}`;
  if (lineKey.startsWith('memo-code-')) return `코드 줄 ${parseInt(lineKey.replace('memo-code-', ''), 10) + 1}`;
  if (lineKey.startsWith('memo-table-')) return `표 셀 ${parseInt(lineKey.replace('memo-table-', ''), 10) + 1}`;
  if (lineKey.startsWith('memo-soft-')) return `문단 줄 ${parseInt(lineKey.replace('memo-soft-', ''), 10) + 1}`;
  return lineKey;
}

// ===== 에디터 입력 처리 =====
function handleEditorInput() {
  const content = dom.editor.value;
  // renderMarkdown은 150ms debounce로 별도 이벤트에서 처리됨
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;
  // 홈 탭이면 임시저장 + Undo 스택
  if (tab.id === HOME_TAB_ID) {
    const homeStack = state.undoStacks[HOME_TAB_ID] || [];
    const homeLast = homeStack[homeStack.length - 1];
    if (homeLast !== content) {
      homeStack.push(content);
      if (homeStack.length > 200) homeStack.shift();
      state.undoStacks[HOME_TAB_ID] = homeStack;
      state.redoStacks[HOME_TAB_ID] = [];
    }
    tab.content = content;
    localStorage.setItem('homeTabContent', content);
    updateUndoRedoButtons();
    sendDetachedPanelState('editor');
    return;
  }

  // Undo 스택에 현재 상태 추가 (debounce 없이 즉시)
  const stack = state.undoStacks[tab.id] || [];
  const last = stack[stack.length - 1];
  if (last !== content) {
    stack.push(content);
    if (stack.length > 200) stack.shift(); // 최대 200개
    state.undoStacks[tab.id] = stack;
    state.redoStacks[tab.id] = []; // redo 초기화
  }

  if (tab.content !== content) {
    tab.content = content;
    tab.modified = (content !== state.lastSavedContent[tab.id]);
    renderTabs();
    updateStatusBar(tab.path, content);
  }
  updateUndoRedoButtons();
  sendDetachedPanelState('editor');
}

// ===== Undo/Redo 버튼 상태 업데이트 =====
function updateUndoRedoButtons() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  const undoStack = tab ? (state.undoStacks[tab.id] || []) : [];
  const redoStack = tab ? (state.redoStacks[tab.id] || []) : [];
  const canUndo = undoStack.length > 1;
  const canRedo = redoStack.length > 0;
  dom.btnUndo.disabled = !canUndo;
  dom.btnRedo.disabled = !canRedo;
  dom.btnUndo.classList.toggle('btn-disabled', !canUndo);
  dom.btnRedo.classList.toggle('btn-disabled', !canRedo);
}

// ===== Undo / Redo =====
function editorUndo() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;
  const undoStack = state.undoStacks[tab.id] || [];
  const redoStack = state.redoStacks[tab.id] || [];
  if (undoStack.length <= 1) return; // 초기 상태 유지
  const current = undoStack.pop();
  redoStack.push(current);
  const prev = undoStack[undoStack.length - 1];
  state.redoStacks[tab.id] = redoStack;
  state.undoStacks[tab.id] = undoStack;
  const cursorPos = dom.editor.selectionStart;
  dom.editor.value = prev;
  dom.editor.setSelectionRange(cursorPos, cursorPos);
  tab.content = prev;
  if (tab.id === HOME_TAB_ID) {
    localStorage.setItem('homeTabContent', prev);
  } else {
    tab.modified = (prev !== state.lastSavedContent[tab.id]);
    renderTabs();
    updateStatusBar(tab.path, prev);
  }
  renderMarkdown(prev);
  updateUndoRedoButtons();
}

function editorRedo() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;
  const undoStack = state.undoStacks[tab.id] || [];
  const redoStack = state.redoStacks[tab.id] || [];
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(next);
  state.redoStacks[tab.id] = redoStack;
  state.undoStacks[tab.id] = undoStack;
  const cursorPos = dom.editor.selectionStart;
  dom.editor.value = next;
  dom.editor.setSelectionRange(cursorPos, cursorPos);
  tab.content = next;
  if (tab.id === HOME_TAB_ID) {
    localStorage.setItem('homeTabContent', next);
  } else {
    tab.modified = (next !== state.lastSavedContent[tab.id]);
    renderTabs();
    updateStatusBar(tab.path, next);
  }
  renderMarkdown(next);
  updateUndoRedoButtons();
}

// ===== 전문 복사 =====
async function copyAllContent() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;

  try {
    await navigator.clipboard.writeText(tab.content);
    showToast('전문이 클립보드에 복사되었습니다');
  } catch (e) {
    // fallback
    dom.editor.select();
    document.execCommand('copy');
    showToast('전문이 클립보드에 복사되었습니다');
  }
}

// ===== 파일 저장 =====
async function saveCurrentFile() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) return;

  const result = await window.electronAPI.writeFile(tab.path, tab.content);
  if (result.success) {
    tab.modified = false;
    state.lastSavedContent[tab.id] = tab.content;
    renderTabs();
    showSaveIndicator();
  }
}

async function refreshCurrentFile() {
  const s = i18nStrings[state.lang || 'ko'];
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab || !tab.path) {
    showToast(s.noFileToRefresh);
    return;
  }

  if (tab.modified) {
    const choice = await window.electronAPI.showUnsavedDialog(tab.name);
    if (choice.button === 0) {
      const saveResult = await window.electronAPI.writeFile(tab.path, tab.content);
      if (!saveResult.success) {
        showToast(s.fileRefreshFailed, 3000);
        return;
      }
    } else if (choice.button === 2) {
      return;
    }
  }

  dom.btnRefreshFile?.classList.add('refreshing');
  const result = await window.electronAPI.readFile(tab.path);
  dom.btnRefreshFile?.classList.remove('refreshing');

  if (!result.success) {
    showToast(s.fileRefreshFailed, 3000);
    return;
  }

  const cursorPos = Math.min(dom.editor.selectionStart || 0, result.content.length);
  tab.content = result.content;
  tab.modified = false;
  state.lastSavedContent[tab.id] = result.content;
  state.undoStacks[tab.id] = [result.content];
  state.redoStacks[tab.id] = [];
  dom.editor.value = result.content;
  dom.editor.setSelectionRange(cursorPos, cursorPos);
  renderMarkdown(result.content);
  updateStatusBar(tab.path, result.content);
  renderTabs();
  updateUndoRedoButtons();
  showToast(s.fileRefreshed);
}

function showSaveIndicator() {
  dom.btnSave.classList.add('saved');
  showToast('저장되었습니다');
  setTimeout(() => dom.btnSave.classList.remove('saved'), 2000);
}

// ===== 즐겨찾기 =====
async function loadFavorites() {
  const result = await window.electronAPI.getFavorites();
  state.favorites = normalizeFavorites(result.favorites || []);
  await saveFavorites();
  renderFavorites();
}

async function saveFavorites() {
  await window.electronAPI.saveFavorites(state.favorites);
}

function isFavorite(path) {
  return state.favorites.some(f => f.path === path);
}

async function toggleFavorite(item) {
  const s = i18nStrings[state.lang || 'ko'];
  const idx = state.favorites.findIndex(f => f.path === item.path);
  if (idx >= 0) {
    state.favorites.splice(idx, 1);
    showToast('즐겨찾기에서 제거되었습니다');
  } else {
    state.favorites.push({ ...item, addedAt: Date.now() });
    showToast('즐겨찾기에 추가되었습니다');
  }
  await saveFavorites();
  renderFavorites();
  // 파일 트리 즐겨찾기 버튼 상태 업데이트
  dom.fileTree.querySelectorAll('.tree-item-fav-btn').forEach(btn => {
    const starred = isFavorite(btn.dataset.path);
    btn.classList.toggle('starred', starred);
      btn.title = starred ? s.favRemove : s.addFavorite;
  });
  // 미리보기 헤더 즐겨찾기 버튼 상태 업데이트
  const activeTab = state.tabs.find(t => t.id === state.activeTabId);
  if (activeTab && activeTab.id !== HOME_TAB_ID) updatePreviewHeaderButtons(activeTab);
}

function normalizeFavorites(favorites) {
  const now = Date.now();
  return favorites.map((fav, index) => ({
    ...fav,
    addedAt: fav.addedAt || now - (favorites.length - index)
  }));
}

function getSortedFavorites() {
  const favorites = [...state.favorites];
  if (state.favoriteSortMode === 'name') {
    return favorites.sort((a, b) => {
      const nameCompare = (a.name || '').localeCompare(b.name || '', state.lang === 'ko' ? 'ko' : 'en', { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;
      return (a.path || '').localeCompare(b.path || '');
    });
  }
  if (state.favoriteSortMode === 'recent') {
    return favorites.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  return favorites;
}

function showFavoritesSortMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  const s = i18nStrings[state.lang || 'ko'];
  const modes = [
    { mode: 'custom', label: s.favoriteSortCustom },
    { mode: 'name', label: s.favoriteSortName },
    { mode: 'recent', label: s.favoriteSortRecent },
  ];
  createContextMenu(e, modes.map(({ mode, label }) => ({
    label: `${state.favoriteSortMode === mode ? '✓ ' : ''}${label}`,
    onClick: () => setFavoriteSortMode(mode)
  })));
}

function setFavoriteSortMode(mode) {
  state.favoriteSortMode = mode;
  localStorage.setItem('favoriteSortMode', mode);
  renderFavorites();
}

function renderFavorites() {
  const s = i18nStrings[state.lang || 'ko'];
  dom.favoritesList.innerHTML = '';

  if (state.favorites.length === 0) {
    dom.favoritesList.innerHTML = `<div class="favorites-empty"><span>즐겨찾기가 없습니다</span></div>`;
    return;
  }

  for (const fav of getSortedFavorites()) {
    const el = document.createElement('div');
    el.className = 'favorite-item';
    el.dataset.path = fav.path;
    el.draggable = true;

    const isDir = fav.type === 'directory';
    el.innerHTML = `
      <span class="favorite-drag-handle" title="${s.favoriteSortCustom}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
        </svg>
      </span>
      <span class="favorite-item-icon ${isDir ? 'dir-icon' : ''}">
        ${isDir
          ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
          : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
        }
      </span>
      <span class="favorite-item-name" title="${escapeHtml(fav.path)}">${escapeHtml(fav.name)}</span>
      <button class="sidebar-item-copy-btn" title="${s.copyPath}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
      <button class="favorite-remove" title="${s.favRemove}">✕</button>
    `;

    el.addEventListener('click', (e) => {
      if (e.target.closest('.favorite-remove, .sidebar-item-copy-btn')) return;
      if (fav.type === 'file') {
        openFile(fav.path);
      } else {
        openFolder(fav.path);
      }
    });
    el.addEventListener('dragstart', (e) => {
      if (e.target.closest('.favorite-remove, .sidebar-item-copy-btn')) {
        e.preventDefault();
        return;
      }
      if (e.target.closest('.favorite-drag-handle') && state.favoriteSortMode === 'custom') return;
      state.draggedTerminalPaths = [fav.path];
      e.dataTransfer.effectAllowed = 'copy';
      setTerminalDragData(e.dataTransfer, [fav.path]);
    });
    el.addEventListener('dragend', () => {
      state.draggedTerminalPaths = [];
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSidebarContextMenu(e, {
        type: 'favorite',
        item: fav,
        open: () => fav.type === 'file' ? openFile(fav.path) : openFolder(fav.path),
        remove: async () => toggleFavorite(fav)
      });
    });

    el.querySelector('.sidebar-item-copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyItemPath(fav);
    });

    el.querySelector('.favorite-remove').addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFavorite(fav);
    });
    setupFavoriteItemDrag(el, fav);

    dom.favoritesList.appendChild(el);
  }
}

function setupFavoriteItemDrag(el, fav) {
  const handle = el.querySelector('.favorite-drag-handle');
  if (!handle) return;

  handle.draggable = state.favoriteSortMode === 'custom';
  handle.addEventListener('mousedown', (e) => {
    if (state.favoriteSortMode !== 'custom') return;
    e.stopPropagation();
  });

  handle.addEventListener('dragstart', (e) => {
    if (state.favoriteSortMode !== 'custom') {
      e.preventDefault();
      return;
    }
    state.draggedFavoritePath = fav.path;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    setTerminalDragData(e.dataTransfer, [fav.path]);
  });

  el.addEventListener('dragover', (e) => {
    if (state.favoriteSortMode !== 'custom' || !state.draggedFavoritePath || state.draggedFavoritePath === fav.path) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearFavoriteDropIndicators();
    const rect = el.getBoundingClientRect();
    const dropAfter = e.clientY > rect.top + rect.height / 2;
    el.classList.toggle('drop-before', !dropAfter);
    el.classList.toggle('drop-after', dropAfter);
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('drop-before', 'drop-after');
  });

  el.addEventListener('drop', async (e) => {
    if (state.favoriteSortMode !== 'custom' || !state.draggedFavoritePath || state.draggedFavoritePath === fav.path) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const dropAfter = e.clientY > rect.top + rect.height / 2;
    reorderFavorite(state.draggedFavoritePath, fav.path, dropAfter ? 'after' : 'before');
    await saveFavorites();
    renderFavorites();
  });

  handle.addEventListener('dragend', () => {
    state.draggedFavoritePath = null;
    el.classList.remove('dragging');
    clearFavoriteDropIndicators();
  });
}

function clearFavoriteDropIndicators() {
  dom.favoritesList.querySelectorAll('.favorite-item.drop-before, .favorite-item.drop-after').forEach(item => {
    item.classList.remove('drop-before', 'drop-after');
  });
}

function reorderFavorite(sourcePath, targetPath, position = 'before') {
  const sourceIndex = state.favorites.findIndex(fav => fav.path === sourcePath);
  if (sourceIndex < 0 || sourcePath === targetPath) return;
  const [moved] = state.favorites.splice(sourceIndex, 1);
  const targetIndex = state.favorites.findIndex(fav => fav.path === targetPath);
  if (targetIndex < 0) {
    state.favorites.push(moved);
    return;
  }
  state.favorites.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, moved);
}

function toggleFavoritesSection() {
  state.isFavoritesOpen = !state.isFavoritesOpen;
  localStorage.setItem('favoritesOpen', state.isFavoritesOpen);
  updateFavoritesToggle();
}

function updateFavoritesToggle() {
  dom.favoritesList.classList.toggle('open', state.isFavoritesOpen);
  dom.favoritesChevron.classList.toggle('open', state.isFavoritesOpen);
}

function toggleFileTreeSection() {
  state.isFileTreeOpen = !state.isFileTreeOpen;
  localStorage.setItem('filetreeOpen', state.isFileTreeOpen);
  updateFileTreeToggle();
}

function updateFileTreeToggle() {
  const fileTree = dom.fileTree;
  fileTree.style.display = state.isFileTreeOpen ? '' : 'none';
  dom.filetreeChevron.classList.toggle('open', state.isFileTreeOpen);
}

// ===== 메모 =====
async function loadMemosForFile(filePath) {
  const result = await window.electronAPI.getMemos(filePath);
  state.memos[filePath] = result.memos || {};
}

function openMemoPanel(lineKey, linePreview) {
  const s = i18nStrings[state.lang || 'ko'];
  const memos = state.memos[state.currentFile] || {};
  state.activeMemoKey = lineKey;
  state.activeMemoFilePath = state.currentFile;

  dom.memoPanelTitle.textContent = `${s.memoTitle}: "${linePreview}..."`;
  dom.memoTextarea.value = memos[lineKey] || '';
  dom.memoPanel.style.display = 'flex';
  dom.memoTextarea.focus();
}

function closeMemoPanel() {
  dom.memoPanel.style.display = 'none';
  state.activeMemoKey = null;
  state.activeMemoFilePath = null;
}

async function saveMemo() {
  if (!state.activeMemoKey || !state.activeMemoFilePath) return;
  const text = dom.memoTextarea.value.trim();
  if (!text) {
    await deleteMemo();
    return;
  }

  if (!state.memos[state.activeMemoFilePath]) state.memos[state.activeMemoFilePath] = {};
  state.memos[state.activeMemoFilePath][state.activeMemoKey] = text;
  await window.electronAPI.saveMemos(state.activeMemoFilePath, state.memos[state.activeMemoFilePath]);

  // allMemos 갱신
  const updatedEntry = state.allMemos.find(e => e.filePath === state.activeMemoFilePath);
  if (updatedEntry) {
    updatedEntry.memos = { ...state.memos[state.activeMemoFilePath] };
  } else {
    state.allMemos.push({ filePath: state.activeMemoFilePath, memos: { ...state.memos[state.activeMemoFilePath] } });
  }
  renderMemosSidebar();

  closeMemoPanel();
  renderMarkdown(dom.editor.value);
  showToast('메모가 저장되었습니다');
}

async function deleteMemo() {
  if (!state.activeMemoKey || !state.activeMemoFilePath) return;
  if (state.memos[state.activeMemoFilePath]) {
    delete state.memos[state.activeMemoFilePath][state.activeMemoKey];
    await window.electronAPI.saveMemos(state.activeMemoFilePath, state.memos[state.activeMemoFilePath]);
    // allMemos 갱신
    const entryIdx = state.allMemos.findIndex(e => e.filePath === state.activeMemoFilePath);
    if (entryIdx !== -1) {
      const remaining = state.memos[state.activeMemoFilePath];
      if (Object.keys(remaining).length === 0) {
        state.allMemos.splice(entryIdx, 1);
      } else {
        state.allMemos[entryIdx].memos = { ...remaining };
      }
    }
    renderMemosSidebar();
  }

  closeMemoPanel();
  renderMarkdown(dom.editor.value);
  showToast('메모가 삭제되었습니다');
}

// ===== 메모 내보내기 =====
async function exportMemos() {
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) {
    showToast('파일을 먼저 열어주세요');
    return;
  }

  const memos = state.memos[tab.path] || {};
  const memoEntries = Object.entries(memos);

  if (memoEntries.length === 0) {
    showToast('저장된 메모가 없습니다');
    return;
  }

  let md = `# ${tab.name} - 메모 모음\n\n`;
  md += `> 파일 경로: \`${tab.path}\`\n\n`;
  md += `---\n\n`;

  memoEntries.forEach(([lineKey, memoText]) => {
    const el = getMemoTargetByKey(lineKey);
    const linePreview = el ? getMemoLinePreview(el) : lineKey;

    md += `## ${formatMemoKeyLabel(lineKey)}\n\n`;
    md += `**원문:** ${linePreview}\n\n`;
    md += `**메모:**\n\n${memoText}\n\n`;
    md += `---\n\n`;
  });

  // 클립보드 복사 또는 파일 저장 선택
  const defaultName = tab.name.replace(/\.(md|markdown|html|htm)$/i, '') + '-memos.md';

  // 먼저 클립보드에 복사
  try {
    await navigator.clipboard.writeText(md);
  } catch (e) {}

  // 파일로도 저장
  const result = await window.electronAPI.exportMemosToFile(md, defaultName);
  if (result.success) {
    showToast(`메모가 저장되었습니다: ${result.filePath.split('/').pop()}`);
  } else if (!result.canceled) {
    showToast('메모가 클립보드에 복사되었습니다');
  }
}

function applyMemosToCurrentFile() {
  const s = i18nStrings[state.lang || 'ko'];
  const tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab || !tab.path) {
    showToast('파일을 먼저 열어주세요');
    return;
  }
  if (!/\.(md|markdown)$/i.test(tab.path)) {
    showToast(s.mdMemoApplyOnly, 3000);
    return;
  }

  const memos = state.memos[tab.path] || {};
  const memoEntries = Object.entries(memos).filter(([, text]) => text && text.trim());
  if (memoEntries.length === 0) {
    showToast(s.noMemos);
    return;
  }

  const entries = memoEntries.map(([lineKey, memoText]) => {
    const target = getMemoTargetByKey(lineKey);
    return {
      lineKey,
      memoText,
      label: formatMemoKeyLabel(lineKey),
      preview: target ? getMemoLinePreview(target) : ''
    };
  });

  const nextContent = insertMemoBlocksIntoMarkdown(stripAppliedMemoBlocks(tab.content), entries);
  tab.content = nextContent;
  tab.modified = nextContent !== state.lastSavedContent[tab.id];
  dom.editor.value = nextContent;
  state.undoStacks[tab.id] = [...(state.undoStacks[tab.id] || []), nextContent];
  state.redoStacks[tab.id] = [];
  renderMarkdown(nextContent);
  renderTabs();
  updateStatusBar(tab.path, nextContent);
  updateUndoRedoButtons();
  showToast(s.memosApplied);
}

function insertMemoBlocksIntoMarkdown(content, entries) {
  let lines = content.split('\n');
  const usedIndexes = new Set();
  const insertions = entries.map(entry => ({
    index: findMemoInsertionLineIndex(lines, entry.preview, usedIndexes),
    block: buildAppliedMemoBlock(entry)
  }));

  insertions
    .sort((a, b) => b.index - a.index)
    .forEach(({ index, block }) => {
      const insertAt = Math.min(index + 1, lines.length);
      lines.splice(insertAt, 0, '', block);
    });

  return lines.join('\n').replace(/\n{4,}/g, '\n\n\n');
}

function findMemoInsertionLineIndex(lines, preview, usedIndexes) {
  const normalizedPreview = normalizeMemoMatchText(preview);
  if (!normalizedPreview) return lines.length - 1;

  for (let i = 0; i < lines.length; i++) {
    if (usedIndexes.has(i)) continue;
    const normalizedLine = normalizeMemoMatchText(lines[i]);
    if (normalizedLine && (normalizedLine.includes(normalizedPreview) || normalizedPreview.includes(normalizedLine))) {
      usedIndexes.add(i);
      return adjustMemoInsertionLineIndex(lines, i);
    }
  }

  return lines.length - 1;
}

function adjustMemoInsertionLineIndex(lines, index) {
  const fenceStart = findOpenFenceStart(lines, index);
  if (fenceStart !== -1) {
    for (let i = index + 1; i < lines.length; i++) {
      if (/^\s*```/.test(lines[i])) return i;
    }
    return index;
  }

  if (isMarkdownTableLine(lines[index])) {
    let end = index;
    while (end + 1 < lines.length && isMarkdownTableLine(lines[end + 1])) end++;
    return end;
  }

  return index;
}

function findOpenFenceStart(lines, index) {
  let fenceStart = -1;
  for (let i = 0; i <= index; i++) {
    if (/^\s*```/.test(lines[i])) {
      fenceStart = fenceStart === -1 ? i : -1;
    }
  }
  return fenceStart;
}

function isMarkdownTableLine(line) {
  return /\|/.test(line) && !/^\s*>/.test(line);
}

function buildAppliedMemoBlock(entry) {
  const quotedMemo = entry.memoText
    .trim()
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');
  const sourceLine = entry.preview ? `> 원문: ${entry.preview}\n` : '';
  return [
    `<!-- MDVIEWER_MEMO_START ${entry.lineKey} -->`,
    `> [!NOTE] MDViewer 메모 - ${entry.label}`,
    sourceLine + quotedMemo,
    `<!-- MDVIEWER_MEMO_END ${entry.lineKey} -->`
  ].join('\n');
}

function stripAppliedMemoBlocks(content) {
  return content
    .replace(/\n?<!-- MDVIEWER_MEMO_START [\s\S]*?<!-- MDVIEWER_MEMO_END [^\n]*-->\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function normalizeMemoMatchText(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[`*_~#[\]()>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ===== 검색 =====
function toggleSearch() {
  // 사이드바 고정 검색창 사용 - 검색창에 포커스
  dom.searchInput.focus();
}

async function handleSearch() {
  const query = dom.searchInput.value.trim();
  state.searchQuery = query;
  dom.btnClearSearch.style.display = query ? 'block' : 'none';
  if (!query || !state.currentFolder) {
    dom.searchResults.innerHTML = '';
    return;
  }

  dom.searchResults.innerHTML = '<div class="search-no-results">검색 중...</div>';

  const result = await window.electronAPI.searchInDirectory(state.currentFolder, query);
  if (!result.success || result.results.length === 0) {
    dom.searchResults.innerHTML = `<div class="search-no-results">검색 결과 없음: "${escapeHtml(query)}"</div>`;
    return;
  }

  dom.searchResults.innerHTML = '';
  for (const file of result.results) {
    const el = document.createElement('div');
    el.className = 'search-result-item';

    const matchesHtml = file.matches.slice(0, 3).map(m => {
      const highlighted = m.line.replace(
        new RegExp(escapeRegex(query), 'gi'),
        match => `<span class="highlight">${escapeHtml(match)}</span>`
      );
      return `<div class="search-result-match">${highlighted}</div>`;
    }).join('');

    el.innerHTML = `
      <div class="search-result-filename">${escapeHtml(file.name)}</div>
      ${matchesHtml}
    `;

    el.addEventListener('click', () => openFile(file.path));
    dom.searchResults.appendChild(el);
  }
}
function clearSearch() {
  dom.searchInput.value = '';
  dom.searchResults.innerHTML = '';
  state.searchQuery = '';
  dom.btnClearSearch.style.display = 'none';
  dom.searchInput.focus();
}

function toggleDarkMode(force) {
  state.isDarkMode = force !== undefined ? force : !state.isDarkMode;
  dom.body.classList.toggle('dark-mode', state.isDarkMode);
  dom.body.classList.toggle('light-mode', !state.isDarkMode);
  dom.btnDarkMode.classList.toggle('active', state.isDarkMode);
  localStorage.setItem('darkMode', state.isDarkMode);

  const hljsTheme = document.getElementById('hljs-theme');
  if (hljsTheme) {
    hljsTheme.href = state.isDarkMode ? 'vendor/github-dark.min.css' : 'vendor/github.min.css';
  }

  if (state.isDarkMode) {
    dom.btnDarkMode.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>`;
  } else {
    dom.btnDarkMode.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>`;
  }

  updateTerminalTheme();
  syncDetachedPanels();
}

function normalizePanelOrder(order) {
  let parsed = order;
  if (typeof order === 'string') {
    if (order === 'preview-first') parsed = ['preview', 'editor', 'terminal'];
    else if (order === 'editor-first') parsed = ['editor', 'preview', 'terminal'];
    else {
      try { parsed = JSON.parse(order); } catch (e) { parsed = [...DEFAULT_PANEL_ORDER]; }
    }
  }
  if (!Array.isArray(parsed)) parsed = [...DEFAULT_PANEL_ORDER];
  const unique = parsed.filter(key => DEFAULT_PANEL_ORDER.includes(key));
  DEFAULT_PANEL_ORDER.forEach(key => {
    if (!unique.includes(key)) unique.push(key);
  });
  return unique;
}

function getPanelElement(key) {
  return {
    editor: dom.editorPanel,
    preview: dom.previewPanel,
    terminal: dom.terminalPanel
  }[key];
}

function getVisiblePanelKeys() {
  return state.panelOrder.filter(key => state.panelVisibility[key] && getPanelElement(key));
}

function getDefaultTerminalCwd() {
  if (state.currentFile) return state.currentFile;
  if (state.currentFolder) return state.currentFolder;
  return null;
}

function getTerminalCwd() {
  return getDefaultTerminalCwd() || state.terminalCwd || null;
}

function getParentPath(targetPath) {
  if (!targetPath) return null;
  const normalized = String(targetPath).replace(/\/+$/, '');
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex < 0) return normalized;
  if (slashIndex === 0) return '/';
  return normalized.slice(0, slashIndex);
}

function shellEscapePath(targetPath) {
  return `'${String(targetPath || '').replace(/'/g, `'\\''`)}'`;
}

function dedupePaths(paths = []) {
  return [...new Set(paths.filter(Boolean))];
}

function encodeDraggedPaths(paths = []) {
  return JSON.stringify(dedupePaths(paths));
}

function decodeDraggedPaths(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? dedupePaths(parsed) : [];
  } catch (e) {
    return [];
  }
}

function encodeDraggedUriList(paths = []) {
  return dedupePaths(paths)
    .map(targetPath => `file://${encodeURI(targetPath)}`)
    .join('\r\n');
}

function setTerminalDragData(dataTransfer, paths = []) {
  const nextPaths = dedupePaths(paths);
  if (!dataTransfer || !nextPaths.length) return;
  dataTransfer.setData('text/plain', nextPaths.join('\n'));
  dataTransfer.setData('text/uri-list', encodeDraggedUriList(nextPaths));
  dataTransfer.setData('application/x-mdviewer-paths', encodeDraggedPaths(nextPaths));
}

async function resolveTerminalLaunchPath(target) {
  if (!target) return getTerminalCwd();
  const item = typeof target === 'string' ? { path: target } : target;
  if (!item?.path) return getTerminalCwd();
  if (item.type === 'directory') return item.path;
  if (item.type === 'file') return getParentPath(item.path);
  const info = await window.electronAPI.getItemInfo(item.path);
  if (info?.success) return info.isDirectory ? item.path : getParentPath(item.path);
  return item.path;
}

function getTerminalTargetLabel(target) {
  if (!target) return getTerminalCwd() || 'Terminal';
  if (typeof target === 'string') return target.split('/').filter(Boolean).pop() || target;
  return target.name || target.path || 'Terminal';
}

function getDraggedPathsFromDataTransfer(dataTransfer) {
  if (state.draggedTerminalPaths?.length) return dedupePaths(state.draggedTerminalPaths);
  if (!dataTransfer) return [];
  const filePaths = Array.from(dataTransfer.files || [])
    .map(file => window.electronAPI.getPathForDraggedFile?.(file) || file?.path)
    .filter(Boolean);
  if (filePaths.length) return dedupePaths(filePaths);

  const itemPaths = Array.from(dataTransfer.items || [])
    .map(item => {
      const file = item?.getAsFile?.();
      return window.electronAPI.getPathForDraggedFile?.(file) || file?.path;
    })
    .filter(Boolean);
  if (itemPaths.length) return dedupePaths(itemPaths);

  const customPaths = decodeDraggedPaths(dataTransfer.getData('application/x-mdviewer-paths'));
  if (customPaths.length) return customPaths;

  const inferredPaths = [];
  if (state.draggedTreeItem?.items?.length) {
    inferredPaths.push(...state.draggedTreeItem.items.map(item => item.path));
  } else if (state.draggedTreeItem?.path) {
    inferredPaths.push(state.draggedTreeItem.path);
  }
  if (state.draggedFavoritePath) inferredPaths.push(state.draggedFavoritePath);

  inferredPaths.push(...parseExternalPathText(dataTransfer.getData('text/uri-list')));
  inferredPaths.push(...parseExternalPathText(dataTransfer.getData('text/plain')));

  return dedupePaths(inferredPaths);
}

function estimateTerminalSize() {
  if (state.terminalFitAddon) {
    try {
      const proposed = state.terminalFitAddon.proposeDimensions();
      if (proposed?.cols && proposed?.rows) return proposed;
    } catch (e) {}
  }
  return { cols: state.terminal?.cols || 80, rows: state.terminal?.rows || 24 };
}

function getTerminalTheme() {
  return {
    background: '#1f2433',
    foreground: '#d8dee9',
    cursor: '#ffffff',
    selectionBackground: '#3b4252'
  };
}

function updateTerminalTheme() {
  if (!state.terminal) return;
  state.terminal.options.theme = getTerminalTheme();
}

function getPanelLabel(panel) {
  const s = i18nStrings[state.lang || 'ko'];
  return {
    editor: s.edit,
    preview: s.preview,
    terminal: s.terminal
  }[panel] || panel;
}

function getDetachedPanelState(panel) {
  const activeTab = state.tabs.find(t => t.id === state.activeTabId);
  const title = activeTab?.name || 'MDViewer';
  if (panel === 'editor') {
    return {
      panel,
      title: `${getPanelLabel(panel)} - ${title}`,
      content: dom.editor.value,
      placeholder: dom.editor.getAttribute('placeholder') || '',
      isDarkMode: state.isDarkMode,
      lang: state.lang
    };
  }
  if (panel === 'preview') {
    return {
      panel,
      title: `${getPanelLabel(panel)} - ${title}`,
      html: dom.previewContent.innerHTML,
      htmlPreviewMode: dom.previewContent.classList.contains('html-preview-mode'),
      isDarkMode: state.isDarkMode,
      lang: state.lang
    };
  }
  return {
    panel,
    title: `${getPanelLabel(panel)} - ${state.terminalCwd || state.currentFolder || title}`,
    cwd: state.terminalCwd || getTerminalCwd(),
    isDarkMode: state.isDarkMode,
    lang: state.lang,
    terminalStarted: state.terminalStarted
  };
}

function sendDetachedPanelState(panel) {
  if (!state.detachedPanels[panel]) return;
  window.electronAPI.updateDetachedPanel({
    panel,
    state: getDetachedPanelState(panel)
  });
}

function syncDetachedPanels() {
  DEFAULT_PANEL_ORDER.forEach(panel => sendDetachedPanelState(panel));
}

function createPanelDragGhost(panel) {
  const s = i18nStrings[state.lang || 'ko'];
  const ghost = document.createElement('div');
  ghost.className = 'panel-drag-ghost';
  ghost.innerHTML = `
    <div class="panel-drag-ghost-title">${escapeHtml(getPanelLabel(panel))}</div>
    <div class="panel-drag-ghost-desc">${escapeHtml(s.dragToDetach)}</div>
  `;
  document.body.appendChild(ghost);
  requestAnimationFrame(() => ghost.classList.add('visible'));
  return ghost;
}

async function detachPanel(panel) {
  const s = i18nStrings[state.lang || 'ko'];
  const result = await window.electronAPI.openDetachedPanel({
    panel,
    title: getDetachedPanelState(panel).title
  });
  if (!result?.success) {
    showToast(result?.error || s.detachedPanelOpenFailed);
    return;
  }
  state.detachedPanels[panel] = true;
  if (getVisiblePanelKeys().length > 1) {
    state.panelVisibility[panel] = false;
  }
  syncPanelLayout();
  sendDetachedPanelState(panel);
}

async function focusInternalTerminalSurface() {
  if (state.detachedPanels.terminal) {
    await window.electronAPI.focusDetachedPanel('terminal');
    return true;
  }
  state.panelVisibility.terminal = true;
  state.viewMode = 'custom';
  localStorage.setItem('viewMode', state.viewMode);
  syncPanelLayout();
  const terminal = ensureTerminal();
  if (!terminal) return false;
  focusEmbeddedTerminalInput();
  return true;
}

async function openEmbeddedTerminalAt(targetPath) {
  const nextCwd = targetPath || getTerminalCwd();
  if (!nextCwd) return false;
  const surfaceReady = await focusInternalTerminalSurface();
  if (!surfaceReady) return false;
  if (state.terminal) state.terminal.reset();
  state.terminalStarted = false;
  state.terminalCwd = nextCwd;
  const terminal = ensureTerminal();
  if (!terminal && !state.detachedPanels.terminal) return false;
  const size = estimateTerminalSize();
  if (terminal) {
    terminal.resize(size.cols, size.rows);
    terminal.writeln('Starting zsh...');
  }
  const result = await window.electronAPI.startTerminal({
    cwd: nextCwd,
    cols: size.cols,
    rows: size.rows
  });
  if (!result?.success) {
    if (terminal) terminal.writeln(`Failed to start terminal: ${result?.error || 'unknown error'}`);
    showToast(i18nStrings[state.lang || 'ko'].terminalStartFailed);
    return false;
  }
  state.terminalStarted = true;
  state.terminalCwd = result.cwd || nextCwd;
  if (state.detachedPanels.terminal) await window.electronAPI.focusDetachedPanel('terminal');
  else focusEmbeddedTerminalInput();
  sendDetachedPanelState('terminal');
  return true;
}

async function handleTerminalOpenRequest(target) {
  const desiredCwd = await resolveTerminalLaunchPath(target);
  if (!desiredCwd) return;

  let openMode = state.terminalOpenModeSession;
  if (openMode === 'ask') {
    const choice = await window.electronAPI.showTerminalOpenDialog({
      lang: state.lang,
      itemName: getTerminalTargetLabel(target)
    });
    if (!choice || choice.action === 'cancel') return;
    openMode = choice.action;
    if (choice.rememberForSession) state.terminalOpenModeSession = openMode;
  }

  if (openMode === 'external') {
    await window.electronAPI.openInTerminal(desiredCwd);
    return;
  }

  if (state.terminalStarted && state.terminalCwd === desiredCwd) {
    await focusInternalTerminalSurface();
    sendDetachedPanelState('terminal');
    return;
  }

  if (state.terminalStarted && state.terminalReusePromptSession) {
    const reuse = await window.electronAPI.showTerminalReuseDialog({
      lang: state.lang,
      targetName: getTerminalTargetLabel(target)
    });
    if (!reuse?.confirmed) return;
    if (reuse.rememberForSession) state.terminalReusePromptSession = false;
  }

  await openEmbeddedTerminalAt(desiredCwd);
}

async function insertPathsIntoInternalTerminal(paths) {
  const normalizedPaths = dedupePaths(paths);
  if (!normalizedPaths.length) return;

  if (!state.terminalStarted) {
    const launchCwd = await resolveTerminalLaunchPath(normalizedPaths[0]);
    const started = await openEmbeddedTerminalAt(launchCwd);
    if (!started) return;
  } else {
    await focusInternalTerminalSurface();
  }

  const input = `${normalizedPaths.map(shellEscapePath).join(' ')} `;
  sendEmbeddedTerminalSequence(input);
}

async function handleInsertTerminalPaths(mode) {
  const result = await window.electronAPI.pickTerminalPaths({
    mode,
    lang: state.lang
  });
  if (!result?.success || !result.paths?.length) return;
  await insertPathsIntoInternalTerminal(result.paths);
}

function resizeTerminalToPanel() {
  if (!state.terminal) return;
  if (state.terminalFitAddon) {
    try { state.terminalFitAddon.fit(); } catch (e) {}
  }
  if (!state.terminalStarted) return;
  const size = estimateTerminalSize();
  window.electronAPI.resizeTerminal(size);
}

function syncPanelLayout() {
  state.panelOrder = normalizePanelOrder(state.panelOrder);
  const visibleKeys = getVisiblePanelKeys();
  if (visibleKeys.length === 0) {
    const fallbackPanel = DEFAULT_PANEL_ORDER.find(key => !state.detachedPanels[key]) || 'editor';
    state.panelVisibility[fallbackPanel] = true;
    visibleKeys.push(fallbackPanel);
  }

  const savedVisibleSizes = visibleKeys
    .map(key => Number(state.panelSizes[key]) || 0)
    .filter(size => size > 0);
  const useProportionalSizes = savedVisibleSizes.length === visibleKeys.length && visibleKeys.length > 1;

  DEFAULT_PANEL_ORDER.forEach(key => {
    const panel = getPanelElement(key);
    if (!panel) return;
    const isVisible = state.panelVisibility[key];
    panel.classList.toggle('hidden', !isVisible);
    panel.style.order = String(state.panelOrder.indexOf(key) * 2);
    panel.style.flex = '';
    if (!isVisible) {
      panel.style.flexBasis = '';
      panel.style.flexGrow = '';
      panel.style.flexShrink = '';
      return;
    }

    if (useProportionalSizes) {
      const grow = Math.max(1, Number(state.panelSizes[key]) || 1);
      panel.style.flexBasis = '0px';
      panel.style.flexGrow = String(grow);
      panel.style.flexShrink = '1';
    } else {
      panel.style.flexBasis = '';
      panel.style.flexGrow = '1';
      panel.style.flexShrink = '1';
    }
  });

  const handles = Array.from(document.querySelectorAll('.panel-split-handle'));
  handles.forEach((handle, index) => {
    const leftKey = visibleKeys[index];
    const rightKey = visibleKeys[index + 1];
    if (!leftKey || !rightKey) {
      handle.style.display = 'none';
      handle.dataset.leftPanel = '';
      handle.dataset.rightPanel = '';
      return;
    }
    handle.style.display = '';
    handle.style.order = String(state.panelOrder.indexOf(leftKey) * 2 + 1);
    handle.dataset.leftPanel = leftKey;
    handle.dataset.rightPanel = rightKey;
  });

  dom.btnToggleEditor?.classList.toggle('active', !!state.panelVisibility.editor);
  dom.btnTogglePreview?.classList.toggle('active', !!state.panelVisibility.preview);
  dom.btnToggleTerminal?.classList.toggle('active', !!state.panelVisibility.terminal);

  localStorage.setItem('panelVisibility', JSON.stringify(state.panelVisibility));
  localStorage.setItem('panelSizes', JSON.stringify(state.panelSizes));

  if (state.panelVisibility.terminal) {
    requestAnimationFrame(() => {
      resizeTerminalToPanel();
      if (!state.terminalStarted) startTerminal();
    });
  }
}

function toggleWorkspacePanel(key) {
  const visibleCount = getVisiblePanelKeys().length;
  if (state.panelVisibility[key] && visibleCount <= 1) {
    showToast(i18nStrings[state.lang || 'ko'].panelAtLeastOne);
    return;
  }
  state.panelVisibility[key] = !state.panelVisibility[key];
  state.viewMode = 'custom';
  localStorage.setItem('viewMode', state.viewMode);
  syncPanelLayout();
}

// ===== 보기 모드 =====
function setViewMode(mode, options = {}) {
  const s = i18nStrings[state.lang || 'ko'];
  state.viewMode = mode;
  dom.editorPreviewContainer.className = 'editor-preview-container';

  if (!(options.preserveCustom && mode === 'custom')) {
    if (mode === 'editor') {
      state.panelVisibility = { editor: true, preview: false, terminal: false };
    } else if (mode === 'preview') {
      state.panelVisibility = { editor: false, preview: true, terminal: false };
    } else if (mode === 'split') {
      state.panelVisibility = { editor: true, preview: true, terminal: false };
    }
  }

  if (mode === 'editor') {
    dom.btnViewToggle.title = s.viewPreviewOnly;
    dom.btnViewToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/></svg>`;
  } else if (mode === 'preview') {
    dom.btnViewToggle.title = s.viewSplit;
    dom.btnViewToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></svg>`;
  } else {
    dom.btnViewToggle.title = s.viewEditOnly;
    dom.btnViewToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/></svg>`;
  }

  localStorage.setItem('viewMode', mode);
  syncPanelLayout();
}

function cycleViewMode() {
  const modes = ['split', 'editor', 'preview'];
  const idx = modes.indexOf(state.viewMode);
  setViewMode(modes[(idx + 1) % modes.length]);
}

// ===== 패널 좌우 순서 전환 =====
function setPanelOrder(order) {
  state.panelOrder = normalizePanelOrder(order);
  localStorage.setItem('panelOrderV2', JSON.stringify(state.panelOrder));
  syncPanelLayout();
}

function swapPanels() {
  const order = [...state.panelOrder];
  const editorIndex = order.indexOf('editor');
  const previewIndex = order.indexOf('preview');
  if (editorIndex === -1 || previewIndex === -1) return;
  [order[editorIndex], order[previewIndex]] = [order[previewIndex], order[editorIndex]];
  setPanelOrder(order);
}

// ===== 작업 패널 리사이즈 =====
function setupPanelResizeHandle() {
  let isResizing = false;
  let activeHandle = null;
  let startX = 0;
  let leftStartWidth = 0;
  let rightStartWidth = 0;

  document.querySelectorAll('.panel-split-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      const leftPanel = getPanelElement(handle.dataset.leftPanel);
      const rightPanel = getPanelElement(handle.dataset.rightPanel);
      if (!leftPanel || !rightPanel) return;
      e.preventDefault();
      isResizing = true;
      activeHandle = handle;
      startX = e.clientX;
      leftStartWidth = leftPanel.offsetWidth;
      rightStartWidth = rightPanel.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing || !activeHandle) return;
    const leftKey = activeHandle.dataset.leftPanel;
    const rightKey = activeHandle.dataset.rightPanel;
    const leftPanel = getPanelElement(leftKey);
    const rightPanel = getPanelElement(rightKey);
    if (!leftPanel || !rightPanel) return;
    const dx = e.clientX - startX;
    const minWidth = 120;
    const totalWidth = leftStartWidth + rightStartWidth;
    const leftWidth = Math.max(minWidth, Math.min(totalWidth - minWidth, leftStartWidth + dx));
    const rightWidth = Math.max(minWidth, totalWidth - leftWidth);

    state.panelSizes[leftKey] = leftWidth;
    state.panelSizes[rightKey] = rightWidth;
    leftPanel.style.flex = `0 0 ${leftWidth}px`;
    rightPanel.style.flex = `0 0 ${rightWidth}px`;
    localStorage.setItem('panelSizes', JSON.stringify(state.panelSizes));
    resizeTerminalToPanel();
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    activeHandle?.classList.remove('dragging');
    activeHandle = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    syncPanelLayout();
  });
}

// ===== 패널 헤더 드래그 앤 드롭으로 순서 변경 =====
function setupPanelDragAndDrop() {
  const panels = [
    { key: 'editor', panel: dom.editorPanel, header: document.getElementById('editor-panel-header') },
    { key: 'preview', panel: dom.previewPanel, header: document.getElementById('preview-panel-header') },
    { key: 'terminal', panel: dom.terminalPanel, header: document.getElementById('terminal-panel-header') },
  ];

  panels.forEach(({ key, panel, header }) => {
    if (!header) return;
    const handle = header.querySelector('.panel-drag-handle');
    if (!handle) return;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      header.classList.add('panel-dragging');
      let targetKey = null;
      let targetInsertMode = 'before';
      const startX = e.clientX;
      const startY = e.clientY;
      let movedEnoughToDetach = false;
      let ghost = null;

      function onMouseMove(ev) {
        targetKey = null;
        targetInsertMode = 'before';
        panels.forEach(p => p.panel?.classList.remove('panel-drop-before', 'panel-drop-after'));
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        movedEnoughToDetach = Math.abs(dx) > 90 || Math.abs(dy) > 90;
        if (movedEnoughToDetach && !ghost) {
          ghost = createPanelDragGhost(key);
        }
        if (ghost) {
          ghost.style.left = `${ev.clientX + 14}px`;
          ghost.style.top = `${ev.clientY + 14}px`;
        }
        panels.forEach(p => {
          if (!p.panel || p.key === key || p.panel.classList.contains('hidden')) return;
          const rect = p.panel.getBoundingClientRect();
          if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
            targetKey = p.key;
            targetInsertMode = ev.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
            p.panel.classList.add(targetInsertMode === 'after' ? 'panel-drop-after' : 'panel-drop-before');
          }
        });
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        header.classList.remove('panel-dragging');
        panels.forEach(p => p.panel?.classList.remove('panel-drop-before', 'panel-drop-after'));
        ghost?.remove();
        if (!targetKey) {
          if (movedEnoughToDetach) detachPanel(key);
          return;
        }
        const order = state.panelOrder.filter(panelKey => panelKey !== key);
        const targetIndex = order.indexOf(targetKey);
        const insertIndex = targetInsertMode === 'after' ? targetIndex + 1 : targetIndex;
        order.splice(insertIndex, 0, key);
        setPanelOrder(order);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

// ===== 사이드바 리사이즈 =====
function setupResizeHandle() {
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  dom.resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = dom.sidebar.offsetWidth;
    dom.resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const newWidth = Math.min(Math.max(startWidth + dx, 180), 500);
    setSidebarWidth(newWidth);
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      dom.resizeHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('sidebarWidth', dom.sidebar.offsetWidth);
    }
  });
}

function setSidebarWidth(width) {
  dom.sidebar.style.width = `${width}px`;
}

// ===== 유틸리티 =====
function updateTitlebar(filename) {
  dom.titlebarFilename.textContent = filename;
}

function updateStatusBar(filePath, content) {
  const s = i18nStrings[state.lang || 'ko'];
  const lines = content.split('\n').length;
  const chars = content.length;
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  dom.statusPath.textContent = filePath;
  dom.statusInfo.textContent = `${lines} ${s.statusLines} · ${words} ${s.statusWords} · ${chars} ${s.statusChars}`;
  // 경로 복사 버튼 표시
  if (dom.btnCopyPath) dom.btnCopyPath.style.display = filePath ? 'inline-flex' : 'none';
}

function updateActiveFileInTree(filePath) {
  dom.fileTree.querySelectorAll('.tree-item.file').forEach(el => {
    el.classList.toggle('active', el.dataset.path === filePath);
  });
}

// 파일 트리에서 해당 파일 위치로 이동 (최상위 폴더부터 전체 위계 표시)
async function revealFileInTree(filePath) {
  const inCurrentFolder = state.currentFolder && filePath.startsWith(state.currentFolder + '/');

  if (!inCurrentFolder) {
    // 현재 폴더와 파일 경로의 공통 최상위 디렉토리 찾기
    const rootFolder = findCommonRoot(state.currentFolder, filePath);
    // 공통 루트가 있으면 그 루트를, 없으면 파일의 상위 폴더를 열기
    const targetFolder = rootFolder || filePath.substring(0, filePath.lastIndexOf('/'));
    await openFolder(targetFolder);
    await new Promise(r => setTimeout(r, 250));
  }

  // 상위 폴더들 모두 열기 (전체 위계 전개)
  openAllParentFolders(filePath);

  // 파일 요소 찾기 및 강조
  const fileEl = dom.fileTree.querySelector(`.tree-item.file[data-path="${CSS.escape(filePath)}"]`);
  if (fileEl) {
    setTimeout(() => {
      fileEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      fileEl.classList.add('highlight-pulse');
      setTimeout(() => fileEl.classList.remove('highlight-pulse'), 1200);
    }, 50);
  }
}

// 두 경로의 공통 최상위 디렉토리 찾기
function findCommonRoot(pathA, pathB) {
  if (!pathA || !pathB) return null;
  const partsA = pathA.split('/');
  const partsB = pathB.split('/');
  const common = [];
  const minLen = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < minLen; i++) {
    if (partsA[i] === partsB[i]) common.push(partsA[i]);
    else break;
  }
  // 공통 부분이 두 경로 중 하나와 동일하면 그 경로의 상위 폴더를 사용
  if (common.length <= 1) return null; // 루트(/) 수준이면 의미 없음
  return common.join('/');
}

// 파일 경로에 해당하는 상위 폴더들을 모두 열기
function openAllParentFolders(filePath) {
  dom.fileTree.querySelectorAll('.tree-item.directory').forEach(dirEl => {
    const dirPath = dirEl.querySelector('.tree-item-fav-btn')?.dataset.path;
    if (!dirPath) return;
    if (filePath.startsWith(dirPath + '/')) {
      const childContainer = dirEl.nextElementSibling;
      if (childContainer && childContainer.classList.contains('tree-children') && !childContainer.classList.contains('open')) {
        childContainer.classList.add('open');
        dirEl.classList.add('open');
        const icon = dirEl.querySelector('.tree-item-icon svg');
        if (icon) icon.innerHTML = '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>';
      }
    }
  });
}

function clearActiveFileInTree() {
  dom.fileTree.querySelectorAll('.tree-item.file.active').forEach(el => {
    el.classList.remove('active');
  });
}

// ===== 최근 본 파일 =====
function addRecentFile(filePath, fileName) {
  // 중복 제거
  state.recentFiles = state.recentFiles.filter(r => r.path !== filePath);
  // 앞에 추가
  state.recentFiles.unshift({ path: filePath, name: fileName, openedAt: Date.now() });
  // 최대 20개 유지
  if (state.recentFiles.length > 5) state.recentFiles = state.recentFiles.slice(0, 5);
  localStorage.setItem('recentFiles', JSON.stringify(state.recentFiles));
  renderRecentFiles();
}

function renderRecentFiles() {
  const s = i18nStrings[state.lang || 'ko'];
  const list = dom.recentList;
  if (!list) return;
  if (state.recentFiles.length === 0) {
    list.innerHTML = `<div class="favorites-empty"><span>${s.noRecentFiles}</span></div>`;
    return;
  }
  list.innerHTML = '';
  state.recentFiles.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'recent-item';
    el.title = item.path;
    el.draggable = true;
    el.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="recent-item-name">${item.name}</span>
      <button class="sidebar-item-copy-btn" title="${s.copyPath}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
      <button class="sidebar-item-fav-btn ${isFavorite(item.path) ? 'starred' : ''}" title="${isFavorite(item.path) ? s.removeFavorite : s.addFavorite}">★</button>
      <button class="recent-item-remove" title="${s.removeFromList}">✕</button>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.sidebar-item-copy-btn, .sidebar-item-fav-btn')) return;
      if (e.target.closest('.recent-item-remove')) {
        state.recentFiles.splice(idx, 1);
        localStorage.setItem('recentFiles', JSON.stringify(state.recentFiles));
        renderRecentFiles();
        return;
      }
      openFile(item.path);
    });
    el.addEventListener('dragstart', (e) => {
      if (e.target.closest('button')) {
        e.preventDefault();
        return;
      }
      state.draggedTerminalPaths = [item.path];
      e.dataTransfer.effectAllowed = 'copy';
      setTerminalDragData(e.dataTransfer, [item.path]);
    });
    el.addEventListener('dragend', () => {
      state.draggedTerminalPaths = [];
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSidebarContextMenu(e, {
        type: 'recent',
        item: { ...item, type: 'file' },
        open: () => openFile(item.path),
        remove: () => {
          state.recentFiles.splice(idx, 1);
          localStorage.setItem('recentFiles', JSON.stringify(state.recentFiles));
          renderRecentFiles();
        }
      });
    });
    el.querySelector('.sidebar-item-copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyItemPath({ ...item, type: 'file' });
    });
    el.querySelector('.sidebar-item-fav-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleFavorite({ type: 'file', path: item.path, name: item.name });
      renderRecentFiles();
    });
    list.appendChild(el);
  });
}

function updateRecentToggle() {
  dom.recentList.style.display = state.isRecentOpen ? '' : 'none';
  if (dom.recentChevron) dom.recentChevron.classList.toggle('open', state.isRecentOpen);
}

function updateMemosToggle() {
  if (dom.memosSectionList) dom.memosSectionList.style.display = state.isMemosOpen ? '' : 'none';
  if (dom.memosChevron) dom.memosChevron.classList.toggle('open', state.isMemosOpen);
}

// ===== 위치 =====
async function loadLocations(showFeedback = false) {
  const s = i18nStrings[state.lang || 'ko'];
  dom.btnRefreshLocations?.classList.add('refreshing');
  const result = await window.electronAPI.getLocations();
  dom.btnRefreshLocations?.classList.remove('refreshing');

  if (result.success) {
    state.locations = result.locations || [];
    renderLocations();
    if (showFeedback) showToast(s.locationsRefreshed);
  } else {
    state.locations = [];
    renderLocations();
    if (showFeedback) showToast(s.locationsRefreshFailed, 3000);
  }
}

function renderLocations() {
  const s = i18nStrings[state.lang || 'ko'];
  const list = dom.locationsList;
  if (!list) return;

  if (state.locations.length === 0) {
    list.innerHTML = `<div class="favorites-empty"><span>${s.noLocations}</span></div>`;
    return;
  }

  list.innerHTML = '';
  state.locations.forEach(location => {
    const el = document.createElement('div');
    el.className = 'location-item';
    el.title = location.path;
    el.draggable = true;
    el.classList.toggle('active', state.currentFolder === location.path);
    el.innerHTML = `
      <span class="location-item-icon ${escapeHtml(location.type)}">
        ${getLocationIcon(location.type)}
      </span>
      <span class="location-item-name">${escapeHtml(localizeLocationName(location.name))}</span>
      <button class="sidebar-item-copy-btn" title="${s.copyPath}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      </button>
    `;
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.sidebar-item-copy-btn')) return;
      await openFolder(location.path);
      renderLocations();
    });
    el.addEventListener('dragstart', (e) => {
      if (e.target.closest('button')) {
        e.preventDefault();
        return;
      }
      state.draggedTerminalPaths = [location.path];
      e.dataTransfer.effectAllowed = 'copy';
      setTerminalDragData(e.dataTransfer, [location.path]);
    });
    el.addEventListener('dragend', () => {
      state.draggedTerminalPaths = [];
    });
    el.querySelector('.sidebar-item-copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await copyItemPath({ ...location, name: localizeLocationName(location.name) });
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showSidebarContextMenu(e, {
        type: 'location',
        item: { ...location, name: localizeLocationName(location.name) },
        open: async () => {
          await openFolder(location.path);
          renderLocations();
        },
        refresh: () => loadLocations(true)
      });
    });
    list.appendChild(el);
  });
}

function updateLocationsToggle() {
  if (dom.locationsList) dom.locationsList.classList.toggle('open', state.isLocationsOpen);
  if (dom.locationsChevron) dom.locationsChevron.classList.toggle('open', state.isLocationsOpen);
}

function localizeLocationName(name) {
  if ((state.lang || 'ko') !== 'ko') return name;
  const names = {
    Home: '홈',
    Desktop: '데스크탑',
    Documents: '문서',
    Downloads: '다운로드',
    'Macintosh HD': 'Macintosh HD'
  };
  return names[name] || name;
}

function getLocationIcon(type) {
  if (type === 'drive') {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <path d="M7 16h.01"/>
      <path d="M17 16h.01"/>
    </svg>`;
  }
  if (type === 'home') {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 11l9-8 9 8"/>
      <path d="M5 10v10h14V10"/>
    </svg>`;
  }
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>`;
}

// ===== 전체 메모 로드 및 사이드바 렌더링 =====
async function loadAllMemos() {
  const result = await window.electronAPI.getAllMemos();
  state.allMemos = result.allMemos || [];
  renderMemosSidebar();
}

function renderMemosSidebar() {
  const s = i18nStrings[state.lang || 'ko'];
  const list = dom.memosSectionList;
  if (!list) return;
  list.innerHTML = '';

  const allMemos = state.allMemos;
  const totalCount = allMemos.reduce((sum, entry) => sum + Object.keys(entry.memos).length, 0);

  // 배지 업데이트
  if (dom.memosCountBadge) {
    if (totalCount > 0) {
      dom.memosCountBadge.textContent = totalCount;
      dom.memosCountBadge.style.display = '';
    } else {
      dom.memosCountBadge.style.display = 'none';
    }
  }

  if (allMemos.length === 0) {
    list.innerHTML = `<div class="memos-empty">${s.noMemos}</div>`;
    return;
  }

  // 현재 파일 메모와 다른 파일 메모 분리
  const currentFileMemos = allMemos.find(e => e.filePath === state.currentFile);
  const otherMemos = allMemos.filter(e => e.filePath !== state.currentFile);

  // 현재 파일 메모 그룹
  if (currentFileMemos && Object.keys(currentFileMemos.memos).length > 0) {
    const groupEl = document.createElement('div');
    groupEl.className = 'memo-group';
    groupEl.innerHTML = `<div class="memo-group-label">${s.currentFile}</div>`;

    Object.entries(currentFileMemos.memos).forEach(([lineKey, text]) => {
      const item = document.createElement('div');
      item.className = 'memo-sidebar-item current-file-memo';
      const preview = text.split('\n')[0].slice(0, 50);
      item.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="memo-sidebar-icon">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="memo-sidebar-text">${escapeHtml(preview)}</span>
      `;
      item.title = text;
      item.addEventListener('click', () => {
        const target = getMemoTargetByKey(lineKey);
        if (target) {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          target.classList.add('highlight-pulse');
          setTimeout(() => target.classList.remove('highlight-pulse'), 1200);
        }
      });
      groupEl.appendChild(item);
    });
    list.appendChild(groupEl);
  }

  // 다른 파일 메모 그룹
  if (otherMemos.length > 0) {
    const groupEl = document.createElement('div');
    groupEl.className = 'memo-group';
    if (currentFileMemos) groupEl.innerHTML = `<div class="memo-group-label">${s.otherFiles}</div>`;

    otherMemos.forEach(entry => {
      if (!entry.filePath) return;
      const memoCount = Object.keys(entry.memos).length;
      const fileName = entry.filePath.split('/').pop();
      const item = document.createElement('div');
      item.className = 'memo-sidebar-item other-file-memo';
      item.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="memo-sidebar-icon">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="memo-sidebar-text">${escapeHtml(fileName)}</span>
        <span class="memo-sidebar-count">${memoCount}</span>
      `;
      item.title = entry.filePath;
      item.addEventListener('click', () => openFile(entry.filePath));
      groupEl.appendChild(item);
    });
    list.appendChild(groupEl);
  }
}

// ===== 섹션 순서 적용 =====
function applySectionOrder() {
  const container = dom.sidebarSections;
  if (!container) return;
  const sectionMap = {
    locations: document.getElementById('section-locations'),
    recent: document.getElementById('section-recent'),
    favorites: document.getElementById('section-favorites'),
    memos: document.getElementById('section-memos'),
    filetree: document.getElementById('section-filetree'),
  };
  state.sectionOrder.forEach(key => {
    const el = sectionMap[key];
    if (el) container.appendChild(el);
  });
}

function normalizeSectionOrder(order) {
  const validSections = DEFAULT_SECTION_ORDER;
  const normalized = Array.isArray(order)
    ? order.filter(key => validSections.includes(key))
    : [];
  if (!normalized.includes('locations')) normalized.unshift('locations');
  validSections.forEach(key => {
    if (!normalized.includes(key)) normalized.push(key);
  });
  return normalized;
}

// ===== 섹션 드래그 앤 드롭 =====
function setupSectionDragAndDrop() {
  const container = dom.sidebarSections;
  if (!container) return;

  let dragging = null;       // 드래그 중인 섹션 el
  let placeholder = null;    // 위치 표시용 placeholder
  let startY = 0;
  let originIndex = 0;

  function getSections() {
    return [...container.querySelectorAll('.sidebar-section')];
  }

  function createPlaceholder(height) {
    const el = document.createElement('div');
    el.className = 'section-placeholder';
    el.style.cssText = `height:${height}px;background:var(--accent-color);opacity:0.25;border-radius:4px;margin:2px 4px;`;
    return el;
  }

  function saveSectionOrder() {
    const order = getSections().map(el => el.dataset.section);
    state.sectionOrder = order;
    localStorage.setItem('sectionOrder', JSON.stringify(order));
  }

  container.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const section = handle.closest('.sidebar-section');
      if (!section) return;

      dragging = section;
      startY = e.clientY;
      originIndex = getSections().indexOf(section);

      const rect = section.getBoundingClientRect();
      placeholder = createPlaceholder(rect.height);

      // 드래그 시작: 섹션을 fixed 레이어로 올리고 placeholder 삽입
      section.style.cssText = `
        position: fixed;
        top: ${rect.top}px;
        left: ${rect.left}px;
        width: ${rect.width}px;
        z-index: 9999;
        opacity: 0.85;
        pointer-events: none;
        box-shadow: 0 4px 16px rgba(0,0,0,0.18);
        background: var(--bg-primary);
        border-radius: 6px;
      `;
      container.insertBefore(placeholder, section.nextSibling);

      function onMouseMove(ev) {
        const dy = ev.clientY - startY;
        section.style.top = `${rect.top + dy}px`;

        // 어떤 섹션 위에 있는지 판단
        const sections = getSections().filter(s => s !== section && !s.classList.contains('section-placeholder'));
        let inserted = false;
        for (const s of sections) {
          const r = s.getBoundingClientRect();
          const mid = r.top + r.height / 2;
          if (ev.clientY < mid) {
            container.insertBefore(placeholder, s);
            inserted = true;
            break;
          }
        }
        if (!inserted) container.appendChild(placeholder);
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // 스타일 제거 및 placeholder 자리에 실제 섹션 삽입
        section.style.cssText = '';
        container.insertBefore(section, placeholder);
        placeholder.remove();
        placeholder = null;
        dragging = null;

        saveSectionOrder();
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}

// ===== 빈 편집기에서 새 파일 생성 =====
async function handleNewFileFromEditor(content) {
  // 입력을 일시 중단
  dom.editor.removeEventListener('input', handleEditorInput);
  const result = await window.electronAPI.saveNewFileDialog(content);
  dom.editor.addEventListener('input', handleEditorInput);
  if (result.success) {
    // 저장된 파일을 탭으로 열기
    await openFile(result.filePath);
    // 저장된 탭의 콘텐츠를 입력한 내용으로 덮어쓰기
    const tab = state.tabs.find(t => t.path === result.filePath);
    if (tab) {
      tab.content = content;
      tab.modified = false;
      state.lastSavedContent[tab.id] = content;
      dom.editor.value = content;
      renderMarkdown(content);
      renderTabs();
    }
    showToast('새 파일이 저장되었습니다.');
  } else if (!result.canceled) {
    // 취소가 아닌 실패 시 에디터 내용 복원
    dom.editor.value = content;
  } else {
    // 취소 시 에디터 내용 복원
    dom.editor.value = content;
  }
}

// ===== 홈 탭 =====
function initHomeTab() {
  const savedContent = localStorage.getItem('homeTabContent') || '';
  const homeTab = {
    id: HOME_TAB_ID,
    path: null,
    name: 'Home',
    content: savedContent,
    modified: false,
  };
  // 이미 있으면 다시 추가하지 않음
  if (!state.tabs.find(t => t.id === HOME_TAB_ID)) {
    state.tabs.unshift(homeTab);
  }
  activateTab(HOME_TAB_ID);
}

function updateToolbarForHomeTab(isHome) {
  const btnSave = document.getElementById('btn-save');
  const btnSaveMd = document.getElementById('btn-save-home-md');
  const btnRefreshFile = document.getElementById('btn-refresh-file');
  if (!btnSave || !btnSaveMd) return;
  if (isHome) {
    btnSave.style.display = 'none';
    btnSaveMd.style.display = '';
    if (btnRefreshFile) btnRefreshFile.style.display = 'none';
  } else {
    btnSave.style.display = '';
    btnSaveMd.style.display = 'none';
    if (btnRefreshFile) btnRefreshFile.style.display = '';
  }
  renderPinnedPanelActions('editor');
}

async function saveHomeTabAsMd() {
  const tab = state.tabs.find(t => t.id === HOME_TAB_ID);
  if (!tab) return;
  const result = await window.electronAPI.saveNewFileDialog(tab.content);
  if (result.success && result.filePath) {
    // 홈 탭 내용 초기화
    tab.content = '';
    tab.modified = false;
    dom.editor.value = '';
    renderMarkdown('');
    localStorage.removeItem('homeTabContent');
    // 저장된 파일을 새 탭으로 열기
    await openFile(result.filePath);
    showToast('MD 파일로 저장되었습니다.');
  }
}

// ===== 컨텍스트 메뉴 =====
let renameTarget = null; // { type, path, name }

function createContextMenu(e, menuItems) {
  const existing = document.getElementById('context-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.className = 'context-menu';

  menuItems.forEach(mi => {
    const btn = document.createElement('button');
    btn.className = 'context-menu-item';
    btn.textContent = mi.label;
    btn.addEventListener('click', () => {
      menu.remove();
      mi.onClick();
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  const menuW = menu.offsetWidth || 180;
  const menuH = menu.offsetHeight || 140;
  let x = e.clientX;
  let y = e.clientY;
  if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 4;
  if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 4;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const closeMenu = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('mousedown', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeMenu), 0);
}

function showSidebarContextMenu(e, config) {
  const s = i18nStrings[state.lang || 'ko'];
  const item = config.item;
  const menuItems = [
    { label: s.open, onClick: config.open },
    { label: s.showInFinder, onClick: () => window.electronAPI.showInFinder(item.path) },
    { label: s.copyPath, onClick: () => copyItemPath(item) },
  ];

  if (config.type === 'location') {
    menuItems.push({ label: s.openInTerminal, onClick: () => handleTerminalOpenRequest({ ...item, type: 'directory' }) });
    menuItems.push({ label: s.refreshLocations, onClick: config.refresh });
  } else if (config.type === 'favorite') {
    if (item.type === 'directory') {
      menuItems.push({ label: s.openInTerminal, onClick: () => handleTerminalOpenRequest(item) });
    }
    menuItems.push({ label: s.removeFavorite, onClick: config.remove });
  } else if (config.type === 'recent') {
    menuItems.push({ label: s.openInTerminal, onClick: () => handleTerminalOpenRequest({ ...item, type: 'file' }) });
    menuItems.push({ label: s.removeFromList, onClick: config.remove });
  }

  createContextMenu(e, menuItems);
}

function showContextMenu(e, item) {
  const isDir = item.type === 'directory';
  const s = i18nStrings[state.lang || 'ko'];
  const selectedItems = getSelectedTreeItems();
  const hasMultiSelection = selectedItems.length > 1 && selectedItems.some(selected => selected.path === item.path);
  const contextItems = hasMultiSelection ? selectedItems : [item];
  const menuItems = [
    ...(!hasMultiSelection ? [{ label: s.openInTerminal, action: 'terminal' }] : []),
    ...(!hasMultiSelection ? [{ label: s.showInFinder, action: 'finder' }] : []),
    { label: hasMultiSelection ? s.copySelectedPaths : (isDir ? s.copyFolderPath : s.copyFilePath), action: 'copyPath' },
    ...(!hasMultiSelection ? [{ label: s.rename, action: 'rename' }] : []),
    { label: hasMultiSelection ? s.moveSelected : s.moveTo, action: 'move' },
    { label: hasMultiSelection ? s.deleteSelected : s.delete, action: 'delete' },
    ...(!hasMultiSelection ? [{ label: isDir ? s.folderInfo : s.fileInfo, action: 'info' }] : []),
  ];

  createContextMenu(e, menuItems.map(mi => ({
    label: mi.label,
    onClick: () => handleContextMenuAction(mi.action, item, contextItems)
  })));
}

async function handleContextMenuAction(action, item, contextItems = [item]) {
  switch (action) {
    case 'terminal': {
      await handleTerminalOpenRequest(item);
      break;
    }
    case 'finder': {
      await window.electronAPI.showInFinder(item.path);
      break;
    }
    case 'copyPath': {
      if (contextItems.length > 1) copySelectedItemPaths(contextItems);
      else copyItemPath(item);
      break;
    }
    case 'rename': {
      openRenameModal(item);
      break;
    }
    case 'move': {
      await moveTreeItemsWithDialog(contextItems);
      break;
    }
    case 'delete': {
      await deleteTreeItems(contextItems);
      break;
    }
    case 'info': {
      const info = await window.electronAPI.getItemInfo(item.path);
      openItemInfoModal(item, info);
      break;
    }
  }
}

// ===== 경로 복사 =====
async function copyItemPath(item) {
  const s = i18nStrings[state.lang || 'ko'];
  try {
    await navigator.clipboard.writeText(item.path);
    showToast(s.copyPath + ': ' + item.name);
  } catch (e) {
    showToast(state.lang === 'en' ? 'Failed to copy path' : '경로 복사에 실패했습니다', 3000);
  }
}

async function copySelectedItemPaths(items) {
  const s = i18nStrings[state.lang || 'ko'];
  try {
    await navigator.clipboard.writeText(items.map(item => item.path).join('\n'));
    showToast(s.selectedPathsCopied.replace('{count}', items.length));
  } catch (e) {
    showToast(state.lang === 'en' ? 'Failed to copy paths' : '경로 복사에 실패했습니다', 3000);
  }
}

function copyCurrentPath() {
  const path = dom.statusPath.textContent;
  if (!path) return;
  navigator.clipboard.writeText(path).then(() => {
    showToast('경로가 복사되었습니다');
  });
}

// ===== 이름 변경 모달 =====
function openRenameModal(item) {
  renameTarget = item;
  dom.renameInput.value = item.name;
  dom.renameModal.style.display = 'flex';
  setTimeout(() => {
    dom.renameInput.focus();
    dom.renameInput.select();
  }, 50);
}

function closeRenameModal() {
  dom.renameModal.style.display = 'none';
  renameTarget = null;
}

function openTerminalPasteModal() {
  if (!dom.terminalPasteModal || !dom.terminalPasteInput) return;
  dom.terminalPasteInput.value = '';
  dom.terminalPasteModal.style.display = 'flex';
  setTimeout(() => {
    dom.terminalPasteInput.focus();
  }, 50);
}

function closeTerminalPasteModal() {
  if (!dom.terminalPasteModal || !dom.terminalPasteInput) return;
  dom.terminalPasteModal.style.display = 'none';
  dom.terminalPasteInput.value = '';
}

async function confirmTerminalPasteModal() {
  const text = dom.terminalPasteInput?.value || '';
  if (!text.length) {
    closeTerminalPasteModal();
    return;
  }
  closeTerminalPasteModal();
  const success = await pasteTextIntoEmbeddedTerminal(text);
  if (!success) {
    showToast(state.lang === 'en' ? 'Failed to insert text into terminal' : '터미널에 텍스트를 삽입하지 못했습니다', 3000);
  }
}

async function confirmRename() {
  if (!renameTarget) return;
  const item = { ...renameTarget };
  const newName = dom.renameInput.value.trim();
  if (!newName || newName === item.name) { closeRenameModal(); return; }
  closeRenameModal();
  const confirmed = await confirmFileOperation('rename', item, { newName });
  if (!confirmed) return;
  const result = await window.electronAPI.renameItem(item.path, newName);
  if (result.success) {
    const oldPath = item.path;
    const newPath = result.newPath;
    showToast(`'​${newName}'으로 이름이 변경되었습니다`);
    updateClientPathsAfterMove(oldPath, newPath);
    if (state.currentFolder) await refreshFileTreeAfterOperation();
  } else {
    showToast('이름 변경에 실패했습니다', 3000);
  }
}

async function deleteTreeItems(items) {
  const targetItems = normalizeTreeOperationItems(dedupeTreeItems(items));
  if (targetItems.length === 0) return;
  const confirmed = targetItems.length === 1
    ? await confirmFileOperation('delete', targetItems[0])
    : await confirmFileOperation('delete', {
        type: 'selection',
        name: `${targetItems.length}개 항목`
      });
  if (!confirmed) return;

  const canDelete = await prepareTabsForDelete(targetItems.map(item => item.path));
  if (!canDelete) return;

  for (const item of sortTreeItemsForDelete(targetItems)) {
    const result = await window.electronAPI.deleteItem(item.path);
    if (result.success) {
      await removeClientPathsForDeletedItem(item.path);
    } else {
      showToast(result.error || '삭제에 실패했습니다', 3000);
      if (state.currentFolder) await refreshFileTreeAfterOperation();
      return;
    }
  }
  showToast(targetItems.length === 1 ? `'${targetItems[0].name}'을(를) 휴지통으로 이동했습니다` : `${targetItems.length}개 항목을 휴지통으로 이동했습니다`);
  clearTreeSelection();
  if (state.currentFolder) await refreshFileTreeAfterOperation();
}

async function moveTreeItem(item, targetDirPath, targetName) {
  const items = item?.type === 'selection' ? item.items : [item];
  await moveTreeItems(items, targetDirPath, targetName);
}

async function moveTreeItemsWithDialog(items) {
  const result = await window.electronAPI.openFolderDialog();
  if (!result.success || !result.path) return;
  const targetName = getBaseName(result.path);
  await moveTreeItems(items, result.path, targetName);
}

async function moveTreeItems(items, targetDirPath, targetName) {
  const targetItems = normalizeTreeOperationItems(dedupeTreeItems(items));
  if (targetItems.length === 0 || !targetDirPath) return;
  const invalidItem = targetItems.find(item => !isValidMoveTarget(item, targetDirPath));
  if (invalidItem) {
    showToast('이동할 수 없는 대상이 포함되어 있습니다', 3000);
    return;
  }

  const confirmItem = targetItems.length === 1
    ? targetItems[0]
    : { type: 'selection', name: `${targetItems.length}개 항목` };
  const confirmed = await confirmFileOperation('move', confirmItem, { targetName });
  if (!confirmed) return;

  for (const item of sortTreeItemsForMove(targetItems)) {
    const result = await window.electronAPI.moveItem(item.path, targetDirPath);
    if (result.success) {
      updateClientPathsAfterMove(item.path, result.newPath);
    } else {
      showToast(result.error || '이동에 실패했습니다', 3000);
      if (state.currentFolder) await refreshFileTreeAfterOperation();
      return;
    }
  }
  showToast(targetItems.length === 1 ? `'${targetItems[0].name}'을(를) 이동했습니다` : `${targetItems.length}개 항목을 이동했습니다`);
  clearTreeSelection();
  if (state.currentFolder) await refreshFileTreeAfterOperation();
}

async function confirmFileOperation(action, item, details = {}) {
  if (state.fileOperationConfirmPrefs[action] === false) return true;
  const result = await window.electronAPI.showFileOperationConfirm({
    action,
    lang: state.lang || 'ko',
    itemType: item.type,
    itemName: item.name,
    targetName: details.targetName,
    newName: details.newName
  });
  if (result?.confirmed && result.dontAskAgain) {
    state.fileOperationConfirmPrefs[action] = false;
    localStorage.setItem(FILE_OPERATION_CONFIRM_STORAGE_KEY, JSON.stringify(state.fileOperationConfirmPrefs));
  }
  return !!result?.confirmed;
}

async function refreshFileTreeAfterOperation() {
  const openedDirs = getOpenDirectoryPaths();
  const result = await window.electronAPI.readDirectory(state.currentFolder);
  if (result.success) {
    renderFileTree(result.items);
    restoreOpenDirectoryPaths(openedDirs);
    updateActiveFileInTree(state.currentFile || '');
  }
}

async function prepareTabsForDelete(rootPaths) {
  const paths = Array.isArray(rootPaths) ? rootPaths : [rootPaths];
  const affectedTabs = state.tabs.filter(tab => tab.path && paths.some(rootPath => isSameOrChildPath(rootPath, tab.path)));
  for (const tab of affectedTabs) {
    if (!tab.modified) continue;
    const result = await window.electronAPI.showUnsavedDialog(tab.name);
    if (result.button === 0) {
      const saveResult = await window.electronAPI.writeFile(tab.path, tab.content);
      if (!saveResult.success) return false;
    } else if (result.button === 2) {
      return false;
    }
  }
  return true;
}

function sortTreeItemsForDelete(items) {
  return [...items].sort((a, b) => b.path.length - a.path.length);
}

function sortTreeItemsForMove(items) {
  return [...items].sort((a, b) => a.path.length - b.path.length);
}

function normalizeTreeOperationItems(items) {
  return items.filter(item => {
    return !items.some(other =>
      other.path !== item.path &&
      other.type === 'directory' &&
      isSameOrChildPath(other.path, item.path)
    );
  });
}

function clearTreeSelection() {
  state.selectedTreeItems = [];
  state.lastSelectedTreePath = null;
  updateTreeSelectionUI();
}

async function removeClientPathsForDeletedItem(rootPath) {
  const affectedTabIds = state.tabs
    .filter(tab => tab.path && isSameOrChildPath(rootPath, tab.path))
    .map(tab => tab.id);
  state.tabs = state.tabs.filter(tab => !tab.path || !isSameOrChildPath(rootPath, tab.path));
  affectedTabIds.forEach(tabId => {
    delete state.undoStacks[tabId];
    delete state.redoStacks[tabId];
    delete state.lastSavedContent[tabId];
  });

  state.favorites = state.favorites.filter(fav => !isSameOrChildPath(rootPath, fav.path));
  await saveFavorites();
  renderFavorites();

  state.recentFiles = state.recentFiles.filter(file => !isSameOrChildPath(rootPath, file.path));
  localStorage.setItem('recentFiles', JSON.stringify(state.recentFiles));
  renderRecentFiles();

  Object.keys(state.memos).forEach(filePath => {
    if (isSameOrChildPath(rootPath, filePath)) delete state.memos[filePath];
  });
  state.allMemos = state.allMemos.filter(entry => !entry.filePath || !isSameOrChildPath(rootPath, entry.filePath));
  if (state.activeMemoFilePath && isSameOrChildPath(rootPath, state.activeMemoFilePath)) closeMemoPanel();

  if (state.currentFile && isSameOrChildPath(rootPath, state.currentFile)) {
    state.currentFile = null;
    await activateTab(HOME_TAB_ID);
  } else if (!state.tabs.find(tab => tab.id === state.activeTabId)) {
    await activateTab(HOME_TAB_ID);
  } else {
    renderTabs();
  }
  renderMemosSidebar();
}

function updateClientPathsAfterMove(oldPath, newPath) {
  state.tabs.forEach(tab => {
    if (!tab.path || !isSameOrChildPath(oldPath, tab.path)) return;
    tab.path = replacePathRoot(tab.path, oldPath, newPath);
    tab.name = getBaseName(tab.path);
  });

  if (state.currentFile && isSameOrChildPath(oldPath, state.currentFile)) {
    state.currentFile = replacePathRoot(state.currentFile, oldPath, newPath);
  }

  state.favorites.forEach(fav => {
    if (!fav.path || !isSameOrChildPath(oldPath, fav.path)) return;
    fav.path = replacePathRoot(fav.path, oldPath, newPath);
    fav.name = getBaseName(fav.path);
  });
  saveFavorites();
  renderFavorites();

  state.recentFiles.forEach(file => {
    if (!file.path || !isSameOrChildPath(oldPath, file.path)) return;
    file.path = replacePathRoot(file.path, oldPath, newPath);
    file.name = getBaseName(file.path);
  });
  localStorage.setItem('recentFiles', JSON.stringify(state.recentFiles));
  renderRecentFiles();

  const updatedMemos = {};
  Object.entries(state.memos).forEach(([filePath, memos]) => {
    const nextPath = isSameOrChildPath(oldPath, filePath) ? replacePathRoot(filePath, oldPath, newPath) : filePath;
    updatedMemos[nextPath] = memos;
  });
  state.memos = updatedMemos;

  state.allMemos.forEach(entry => {
    if (entry.filePath && isSameOrChildPath(oldPath, entry.filePath)) {
      entry.filePath = replacePathRoot(entry.filePath, oldPath, newPath);
    }
  });
  if (state.activeMemoFilePath && isSameOrChildPath(oldPath, state.activeMemoFilePath)) {
    state.activeMemoFilePath = replacePathRoot(state.activeMemoFilePath, oldPath, newPath);
  }

  updateStatusBarForActiveTab();
  renderTabs();
  renderMemosSidebar();
}

function updateStatusBarForActiveTab() {
  const activeTab = state.tabs.find(t => t.id === state.activeTabId);
  if (!activeTab) return;
  if (activeTab.id === HOME_TAB_ID) {
    dom.statusPath.textContent = '';
    updateTitlebar('MDViewer');
    updatePreviewHeaderButtons(null);
  } else {
    updateTitlebar(activeTab.name);
    updateStatusBar(activeTab.path, activeTab.content);
    updatePreviewHeaderButtons(activeTab);
  }
}

function isSameOrChildPath(rootPath, targetPath) {
  if (!rootPath || !targetPath) return false;
  return targetPath === rootPath || targetPath.startsWith(rootPath + '/');
}

function replacePathRoot(targetPath, oldRoot, newRoot) {
  if (targetPath === oldRoot) return newRoot;
  return newRoot + targetPath.slice(oldRoot.length);
}

function getBaseName(filePath) {
  return filePath.split('/').pop() || filePath;
}

// ===== 아이템 정보 모달 =====
function openItemInfoModal(item, info) {
  const s = i18nStrings[state.lang || 'ko'];
  dom.itemInfoTitle.textContent = item.type === 'directory' ? s.folderInfo : s.fileInfo;
  const rows = [
    { label: s.infoName, value: item.name },
    { label: s.infoType, value: item.type === 'directory' ? s.infoFolder : s.infoFile },
    { label: s.infoPath, value: item.path },
  ];
  if (info) {
  if (info.size !== undefined) rows.push({ label: s.infoSize, value: formatFileSize(info.size) });
  if (info.created) rows.push({ label: s.infoCreated, value: new Date(info.created).toLocaleString() });
  if (info.modified) rows.push({ label: s.infoModified, value: new Date(info.modified).toLocaleString() });
  }
  dom.itemInfoBody.innerHTML = rows.map(r =>
    `<div class="item-info-row"><span class="item-info-label">${r.label}</span><span class="item-info-value">${escapeHtml(String(r.value))}</span></div>`
  ).join('');
  dom.itemInfoModal.style.display = 'flex';
}

function closeItemInfoModal() {
  dom.itemInfoModal.style.display = 'none';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ===== About 모달 =====
async function openAboutModal() {
  if (dom.aboutVersion && window.electronAPI.getAppVersion) {
    try {
      const version = await window.electronAPI.getAppVersion();
      dom.aboutVersion.textContent = `Version ${version}`;
    } catch (e) {
      dom.aboutVersion.textContent = 'Version';
    }
  }
  dom.aboutModal.style.display = 'flex';
}

function closeAboutModal() {
  dom.aboutModal.style.display = 'none';
}

// ===== 내장 터미널 =====
function setupTerminalListeners() {
  if (state.terminalListenersReady || !window.electronAPI?.onTerminalData) return;
  window.electronAPI.onTerminalData((data) => {
    state.terminalStarted = true;
    if (state.terminal) state.terminal.write(data);
  });
  window.electronAPI.onTerminalExit((code) => {
    state.terminalStarted = false;
    if (state.terminal) {
      state.terminal.writeln('');
      state.terminal.writeln(`[terminal exited: ${code}]`);
    }
    sendDetachedPanelState('terminal');
  });
  window.addEventListener('resize', debounce(resizeTerminalToPanel, 150));
  state.terminalListenersReady = true;
}

function focusEmbeddedTerminalInput() {
  if (!state.terminal) return;
  state.terminalInputActive = true;
  state.terminal.focus();
  if (state.terminal.textarea && typeof state.terminal.textarea.focus === 'function') {
    state.terminal.textarea.focus();
  }
}

function isEmbeddedTerminalContext(target = document.activeElement) {
  if (!state.panelVisibility.terminal || state.detachedPanels.terminal) return false;
  if (state.terminalInputActive) return true;
  if (target && dom.terminalPanel?.contains(target)) return true;
  if (target && state.terminal?.textarea && target === state.terminal.textarea) return true;
  return false;
}

function sendEmbeddedTerminalSequence(sequence) {
  if (!sequence || !state.terminalStarted) return;
  window.electronAPI.sendTerminalInput(sequence);
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

async function copyEmbeddedTerminalSelection() {
  const selection = captureEmbeddedTerminalSelection();
  if (!selection) return false;
  return writeClipboardTextSafely(selection);
}

function getEmbeddedTerminalSelectionText() {
  if (state.terminal?.hasSelection && state.terminal.hasSelection()) {
    const selection = state.terminal.getSelection();
    if (selection) return selection;
  }
  const browserSelection = window.getSelection?.()?.toString?.() || '';
  if (browserSelection.trim()) return browserSelection;
  return state.lastTerminalSelection || '';
}

function captureEmbeddedTerminalSelection() {
  const selection = getEmbeddedTerminalSelectionText();
  if (selection) state.lastTerminalSelection = selection;
  return state.lastTerminalSelection || '';
}

async function pasteTextIntoEmbeddedTerminal(text) {
  const pasteSequence = buildTerminalPasteSequence(text);
  if (!pasteSequence) return false;
  if (!state.terminalStarted) {
    const started = await openEmbeddedTerminalAt(getTerminalCwd());
    if (!started) return false;
  }
  await focusInternalTerminalSurface();
  sendEmbeddedTerminalSequence(pasteSequence);
  return true;
}

async function pasteIntoEmbeddedTerminal() {
  const text = window.electronAPI.readClipboardText();
  return pasteTextIntoEmbeddedTerminal(text);
}

async function handlePasteTerminalContent() {
  openTerminalPasteModal();
  return true;
}

function resolveClipboardFilePaths(clipboardData) {
  const eventPaths = getDraggedPathsFromDataTransfer(clipboardData);
  if (eventPaths.length) return eventPaths;
  return window.electronAPI.readClipboardFilePaths?.() || [];
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

function installEmbeddedTerminalInputBridge(target) {
  if (state.terminalInputBridgeReady) return;

  const activate = () => {
    if (!state.panelVisibility.terminal) return;
    focusEmbeddedTerminalInput();
  };

  target.addEventListener('mousedown', () => setTimeout(activate, 0));
  target.addEventListener('click', () => setTimeout(activate, 0));
  target.addEventListener('mouseup', () => {
    setTimeout(() => {
      captureEmbeddedTerminalSelection();
    }, 0);
  });
  document.addEventListener('selectionchange', () => {
    if (!state.panelVisibility.terminal) return;
    captureEmbeddedTerminalSelection();
  });
  window.addEventListener('focus', () => setTimeout(() => {
    if (state.terminalInputActive) activate();
  }, 0));

  document.addEventListener('mousedown', (event) => {
    if (target.contains(event.target)) {
      state.terminalInputActive = true;
      return;
    }
    if (!event.target.closest('.terminal-panel')) {
      state.terminalInputActive = false;
    }
  }, true);

  document.addEventListener('copy', (event) => {
    if (!state.panelVisibility.terminal) return;
    const selection = captureEmbeddedTerminalSelection();
    if (!selection) return;
    event.preventDefault();
    event.clipboardData?.setData('text/plain', selection);
    void writeClipboardTextSafely(selection);
  }, true);

  document.addEventListener('paste', async (event) => {
    if (!state.panelVisibility.terminal || !state.terminalInputActive) return;
    const pastedPaths = resolveClipboardFilePaths(event.clipboardData);
    if (pastedPaths.length) {
      event.preventDefault();
      await insertPathsIntoInternalTerminal(pastedPaths);
      return;
    }
    const pastedText = event.clipboardData?.getData('text/plain') || window.electronAPI.readClipboardText();
    if (!pastedText) return;
    event.preventDefault();
    await pasteTextIntoEmbeddedTerminal(pastedText);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (!state.panelVisibility.terminal || !state.terminalInputActive) return;
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      void (async () => {
        await handlePasteTerminalContent();
      })();
      return;
    }
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
      const selection = captureEmbeddedTerminalSelection();
      if (!selection) return;
      event.preventDefault();
      void writeClipboardTextSafely(selection);
      return;
    }
    if (!state.terminalStarted) return;
    if (state.terminalComposing || event.isComposing) return;
    if (!(event.altKey && event.key === 'Backspace') && !(event.metaKey && event.key === 'Backspace')) return;
    const sequence = translateTerminalKey(event);
    if (!sequence) return;
    event.preventDefault();
    sendEmbeddedTerminalSequence(sequence);
  }, true);

  state.terminalInputBridgeReady = true;
}

function installEmbeddedTerminalTextareaBridge() {
  const textarea = state.terminal?.textarea;
  if (!textarea || textarea.dataset.mdviewerBridgeInstalled === 'true') return;
  textarea.dataset.mdviewerBridgeInstalled = 'true';

  textarea.addEventListener('paste', async (event) => {
    if (!state.panelVisibility.terminal) return;
    event.preventDefault();
    const pastedPaths = resolveClipboardFilePaths(event.clipboardData);
    if (pastedPaths.length) {
      await insertPathsIntoInternalTerminal(pastedPaths);
      return;
    }
    const pastedText = event.clipboardData?.getData('text/plain') || window.electronAPI.readClipboardText();
    if (!pastedText) return;
    await pasteTextIntoEmbeddedTerminal(pastedText);
  });

  textarea.addEventListener('keydown', (event) => {
    if (!state.panelVisibility.terminal) return;
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      void (async () => {
        await handlePasteTerminalContent();
      })();
      return;
    }
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
      const selection = captureEmbeddedTerminalSelection();
      if (!selection) return;
      event.preventDefault();
      void writeClipboardTextSafely(selection);
      return;
    }
    if (!state.terminalStarted) return;
    if (state.terminalComposing || event.isComposing) return;
    if (!(event.altKey && event.key === 'Backspace') && !(event.metaKey && event.key === 'Backspace')) return;
    const sequence = translateTerminalKey(event);
    if (!sequence) return;
    event.preventDefault();
    sendEmbeddedTerminalSequence(sequence);
  });
}

function ensureTerminal() {
  if (state.terminal) return state.terminal;
  const TerminalCtor = window.Terminal;
  const FitAddonCtor = window.FitAddon?.FitAddon;
  if (!TerminalCtor) {
    showToast(i18nStrings[state.lang || 'ko'].terminalLoadFailed);
    return null;
  }
  state.terminal = new TerminalCtor({
    cursorBlink: true,
    fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.3,
    theme: getTerminalTheme()
  });
  state.terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true;
    if (event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'c') {
      const selection = captureEmbeddedTerminalSelection();
      if (!selection) return true;
      void writeClipboardTextSafely(selection);
      return false;
    }
    return true;
  });
  state.terminal.onSelectionChange(() => {
    setTimeout(() => {
      captureEmbeddedTerminalSelection();
    }, 0);
  });
  if (FitAddonCtor) {
    state.terminalFitAddon = new FitAddonCtor();
    state.terminal.loadAddon(state.terminalFitAddon);
  }
  state.terminal.onData((data) => {
    if (!data || !state.terminalStarted) return;
    window.electronAPI.sendTerminalInput(data);
  });
  if (dom.terminalEmpty) dom.terminalEmpty.style.display = 'none';
  state.terminal.open(dom.terminalContainer);
  if (state.terminalFitAddon) {
    requestAnimationFrame(() => {
      try { state.terminalFitAddon.fit(); } catch (e) {}
    });
  }
  installEmbeddedTerminalInputBridge(dom.terminalContainer);
  if (state.terminal.textarea) {
    installEmbeddedTerminalTextareaBridge();
    state.terminal.textarea.addEventListener('compositionstart', () => {
      state.terminalComposing = true;
    });
    state.terminal.textarea.addEventListener('compositionend', () => {
      state.terminalComposing = false;
    });
  }
  setupTerminalListeners();
  return state.terminal;
}

async function startTerminal() {
  const terminal = ensureTerminal();
  if (!terminal || state.terminalStarted) return;
  const size = estimateTerminalSize();
  terminal.resize(size.cols, size.rows);
  terminal.writeln('Starting zsh...');
  const result = await window.electronAPI.startTerminal({
    cwd: state.terminalCwd || getTerminalCwd(),
    cols: size.cols,
    rows: size.rows
  });
  if (!result?.success) {
    terminal.writeln(`Failed to start terminal: ${result?.error || 'unknown error'}`);
    showToast(i18nStrings[state.lang || 'ko'].terminalStartFailed);
    return;
  }
  state.terminalStarted = true;
  state.terminalCwd = result.cwd || state.terminalCwd || getTerminalCwd();
  focusEmbeddedTerminalInput();
  sendDetachedPanelState('terminal');
}

async function restartTerminal() {
  if (!state.panelVisibility.terminal) {
    state.panelVisibility.terminal = true;
    state.viewMode = 'custom';
    localStorage.setItem('viewMode', state.viewMode);
    syncPanelLayout();
  }
  if (state.terminal) state.terminal.reset();
  state.terminalStarted = false;
  state.terminalCwd = state.terminalCwd || getTerminalCwd();
  await startTerminal();
  sendDetachedPanelState('terminal');
}

async function stopTerminal() {
  await window.electronAPI.stopTerminal();
  state.terminalStarted = false;
  state.terminalCwd = null;
  if (state.terminal) {
    state.terminal.writeln('');
    state.terminal.writeln('[terminal stopped]');
  }
  sendDetachedPanelState('terminal');
}

// ===== i18n 언어 시스템 =====
const i18nStrings = {
  ko: {
    openFolder: '폴더 열기',
    open: '열기',
    folderBack: '이전 폴더',
    folderForward: '다음 폴더',
    selectFolder: '폴더를 선택하세요',
    searchPlaceholder: '파일 내용 검색...',
    recentFiles: '최근 본 파일',
    noRecentFiles: '최근 본 파일이 없습니다',
    favorites: '즐겨찾기',
    noFavorites: '즐겨찾기가 없습니다',
    favoriteSort: '즐겨찾기 정렬',
    favoriteSortCustom: '직접 정렬',
    favoriteSortName: '이름순',
    favoriteSortRecent: '최근 추가순',
    fileExplorer: '파일 탐색기',
    locations: '위치',
    noLocations: '위치를 불러올 수 없습니다',
    refreshLocations: '위치 새로고침',
    locationsRefreshed: '위치를 새로고침했습니다',
    locationsRefreshFailed: '위치 새로고침에 실패했습니다',
    rootFolderBlocked: '너무 큰 루트 위치는 직접 열 수 없습니다',
    refreshFolder: '폴더 새로고침',
    folderRefreshed: '폴더를 새로고침했습니다',
    folderRefreshFailed: '폴더 새로고침에 실패했습니다',
    noFolderToRefresh: '새로고침할 폴더가 없습니다',
    openFolderHint: '폴더를 열어<br>Markdown/HTML 파일을 탐색하세요',
    edit: '편집',
    preview: '미리보기',
    terminal: '터미널',
    insertFile: '파일 삽입',
    insertFolder: '폴더 삽입',
    terminalPaste: '텍스트 삽입',
    terminalPastePlaceholder: '여기에 붙여넣고 터미널로 보냅니다',
    insert: '삽입',
    terminalRestart: '재시작',
    terminalStop: '종료',
    detachPanel: '새 창',
    dockPanel: '도킹',
    dragToDetach: '놓으면 새 창으로 분리',
    detachedPanelOpenFailed: '패널 새 창 열기에 실패했습니다',
    terminalHint: '터미널 패널을 열면 현재 경로에서 zsh가 시작됩니다',
    terminalLoadFailed: '터미널 모듈을 불러오지 못했습니다',
    terminalStartFailed: '터미널 시작에 실패했습니다',
    panelAtLeastOne: '패널은 최소 하나 이상 열려 있어야 합니다',
    copyAll: '전문 복사',
    refreshFile: '새로고침',
    undo: '실행 취소',
    redo: '다시 실행',
    fileRefreshed: '현재 파일을 새로고침했습니다',
    fileRefreshFailed: '현재 파일 새로고침에 실패했습니다',
    noFileToRefresh: '새로고침할 파일이 없습니다',
    save: '저장',
    saveAsMd: 'MD로 저장',
    copy: '복사',
    pinHeaderAction: '헤더에 고정',
    unpinHeaderAction: '헤더에서 해제',
    configureHeaderActions: '헤더 버튼 구성',
    exportMemos: '메모 내보내기',
    applyMemos: '본문 적용',
    memosApplied: '메모를 본문에 적용했습니다',
    mdMemoApplyOnly: 'Markdown 파일에서만 메모를 본문에 적용할 수 있습니다',
    lineMemo: '줄 메모',
    delete: '삭제',
    revealInTree: '위치 보기',
    addFavorite: '즐겨찾기',
    removeFavorite: '즐겨찾기 해제',
    copyPath: '경로 복사',
    copyFolderPath: '폴더 경로 복사',
    copyFilePath: '파일 경로 복사',
    copySelectedPaths: '선택 항목 경로 복사',
    selectedPathsCopied: '{count}개 항목의 경로를 복사했습니다',
    openInTerminal: '터미널에서 열기',
    showInFinder: 'Finder에서 보기',
    memos: '메모',
    rename: '이름 변경',
    moveTo: '이동...',
    moveSelected: '선택 항목 이동...',
    deleteSelected: '선택 항목 삭제',
    cancel: '취소',
    confirm: '변경',
    info: '정보',
    memoPlaceholder: '이 줄에 대한 메모를 입력하세요...',
    renameInputPlaceholder: '새 이름 입력...',
    noMdFiles: 'Markdown/HTML 파일이 없습니다',
    homeTabHint: '홈 탭 — 메모장으로 사용 가능',
    viewPreviewOnly: '미리보기만 보기',
    viewSplit: '분할 보기',
    viewEditOnly: '편집만 보기',
    closeAllTabs: '전체 탭 닫기',
    allTabsClosed: '전체 탭을 닫았습니다',
    noTabsToClose: '닫을 탭이 없습니다',
    panelSwapToLeft: '편집을 왼쪽으로',
    panelSwapToRight: '미리보기를 왼쪽으로',
    statusLines: '줄',
    statusWords: '단어',
    statusChars: '자',
    memoTitle: '메모',
    folderInfo: '폴더 정보',
    fileInfo: '파일 정보',
    infoName: '이름',
    infoType: '종류',
    infoPath: '경로',
    infoSize: '크기',
    infoCreated: '생성일',
    infoModified: '수정일',
    infoFolder: '폴더',
    infoFile: '파일',
    removeFromList: '목록에서 제거',
    addMemo: '메모 추가',
    editMemo: '메모 보기/수정',
    favRemove: '즐겨찾기 제거',
    noMemos: '저장된 메모가 없습니다',
    currentFile: '현재 파일',
    otherFiles: '다른 파일',
    welcomeDesc: 'GitHub 스타일 Markdown 뷰어',
    feat1: '📁 폴더 탐색기 (깊은 폴더 지원)',
    feat2: '⭐ 즐겨찾기',
    feat3: '✏️ 실시간 편집 + 미리보기',
    feat4: '💬 줄 단위 메모',
    feat5: '🔍 파일 내용 검색',
    feat6: '🌙 다크 모드',
    createdAt: '제작일',
    updatedAt: '업데이트일',
  },
  en: {
    openFolder: 'Open Folder',
    open: 'Open',
    folderBack: 'Previous Folder',
    folderForward: 'Next Folder',
    selectFolder: 'Select a folder',
    searchPlaceholder: 'Search file contents...',
    recentFiles: 'Recent Files',
    noRecentFiles: 'No recent files',
    favorites: 'Favorites',
    noFavorites: 'No favorites yet',
    favoriteSort: 'Sort Favorites',
    favoriteSortCustom: 'Custom Order',
    favoriteSortName: 'Name',
    favoriteSortRecent: 'Recently Added',
    fileExplorer: 'File Explorer',
    locations: 'Locations',
    noLocations: 'No locations available',
    refreshLocations: 'Refresh Locations',
    locationsRefreshed: 'Locations refreshed',
    locationsRefreshFailed: 'Failed to refresh locations',
    rootFolderBlocked: 'Root locations are too large to open directly',
    refreshFolder: 'Refresh Folder',
    folderRefreshed: 'Folder refreshed',
    folderRefreshFailed: 'Failed to refresh folder',
    noFolderToRefresh: 'No folder to refresh',
    openFolderHint: 'Open a folder to<br>browse Markdown/HTML files',
    edit: 'Edit',
    preview: 'Preview',
    terminal: 'Terminal',
    insertFile: 'Insert File',
    insertFolder: 'Insert Folder',
    terminalPaste: 'Insert Text',
    terminalPastePlaceholder: 'Paste here, then send it to the terminal',
    insert: 'Insert',
    terminalRestart: 'Restart',
    terminalStop: 'Stop',
    detachPanel: 'New Window',
    dockPanel: 'Dock',
    dragToDetach: 'Release to detach into a new window',
    detachedPanelOpenFailed: 'Failed to open panel window',
    terminalHint: 'Opening the terminal panel starts zsh in the current path',
    terminalLoadFailed: 'Failed to load the terminal module',
    terminalStartFailed: 'Failed to start terminal',
    panelAtLeastOne: 'At least one panel must stay open',
    copyAll: 'Copy All',
    refreshFile: 'Refresh',
    undo: 'Undo',
    redo: 'Redo',
    fileRefreshed: 'Current file refreshed',
    fileRefreshFailed: 'Failed to refresh current file',
    noFileToRefresh: 'No file to refresh',
    save: 'Save',
    saveAsMd: 'Save as MD',
    copy: 'Copy',
    pinHeaderAction: 'Pin to header',
    unpinHeaderAction: 'Remove from header',
    configureHeaderActions: 'Configure Header Actions',
    exportMemos: 'Export Memos',
    applyMemos: 'Apply Memos',
    memosApplied: 'Memos applied to the document',
    mdMemoApplyOnly: 'Memo apply is available for Markdown files only',
    lineMemo: 'Line Memo',
    delete: 'Delete',
    revealInTree: 'Reveal in Tree',
    addFavorite: 'Favorite',
    removeFavorite: 'Unfavorite',
    copyPath: 'Copy Path',
    copyFolderPath: 'Copy Folder Path',
    copyFilePath: 'Copy File Path',
    copySelectedPaths: 'Copy Selected Paths',
    selectedPathsCopied: 'Copied paths for {count} items',
    openInTerminal: 'Open in Terminal',
    showInFinder: 'Show in Finder',
    memos: 'Memos',
    rename: 'Rename',
    moveTo: 'Move...',
    moveSelected: 'Move Selected...',
    deleteSelected: 'Delete Selected',
    cancel: 'Cancel',
    confirm: 'Rename',
    info: 'Info',
    memoPlaceholder: 'Enter a memo for this line...',
    renameInputPlaceholder: 'Enter new name...',
    noMdFiles: 'No Markdown/HTML files',
    homeTabHint: 'Home — Use as notepad',
    viewPreviewOnly: 'Preview only',
    viewSplit: 'Split view',
    viewEditOnly: 'Edit only',
    closeAllTabs: 'Close All Tabs',
    allTabsClosed: 'All tabs closed',
    noTabsToClose: 'No tabs to close',
    panelSwapToLeft: 'Move editor to left',
    panelSwapToRight: 'Move preview to left',
    statusLines: 'lines',
    statusWords: 'words',
    statusChars: 'chars',
    memoTitle: 'Memo',
    folderInfo: 'Folder Info',
    fileInfo: 'File Info',
    infoName: 'Name',
    infoType: 'Type',
    infoPath: 'Path',
    infoSize: 'Size',
    infoCreated: 'Created',
    infoModified: 'Modified',
    infoFolder: 'Folder',
    infoFile: 'File',
    removeFromList: 'Remove from list',
    addMemo: 'Add memo',
    editMemo: 'View/edit memo',
    favRemove: 'Remove favorite',
    noMemos: 'No saved memos',
    currentFile: 'Current file',
    otherFiles: 'Other files',
    welcomeDesc: 'GitHub-style Markdown Viewer',
    feat1: '📁 File Explorer (deep folder support)',
    feat2: '⭐ Favorites',
    feat3: '✏️ Live Edit + Preview',
    feat4: '💬 Line Memos',
    feat5: '🔍 Full-text Search',
    feat6: '🌙 Dark Mode',
    createdAt: 'Created',
    updatedAt: 'Updated',
  }
};

function toggleLangDropdown() {
  const isVisible = dom.langDropdown.style.display !== 'none';
  dom.langDropdown.style.display = isVisible ? 'none' : 'block';
}

function closeLangDropdown() {
  dom.langDropdown.style.display = 'none';
}

function setLanguage(lang) {
  state.lang = lang;
  localStorage.setItem('lang', lang);
  dom.langLabel.textContent = lang === 'ko' ? 'KO' : 'EN';
  // 드롭다운 active 표시
  document.querySelectorAll('.lang-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  closeLangDropdown();
  applyI18n();
}

function applyI18n() {
  const lang = state.lang || 'ko';
  const strings = i18nStrings[lang];
  if (!strings) return;
  // data-i18n 속성이 있는 요소에 텍스트 적용
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (strings[key] !== undefined) {
      if (key === 'openFolderHint') {
        el.innerHTML = strings[key];
      } else {
        el.textContent = strings[key];
      }
    }
  });
  // placeholder 적용
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (strings[key] !== undefined) el.placeholder = strings[key];
  });
  // 에디터 placeholder
  if (dom.editor) {
    dom.editor.placeholder = lang === 'ko' ? 'Markdown 또는 HTML을 입력하세요...' : 'Enter Markdown or HTML...';
  }
  if (dom.btnRefreshFolder) {
    dom.btnRefreshFolder.title = strings.refreshFolder;
  }
  if (dom.btnRefreshFile) {
    dom.btnRefreshFile.title = strings.refreshFile;
  }
  if (dom.btnCloseAllTabs) {
    dom.btnCloseAllTabs.title = strings.closeAllTabs;
  }
  if (dom.btnApplyMemos) {
    dom.btnApplyMemos.title = strings.applyMemos;
  }
  if (dom.btnFolderBack) {
    dom.btnFolderBack.title = strings.folderBack;
  }
  if (dom.btnFolderForward) {
    dom.btnFolderForward.title = strings.folderForward;
  }
  if (dom.btnRefreshLocations) {
    dom.btnRefreshLocations.title = strings.refreshLocations;
  }
  if (dom.btnFavoritesSort) {
    dom.btnFavoritesSort.title = strings.favoriteSort;
  }
  // html lang 속성
  document.documentElement.lang = lang;

  // 동적으로 생성된 텍스트 즉시 갱신
  const s = strings;

  // 상태바 - 현재 파일이 열려 있으면 줄/단어/자 단위 갱신
  const activeTab = state.tabs.find(t => t.id === state.activeTabId);
  if (activeTab) {
    if (activeTab.id === '__home__') {
      dom.statusInfo.textContent = s.homeTabHint;
    } else {
      updateStatusBar(activeTab.path, activeTab.content);
    }
  }

  // 메모 섹션 즉시 갱신
  renderMemosSidebar();
  renderLocations();
  renderAllPinnedPanelActions();

  // 보기 모드 버튼 tooltip 갱신
  if (state.viewMode) setViewMode(state.viewMode);

  // 패널 순서 버튼 tooltip 갱신
  if (state.panelOrder) setPanelOrder(state.panelOrder);
  syncDetachedPanels();
}

function showToast(message, duration = 2500) {
  dom.toast.textContent = message;
  dom.toast.classList.add('show');
  clearTimeout(dom.toast._timer);
  dom.toast._timer = setTimeout(() => dom.toast.classList.remove('show'), duration);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ===== 키보드 단축키 =====
function handleKeydown(e) {
  const isMac = navigator.platform.includes('Mac');
  const mod = isMac ? e.metaKey : e.ctrlKey;

  if (mod && !e.shiftKey && e.key.toLowerCase() === 'v' && isEmbeddedTerminalContext(e.target)) {
    e.preventDefault();
    void (async () => {
      await handlePasteTerminalContent();
    })();
    return;
  }

  if (mod && !e.shiftKey && e.key.toLowerCase() === 'c' && isEmbeddedTerminalContext(e.target)) {
    if (getEmbeddedTerminalSelectionText()) {
      e.preventDefault();
      void copyEmbeddedTerminalSelection();
      return;
    }
  }

  if (mod && e.key === 's') { e.preventDefault(); saveCurrentFile(); }
  if (mod && e.key === 'f') { e.preventDefault(); toggleSearch(); }
  if (mod && e.shiftKey && e.key === 'C') { e.preventDefault(); copyAllContent(); }
  if (mod && e.shiftKey && e.key === 'E') { e.preventDefault(); exportMemos(); }

  if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); editorUndo(); }
  if (mod && e.shiftKey && e.key === 'z') { e.preventDefault(); editorRedo(); }
  if (mod && e.key === 'y') { e.preventDefault(); editorRedo(); }

  if (e.key === 'Escape') {
    // 컨텍스트 메뉴 닫기
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) { existingMenu.remove(); return; }
    if (dom.renameModal && dom.renameModal.style.display !== 'none') { closeRenameModal(); return; }
    if (dom.itemInfoModal && dom.itemInfoModal.style.display !== 'none') { closeItemInfoModal(); return; }
    if (dom.aboutModal.style.display !== 'none') { closeAboutModal(); return; }
    if (dom.memoPanel.style.display !== 'none') { closeMemoPanel(); return; }
    if (document.activeElement === dom.searchInput) { dom.searchInput.blur(); clearSearch(); return; }
  }

  if (mod && e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key) - 1;
    if (state.tabs[idx]) { e.preventDefault(); activateTab(state.tabs[idx].id); }
  }

  if (mod && e.key === 'w') {
    e.preventDefault();
    if (state.activeTabId) closeTab(state.activeTabId);
  }
}

// ===== 앱 시작 =====
// marked.js와 highlight.js는 index.html에서 미리 로드됨
(async () => {
  startBootOverlay();
  try {
    await init();
  } finally {
    await finishBootOverlay();
  }
})();
