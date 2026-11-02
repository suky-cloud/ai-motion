# Windows Android 开发环境

目标：Android 真机上的 Expo Development Build / 原生摄像头验证。

## 当前安装进度（2026-11-02）

- Google 命令行工具 15859902 已下载并解压到用户 Android/Sdk 目录。
- 下载 SHA-256 已与 Google 下载页核对：`90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a`。
- Microsoft JDK 17.0.21 安装程序已校验并启动，等待 Windows 管理员授权；尚未确认安装完成。
- SDK 许可尚未接受，platform-tools、Android platform 36、build-tools 36.0.0 尚未安装。
- 安装缓存位于被 Git 忽略的 `.local/`，不会上传到开源仓库。

依据：[Google 官方下载页](https://developer.android.com/studio)、[Expo Android 环境说明](https://docs.expo.dev/workflow/android-studio-emulator/)。当前官方命令行包提示 sdkmanager 已弃用、建议迁移 Android CLI；后续工具脚本需跟随新 CLI 适配。

## 安装完成后的使用方式

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

不需要开启 OEM 解锁或解锁 bootloader。设备识别成功后再核实型号、系统及摄像头表现。当前未运行手机构建、摄像头或推理测试。
