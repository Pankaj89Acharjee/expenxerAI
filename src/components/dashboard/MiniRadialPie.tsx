import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';
import { formatCurrency } from '@/src/utils/format';

export type RadialSegment = {
  value: number;
  label: string;
  colors: [string, string];
};

type Props = {
  segments: RadialSegment[];
  size?: number;
  emptyLabel?: string;
};

/**
 * Touchable donut: tap cycles segments and shows value tip.
 */
export function MiniRadialPie({ segments, size = 100, emptyLabel = 'No data' }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const total = Math.max(
    segments.reduce((s, seg) => s + Math.max(seg.value, 0), 0),
    0.001
  );
  const stroke = Math.max(10, Math.round(size * 0.15));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let cumulative = 0;
  const arcs = segments.map((seg, i) => {
    const ratio = Math.max(seg.value / total, 0);
    const len = ratio * circ;
    const offset = -cumulative * circ;
    cumulative += ratio;
    return { ...seg, len, offset, id: `seg${i}` };
  });

  const active = activeIdx !== null ? segments[activeIdx] : segments[0] ?? null;
  const pct = active ? Math.round((active.value / total) * 100) : 0;
  const hasData = segments.some((s) => s.value > 0);

  return (
    <Pressable
      onPress={() => {
        if (!hasData || segments.length === 0) return;
        setActiveIdx((prev) => {
          if (prev === null) return 0;
          const next = prev + 1;
          return next >= segments.length ? null : next;
        });
      }}
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="button"
      accessibilityLabel={segments.map((s) => `${s.label} ${formatCurrency(s.value)}`).join(', ')}
    >
      <Svg width={size} height={size}>
        <Defs>
          {arcs.map((arc) => (
            <LinearGradient key={arc.id} id={arc.id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={arc.colors[0]} stopOpacity="1" />
              <Stop offset="1" stopColor={arc.colors[1]} stopOpacity="1" />
            </LinearGradient>
          ))}
        </Defs>
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          <Circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" />
          {arcs.map((arc, i) =>
            arc.len > 1 ? (
              <Circle
                key={arc.id}
                cx={cx}
                cy={cy}
                r={r}
                stroke={`url(#${arc.id})`}
                strokeWidth={activeIdx === i ? stroke + 3 : stroke}
                fill="none"
                strokeDasharray={`${arc.len} ${circ}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
                opacity={activeIdx !== null && activeIdx !== i ? 0.35 : 1}
              />
            ) : null
          )}
        </G>
      </Svg>

      <View style={styles.center} pointerEvents="none">
        {hasData ? (
          <>
            <Text style={[styles.centerPct, size < 90 && { fontSize: 16 }]}>{pct}%</Text>
            <Text style={styles.centerHint} numberOfLines={1}>
              {active?.label ?? ''}
            </Text>
          </>
        ) : (
          <Text style={styles.centerHint}>{emptyLabel}</Text>
        )}
      </View>

      {activeIdx !== null && active ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={[styles.tooltipLabel, { color: active.colors[1] }]}>{active.label}</Text>
          <Text style={styles.tooltipVal}>{formatCurrency(active.value)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Convenience wrapper for spend vs saving. */
export function SpendSaveRadialPie({
  spent,
  remaining,
  size = 100,
}: {
  spent: number;
  remaining: number;
  size?: number;
}) {
  return (
    <MiniRadialPie
      size={size}
      segments={[
        { value: spent, label: 'Spend', colors: ['#9F1239', '#E11D48'] },
        { value: remaining, label: 'Saving', colors: ['#065F46', '#10B981'] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPct: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', letterSpacing: -0.5 },
  centerHint: { color: 'rgba(255,255,255,0.6)', fontSize: 8, fontWeight: '700', marginTop: 1 },
  tooltip: {
    position: 'absolute',
    bottom: -12,
    left: -24,
    right: -24,
    minWidth: 96,
    maxWidth: 170,
    alignItems: 'center',
    backgroundColor: 'rgba(2, 36, 30, 0.92)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    paddingLeft: 20,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  tooltipLabel: { fontSize: 11, fontWeight: '800', color: '#F8FAFC' },
  tooltipVal: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginTop: 2 },
});
