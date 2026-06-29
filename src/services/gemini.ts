import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import type { ChatAttachment, ChatMessage } from '@/src/types/models';

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const MAX_HISTORY_TURNS = 20;

function getApiKey(): string {
  return (
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ??
    (Constants.expoConfig?.extra?.geminiApiKey as string | undefined) ??
    ''
  );
}

interface GenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

async function generateWithFallback(request: object): Promise<GenerateContentResponse> {
  const apiKey = getApiKey();
  let lastError: Error | null = null;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      return (await res.json()) as GenerateContentResponse;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error('Unknown Gemini error');
}

async function uriToBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) {
    const comma = uri.indexOf(',');
    return comma >= 0 ? uri.slice(comma + 1) : uri;
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

async function buildParts(text: string, attachments?: ChatAttachment[]): Promise<GeminiPart[]> {
  const parts: GeminiPart[] = [];
  if (text.trim()) parts.push({ text });

  if (attachments?.length) {
    for (const att of attachments) {
      if (!att.mimeType.startsWith('image/') && !att.mimeType.startsWith('audio/')) continue;
      try {
        const data = await uriToBase64(att.uri);
        parts.push({ inline_data: { mime_type: att.mimeType, data } });
      } catch {
        /* skip unreadable attachment */
      }
    }
  }
  return parts.length ? parts : [{ text: text || '(empty message)' }];
}

function historyToContents(history: ChatMessage[], excludeLastUser = false): GeminiContent[] {
  const msgs = excludeLastUser ? history.slice(0, -1) : history;
  const recent = msgs.slice(-MAX_HISTORY_TURNS);
  return recent.map((m) => ({
    role: m.isUser ? ('user' as const) : ('model' as const),
    parts: [{ text: m.text || (m.attachments?.length ? '[Attachment]' : '') }],
  }));
}

export async function getFinancialAdvice(prompt: string, systemPrompt?: string): Promise<string> {
  return getFinancialAdviceWithHistory([], prompt, systemPrompt);
}

export async function getFinancialAdviceWithHistory(
  history: ChatMessage[],
  prompt: string,
  systemPrompt?: string,
  attachments?: ChatAttachment[]
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return 'AI Coach Error: Gemini API Key is missing. Set EXPO_PUBLIC_GEMINI_API_KEY in your .env file.';
  }

  const contents: GeminiContent[] = historyToContents(history);
  const userParts = await buildParts(prompt, attachments);
  contents.push({ role: 'user', parts: userParts });

  const request: Record<string, unknown> = {
    contents,
    generationConfig: { temperature: 0.3 },
  };
  if (systemPrompt) {
    request.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  try {
    const response = await generateWithFallback(request);
    return (
      response.candidates?.[0]?.content?.parts?.[0]?.text ??
      'I apologize, but I could not formulate financial advice at this moment. Please try again.'
    );
  } catch (e) {
    return `Error generating AI advice: ${e instanceof Error ? e.message : String(e)}. Please check your connection or try again.`;
  }
}

export async function suggestCategory(
  title: string,
  amount: number,
  categories: string[]
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || !title.trim()) return 'Other';

  const categoriesStr = categories.filter((c) => c !== 'All').join(', ');
  const systemPrompt = `You are a precise transaction classification assistant.
Analyze the transaction title and amount, then classify it into exactly ONE of the following categories: ${categoriesStr}.
Respond with ONLY the exact category name. Do not include any other text, explanation, punctuation, or formatting.
If you are unsure or the transaction doesn't fit any category, respond with 'Other'.`;

  const request = {
    contents: [{ role: 'user', parts: [{ text: `Transaction: '${title}', Amount: $${amount}` }] }],
    generationConfig: { temperature: 0.1 },
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  try {
    const response = await generateWithFallback(request);
    const result = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? 'Other';
    const matched = categories.find((c) => c.toLowerCase() === result.toLowerCase());
    return matched ?? 'Other';
  } catch {
    return 'Other';
  }
}

export async function transcribeAudio(localUri: string, mimeType: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return '';

  try {
    const data = await uriToBase64(localUri);
    const request = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Transcribe this audio to plain text. Return only the transcription, nothing else.' },
            { inline_data: { mime_type: mimeType, data } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1 },
    };
    const response = await generateWithFallback(request);
    return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  } catch {
    return '';
  }
}
