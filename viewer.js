const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { PDFDocument } = require('pdf-lib');
// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.js');

// State
let pdfDocument = null;
let currentPage = 1;
let totalPages = 0;
let currentScale = 1.0;
let pdfFilePath = null;
let highlights = [];
let bookmarks = [];
let isHighlightMode = false;
let isOCRMode = false;
let selectedColor = '#FFFF00';
let selectionStart = null;
let currentHighlightId = null;
let mergeFiles = [];

// Helper: get user data path (sync)
function getUserDataPath() {
  return ipcRenderer.sendSync('get-user-data-path');
}

// DOM elements
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const loading = document.getElementById('loading');
const canvasWrapper = document.getElementById('canvasWrapper');
const viewerContainer = document.getElementById('viewerContainer');
const highlightLayer = document.getElementById('highlightLayer');
const selectionRect = document.getElementById('selectionRect');

const pageNumInput = document.getElementById('pageNum');
const pageCountSpan = document.getElementById('pageCount');
const zoomLevelSpan = document.getElementById('zoomLevel');

const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const zoomInBtn = document.getElementById('zoomIn');
const zoomOutBtn = document.getElementById('zoomOut');
const backButton = document.getElementById('backButton');
const highlightModeBtn = document.getElementById('highlightMode');
const colorPicker = document.getElementById('colorPicker');
const bookmarkToggleBtn = document.getElementById('bookmarkToggle');

const noteModal = document.getElementById('noteModal');
const noteText = document.getElementById('noteText');
const noteSave = document.getElementById('noteSave');
const noteCancel = document.getElementById('noteCancel');

const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmOk = document.getElementById('confirmOk');
const confirmCancel = document.getElementById('confirmCancel');

const mergeModal = document.getElementById('mergeModal');
const mergeButton = document.getElementById('mergeButton');
const selectMergeFiles = document.getElementById('selectMergeFiles');
const mergeFileList = document.getElementById('mergeFileList');
const mergeExecute = document.getElementById('mergeExecute');
const mergeCancel = document.getElementById('mergeCancel');

const splitModal = document.getElementById('splitModal');
const splitButton = document.getElementById('splitButton');
const splitStartPage = document.getElementById('splitStartPage');
const splitEndPage = document.getElementById('splitEndPage');
const splitInfo = document.getElementById('splitInfo');
const splitExecute = document.getElementById('splitExecute');
const splitCancel = document.getElementById('splitCancel');

const ocrModal = document.getElementById('ocrModal');
const ocrModalTitle = document.getElementById('ocrModalTitle');
const ocrLoading = document.getElementById('ocrLoading');
const ocrResult = document.getElementById('ocrResult');
const ocrProgressText = document.getElementById('ocrProgressText');
const ocrHintText = document.getElementById('ocrHintText');
const ocrText = document.getElementById('ocrText');
const ocrClose = document.getElementById('ocrClose');
const ocrCopy = document.getElementById('ocrCopy');
const ocrModeBtn = document.getElementById('ocrMode');
const textLayerDiv = document.getElementById('textLayer');

const thumbnailsContent = document.getElementById('thumbnailsContent');
const bookmarksContent = document.getElementById('bookmarksContent');

// Initialize
function init() {
  // Get PDF file path from URL
  const urlParams = new URLSearchParams(window.location.search);
  pdfFilePath = urlParams.get('file');
  const action = urlParams.get('action');

  if (!pdfFilePath) {
    alert('PDF 파일이 선택되지 않았습니다.');
    window.location.href = 'index.html';
    return;
  }

  // Event listeners
  setupEventListeners();

  // Defer PDF loading until the window is actually visible.
  // Canvas rendering silently fails in hidden Electron windows (show:false).
  // When launched cold via "Open with", the window is hidden until
  // ready-to-show fires; visibilitychange then lets us know it is safe to
  // render into canvases.  When navigating from index.html the window is
  // already visible so we start immediately.
  function startLoading() {
    loadPDF(pdfFilePath).then(() => {
      if (action === 'split') openSplitModal();
    });
  }

  if (document.visibilityState === 'visible') {
    startLoading();
  } else {
    document.addEventListener('visibilitychange', function onVisible() {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVisible);
        startLoading();
      }
    });
  }
}

// Setup event listeners
function setupEventListeners() {
  // Navigation
  backButton.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  });

  pageNumInput.addEventListener('change', () => {
    const pageNum = parseInt(pageNumInput.value);
    if (pageNum >= 1 && pageNum <= totalPages) {
      goToPage(pageNum);
    } else {
      pageNumInput.value = currentPage;
    }
  });

  // Zoom buttons
  zoomInBtn.addEventListener('click', () => {
    if (currentScale < 3.0) {
      currentScale = Math.min(3.0, currentScale + 0.25);
      renderPage(currentPage);
      updateZoomLevel();
    }
  });

  zoomOutBtn.addEventListener('click', () => {
    if (currentScale > 0.5) {
      currentScale = Math.max(0.5, currentScale - 0.25);
      renderPage(currentPage);
      updateZoomLevel();
    }
  });

  // Ctrl+Wheel zoom
  viewerContainer.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0 && currentScale < 3.0) {
      currentScale = Math.min(3.0, currentScale + 0.25);
    } else if (e.deltaY > 0 && currentScale > 0.5) {
      currentScale = Math.max(0.5, currentScale - 0.25);
    } else {
      return;
    }
    renderPage(currentPage);
    updateZoomLevel();
  }, { passive: false });

  // Handle open-pdf from main menu
  ipcRenderer.on('open-pdf', (event, filePath) => {
    window.location.href = `viewer.html?file=${encodeURIComponent(filePath)}`;
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (noteModal.classList.contains('show') ||
        mergeModal.classList.contains('show') ||
        splitModal.classList.contains('show') ||
        confirmModal.classList.contains('show') ||
        ocrModal.classList.contains('show')) {
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomInBtn.click();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOutBtn.click();
      }
      // Ctrl+O is handled by main process menu → 'open-pdf' IPC event
    } else if (e.key === 'ArrowLeft') {
      prevPageBtn.click();
    } else if (e.key === 'ArrowRight') {
      nextPageBtn.click();
    } else if (e.key === 'b' || e.key === 'B') {
      bookmarkToggleBtn.click();
    }
  });

  // Highlight mode
  highlightModeBtn.addEventListener('click', () => {
    isHighlightMode = !isHighlightMode;
    if (isHighlightMode) {
      // Deactivate OCR mode if active
      if (isOCRMode) {
        isOCRMode = false;
        ocrModeBtn.classList.remove('active');
      }
      highlightModeBtn.classList.add('active');
      colorPicker.style.display = 'flex';
      // Disable text layer so canvas gets mouse events
      textLayerDiv.style.pointerEvents = 'none';
    } else {
      highlightModeBtn.classList.remove('active');
      colorPicker.style.display = 'none';
      // Re-enable text layer for text selection
      textLayerDiv.style.pointerEvents = 'auto';
    }
  });

  // OCR mode (for scanned/image PDFs)
  ocrModeBtn.addEventListener('click', () => {
    isOCRMode = !isOCRMode;
    if (isOCRMode) {
      // Deactivate highlight mode if active
      if (isHighlightMode) {
        isHighlightMode = false;
        highlightModeBtn.classList.remove('active');
        colorPicker.style.display = 'none';
      }
      ocrModeBtn.classList.add('active');
      selectionRect.classList.add('ocr-mode');
      // Disable text layer so canvas gets mouse events
      textLayerDiv.style.pointerEvents = 'none';
    } else {
      ocrModeBtn.classList.remove('active');
      selectionRect.classList.remove('ocr-mode');
      // Re-enable text layer
      textLayerDiv.style.pointerEvents = 'auto';
    }
  });

  // Text selection: capture selection on mouseup in text layer (default mode)
  textLayerDiv.addEventListener('mouseup', () => {
    if (isHighlightMode || isOCRMode) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text) {
        showTextResult(text);
        sel.removeAllRanges();
      }
    }, 30);
  });

  // OCR modal: close button
  ocrClose.addEventListener('click', closeOCRModal);

  // OCR modal: copy button
  ocrCopy.addEventListener('click', () => {
    const text = ocrText.value;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        const orig = ocrCopy.textContent;
        ocrCopy.textContent = '복사됨 ✓';
        setTimeout(() => { ocrCopy.textContent = orig; }, 1500);
      });
    }
  });

  // OCR modal: close on backdrop click
  ocrModal.addEventListener('click', (e) => {
    if (e.target === ocrModal) closeOCRModal();
  });

  // Color picker
  const colorButtons = colorPicker.querySelectorAll('.color-button');
  colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      colorButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedColor = btn.dataset.color;
    });
  });

  // Bookmark toggle
  bookmarkToggleBtn.addEventListener('click', () => {
    toggleBookmark(currentPage);
  });

  // Canvas mouse events for highlighting
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);

  // Sidebar tabs
  const sidebarTabs = document.querySelectorAll('.sidebar-tab');
  sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      sidebarTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (tabName === 'thumbnails') {
        thumbnailsContent.style.display = 'block';
        bookmarksContent.style.display = 'none';
      } else if (tabName === 'bookmarks') {
        thumbnailsContent.style.display = 'none';
        bookmarksContent.style.display = 'block';
        renderBookmarks();
      }
    });
  });

  // Note modal
  noteSave.addEventListener('click', () => {
    if (currentHighlightId) {
      const highlight = highlights.find(h => h.id === currentHighlightId);
      if (highlight) {
        highlight.note = noteText.value;
        saveHighlights();
        renderHighlights();
        closeNoteModal();
      }
    }
  });

  noteCancel.addEventListener('click', () => {
    closeNoteModal();
  });

  // Close modal on background click
  noteModal.addEventListener('click', (e) => {
    if (e.target === noteModal) {
      closeNoteModal();
    }
  });

  // Merge PDF
  mergeButton.addEventListener('click', () => {
    openMergeModal();
  });

  selectMergeFiles.addEventListener('click', async () => {
    const files = await ipcRenderer.invoke('select-multiple-pdf-files');
    if (files && files.length > 0) {
      mergeFiles = files;
      renderMergeFileList();
    }
  });

  mergeExecute.addEventListener('click', async () => {
    if (mergeFiles.length < 2) {
      alert('최소 2개 이상의 PDF 파일을 선택해주세요.');
      return;
    }
    await mergePDFs();
  });

  mergeCancel.addEventListener('click', () => {
    closeMergeModal();
  });

  mergeModal.addEventListener('click', (e) => {
    if (e.target === mergeModal) {
      closeMergeModal();
    }
  });

  // Split PDF
  splitButton.addEventListener('click', () => {
    if (!pdfDocument) {
      alert('PDF 파일을 먼저 열어주세요.');
      return;
    }
    openSplitModal();
  });

  splitStartPage.addEventListener('input', updateSplitInfo);
  splitEndPage.addEventListener('input', updateSplitInfo);

  splitExecute.addEventListener('click', async () => {
    const start = parseInt(splitStartPage.value);
    const end = parseInt(splitEndPage.value);

    if (start < 1 || end > totalPages || start > end) {
      alert('올바른 페이지 범위를 입력해주세요.');
      return;
    }

    await splitPDF(start, end);
  });

  splitCancel.addEventListener('click', () => {
    closeSplitModal();
  });

  splitModal.addEventListener('click', (e) => {
    if (e.target === splitModal) {
      closeSplitModal();
    }
  });
}

// Open note modal
function openNoteModal(highlightId) {
  currentHighlightId = highlightId;
  noteText.value = '';
  noteText.disabled = false;
  noteModal.classList.add('show');
  // Use setTimeout to ensure modal is visible before focusing
  setTimeout(() => {
    noteText.focus();
  }, 100);
}

// Close note modal
function closeNoteModal() {
  noteModal.classList.remove('show');
  noteText.value = '';
  noteText.disabled = false;
  currentHighlightId = null;
}

// ── Text selection result ────────────────────────────

// Show selected text in the result modal (reuses OCR modal)
function showTextResult(text) {
  ocrModalTitle.textContent = '텍스트 선택';
  ocrLoading.style.display = 'none';
  ocrResult.style.display = 'block';
  ocrText.value = text;
  ocrCopy.style.display = 'inline-block';
  ocrModal.classList.add('show');
}

// ── OCR ─────────────────────────────────────────────

// Receive progress updates from main process OCR worker
ipcRenderer.on('ocr-progress', (event, m) => {
  if (m.status === 'loading tesseract core') {
    ocrProgressText.textContent = '핵심 모듈 로드 중...';
  } else if (m.status === 'loading language traineddata') {
    ocrProgressText.textContent = '언어 데이터 다운로드 중...';
  } else if (m.status === 'initializing api') {
    ocrProgressText.textContent = 'OCR 엔진 초기화 중...';
    ocrHintText.style.display = 'none';
  } else if (m.status === 'recognizing text') {
    const pct = Math.round(m.progress * 100);
    ocrProgressText.textContent = `텍스트 인식 중... ${pct}%`;
  }
});

// Perform OCR on a canvas sub-region — delegates to main process via IPC
async function performOCR(x, y, width, height) {
  ocrModalTitle.textContent = 'OCR 텍스트 추출';
  // Show modal in loading state
  ocrLoading.style.display = 'block';
  ocrResult.style.display = 'none';
  ocrCopy.style.display = 'none';
  ocrProgressText.textContent = '초기화 중...';
  ocrHintText.style.display = 'block';
  ocrModal.classList.add('show');

  try {
    // Capture the selected canvas region into a temporary canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    tempCanvas.getContext('2d').drawImage(canvas, x, y, width, height, 0, 0, width, height);
    const imageDataUrl = tempCanvas.toDataURL('image/png');

    // Delegate to main process (renderer doesn't support worker_threads)
    const result = await ipcRenderer.invoke('perform-ocr', imageDataUrl);

    ocrLoading.style.display = 'none';
    ocrResult.style.display = 'block';
    if (result.success) {
      ocrText.value = result.text || '(인식된 텍스트 없음)';
      ocrCopy.style.display = result.text ? 'inline-block' : 'none';
    } else {
      ocrText.value = 'OCR 처리 중 오류가 발생했습니다.\n' + result.error;
      ocrCopy.style.display = 'none';
    }
  } catch (err) {
    console.error('OCR error:', err);
    ocrLoading.style.display = 'none';
    ocrResult.style.display = 'block';
    ocrText.value = 'OCR 처리 중 오류가 발생했습니다.\n' + err.message;
    ocrCopy.style.display = 'none';
  }
}

function closeOCRModal() {
  ocrModal.classList.remove('show');
  ocrText.value = '';
  ocrResult.style.display = 'none';
  ocrLoading.style.display = 'block';
  ocrCopy.style.display = 'none';
}

// ── /OCR ────────────────────────────────────────────

// Show custom confirm modal (replaces window.confirm to avoid focus issues)
function showConfirmModal(message) {
  return new Promise(resolve => {
    confirmMessage.textContent = message;
    confirmModal.classList.add('show');

    function onOk() {
      confirmModal.classList.remove('show');
      cleanup();
      resolve(true);
    }
    function onCancel() {
      confirmModal.classList.remove('show');
      cleanup();
      resolve(false);
    }
    function onBackdrop(e) {
      if (e.target === confirmModal) onCancel();
    }
    function cleanup() {
      confirmOk.removeEventListener('click', onOk);
      confirmCancel.removeEventListener('click', onCancel);
      confirmModal.removeEventListener('click', onBackdrop);
    }

    confirmOk.addEventListener('click', onOk);
    confirmCancel.addEventListener('click', onCancel);
    confirmModal.addEventListener('click', onBackdrop);
  });
}

// Load PDF
async function loadPDF(filePath) {
  try {
    loading.style.display = 'block';
    canvasWrapper.style.display = 'none';

    const data = new Uint8Array(fs.readFileSync(filePath));
    pdfDocument = await pdfjsLib.getDocument({ data }).promise;
    totalPages = pdfDocument.numPages;

    pageCountSpan.textContent = totalPages;
    updateNavigationButtons();

    // Load saved data
    loadHighlights();
    loadBookmarks();

    // Render first page
    await renderPage(1);

    // Generate thumbnails
    generateThumbnails();

    loading.style.display = 'none';
    canvasWrapper.style.display = 'block';
  } catch (error) {
    console.error('Error loading PDF:', error);
    alert('PDF 파일을 로드하는데 실패했습니다: ' + error.message);
    window.location.href = 'index.html';
  }
}

// Render page
async function renderPage(pageNum) {
  if (!pdfDocument) return;

  try {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: currentScale });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Update highlight layer size
    highlightLayer.style.width = viewport.width + 'px';
    highlightLayer.style.height = viewport.height + 'px';

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    await page.render(renderContext).promise;

    // Render text layer (for text-based PDFs — enables native text selection)
    renderTextLayer(page, viewport);

    currentPage = pageNum;
    pageNumInput.value = pageNum;
    updateNavigationButtons();
    updateZoomLevel();
    updateThumbnailSelection();
    updateBookmarkButton();
    renderHighlights();
  } catch (error) {
    console.error('Error rendering page:', error);
  }
}

// Go to page
function goToPage(pageNum) {
  if (pageNum >= 1 && pageNum <= totalPages) {
    renderPage(pageNum);
    // Scroll to top
    viewerContainer.scrollTop = 0;
  }
}

// Update navigation buttons
function updateNavigationButtons() {
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

// Update zoom level display
function updateZoomLevel() {
  const percentage = Math.round(currentScale * 100);
  zoomLevelSpan.textContent = `${percentage}%`;
}

// Render PDF.js text layer for native text selection
async function renderTextLayer(page, viewport) {
  try {
    const textContent = await page.getTextContent();
    textLayerDiv.innerHTML = '';
    textLayerDiv.style.width = viewport.width + 'px';
    textLayerDiv.style.height = viewport.height + 'px';

    const task = pdfjsLib.renderTextLayer({
      textContent: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: [],
    });
    await task.promise;
  } catch (err) {
    // Text layer is optional — silently skip for image-only PDFs
    console.warn('Text layer unavailable:', err.message);
  }
}

// Generate thumbnails
async function generateThumbnails() {
  thumbnailsContent.innerHTML = '';

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDocument.getPage(i);
    const viewport = page.getViewport({ scale: 0.3 });

    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.className = 'thumbnail-canvas';
    thumbnailCanvas.width = viewport.width;
    thumbnailCanvas.height = viewport.height;

    const thumbnailCtx = thumbnailCanvas.getContext('2d');
    await page.render({
      canvasContext: thumbnailCtx,
      viewport: viewport
    }).promise;

    const thumbnailItem = document.createElement('div');
    thumbnailItem.className = 'thumbnail-item';
    if (i === currentPage) {
      thumbnailItem.classList.add('active');
    }

    const pageNum = document.createElement('div');
    pageNum.className = 'thumbnail-page-num';
    pageNum.textContent = `Page ${i}`;

    thumbnailItem.appendChild(thumbnailCanvas);
    thumbnailItem.appendChild(pageNum);

    thumbnailItem.addEventListener('click', () => {
      goToPage(i);
    });

    thumbnailsContent.appendChild(thumbnailItem);
  }
}

// Update thumbnail selection
function updateThumbnailSelection() {
  const thumbnails = thumbnailsContent.querySelectorAll('.thumbnail-item');
  thumbnails.forEach((thumb, index) => {
    if (index + 1 === currentPage) {
      thumb.classList.add('active');
    } else {
      thumb.classList.remove('active');
    }
  });
}

// Highlight / OCR drag system (only active in highlight or OCR mode)
function onMouseDown(e) {
  if (!pdfDocument || (!isHighlightMode && !isOCRMode)) return;

  const rect = canvas.getBoundingClientRect();
  selectionStart = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };

  // Blue rect for highlight, green rect for OCR
  if (isHighlightMode) {
    selectionRect.classList.remove('ocr-mode');
  } else {
    selectionRect.classList.add('ocr-mode');
  }

  selectionRect.style.left = selectionStart.x + 'px';
  selectionRect.style.top = selectionStart.y + 'px';
  selectionRect.style.width = '0px';
  selectionRect.style.height = '0px';
  selectionRect.style.display = 'block';
}

function onMouseMove(e) {
  if ((!isHighlightMode && !isOCRMode) || !selectionStart) return;

  const rect = canvas.getBoundingClientRect();
  const currentX = e.clientX - rect.left;
  const currentY = e.clientY - rect.top;

  const width = currentX - selectionStart.x;
  const height = currentY - selectionStart.y;

  if (width < 0) {
    selectionRect.style.left = currentX + 'px';
    selectionRect.style.width = Math.abs(width) + 'px';
  } else {
    selectionRect.style.width = width + 'px';
  }

  if (height < 0) {
    selectionRect.style.top = currentY + 'px';
    selectionRect.style.height = Math.abs(height) + 'px';
  } else {
    selectionRect.style.height = height + 'px';
  }
}

function onMouseUp(e) {
  if ((!isHighlightMode && !isOCRMode) || !selectionStart) return;

  const rect = canvas.getBoundingClientRect();
  const endX = e.clientX - rect.left;
  const endY = e.clientY - rect.top;

  const x = Math.min(selectionStart.x, endX);
  const y = Math.min(selectionStart.y, endY);
  const width = Math.abs(endX - selectionStart.x);
  const height = Math.abs(endY - selectionStart.y);

  if (isHighlightMode) {
    // Highlight: store as ratio coords
    if (width >= 5 && height >= 5) {
      const highlight = {
        id: Date.now().toString(),
        page: currentPage,
        xRatio: x / canvas.width,
        yRatio: y / canvas.height,
        widthRatio: width / canvas.width,
        heightRatio: height / canvas.height,
        color: selectedColor,
        note: '',
        created: Date.now(),
        modified: Date.now()
      };

      highlights.push(highlight);
      saveHighlights();
      renderHighlights();
      openNoteModal(highlight.id);
    }
  } else if (isOCRMode) {
    // OCR mode: capture canvas region and recognize text
    if (width >= 10 && height >= 10) {
      performOCR(x, y, width, height);
    }
  }

  selectionStart = null;
  selectionRect.style.display = 'none';
}

// Render highlights
function renderHighlights() {
  highlightLayer.innerHTML = '';

  const pageHighlights = highlights.filter(h => h.page === currentPage);

  pageHighlights.forEach(highlight => {
    const div = document.createElement('div');
    div.className = 'highlight-rect';
    // Convert stored ratios back to current canvas pixel coordinates
    div.style.left = (highlight.xRatio * canvas.width) + 'px';
    div.style.top = (highlight.yRatio * canvas.height) + 'px';
    div.style.width = (highlight.widthRatio * canvas.width) + 'px';
    div.style.height = (highlight.heightRatio * canvas.height) + 'px';
    div.style.backgroundColor = highlight.color;

    // Show note on hover
    if (highlight.note) {
      div.addEventListener('mouseenter', (e) => {
        showTooltip(e, highlight.note);
      });

      div.addEventListener('mouseleave', () => {
        hideTooltip();
      });
    }

    // Delete on right click
    div.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      hideTooltip();
      if (await showConfirmModal('이 하이라이트를 삭제하시겠습니까?')) {
        highlights = highlights.filter(h => h.id !== highlight.id);
        saveHighlights();
        renderHighlights();
      }
    });

    highlightLayer.appendChild(div);
  });
}

// Tooltip
let tooltipElement = null;

function showTooltip(e, text) {
  hideTooltip();

  tooltipElement = document.createElement('div');
  tooltipElement.className = 'tooltip';
  tooltipElement.textContent = text;
  document.body.appendChild(tooltipElement);

  const rect = e.target.getBoundingClientRect();
  tooltipElement.style.left = rect.left + 'px';
  tooltipElement.style.top = (rect.top - tooltipElement.offsetHeight - 8) + 'px';
}

function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
  }
}

// Save highlights
function saveHighlights() {
  try {
    const userDataPath = getUserDataPath();
    const highlightsDir = path.join(userDataPath, 'highlights');

    if (!fs.existsSync(highlightsDir)) {
      fs.mkdirSync(highlightsDir, { recursive: true });
    }

    const fileName = path.basename(pdfFilePath, '.pdf') + '.json';
    const filePath = path.join(highlightsDir, fileName);

    const data = {
      pdfName: path.basename(pdfFilePath),
      highlights: highlights
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving highlights:', error);
  }
}

// Load highlights
function loadHighlights() {
  try {
    const userDataPath = getUserDataPath();
    const highlightsDir = path.join(userDataPath, 'highlights');
    const fileName = path.basename(pdfFilePath, '.pdf') + '.json';
    const filePath = path.join(highlightsDir, fileName);

    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      highlights = data.highlights || [];
    } else {
      highlights = [];
    }
  } catch (error) {
    console.error('Error loading highlights:', error);
    highlights = [];
  }
}

// Bookmark system
function toggleBookmark(pageNum) {
  const index = bookmarks.findIndex(b => b.page === pageNum);

  if (index >= 0) {
    bookmarks.splice(index, 1);
  } else {
    bookmarks.push({
      id: Date.now().toString(),
      page: pageNum,
      created: Date.now()
    });
  }

  // Sort by page number
  bookmarks.sort((a, b) => a.page - b.page);

  saveBookmarks();
  updateBookmarkButton();
  renderBookmarks();
}

function updateBookmarkButton() {
  const isBookmarked = bookmarks.some(b => b.page === currentPage);
  if (isBookmarked) {
    bookmarkToggleBtn.style.color = '#FFD700';
  } else {
    bookmarkToggleBtn.style.color = '#e8eaed';
  }
}

function renderBookmarks() {
  if (bookmarks.length === 0) {
    bookmarksContent.innerHTML = '<div class="empty-state">책갈피가 없습니다</div>';
    return;
  }

  bookmarksContent.innerHTML = '';

  bookmarks.forEach(bookmark => {
    const item = document.createElement('div');
    item.className = 'bookmark-item';

    const pageSpan = document.createElement('span');
    pageSpan.className = 'bookmark-page';
    pageSpan.textContent = `Page ${bookmark.page}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'bookmark-delete';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBookmark(bookmark.page);
    });

    item.appendChild(pageSpan);
    item.appendChild(deleteBtn);

    item.addEventListener('click', () => {
      goToPage(bookmark.page);
    });

    bookmarksContent.appendChild(item);
  });
}

function saveBookmarks() {
  try {
    const userDataPath = getUserDataPath();
    const bookmarksDir = path.join(userDataPath, 'bookmarks');

    if (!fs.existsSync(bookmarksDir)) {
      fs.mkdirSync(bookmarksDir, { recursive: true });
    }

    const fileName = path.basename(pdfFilePath, '.pdf') + '.json';
    const filePath = path.join(bookmarksDir, fileName);

    const data = {
      pdfName: path.basename(pdfFilePath),
      bookmarks: bookmarks
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving bookmarks:', error);
  }
}

function loadBookmarks() {
  try {
    const userDataPath = getUserDataPath();
    const bookmarksDir = path.join(userDataPath, 'bookmarks');
    const fileName = path.basename(pdfFilePath, '.pdf') + '.json';
    const filePath = path.join(bookmarksDir, fileName);

    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      bookmarks = data.bookmarks || [];
    } else {
      bookmarks = [];
    }
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    bookmarks = [];
  }
}

// Merge PDF functions
function openMergeModal() {
  mergeFiles = [];
  mergeFileList.innerHTML = '';
  mergeModal.classList.add('show');
}

function closeMergeModal() {
  mergeModal.classList.remove('show');
  mergeFiles = [];
  mergeFileList.innerHTML = '';
}

function renderMergeFileList() {
  mergeFileList.innerHTML = '';

  if (mergeFiles.length === 0) {
    mergeFileList.innerHTML = '<p style="color: #9aa0a6; font-size: 13px; text-align: center; padding: 20px;">파일을 선택해주세요</p>';
    return;
  }

  mergeFiles.forEach((filePath, index) => {
    const item = document.createElement('div');
    item.className = 'merge-file-item';

    const fileName = document.createElement('span');
    fileName.className = 'merge-file-name';
    fileName.textContent = `${index + 1}. ${path.basename(filePath)}`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'merge-file-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      mergeFiles.splice(index, 1);
      renderMergeFileList();
    });

    item.appendChild(fileName);
    item.appendChild(removeBtn);
    mergeFileList.appendChild(item);
  });
}

async function mergePDFs() {
  try {
    // Show progress
    mergeExecute.disabled = true;
    mergeExecute.textContent = '병합 중...';

    // Create new PDF document
    const mergedPdf = await PDFDocument.create();

    // Copy pages from each PDF
    for (const filePath of mergeFiles) {
      const pdfBytes = fs.readFileSync(filePath);
      const pdf = await PDFDocument.load(pdfBytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    }

    // Save merged PDF
    const mergedPdfBytes = await mergedPdf.save();

    // Ask user where to save
    const savePath = await ipcRenderer.invoke('save-pdf-file', 'merged.pdf');

    if (savePath) {
      fs.writeFileSync(savePath, mergedPdfBytes);
      alert(`PDF 병합이 완료되었습니다!\n저장 위치: ${savePath}`);
      closeMergeModal();
    }
  } catch (error) {
    console.error('Error merging PDFs:', error);
    alert('PDF 병합 중 오류가 발생했습니다: ' + error.message);
  } finally {
    mergeExecute.disabled = false;
    mergeExecute.textContent = '병합 실행';
  }
}

// Split PDF functions
function openSplitModal() {
  splitStartPage.value = 1;
  splitEndPage.value = totalPages;
  splitEndPage.max = totalPages;
  splitStartPage.max = totalPages;
  updateSplitInfo();
  splitModal.classList.add('show');
}

function closeSplitModal() {
  splitModal.classList.remove('show');
}

function updateSplitInfo() {
  const start = parseInt(splitStartPage.value) || 1;
  const end = parseInt(splitEndPage.value) || 1;
  const count = Math.max(0, end - start + 1);
  splitInfo.textContent = `${count}개의 페이지가 추출됩니다 (전체 ${totalPages}페이지)`;
}

async function splitPDF(startPage, endPage) {
  try {
    // Show progress
    splitExecute.disabled = true;
    splitExecute.textContent = '분할 중...';

    // Load current PDF
    const pdfBytes = fs.readFileSync(pdfFilePath);
    const pdf = await PDFDocument.load(pdfBytes);

    // Create new PDF with selected pages
    const newPdf = await PDFDocument.create();
    const pageIndices = [];
    for (let i = startPage - 1; i < endPage; i++) {
      pageIndices.push(i);
    }

    const pages = await newPdf.copyPages(pdf, pageIndices);
    pages.forEach(page => newPdf.addPage(page));

    // Save split PDF
    const newPdfBytes = await newPdf.save();

    // Suggest filename
    const originalName = path.basename(pdfFilePath, '.pdf');
    const suggestedName = `${originalName}_pages_${startPage}-${endPage}.pdf`;

    // Ask user where to save
    const savePath = await ipcRenderer.invoke('save-pdf-file', suggestedName);

    if (savePath) {
      fs.writeFileSync(savePath, newPdfBytes);
      alert(`PDF 분할이 완료되었습니다!\n저장 위치: ${savePath}`);
      closeSplitModal();
    }
  } catch (error) {
    console.error('Error splitting PDF:', error);
    alert('PDF 분할 중 오류가 발생했습니다: ' + error.message);
  } finally {
    splitExecute.disabled = false;
    splitExecute.textContent = '분할 실행';
  }
}

// Initialize app
init();
