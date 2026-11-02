# AI Motion

通过手机摄像头识别人体姿态，用身体移动完成简单运动互动。

**当前状态：最小 Android 摄像头应用已构建并安装，荣耀 Magic7 Pro 真机预览、暂停、恢复和结束通过首轮验证。** 姿态识别、骨骼与游戏尚未接入。

## P0：Motion Catch

目标流程：打开前置摄像头 → 本地姿态识别 → 骨骼叠加 → 躯干控制光标 → 30 秒目标碰撞游戏 → 展示得分。

- 摄像头视频默认不录制、不保存、不上传。
- 暂不开发账号、云同步、AI 教练、饮食分析或智能手表功能。
- 真机完成完整互动并验证资源释放后，才能认定 P0 完成。

## 开发文档

- [完整开发任务书](AI_Motion_P0_Codex_开发任务书.md)
- [第一阶段工作清单](docs/ROADMAP.md)
- [源码调研与 Android 验证路线](docs/TECHNICAL_RESEARCH.md)
- [Windows Android 环境准备](docs/ANDROID_SETUP.md)
- [手机应用运行说明](apps/mobile/README.md)
- [手机基线依赖](docs/DEPENDENCIES.md)
- [当前完成情况](docs/P0_REPORT.md)
- [视觉运行时决策记录（待验证）](docs/adr/0001-vision-runtime.md)
- [测试计划与结果](docs/TEST_PLAN.md)
- [贡献说明](CONTRIBUTING.md)

## 运行与设备要求

纯帧契约测试可用 Node.js 24+ 执行 `node --test tests/*.test.ts`，无需安装依赖。

手机应用位于 `apps/mobile`，使用 pnpm 11.25.0。先激活 `scripts/android-env.ps1`，进入应用目录运行 `pnpm install --frozen-lockfile`、`pnpm exec expo prebuild --platform android --no-install`、`pnpm exec expo run:android --device`。Windows 必须使用短、无空格的真实项目路径，详见手机应用说明。

摄像头基线使用 Expo 58.0.22、React Native 0.88.1、VisionCamera 5.2.4 与 Nitro Modules 0.37.1，已完成本机 arm64 Android 构建及首轮手机预览验证。原生 MediaPipe Pose 尚未接入。Android 使用 JDK 17；本次实际构建还安装了 SDK / Build Tools 37、NDK 27.1.12297006 与 CMake 3.22.1。iOS 尚未验证。

应用主动申请相机权限，提供拒绝提示与系统设置入口；暂停或进入后台停止相机，结束或返回时卸载相机。当前真机已验证授权、预览、暂停、恢复和结束；拒绝权限、后台与返回键完整测试仍待执行。

## 开源

本项目原创代码和文档采用 [MIT License](LICENSE)。第三方代码、模型和素材遵循各自许可证，尚未引入任何第三方实现或模型。引入前需分别核查许可并记录来源。
