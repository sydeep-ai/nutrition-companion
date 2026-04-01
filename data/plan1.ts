export type Meal = {
  id: string;
  title: string;
  time: string;
  details: string;
};

export const plan1: Meal[] = [
  {
    id: 'morning-ritual',
    title: '🌅 Morning Ritual',
    time: '7:00am',
    details: 'Warm water with ½ tsp ghee + 4 soaked almonds',
  },
  {
    id: 'breakfast',
    title: '🍳 Breakfast',
    time: '9:15am',
    details:
      '2 whole egg veggie omelette with lots of veggies + feta cheese · 1 slice sourdough',
  },
  {
    id: 'morning-supplement',
    title: '💊 Morning Supplement',
    time: '9:30am',
    details: 'Take morning supplements with/after breakfast.',
  },
  {
    id: 'lunch',
    title: '🥗 Lunch',
    time: '12:30pm',
    details:
      '1 Roti or 1/2 cup Quinoa + 1 cup cooked veg + 2 bowls of Daal',
  },
  {
    id: 'afternoon-snack',
    title: '🍎 Afternoon Snack',
    time: '3:00pm',
    details: 'Tea + fresh fruit or veggie sticks',
  },
  {
    id: 'dinner',
    title: '🍽️ Dinner',
    time: '6:30pm',
    details: 'Family meal',
  },
  {
    id: 'iron-supplement',
    title: '💊 Iron Supplement',
    time: '10:00pm',
    details: 'Take iron supplement before bed.',
  },
];
