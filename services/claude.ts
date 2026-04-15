import AsyncStorage from '@react-native-async-storage/async-storage';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

const TRACKING_CONFIG_KEY = 'tracking_config';
const MEAL_PLAN_STORAGE_KEY = 'meal_plan';

const TRACKING_ORDER = [
  'meals',
  'steps',
  'workout',
  'water',
  'supplements',
  'custom',
] as const;

type TrackingId = (typeof TRACKING_ORDER)[number];

const ONBOARDING_KEYS = [
  'user_name',
  'user_goal',
  'user_why',
  'user_intentions',
  'reward_name',
  'plan_start_date',
  'target_days',
  TRACKING_CONFIG_KEY,
  MEAL_PLAN_STORAGE_KEY,
] as const;

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

function isTrackingId(s: string): s is TrackingId {
  return (TRACKING_ORDER as readonly string[]).includes(s);
}

function parseTrackingConfig(raw: string | null): TrackingId[] {
  if (raw === null || raw === undefined) {
    return ['meals'];
  }
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) {
      return ['meals'];
    }
    if (arr.length === 0) {
      return [];
    }
    const ids = arr.filter((x): x is TrackingId => typeof x === 'string' && isTrackingId(x));
    return TRACKING_ORDER.filter((id) => ids.includes(id));
  } catch {
    return ['meals'];
  }
}

function mealPlanMealCount(raw: string | null): number {
  if (!raw?.trim()) {
    return 0;
  }
  try {
    const plan = JSON.parse(raw) as unknown;
    if (!Array.isArray(plan)) {
      return 0;
    }
    return plan.length;
  } catch {
    return 0;
  }
}

function parseIntentionsStrings(raw: string | null): string[] {
  try {
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) {
      return [];
    }
    return arr.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function formatIntentionsList(raw: string | null): string {
  try {
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.map((x, i) => `${i + 1}. ${String(x)}`).join('\n');
    }
  } catch {
    return '(could not parse intentions)';
  }
  return '(none recorded)';
}

/** Day X of Y aligned with app/index `formatCommitmentDayLine` (local calendar days). */
function commitmentDayAndTarget(
  planStartRaw: string | null,
  targetDaysRaw: string | null
): { dayX: number; dayY: string } {
  const targetParsed = parseInt(String(targetDaysRaw ?? '').trim(), 10);
  const dayY =
    Number.isFinite(targetParsed) && targetParsed > 0 ? String(targetParsed) : '?';

  if (!planStartRaw?.trim()) {
    return { dayX: 1, dayY };
  }
  const start = new Date(planStartRaw);
  if (Number.isNaN(start.getTime())) {
    return { dayX: 1, dayY };
  }
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const now = new Date();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((todayDay.getTime() - startDay.getTime()) / 86400000) + 1;
  const dayX = Math.max(1, diffDays);
  return { dayX, dayY };
}

function buildCheckinSystemPrompt(ctx: {
  name: string;
  goal: string;
  why: string;
  reward: string;
  targetDays: string;
  dayX: number;
  dayY: string;
  intentionsSummary: string;
}): string {
  const mismatchRule =
    "If the user has stated intentions that don't have corresponding tracking data (e.g. they mentioned eating more protein but have no meal tracking), explicitly call this out: 'You set an intention around [X] but have no tracking set up for it — I can't assess this. Go to your plan settings and add [relevant tracking type] to cover this.'";

  const whyAnchor = `The user's deepest reason for doing this is: ${ctx.why}. Reference this occasionally in your review when relevant — especially when they've had a hard day or missed something. Remind them why this matters to them personally.`;

  return (
    `You are a direct, honest coach reviewing ${ctx.name}'s day. You know their goal is ${ctx.goal}, their why is ${ctx.why}, and their reward for hitting ${ctx.targetDays} days is ${ctx.reward}. They are on Day ${ctx.dayX} of ${ctx.dayY}. They committed to these changes: ${ctx.intentionsSummary}. ${whyAnchor} Assess their day honestly against these intentions. Address them by name. Reference their reward occasionally to remind them what they're working towards. Do NOT give empty praise. Only acknowledge what genuinely went well. Be direct about what was missed. 4-5 sentences max. End with one single actionable focus for tomorrow. ` +
    mismatchRule
  );
}

const FOOD_INTENTION_RE =
  /\b(protein|meal|meals|eat|eating|eaten|food|nutrition|nutritional|diet|calorie|calories|carb|carbs|snack|breakfast|lunch|dinner|fasting|sugar|portion|macros|hunger|craving)\b/i;
const STEPS_WALK_RE = /\b(steps?|walking|walked|\bwalk\b|10\s*,?\s*000|10k)\b/i;
const MOVEMENT_RE =
  /\b(move|moving|movement|exercise|exercising|cardio|run|running|gym|workout|work\s*out|active|fitness)\b/i;
const WATER_INTENTION_RE = /\b(water|hydrat|hydration|drink|drinking|fluid|gallon)\b/i;

function buildTrackingGapsSection(
  intentionsRaw: string | null,
  tracking: TrackingId[],
  mealPlanCount: number
): string {
  const intentions = parseIntentionsStrings(intentionsRaw);
  const lines: string[] = ['## Tracking gaps', ''];

  if (intentions.length === 0) {
    lines.push(
      '- (No intentions recorded in onboarding — skip intention-vs-tracking mismatch checks.)'
    );
    lines.push('');
    return lines.join('\n');
  }

  const tracksMeals = tracking.includes('meals');
  const mealTrackingReady = tracksMeals && mealPlanCount > 0;
  const tracksSteps = tracking.includes('steps');
  const tracksWorkout = tracking.includes('workout');
  const tracksWater = tracking.includes('water');

  const activityCoversMovement = tracksSteps || tracksWorkout;

  for (const intention of intentions) {
    const foodMention = FOOD_INTENTION_RE.test(intention);
    const stepsWalkMention = STEPS_WALK_RE.test(intention);
    const movementMention = MOVEMENT_RE.test(intention) || stepsWalkMention;
    const waterMention = WATER_INTENTION_RE.test(intention);

    if (foodMention && !mealTrackingReady) {
      const detail = !tracksMeals
        ? 'Meal tracking is not enabled in plan settings — enable meals and add a meal plan, or the coach cannot assess food-related intentions.'
        : 'Meals are enabled but the meal plan is empty — add meals in plan settings so food-related intentions can be assessed.';
      lines.push(`- **Food / nutrition / protein:** Intention references eating or nutrition ("${intention}") but ${detail}`);
    }

    if (stepsWalkMention && !tracksSteps) {
      lines.push(
        `- **Steps / walking:** Intention references steps or walking ("${intention}") but step tracking is not enabled — add steps in plan settings.`
      );
    } else if (movementMention && !stepsWalkMention && !activityCoversMovement) {
      lines.push(
        `- **Movement / activity:** Intention references moving or exercise ("${intention}") but neither steps nor workout tracking is enabled — add at least one in plan settings.`
      );
    }

    if (waterMention && !tracksWater) {
      lines.push(
        `- **Water / hydration:** Intention references hydration ("${intention}") but water tracking is not enabled — add water in plan settings.`
      );
    }
  }

  if (lines.length <= 2) {
    lines.push(
      '- (No obvious mismatches detected between stated intentions and enabled tracking areas, based on keyword checks.)'
    );
  }

  lines.push('');
  return lines.join('\n');
}

function buildOnboardingUserPreamble(g: Record<string, string | null>): string {
  const name = g.user_name?.trim() || '(not set)';
  const goal = g.user_goal?.trim() || '(not set)';
  const why = g.user_why?.trim() || '(not set)';
  const reward = g.reward_name?.trim() || '(not set)';
  const { dayX, dayY } = commitmentDayAndTarget(g.plan_start_date, g.target_days);
  const intentions = formatIntentionsList(g.user_intentions ?? null);

  const lines: string[] = [
    '## Full onboarding profile (use for coaching context)',
    `Their goal: ${goal}`,
    `Their why: ${why}`,
    `Their reward: ${reward}`,
    `User's name: ${name}`,
    `Day ${dayX} of ${dayY} (from plan_start_date and target_days)`,
    '',
    'Their intentions (user_intentions JSON):',
    intentions,
    '',
  ];
  return lines.join('\n');
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

  const entries = await AsyncStorage.multiGet([...ONBOARDING_KEYS]);
  const g = Object.fromEntries(entries) as Record<string, string | null>;

  const displayName = g.user_name?.trim() || 'friend';
  const goal = g.user_goal?.trim() || '(not set)';
  const why = g.user_why?.trim() || '(not set)';
  const reward = g.reward_name?.trim() || '(not set)';
  const { dayX, dayY } = commitmentDayAndTarget(g.plan_start_date, g.target_days);
  const intentionsBlock = formatIntentionsList(g.user_intentions ?? null);
  const intentionsSummary = intentionsBlock.replace(/\n/g, '; ');
  const targetDaysRaw = g.target_days?.trim() ?? '';
  const targetParsed = parseInt(targetDaysRaw, 10);
  const rewardTargetDaysPhrase =
    Number.isFinite(targetParsed) && targetParsed > 0
      ? String(targetParsed)
      : 'their chosen number of';

  const system = buildCheckinSystemPrompt({
    name: displayName,
    goal,
    why,
    reward,
    targetDays: rewardTargetDaysPhrase,
    dayX,
    dayY,
    intentionsSummary,
  });

  const preamble = buildOnboardingUserPreamble(g);
  const tracking = parseTrackingConfig(g[TRACKING_CONFIG_KEY] ?? null);
  const mealPlanCount = mealPlanMealCount(g[MEAL_PLAN_STORAGE_KEY] ?? null);
  const trackingGaps = buildTrackingGapsSection(g.user_intentions ?? null, tracking, mealPlanCount);
  const fullUserMessage = `${preamble}\n---\n\n${userMessage}\n\n${trackingGaps}`;

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
      system,
      messages: [{ role: 'user', content: fullUserMessage }],
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
