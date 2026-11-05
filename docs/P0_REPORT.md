# P0 当前状态

更新日期：2026-11-05

## 本轮进展（无需手机）

用户当前无法接入手机，因此本轮不安装或启动手机应用。

- 已实现 packages/motion-core：统一 PoseFrame / MotionInput、保守置信度过滤、躯干中心、旋转 / 镜像 / 预览裁剪映射、基于时间步长的平滑、小抖动死区、输入过期和追踪丢失处理。
- 已实现 packages/game-core：30 秒左右接目标、随机目标、一次命中 10 分、暂停 / 恢复 / 提前结束 / 重开、结束冻结、有效输入时长与平均命中间隔。
- 手机端新增自然文案的首页、模拟游戏页和结果页，原相机预览拆为独立页面。模拟模式通过合成姿态经过实际控制与游戏模块；支持模拟输入丢失、半身与合成骨骼调试，不打开摄像头。
- 按用户要求通过 find-skills 选用并阅读 Anthropic frontend-design 设计指导，方向和来源记录在 UI_DIRECTION.md；未引入新 UI 依赖、字体或素材。
- 28 项自动化测试通过，包含完整 30 秒合成姿态集成流程。TypeScript 与 Android 生产 Hermes 打包通过。本轮新版真机测试、截图评审和触控验收未运行。

实现细节与接入约定见 MOTION_CATCH.md。P0 真实人体互动尚未完成。

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
- 11 月 2 日真机：荣耀 Magic7 Pro（HONOR PTP-AN10），Android 17 / API 37，arm64-v8a；当时 adb 状态 device，系统声明前置摄像头可用。11 月 5 日本轮不接入手机。Windows 本机无法运行 Xcode。
- GitHub CLI 已验证登录账号 suky-cloud；远程仓库目标为 https://github.com/suky-cloud/ai-motion。

## 尚未完成

源码首轮研究、相机基线、运动算法与模拟游戏已完成。模型许可核查、原生 MediaPipe 帧输入 Spike、真实姿态识别、相机上的骨骼对齐和真实身体控制游戏未完成。相机基线通过原生构建与首轮真机验证，不能据此推定 Pose 原生模型链路兼容。

## 测试与性能

2026-11-02 执行 `node --test tests/*.test.ts`：7 项通过、0 失败。仅使用合成帧，不证明原生模型链路。

手机应用 `tsc --noEmit` 与 `expo install --check` 通过；Metro Android bundle 请求返回 HTTP 200；短目录原生 `app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=4` 成功，400 个任务，最终构建用时 3m13s（不含此前下载与失败尝试）。安装返回 Success，adb 启动返回 ok。用户确认前置预览及暂停 / 恢复 / 结束正常。权限记录 granted=true，结束后相机 CLOSED。

11 月 5 日新增纯运动 / 游戏测试和模拟完整流程已通过。仍未执行权限拒绝 / 设置恢复、后台与返回键完整真机回归、5 分钟稳定性、真实姿态 / 游戏测试；没有实测推理 FPS、端到端延迟或发热数据。

## 构建限制

初始 Windows 工作区的长路径 / 空格导致 Ninja 失败；subst 又产生 M: / C: 根路径冲突。最终保留原工作区，在 C:/Users/Lenovo/am 使用同源独立应用副本与 hoisted 依赖成功构建，依赖版本未更换。原生工程和本地 APK / 失败构建缓存均不入 Git。

11 月 2 日调试 APK 通过原工作区开发服务和 USB reverse 8081 提供 JS，需要开发服务。当前共享核心位于仓库 packages/，后续短路径构建必须保留完整仓库结构，不能只复制 mobile 目录或沿用旧的独立副本。原相机页面 RN SafeAreaView 有弃用提示，新首页和模拟页不使用该组件。

下一步做原生 MediaPipe 帧输入 Spike，并补充相机异常、后台与稳定性测试。
