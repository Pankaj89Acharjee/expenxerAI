import { MaterialIcons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  KeyboardStickyView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import { ChatMarkdown } from '@/src/components/advisor/ChatMarkdown';
import { FORM_CATEGORIES } from '@/src/constants/categories';
import {
  finishExpenseAgentAction,
  prepareExpenseAgentAction,
  type PendingExpenseAgentAction,
} from '@/src/services/expenseAgent';
import { presentExpenseLoggedNotification } from '@/src/services/pushNotifications';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import { buildTabBarStyle } from '@/src/theme/tabBar';
import type { ChatAttachment, ChatMessage } from '@/src/types/models';

const QUICK_PROMPTS = [
  'Analyse my expense trend this month',
  'Compare my spending vs budget',
  'What recurring items do I buy?',
  'Summarise my liabilities',
  'Log ₹450 spent on Swiggy today',
];

type PendingAttachment = Omit<ChatAttachment, 'id' | 'storageUrl'>;

function isImageMime(mime: string) {
  return mime.startsWith('image/');
}

function isAudioMime(mime: string) {
  return mime.startsWith('audio/');
}

export default function AdvisorScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors(colorScheme === 'dark');
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = windowWidth >= 768;
  const contentMaxWidth = isWide ? 720 : undefined;
  const isKeyboardVisible = useKeyboardState((s) => s.isVisible);

  const aiCoachChat = useFinancialStore((s) => s.aiCoachChat);
  const isAiLoading = useFinancialStore((s) => s.isAiLoading);
  const chatSessions = useFinancialStore((s) => s.chatSessions);
  const activeChatSessionId = useFinancialStore((s) => s.activeChatSessionId);
  const currentUserEmail = useFinancialStore((s) => s.currentUserEmail);
  const sendChatMessage = useFinancialStore((s) => s.sendChatMessage);
  const createNewChatSession = useFinancialStore((s) => s.createNewChatSession);
  const selectChatSession = useFinancialStore((s) => s.selectChatSession);
  const deleteChatSessionById = useFinancialStore((s) => s.deleteChatSessionById);
  const clearCurrentChat = useFinancialStore((s) => s.clearCurrentChat);
  const transcribeVoiceNote = useFinancialStore((s) => s.transcribeVoiceNote);
  const addExpense = useFinancialStore((s) => s.addExpense);

  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [composerHeight, setComposerHeight] = useState(72);
  const [inputFocused, setInputFocused] = useState(false);
  const [pendingAgentAction, setPendingAgentAction] = useState<PendingExpenseAgentAction | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftCategory, setDraftCategory] = useState('Other');
  const [draftNotes, setDraftNotes] = useState('');
  const [isConfirmingExpense, setIsConfirmingExpense] = useState(false);
  const listRef = useRef<FlatList>(null);
  const confirmingExpenseRef = useRef(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const tabBarStyle = useMemo(
    () => buildTabBarStyle(colors, insets.bottom, { hidden: isKeyboardVisible }),
    [colors, insets.bottom, isKeyboardVisible]
  );

  // Keep tab bar chrome in sync while typing (hidden) / not typing (safe-area aware).
  useEffect(() => {
    navigation.setOptions({ tabBarStyle });
    return () => {
      navigation.setOptions({ tabBarStyle: buildTabBarStyle(colors, insets.bottom) });
    };
  }, [isKeyboardVisible, navigation, tabBarStyle, colors, insets.bottom]);

  useEffect(() => {
    if (aiCoachChat.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [aiCoachChat.length, isAiLoading, isKeyboardVisible]);

  useEffect(() => {
    return () => {
      if (recorder.isRecording) {
        recorder.stop().catch(() => undefined);
      }
    };
  }, [recorder]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const handleSend = async () => {
    if ((!input.trim() && !pendingAttachments.length) || isAiLoading) return;
    const msg = input.trim();
    const attachments = [...pendingAttachments];
    setInput('');
    setPendingAttachments([]);
    const looksLikeExpense =
      !attachments.length &&
      (/(?:spent|paid|bought|expense|log|add|₹|\brs\.?\b)/i.test(msg) || /^\D{2,40}\s+\d+(?:\.\d+)?\s*$/.test(msg));
    if (looksLikeExpense) {
      try {
        const action = await prepareExpenseAgentAction(msg);
        if (action) {
          setPendingAgentAction(action);
          setDraftTitle(action.draft.title);
          setDraftAmount(action.draft.amount?.toString() ?? '');
          setDraftCategory(action.draft.category);
          setDraftNotes(action.draft.notes);
          return;
        }
      } catch {
        // Fall through to the normal Advisor when agent parsing is unavailable.
      }
    }
    await sendChatMessage(msg, attachments);
  };

  const cancelExpenseDraft = async () => {
    const action = pendingAgentAction;
    setPendingAgentAction(null);
    if (action) {
      await finishExpenseAgentAction(action.runId, 'cancelled', action.draft).catch(() => undefined);
    }
  };

  const confirmExpenseDraft = async () => {
    const action = pendingAgentAction;
    if (!action || confirmingExpenseRef.current) return;
    const amount = Number(draftAmount);
    if (!draftTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Check expense', 'Enter a title and a positive amount.');
      return;
    }
    const finalDraft = {
      ...action.draft,
      title: draftTitle.trim(),
      amount,
      category: draftCategory,
      notes: draftNotes.trim(),
      missingFields: [],
    };
    confirmingExpenseRef.current = true;
    setIsConfirmingExpense(true);
    const error = await addExpense(
      finalDraft.title,
      amount,
      finalDraft.category,
      finalDraft.notes || 'Logged by Expense Agent',
      finalDraft.dateMillis
    );
    if (error) {
      await finishExpenseAgentAction(action.runId, 'failed', finalDraft, error).catch(() => undefined);
      confirmingExpenseRef.current = false;
      setIsConfirmingExpense(false);
      Alert.alert('Save failed', error);
      return;
    }
    await finishExpenseAgentAction(action.runId, 'confirmed', finalDraft).catch(() => undefined);
    await presentExpenseLoggedNotification(finalDraft.title, amount, finalDraft.category).catch(() => undefined);
    confirmingExpenseRef.current = false;
    setIsConfirmingExpense(false);
    setPendingAgentAction(null);
    Alert.alert('Expense logged', `₹${amount.toLocaleString('en-IN')} for ${finalDraft.title} was saved.`);
  };

  const pickImage = async (useCamera: boolean) => {
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow camera access to attach photos.');
        return;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow gallery access to attach photos.');
        return;
      }
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPendingAttachments((prev) => [
      ...prev,
      {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
      },
    ]);
  };

  const showAttachMenu = () => {
    Alert.alert('Attach', 'Choose a source', [
      { text: 'Camera', onPress: () => pickImage(true) },
      { text: 'Gallery', onPress: () => pickImage(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      try {
        setIsRecording(false);
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) return;

        setIsTranscribing(true);
        const mimeType = 'audio/mp4';
        const text = await transcribeVoiceNote(uri, mimeType);
        setIsTranscribing(false);

        if (text) {
          setInput((prev) => (prev ? `${prev} ${text}` : text));
        } else {
          setPendingAttachments((prev) => [
            ...prev,
            { uri, mimeType, name: `voice_${Date.now()}.m4a` },
          ]);
        }
      } catch {
        setIsRecording(false);
        setIsTranscribing(false);
        Alert.alert('Recording failed', 'Could not process voice note.');
      }
      return;
    }

    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow microphone access for voice input.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
    } catch {
      Alert.alert('Recording failed', 'Could not start microphone.');
    }
  };

  const confirmDeleteSession = (sessionId: string, title: string) => {
    Alert.alert('Delete chat', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteChatSessionById(sessionId) },
    ]);
  };

  const confirmClearChat = () => {
    Alert.alert('Clear chat', 'Remove all messages in this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clearCurrentChat() },
    ]);
  };

  const canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !isAiLoading;

  const renderAttachment = (att: ChatAttachment, inBubble: boolean) => {
    const uri = att.storageUrl ?? att.uri;
    if (isImageMime(att.mimeType)) {
      return (
        <Image
          key={att.id}
          source={{ uri }}
          style={[styles.attachmentImage, inBubble && styles.attachmentImageInBubble]}
          contentFit="cover"
        />
      );
    }
    if (isAudioMime(att.mimeType)) {
      return (
        <View
          key={att.id}
          style={[styles.audioChip, { backgroundColor: inBubble ? 'rgba(255,255,255,0.2)' : colors.surfaceVariant }]}
        >
          <MaterialIcons name="mic" size={16} color={inBubble ? '#fff' : colors.primary} />
          <Text style={{ color: inBubble ? '#fff' : colors.text, fontSize: 12, marginLeft: 6 }}>{att.name}</Text>
        </View>
      );
    }
    return (
      <View
        key={att.id}
        style={[styles.audioChip, { backgroundColor: inBubble ? 'rgba(255,255,255,0.2)' : colors.surfaceVariant }]}
      >
        <MaterialIcons name="attach-file" size={16} color={inBubble ? '#fff' : colors.primary} />
        <Text style={{ color: inBubble ? '#fff' : colors.text, fontSize: 12, marginLeft: 6 }} numberOfLines={1}>
          {att.name}
        </Text>
      </View>
    );
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View
      style={[
        styles.bubble,
        item.isUser ? styles.userBubble : styles.botBubble,
        {
          backgroundColor: item.isUser ? colors.primary : colors.surfaceVariant,
          alignSelf: item.isUser ? 'flex-end' : 'flex-start',
          maxWidth: isWide ? '72%' : '88%',
        },
      ]}
    >
      {item.attachments?.map((att) => renderAttachment(att, item.isUser))}
      {item.text ? (
        item.isUser ? (
          <Text style={{ color: '#fff', fontSize: 15, lineHeight: 22 }}>{item.text}</Text>
        ) : (
          <ChatMarkdown
            text={item.text}
            textColor={colors.text}
            mutedColor={colors.textMuted}
            accentColor={colors.primary}
            codeBackground={colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
          />
        )
      ) : null}
    </View>
  );

  if (!currentUserEmail) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <MaterialIcons name="lock" size={40} color={colors.textMuted} />
        <Text style={[styles.authText, { color: colors.textMuted }]}>Sign in to use the AI Advisor</Text>
      </View>
    );
  }

  const composerBottomPad = isKeyboardVisible
    ? Platform.OS === 'ios'
      ? 6
      : 4
    : Math.max(insets.bottom > 0 && Platform.OS === 'ios' ? 4 : 8, 8);

  const composer = (
    <View
      style={[
        styles.composerShell,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: composerBottomPad,
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
          width: '100%',
        },
      ]}
      onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}
    >
      {pendingAttachments.length > 0 && (
        <ScrollView
          horizontal
          style={styles.pendingRow}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
          showsHorizontalScrollIndicator={false}
        >
          {pendingAttachments.map((att, i) => (
            <View key={`${att.uri}_${i}`} style={styles.pendingItem}>
              {isImageMime(att.mimeType) ? (
                <Image source={{ uri: att.uri }} style={styles.pendingThumb} contentFit="cover" />
              ) : (
                <View style={[styles.pendingFile, { backgroundColor: colors.surfaceVariant }]}>
                  <MaterialIcons
                    name={isAudioMime(att.mimeType) ? 'mic' : 'attach-file'}
                    size={20}
                    color={colors.primary}
                  />
                </View>
              )}
              <Pressable
                style={styles.pendingRemove}
                onPress={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                hitSlop={8}
              >
                <MaterialIcons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {(isRecording || isTranscribing) && (
        <View style={[styles.recordingBar, { backgroundColor: colors.surfaceVariant }]}>
          <MaterialIcons
            name={isTranscribing ? 'hourglass-top' : 'fiber-manual-record'}
            size={16}
            color="#EF4444"
          />
          <Text style={{ color: colors.text, marginLeft: 8, fontSize: 13, flex: 1 }}>
            {isTranscribing ? 'Transcribing…' : 'Recording… tap mic to stop'}
          </Text>
        </View>
      )}

      <View
        style={[
          styles.inputRow,
          {
            borderColor: inputFocused ? colors.primary : colors.border,
            backgroundColor: colors.card,
            shadowColor: colorScheme === 'dark' ? '#000' : colors.primary,
          },
          inputFocused && styles.inputRowFocused,
        ]}
      >
        <Pressable
          style={styles.iconBtn}
          onPress={showAttachMenu}
          disabled={isAiLoading}
          hitSlop={6}
          accessibilityLabel="Attach file"
        >
          <MaterialIcons name="add-circle-outline" size={24} color={colors.primary} />
        </Pressable>

        <TextInput
          style={[styles.input, { color: colors.text, minHeight: isWide ? 44 : 40 }]}
          placeholder="Ask your AI advisor…"
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onFocus={() => {
            setInputFocused(true);
            setTimeout(scrollToEnd, 80);
          }}
          onBlur={() => setInputFocused(false)}
          multiline
          maxLength={2000}
          textAlignVertical="center"
          underlineColorAndroid="transparent"
        />

        <Pressable
          style={[styles.iconBtn, isRecording && styles.micActive]}
          onPress={toggleRecording}
          disabled={isAiLoading || isTranscribing}
          hitSlop={6}
          accessibilityLabel={isRecording ? 'Stop recording' : 'Record voice'}
        >
          <MaterialIcons name={isRecording ? 'stop-circle' : 'mic'} size={24} color={isRecording ? '#EF4444' : colors.primary} />
        </Pressable>

        <Pressable
          style={[
            styles.sendBtn,
            {
              backgroundColor: canSend ? colors.primary : colors.surfaceVariant,
              opacity: isAiLoading ? 0.55 : 1,
            },
          ]}
          onPress={handleSend}
          disabled={!canSend}
          accessibilityLabel="Send message"
        >
          {isAiLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <MaterialIcons name="arrow-upward" size={20} color={canSend ? '#fff' : colors.textMuted} />
          )}
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topSection, contentMaxWidth ? { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' } : null]}>
        <View style={[styles.headerCard, { backgroundColor: colors.surfaceVariant }]}>
          <View style={[styles.headerAvatar, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="auto-awesome" size={18} color="#fff" />
          </View>
          <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Expenxer Assistant</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
              {chatSessions.find((s) => s.id === activeChatSessionId)?.title ?? 'Financial coach with full context'}
            </Text>
          </View>
          <Pressable onPress={() => setShowSessions(true)} style={styles.headerBtn} accessibilityLabel="Chat history">
            <MaterialIcons name="history" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => createNewChatSession()} style={styles.headerBtn} accessibilityLabel="New chat">
            <MaterialIcons name="add-comment" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={confirmClearChat} style={styles.headerBtn} accessibilityLabel="Clear chat">
            <MaterialIcons name="delete-outline" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        {!isKeyboardVisible ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.promptScroll}
            contentContainerStyle={styles.promptRow}
          >
            {QUICK_PROMPTS.map((p) => (
              <Pressable
                key={p}
                style={[styles.promptChip, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={() => setInput(p)}
                disabled={isAiLoading}
              >
                <Text style={{ color: colors.text, fontSize: 12 }}>{p}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={aiCoachChat}
        keyExtractor={(item) => item.id}
        style={styles.chatList}
        contentContainerStyle={{
          paddingHorizontal: isWide ? 24 : 16,
          paddingTop: 8,
          paddingBottom: composerHeight + 12,
          gap: 12,
          maxWidth: contentMaxWidth,
          width: '100%',
          alignSelf: 'center',
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={renderMessage}
        ListFooterComponent={
          isAiLoading ? (
            <View
              style={[
                styles.bubble,
                styles.botBubble,
                { backgroundColor: colors.surfaceVariant, alignSelf: 'flex-start' },
              ]}
            >
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : null
        }
      />

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={styles.composerWrap}>
        {composer}
      </KeyboardStickyView>

      <Modal
        visible={pendingAgentAction != null}
        animationType="fade"
        transparent
        onRequestClose={cancelExpenseDraft}
      >
        <View style={styles.expenseModalOverlay}>
          <View style={[styles.expenseDraftSheet, { backgroundColor: colors.card }]}>
            <View style={styles.sessionHeader}>
              <View>
                <Text style={[styles.sessionTitle, { color: colors.text }]}>Confirm expense</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
                  Review the AI draft before it is saved
                </Text>
              </View>
              <Pressable onPress={cancelExpenseDraft} hitSlop={12}>
                <MaterialIcons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Title</Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="What was the expense?"
              placeholderTextColor={colors.textMuted}
              style={[styles.draftInput, { color: colors.text, borderColor: colors.border }]}
            />
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Amount (₹)</Text>
            <TextInput
              value={draftAmount}
              onChangeText={setDraftAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={[styles.draftInput, { color: colors.text, borderColor: colors.border }]}
            />
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {FORM_CATEGORIES.map((category) => (
                <Pressable
                  key={category}
                  onPress={() => setDraftCategory(category)}
                  style={[
                    styles.categoryChip,
                    {
                      borderColor: draftCategory === category ? colors.primary : colors.border,
                      backgroundColor: draftCategory === category ? colors.primary : colors.card,
                    },
                  ]}
                >
                  <Text style={{ color: draftCategory === category ? '#fff' : colors.text, fontSize: 12 }}>
                    {category}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Notes</Text>
            <TextInput
              value={draftNotes}
              onChangeText={setDraftNotes}
              placeholder="Optional notes"
              placeholderTextColor={colors.textMuted}
              style={[styles.draftInput, styles.notesInput, { color: colors.text, borderColor: colors.border }]}
              multiline
            />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 10 }}>
              Date: {pendingAgentAction ? new Date(pendingAgentAction.draft.dateMillis).toLocaleString('en-IN') : ''}
            </Text>
            <View style={styles.draftActions}>
              <Pressable style={[styles.draftButton, { borderColor: colors.border }]} onPress={cancelExpenseDraft}>
                <Text style={{ color: colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.draftButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={confirmExpenseDraft}
                disabled={isConfirmingExpense}
              >
                {isConfirmingExpense ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Confirm & save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSessions} animationType="slide" transparent onRequestClose={() => setShowSessions(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSessions(false)}>
          <Pressable
            style={[
              styles.sessionSheet,
              {
                backgroundColor: colors.card,
                paddingBottom: Math.max(insets.bottom, 16),
                maxWidth: contentMaxWidth ?? 560,
                width: '100%',
                alignSelf: 'center',
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sessionHeader}>
              <Text style={[styles.sessionTitle, { color: colors.text }]}>Chat history</Text>
              <Pressable onPress={() => setShowSessions(false)} hitSlop={12}>
                <MaterialIcons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            <FlatList
              data={chatSessions}
              keyExtractor={(s) => s.id}
              ListEmptyComponent={<Text style={{ color: colors.textMuted, padding: 16 }}>No chats yet</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.sessionItem,
                    {
                      backgroundColor: item.id === activeChatSessionId ? colors.surfaceVariant : 'transparent',
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => {
                    selectChatSession(item.id);
                    setShowSessions(false);
                  }}
                  onLongPress={() => confirmDeleteSession(item.id, item.title)}
                >
                  <MaterialIcons name="chat-bubble-outline" size={20} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {new Date(item.lastMessageAtMillis).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <Pressable onPress={() => confirmDeleteSession(item.id, item.title)} hitSlop={8}>
                    <MaterialIcons name="delete-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                </Pressable>
              )}
            />
            <Pressable
              style={[styles.newChatBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                createNewChatSession();
                setShowSessions(false);
              }}
            >
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>New chat</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1, padding: 16 },
  topSection: { paddingHorizontal: 16, paddingTop: 12 },
  composerWrap: {
    width: '100%',
  },
  composerShell: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  centered: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 16 },
  authText: { marginTop: 12, fontSize: 15 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerBtn: { padding: 6, marginLeft: 2 },
  chatList: { flex: 1 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  userBubble: { borderBottomRightRadius: 6 },
  botBubble: { borderBottomLeftRadius: 6 },
  expenseModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  expenseDraftSheet: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    alignSelf: 'center',
    padding: 20,
    borderRadius: 20,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  draftInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15 },
  notesInput: { minHeight: 68, textAlignVertical: 'top' },
  categoryRow: { gap: 8, paddingVertical: 2 },
  categoryChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  draftActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  draftButton: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  promptScroll: { maxHeight: 44, marginBottom: 4 },
  promptRow: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  promptChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1.5,
    borderRadius: 28,
    paddingLeft: 4,
    paddingRight: 6,
    paddingVertical: 4,
    minHeight: 52,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  inputRowFocused: {
    ...Platform.select({
      ios: { shadowOpacity: 0.14, shadowRadius: 14 },
      android: { elevation: 5 },
      default: {},
    }),
  },
  input: {
    flex: 1,
    maxHeight: 120,
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  micActive: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    marginLeft: 2,
  },
  attachmentImage: { width: 200, height: 140, borderRadius: 10 },
  attachmentImageInBubble: { width: 180, height: 120 },
  audioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pendingRow: { maxHeight: 88, marginBottom: 8 },
  pendingItem: { position: 'relative' },
  pendingThumb: { width: 72, height: 72, borderRadius: 10 },
  pendingFile: {
    width: 72,
    height: 72,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sessionSheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  sessionTitle: { fontSize: 18, fontWeight: '700' },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
  },
});
