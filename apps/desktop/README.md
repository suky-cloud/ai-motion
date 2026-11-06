# AI Motion 本地电脑工作台

Electron + React + SQLite，版本 0.3.0。完整说明与边界见 [使用说明](../../docs/DESKTOP_GUIDE.md)，人工验收见 [测试清单](../../docs/DESKTOP_TEST_CHECKLIST.md)。

```powershell
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm build
pnpm start
```

`pnpm test`：SQLite / WebSocket / AI 集成测试；根目录 `node --test tests/*.test.ts`：共享逻辑测试。

`pnpm package` 生成项目 `.local/desktop/AI Motion-win32-x64/AI-Motion.exe`。整个文件夹为便携程序。主进程使用 Electron 自带 Node 24 的 `node:sqlite`，无需原生扩展重编译；主进程和页面依赖均打包，不把 pnpm 链接树装入发行程序。

默认无局域网监听、无 AI 请求、无示例训练历史；计划模板需用户保存。没有云服务器、账号、自动上传或常驻后台服务。
