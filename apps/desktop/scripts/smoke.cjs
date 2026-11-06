// Runs the real isolated Electron renderer against an ephemeral SQLite database.
const { app, clipboard } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "ai-motion-smoke-"));
app.setPath("userData", data);
let window;
app.on("browser-window-created", (_, win) => {
  window = win;
  win.webContents.on("console-message", (event, ...args) => {
    console.log("Renderer:", event.message || args);
  });
  win.webContents.once("did-finish-load", async () => {
    try {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await wait(700);
      const js = async (code) => {
        try {
          return await win.webContents.executeJavaScript(code);
        } catch (e) {
          console.error("Failed script:", code);
          throw e;
        }
      };
      const click = (text) =>
        js(
          `(() => { const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)} || (b.classList.contains('nav-item') && b.textContent.trim().endsWith(${JSON.stringify(text)}))); if(!b)throw Error('Button missing: '+${JSON.stringify(text)});b.click(); })()`,
        );
      if (!(await js("document.body.innerText")).includes("把今天的运动安排好"))
        throw Error("Home did not load");
      await click("编辑第一份计划");
      await wait(200);
      await click("保存计划");
      await wait(200);
      await click("今日计划");
      await wait(200);
      await click("模拟运行计划");
      await wait(2300);
      if (!(await js("document.body.innerText")).includes("模拟数据正在运行"))
        throw Error("Simulation missing");
      await click("暂停计时");
      await wait(200);
      const paused1 = await js(`window.motion.call('snapshot')`);
      await wait(1200);
      const paused2 = await js(`window.motion.call('snapshot')`);
      if (paused1.value.live.activeMs !== paused2.value.live.activeMs)
        throw Error("Paused clock advanced");
      await click("继续训练");
      await wait(1200);
      await click("结束并保存");
      await wait(200);
      await click("训练记录");
      await wait(200);
      const result = await js(`window.motion.call('snapshot')`);
      if (
        result.value.records.length !== 1 ||
        result.value.records[0].phase !== "finished" ||
        result.value.records[0].estimatedKcal !== null
      )
        throw Error("Invalid result");
      await click("教练与分析");
      await wait(200);
      if (
        !(await js("document.body.innerText")).includes("不能据此评价实际动作")
      )
        throw Error("Evidence warning missing");
      const artifact = path.resolve(
        __dirname,
        "../../../.local/desktop-preview",
      );
      fs.mkdirSync(artifact, { recursive: true });
      await click("今日计划");
      await wait(200);
      fs.writeFileSync(
        path.join(artifact, "workbench.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      await click("正在训练");
      await wait(200);
      fs.writeFileSync(
        path.join(artifact, "training.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      await click("设备与设置");
      await wait(200);
      await click("开启局域网接收");
      await wait(300);
      const pairing = await js(`window.motion.call('snapshot')`);
      if (!pairing.value.sync.enabled) throw Error("LAN server failed");
      const previousClipboard = await clipboard.readText();
      await click("复制配对链接");
      await wait(200);
      const copied = await clipboard.readText();
      await clipboard.writeText(previousClipboard);
      if (!copied.startsWith("aimotion://pair?"))
        throw Error("Pairing copy failed");
      await click("关闭连接并撤销配对");
      await wait(200);
      console.log(
        JSON.stringify({
          ok: true,
          versions: process.versions,
          plans: result.value.plans.length,
          records: result.value.records.length,
          screenshots: artifact,
          isolatedData: data,
        }),
      );
      app.exit(0);
    } catch (e) {
      console.error(e);
      console.log(
        await win.webContents.executeJavaScript("document.body.innerText"),
      );
      app.exit(1);
    }
  });
});
setTimeout(() => {
  console.error("Smoke test timed out");
  app.exit(1);
}, 25000).unref();
require("../dist-main/main.cjs");
