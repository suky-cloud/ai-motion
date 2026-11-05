import React from 'react';
import { StyleSheet, View } from 'react-native';
import { landmarkConfidence, mapToPreview, SKELETON } from '../../../../packages/motion-core/src/index.ts';
import type { PoseFrame, PreviewTransform } from '../../../../packages/motion-core/src/index.ts';

/** Shares exactly the controller's coordinate transform; the parent clips crop overflow. */
export default function LandmarkOverlay({ pose, transform }: { pose: PoseFrame | null; transform: PreviewTransform | null }) {
  if (!pose?.isTracked || !transform) return null;
  const { viewWidth: width, viewHeight: height } = transform;
  const points = pose.landmarks.map(point => landmarkConfidence(point) >= 0.5 ? mapToPreview(point, transform) : null);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {SKELETON.map(([a, b]) => {
      const from = points[a], to = points[b];
      if (!from || !to) return null;
      const dx = (to.x - from.x) * width, dy = (to.y - from.y) * height;
      const length = Math.hypot(dx, dy);
      return <View key={`${a}-${b}`} style={{ position: 'absolute', height: 2, width: length, backgroundColor: '#689BA0',
        left: (from.x + to.x) * width / 2 - length / 2, top: (from.y + to.y) * height / 2 - 1,
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
    })}
    {points.map((point, index) => point && <View key={index} style={{ position: 'absolute', width: 5, height: 5,
      borderRadius: 3, backgroundColor: '#26736C', left: point.x * width - 2.5, top: point.y * height - 2.5 }} />)}
  </View>;
}
