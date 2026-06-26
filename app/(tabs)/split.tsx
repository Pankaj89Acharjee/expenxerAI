import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import { formatCurrency, formatDate } from '@/src/utils/format';
import { calculateSettlements } from '@/src/utils/settlements';
import type { SplitGroup } from '@/src/types/models';

export default function SplitScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const groups = useFinancialStore((s) => s.groups);
  const selectedGroupId = useFinancialStore((s) => s.selectedGroupId);
  const groupExpenses = useFinancialStore((s) => s.groupExpenses);
  const selectGroup = useFinancialStore((s) => s.selectGroup);
  const createGroup = useFinancialStore((s) => s.createGroup);
  const addGroupExpense = useFinancialStore((s) => s.addGroupExpense);

  const [showCreate, setShowCreate] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [membersText, setMembersText] = useState('');
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');

  const currentGroup = groups.find((g) => g.id === selectedGroupId);

  const settlements = useMemo(() => {
    if (!currentGroup) return [];
    return calculateSettlements(currentGroup.members, groupExpenses);
  }, [currentGroup, groupExpenses]);

  const handleCreate = async () => {
    const members = membersText.split(',').map((m) => m.trim()).filter(Boolean);
    if (!groupName.trim() || members.length === 0) return;
    await createGroup(groupName, members);
    setShowCreate(false);
    setGroupName('');
  };

  const handleAddExpense = async () => {
    if (!currentGroup || !expTitle.trim() || !paidBy) return;
    const amt = parseFloat(expAmount);
    if (isNaN(amt)) return;
    await addGroupExpense(currentGroup.id, expTitle, amt, paidBy);
    setShowAddExpense(false);
    setExpTitle('');
    setExpAmount('');
    setPaidBy('');
  };

  if (selectedGroupId && currentGroup) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.detailHeader}>
          <Pressable onPress={() => selectGroup(null)}>
            <Text style={{ color: colors.primary, fontSize: 18 }}>←</Text>
          </Pressable>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>{currentGroup.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{currentGroup.members.join(', ')}</Text>
          </View>
        </View>

        {settlements.length > 0 && (
          <View style={[styles.settleCard, { backgroundColor: colors.emeraldSoft, borderColor: colors.emeraldText }]}>
            <Text style={[styles.settleTitle, { color: colors.emeraldText }]}>SETTLEMENTS</Text>
            {settlements.map((s, i) => (
              <Text key={i} style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>
                {s.debtor} owes {s.creditor} {formatCurrency(s.amount)}
              </Text>
            ))}
          </View>
        )}

        <FlatList
          data={groupExpenses}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>No group expenses yet.</Text>}
          renderItem={({ item }) => (
            <View style={[styles.expenseItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.text }]}>{item.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Paid by {item.paidBy} • {formatDate(item.dateMillis)}</Text>
              </View>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{formatCurrency(item.amount)}</Text>
            </View>
          )}
        />

        <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => { setPaidBy(currentGroup.members[0] ?? ''); setShowAddExpense(true); }}>
          <Text style={{ color: '#fff', fontSize: 28 }}>+</Text>
        </Pressable>

        <Modal visible={showAddExpense} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Group Expense</Text>
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Title" placeholderTextColor={colors.textMuted} value={expTitle} onChangeText={setExpTitle} />
              <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Amount (₹)" placeholderTextColor={colors.textMuted} value={expAmount} onChangeText={setExpAmount} keyboardType="numeric" />
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Paid By</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {currentGroup.members.map((m) => (
                  <Pressable key={m} style={[styles.chip, paidBy === m && { backgroundColor: colors.primary }]} onPress={() => setPaidBy(m)}>
                    <Text style={{ color: paidBy === m ? '#fff' : colors.textMuted }}>{m}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleAddExpense}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => setShowAddExpense(false)}><Text style={{ color: colors.textMuted }}>Cancel</Text></Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.pageTitle, { color: colors.text }]}>Splitwise Shared Groups</Text>
      <FlatList
        data={groups}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>No active group hubs. Press + to create a split group.</Text>}
        renderItem={({ item }: { item: SplitGroup }) => (
          <Pressable style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => selectGroup(item.id)}>
            <Text style={{ fontSize: 28 }}>👥</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Members: {item.members.join(', ')}</Text>
            </View>
            <Text style={{ color: colors.textMuted }}>›</Text>
          </Pressable>
        )}
      />
      <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => setShowCreate(true)}>
        <Text style={{ color: '#fff', fontSize: 28 }}>+</Text>
      </Pressable>

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Shared Group Hub</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Group Name" placeholderTextColor={colors.textMuted} value={groupName} onChangeText={setGroupName} />
            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Members (comma separated)" placeholderTextColor={colors.textMuted} value={membersText} onChangeText={setMembersText} />
            <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleCreate}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Create</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setShowCreate(false)}><Text style={{ color: colors.textMuted }}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  groupCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  groupTitle: { fontSize: 18, fontWeight: '800' },
  settleCard: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 12 },
  settleTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  expenseItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  itemName: { fontWeight: '700', fontSize: 15 },
  empty: { textAlign: 'center', marginTop: 40 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#F1F5F9', marginRight: 8 },
  saveBtn: { padding: 14, borderRadius: 12, alignItems: 'center' },
  cancelBtn: { padding: 10, alignItems: 'center' },
});
