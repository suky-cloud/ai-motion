# AI Motion 基础框架

## 0.4.0 运球分层

`packages/basketball-core` 负责球框校验、单球周期、异常轨迹、会话与左右目标。手机 `src/basketball` 编排相机 / 模拟 / 视频，`modules/ball-vision` 为独立 CameraX + TensorFlow Lite Expo 原生模块，与保留的 VisionCamera 页按路由互斥挂载。底部 tab 与详情 route 分离，退出回所属分区。训练协议追加 ball / video 来源与校验后的 dribble 摘要，电脑 0.4.0 支持接收。视频不计实际运动，轨迹不作为姿态证据。兼容与验收边界见 `BASKETBALL_TRAINING.md`。

## 0.3.0 并行电脑端扩展

2026-11-06 新增 `apps/desktop`：Electron 主进程负责 SQLite、局域网 WebSocket、文件对话框与 AI 请求；隔离的 React 页面通过窄 IPC 白名单读取数据。页面关闭 Node 集成与网络请求，拒绝新窗口、导航和权限申请。生产程序不开放调试端口。

`packages/training-core` 共用纯数据协议、计划阶段、输入校验、ACK 与配对地址规则、热量估算边界、基于现有证据的提示。`squat.ts` 是独立实验侧视几何与计数器，未接原生模型，不代表真实动作规范判定。

手机 `src/sync` 使用 expo-sqlite 保存每个会话最新阶段与待补传状态。按秒写入，阶段变化立即写；结束记录优先保证落盘，重连重发，收到对应或更新序号 ACK 后标为已同步，迟到 ACK 不清除新数据。手机后台关闭连接、前台重连；超时重试有退避。配对只存内存。

电脑仅在显式开启时监听局域网随机端口。鉴权握手、载荷大小、消息速率、过期令牌与网页来源限制位于主进程。当前为可信私人网络明文 WS，不提供公网中继、TLS 或视频传输。接收时按设备所有权、会话身份和递增序号校验；SQLite 全量摘要替换更新，完成后不能重新打开。

AI 仅接受 HTTPS 或本机回环 HTTP；密钥系统加密，不进入页面或备份。明确点击后发送裁剪的统计摘要，禁止自动重定向，限制超时和响应大小。答案为普通文本，保存在本地。摘要没有动作证据，不能输出已有视觉检查的结论。

两端目前能同步的应用数据是手机 Motion Catch 模拟统计；电脑计划还不能下发给手机执行。原生 APK 0.3.0 已构建，检查包含 SQLite 原生动态库，尚未实际两端联机；release lint 延续内部测试包暂缓项。完整用法见 [电脑工作台说明](DESKTOP_GUIDE.md)。

## 以下为 0.2.0 手机框架基线

更新：2026-11-05，应用版本 0.2.0。继续使用 React Native / Expo Development Build / VisionCamera，不改变既定原生方向。

## 已落地的分层

```text
App（类型化路由、当前结果）
  ├─ HomeScreen
  ├─ CameraScreen（已有前置预览）
  └─ MotionCatchScreen（模拟体验）
       └─ useMotionSession（React 生命周期 / 时钟驱动）
            └─ MotionSession（平台无关会话编排）
                 ├─ PoseSource
                 │    ├─ SimulationPoseSource（当前使用）
                 │    └─ LatestPoseSource（未来原生事件入口）
                 ├─ BodyController（motion-core）
                 └─ 游戏状态机（game-core）

LandmarkOverlay 与 BodyController 共用 PreviewTransform
ScreenBoundary 提供页面异常后的首页恢复入口
theme / ActionButton 提供共用颜色和操作控件
```

## 会话层承担的行为

- 统一开始、暂停、继续、结束、重开和销毁；页面不再直接操作游戏状态机或平滑历史。
- 页面进入后台暂停游戏与输入；离开页面清理计时器、AppState 监听和输入源。已结束的结果保留，未完成的页面退出不生成完成记录。
- 界面刷新可快于模型输出：同一帧只处理一次，250ms 内复用有效输入，超过时限清除光标和骨骼。
- 输入源异常时暂停并给出可重试状态，不静默替换成模拟输入。输入停止失败也会保留异常状态。
- 暂停、重开和改变练习场尺寸时清除旧坐标，避免恢复后沿用原会话位置。

## 原生数据接入边界

LatestPoseSource 是已实现的校验和缓冲入口，**尚未连接 Android SDK、MediaPipe 模型或摄像头帧处理插件**。它不负责打开摄像头、分配帧缓冲或运行推理，当前手机页面不会使用它启动真实识别。

未来原生适配器需输出应用自有事件格式：

```ts
{
  timestampMs: number,       // 已转换到与 JS 消费端相同的单调时钟
  isTracked: boolean,
  landmarks: Landmark[],    // 检测到时恰好 33 点；丢失时空数组
  sourceWidth: number,
  sourceHeight: number,
  rotation: 0 | 90 | 180 | 270,
  mirrored: boolean
}
```

校验包括几何尺寸、关键点形状、有限数值和置信度范围，拷贝必要的点数据而不接收图片。单槽缓冲只保留最新帧；重复和倒序帧被丢弃。每次开始产生新 token，旧 token 的迟到结果在暂停 / 重开 / 销毁后失效。未来时间戳视为时钟协议错误并暂停，避免污染后续数据。

原生事件订阅需要捕获开始时的 token 并随回调传入，不能在旧回调执行时读取最新 token，否则会破坏会话隔离。

原生模型初始化、帧到 MPImage 转换、线程绑定、资源释放和相机 isActive 联动，仍由后续平台适配器实现并接受真机验证。本轮的入口测试不证明这些原生链路已经可用。

## 结果与导航

AppReducer 管理 home / camera / simulation 三种路由，每次进入分配新页面身份。异常恢复返回首页后可重新进入，结果更新本身不重挂载游戏。

最后一轮结果包含 schemaVersion、完成时间、输入来源和纯统计结果，不保存关键点、图像或录像。当前只保留在应用内存中，可在首页清除；应用进程结束后消失。该数据结构可供后续本地训练记录扩展，但本轮没有新增数据库、账号或云端传输。

## 生成测试包

`scripts/build-android-test.ps1` 将指定源码复制到有所有权标记的短目录，保留 apps/mobile + packages 的相对结构。已有非本项目目录会被拒绝覆盖，不移动原工作区。

脚本生成内置 JS 的 release 变体测试 APK，使用开发签名、关闭测试包混淆，不作为商店正式发行包。可传入旧开发版 keystore 保持内部测试更新签名一致；签名文件和 APK 不进入 Git。

`plugins/withAndroidBaseline.js` 使用 [Gradle 一致依赖解析](https://docs.gradle.org/current/userguide/dependency_resolution_consistency.html)，使 release 中共有的外部模块与 debug 选择一致版本；各自仍使用对应的编译变体。release 原依赖链引用的旧版组件在本次官方仓库请求中未找到，而开发版已有完整基线缓存。以后升级 Expo / RN 时需一并复核该约束。

测试包默认仍执行原生 release lint；本次缺少官方 lint-gradle 32.2.1 下载，使用显式 SkipNativeLint 选项暂缓该项，需在正式发布前补齐。脚本没有全局关闭项目 lint。

## 验证边界

当前纯逻辑测试 44 项通过；类型检查已通过。新会话流程、错误页、首页结果与独立 APK 的手机行为仍待实测，逐项步骤见 DEVICE_TEST_CHECKLIST.md。真实姿态模型、完整身体控制与性能验收仍未完成。

0.2.0 内部 APK 已成功构建并通过签名、版本、权限和内置 bundle 检查，未在本轮手机上运行。release lint 因工具下载失败明确暂缓；详见 P0_REPORT.md。
