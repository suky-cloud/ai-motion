# AI Motion 手机应用

0.4.0 已采用“首页 / 训练 / 记录 / 我的”底部导航，新增前置相机本地球体检测、运球估计、左右目标与本地视频检查；保留 Motion Catch 和独立摄像头检查。真实手机运行与准确率待验收，不录制或上传相机画面。球体检测不是全身姿态识别，也没有投篮 / 进球判定。用法、兼容限制和实测清单见 [篮球训练文档](../../docs/BASKETBALL_TRAINING.md)。

0.2.0 将输入生命周期、计时与游戏编排移入 session-core，由 useMotionSession 连接 React；首页可查看或清除本次完成结果，页面异常提供首页恢复入口。结构与原生适配边界见 docs/ARCHITECTURE.md。

首页“开始模拟体验” → “开始这一轮” → 拖动或左右按钮 → 暂停 / 继续 / 结束 → 结果与重开。调试面板可切换正常 / 输入丢失 / 仅上半身，以及合成骨骼显示。模式始终标明“未使用摄像头识别”。

## Windows 本地运行

在仓库根目录打开 PowerShell，手机已开启 USB 调试并授权：

```powershell
. ./scripts/android-env.ps1
cd apps/mobile
pnpm install --frozen-lockfile
pnpm exec expo prebuild --platform android --no-install
pnpm exec expo run:android --device
```

使用 Development Build，不使用 Expo Go。首次构建会下载 Gradle、SDK / NDK 等组件。原生 android/ 和 ios/ 当前为生成文件，不提交；未来自有原生插件应放在独立模块中。

### Windows 路径要求

本机工作区名称含空格且路径较长，原生 C++ 编译出现过 Ninja 重生成循环及目录创建失败；临时 subst 盘符又与自动链接的真实路径冲突。11 月 2 日相机基线曾用 `C:/Users/Lenovo/am` 的独立应用副本构建。

现在应用引用仓库的 `packages/`：后续构建必须保留完整仓库结构，建议先将仓库克隆到如 `C:/am` 的短、无空格真实路径，再进入 `apps/mobile` 执行上述命令；不能只复制 mobile 目录，也不要复用旧的独立应用副本。Metro 已配置共享模块目录。

pnpm 11 的依赖布局配置放在 `pnpm-workspace.yaml`，本应用使用 `nodeLinker: hoisted`。不要把该配置放在 `.npmrc`，当前版本不会从那里读取。

若已安装开发版，可通过 USB 连接开发服务：

```powershell
adb reverse tcp:8081 tcp:8081
pnpm start
```

## 检查

```powershell
pnpm exec tsc --noEmit
pnpm exec expo install --check
pnpm exec expo export --platform android --output-dir ../../.local/mobile-export
```

根目录 `node --test tests/*.test.ts` 可在没有手机时验证全部纯逻辑。当前类型检查和 44 项自动化测试通过；新版布局、触控和后台暂停尚未经真机确认。可逐项填写的检查步骤见 docs/DEVICE_TEST_CHECKLIST.md。

## 内部离线测试包

在原仓库根目录执行 `./scripts/build-android-test.ps1 -BuildRoot C:/am-p0`，生成 arm64 release 变体测试包到 `.local/apk/`。脚本自动保留完整目录结构，使用开发签名，不用于商店正式发布。可用 `-DebugKeystore` 指定旧开发版签名文件，以保持更新安装一致；文件不入 Git。

本次构建遇到 Google 仓库缺失 lint 工具时，使用 `-SkipNativeLint` 将该检查明确留待后续；正常情况下不要传该选项。原生配置插件让 release 中共有依赖与 debug 使用一致版本。安装包实际构建状态与未完成检查见 P0_REPORT.md。

手机上检查：开启摄像头并授权 → 前置预览 → 暂停 → 恢复 → 结束 → 重新开启 → 返回键关闭 → 切后台确认摄像头停止。权限拒绝后可重试或进入系统设置。确认摄像头隐私指示在暂停 / 退出后关闭。

这些步骤只有在真实手机执行后才能标记通过；类型和打包通过不代表摄像头功能验收完成。
# 0.3.0 电脑同步扩展

2026-11-06：新增“连接电脑”、手机 SQLite 历史、配对深链接和断线补传。首页本次结果仍是内存摘要，完整历史单独持久化。该版本新增 expo-sqlite 原生模块，必须重新构建 APK，不能只替换 0.2.0 的 JS。

本轮类型检查、生产导出与原生 APK 构建通过；已生成 `.local/apk/ai-motion-0.3.0-test.apk`，检查包含 SQLite 动态库。SDK 在 Codex MSIX 应用缓存内找回，环境脚本已兼容。原生 release lint 延续内部测试暂缓项，未做真机联机验证。已有 0.2.0 测试包不含同步功能。电脑工作台可独立使用，详见 [使用说明](../../docs/DESKTOP_GUIDE.md) 与 [同步测试清单](../../docs/DESKTOP_TEST_CHECKLIST.md)。
