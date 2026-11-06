import { contextBridge, ipcRenderer } from "electron";
const allowed = new Set([
  "snapshot",
  "savePlan",
  "removePlan",
  "demo",
  "startSync",
  "stopSync",
  "copyPairing",
  "saveProfile",
  "saveAI",
  "clearAIKey",
  "testAI",
  "askAI",
  "localAdvice",
  "export",
  "import",
]);
contextBridge.exposeInMainWorld("motion", {
  call: (name: string, payload?: unknown) => {
    if (!allowed.has(name))
      return Promise.resolve({ ok: false, error: "未知操作" });
    return ipcRenderer.invoke("motion:action", name, payload);
  },
});
