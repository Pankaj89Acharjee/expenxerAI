import type { ReactNode } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';

/**
 * RN Modal renders in a separate native window, so root KeyboardProvider
 * is not visible to KeyboardAwareScrollView inside modals.
 */
export function KeyboardModalShell({ children }: { children: ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}
