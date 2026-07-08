import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Liability } from '@/src/types/models';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency, formatDate } from '@/src/utils/format';
import {
  listLoanEmiSummaries,
  type LoanEmiSummary,
} from '@/src/utils/liabilitySchedule';

type ThemeColors = ReturnType<typeof themeColors>;

type Props = {
  visible: boolean;
  liabilities: Liability[];
  colors: ThemeColors;
  onClose: () => void;
  onSettle: (liabilityId: string, installmentIndex: number) => Promise<void>;
};

function statusMeta(item: LoanEmiSummary, colors: ThemeColors) {
  if (item.hasCurrentMonthEmi) {
    if (item.currentMonthPaid) {
      return { label: 'PAID', color: colors.emeraldText, bg: colors.emeraldSoft };
    }
    if (item.currentMonthOverdue) {
      return { label: 'OVERDUE', color: colors.error, bg: colors.errorContainer };
    }
    return { label: 'CURRENT MONTH DUE', color: colors.primary, bg: colors.surfaceVariant };
  }
  switch (item.status) {
    case 'overdue':
      return { label: 'OVERDUE', color: colors.error, bg: colors.errorContainer };
    case 'pending':
      return { label: 'DUE', color: colors.primary, bg: colors.surfaceVariant };
    case 'on_track':
      return { label: 'ON TRACK', color: colors.emeraldText, bg: colors.emeraldSoft };
    default:
      return { label: 'COMPLETED', color: colors.textMuted, bg: colors.surfaceVariant };
  }
}

export function EmiOverviewModal({ visible, liabilities, colors, onClose, onSettle }: Props) {
  const insets = useSafeAreaInsets();
  const [settlingId, setSettlingId] = useState<string | null>(null);

  const summaries = useMemo(() => listLoanEmiSummaries(liabilities), [liabilities]);

  const handlePay = async (item: LoanEmiSummary) => {
    const index = item.currentMonthInstallmentIndex ?? item.nextInstallmentIndex;
    if (index == null) return;
    setSettlingId(item.liabilityId);
    try {
      await onSettle(item.liabilityId, index);
    } finally {
      setSettlingId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 24),
            paddingHorizontal: 24,
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>Loans & EMIs</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Current month EMI status for bank loans and credit card plans
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {summaries.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.surfaceVariant }]}>
                <MaterialIcons name="account-balance" size={24} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 13, flex: 1 }}>
                  No loans or credit card EMIs yet. Add them in Planner.
                </Text>
              </View>
            ) : (
              summaries.map((item) => {
                const meta = statusMeta(item, colors);
                const isSettling = settlingId === item.liabilityId;
                const canPay =
                  item.hasCurrentMonthEmi &&
                  !item.currentMonthPaid &&
                  item.nextInstallmentIndex != null &&
                  item.status !== 'completed';

                return (
                  <View
                    key={item.liabilityId}
                    style={[
                      styles.itemCard,
                      {
                        borderColor: meta.color,
                        backgroundColor: item.currentMonthOverdue ? colors.errorContainer : colors.surfaceVariant,
                      },
                    ]}
                  >
                    <View style={styles.itemTop}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.titleRow}>
                          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 }} numberOfLines={2}>
                            {item.name}
                          </Text>
                          <View style={[styles.kindBadge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.kindBadgeText}>{item.kindLabel}</Text>
                          </View>
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: '600' }}>
                          {item.typeLabel}
                          {item.lender ? ` • ${item.lender}` : ''}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                          {item.paidCount}/{item.tenureMonths} EMIs paid
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: meta.color }]}>
                        <Text style={styles.statusBadgeText}>{meta.label}</Text>
                      </View>
                    </View>

                    <View style={styles.amountRow}>
                      <View>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>
                          {item.hasCurrentMonthEmi ? 'This month' : 'EMI'}
                        </Text>
                        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
                          {formatCurrency(item.hasCurrentMonthEmi ? item.currentMonthAmount : item.emiAmount)}
                        </Text>
                      </View>
                      <View>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>Remaining</Text>
                        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>
                          {formatCurrency(item.remainingAmount)}
                        </Text>
                      </View>
                    </View>

                    {item.hasCurrentMonthEmi ? (
                      <Text style={{ color: meta.color, fontSize: 12, fontWeight: '700' }}>
                        {item.currentMonthPaid && item.currentMonthPaidMillis
                          ? `Paid ${formatDate(item.currentMonthPaidMillis)}`
                          : item.currentMonthDueMillis
                            ? `Due ${formatDate(item.currentMonthDueMillis)}`
                            : ''}
                      </Text>
                    ) : item.nextDueMillis ? (
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        Next due {formatDate(item.nextDueMillis)}
                      </Text>
                    ) : null}

                    {canPay ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.payBtn,
                          { backgroundColor: colors.primary, opacity: pressed || isSettling ? 0.75 : 1 },
                        ]}
                        onPress={() => handlePay(item)}
                        disabled={isSettling}
                      >
                        {isSettling ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.payBtnText}>
                            Record EMI {formatCurrency(item.currentMonthAmount)}
                          </Text>
                        )}
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { fontSize: 18, fontWeight: '800' },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: 10, paddingBottom: 4 },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
  },
  itemCard: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  kindBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  kindBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0, maxWidth: 110 },
  statusBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  payBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  payBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
