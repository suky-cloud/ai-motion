# 手机摄像头基线依赖

初次集成日期：2026-11-02。精确解析结果见 `apps/mobile/pnpm-lock.yaml`，不对该组合的其他设备兼容性作保证。

| 直接依赖 | 版本 | 用途 | package 声明的许可证 |
| --- | --- | --- | --- |
| expo | 58.0.22 | 应用与原生工程生成 | MIT |
| expo-dev-client | 58.0.18（锁文件解析值） | 本机开发构建 | MIT |
| react | 19.3.0 | UI | MIT |
| react-native | 0.88.1 | Android 原生应用 | MIT |
| react-native-vision-camera | 5.2.4 | 前置摄像头与生命周期 | MIT |
| react-native-nitro-modules | 0.37.1 | V5 原生绑定 | MIT |
| react-native-nitro-image | 0.15.2 | VisionCamera 必需依赖 | MIT |

React / React Native 版本依据 Expo 官方 blank-typescript 模板 58.0.31 的依赖声明。`expo install --check` 已通过。上游源码和许可随各自包保留，不把第三方代码重新许可为本项目 MIT。

当前没有引入 MediaPipe SDK、模型或训练素材。模型许可与固定版本的核查仍是下一技术验证阶段的工作。

2026-11-05：基础框架未新增 JS 依赖。为对齐 debug / release 的原生依赖图，Expo 本地配置插件对共有依赖启用 Gradle 的 shouldResolveConsistentlyWith 机制，避免 release 回落到本次官方仓库中缺失的旧版组件；不更换 Expo、RN、VisionCamera 或 Nitro 的版本。以后升级这些模块时需一并复核该约束。
# 0.3.0 追加依赖（2026-11-06）

电脑独立工程 `apps/desktop` 使用锁定的 Electron 45.2.3、React / React DOM 19.3.1、ws 8.22.1、qrcode 1.5.4，构建使用 Vite 8.3.6、esbuild 0.28.2、TypeScript 6.0.3、@electron/packager 19.1.1。Electron 实测内置 Node 24.22.2、SQLite 3.53.4，直接使用 `node:sqlite`，不新增原生数据库编译依赖。第三方许可见 `apps/desktop/THIRD_PARTY_NOTICES.md`。

手机通过 Expo 官方安装器新增 `expo-sqlite ~58.0.15` 与对应配置插件，已完成原生重建；SQLite 使用模块附带的本地 Maven 预编译库，已检查 APK 内动态库。本地插件 `withLocalSync` 将 Android compile / target 设为 37、声明局域网运行时权限并启用本地 WS 明文网络。该权限要求与 [Android 官方规则](https://developer.android.com/privacy-and-security/local-network-permission) 对齐。SDK 在 Codex MSIX 缓存内找回，原生 release lint 暂缓；未做真机联机验收。
# 0.4.0 追加（2026-11-12）

新增 Expo 本地 Android 模块 ball-vision：TensorFlow Lite Task Vision 0.4.4（Apache-2.0）、CameraX 1.7.0-alpha03（匹配既有 VisionCamera）。MediaPipe / 新 LiteRT 构件在本环境无法获取，未使用不明镜像。模型 EfficientDet-Lite0 int8 v1 的 TensorFlow 发布许可、SHA-256 和 4 KB JNI 对齐限制见 `BASKETBALL_TRAINING.md` 与模块 MODEL_NOTICE.txt。新增 expo-document-picker ~58.0.5、react-native-safe-area-context ~5.11.1；需重建原生包。电话状态权限由新依赖带入但训练不需要，已明确阻止，不申请。
