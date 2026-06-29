import { MaterialIcons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/components/useColorScheme';
import { ChatMarkdown } from '@/src/components/advisor/ChatMarkdown';
import { useFinancialStore } from '@/src/store/useFinancialStore';
import { themeColors } from '@/src/theme/colors';
import type { ChatAttachment, ChatMessage } from '@/src/types/models';

const QUICK_PROMPTS = [
  'Analyse my expense trend this month',
  'Compare my spending vs budget',
  'What recurring items do I buy?',
  'Summarise my liabilities',
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

  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const listRef = useRef<FlatList>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (aiCoachChat.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [aiCoachChat.length, isAiLoading]);

  useEffect(() => {
    return () => {
      if (recorder.isRecording) {
        recorder.stop().catch(() => undefined);
      }
    };
  }, [recorder]);

  const handleSend = async () => {
    if ((!input.trim() && !pendingAttachments.length) || isAiLoading) return;
    const msg = input.trim();
    const attachments = [...pendingAttachments];
    setInput('');
    setPendingAttachments([]);
    await sendChatMessage(msg, attachments);
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
        <View key={att.id} style={[styles.audioChip, { backgroundColor: inBubble ? 'rgba(255,255,255,0.2)' : colors.surfaceVariant }]}>
          <MaterialIcons name="mic" size={16} color={inBubble ? '#fff' : colors.primary} />
          <Text style={{ color: inBubble ? '#fff' : colors.text, fontSize: 12, marginLeft: 6 }}>{att.name}</Text>
        </View>
      );
    }
    return (
      <View key={att.id} style={[styles.audioChip, { backgroundColor: inBubble ? 'rgba(255,255,255,0.2)' : colors.surfaceVariant }]}>
        <MaterialIcons name="attach-file" size={16} color={inBubble ? '#fff' : colors.primary} />
        <Text style={{ color: inBubble ? '#fff' : colors.text, fontSize: 12, marginLeft: 6 }} numberOfLines={1}>{att.name}</Text>
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
        },
      ]}
    >
      {item.attachments?.map((att) => renderAttachment(att, item.isUser))}
      {item.text ? (
        item.isUser ? (
          <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>{item.text}</Text>
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

  const composer = (
    <View
      style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}
      onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}
    >
      {pendingAttachments.length > 0 && (
        <ScrollView horizontal style={styles.pendingRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
          {pendingAttachments.map((att, i) => (
            <View key={`${att.uri}_${i}`} style={styles.pendingItem}>
              {isImageMime(att.mimeType) ? (
                <Image source={{ uri: att.uri }} style={styles.pendingThumb} contentFit="cover" />
              ) : (
                <View style={[styles.pendingFile, { backgroundColor: colors.surfaceVariant }]}>
                  <MaterialIcons name={isAudioMime(att.mimeType) ? 'mic' : 'attach-file'} size={20} color={colors.primary} />
                </View>
              )}
              <Pressable
                style={styles.pendingRemove}
                onPress={() => setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <MaterialIcons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {(isRecording || isTranscribing) && (
        <View style={[styles.recordingBar, { backgroundColor: colors.surfaceVariant }]}>
          <MaterialIcons name={isTranscribing ? 'hourglass-top' : 'fiber-manual-record'} size={16} color="#EF4444" />
          <Text style={{ color: colors.text, marginLeft: 8, fontSize: 13 }}>
            {isTranscribing ? 'Transcribing…' : 'Recording… tap mic to stop'}
          </Text>
        </View>
      )}

      <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable style={styles.iconBtn} onPress={showAttachMenu} disabled={isAiLoading}>
          <MaterialIcons name="attach-file" size={22} color={colors.primary} />
        </Pressable>
        <Pressable
          style={[styles.iconBtn, isRecording && { backgroundColor: '#FEE2E2', borderRadius: 8 }]}
          onPress={toggleRecording}
          disabled={isAiLoading || isTranscribing}
        >
          <MaterialIcons name="mic" size={22} color={isRecording ? '#EF4444' : colors.primary} />
        </Pressable>
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholder="Ask your AI advisor..."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onFocus={() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)}
          multiline
          maxLength={2000}
        />
        <Pressable
          style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: isAiLoading ? 0.5 : 1 }]}
          onPress={handleSend}
          disabled={isAiLoading}
        >
          <MaterialIcons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topSection}>
        <View style={[styles.headerCard, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={{ fontSize: 24 }}>✨</Text>
          <View style={{ marginLeft: 12, flex: 1 }}>
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promptScroll} contentContainerStyle={styles.promptRow}>
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
      </View>

      <FlatList
        ref={listRef}
        data={aiCoachChat}
        keyExtractor={(item) => item.id}
        style={styles.chatList}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: composerHeight + 16,
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={renderMessage}
        ListFooterComponent={
          isAiLoading ? (
            <View style={[styles.bubble, styles.botBubble, { backgroundColor: colors.surfaceVariant, alignSelf: 'flex-start' }]}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : null
        }
      />

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }} style={styles.composerWrap}>
        {composer}
      </KeyboardStickyView>

      <Modal visible={showSessions} animationType="slide" transparent onRequestClose={() => setShowSessions(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSessions(false)}>
          <Pressable style={[styles.sessionSheet, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sessionHeader}>
              <Text style={[styles.sessionTitle, { color: colors.text }]}>Chat history</Text>
              <Pressable onPress={() => setShowSessions(false)}>
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
                    <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
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
  topSection: { paddingHorizontal: 16, paddingTop: 16 },
  composerWrap: { paddingHorizontal: 16 },
  composer: { paddingTop: 8 },
  centered: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 16 },
  authText: { marginTop: 12, fontSize: 15 },
  headerCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 8 },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerBtn: { padding: 6, marginLeft: 4 },
  chatList: { flex: 1 },
  bubble: { maxWidth: '85%', borderRadius: 16, padding: 14, gap: 8 },
  userBubble: { borderBottomRightRadius: 4 },
  botBubble: { borderBottomLeftRadius: 4 },
  promptScroll: { maxHeight: 44, marginBottom: 8 },
  promptRow: { flexDirection: 'row', gap: 6, paddingRight: 8 },
  promptChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: 18, paddingHorizontal: 8, paddingVertical: 6 },
  input: { flex: 1, maxHeight: 100, fontSize: 15, paddingVertical: 8, paddingHorizontal: 4 },
  iconBtn: { padding: 8, marginBottom: 2 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 4, marginBottom: 4 },
  attachmentImage: { width: 200, height: 140, borderRadius: 10 },
  attachmentImageInBubble: { width: 180, height: 120 },
  audioChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  pendingRow: { maxHeight: 88, marginBottom: 8 },
  pendingItem: { position: 'relative' },
  pendingThumb: { width: 72, height: 72, borderRadius: 10 },
  pendingFile: { width: 72, height: 72, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
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
  recordingBar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sessionSheet: { maxHeight: '70%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ccc' },
  sessionTitle: { fontSize: 18, fontWeight: '700' },
  sessionItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14 },
});
