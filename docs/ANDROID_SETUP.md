# Windows Android 开发环境

2026-11-06：在 Codex MSIX 环境中，实际 SDK 可能位于 `%LOCALAPPDATA%/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/Android/Sdk`。`android-env.ps1` 已增加自动查找，仍优先尊重显式 `ANDROID_HOME`。本轮复用该 SDK 完成 0.3.0 原生包构建，没有重新要求手机连接。

目标：Android 真机上的 Expo Development Build / 原生摄像头验证。

## 当前安装进度（2026-11-02）

- Google 命令行工具 15859902 已下载并解压到用户 Android/Sdk 目录。
- 下载 SHA-256 已与 Google 下载页核对：`90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a`。
- Microsoft JDK 17.0.21.0.2 已安装，项目环境脚本执行后已核实 `java -version`。
- 用户已明确同意 SDK 许可，安装工具已确认许可接受完成。
- platform-tools 37.0.1（adb 1.0.41）、Android platform 36、build-tools 36.0.0 已安装，环境检查全部通过。
- 最小应用实际构建另安装 Android platform 37.0、build-tools 37.0.0、NDK 27.1.12297006、CMake 3.22.1，完成 arm64 调试包编译和真机安装。
- 荣耀 Magic7 Pro 已通过 USB 调试授权，`adb devices -l` 状态为 `device`，Windows 已出现 ADB Interface。
- 实际读取：HONOR PTP-AN10，Android 17 / API 37，CPU ABI 为 arm64-v8a；系统声明支持前置摄像头。未在仓库记录设备序列号。
- 安装缓存位于被 Git 忽略的 `.local/`，不会上传到开源仓库。
- 系统安装等待期间额外准备了微软官方便携 JDK 17，并核验官方 SHA-256；系统安装随后成功，实际环境使用系统 JDK 17。

依据：[Google 官方下载页](https://developer.android.com/studio)、[Expo Android 环境说明](https://docs.expo.dev/workflow/android-studio-emulator/)。当前官方命令行包提示 sdkmanager 已弃用、建议迁移 Android CLI；后续工具脚本需跟随新 CLI 适配。

## 使用方式

在项目根目录打开 PowerShell：

```powershell
. ./scripts/android-env.ps1
./scripts/check-android.ps1
```

环境脚本只修改当前 PowerShell 会话，保留系统已有 JDK。检查脚本会报告缺项并在缺项时返回失败，不将“存在 SDK 目录”当成构建环境完整。

## 连接手机

1. 手机“设置 → 关于手机”中连续点击版本号，开启开发者选项（厂商菜单可能不同）。
2. 在开发者选项开启 USB 调试，用支持数据传输的 USB 线连接电脑。
3. 解锁手机，确认 USB 调试授权提示。
4. 安装 adb 后检查 `adb devices -l`，状态应为 `device`；`unauthorized` 表示需在手机确认。

不需要开启 OEM 解锁或解锁 bootloader。Windows 识别到文件传输设备不等于 ADB 调试接口已可用；若 adb 列表为空，应先确认手机 USB 调试设置，再检查厂商官方驱动。当前已完成应用构建、安装及首轮前置预览 / 暂停 / 恢复 / 结束测试；姿态推理尚未接入。
