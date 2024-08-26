import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent, Menu } from 'electron';
import path from 'node:path';

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        }
    });
    const menu = Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
           // {
             // click: () => win.webContents.send('update-counter', 1),
              //label: 'Increment'
           // },
            {
              click: () => win.webContents.send('update-counter', -1), // maybe we should tell renderer to open file??? and it sends openfile dialog??
              label: 'Open mailbox...'
            }
          ]
        }
    
      ])
    
      Menu.setApplicationMenu(menu)

    win.loadFile('index.html');
}



async function handleFileOpen(e: IpcMainInvokeEvent) {
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        filters: [{ name: 'mbox file', extensions: ['mbox'] }]
    });
    if (!canceled) {
        return filePaths[0];
    }
    return null;
}


app.whenReady().then(() => {
    // handle messages from renderer process
    ipcMain.on('set-title', (e, title: string) => {
        const webContents = e.sender;
        const win = BrowserWindow.fromWebContents(webContents);
        win?.setTitle(title);
    });
    ipcMain.handle('dialog:openFile', handleFileOpen);

    createWindow();

    app.on('window-all-closed', () => {
        // Handle special case for macOS apps
        if (process.platform !== 'darwin') {
            // Leave process running in background
            app.quit();
        }
    });

    app.on('activate', () => {
        // Handle special case for macOS apps
        if (BrowserWindow.getAllWindows().length === 0) {
            // If process is already running, but no windows
            createWindow();
        }
    });
});

