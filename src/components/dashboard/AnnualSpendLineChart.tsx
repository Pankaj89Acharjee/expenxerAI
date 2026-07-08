import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
  Line as SvgLine,
} from 'react-native-svg';
import { formatCurrency } from '@/src/utils/format';
import type { MonthlySpendPoint } from '@/src/utils/expenseDateRange';

type Props = {
  data: MonthlySpendPoint[];
  selectedKey: string | null;
  currentMonthIndex: number;
  onSelect: (key: string) => void;
  maxTotal: number;
};

const CHART_H = 128;
const PAD_T = 12;
const PAD_B = 8;
const PAD_X = 8;

export function AnnualSpendLineChart({
  data,
  selectedKey,
  currentMonthIndex,
  onSelect,
  maxTotal,
}: Props) {
  const { width: winW } = useWindowDimensions();
  // Card is roughly screen - scroll padding (~32) - card padding (~28)
  const chartW = Math.max(280, Math.min(winW - 56, 420));

  const points = useMemo(() => {
    const usableH = CHART_H - PAD_T - PAD_B;
    const n = Math.max(data.length - 1, 1);
    return data.map((d, i) => {
      const x = PAD_X + (i / n) * (chartW - PAD_X * 2);
      const ratio = maxTotal > 0 ? d.total / maxTotal : 0;
      const y = PAD_T + usableH * (1 - ratio);
      return { ...d, x, y };
    });
  }, [data, chartW, maxTotal]);

  const linePath = useMemo(() => {
    if (points.length === 0) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const baseY = CHART_H - PAD_B;
    const first = points[0];
    const last = points[points.length - 1];
    return (
      `${linePath} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`
    );
  }, [linePath, points]);

  const selected =
    points.find((p) => p.key === selectedKey) ??
    points.find((p) => p.monthIndex === currentMonthIndex) ??
    points[0];

  return (
    <View>
      <Text style={styles.valueLine}>
        {selected?.month} {selected?.year}: {formatCurrency(selected?.total ?? 0)}
      </Text>

      <View style={[styles.chartBox, { width: chartW }]}>
        <Svg width={chartW} height={CHART_H}>
          <Defs>
            <LinearGradient id="annualArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#38BDF8" stopOpacity="0.45" />
              <Stop offset="1" stopColor="#0EA5E9" stopOpacity="0.02" />
            </LinearGradient>
            <LinearGradient id="annualStroke" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#0369A1" stopOpacity="1" />
              <Stop offset="0.5" stopColor="#38BDF8" stopOpacity="1" />
              <Stop offset="1" stopColor="#7DD3FC" stopOpacity="1" />
            </LinearGradient>
          </Defs>

          {/* guide lines */}
          {[0.25, 0.5, 0.75].map((t) => {
            const y = PAD_T + (CHART_H - PAD_T - PAD_B) * t;
            return (
              <SvgLine
                key={t}
                x1={PAD_X}
                y1={y}
                x2={chartW - PAD_X}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
              />
            );
          })}

          {areaPath ? <Path d={areaPath} fill="url(#annualArea)" /> : null}
          {linePath ? (
            <Path d={linePath} stroke="url(#annualStroke)" strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          ) : null}

          {points.map((p) => {
            const isSelected = selected?.key === p.key;
            return (
              <Circle
                key={p.key}
                cx={p.x}
                cy={p.y}
                r={isSelected ? 6 : 3.5}
                fill={isSelected ? '#E0F2FE' : '#0EA5E9'}
                stroke={isSelected ? '#38BDF8' : 'rgba(14,165,233,0.4)'}
                strokeWidth={isSelected ? 2.5 : 1}
              />
            );
          })}
        </Svg>

        {/* touch targets over each month */}
        <View style={[styles.hitRow, { width: chartW, height: CHART_H }]} pointerEvents="box-none">
          {points.map((p) => (
            <Pressable
              key={p.key}
              style={[styles.hitCol, { left: p.x - 14, width: 28 }]}
              onPress={() => onSelect(p.key)}
              accessibilityRole="button"
              accessibilityLabel={`${p.month}, ${formatCurrency(p.total)}`}
            />
          ))}
        </View>
      </View>

      <View style={[styles.labelRow, { width: chartW }]}>
        {points.map((p) => {
          const isSelected = selected?.key === p.key;
          return (
            <Pressable key={p.key} style={styles.labelCol} onPress={() => onSelect(p.key)}>
              <Text
                style={[
                  styles.monthLabel,
                  {
                    color: isSelected ? '#E0F2FE' : 'rgba(255,255,255,0.5)',
                    fontWeight: isSelected ? '800' : '600',
                  },
                ]}
              >
                {p.month.slice(0, 3)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  valueLine: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  chartBox: { position: 'relative', alignSelf: 'center' },
  hitRow: { position: 'absolute', top: 0, left: 0 },
  hitCol: { position: 'absolute', top: 0, bottom: 0 },
  labelRow: { flexDirection: 'row', alignSelf: 'center', marginTop: 4 },
  labelCol: { flex: 1, alignItems: 'center' },
  monthLabel: { fontSize: 9 },
});
