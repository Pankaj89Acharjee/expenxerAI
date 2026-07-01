import type { ComponentProps } from 'react';
import type { MaterialIcons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function liabilityListIcon(): IconName {
  return 'account-balance-wallet';
}

export function subscriptionListIcon(purpose: string): IconName {
  switch (purpose) {
    case 'Entertainment':
      return 'movie';
    case 'Software':
      return 'apps';
    case 'Utilities':
      return 'bolt';
    case 'Health':
      return 'favorite';
    case 'Education':
      return 'school';
    case 'News':
      return 'newspaper';
    case 'Cloud Storage':
      return 'cloud';
    case 'Fitness':
      return 'fitness-center';
    case 'Productivity':
      return 'work';
    case 'Finance':
      return 'savings';
    default:
      return 'subscriptions';
  }
}

export function billListIcon(purpose: string): IconName {
  switch (purpose) {
    case 'Rent':
      return 'home';
    case 'Electricity':
      return 'bolt';
    case 'Water':
      return 'water-drop';
    case 'School Fees':
      return 'school';
    case 'Gas':
      return 'local-fire-department';
    case 'Internet':
      return 'wifi';
    case 'Maintenance':
      return 'build';
    case 'Insurance Premium':
      return 'health-and-safety';
    default:
      return 'receipt-long';
  }
}
