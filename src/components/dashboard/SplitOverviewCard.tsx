import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { AnnualSpendLineChart } from '@/src/components/dashboard/AnnualSpendLineChart';
import { MiniRadialPie, type RadialSegment } from '@/src/components/dashboard/MiniRadialPie';
import { formatCurrency } from '@/src/utils/format';
import { getAnnualMonthlySpendTrend } from '@/src/utils/expenseDateRange';
import { topPayerTotals } from '@/src/utils/splitSpendByMember';
import type { GroupExpense } from '@/src/types/models';

const MIX_PALETTE: [string, string][] = [
  ['#0E7490', '#22D3EE'],
  ['#9F1239', '#FB7185'],
  ['#065F46', '#34D399'],
  ['#6B21A8', '#C084FC'],
  ['#1D4ED8', '#60A5FA'],
  ['#B45309', '#FBBF24'],
  ['#BE185D', '#F472B6'],
  ['#155E75', '#67E8F9'],
];

type Props = {
  expenses: readonly GroupExpense[];
  groupCount: number;
};

export function SplitOverviewCard({ expenses, groupCount }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const payerTotals = useMemo(() => topPayerTotals(expenses, 6), [expenses]);
  const totalPaid = useMemo(
    () => payerTotals.reduce((s, [, amt]) => s + amt, 0),
    [payerTotals]
  );

  const segments: RadialSegment[] = useMemo(
    () =>
      payerTotals.map(([label, value], i) => ({
        value,
        label,
        colors: MIX_PALETTE[i % MIX_PALETTE.length],
      })),
    [payerTotals]
  );

  const annualTrend = useMemo(() => getAnnualMonthlySpendTrend(expenses), [expenses]);
  const maxAnnual = Math.max(...annualTrend.map((d) => d.total), 1);
  const currentMonthIndex = new Date().getMonth();

  const activeSeg = segments.find((s) => s.label === active) ?? segments[0];
  const activePct = totalPaid > 0 && activeSeg ? Math.round((activeSeg.value / totalPaid) * 100) : 0;

  return (
    <LinearGradient
      colors={['#134E4A', '#115E59', '#0F766E', '#042F2E']}
      locations={[0, 0.3, 0.7, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Split Expenses Statistics</Text>
          <Text style={styles.subtitle}>
            Live · {groupCount} Group{groupCount === 1 ? '' : 's'} · Indivdual Expense
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/split')}
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.linkText}>Go-Split</Text>
          <MaterialIcons name="chevron-right" size={18} color="#99F6E4" />
        </Pressable>
      </View>

      {payerTotals.length === 0 ? (
        <Text style={styles.empty}>No split expenses yet. Add spend in a group to see charts.</Text>
      ) : (
        <>          
          <View style={styles.body}>
            <View style={styles.pieCol}>
              <MiniRadialPie segments={segments} size={138} emptyLabel="No split" />
              {activeSeg ? (
                <View style={styles.activeChip}>
                  <Text style={[styles.activeName, { color: activeSeg.colors[1] }]} numberOfLines={1}>
                    {activeSeg.label}
                  </Text>
                  <Text style={styles.activeAmt}>{formatCurrency(activeSeg.value)}</Text>
                  <Text style={styles.activePct}>{activePct}% Paid</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.legendCol}>
              {segments.map((seg) => {
                const pct = totalPaid > 0 ? Math.round((seg.value / totalPaid) * 100) : 0;
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

          <View style={styles.lineBlock}>
            <Text style={styles.sectionLabel}>Monthly split · {new Date().getFullYear()}</Text>
            <Text style={styles.lineHint}>Line chart · group spend by month</Text>
            <AnnualSpendLineChart
              data={annualTrend}
              selectedKey={selectedMonthKey}
              currentMonthIndex={currentMonthIndex}
              maxTotal={maxAnnual}
              onSelect={setSelectedMonthKey}
            />
          </View>
        </>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#CCFBF1', fontSize: 15, fontWeight: '800' },
  subtitle: { color: 'rgba(204,251,241,0.65)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  link: { flexDirection: 'row', alignItems: 'center' },
  linkText: { color: '#99F6E4', fontWeight: '700', fontSize: 12 },
  empty: { color: 'rgba(255,255,255,0.55)', fontSize: 13, paddingVertical: 12 },
  sectionLabel: { color: '#E0F2FE', fontSize: 12, fontWeight: '800', letterSpacing: 0.3, marginTop: 4 },
  lineHint: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', marginTop: -4 },
  body: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginTop: 8 },
  pieCol: { alignItems: 'center', width: 136 },
  activeChip: {
    marginTop: 18,
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
    borderColor: 'rgba(45,212,191,0.45)',
  },
  legendSwatch: { width: 12, height: 36, borderRadius: 6 },
  legendCopy: { flex: 1, minWidth: 0 },
  legendName: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  legendMeta: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  lineBlock: { marginTop: 8, gap: 6 },
});
