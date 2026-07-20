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
  getMonthlyLiabilityDetails,
  isCreditCardLoanLiability,
  isLoanLiability,
  type MonthlyLiabilityBucket,
  type MonthlyLiabilityItemDetail,
} from '@/src/utils/liabilitySchedule';
import type { PlannerTab } from '@/src/constants/plannerTabs';

type ThemeColors = ReturnType<typeof themeColors>;

type Props = {
  visible: boolean;
  month: MonthlyLiabilityBucket | null;
  liabilities: Liability[];
  colors: ThemeColors;
  onClose: () => void;
  onSettle: (liabilityId: string, installmentIndex: number) => Promise<void>;
  onManage: (liability: Liability) => void;
  onOpenInPlanner: (tab: PlannerTab) => void;
};

function statusLabel(status: MonthlyLiabilityItemDetail['status']) {
  switch (status) {
    case 'overdue':
      return 'Overdue';
    case 'pending':
      return 'Pending';
    default:
      return 'Paid';
  }
}

function statusColor(status: MonthlyLiabilityItemDetail['status'], colors: ThemeColors) {
  switch (status) {
    case 'overdue':
      return colors.error;
    case 'pending':
      return colors.primary;
    default:
      return colors.emeraldText;
  }
}

function plannerTabForLiability(liability: Liability): PlannerTab {
  if (isCreditCardLoanLiability(liability) || liability.loanType === 'CREDIT_CARD') {
    return 'CreditCards';
  }
  if (isLoanLiability(liability)) return 'Loans';
  return 'Liabilities';
}

export function LiabilityMonthDetailModal({
  visible,
  month,
  liabilities,
  colors,
  onClose,
  onSettle,
  onManage,
  onOpenInPlanner,
}: Props) {
  const insets = useSafeAreaInsets();
  const [settlingKey, setSettlingKey] = useState<string | null>(null);

  const items = useMemo(
    () => (month ? getMonthlyLiabilityDetails(liabilities, month.monthYear) : []),
    [liabilities, month]
  );

  if (!month) return null;

  const handleSettle = async (item: MonthlyLiabilityItemDetail) => {
    if (item.installmentIndex < 0 || item.status === 'done') return;
    const key = `${item.liabilityId}-${item.installmentIndex}`;
    setSettlingKey(key);
    try {
      await onSettle(item.liabilityId, item.installmentIndex);
    } finally {
      setSettlingKey(null);
    }
  };

  const findLiability = (id: string) => liabilities.find((l) => l.id === id) ?? null;

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
              <Text style={[styles.title, { color: colors.text }]}>{month.label}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                Liability breakdown for this month
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={[styles.summaryRow, { backgroundColor: colors.surfaceVariant }]}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {month.overdueCount} overdue • {month.pendingCount} pending • {month.doneCount} paid
            </Text>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginTop: 4 }}>
              {formatCurrency(month.pendingCount > 0 ? month.pendingTotal : month.doneTotal)}
            </Text>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>
                No liability items for this month.
              </Text>
            ) : (
              items.map((item) => {
                const key = `${item.liabilityId}-${item.installmentIndex}-${item.dueDateMillis}`;
                const badgeColor = statusColor(item.status, colors);
                const isSettling = settlingKey === `${item.liabilityId}-${item.installmentIndex}`;
                const liability = findLiability(item.liabilityId);
                const canSettle = item.status !== 'done' && item.installmentIndex >= 0;

                return (
                  <View
                    key={key}
                    style={[
                      styles.itemCard,
                      {
                        borderColor: item.status === 'overdue' ? colors.error : colors.border,
                        backgroundColor:
                          item.status === 'overdue'
                            ? colors.errorContainer
                            : item.status === 'done'
                              ? colors.emeraldSoft
                              : colors.surfaceVariant,
                      },
                    ]}
                  >
                    <View style={styles.itemTop}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.titleRow}>
                          <Text
                            style={{ color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 }}
                            numberOfLines={2}
                          >
                            {item.liabilityName}
                          </Text>
                          <View style={[styles.kindBadge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.kindBadgeText}>{item.kindLabel}</Text>
                          </View>
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4, fontWeight: '600' }}>
                          {item.typeLabel}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                          Due {formatDate(item.dueDateMillis)}
                        </Text>
                        {item.paymentDateMillis ? (
                          <Text style={{ color: colors.emeraldText, fontSize: 11, marginTop: 2, fontWeight: '700' }}>
                            Paid {formatDate(item.paymentDateMillis)}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: badgeColor }]}>
                        <Text style={styles.statusBadgeText}>{statusLabel(item.status)}</Text>
                      </View>
                    </View>

                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 16 }}>
                      {formatCurrency(item.amount)}
                    </Text>

                    <View style={styles.actionsRow}>
                      {canSettle ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.actionBtn,
                            styles.actionPrimary,
                            { backgroundColor: colors.primary, opacity: pressed || isSettling ? 0.75 : 1 },
                          ]}
                          onPress={() => handleSettle(item)}
                          disabled={isSettling}
                        >
                          {isSettling ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <>
                              <MaterialIcons name="check-circle" size={16} color="#fff" />
                              <Text style={styles.actionPrimaryText}>Settle</Text>
                            </>
                          )}
                        </Pressable>
                      ) : null}

                      {liability ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.actionBtn,
                            styles.actionSecondary,
                            { borderColor: colors.primary, opacity: pressed ? 0.75 : 1 },
                          ]}
                          onPress={() => {
                            onClose();
                            onManage(liability);
                          }}
                        >
                          <MaterialIcons name="calendar-month" size={16} color={colors.primary} />
                          <Text style={[styles.actionSecondaryText, { color: colors.primary }]}>Manage</Text>
                        </Pressable>
                      ) : null}

                      {liability ? (
                        <Pressable
                          style={({ pressed }) => [
                            styles.actionBtn,
                            styles.actionSecondary,
                            { borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                          ]}
                          onPress={() => {
                            onClose();
                            onOpenInPlanner(plannerTabForLiability(liability));
                          }}
                        >
                          <MaterialIcons name="open-in-new" size={16} color={colors.text} />
                          <Text style={[styles.actionSecondaryText, { color: colors.text }]}>Planner</Text>
                        </Pressable>
                      ) : null}
                    </View>
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
    maxHeight: '88%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  summaryRow: { borderRadius: 12, padding: 12, marginBottom: 12 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { gap: 10, paddingBottom: 4 },
  itemCard: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  kindBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  kindBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 36,
  },
  actionPrimary: { minWidth: 96, justifyContent: 'center' },
  actionSecondary: { borderWidth: 1, backgroundColor: 'transparent' },
  actionPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  actionSecondaryText: { fontWeight: '700', fontSize: 12 },
});
