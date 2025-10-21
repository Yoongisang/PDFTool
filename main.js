const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Multi-window support: Track all windows
let windows = new Set();

function createWindow(pdfFilePath = null) {
  const newWindow = new BrowserWindow({
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
    show: false
  });

  // Track this window
  windows.add(newWindow);

  if (pdfFilePath) {
    // Open PDF viewer directly
    newWindow.loadFile('viewer.html');

    // Send file path after page loads
    newWindow.webContents.once('did-finish-load', () => {
      newWindow.webContents.send('load-pdf-file', pdfFilePath);
    });
  } else {
    // Open main screen
    newWindow.loadFile('index.html');
  }

  newWindow.once('ready-to-show', () => {
    newWindow.show();
  });

  // Remove from tracking when closed
  newWindow.on('closed', () => {
    windows.delete(newWindow);
  });

  // Create application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open PDF',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            const result = await dialog.showOpenDialog(focusedWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
              ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
              // Open in new window
              createWindow(result.filePaths[0]);
            }
          }
        },
        {
          label: 'Open PDF in Current Window',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (!focusedWindow) return;

            const result = await dialog.showOpenDialog(focusedWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'PDF Files', extensions: ['pdf'] }
              ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
              focusedWindow.webContents.send('open-pdf', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Merge PDFs',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('show-merge-dialog');
            }
          }
        },
        {
          label: 'Split PDF',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('show-split-dialog');
            }
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

  return newWindow;
}

// IPC handlers
ipcMain.handle('select-pdf-file', async (event) => {
  const focusedWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(focusedWindow, {
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

// Open PDF in new window
ipcMain.handle('open-pdf-in-new-window', async (event, filePath) => {
  createWindow(filePath);
});

ipcMain.handle('select-multiple-pdf-files', async (event) => {
  const focusedWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(focusedWindow, {
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
  const focusedWindow = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(focusedWindow, {
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

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

// Synchronous IPC handler for get-user-data-path
ipcMain.on('get-user-data-path', (event) => {
  event.returnValue = app.getPath('userData');
});

// App lifecycle
app.whenReady().then(() => {
  // Check if a file was passed as command-line argument
  const args = process.argv.slice(process.defaultApp ? 2 : 1);
  const pdfArg = args.find(arg => arg.toLowerCase().endsWith('.pdf'));

  if (pdfArg && fs.existsSync(pdfArg)) {
    // Open PDF viewer directly with the file
    const pdfPath = path.resolve(pdfArg);
    createWindow(pdfPath);
  } else {
    // Open main screen
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file open events (macOS and Windows when app is already running)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  // Always create a new window for the file
  createWindow(filePath);
});

// Handle multiple instances - allow them and open new windows
app.on('second-instance', (event, commandLine, workingDirectory) => {
  // Check if a PDF file was passed
  const pdfArg = commandLine.find(arg => arg.toLowerCase().endsWith('.pdf'));

  if (pdfArg && fs.existsSync(pdfArg)) {
    const pdfPath = path.resolve(pdfArg);
    createWindow(pdfPath);
  } else {
    createWindow();
  }
});
