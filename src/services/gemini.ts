import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import type { ChatAttachment, ChatMessage } from '@/src/types/models';
import type { ExpenseAgentDraft, ReceiptScanFinding } from '@/src/types/models';
import { FORM_CATEGORIES } from '@/src/constants/categories';

const GEMINI_MODELS = ['gemini-3.6-flash'];
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

function extractJsonObject(text: string): Record<string, unknown> | null {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function localDateTimeContext(timestamp: number): string {
  const date = new Date(timestamp);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60).toString().padStart(2, '0');
  const offsetRemainder = (Math.abs(offsetMinutes) % 60).toString().padStart(2, '0');
  const localDateTime = [
    date.getFullYear(),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getDate().toString().padStart(2, '0'),
  ].join('-') + ` ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  return `${localDateTime} UTC${sign}${offsetHours}:${offsetRemainder}`;
}

function resolveDeviceLocalRelativeDate(input: string, nowMillis: number): number | null {
  const normalized = input.toLowerCase();
  if (/\b(today|this morning|this afternoon|this evening|tonight)\b/.test(normalized)) {
    return nowMillis;
  }
  if (/\b(yesterday|last night)\b/.test(normalized)) {
    const localYesterday = new Date(nowMillis);
    localYesterday.setDate(localYesterday.getDate() - 1);
    return localYesterday.getTime();
  }
  const hasExplicitDate =
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|ago)\b/.test(normalized)
    || /\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(normalized);
  if (!hasExplicitDate) return nowMillis;
  return null;
}

/** Parse an explicit expense-logging command into a validated, non-writing draft. */
export async function parseExpenseAgentDraft(
  input: string,
  nowMillis = Date.now()
): Promise<ExpenseAgentDraft | null> {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || !input.trim()) return null;

  const categories = FORM_CATEGORIES.join(', ');
  const deviceLocalNow = localDateTimeContext(nowMillis);
  const request = {
    contents: [{ role: 'user', parts: [{ text: input.trim() }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    systemInstruction: {
      parts: [{
        text: `You detect explicit requests to record a personal expense and extract a draft. The device's current local date and time is ${deviceLocalNow}.
Return exactly one JSON object. If the user is not asking to record/log/add an expense, return {"action":"none"}.
For an expense return: action="create_expense", title, merchant (string or null), amount (positive number or null), currency="INR", category, dateMillis, notes, confidence (0..1), missingFields.
Allowed categories: ${categories}.
Resolve today/yesterday/last night relative to the current time. Do not invent an amount. Use Other when uncertain. missingFields may only contain amount, title, date.`,
      }],
    },
  };

  try {
    const response = await generateWithFallback(request);
    const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const raw = extractJsonObject(rawText);
    if (!raw || raw.action !== 'create_expense') return null;

    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 120) : '';
    const amount = typeof raw.amount === 'number' && Number.isFinite(raw.amount) && raw.amount > 0
      ? raw.amount
      : null;
    const categoryCandidate = typeof raw.category === 'string' ? raw.category : 'Other';
    const category = FORM_CATEGORIES.find(
      (item) => item.toLowerCase() === categoryCandidate.toLowerCase()
    ) ?? 'Other';
    const deviceRelativeDate = resolveDeviceLocalRelativeDate(input, nowMillis);
    const parsedDate = deviceRelativeDate ?? (typeof raw.dateMillis === 'number' && Number.isFinite(raw.dateMillis)
      ? raw.dateMillis
      : null);
    const dateIsPlausible = parsedDate != null
      && parsedDate >= Date.UTC(2000, 0, 1)
      && parsedDate <= nowMillis + 86_400_000;
    const dateMillis = dateIsPlausible ? parsedDate : nowMillis;
    const allowedMissing = new Set(['amount', 'title', 'date']);
    const missingFields = Array.isArray(raw.missingFields)
      ? raw.missingFields.filter(
          (field): field is 'amount' | 'title' | 'date' =>
            typeof field === 'string' && allowedMissing.has(field)
        )
      : [];
    if (!title && !missingFields.includes('title')) missingFields.push('title');
    if (amount == null && !missingFields.includes('amount')) missingFields.push('amount');
    if (!dateIsPlausible && !missingFields.includes('date')) missingFields.push('date');

    return {
      action: 'create_expense',
      title,
      merchant: typeof raw.merchant === 'string' ? raw.merchant.trim().slice(0, 120) : null,
      amount,
      currency: 'INR',
      category,
      dateMillis,
      notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 500) : '',
      confidence: typeof raw.confidence === 'number'
        ? Math.max(0, Math.min(1, raw.confidence))
        : 0,
      missingFields,
    };
  } catch {
    return null;
  }
}

export type ReminderPlanningInput = {
  key: string;
  name: string;
  kind: 'bill' | 'emi' | 'liability';
  amount: number;
  daysUntilDue: number;
  status: 'upcoming' | 'due_soon' | 'overdue';
  availableSurplus: number;
  canPayFromSurplus: boolean;
};

export type ReminderPlan = {
  key: string;
  action: 'notify' | 'schedule' | 'defer';
  recommendPayFromSurplus: boolean;
  message: string;
  reasoning: string;
};

/** LLM planning node for the LangGraph reminder agent. Financial facts remain tool-owned. */
export async function planBillReminderActions(
  reminders: readonly ReminderPlanningInput[]
): Promise<ReminderPlan[]> {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || reminders.length === 0) return [];
  const request = {
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(reminders) }] }],
    generationConfig: { temperature: 0.15, responseMimeType: 'application/json' },
    systemInstruction: {
      parts: [{
        text: `You are the planning node of a personal-finance reminder agent.
For every supplied reminder return one item in a JSON array with: key, action, recommendPayFromSurplus, message, reasoning.
Actions: overdue or due_soon => notify; upcoming => schedule; use defer only when the input is genuinely not actionable.
Never change or invent amounts, dates, names, status, or surplus. recommendPayFromSurplus MUST be false when canPayFromSurplus is false.
Messages must be concise, professional, use INR symbol ₹, mention timing, and give one concrete next action. Reasoning must be one short auditable sentence.`,
      }],
    },
  };
  try {
    const response = await generateWithFallback(request);
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) return [];
    const raw = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((row): ReminderPlan[] => {
      if (!row || typeof row !== 'object') return [];
      const value = row as Record<string, unknown>;
      if (typeof value.key !== 'string' || typeof value.message !== 'string') return [];
      const action = value.action === 'notify' || value.action === 'schedule' || value.action === 'defer'
        ? value.action
        : 'defer';
      return [{
        key: value.key,
        action,
        recommendPayFromSurplus: value.recommendPayFromSurplus === true,
        message: value.message.trim().slice(0, 500),
        reasoning: typeof value.reasoning === 'string'
          ? value.reasoning.trim().slice(0, 300)
          : 'No model reasoning supplied.',
      }];
    });
  } catch {
    return [];
  }
}

export async function scanReceiptImage(
  localUri: string,
  mimeType: string,
  deviceLocalNow = localDateTimeContext(Date.now())
): Promise<ReceiptScanFinding> {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') throw new Error('Gemini API key is missing.');
  const data = await uriToBase64(localUri);
  const request = {
    contents: [{
      role: 'user',
      parts: [
        { text: `Extract this receipt. Device local time: ${deviceLocalNow}.` },
        { inline_data: { mime_type: mimeType, data } },
      ],
    }],
    generationConfig: { temperature: 0.05, responseMimeType: 'application/json' },
    systemInstruction: {
      parts: [{ text: `You are a receipt scanning agent. Read every purchased line item and return exactly one JSON object with merchant, totalAmount, receiptDate, currency, suggestedCategory, invoiceNumber, confidence, warnings, lineItems, expenseGroups.
receiptDate must be YYYY-MM-DD or null. currency must be INR. totalAmount must be the final amount paid, not subtotal, tax, discount, or cash tendered.
lineItems is an array of {name, quantity, amount, category}. amount is that line's final extended cost, not unit price. Exclude subtotal, tax, discount, tender and change lines.
expenseGroups groups purchased lineItems by category and is an array of {title, amount, category, itemNames}. Create a concise human-readable title describing what was bought, such as "Groceries - Milk, Rice & Vegetables" or "Stationery - Pens & Notebook". Never use only the merchant as a title. Return one group per category; its amount is the sum of its line items. If no line items are legible, return one fallback group whose descriptive title uses the merchant and receipt context.
Allowed categories: ${FORM_CATEGORIES.join(', ')}. Use Other when uncertain. Never invent unreadable values. confidence is 0..1 and warnings is an array of concise strings. Group amounts should reconcile with the receipt total; mention any mismatch in warnings.` }],
    },
  };
  const response = await generateWithFallback(request);
  const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const raw = extractJsonObject(rawText);
  if (!raw) throw new Error('The receipt could not be read.');
  const categoryCandidate = typeof raw.suggestedCategory === 'string' ? raw.suggestedCategory : 'Other';
  const suggestedCategory = FORM_CATEGORIES.find(
    (item) => item.toLowerCase() === categoryCandidate.toLowerCase()
  ) ?? 'Other';
  const normalizeCategory = (value: unknown) => {
    const candidate = typeof value === 'string' ? value : 'Other';
    return FORM_CATEGORIES.find((item) => item.toLowerCase() === candidate.toLowerCase()) ?? 'Other';
  };
  const lineItems = Array.isArray(raw.lineItems) ? raw.lineItems.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 100) : '';
    const amount = typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount > 0 ? item.amount : 0;
    if (!name || !amount) return [];
    return [{
      name,
      quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null,
      amount,
      category: normalizeCategory(item.category),
    }];
  }).slice(0, 100) : [];
  const expenseGroups = Array.isArray(raw.expenseGroups) ? raw.expenseGroups.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const group = entry as Record<string, unknown>;
    const title = typeof group.title === 'string' ? group.title.trim().slice(0, 120) : '';
    const amount = typeof group.amount === 'number' && Number.isFinite(group.amount) && group.amount > 0 ? group.amount : 0;
    if (!title || !amount) return [];
    return [{
      title,
      amount,
      category: normalizeCategory(group.category),
      itemNames: Array.isArray(group.itemNames)
        ? group.itemNames.filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim().slice(0, 100)).slice(0, 30)
        : [],
    }];
  }).slice(0, FORM_CATEGORIES.length) : [];
  return {
    merchant: typeof raw.merchant === 'string' && raw.merchant.trim() ? raw.merchant.trim().slice(0, 120) : null,
    totalAmount: typeof raw.totalAmount === 'number' && Number.isFinite(raw.totalAmount) && raw.totalAmount > 0
      ? raw.totalAmount
      : null,
    receiptDate: typeof raw.receiptDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.receiptDate)
      ? raw.receiptDate
      : null,
    currency: 'INR',
    suggestedCategory,
    invoiceNumber: typeof raw.invoiceNumber === 'string' ? raw.invoiceNumber.trim().slice(0, 80) : null,
    confidence: typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((v): v is string => typeof v === 'string').slice(0, 5) : [],
    lineItems,
    expenseGroups,
  };
}
