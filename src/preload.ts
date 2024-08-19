import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('myapi', {
    setTitle: (title: string) => ipcRenderer.send('set-title', title),
});