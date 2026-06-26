import { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import { currentMonthYear, formatCurrency, formatDate } from '@/src/utils/format';
import type { BudgetTemplate, Liability, Subscription } from '@/src/types/models';

type Tab = 'Liabilities' | 'Subscriptions' | 'Templates';

export default function PlannerScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const liabilities = useFinancialStore((s) => s.liabilities);
  const subscriptions = useFinancialStore((s) => s.subscriptions);
  const templates = useFinancialStore((s) => s.budgetTemplates);
  const addLiability = useFinancialStore((s) => s.addLiability);
  const toggleLiabilityPaid = useFinancialStore((s) => s.toggleLiabilityPaid);
  const deleteLiability = useFinancialStore((s) => s.deleteLiability);
  const addSubscription = useFinancialStore((s) => s.addSubscription);
  const toggleSubscriptionAlert = useFinancialStore((s) => s.toggleSubscriptionAlert);
  const deleteSubscription = useFinancialStore((s) => s.deleteSubscription);
  const addTemplate = useFinancialStore((s) => s.addTemplate);
  const deleteTemplate = useFinancialStore((s) => s.deleteTemplate);
  const applyTemplate = useFinancialStore((s) => s.applyTemplate);

  const [activeTab, setActiveTab] = useState<Tab>('Liabilities');
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState('YEARLY');
  const [category, setCategory] = useState('Insurance');
  const [dueInDays, setDueInDays] = useState('30');
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [subCategory, setSubCategory] = useState('Entertainment');
  const [templateName, setTemplateName] = useState('');
  const [templateIncome, setTemplateIncome] = useState('5000');
  const [limitFood, setLimitFood] = useState('500');
  const [limitTransport, setLimitTransport] = useState('150');
  const [limitUtilities, setLimitUtilities] = useState('300');
  const [limitShopping, setLimitShopping] = useState('250');
  const [limitEntertainment, setLimitEntertainment] = useState('200');
  const [limitOther, setLimitOther] = useState('150');
  const [templateGoalName, setTemplateGoalName] = useState('Vacation Fund');
  const [templateGoalAmount, setTemplateGoalAmount] = useState('100');
  const [applyConfirm, setApplyConfirm] = useState<BudgetTemplate | null>(null);

  const resetForm = () => { setName(''); setAmount(''); setFrequency('YEARLY'); setCategory('Insurance'); setDueInDays('30'); };

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!name.trim() || isNaN(amt)) return;
    if (activeTab === 'Liabilities') {
      await addLiability(name, amt, frequency, category, parseInt(dueInDays, 10) || 30);
    } else if (activeTab === 'Subscriptions') {
      await addSubscription(name, amt, billingCycle, subCategory);
    } else {
      const income = parseFloat(templateIncome) || 5000;
      await addTemplate(templateName || 'My Budget', income, {
        Food: parseFloat(limitFood) || 500,
        Transport: parseFloat(limitTransport) || 150,
        Utilities: parseFloat(limitUtilities) || 300,
        Shopping: parseFloat(limitShopping) || 250,
        Entertainment: parseFloat(limitEntertainment) || 200,
        Other: parseFloat(limitOther) || 150,
      }, { [templateGoalName || 'Vacation Fund']: parseFloat(templateGoalAmount) || 100 });
    }
    setShowAdd(false);
    resetForm();
  };

  const tabs: Tab[] = ['Liabilities', 'Subscriptions', 'Templates'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
        {tabs.map((tab) => (
          <Pressable key={tab} style={[styles.tab, activeTab === tab && { backgroundColor: colors.secondary }]} onPress={() => setActiveTab(tab)}>
            <Text style={{ color: activeTab === tab ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 13 }}>
              {tab === 'Liabilities' ? 'Annual Liabilities' : tab === 'Subscriptions' ? 'Subscriptions' : 'Budget Templates'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {activeTab === 'Liabilities' && (
        <FlatList
          data={liabilities}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>No liabilities tracked. Tap + to add.</Text>}
          renderItem={({ item }: { item: Liability }) => (
            <View style={[styles.listItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable style={{ flex: 1 }} onPress={() => toggleLiabilityPaid(item)}>
                <Text style={[styles.itemName, { color: colors.text, textDecorationLine: item.isPaid ? 'line-through' : 'none' }]}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.frequency} • {item.category} • Due {formatDate(item.dueDateMillis)}</Text>
              </Pressable>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{formatCurrency(item.amount)}</Text>
              <Pressable onPress={() => deleteLiability(item)}><Text style={{ color: colors.error, marginLeft: 8 }}>✕</Text></Pressable>
            </View>
          )}
        />
      )}

      {activeTab === 'Subscriptions' && (
        <FlatList
          data={subscriptions}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>No subscriptions tracked.</Text>}
          renderItem={({ item }: { item: Subscription }) => (
            <View style={[styles.listItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.billingCycle} • {item.category}</Text>
                <View style={styles.switchRow}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>Alert</Text>
                  <Switch value={item.isAlertEnabled} onValueChange={() => toggleSubscriptionAlert(item)} trackColor={{ true: colors.primary }} />
                </View>
              </View>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>{formatCurrency(item.cost)}/mo</Text>
              <Pressable onPress={() => deleteSubscription(item)}><Text style={{ color: colors.error, marginLeft: 8 }}>✕</Text></Pressable>
            </View>
          )}
        />
      )}

      {activeTab === 'Templates' && (
        <FlatList
          data={templates}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>No budget templates. Tap + to create one.</Text>}
          renderItem={({ item }: { item: BudgetTemplate }) => (
            <View style={[styles.listItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Income: {formatCurrency(item.monthlyIncome)}</Text>
              </View>
              <Pressable style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={() => setApplyConfirm(item)}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Apply</Text>
              </Pressable>
              <Pressable onPress={() => deleteTemplate(item)}><Text style={{ color: colors.error, marginLeft: 8 }}>✕</Text></Pressable>
            </View>
          )}
        />
      )}

      <Pressable style={[styles.fab, { backgroundColor: colors.primary }]} onPress={() => setShowAdd(true)}>
        <Text style={{ color: '#fff', fontSize: 28 }}>+</Text>
      </Pressable>

      <Modal visible={showAdd} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {activeTab === 'Liabilities' ? 'Add Liability' : activeTab === 'Subscriptions' ? 'Add Subscription' : 'Create Budget Template'}
            </Text>
            {activeTab === 'Templates' ? (
              <>
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Template Name" placeholderTextColor={colors.textMuted} value={templateName} onChangeText={setTemplateName} />
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Monthly Income" placeholderTextColor={colors.textMuted} value={templateIncome} onChangeText={setTemplateIncome} keyboardType="numeric" />
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Category Limits</Text>
                {([['Food', limitFood, setLimitFood], ['Transport', limitTransport, setLimitTransport], ['Utilities', limitUtilities, setLimitUtilities], ['Shopping', limitShopping, setLimitShopping], ['Entertainment', limitEntertainment, setLimitEntertainment], ['Other', limitOther, setLimitOther]] as const).map(([label, val, setter]) => (
                  <TextInput key={label} style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder={`${label} Limit`} placeholderTextColor={colors.textMuted} value={val} onChangeText={setter} keyboardType="numeric" />
                ))}
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Savings Goal Name" placeholderTextColor={colors.textMuted} value={templateGoalName} onChangeText={setTemplateGoalName} />
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Goal Monthly Amount" placeholderTextColor={colors.textMuted} value={templateGoalAmount} onChangeText={setTemplateGoalAmount} keyboardType="numeric" />
              </>
            ) : activeTab === 'Subscriptions' ? (
              <>
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Cost (₹/mo)" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="numeric" />
                <View style={styles.chipRow}>
                  {['MONTHLY', 'YEARLY'].map((c) => (
                    <Pressable key={c} style={[styles.chip, billingCycle === c && { backgroundColor: colors.primary }]} onPress={() => setBillingCycle(c)}>
                      <Text style={{ color: billingCycle === c ? '#fff' : colors.textMuted }}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.chipRow}>
                  {['Entertainment', 'Software', 'Utilities', 'Other'].map((c) => (
                    <Pressable key={c} style={[styles.chip, subCategory === c && { backgroundColor: colors.primary }]} onPress={() => setSubCategory(c)}>
                      <Text style={{ color: subCategory === c ? '#fff' : colors.textMuted, fontSize: 12 }}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <>
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Amount (₹)" placeholderTextColor={colors.textMuted} value={amount} onChangeText={setAmount} keyboardType="numeric" />
                <View style={styles.chipRow}>
                  {['YEARLY', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY'].map((f) => (
                    <Pressable key={f} style={[styles.chip, frequency === f && { backgroundColor: colors.primary }]} onPress={() => setFrequency(f)}>
                      <Text style={{ color: frequency === f ? '#fff' : colors.textMuted, fontSize: 11 }}>{f}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.chipRow}>
                  {['Insurance', 'Taxes', 'Subscriptions', 'Utilities', 'Other'].map((c) => (
                    <Pressable key={c} style={[styles.chip, category === c && { backgroundColor: colors.primary }]} onPress={() => setCategory(c)}>
                      <Text style={{ color: category === c ? '#fff' : colors.textMuted, fontSize: 12 }}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border }]} placeholder="Due in (days)" placeholderTextColor={colors.textMuted} value={dueInDays} onChangeText={setDueInDays} keyboardType="numeric" />
              </>
            )}
            <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
              <Text style={{ color: colors.textMuted }}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!applyConfirm} transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Apply Template?</Text>
            <Text style={{ color: colors.textMuted }}>Apply "{applyConfirm?.name}" to {currentMonthYear()}?</Text>
            <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={async () => { if (applyConfirm) { await applyTemplate(applyConfirm, currentMonthYear()); Alert.alert('Applied', 'Budget template applied successfully.'); } setApplyConfirm(null); }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Confirm</Text>
            </Pressable>
            <Pressable style={styles.cancelBtn} onPress={() => setApplyConfirm(null)}><Text style={{ color: colors.textMuted }}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  tabRow: { maxHeight: 48, marginBottom: 12 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  itemName: { fontWeight: '700', fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  applyBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  empty: { textAlign: 'center', marginTop: 40 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9' },
  saveBtn: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  cancelBtn: { padding: 10, alignItems: 'center' },
});
