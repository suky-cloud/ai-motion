# ADR 0001：摄像头与视觉运行时

状态：首轮源码研究完成，推荐路线待 Android 原生 Spike 验证。

## 约束

姿态识别在设备本地运行，不上传摄像头原始帧；游戏仅依赖统一运动输入。避免通过普通 React Native JS Bridge 高频传输完整图像。

## 待比较方案

| 路线 | 需要验证 | 当前状态 |
| --- | --- | --- |
| React Native + Expo Development Build + VisionCamera + 原生 MediaPipe / TFLite | 当前 API、帧格式、线程、内存释放、模型与许可证、双平台兼容性 | 未验证 |
| MediaPipe Tasks Web / 浏览器或 WebView Spike | 视频输入、时间戳、UI 阻塞、Worker、权限、手机性能 | 未验证；不能作为最终原生方案的验收替代 |

## 决策门槛

实际阅读开发书指定仓库并记录核心文件、版本和许可；用最小 Spike 验证帧输入及资源生命周期；记录真机性能后再确定实施路线。

推荐 Expo Development Build + VisionCamera 5.2.4 + 自有 Nitro 原生 MediaPipe 适配层，见 [源码核查记录](../TECHNICAL_RESEARCH.md)。已确认 V5 可取得 ImageProxy，但 MPImage 转换、线程与完整 Expo 依赖组合尚未构建验证。当前不引入旧版 FrameProcessorPlugin 封装。

已增加独立帧门控契约及 7 项通过的合成输入测试。相机 SDK 已进入下述真机验证基线，MediaPipe SDK 和模型仍未引入。

## 2026-11-02 相机基线更新

已引入 Expo 58.0.22 / RN 0.88.1 / VisionCamera 5.2.4 / Nitro Modules 0.37.1 / Nitro Image 0.15.2，并在 Windows 短真实路径完成 arm64 Android 构建。荣耀 Magic7 Pro 的前置预览和暂停 / 恢复 / 结束经用户确认正常，日志确认启动与关闭。

本次只证明相机链路，仍未引入 MediaPipe SDK 和模型。原生帧到 MPImage、线程、模型版本、许可证和坐标变换继续以最小 Spike 验证。

## 2026-11-05 平台无关运动输入

已实现独立 motion-core / game-core，并以 source=simulation 的合成 PoseFrame 驱动模拟体验，source=pose 保留给未来适配器。游戏会拒绝来源与当前模式不匹配的输入；模拟界面明确标注来源，不以合成骨骼代表真实模型输出。

变换约定、250ms 新鲜度、全身门控与控制失效策略记录于 MOTION_CATCH.md。相关纯逻辑与整轮集成测试通过，真实帧输入与显示对齐尚未验证。未改变原生视觉运行时方向。
