export const Colors = {
  primaryGreen: '#047857',
  accentGreen: '#10B981',
  secondaryBlue: '#0F172A',
  tertiaryGold: '#F59E0B',
  indigo: '#4F46E5',
  darkBg: '#0F172A',
  darkCard: '#1E293B',
  darkSurface: '#334155',
  onDarkBg: '#F8FAFC',
  textSecondary: '#94A3B8',
  lightBg: '#FBFDF8',
  lightCard: '#FFFFFF',
  onLightBg: '#0F172A',
  emeraldBgSoft: '#ECFDF5',
  borderColor: '#E2E8F0',
  textMuted: '#64748B',
  chartBlue: '#3B82F6',
  chartRed: '#EF4444',
};

export function themeColors(isDark: boolean) {
  return {
    primary: isDark ? Colors.accentGreen : Colors.primaryGreen,
    tertiary: Colors.tertiaryGold,
    secondary: Colors.secondaryBlue,
    background: isDark ? Colors.darkBg : Colors.lightBg,
    card: isDark ? Colors.darkCard : Colors.lightCard,
    text: isDark ? Colors.onDarkBg : Colors.onLightBg,
    textMuted: isDark ? Colors.textSecondary : Colors.textMuted,
    border: isDark ? Colors.darkSurface : Colors.borderColor,
    emeraldSoft: isDark ? '#064E3B' : Colors.emeraldBgSoft,
    emeraldText: isDark ? '#34D399' : Colors.primaryGreen,
    onPrimary: '#FFFFFF',
    error: '#DC2626',
    errorContainer: '#FEE2E2',
    surfaceVariant: isDark ? Colors.darkSurface : '#F1F5F9',
  };
}
