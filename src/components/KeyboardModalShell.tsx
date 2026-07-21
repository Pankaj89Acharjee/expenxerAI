import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller';

/**
 * RN Modal renders in a separate native window, so root KeyboardProvider
 * is not visible to KeyboardAwareScrollView inside modals.
 * KeyboardAvoidingView lifts the sheet above the soft keyboard on Android/iOS.
 */
export function KeyboardModalShell({ children }: { children: ReactNode }) {
  return (
    <KeyboardProvider>
      <KeyboardAvoidingView style={styles.fill} behavior="padding" automaticOffset>
        {children}
      </KeyboardAvoidingView>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
