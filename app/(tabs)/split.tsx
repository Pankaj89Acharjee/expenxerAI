import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  type ListRenderItem,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import { KeyboardModalShell } from '@/src/components/KeyboardModalShell';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { buildActiveMemberFromProfile, buildGuestMember } from '@/src/services/splitGroupsCloud';
import { getFirebaseAuth } from '@/src/services/firebase';
import { Colors, themeColors } from '@/src/theme/colors';
import { formatCurrency, formatDate } from '@/src/utils/format';
import {
  SPLIT_TIME_PERIODS,
  type SplitTimePeriodKey,
  getSplitPeriodMeta,
  getSplitRangeForPeriod,
  isExpenseInRange,
  startOfDay,
} from '@/src/utils/expenseDateRange';
import {
  buildMemberBalanceCards,
  calculateSettlements,
  describeBorrowFlow,
  type MemberBalanceCard,
} from '@/src/utils/settlements';
import {
  expensePaidShareForMember,
  filterExpensesPaidByMember,
  summarizePaidByMembers,
} from '@/src/utils/splitSpendByMember';
import type { DebtFlow, GroupExpense, SplitGroup, SplitMember, UserDirectoryHit } from '@/src/types/models';
import {
  getGroupExpensePayers,
  getGroupExpenseSplitAmong,
  isGroupAdmin,
  resolveGroupAdmin,
  splitMemberDisplayNames,
} from '@/src/types/models';

type ThemeColors = ReturnType<typeof themeColors>;

const GroupExpenseRow = memo(function GroupExpenseRow({
  item,
  colors,
  memberNames,
}: {
  item: GroupExpense;
  colors: ThemeColors;
  memberNames: string[];
}) {
  const payers = getGroupExpensePayers(item).join(', ') || item.paidBy;
  const splitAmong = getGroupExpenseSplitAmong(item, memberNames);
  const forLabel =
    splitAmong.length === 0 || splitAmong.length === memberNames.length
      ? 'everyone'
      : splitAmong.join(', ');
  return (
    <View style={[styles.expenseItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemName, { color: colors.text }]}>{item.title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Paid by {payers} · for {forLabel} • {formatDate(item.dateMillis)}
        </Text>
      </View>
      <Text style={{ color: colors.primary, fontWeight: '700' }}>{formatCurrency(item.amount)}</Text>
    </View>
  );
});

const MemberBalanceCardView = memo(function MemberBalanceCardView({
  card,
  colors,
  isSelf,
}: {
  card: MemberBalanceCard;
  colors: ThemeColors;
  isSelf: boolean;
}) {
  const amountColor =
    card.status === 'to_receive'
      ? colors.emeraldText
      : card.status === 'to_pay'
        ? colors.error
        : colors.textMuted;
  const signed =
    card.status === 'settled'
      ? formatCurrency(0)
      : card.balance > 0
        ? `+${formatCurrency(card.balance)}`
        : `−${formatCurrency(Math.abs(card.balance))}`;
  return (
    <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.balanceName, { color: colors.text }]} numberOfLines={1}>
        {card.name}
        {isSelf ? ' (you)' : ''}
      </Text>
      <Text style={[styles.balanceAmount, { color: amountColor }]}>{signed}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>{card.signHint}</Text>
      <View
        style={[
          styles.balanceStatusPill,
          {
            backgroundColor:
              card.status === 'settled'
                ? colors.surfaceVariant
                : card.status === 'to_receive'
                  ? colors.emeraldSoft
                  : '#FEE2E2',
          },
        ]}
      >
        <Text
          style={{
            color:
              card.status === 'settled'
                ? colors.textMuted
                : card.status === 'to_receive'
                  ? colors.emeraldText
                  : colors.error,
            fontSize: 10,
            fontWeight: '800',
          }}
        >
          {card.statusLabel}
        </Text>
      </View>
    </View>
  );
});

const GroupListRow = memo(function GroupListRow({
  item,
  colors,
  onPress,
  currentUid,
}: {
  item: SplitGroup;
  colors: ThemeColors;
  onPress: (id: string) => void;
  currentUid: string | null;
}) {
  const names = splitMemberDisplayNames(item).join(', ');
  const admin = resolveGroupAdmin(item);
  const youAreAdmin = isGroupAdmin(item, currentUid);
  return (
    <Pressable
      style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(item.id)}
    >
      <Text style={{ fontSize: 28 }}>👥</Text>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
        {admin ? (
          <View style={styles.memberNameRow}>
            <View style={[styles.adminPill, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>
                {youAreAdmin ? 'You · Admin' : 'Admin'}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
              {admin.displayName}
            </Text>
          </View>
        ) : null}
        <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
          Members: {names}
        </Text>
      </View>
      <Text style={{ color: colors.textMuted }}>›</Text>
    </Pressable>
  );
});

export default function SplitScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const insets = useSafeAreaInsets();
  const groups = useFinancialStore((s) => s.groups);
  const selectedGroupId = useFinancialStore((s) => s.selectedGroupId);
  const groupExpenses = useFinancialStore((s) => s.groupExpenses);
  const selectGroup = useFinancialStore((s) => s.selectGroup);
  const createGroup = useFinancialStore((s) => s.createGroup);
  const addGroupExpense = useFinancialStore((s) => s.addGroupExpense);
  const searchSplitUsers = useFinancialStore((s) => s.searchSplitUsers);
  const inviteToGroupViaWhatsApp = useFinancialStore((s) => s.inviteToGroupViaWhatsApp);
  const markSplitSettlementPaid = useFinancialStore((s) => s.markSplitSettlementPaid);
  const removeSplitMember = useFinancialStore((s) => s.removeSplitMember);
  const leaveSplitGroup = useFinancialStore((s) => s.leaveSplitGroup);
  const groupSettlements = useFinancialStore((s) => s.groupSettlements);
  const profile = useFinancialStore((s) => s.userProfile);
  const currentUid = getFirebaseAuth().currentUser?.uid ?? null;

  const [showCreate, setShowCreate] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<UserDirectoryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SplitMember[]>([]);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteMemberId, setInviteMemberId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [paidById, setPaidById] = useState<string | null>(null);
  const [paidByOpen, setPaidByOpen] = useState(false);
  const [paidForIds, setPaidForIds] = useState<string[]>([]);
  const [paidForOpen, setPaidForOpen] = useState(false);
  const [timePeriod, setTimePeriod] = useState<SplitTimePeriodKey>('all');
  const [customRangeStart, setCustomRangeStart] = useState(() => startOfDay(Date.now() - 30 * 86_400_000));
  const [customRangeEnd, setCustomRangeEnd] = useState(() => startOfDay(Date.now()));
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [draftPeriod, setDraftPeriod] = useState<SplitTimePeriodKey>('all');
  const [draftCustomStart, setDraftCustomStart] = useState(customRangeStart);
  const [draftCustomEnd, setDraftCustomEnd] = useState(customRangeEnd);
  const [showCustomStartPicker, setShowCustomStartPicker] = useState(false);
  const [showCustomEndPicker, setShowCustomEndPicker] = useState(false);
  /** null = all members; otherwise filter expenses by who paid. */
  const [spendMemberFilter, setSpendMemberFilter] = useState<string | null>(null);

  const currentGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const memberNames = useMemo(
    () => (currentGroup ? splitMemberDisplayNames(currentGroup) : []),
    [currentGroup]
  );

  const selfDisplayName = useMemo(() => {
    if (!currentGroup || !currentUid) return null;
    return currentGroup.members.find((m) => m.uid === currentUid)?.displayName ?? null;
  }, [currentGroup, currentUid]);

  const activePeriod = getSplitPeriodMeta(timePeriod);
  const expenseRange = useMemo(
    () => getSplitRangeForPeriod(timePeriod, customRangeStart, customRangeEnd),
    [timePeriod, customRangeStart, customRangeEnd]
  );

  const filteredGroupExpenses = useMemo(
    () => groupExpenses.filter((e) => isExpenseInRange(e.dateMillis, expenseRange)),
    [groupExpenses, expenseRange]
  );

  const filteredRecordedSettlements = useMemo(
    () => groupSettlements.filter((s) => isExpenseInRange(s.dateMillis, expenseRange)),
    [groupSettlements, expenseRange]
  );

  const periodSpendTotal = useMemo(
    () => filteredGroupExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredGroupExpenses]
  );

  const memberPaidSummaries = useMemo(
    () => summarizePaidByMembers(filteredGroupExpenses, memberNames),
    [filteredGroupExpenses, memberNames]
  );

  const displayedGroupExpenses = useMemo(() => {
    if (!spendMemberFilter) return filteredGroupExpenses;
    return filterExpensesPaidByMember(filteredGroupExpenses, spendMemberFilter);
  }, [filteredGroupExpenses, spendMemberFilter]);

  const selectedMemberPaidTotal = useMemo(() => {
    if (!spendMemberFilter) return periodSpendTotal;
    return displayedGroupExpenses.reduce(
      (sum, e) => sum + expensePaidShareForMember(e, spendMemberFilter),
      0
    );
  }, [spendMemberFilter, displayedGroupExpenses, periodSpendTotal]);

  useEffect(() => {
    setSpendMemberFilter(null);
  }, [selectedGroupId]);

  const memberBalanceCards = useMemo(() => {
    if (!currentGroup) return [] as MemberBalanceCard[];
    return buildMemberBalanceCards(memberNames, filteredGroupExpenses, filteredRecordedSettlements);
  }, [currentGroup, memberNames, filteredGroupExpenses, filteredRecordedSettlements]);

  const settlements = useMemo(() => {
    if (!currentGroup) return [] as DebtFlow[];
    return calculateSettlements(memberNames, filteredGroupExpenses, filteredRecordedSettlements);
  }, [currentGroup, filteredGroupExpenses, memberNames, filteredRecordedSettlements]);

  const mySettlementFlows = useMemo(() => {
    if (!selfDisplayName) return settlements;
    return settlements.filter((f) => f.debtor === selfDisplayName || f.creditor === selfDisplayName);
  }, [settlements, selfDisplayName]);

  const openPeriodPicker = () => {
    setDraftPeriod(timePeriod);
    setDraftCustomStart(customRangeStart);
    setDraftCustomEnd(customRangeEnd);
    setShowPeriodPicker(true);
  };

  const applyPeriodSelection = () => {
    setTimePeriod(draftPeriod);
    if (draftPeriod === 'custom') {
      setCustomRangeStart(draftCustomStart);
      setCustomRangeEnd(draftCustomEnd);
    }
    setShowPeriodPicker(false);
    setShowCustomStartPicker(false);
    setShowCustomEndPicker(false);
  };

  const handleDraftCustomStartChange = (_event: DateTimePickerChangeEvent, date?: Date) => {
    if (!date) return;
    setDraftCustomStart(startOfDay(date.getTime()));
    if (Platform.OS === 'android') setShowCustomStartPicker(false);
  };

  const handleDraftCustomEndChange = (_event: DateTimePickerChangeEvent, date?: Date) => {
    if (!date) return;
    setDraftCustomEnd(startOfDay(date.getTime()));
    if (Platform.OS === 'android') setShowCustomEndPicker(false);
  };

  const periodButtonLabel = timePeriod === 'custom' ? expenseRange.label : activePeriod.shortLabel;

  const handleMarkPaid = useCallback(
    (flow: DebtFlow) => {
      if (!currentGroup) return;
      const isBorrower = Boolean(selfDisplayName && flow.debtor === selfDisplayName);
      const message = isBorrower
        ? `Record that you paid ${flow.creditor} ${formatCurrency(flow.amount)}? This will also add a Split expense to your Expenses and Dashboard.`
        : `Record that ${flow.debtor} paid ${flow.creditor} ${formatCurrency(flow.amount)}?`;
      Alert.alert('Settle payment?', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settle',
          onPress: () => {
            void (async () => {
              const error = await markSplitSettlementPaid(currentGroup.id, flow);
              if (error) Alert.alert('Could not settle', error);
            })();
          },
        },
      ]);
    },
    [currentGroup, markSplitSettlementPaid, selfDisplayName]
  );

  const handleRemoveMember = useCallback(
    (member: SplitMember) => {
      if (!currentGroup) return;
      Alert.alert('Remove member?', `Remove ${member.displayName} from this group?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const error = await removeSplitMember(currentGroup.id, member.id);
              if (error) Alert.alert('Could not remove', error);
            })();
          },
        },
      ]);
    },
    [currentGroup, removeSplitMember]
  );

  const handleLeaveGroup = useCallback(() => {
    if (!currentGroup) return;
    Alert.alert('Leave group?', `Leave "${currentGroup.name}"? You will lose access until invited again.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const error = await leaveSplitGroup(currentGroup.id);
            if (error) Alert.alert('Could not leave', error);
          })();
        },
      },
    ]);
  }, [currentGroup, leaveSplitGroup]);

  const expenseKeyExtractor = useCallback((item: GroupExpense) => String(item.id), []);
  const groupKeyExtractor = useCallback((item: SplitGroup) => String(item.id), []);

  const renderExpenseItem = useCallback<ListRenderItem<GroupExpense>>(
    ({ item }) => <GroupExpenseRow item={item} colors={colors} memberNames={memberNames} />,
    [colors, memberNames]
  );

  const onSelectGroup = useCallback(
    (id: string) => {
      void selectGroup(id);
    },
    [selectGroup]
  );

  const renderGroupItem = useCallback<ListRenderItem<SplitGroup>>(
    ({ item }) => <GroupListRow item={item} colors={colors} onPress={onSelectGroup} currentUid={currentUid} />,
    [colors, onSelectGroup, currentUid]
  );

  const openInviteForMember = useCallback((member?: SplitMember) => {
    if (member) {
      setInviteMemberId(member.id);
      setInviteName(member.displayName);
      setInvitePhone(member.phoneNumber ?? '');
    } else {
      setInviteName('');
      setInvitePhone('');
      setInviteMemberId(null);
    }
    setShowInvite(true);
  }, []);

  const listHeader = useMemo(() => {
    if (!currentGroup) return null;
    const canInviteOnShared = Boolean(currentGroup.createdByUid || currentGroup.createdByEmail);
    const isAdmin = isGroupAdmin(currentGroup, currentUid);
    const admin = resolveGroupAdmin(currentGroup);
    const membersSorted = [...currentGroup.members].sort((a, b) => {
      const aAdmin = a.uid === currentGroup.createdByUid || a.id === currentGroup.createdByUid ? 0 : 1;
      const bAdmin = b.uid === currentGroup.createdByUid || b.id === currentGroup.createdByUid ? 0 : 1;
      return aAdmin - bAdmin;
    });
    return (
      <View>
        <View style={[styles.periodSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settleTitle, { color: colors.textMuted }]}>PERIOD SPEND</Text>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, marginTop: 4 }}>
              {formatCurrency(periodSpendTotal)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{expenseRange.label}</Text>
          </View>
          <Pressable
            style={[styles.periodChip, { borderColor: colors.primary, backgroundColor: colors.surfaceVariant }]}
            onPress={openPeriodPicker}
          >
            <MaterialIcons name="date-range" size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>{periodButtonLabel}</Text>
          </Pressable>
        </View>

        {admin ? (
          <View style={[styles.createdByCard, { backgroundColor: colors.emeraldSoft, borderColor: colors.emeraldText }]}>
            <Text style={[styles.settleTitle, { color: colors.emeraldText }]}>CREATED BY</Text>
            <View style={[styles.memberNameRow, { marginTop: 6 }]}>
              <View style={[styles.adminPill, { backgroundColor: colors.primary }]}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>Admin</Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                {admin.displayName}
                {isAdmin ? ' (you)' : ''}
              </Text>
            </View>
            {admin.email ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{admin.email}</Text>
            ) : null}
          </View>
        ) : null}

        {memberBalanceCards.length > 0 ? (
          <View style={styles.balanceSection}>
            <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 0, marginBottom: 4 }]}>
              Balances
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>
              + Lent (to receive) · − Borrowed (to pay)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.balanceRow}>
              {memberBalanceCards.map((card) => (
                <MemberBalanceCardView
                  key={card.name}
                  card={card}
                  colors={colors}
                  isSelf={Boolean(selfDisplayName && card.name === selfDisplayName)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {canInviteOnShared ? (
          <View style={[styles.membersCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 0 }]}>Members</Text>
            {membersSorted.map((m) => {
              const isSelf = Boolean(m.uid && m.uid === currentUid);
              const isMemberAdmin = Boolean(
                (m.uid && m.uid === currentGroup.createdByUid) ||
                  m.id === currentGroup.createdByUid ||
                  (admin?.uid && m.uid === admin.uid) ||
                  (admin && m.displayName === admin.displayName && m.email === admin.email)
              );
              const canRemove = !isSelf && (m.uid ? isAdmin : true);
              return (
                <View key={m.id} style={styles.memberRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.memberNameRow}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>
                        {m.displayName}
                        {isSelf ? ' (you)' : ''}
                      </Text>
                      {isMemberAdmin ? (
                        <View style={[styles.adminPill, { backgroundColor: colors.primary }]}>
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>Admin</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {m.status === 'active' ? 'Registered' : m.status === 'invited' ? 'Invited' : 'Guest'}
                      {m.phoneNumber ? ` · ${m.phoneNumber}` : ''}
                    </Text>
                  </View>
                  <View style={styles.memberActions}>
                    {!m.uid ? (
                      <Pressable onPress={() => openInviteForMember(m)}>
                        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>WhatsApp</Text>
                      </Pressable>
                    ) : null}
                    {canRemove ? (
                      <Pressable onPress={() => handleRemoveMember(m)}>
                        <Text style={{ color: colors.error, fontWeight: '700', fontSize: 12 }}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
            <Pressable style={[styles.leaveBtn, { borderColor: colors.error }]} onPress={handleLeaveGroup}>
              <Text style={{ color: colors.error, fontWeight: '700', fontSize: 13 }}>Leave group</Text>
            </Pressable>
          </View>
        ) : null}

        {canInviteOnShared || settlements.length > 0 ? (
          <View style={[styles.settleCard, { backgroundColor: colors.emeraldSoft, borderColor: colors.emeraldText }]}>
            <Text style={[styles.settleTitle, { color: colors.emeraldText }]}>SETTLE UP</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
              Settle what you borrowed. Lender or Admin can also confirm a payment.
            </Text>
            {mySettlementFlows.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 10 }]}>Your balances</Text>
                {mySettlementFlows.map((s, i) => {
                  const isBorrower = Boolean(selfDisplayName && s.debtor === selfDisplayName);
                  const isLender = Boolean(selfDisplayName && s.creditor === selfDisplayName);
                  const canSettle = isBorrower || isLender || isAdmin;
                  return (
                    <View key={`mine-${s.debtor}-${s.creditor}-${i}`} style={styles.settleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                          {describeBorrowFlow(s, selfDisplayName)}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                          {formatCurrency(s.amount)}
                          {isBorrower ? ' · Borrowed (−)' : isLender ? ' · Lent (+)' : ''}
                        </Text>
                      </View>
                      {canSettle ? (
                        <Pressable
                          style={[styles.markPaidChip, { backgroundColor: colors.primary }]}
                          onPress={() => handleMarkPaid(s)}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>
                            {isBorrower ? 'Pay & settle' : 'Confirm'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </>
            ) : (
              <Text style={{ color: colors.text, fontSize: 13, marginTop: 8 }}>You are settled up</Text>
            )}

            {(() => {
              const otherFlows = selfDisplayName
                ? settlements.filter((s) => s.debtor !== selfDisplayName && s.creditor !== selfDisplayName)
                : [];
              if (settlements.length === 0) {
                return (
                  <Text style={{ color: colors.text, fontSize: 13, marginTop: 8 }}>All settled up</Text>
                );
              }
              if (otherFlows.length === 0) return null;
              return (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 12 }]}>Others</Text>
                  {otherFlows.map((s, i) => (
                    <View key={`other-${s.debtor}-${s.creditor}-${i}`} style={styles.settleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 13 }}>
                          {describeBorrowFlow(s, selfDisplayName)}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                          {formatCurrency(s.amount)}
                        </Text>
                      </View>
                      {isAdmin ? (
                        <Pressable
                          style={[styles.markPaidChip, { backgroundColor: colors.primary }]}
                          onPress={() => handleMarkPaid(s)}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 11 }}>Confirm</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </>
              );
            })()}
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: colors.text, marginBottom: 4 }]}>
          Paid by member
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>
          Filter expenses by who paid · totals for this period
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.memberFilterRow}
        >
          <Pressable
            style={[
              styles.memberFilterChip,
              {
                borderColor: !spendMemberFilter ? colors.primary : colors.border,
                backgroundColor: !spendMemberFilter ? colors.primary : colors.surfaceVariant,
              },
            ]}
            onPress={() => setSpendMemberFilter(null)}
          >
            <Text
              style={{
                color: !spendMemberFilter ? '#fff' : colors.text,
                fontWeight: '700',
                fontSize: 12,
              }}
            >
              All · {formatCurrency(periodSpendTotal)}
            </Text>
          </Pressable>
          {memberPaidSummaries.map((row) => {
            const selected = spendMemberFilter === row.name;
            return (
              <Pressable
                key={row.name}
                style={[
                  styles.memberFilterChip,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary : colors.surfaceVariant,
                  },
                ]}
                onPress={() => setSpendMemberFilter(selected ? null : row.name)}
              >
                <Text
                  style={{
                    color: selected ? '#fff' : colors.text,
                    fontWeight: '700',
                    fontSize: 12,
                  }}
                  numberOfLines={1}
                >
                  {row.name}
                </Text>
                <Text
                  style={{
                    color: selected ? 'rgba(255,255,255,0.85)' : colors.textMuted,
                    fontSize: 11,
                    fontWeight: '600',
                    marginTop: 2,
                  }}
                >
                  {formatCurrency(row.totalPaid)} · {row.expenseCount}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 12, marginBottom: 4 }]}>
          Expenses · {expenseRange.label}
          {spendMemberFilter ? ` · ${spendMemberFilter}` : ''}
        </Text>
        {spendMemberFilter ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
            Paid by {spendMemberFilter}: {formatCurrency(selectedMemberPaidTotal)}
          </Text>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
            Group total: {formatCurrency(periodSpendTotal)}
          </Text>
        )}
      </View>
    );
  }, [
    currentGroup,
    settlements,
    mySettlementFlows,
    memberBalanceCards,
    memberPaidSummaries,
    colors,
    openInviteForMember,
    currentUid,
    handleRemoveMember,
    handleLeaveGroup,
    handleMarkPaid,
    selfDisplayName,
    periodSpendTotal,
    selectedMemberPaidTotal,
    spendMemberFilter,
    expenseRange.label,
    periodButtonLabel,
  ]);

  useEffect(() => {
    let cancelled = false;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const hits = await searchSplitUsers(q);
        if (!cancelled) setSearchHits(hits);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, searchSplitUsers]);

  const resetCreateForm = () => {
    setGroupName('');
    setSearchQuery('');
    setSearchHits([]);
    setSelectedMembers([]);
    setGuestName('');
    setGuestPhone('');
  };

  const resetInviteForm = () => {
    setInviteName('');
    setInvitePhone('');
    setInviteMemberId(null);
  };

  const addRegisteredHit = (hit: UserDirectoryHit) => {
    setSelectedMembers((prev) => {
      if (prev.some((m) => m.uid === hit.uid)) return prev;
      return [
        ...prev,
        buildActiveMemberFromProfile({
          uid: hit.uid,
          displayName: hit.displayName,
          email: hit.email,
          phoneNumber: hit.phoneNumber,
        }),
      ];
    });
    setSearchQuery('');
    setSearchHits([]);
  };

  const addGuest = () => {
    const name = guestName.trim();
    if (!name) return;
    setSelectedMembers((prev) => {
      if (prev.some((m) => !m.uid && m.displayName.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, buildGuestMember({ displayName: name, phoneNumber: guestPhone.trim() || null })];
    });
    setGuestName('');
    setGuestPhone('');
  };

  const removeMember = (id: string) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const handleWhatsAppInvite = async () => {
    if (!currentGroup) return;
    const name = inviteName.trim();
    if (!name) {
      Alert.alert('Name required', 'Enter the person’s name for the invite.');
      return;
    }
    setInviting(true);
    const error = await inviteToGroupViaWhatsApp({
      groupId: currentGroup.id,
      displayName: name,
      phoneNumber: invitePhone.trim() || null,
      existingMemberId: inviteMemberId,
    });
    setInviting(false);
    if (error) {
      Alert.alert('Invite failed', error);
      return;
    }
    setShowInvite(false);
    resetInviteForm();
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    await createGroup(groupName.trim(), selectedMembers);
    setShowCreate(false);
    resetCreateForm();
  };

  const resetExpenseForm = () => {
    setExpTitle('');
    setExpAmount('');
    setPaidById(null);
    setPaidByOpen(false);
    setPaidForIds([]);
    setPaidForOpen(false);
  };

  const openAddExpense = () => {
    if (!currentGroup) return;
    const self =
      currentGroup.members.find((m) => m.uid && m.uid === currentUid) ??
      currentGroup.members.find(
        (m) =>
          profile?.email &&
          m.email &&
          m.email.trim().toLowerCase() === profile.email.trim().toLowerCase()
      ) ??
      currentGroup.members[0] ??
      null;
    setPaidById(self?.id ?? null);
    setPaidForIds(currentGroup.members.map((m) => m.id));
    setPaidByOpen(false);
    setPaidForOpen(false);
    setShowAddExpense(true);
  };

  const handleAddExpense = async () => {
    if (!currentGroup || !expTitle.trim() || !paidById || paidForIds.length === 0) return;
    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0) return;
    const payer = currentGroup.members.find((m) => m.id === paidById);
    if (!payer) return;
    const forNames = currentGroup.members
      .filter((m) => paidForIds.includes(m.id))
      .map((m) => m.displayName);
    if (forNames.length === 0) return;
    await addGroupExpense(currentGroup.id, expTitle.trim(), amt, [payer.displayName], forNames);
    setShowAddExpense(false);
    resetExpenseForm();
  };

  const togglePaidFor = (memberId: string) => {
    setPaidForIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  if (selectedGroupId && currentGroup) {
    const admin = resolveGroupAdmin(currentGroup);
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.detailHeader}>
          <Pressable onPress={() => selectGroup(null)}>
            <Text style={{ color: colors.primary, fontSize: 18 }}>←</Text>
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>{currentGroup.name}</Text>
            {admin ? (
              <View style={[styles.memberNameRow, { marginTop: 2 }]}>
                <View style={[styles.adminPill, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 10 }}>Admin</Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                  Created by {admin.displayName}
                </Text>
              </View>
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{memberNames.join(', ')}</Text>
            )}
          </View>
          {currentGroup.createdByUid || currentGroup.createdByEmail ? (
            <Pressable
              style={[styles.headerInviteBtn, { borderColor: colors.primary }]}
              onPress={() => openInviteForMember()}
            >
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Invite</Text>
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={displayedGroupExpenses}
          keyExtractor={expenseKeyExtractor}
          renderItem={renderExpenseItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {spendMemberFilter
                ? `No expenses paid by ${spendMemberFilter} in this period.`
                : 'No group expenses in this period.'}
            </Text>
          }
          contentContainerStyle={styles.listContent}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
        />

        <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={openAddExpense}>
          <Text style={{ color: '#fff', fontSize: 28 }}>+</Text>
        </Pressable>

        <Modal
          visible={showAddExpense}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowAddExpense(false);
            resetExpenseForm();
          }}
        >
          {showAddExpense ? (
            <KeyboardModalShell>
              <View
                style={[
                  styles.modalOverlay,
                  {
                    paddingTop: Math.max(insets.top, 16),
                    paddingBottom: Math.max(insets.bottom, 16),
                  },
                ]}
              >
                <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Add Group Expense</Text>
                  <KeyboardAwareScrollView
                    style={styles.modalScrollView}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    contentContainerStyle={styles.modalScroll}
                    bottomOffset={48}
                    extraKeyboardSpace={32}
                    mode="layout"
                    nestedScrollEnabled
                  >
                    <View style={styles.fieldBlock}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Title</Text>
                      <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                        placeholder="What was paid for?"
                        placeholderTextColor={colors.textMuted}
                        value={expTitle}
                        onChangeText={setExpTitle}
                      />
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Amount (₹)</Text>
                      <TextInput
                        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                        placeholder="0.00"
                        placeholderTextColor={colors.textMuted}
                        value={expAmount}
                        onChangeText={setExpAmount}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Paid by</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
                        Who paid the bill. Defaults to you; change if someone else paid.
                      </Text>
                      <Pressable
                        style={[
                          styles.dropdownTrigger,
                          { borderColor: colors.border, backgroundColor: colors.surfaceVariant },
                        ]}
                        onPress={() => {
                          setPaidByOpen((open) => !open);
                          setPaidForOpen(false);
                        }}
                      >
                        <Text
                          style={{
                            color: paidById ? colors.text : colors.textMuted,
                            flex: 1,
                            fontSize: 15,
                          }}
                          numberOfLines={1}
                        >
                          {paidById
                            ? currentGroup.members.find((m) => m.id === paidById)?.displayName ??
                              'Select who paid'
                            : 'Select who paid'}
                        </Text>
                        <MaterialIcons
                          name={paidByOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                          size={24}
                          color={colors.textMuted}
                        />
                      </Pressable>

                      {paidByOpen ? (
                        <View style={[styles.dropdownPanel, { borderColor: colors.border }]}>
                          {currentGroup.members.map((m, index) => {
                            const selected = paidById === m.id;
                            const isLast = index === currentGroup.members.length - 1;
                            const isSelf = Boolean(m.uid && m.uid === currentUid);
                            return (
                              <Pressable
                                key={m.id}
                                style={[
                                  styles.dropdownRow,
                                  !isLast && {
                                    borderBottomWidth: StyleSheet.hairlineWidth,
                                    borderBottomColor: colors.border,
                                  },
                                ]}
                                onPress={() => {
                                  setPaidById(m.id);
                                  setPaidByOpen(false);
                                }}
                              >
                                <MaterialIcons
                                  name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                                  size={22}
                                  color={selected ? colors.primary : colors.textMuted}
                                />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>
                                    {m.displayName}
                                    {isSelf ? ' (you)' : ''}
                                  </Text>
                                  {m.status !== 'active' ? (
                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                      {m.status}
                                    </Text>
                                  ) : null}
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Paid for</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
                        Who should share this cost. Split equally among selected people.
                      </Text>
                      <Pressable
                        style={[
                          styles.dropdownTrigger,
                          { borderColor: colors.border, backgroundColor: colors.surfaceVariant },
                        ]}
                        onPress={() => {
                          setPaidForOpen((open) => !open);
                          setPaidByOpen(false);
                        }}
                      >
                        <Text
                          style={{
                            color: paidForIds.length ? colors.text : colors.textMuted,
                            flex: 1,
                            fontSize: 15,
                          }}
                          numberOfLines={2}
                        >
                          {paidForIds.length === 0
                            ? 'Select who shares the cost'
                            : paidForIds.length === currentGroup.members.length
                              ? 'Everyone'
                              : currentGroup.members
                                  .filter((m) => paidForIds.includes(m.id))
                                  .map((m) => m.displayName)
                                  .join(', ')}
                        </Text>
                        <MaterialIcons
                          name={paidForOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                          size={24}
                          color={colors.textMuted}
                        />
                      </Pressable>

                      {paidForOpen ? (
                        <View style={[styles.dropdownPanel, { borderColor: colors.border }]}>
                          <Pressable
                            style={[
                              styles.dropdownRow,
                              {
                                borderBottomWidth: StyleSheet.hairlineWidth,
                                borderBottomColor: colors.border,
                              },
                            ]}
                            onPress={() => setPaidForIds(currentGroup.members.map((m) => m.id))}
                          >
                            <MaterialIcons
                              name={
                                paidForIds.length === currentGroup.members.length
                                  ? 'check-box'
                                  : 'check-box-outline-blank'
                              }
                              size={22}
                              color={
                                paidForIds.length === currentGroup.members.length
                                  ? colors.primary
                                  : colors.textMuted
                              }
                            />
                            <Text
                              style={{
                                color: colors.text,
                                fontWeight: '700',
                                fontSize: 15,
                                marginLeft: 12,
                              }}
                            >
                              Everyone
                            </Text>
                          </Pressable>
                          {currentGroup.members.map((m, index) => {
                            const checked = paidForIds.includes(m.id);
                            const isLast = index === currentGroup.members.length - 1;
                            return (
                              <Pressable
                                key={m.id}
                                style={[
                                  styles.dropdownRow,
                                  !isLast && {
                                    borderBottomWidth: StyleSheet.hairlineWidth,
                                    borderBottomColor: colors.border,
                                  },
                                ]}
                                onPress={() => togglePaidFor(m.id)}
                              >
                                <MaterialIcons
                                  name={checked ? 'check-box' : 'check-box-outline-blank'}
                                  size={22}
                                  color={checked ? colors.primary : colors.textMuted}
                                />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }}>
                                    {m.displayName}
                                  </Text>
                                  {m.status !== 'active' ? (
                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                      {m.status}
                                    </Text>
                                  ) : null}
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.modalActions}>
                      <Pressable
                        style={styles.cancelBtn}
                        onPress={() => {
                          setShowAddExpense(false);
                          resetExpenseForm();
                        }}
                      >
                        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.saveBtn,
                          {
                            backgroundColor:
                              expTitle.trim() && expAmount && paidById && paidForIds.length > 0
                                ? colors.primary
                                : colors.border,
                          },
                        ]}
                        onPress={handleAddExpense}
                        disabled={!expTitle.trim() || !expAmount || !paidById || paidForIds.length === 0}
                      >
                        <Text style={styles.saveBtnText}>Add</Text>
                      </Pressable>
                    </View>
                  </KeyboardAwareScrollView>
                </View>
              </View>
            </KeyboardModalShell>
          ) : null}
        </Modal>

        <Modal
          visible={showInvite}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setShowInvite(false);
            resetInviteForm();
          }}
        >
          {showInvite ? (
            <KeyboardModalShell>
              <View
                style={[
                  styles.modalOverlay,
                  {
                    paddingTop: Math.max(insets.top, 16),
                    paddingBottom: Math.max(insets.bottom, 16),
                  },
                ]}
              >
                <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Invite via WhatsApp</Text>
                  <KeyboardAwareScrollView
                    style={styles.modalScrollView}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    contentContainerStyle={styles.modalScroll}
                    bottomOffset={48}
                    extraKeyboardSpace={32}
                    mode="layout"
                    nestedScrollEnabled
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      Sends a WhatsApp message with an invite link and code. When they install and sign up with the same
                      phone, they join this group automatically.
                    </Text>
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                      placeholder="Name"
                      placeholderTextColor={colors.textMuted}
                      value={inviteName}
                      onChangeText={setInviteName}
                    />
                    <TextInput
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                      placeholder="Phone (WhatsApp number)"
                      placeholderTextColor={colors.textMuted}
                      value={invitePhone}
                      onChangeText={setInvitePhone}
                      keyboardType="phone-pad"
                    />
                    <View style={styles.modalActions}>
                      <Pressable
                        style={styles.cancelBtn}
                        onPress={() => {
                          setShowInvite(false);
                          resetInviteForm();
                        }}
                        disabled={inviting}
                      >
                        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                        onPress={handleWhatsAppInvite}
                        disabled={inviting}
                      >
                        {inviting ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.saveBtnText}>Send</Text>
                        )}
                      </Pressable>
                    </View>
                  </KeyboardAwareScrollView>
                </View>
              </View>
            </KeyboardModalShell>
          ) : null}
        </Modal>

        <Modal
          visible={showPeriodPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPeriodPicker(false)}
        >
          <Pressable style={styles.periodModalOverlay} onPress={() => setShowPeriodPicker(false)}>
            <Pressable
              style={[styles.periodModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.periodModalHeader}>
                <Text style={[styles.periodModalTitle, { color: colors.text }]}>Time Period</Text>
                <Pressable onPress={() => setShowPeriodPicker(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={[styles.periodModalSubtitle, { color: colors.textMuted }]}>
                Filter group spend, balances, and expenses
              </Text>
              <View style={styles.periodGrid}>
                {SPLIT_TIME_PERIODS.map((period) => {
                  const selected = draftPeriod === period.key;
                  return (
                    <Pressable
                      key={period.key}
                      style={[
                        styles.periodOption,
                        { borderColor: colors.border, backgroundColor: colors.surfaceVariant },
                        selected && { backgroundColor: Colors.indigo, borderColor: Colors.indigo },
                      ]}
                      onPress={() => setDraftPeriod(period.key)}
                    >
                      <Text style={[styles.periodOptionLabel, { color: selected ? '#fff' : colors.text }]}>
                        {period.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {draftPeriod === 'custom' ? (
                <View
                  style={[
                    styles.customRangeBox,
                    { borderColor: colors.border, backgroundColor: colors.surfaceVariant },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Custom range</Text>
                  <View style={styles.customRangeRow}>
                    <Pressable
                      style={[styles.customDateBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                      onPress={() => setShowCustomStartPicker(true)}
                    >
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>From</Text>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                        {formatDate(draftCustomStart)}
                      </Text>
                    </Pressable>
                    <MaterialIcons name="arrow-forward" size={18} color={colors.textMuted} />
                    <Pressable
                      style={[styles.customDateBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                      onPress={() => setShowCustomEndPicker(true)}
                    >
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>To</Text>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                        {formatDate(draftCustomEnd)}
                      </Text>
                    </Pressable>
                  </View>
                  {showCustomStartPicker ? (
                    <DateTimePicker
                      value={new Date(draftCustomStart)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onValueChange={handleDraftCustomStartChange}
                      onDismiss={() => setShowCustomStartPicker(false)}
                    />
                  ) : null}
                  {showCustomEndPicker ? (
                    <DateTimePicker
                      value={new Date(draftCustomEnd)}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onValueChange={handleDraftCustomEndChange}
                      onDismiss={() => setShowCustomEndPicker(false)}
                    />
                  ) : null}
                </View>
              ) : null}
              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary, alignSelf: 'stretch', marginTop: 12 }]}
                onPress={applyPeriodSelection}
              >
                <Text style={styles.saveBtnText}>Apply</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.pageTitle, { color: colors.text }]}>Split Groups</Text>
      <FlatList
        data={groups}
        keyExtractor={groupKeyExtractor}
        renderItem={renderGroupItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            No groups yet. Press + to create one and invite people by name, phone, or email.
          </Text>
        }
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
      <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => setShowCreate(true)}>
        <Text style={{ color: '#fff', fontSize: 28 }}>+</Text>
      </Pressable>

      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCreate(false);
          resetCreateForm();
        }}
      >
        {showCreate ? (
          <KeyboardModalShell>
            <View
              style={[
                styles.modalOverlay,
                {
                  paddingTop: Math.max(insets.top, 16),
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>New Split Group</Text>
                <KeyboardAwareScrollView
                  style={styles.modalScrollView}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="interactive"
                  contentContainerStyle={styles.modalScroll}
                  bottomOffset={48}
                  extraKeyboardSpace={32}
                  mode="layout"
                  nestedScrollEnabled
                >
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    You ({profile?.displayName ?? 'You'}) are added automatically. Search registered users or add guests.
                  </Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    placeholder="Group Name"
                    placeholderTextColor={colors.textMuted}
                    value={groupName}
                    onChangeText={setGroupName}
                  />

                  <Text style={[styles.sectionLabel, { color: colors.text }]}>Find Expenxer Users</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    placeholder="Search name, phone, or email"
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                  />
                  {searching ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 4 }} /> : null}
                  {searchHits.map((hit) => (
                    <Pressable
                      key={hit.uid}
                      style={[styles.hitRow, { borderColor: colors.border }]}
                      onPress={() => addRegisteredHit(hit)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '600' }}>{hit.displayName}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          {[hit.email, hit.phoneNumber].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>Add</Text>
                    </Pressable>
                  ))}

                  <Text style={[styles.sectionLabel, { color: colors.text }]}>Add guest (no app)</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    placeholder="Guest display name"
                    placeholderTextColor={colors.textMuted}
                    value={guestName}
                    onChangeText={setGuestName}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    placeholder="Guest phone (optional)"
                    placeholderTextColor={colors.textMuted}
                    value={guestPhone}
                    onChangeText={setGuestPhone}
                    keyboardType="phone-pad"
                  />
                  <Pressable style={[styles.guestAddBtn, { backgroundColor: colors.primary, alignSelf: 'flex-start' }]} onPress={addGuest}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Add guest</Text>
                  </Pressable>

                  {selectedMembers.length > 0 ? (
                    <View style={styles.selectedWrap}>
                      <Text style={[styles.sectionLabel, { color: colors.text }]}>Selected members</Text>
                      {selectedMembers.map((m) => (
                        <View key={m.id} style={[styles.selectedChip, { backgroundColor: colors.surfaceVariant }]}>
                          <Text style={{ color: colors.text, flex: 1 }}>
                            {m.displayName}
                            {m.status === 'guest' ? ' · guest' : ''}
                          </Text>
                          <Pressable onPress={() => removeMember(m.id)}>
                            <Text style={{ color: colors.error, fontWeight: '700' }}>Remove</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.modalActions}>
                    <Pressable
                      style={styles.cancelBtn}
                      onPress={() => {
                        setShowCreate(false);
                        resetCreateForm();
                      }}
                    >
                      <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.saveBtn,
                        {
                          backgroundColor:
                            groupName.trim() && selectedMembers.length > 0 ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={handleCreate}
                      disabled={!groupName.trim() || selectedMembers.length === 0}
                    >
                      <Text style={styles.saveBtnText}>Create</Text>
                    </Pressable>
                  </View>
                </KeyboardAwareScrollView>
              </View>
            </View>
          </KeyboardModalShell>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  headerInviteBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  membersCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  membersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  createdByCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  adminTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  adminPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leaveBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  markPaidChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  groupTitle: { fontSize: 18, fontWeight: '800' },
  settleCard: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 12 },
  settleTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  periodSummary: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  periodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  balanceSection: { marginBottom: 12 },
  balanceRow: { gap: 8, paddingRight: 8 },
  memberFilterRow: { gap: 8, paddingRight: 8, marginBottom: 4 },
  memberFilterChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 96,
  },
  balanceCard: {
    width: 128,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  balanceName: { fontSize: 13, fontWeight: '700' },
  balanceAmount: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  balanceStatusPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  periodModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  periodModalCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
  },
  periodModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  periodModalTitle: { fontSize: 18, fontWeight: '800' },
  periodModalSubtitle: { fontSize: 12, marginTop: 4, marginBottom: 12 },
  periodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  periodOption: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: '46%',
    flexGrow: 1,
  },
  periodOptionLabel: { fontWeight: '700', fontSize: 13, textAlign: 'center' },
  customRangeBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  customRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customDateBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemName: { fontWeight: '700', fontSize: 15 },
  empty: { textAlign: 'center', marginTop: 40 },
  listContent: { paddingBottom: 80, flexGrow: 1 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '100%',
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  modalScrollView: { flexGrow: 0, flexShrink: 1 },
  modalScroll: { gap: 16, paddingBottom: 48, paddingTop: 4 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8, paddingHorizontal: 2 },
  fieldBlock: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  sectionLabel: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 52,
  },
  dropdownPanel: {
    borderWidth: 1,
    borderRadius: 14,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
  },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  guestRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  guestAddBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  selectedWrap: { gap: 8 },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    paddingTop: 4,
  },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 8 },
  saveBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    minWidth: 96,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
