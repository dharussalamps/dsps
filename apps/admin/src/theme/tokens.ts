/**
 * Design tokens derived from the school crest (maroon ring, gold shield and
 * banner, cream background). Every screen should pull colors from here —
 * never inline a hex value in a screen or component.
 */

export const colors = {
  maroon50: '#FBEFF1',
  maroon100: '#F0D3D8',
  maroon300: '#C07C87',
  maroon500: '#95323F',
  maroon700: '#7A1F2B',
  maroon800: '#631825',
  maroon900: '#4E1019',

  gold50: '#FBF6EC',
  gold100: '#F3E6C8',
  gold300: '#DDC088',
  gold500: '#C9A45C',
  gold700: '#A9823C',
  gold900: '#7A5C24',

  cream50: '#FBF8F3',
  cream100: '#F3ECDF',
  cream200: '#E9DFCB',

  teal500: '#4FB8B0',
  teal700: '#357F79',

  ink900: '#2B1A1D',
  ink700: '#4A3438',
  ink500: '#75585D',
  ink300: '#A98F93',

  white: '#FFFFFF',

  // success/warning/info were originally lighter (#1E8E5A / #B4750B /
  // #2B6FC2) and read fine by eye, but measured under 4.5:1 against their
  // *Bg pairs — 3.66 / 3.39 / 4.36 respectively, all failing WCAG AA for
  // the 13px bold text StatusPill actually renders (build task 23's
  // accessibility pass; see docs/AdminSpec.md section 17). Darkened here
  // to 5.77 / 5.26 / 5.88, verified against these exact backgrounds.
  success: '#146B44',
  successBg: '#E4F5EC',
  warning: '#8A5A00',
  warningBg: '#FCF0DC',
  error: '#C22B2B',
  errorBg: '#FBE7E7',
  info: '#1F5AA8',
  infoBg: '#E7EFFB',
} as const;

export const semantic = {
  background: colors.cream50,
  surface: colors.white,
  surfaceAlt: colors.cream100,
  border: colors.cream200,
  textPrimary: colors.ink900,
  textSecondary: colors.ink500,
  textOnPrimary: colors.white,
  primary: colors.maroon700,
  primaryPressed: colors.maroon800,
  primaryMuted: colors.maroon100,
  secondary: colors.gold500,
  secondaryPressed: colors.gold700,
  secondaryMuted: colors.gold100,
  accent: colors.teal500,
  link: colors.maroon700,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  subtitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.6 },
};

export const elevation = {
  card: {
    shadowColor: colors.ink900,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  raised: {
    shadowColor: colors.ink900,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

/** Minimum tap target per AdminSpec.md section 14 ("Definition of done"). */
export const minTapTarget = 44;
