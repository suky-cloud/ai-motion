# P0 当前状态

日期：2026-11-02

## 已完成

- 已阅读开发任务书；初始工作区只有该文档，无既有代码或 Git 仓库。
- 已补充开源配置、项目说明、贡献说明、路线清单、测试计划和待决策 ADR。
- 原始开发任务书保留不变。
- 已新增 apps/mobile 最小 Expo Development Build 应用：前置相机、主动授权、拒绝提示和设置入口、暂停 / 恢复 / 结束、后台停止、返回键关闭。
- 已成功构建 arm64 调试 APK，安装到荣耀 Magic7 Pro。用户确认前置预览与暂停 / 恢复 / 结束正常；Metro 记录 camera started / preview started，手机日志记录 camera stopped 及 Camera #1 CLOSED。
- 已阅读三个指定仓库的核心文件、依赖和许可证，记录研究快照与兼容风险，见 TECHNICAL_RESEARCH.md。
- 已实现同步帧门控契约，7 项自动化测试通过：限帧、失败释放、暂停恢复、时间戳过滤、会话重置、参数校验、异步误用检测。
- Android 基础工具环境已准备：JDK 17.0.21、命令行工具、adb 37.0.1、platform 36、build-tools 36.0.0，检查全部通过；提供当前会话环境激活脚本。荣耀 Magic7 Pro 已完成 adb 调试授权并成功执行设备信息查询，详见 ANDROID_SETUP.md。

## 环境初检

- Windows；Git 2.55.0.windows.3、GitHub CLI 2.97.0 可用。
- PATH 中找到 Node.js 和 Microsoft JDK 25；尚未验证与未来移动端构建工具链的兼容性。
- Node.js 24.22.1、pnpm 11.25.0 可用。使用 scripts/android-env.ps1 可在当前 PowerShell 激活 JDK 17、SDK 和 adb；不改变全局默认 JDK。
- 真机：荣耀 Magic7 Pro（HONOR PTP-AN10），Android 17 / API 37，arm64-v8a；adb 状态 device，系统声明前置摄像头可用。Windows 本机无法运行 Xcode。
- GitHub CLI 已验证登录账号 suky-cloud；远程仓库目标为 https://github.com/suky-cloud/ai-motion。

## 尚未完成

源码首轮研究与最小摄像头应用已完成。模型及未来依赖的许可核查、原生 MediaPipe 帧输入 Spike、姿态识别、运动算法和游戏未完成。摄像头基线已通过原生构建与首轮真机验证，不能据此推定 Pose 原生模型链路兼容。

## 测试与性能

2026-11-02 执行 `node --test tests/*.test.ts`：7 项通过、0 失败。仅使用合成帧，不证明原生模型链路。

手机应用 `tsc --noEmit` 与 `expo install --check` 通过；Metro Android bundle 请求返回 HTTP 200；短目录原生 `app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=4` 成功，400 个任务，最终构建用时 3m13s（不含此前下载与失败尝试）。安装返回 Success，adb 启动返回 ok。用户确认前置预览及暂停 / 恢复 / 结束正常。权限记录 granted=true，结束后相机 CLOSED。

未执行权限拒绝 / 设置恢复、后台与返回键完整回归、5 分钟稳定性、姿态 / 游戏测试；没有实测 FPS、端到端延迟或发热数据。

## 构建限制

初始 Windows 工作区的长路径 / 空格导致 Ninja 失败；subst 又产生 M: / C: 根路径冲突。最终保留原工作区，在 C:/Users/Lenovo/am 使用同源独立应用副本与 hoisted 依赖成功构建，依赖版本未更换。原生工程和本地 APK / 失败构建缓存均不入 Git。

开发服务目前从原工作区通过 USB reverse 8081 提供 JS。调试 APK 依赖该服务，不是独立发行版。RN SafeAreaView 有弃用提示，当前未影响用户确认的流程，后续界面阶段处理。

下一步做原生 MediaPipe 帧输入 Spike，并补充相机异常、后台与稳定性测试。
