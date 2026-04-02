export type PlanMeal = {
  id: string;
  emoji: string;
  name: string;
  time: string;
  details: string;
};

export const EMOJI_CYCLE = ['🌅', '🍳', '🥗', '🍎', '🍽️', '💊', '🥛', '🌙'] as const;

export const DEFAULT_MEAL_PLAN: PlanMeal[] = [
  {
    id: 'morning-ritual',
    emoji: '🌅',
    name: 'Morning Ritual',
    time: '7:00am',
    details: 'Warm water with ½ tsp ghee + 4 soaked almonds',
  },
  {
    id: 'breakfast',
    emoji: '🍳',
    name: 'Breakfast',
    time: '9:15am',
    details:
      '2 whole egg veggie omelette with lots of veggies + feta cheese · 1 slice sourdough',
  },
  {
    id: 'lunch',
    emoji: '🥗',
    name: 'Lunch',
    time: '12:30pm',
    details: '1 Roti or 1/2 cup Quinoa + 1 cup cooked veg + 2 bowls of Daal',
  },
  {
    id: 'afternoon-snack',
    emoji: '🍎',
    name: 'Afternoon Snack',
    time: '3:00pm',
    details: 'Tea + fresh fruit or veggie sticks',
  },
  {
    id: 'dinner',
    emoji: '🍽️',
    name: 'Dinner',
    time: '6:30pm',
    details: 'Family meal',
  },
  {
    id: 'iron-supplement',
    emoji: '💊',
    name: 'Iron Supplement',
    time: '10:00pm',
    details: 'Take iron supplement before bed.',
  },
];

