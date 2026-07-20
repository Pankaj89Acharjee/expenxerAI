import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import type { themeColors } from '@/src/theme/colors';

type ThemeColors = ReturnType<typeof themeColors>;

const TAB_CONTENT_HEIGHT = 52;
const TAB_TOP_PAD = 6;

/** Bottom padding that respects gesture / 3-button system nav on all Android builds. */
export function tabBarBottomPadding(safeBottom: number): number {
  if (Platform.OS === 'ios') {
    return Math.max(safeBottom, 8);
  }
  // Standalone Android builds often report a larger inset than Expo Go.
  return Math.max(safeBottom, 8);
}

/** Shared tab bar chrome — never use a fixed height without safe-area bottom. */
export function buildTabBarStyle(
  colors: ThemeColors,
  safeBottom: number,
  options?: { hidden?: boolean }
): ViewStyle {
  if (options?.hidden) {
    return { display: 'none', height: 0 };
  }

  const paddingBottom = tabBarBottomPadding(safeBottom);
  return {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: TAB_TOP_PAD,
    paddingBottom,
    height: TAB_CONTENT_HEIGHT + TAB_TOP_PAD + paddingBottom,
    elevation: 0,
    shadowOpacity: 0,
  };
}

export function buildTabBarLabelStyle(windowWidth: number): TextStyle {
  const compact = windowWidth < 380;
  const medium = windowWidth < 420;
  return {
    fontSize: compact ? 9 : medium ? 10 : 11,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 0,
  };
}

export function buildTabBarItemStyle(windowWidth: number): ViewStyle {
  return {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: windowWidth < 380 ? 0 : 2,
    justifyContent: 'center',
    alignItems: 'center',
  };
}
