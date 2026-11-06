import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const profile = mkdtempSync(join(tmpdir(), "motion-packaged-"));
const child = spawn(
  resolve("../../.local/desktop/AI Motion-win32-x64/AI-Motion.exe"),
  [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`],
  { windowsHide: true, stdio: "ignore" },
);
let ws;
try {
  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const page = targets?.find((t) => t.type === "page");
  if (!page) throw new Error("Packaged window did not start");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) =>
    ws.addEventListener("open", resolve, { once: true }),
  );
  let counter = 0;
  const requests = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      requests.get(message.id)?.(message);
      requests.delete(message.id);
    }
  });
  const call = (method, params) =>
    new Promise((resolve) => {
      const id = ++counter;
      requests.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const result = await call("Runtime.evaluate", {
    expression: `window.motion.call('snapshot').then(result=>({ok:result.ok,plans:result.value?.plans.length,records:result.value?.records.length,dataPath:result.value?.dataPath,title:document.body.innerText.includes('把今天的运动安排好')}))`,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = result.result?.result?.value;
  if (!value?.ok || !value.title || value.dataPath !== profile)
    throw new Error(JSON.stringify(result));
  console.log(
    JSON.stringify({
      packagedStartup: "passed",
      isolatedProfile: true,
      ...value,
    }),
  );
  ws.send(JSON.stringify({ id: ++counter, method: "Browser.close" }));
} finally {
  ws?.close();
  child.kill();
}
