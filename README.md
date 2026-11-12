# AI Motion

通过手机摄像头识别人体姿态，用身体移动完成简单运动互动。

**当前状态：0.4.0 运球实验与手机底部导航已实现。** 手机采用首页 / 训练 / 记录 / 我的；新增本地球体检测、运球估计、左右目标、节奏和视频检查，并同步到本地电脑工作台。APK 已生成，手机模型运行与准确率未验收。投篮 / 进球、真实人体姿态和规范评分尚未接入。详见 [篮球训练与测试清单](docs/BASKETBALL_TRAINING.md)。

本机双击根目录 `启动电脑工作台.cmd` 即可使用已打包程序。其他开发者从 `apps/desktop` 运行 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm start`，不需要部署云服务器。详见 [电脑端使用说明](docs/DESKTOP_GUIDE.md)。

## P0：Motion Catch

目标流程：打开前置摄像头 → 本地姿态识别 → 骨骼叠加 → 躯干控制光标 → 30 秒目标碰撞游戏 → 展示得分。

- 摄像头视频默认不录制、不保存、不上传。
- 用户已扩展范围：并行开发本地电脑工作台、手机同步和可选 AI 复盘；仍不开发账号、云同步、饮食分析或智能手表功能。
- 真机完成完整互动并验证资源释放后，才能认定 P0 完成。

## 开发文档

- [完整开发任务书](AI_Motion_P0_Codex_开发任务书.md)
- [第一阶段工作清单](docs/ROADMAP.md)
- [源码调研与 Android 验证路线](docs/TECHNICAL_RESEARCH.md)
- [Windows Android 环境准备](docs/ANDROID_SETUP.md)
- [手机应用运行说明](apps/mobile/README.md)
- [电脑工作台与 AI 接口使用说明](docs/DESKTOP_GUIDE.md)
- [电脑与手机同步测试清单](docs/DESKTOP_TEST_CHECKLIST.md)
- [运球实验、模型许可与测试清单](docs/BASKETBALL_TRAINING.md)
- [手机基线依赖](docs/DEPENDENCIES.md)
- [运动控制与游戏实现](docs/MOTION_CATCH.md)
- [基础框架与后续接入边界](docs/ARCHITECTURE.md)
- [逐项功能实现状态](docs/FEATURE_STATUS.md)
- [可逐项填写的实机测试清单](docs/DEVICE_TEST_CHECKLIST.md)
- [界面设计方向与 skill 来源](docs/UI_DIRECTION.md)
- [当前完成情况](docs/P0_REPORT.md)
- [视觉运行时决策记录（待验证）](docs/adr/0001-vision-runtime.md)
- [测试计划与结果](docs/TEST_PLAN.md)
- [贡献说明](CONTRIBUTING.md)

## 运行与设备要求

运动、游戏、会话、底部导航、运球和协议测试可用 Node.js 24+ 执行 `node --test tests/*.test.ts`，无需安装依赖，当前 69 项通过。桌面另有 9 项集成测试，桌面真实操作流程和打包启动已验证。这些结果不证明真实运球准确率。

手机应用位于 `apps/mobile`，使用 pnpm 11.25.0。先激活 `scripts/android-env.ps1`，进入应用目录运行 `pnpm install --frozen-lockfile`、`pnpm exec expo prebuild --platform android --no-install`、`pnpm exec expo run:android --device`。Windows 必须使用短、无空格的真实项目路径，详见手机应用说明。

摄像头基线使用 Expo 58.0.22、React Native 0.88.1、VisionCamera 5.2.4 与 Nitro Modules 0.37.1，已完成本机 arm64 Android 构建及首轮手机预览验证。原生 MediaPipe Pose 尚未接入。Android 使用 JDK 17；本次实际构建还安装了 SDK / Build Tools 37、NDK 27.1.12297006 与 CMake 3.22.1。iOS 尚未验证。

应用主动申请相机权限，提供拒绝提示与系统设置入口；暂停或进入后台停止相机，结束或返回时卸载相机。当前真机已验证授权、预览、暂停、恢复和结束；拒绝权限、后台与返回键完整测试仍待执行。

模拟体验从首页进入，可拖动或点击左右按钮控制光标，运行 30 秒游戏、暂停 / 继续 / 结束、查看结果与重开。调试信息支持模拟输入丢失、仅上半身与合成骨骼显示；此模式不启用相机，不代表模型已检测到真人。

完成一轮后回到首页可查看本次结果或清除。0.3.0 新增的手机完整训练历史单独保存在本地 SQLite，配对后可补传到电脑；首页清除仅清除本次摘要。未来原生姿态数据接收层已经实现校验、最新帧缓冲和会话隔离，尚未连接真实模型。

## 开源

本项目原创代码和文档采用 [MIT License](LICENSE)。第三方依赖遵循各自许可证，见依赖记录。尚未引入姿态模型或训练素材，引入前需分别核查许可并记录来源。
