import Constants from 'expo-constants';

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

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

export async function getFinancialAdvice(prompt: string, systemPrompt?: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return 'AI Coach Error: Gemini API Key is missing. Set EXPO_PUBLIC_GEMINI_API_KEY in your .env file.';
  }

  const request: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
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
    contents: [{ parts: [{ text: `Transaction: '${title}', Amount: $${amount}` }] }],
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
