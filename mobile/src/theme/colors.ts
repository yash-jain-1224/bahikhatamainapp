// ─── Theme Colors & Constants ────────────────────────────
// Design system for Bahi Khata Mobile

export const Colors = {
  light: {
    primary: '#6366F1',       // Indigo-500
    primaryDark: '#4F46E5',   // Indigo-600
    primaryLight: '#A5B4FC',  // Indigo-300
    background: '#F8FAFC',    // Slate-50
    surface: '#FFFFFF',
    surfaceSecondary: '#F1F5F9', // Slate-100
    text: '#0F172A',          // Slate-900
    textSecondary: '#64748B', // Slate-500
    textTertiary: '#94A3B8',  // Slate-400
    border: '#E2E8F0',       // Slate-200
    borderLight: '#F1F5F9',  // Slate-100
    error: '#EF4444',
    errorLight: '#FEE2E2',
    success: '#10B981',
    successLight: '#D1FAE5',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    info: '#3B82F6',
    infoLight: '#DBEAFE',
    card: '#FFFFFF',
    shadow: 'rgba(0, 0, 0, 0.08)',
    overlay: 'rgba(0, 0, 0, 0.5)',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E2E8F0',
    statusBar: 'dark-content' as const,
  },
  dark: {
    primary: '#818CF8',       // Indigo-400
    primaryDark: '#6366F1',   // Indigo-500
    primaryLight: '#4F46E5',  // Indigo-600
    background: '#0F172A',    // Slate-900
    surface: '#1E293B',       // Slate-800
    surfaceSecondary: '#334155', // Slate-700
    text: '#F8FAFC',          // Slate-50
    textSecondary: '#94A3B8', // Slate-400
    textTertiary: '#64748B',  // Slate-500
    border: '#334155',       // Slate-700
    borderLight: '#1E293B',  // Slate-800
    error: '#F87171',
    errorLight: 'rgba(239, 68, 68, 0.15)',
    success: '#34D399',
    successLight: 'rgba(16, 185, 129, 0.15)',
    warning: '#FBBF24',
    warningLight: 'rgba(245, 158, 11, 0.15)',
    info: '#60A5FA',
    infoLight: 'rgba(59, 130, 246, 0.15)',
    card: '#1E293B',
    shadow: 'rgba(0, 0, 0, 0.3)',
    overlay: 'rgba(0, 0, 0, 0.7)',
    tabBar: '#1E293B',
    tabBarBorder: '#334155',
    statusBar: 'light-content' as const,
  },
} as const;

export type ThemeColors = (typeof Colors)['light'] | (typeof Colors)['dark'];

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 36,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
} as const;

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;
