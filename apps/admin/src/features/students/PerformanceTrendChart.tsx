import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, semantic, typography } from '@/theme/tokens';

type Point = { termId: string; termName: string; avgScore: number };

const CHART_HEIGHT = 140;
const TOP_PAD = 28;
const BOTTOM_PAD = 28;
const SIDE_PAD = 22;
const LABEL_WIDTH = 56;
const DOT_SIZE = 12;

/**
 * A single-series line trend chart (avg score per term) built from plain
 * Views — no SVG/native dependency. Line segments are thin rotated Views
 * sized to each pair's pixel distance and positioned by their midpoint, so
 * the default (center-pivot) rotation lands the segment exactly between the
 * two points without needing `transformOrigin` support.
 */
export function PerformanceTrendChart({ points }: { points: Point[] }) {
  const [width, setWidth] = useState(0);

  if (points.length === 0) return null;

  const innerWidth = Math.max(1, width - SIDE_PAD * 2);
  const innerHeight = CHART_HEIGHT - TOP_PAD - BOTTOM_PAD;

  const values = points.map((p) => p.avgScore);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const range = rawMax - rawMin;
  const headroom = range === 0 ? 5 : range * 0.25;
  const min = rawMin - headroom;
  const max = rawMax + headroom;

  const xAt = (i: number) => SIDE_PAD + (points.length > 1 ? (i * innerWidth) / (points.length - 1) : innerWidth / 2);
  const yAt = (v: number) => TOP_PAD + innerHeight - ((v - min) / (max - min)) * innerHeight;

  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.avgScore) }));
  const baselineY = TOP_PAD + innerHeight;

  const segments = coords.slice(1).map((b, i) => {
    const a = coords[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    return { key: `${points[i].termId}-${points[i + 1].termId}`, length, angle, left: midX - length / 2, top: midY - 1 };
  });

  return (
    <View style={{ height: CHART_HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          <View style={[styles.baseline, { top: baselineY, left: SIDE_PAD, width: innerWidth }]} />

          {segments.map((s) => (
            <View
              key={s.key}
              style={[styles.lineSegment, { width: s.length, left: s.left, top: s.top, transform: [{ rotate: `${s.angle}deg` }] }]}
            />
          ))}

          {coords.map((c, i) => (
            <View key={points[i].termId} style={[styles.dot, { left: c.x - DOT_SIZE / 2, top: c.y - DOT_SIZE / 2 }]} />
          ))}

          {coords.map((c, i) => (
            <View key={`${points[i].termId}-value`} style={[styles.floatLabel, { left: c.x - LABEL_WIDTH / 2, top: c.y - 24, width: LABEL_WIDTH }]}>
              <Text style={styles.valueLabel} numberOfLines={1}>
                {points[i].avgScore}
              </Text>
            </View>
          ))}
          {coords.map((c, i) => (
            <View key={`${points[i].termId}-term`} style={[styles.floatLabel, { left: c.x - LABEL_WIDTH / 2, top: baselineY + 6, width: LABEL_WIDTH }]}>
              <Text style={styles.termLabel} numberOfLines={1}>
                {points[i].termName}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  baseline: { position: 'absolute', height: StyleSheet.hairlineWidth, backgroundColor: semantic.border },
  lineSegment: { position: 'absolute', height: 2, borderRadius: 1, backgroundColor: colors.gold500 },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.gold500,
    borderWidth: 2,
    borderColor: semantic.surface,
  },
  floatLabel: { position: 'absolute', alignItems: 'center' },
  valueLabel: { ...typography.captionStrong, color: semantic.textPrimary },
  termLabel: { ...typography.caption, color: semantic.textSecondary },
});
