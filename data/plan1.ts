export type Meal = {
  id: string;
  title: string;
  time: string;
  details: string;
};

export const plan1: Meal[] = [
  {
    id: '1',
    title: 'Breakfast',
    time: '7:30 AM',
    details: 'Oats with yogurt and berries.',
  },
  {
    id: '2',
    title: 'Morning Snack',
    time: '10:30 AM',
    details: 'Apple with peanut butter.',
  },
  {
    id: '3',
    title: 'Lunch',
    time: '1:00 PM',
    details: 'Chicken, rice, and salad.',
  },
  {
    id: '4',
    title: 'Afternoon Snack',
    time: '4:00 PM',
    details: 'Carrots with hummus.',
  },
  {
    id: '5',
    title: 'Dinner',
    time: '7:00 PM',
    details: 'Salmon, sweet potato, and broccoli.',
  },
  {
    id: '6',
    title: 'Evening Snack',
    time: '9:00 PM',
    details: 'Cottage cheese and cucumber.',
  },
];
