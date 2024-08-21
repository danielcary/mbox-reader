import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        }
    });

    win.loadFile('index.html');
}


app.whenReady().then(() => {
    // handle messages from renderer process
    ipcMain.on('set-title', (e, title) => {
        const webContents = e.sender;
        const win = BrowserWindow.fromWebContents(webContents);
        win?.setTitle('and Bob\'s your uncle');
    });

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

