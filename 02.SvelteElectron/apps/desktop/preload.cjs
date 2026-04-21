const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("projectB", {
  version: "0.1.0",
  matchStart: (request) => ipcRenderer.invoke("match:start", request),
  matchStep: (decision) => ipcRenderer.invoke("match:step", decision),
  matchFinish: () => ipcRenderer.invoke("match:finish")
});
