const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { createWorker } = require('tesseract.js');

// OCR worker singleton (lives in main process — renderer doesn't support worker_threads)
let ocrWorker = null;

async function getOCRWorker(win) {
  if (!ocrWorker) {
    ocrWorker = await createWorker(['kor', 'eng'], 1, {
      logger: (m) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('ocr-progress', m);
        }
      }
    });
  }
  return ocrWorker;
}

let mainWindow;

// Extract a PDF path from argv (works in both dev and packaged mode)
function getPdfFromArgs(argv) {
  // Dev:       electron . [file.pdf]  → meaningful args start at index 2
  // Packaged:  app.exe  [file.pdf]   → meaningful args start at index 1
  const args = argv.slice(app.isPackaged ? 1 : 2);
  return args.find(a => a.toLowerCase().endsWith('.pdf') && fs.existsSync(a)) || null;
}

// Open a PDF in the main window — works whether it's on index.html or viewer.html
function openPdfInWindow(win, filePath) {
  win.loadFile('viewer.html', { query: { file: filePath } });
}

function createWindow(initialPdf) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    backgroundColor: '#525659',
    // When opening a PDF directly (e.g. "Open with"), the window MUST be
    // created as visible (show: true) so that CSS viewport units (100vh) are
    // computed correctly when viewer.html lays out.
    // A window that was created with show: false reports a 0-height viewport
    // on Windows even after .show() is called later — calling .show() after
    // construction is NOT the same as creating with show: true.
    // The dark backgroundColor prevents any visual flash while loading.
    // For normal startup (no PDF arg) keep show: false + ready-to-show to
    // avoid a blank window flashing before index.html is painted.
    show: !!initialPdf
  });

  if (initialPdf) {
    // Window is already visible; load the viewer directly.
    openPdfInWindow(mainWindow, initialPdf);
  } else {
    mainWindow.loadFile('index.html');
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
  }

  // Create application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDF',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
              ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('open-pdf', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Merge PDFs',
          click: () => {
            mainWindow.webContents.send('show-merge-dialog');
          }
        },
        {
          label: 'Split PDF',
          click: () => {
            mainWindow.webContents.send('show-split-dialog');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Study PDF Viewer',
              message: 'Study PDF Viewer v1.0.0',
              detail: 'A simple and elegant PDF viewer for students and researchers.\n\nBuilt with Electron, PDF.js, and PDF-lib.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC handlers
ipcMain.handle('select-pdf-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('select-multiple-pdf-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths;
  }
  return [];
});

ipcMain.handle('save-pdf-file', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });

  if (!result.canceled) {
    return result.filePath;
  }
  return null;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return data;
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
});

ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, Buffer.from(data));
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    return false;
  }
});

// OCR via main process (renderer's V8 doesn't support worker_threads)
ipcMain.handle('perform-ocr', async (event, imageDataUrl) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const worker = await getOCRWorker(win);
    const { data: { text } } = await worker.recognize(imageDataUrl);
    return { success: true, text: text.trim() };
  } catch (err) {
    console.error('OCR error in main:', err);
    return { success: false, error: err.message };
  }
});

// Synchronous IPC handler for get-user-data-path
ipcMain.on('get-user-data-path', (event) => {
  event.returnValue = app.getPath('userData');
});

// Single instance lock — so double-clicking a PDF while the app is open
// sends the new file to the existing window instead of spawning a second app
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running; it will receive 'second-instance'
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    // A second "Open with" was triggered — focus existing window and load the new file
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const pdf = getPdfFromArgs(argv);
      if (pdf) openPdfInWindow(mainWindow, pdf);
    }
  });

  app.whenReady().then(() => {
    const initialPdf = getPdfFromArgs(process.argv);
    createWindow(initialPdf);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
  });
}
