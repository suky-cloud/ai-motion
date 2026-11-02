# AI Motion

通过手机摄像头识别人体姿态，用身体移动完成简单运动互动。

**当前状态：已完成首轮源码调研和帧处理契约测试，尚无可运行的手机应用。** Android 为首个验证平台，原生接入和真机验证尚未完成。

## P0：Motion Catch

目标流程：打开前置摄像头 → 本地姿态识别 → 骨骼叠加 → 躯干控制光标 → 30 秒目标碰撞游戏 → 展示得分。

- 摄像头视频默认不录制、不保存、不上传。
- 暂不开发账号、云同步、AI 教练、饮食分析或智能手表功能。
- 真机完成完整互动并验证资源释放后，才能认定 P0 完成。

## 开发文档

- [完整开发任务书](AI_Motion_P0_Codex_开发任务书.md)
- [第一阶段工作清单](docs/ROADMAP.md)
- [源码调研与 Android 验证路线](docs/TECHNICAL_RESEARCH.md)
- [当前完成情况](docs/P0_REPORT.md)
- [视觉运行时决策记录（待验证）](docs/adr/0001-vision-runtime.md)
- [测试计划与结果](docs/TEST_PLAN.md)
- [贡献说明](CONTRIBUTING.md)

## 运行与设备要求

当前包含项目文档和独立帧处理契约，可用 Node.js 24+ 执行 `node --test tests/*.test.ts`，无需安装依赖。手机应用尚无启动或构建命令，完成原生验证并锁定依赖后补充。

候选方案是 React Native + Expo Development Build、VisionCamera 和原生 MediaPipe Pose；这些组件的组合尚未验证，不以 Expo Go 或浏览器 Demo 代替手机验收。设备平台待确认，Android 需要匹配的 JDK / Android SDK，iOS 构建需要 macOS / Xcode 或另行验证的构建环境。

应用实现后须主动申请摄像头权限，处理拒绝、暂停、退出和资源释放。当前尚未实现权限流程。

## 开源

本项目原创代码和文档采用 [MIT License](LICENSE)。第三方代码、模型和素材遵循各自许可证，尚未引入任何第三方实现或模型。引入前需分别核查许可并记录来源。
