# AI Motion 本地电脑工作台

Electron + React + SQLite，版本 0.4.0。支持手机球体训练来源、最长连续、目标命中和节奏详情；普通工作台用法见 [使用说明](../../docs/DESKTOP_GUIDE.md)，新增功能与实测见 [篮球训练](../../docs/BASKETBALL_TRAINING.md)。

```powershell
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm build
pnpm start
```

`pnpm test`：SQLite / WebSocket / AI 集成测试；根目录 `node --test tests/*.test.ts`：共享逻辑测试。

`pnpm package` 生成项目 `.local/desktop/AI Motion-win32-x64/AI-Motion.exe`。整个文件夹为便携程序。主进程使用 Electron 自带 Node 24 的 `node:sqlite`，无需原生扩展重编译；主进程和页面依赖均打包，不把 pnpm 链接树装入发行程序。

默认无局域网监听、无 AI 请求、无示例训练历史；计划模板需用户保存。没有云服务器、账号、自动上传或常驻后台服务。
