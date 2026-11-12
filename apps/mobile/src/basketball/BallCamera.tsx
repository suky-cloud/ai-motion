import React from "react";
import { Platform, Text } from "react-native";
import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ViewProps } from "react-native";
import type { BallFrame } from "../../../../packages/basketball-core/src/index.ts";
type NativeProps = ViewProps & {
  active: boolean;
  sessionToken: string;
  onObservation: (event: {
    nativeEvent: { token: string; frame: BallFrame };
  }) => void;
  onFailure: (event: {
    nativeEvent: { message: string; token: string };
  }) => void;
  onReady: (event: { nativeEvent: { token: string } }) => void;
};
export const BallVision =
  Platform.OS === "android"
    ? requireOptionalNativeModule<{
        analyzeVideo: (
          uri: string,
        ) => Promise<{ durationMs: number; frames: BallFrame[] }>;
      }>("BallVision")
    : null;
const NativeCamera = BallVision
  ? requireNativeView<NativeProps>("BallVision")
  : null;
export default function BallCamera(props: NativeProps) {
  return NativeCamera ? (
    <NativeCamera {...props} />
  ) : (
    <Text>请安装包含球体识别模块的新版 Android 测试包。</Text>
  );
}
