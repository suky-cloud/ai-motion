# AI Motion 手机应用

当前包括首页、Motion Catch 模拟体验、结果页和独立前置摄像头检查页。模拟模式通过拖动或左右按钮产生合成姿态，再经过与未来真实识别共用的运动控制和游戏核心。竖屏运行，无录像、上传或模型推理。

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

根目录 `node --test tests/*.test.ts` 可在没有手机时验证全部纯逻辑。11 月 5 日这轮类型检查、28 项自动化测试及 Android 生产代码打包通过；新版布局、触控和后台暂停尚未经真机确认。

手机上检查：开启摄像头并授权 → 前置预览 → 暂停 → 恢复 → 结束 → 重新开启 → 返回键关闭 → 切后台确认摄像头停止。权限拒绝后可重试或进入系统设置。确认摄像头隐私指示在暂停 / 退出后关闭。

这些步骤只有在真实手机执行后才能标记通过；类型和打包通过不代表摄像头功能验收完成。
