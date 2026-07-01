export const SUBSCRIPTION_PURPOSES = [
  'Entertainment',
  'Software',
  'Utilities',
  'Health',
  'Education',
  'News',
  'Cloud Storage',
  'Fitness',
  'Productivity',
  'Finance',
  'Other',
] as const;

export type SubscriptionPurpose = (typeof SUBSCRIPTION_PURPOSES)[number];

export const SUBSCRIPTION_BILLING_CYCLES = ['MONTHLY', 'YEARLY'] as const;
