const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("projectB", {
  version: "0.1.0"
});

