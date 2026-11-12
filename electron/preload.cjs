const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("tobi", {
  pickImages: () => ipcRenderer.invoke("pick-images"),
  saveProject: (p) => ipcRenderer.invoke("save-project", p),
  openProject: (p) => ipcRenderer.invoke("open-project", p),
  exportImage: (p) => ipcRenderer.invoke("export-image", p),
  clipboardImage: () => ipcRenderer.invoke("clipboard-image"),
  chooseImageFolder: () => ipcRenderer.invoke("choose-image-folder"),
  getImageFolder: () => ipcRenderer.invoke("get-image-folder"),
  readLibraryImage: (path) => ipcRenderer.invoke("read-library-image", path),
  imageThumbnail: (path) => ipcRenderer.invoke("image-thumbnail", path),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("update-state", listener);
    return () => ipcRenderer.removeListener("update-state", listener);
  },
  onZoomWheel: (callback) => {
    const listener = (_event, direction) => callback(direction);
    ipcRenderer.on("editor-zoom-wheel", listener);
    return () => ipcRenderer.removeListener("editor-zoom-wheel", listener);
  },
  onOpenProject: (callback) => {
    const listener = (_event, path) => callback(path);
    ipcRenderer.on("open-project-path", listener);
    return () => ipcRenderer.removeListener("open-project-path", listener);
  },
});
