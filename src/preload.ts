import { contextBridge, ipcRenderer } from 'electron';

export type onLoadFileCompletedCallback = (success: boolean) => void;

export type myapi = {
    setTitle: (title: string) => void;
    openFile: () => Promise<string[] | null>;
    loadFile: (file: string) => void;
    onLoadFileCompleted: (callback: onLoadFileCompletedCallback) => void;
}

contextBridge.exposeInMainWorld('myapi', {
    setTitle: (title: string) => ipcRenderer.send('set-title', title),
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    loadFile: (file: string) => ipcRenderer.invoke('loadFile', file),
    onLoadFileCompleted: (callback: onLoadFileCompletedCallback) => {
        ipcRenderer.on('update-counter', (_event, value) => 
            callback(value)
        )
    },
});