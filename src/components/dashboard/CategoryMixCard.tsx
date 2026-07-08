import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MiniRadialPie, type RadialSegment } from '@/src/components/dashboard/MiniRadialPie';
import { formatCurrency } from '@/src/utils/format';

const MIX_PALETTE: [string, string][] = [
  ['#1D4ED8', '#60A5FA'],
  ['#9F1239', '#FB7185'],
  ['#065F46', '#34D399'],
  ['#6B21A8', '#C084FC'],
  ['#0E7490', '#22D3EE'],
];

type Props = {
  categories: [string, number][];
  total: number;
};

export function CategoryMixCard({ categories, total }: Props) {
  const [active, setActive] = useState<string | null>(null);

  const segments: RadialSegment[] = useMemo(
    () =>
      categories.map(([label, value], i) => ({
        value,
        label,
        colors: MIX_PALETTE[i % MIX_PALETTE.length],
      })),
    [categories]
  );

  const activeSeg = segments.find((s) => s.label === active) ?? segments[0];
  const activePct = total > 0 && activeSeg ? Math.round((activeSeg.value / total) * 100) : 0;

  return (
    <LinearGradient
      colors={['#1E1B4B', '#312E81', '#1E1B4B', '#020617']}
      locations={[0, 0.35, 0.7, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <Text style={styles.title}>Category Mix</Text>
      <Text style={styles.subtitle}>Top 5 share of spending · tap the ring</Text>

      {categories.length === 0 ? (
        <Text style={styles.empty}>No category data yet.</Text>
      ) : (
        <View style={styles.body}>
          <View style={styles.pieCol}>
            <MiniRadialPie segments={segments} size={132} />
            {activeSeg ? (
              <View style={styles.activeChip}>
                <Text style={[styles.activeName, { color: activeSeg.colors[1] }]} numberOfLines={1}>
                  {activeSeg.label}
                </Text>
                <Text style={styles.activeAmt}>{formatCurrency(activeSeg.value)}</Text>
                <Text style={styles.activePct}>{activePct}% of mix</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.legendCol}>
            {segments.map((seg) => {
              const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
              const selected = active === seg.label;
              return (
                <Pressable
                  key={seg.label}
                  onPress={() => setActive((prev) => (prev === seg.label ? null : seg.label))}
                  style={({ pressed }) => [
                    styles.legendItem,
                    selected && styles.legendItemActive,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <LinearGradient
                    colors={seg.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.legendSwatch}
                  />
                  <View style={styles.legendCopy}>
                    <Text style={styles.legendName} numberOfLines={1}>
                      {seg.label}
                    </Text>
                    <Text style={styles.legendMeta} numberOfLines={1}>
                      {formatCurrency(seg.value)} · {pct}%
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    overflow: 'hidden',
    gap: 10,
  },
  title: { color: '#E0E7FF', fontSize: 15, fontWeight: '800' },
  subtitle: { color: 'rgba(224,231,255,0.65)', fontSize: 12, fontWeight: '600', marginTop: -4 },
  empty: { color: 'rgba(255,255,255,0.55)', fontSize: 13, paddingVertical: 12 },
  body: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 4 },
  pieCol: { alignItems: 'center', width: 140 },
  activeChip: {
    marginTop: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    minWidth: 120,
  },
  activeName: { fontSize: 11, fontWeight: '800' },
  activeAmt: { color: '#fff', fontSize: 14, fontWeight: '900', marginTop: 2 },
  activePct: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600', marginTop: 2 },
  legendCol: { flex: 1, gap: 8 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  legendItemActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(196,181,253,0.45)',
  },
  legendSwatch: { width: 12, height: 36, borderRadius: 6 },
  legendCopy: { flex: 1, minWidth: 0 },
  legendName: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  legendMeta: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', marginTop: 2 },
});
