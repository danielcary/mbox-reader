import { contextBridge, ipcRenderer } from 'electron';

export type myapi = {
    setTitle: (title: string) => void;
}

contextBridge.exposeInMainWorld('myapi', {
    setTitle: (title: string) => ipcRenderer.send('set-title', title),
});