const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let filePath = null;

function createWindow() {
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
    show: false
  });

  // Check if a file was passed as command-line argument
  const args = process.argv.slice(process.defaultApp ? 2 : 1);
  const pdfArg = args.find(arg => arg.toLowerCase().endsWith('.pdf'));

  if (pdfArg && fs.existsSync(pdfArg)) {
    // Open PDF viewer directly
    filePath = path.resolve(pdfArg);
    mainWindow.loadFile('viewer.html');

    // Send file path after page loads
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('load-pdf-file', filePath);
    });
  } else {
    // Open main screen
    mainWindow.loadFile('index.html');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

// Synchronous IPC handler for get-user-data-path
ipcMain.on('get-user-data-path', (event) => {
  event.returnValue = app.getPath('userData');
});

app.whenReady().then(createWindow);

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

// Handle file open events (macOS)
app.on('open-file', (event, filePath) => {
  event.preventDefault();

  if (mainWindow) {
    mainWindow.loadFile('viewer.html');
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('load-pdf-file', filePath);
    });
  }
});

// Handle second instance (Windows)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Check if a PDF file was passed
      const pdfArg = commandLine.find(arg => arg.toLowerCase().endsWith('.pdf'));
      if (pdfArg && fs.existsSync(pdfArg)) {
        const pdfPath = path.resolve(pdfArg);
        mainWindow.loadFile('viewer.html');
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow.webContents.send('load-pdf-file', pdfPath);
        });
      }
    }
  });
}
