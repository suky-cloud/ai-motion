# AI Motion 最小手机应用

本阶段仅实现前置摄像头：主动申请权限、拒绝提示及跳转设置、暂停 / 恢复、结束卸载摄像头、返回键关闭相机、进入后台停止相机。竖屏运行，无录制、上传或模型推理。

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

本机工作区名称含空格且路径较长，原生 C++ 编译出现过 Ninja 重生成循环及目录创建失败；临时 subst 盘符又与自动链接的真实路径冲突。实际构建改用 `C:/Users/Lenovo/am` 的独立应用源码副本，依赖和应用代码与仓库一致，原始工作区保留。后续 Windows 构建应使用短、无空格的真实目录（不是盘符别名）。

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
```

手机上检查：开启摄像头并授权 → 前置预览 → 暂停 → 恢复 → 结束 → 重新开启 → 返回键关闭 → 切后台确认摄像头停止。权限拒绝后可重试或进入系统设置。确认摄像头隐私指示在暂停 / 退出后关闭。

这些步骤只有在真实手机执行后才能标记通过；类型和打包通过不代表摄像头功能验收完成。
