import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';

const SUGGESTED_PROMPTS = [
  'How can I reduce my monthly expenses?',
  'Am I on track with my savings goals?',
  'Review my subscription costs',
  'What liabilities should I prioritize?',
];

export default function AdvisorScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const aiCoachChat = useFinancialStore((s) => s.aiCoachChat);
  const isAiLoading = useFinancialStore((s) => s.isAiLoading);
  const sendChatMessage = useFinancialStore((s) => s.sendChatMessage);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (aiCoachChat.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [aiCoachChat.length, isAiLoading]);

  const handleSend = async () => {
    if (!input.trim() || isAiLoading) return;
    const msg = input.trim();
    setInput('');
    await sendChatMessage(msg);
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={[styles.headerCard, { backgroundColor: colors.surfaceVariant }]}>
        <Text style={{ fontSize: 24 }}>✨</Text>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>FutureFund Copilot AI</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Ask about savings, liability reductions, or group balances.</Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={aiCoachChat}
        keyExtractor={(_, i) => String(i)}
        style={styles.chatList}
        contentContainerStyle={{ paddingVertical: 8, gap: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.isUser ? styles.userBubble : styles.botBubble, { backgroundColor: item.isUser ? colors.primary : colors.surfaceVariant, alignSelf: item.isUser ? 'flex-end' : 'flex-start' }]}>
            <Text style={{ color: item.isUser ? '#fff' : colors.text, fontSize: 14, lineHeight: 20 }}>{item.text}</Text>
          </View>
        )}
        ListFooterComponent={isAiLoading ? (
          <View style={[styles.bubble, styles.botBubble, { backgroundColor: colors.surfaceVariant, alignSelf: 'flex-start' }]}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : null}
      />

      <View style={styles.promptRow}>
        {SUGGESTED_PROMPTS.map((p) => (
          <Pressable key={p} style={[styles.promptChip, { borderColor: colors.border }]} onPress={() => setInput(p)}>
            <Text style={{ color: colors.primary, fontSize: 11 }}>{p}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="Ask your AI advisor..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={500}
        />
        <Pressable style={[styles.sendBtn, { backgroundColor: colors.primary }]} onPress={handleSend} disabled={isAiLoading}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>→</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 8 },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  chatList: { flex: 1 },
  bubble: { maxWidth: '80%', borderRadius: 16, padding: 14 },
  userBubble: { borderBottomRightRadius: 4 },
  botBubble: { borderBottomLeftRadius: 4 },
  promptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  promptChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: 24, paddingHorizontal: 12, paddingVertical: 6 },
  input: { flex: 1, maxHeight: 100, fontSize: 15, paddingVertical: 8 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
});
