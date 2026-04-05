export type PlanMeal = {
  id: string;
  emoji: string;
  title: string;
  time: string;
  intention: string;
};

export const EMOJI_CYCLE = ['🌅', '🍳', '🥗', '🍎', '🍽️', '💊', '🥛', '🌙'] as const;

export const DEFAULT_MEAL_PLAN: PlanMeal[] = [
  {
    id: 'morning-ritual',
    emoji: '🌅',
    title: 'Morning Ritual',
    time: '7:00am',
    intention: 'Hydration and light fuel to start the day',
  },
  {
    id: 'breakfast',
    emoji: '🍳',
    title: 'Breakfast',
    time: '9:15am',
    intention: 'High protein, with veggies and quality carbs',
  },
  {
    id: 'lunch',
    emoji: '🥗',
    title: 'Lunch',
    time: '12:30pm',
    intention: 'Balanced plate, veg-led, steady energy',
  },
  {
    id: 'afternoon-snack',
    emoji: '🍎',
    title: 'Afternoon Snack',
    time: '3:00pm',
    intention: 'Light, whole-food snack',
  },
  {
    id: 'dinner',
    emoji: '🍽️',
    title: 'Dinner',
    time: '6:30pm',
    intention: 'Family-style, moderate portions',
  },
  {
    id: 'iron-supplement',
    emoji: '💊',
    title: 'Iron Supplement',
    time: '10:00pm',
    intention: 'As directed with evening routine',
  },
];

/** Load meal_plan JSON from storage; maps legacy `name`/`details` to `title`/`intention`. */
export function parseMealPlanFromStorage(raw: string | null): PlanMeal[] {
  if (!raw) {
    return DEFAULT_MEAL_PLAN;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_MEAL_PLAN;
    }
    if (parsed.length === 0) {
      return [];
    }
    const out: PlanMeal[] = [];
    parsed.forEach((item, i) => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const o = item as Record<string, unknown>;
      const id =
        typeof o.id === 'string' && o.id.trim()
          ? o.id
          : `meal-${i}-${Date.now()}`;
      const titleVal =
        typeof o.title === 'string'
          ? String(o.title)
          : typeof o.name === 'string'
            ? String(o.name)
            : '';
      const intentionVal =
        typeof o.intention === 'string'
          ? String(o.intention)
          : typeof o.details === 'string'
            ? String(o.details)
            : '';
      if (
        typeof o.name === 'string' ||
        typeof o.title === 'string' ||
        typeof o.emoji === 'string' ||
        typeof o.time === 'string'
      ) {
        out.push({
          id,
          emoji: String(o.emoji ?? '🍽️'),
          title: titleVal,
          time: String(o.time ?? ''),
          intention: intentionVal,
        });
      }
    });
    return out.length > 0 ? out : [];
  } catch {
    return DEFAULT_MEAL_PLAN;
  }
}
