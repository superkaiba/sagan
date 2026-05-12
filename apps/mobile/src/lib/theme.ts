import { Platform, useColorScheme } from 'react-native';

/**
 * Design tokens for the Sagan mobile app.
 *
 * Surfaces stack by tone, not by border:
 *   bg → surface → elevated
 * Borders are reserved for genuinely separated elements (inputs, hairline
 * dividers). Most cards rely on tone contrast plus generous whitespace.
 */

export interface ColorTokens {
  bg: string;
  surface: string;
  elevated: string;
  sunken: string;
  fg: string;
  fgEmph: string;
  mutedFg: string;
  subtleFg: string;
  border: string;
  hairline: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  overlay: string;
}

const palette: { light: ColorTokens; dark: ColorTokens } = {
  light: {
    bg: '#FBFAF7',         // warm off-white, easy on the eye
    surface: '#FFFFFF',    // cards and list rows sit slightly above bg
    elevated: '#FFFFFF',   // sheets, popovers
    sunken: '#F3F1EC',     // inputs, code blocks, inset wells
    fg: '#0E0F12',         // primary text
    fgEmph: '#000000',     // highest-contrast text (rare)
    mutedFg: '#6B6F7A',    // secondary text, meta
    subtleFg: '#9CA0AB',   // tertiary text, placeholders
    border: 'rgba(0,0,0,0.08)',
    hairline: 'rgba(0,0,0,0.06)',
    accent: '#3A55F5',     // refined indigo
    accentFg: '#FFFFFF',
    accentSoft: 'rgba(58, 85, 245, 0.10)',
    danger: '#D6304D',
    dangerSoft: 'rgba(214, 48, 77, 0.10)',
    success: '#159A56',
    successSoft: 'rgba(21, 154, 86, 0.10)',
    warning: '#B5790A',
    warningSoft: 'rgba(181, 121, 10, 0.12)',
    info: '#1F6FE6',
    infoSoft: 'rgba(31, 111, 230, 0.10)',
    overlay: 'rgba(10, 10, 12, 0.45)',
  },
  dark: {
    bg: '#0B0C0F',
    surface: '#16181D',
    elevated: '#1C1F26',
    sunken: '#0F1116',
    fg: '#F3F4F7',
    fgEmph: '#FFFFFF',
    mutedFg: '#9CA0AB',
    subtleFg: '#6B6F7A',
    border: 'rgba(255,255,255,0.10)',
    hairline: 'rgba(255,255,255,0.06)',
    accent: '#7C8CFF',
    accentFg: '#0B0C0F',
    accentSoft: 'rgba(124, 140, 255, 0.16)',
    danger: '#FF6E80',
    dangerSoft: 'rgba(255, 110, 128, 0.14)',
    success: '#5FD39A',
    successSoft: 'rgba(95, 211, 154, 0.14)',
    warning: '#F5C36A',
    warningSoft: 'rgba(245, 195, 106, 0.14)',
    info: '#7AB6FF',
    infoSoft: 'rgba(122, 182, 255, 0.14)',
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
};

/** 4-pt grid. Use named tokens, never magic numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 56,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

/** iOS-leaning type scale; uses system font on every platform. */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.3 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.2 },
  title3: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyEmph: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  subhead: { fontSize: 14, lineHeight: 19, fontWeight: '500' as const },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  micro: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 17,
  },
} as const;

/** iOS HIG: 44pt minimum hit target. Use this for any tappable element. */
export const minHit = 44;

/** Soft elevation; cross-platform. Use sparingly. */
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
    },
    android: { elevation: 1 },
    default: {},
  }) as object,
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
    },
    android: { elevation: 3 },
    default: {},
  }) as object,
} as const;

export interface Theme {
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof type;
  elevation: typeof elevation;
  isDark: boolean;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    colors: isDark ? palette.dark : palette.light,
    spacing,
    radius,
    type,
    elevation,
    isDark,
  };
}

export { palette };
