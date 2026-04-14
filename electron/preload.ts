import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  getAppPath: () => ipcRenderer.invoke("get-app-path"),
});