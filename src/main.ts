import { app, BrowserWindow } from 'electron';

const createWindow = () => {
    const win = new BrowserWindow({
        width: 800,
        height: 600
    });

    win.loadFile('index.html');
}


app.whenReady().then(() => {
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

