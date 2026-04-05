const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

const CHECKIN_SYSTEM_PROMPT =
  "You are a direct, honest coach reviewing someone's day. You know their goal, their why, and the specific changes they committed to making. Give a real assessment of how their day went against their own stated intentions. Do NOT give positive reinforcement for everything — only acknowledge what genuinely went well. Be direct about what was missed. No fluff, no empty praise. 4-5 sentences max. End with one single actionable focus for tomorrow.";

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicMessageResponse = {
  content?: AnthropicContentBlock[];
};

function extractTextFromMessageResponse(data: AnthropicMessageResponse): string {
  const blocks = data.content;
  if (!Array.isArray(blocks)) {
    return '';
  }
  return blocks
    .filter((b): b is AnthropicContentBlock & { text: string } => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * Calls Anthropic Messages API for the daily check-in coach response.
 */
export async function requestDayCheckIn(userMessage: string): Promise<string> {
  const key = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
  if (key === undefined || key === '' || !String(key).trim()) {
    throw new Error(
      'API key not configured. Please add EXPO_PUBLIC_ANTHROPIC_API_KEY to your .env file.'
    );
  }

  console.log(
    'Key length:',
    process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY?.length,
    'Starts with:',
    process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY?.substring(0, 10)
  );

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY!.trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: CHECKIN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  console.log('Response status:', response.status);

  const rawText = await response.text();
  console.log('Raw response:', rawText);

  if (!response.ok) {
    throw new Error(rawText || `Check-in request failed (${response.status})`);
  }

  let data: AnthropicMessageResponse;
  try {
    data = JSON.parse(rawText) as AnthropicMessageResponse;
  } catch {
    throw new Error('Invalid response from check-in service');
  }

  const text = extractTextFromMessageResponse(data);
  if (!text) {
    throw new Error('Empty check-in response');
  }
  return text;
}
