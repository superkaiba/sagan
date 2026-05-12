import { forwardRef, useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
  TextInput as RNTextInput,
  type TextInputProps,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { minHit, radius, spacing, type, useTheme, type Theme } from '@/lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/* -------------------------------------------------------------------------- */
/* Containers                                                                  */
/* -------------------------------------------------------------------------- */

interface ScreenProps extends ViewProps {
  edges?: readonly Edge[];
  /** Use `sunken` when the screen is dominated by cards (gives the cards a
   *  surface above the bg). Default keeps the warm off-white. */
  background?: 'bg' | 'sunken' | 'surface';
}

export function Screen({ children, style, edges, background = 'bg', ...rest }: ScreenProps) {
  const t = useTheme();
  const bg = t.colors[background];
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: bg }, style]} {...rest}>
      {children}
    </SafeAreaView>
  );
}

export function PlainScreen({ children, style, background = 'bg', ...rest }: ScreenProps) {
  const t = useTheme();
  const bg = t.colors[background];
  return (
    <View style={[{ flex: 1, backgroundColor: bg }, style]} {...rest}>
      {children}
    </View>
  );
}

interface ScrollScreenProps extends ScrollViewProps {
  /** Inner content padding. Defaults to 16 on x / 12 on y. */
  pad?: number | { x?: number; y?: number };
  background?: 'bg' | 'sunken' | 'surface';
  children: ReactNode;
}

export function ScrollScreen({
  children,
  contentContainerStyle,
  style,
  pad,
  background = 'bg',
  ...rest
}: ScrollScreenProps) {
  const t = useTheme();
  const padX = typeof pad === 'number' ? pad : pad?.x ?? spacing.base;
  const padY = typeof pad === 'number' ? pad : pad?.y ?? spacing.md;
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: t.colors[background] }, style]}
      contentContainerStyle={[
        { paddingHorizontal: padX, paddingTop: padY, paddingBottom: spacing['3xl'], gap: spacing.md },
        contentContainerStyle,
      ]}
      contentInsetAdjustmentBehavior="automatic"
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

interface VStackProps extends ViewProps {
  gap?: keyof typeof spacing;
}
export function VStack({ gap = 'md', style, ...rest }: VStackProps) {
  return <View style={[{ gap: spacing[gap] }, style]} {...rest} />;
}

interface HStackProps extends ViewProps {
  gap?: keyof typeof spacing;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
}
export function HStack({
  gap = 'sm',
  align = 'center',
  justify,
  wrap,
  style,
  ...rest
}: HStackProps) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap: spacing[gap],
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
      {...rest}
    />
  );
}

export function Separator({ style }: { style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.hairline, alignSelf: 'stretch' },
        style,
      ]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Typography                                                                  */
/* -------------------------------------------------------------------------- */

type Tone = 'fg' | 'muted' | 'subtle' | 'accent' | 'danger' | 'success' | 'warning';
type Variant =
  | 'largeTitle'
  | 'title'
  | 'title2'
  | 'title3'
  | 'body'
  | 'bodyEmph'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption'
  | 'micro'
  | 'mono';

interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
}

const toneToColor = (t: Theme, tone: Tone): string => {
  switch (tone) {
    case 'muted':
      return t.colors.mutedFg;
    case 'subtle':
      return t.colors.subtleFg;
    case 'accent':
      return t.colors.accent;
    case 'danger':
      return t.colors.danger;
    case 'success':
      return t.colors.success;
    case 'warning':
      return t.colors.warning;
    default:
      return t.colors.fg;
  }
};

export const Text = forwardRef<RNText, TextProps>(function Text(
  { variant = 'body', tone = 'fg', style, ...rest },
  ref,
) {
  const t = useTheme();
  return (
    <RNText
      ref={ref}
      style={[type[variant], { color: toneToColor(t, tone) }, style]}
      {...rest}
    />
  );
});

export function SectionLabel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <RNText style={[type.micro, { color: t.colors.mutedFg }, style as object]}>{children}</RNText>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

interface CardProps extends ViewProps {
  /** `flat` (default) is a tone-only card with no border. `outlined` adds a
   *  hairline border for high-density screens. `sunken` uses the inset well
   *  color (for nested children, code blocks, etc.). */
  variant?: 'flat' | 'outlined' | 'sunken';
  pad?: keyof typeof spacing | number;
  gap?: keyof typeof spacing;
  onPress?: () => void;
  pressableProps?: Omit<PressableProps, 'onPress' | 'style'>;
}

export function Card({
  variant = 'flat',
  pad = 'base',
  gap = 'sm',
  onPress,
  pressableProps,
  style,
  children,
  ...rest
}: CardProps) {
  const t = useTheme();
  // Memoize per variant/pad/gap/theme tuple — Card is rendered for every event
  // on the run-detail screen (up to hundreds), so churning style objects each
  // render measurably affects scroll smoothness.
  const cardStyle = useMemo<ViewStyle>(() => {
    const bg = variant === 'sunken' ? t.colors.sunken : t.colors.surface;
    const padValue = typeof pad === 'number' ? pad : spacing[pad];
    return {
      backgroundColor: bg,
      borderRadius: radius.lg,
      padding: padValue,
      gap: spacing[gap],
      borderWidth: variant === 'outlined' ? StyleSheet.hairlineWidth : 0,
      borderColor: variant === 'outlined' ? t.colors.border : 'transparent',
    };
  }, [variant, pad, gap, t.colors.sunken, t.colors.surface, t.colors.border]);
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [cardStyle, pressed && { opacity: t.isDark ? 0.88 : 0.78 }, style]}
        android_ripple={{ color: t.colors.accentSoft, borderless: false }}
        {...pressableProps}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[cardStyle, style]} {...rest}>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Pill                                                                        */
/* -------------------------------------------------------------------------- */

export type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  style?: ViewStyle;
}

const pillToneToColors = (t: Theme, tone: PillTone) => {
  switch (tone) {
    case 'success':
      return { bg: t.colors.successSoft, fg: t.colors.success };
    case 'warning':
      return { bg: t.colors.warningSoft, fg: t.colors.warning };
    case 'danger':
      return { bg: t.colors.dangerSoft, fg: t.colors.danger };
    case 'info':
      return { bg: t.colors.infoSoft, fg: t.colors.info };
    case 'accent':
      return { bg: t.colors.accentSoft, fg: t.colors.accent };
    default:
      return { bg: t.colors.sunken, fg: t.colors.mutedFg };
  }
};

export function Pill({ children, tone = 'neutral', style }: PillProps) {
  const t = useTheme();
  const { bg, fg } = pillToneToColors(t, tone);
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          paddingHorizontal: spacing.sm,
          paddingVertical: 3,
          borderRadius: radius.pill,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <RNText
        style={{
          color: fg,
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        }}
      >
        {children}
      </RNText>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: IoniconName;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const sizeMap = {
  sm: { height: 36, paddingX: spacing.md, fontSize: 14 },
  md: { height: 44, paddingX: spacing.base, fontSize: 15 },
  lg: { height: 52, paddingX: spacing.lg, fontSize: 16 },
} as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  icon,
  fullWidth,
  style,
}: ButtonProps) {
  const t = useTheme();
  const sz = sizeMap[size];

  const containerByVariant: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: t.colors.accent },
    secondary: { backgroundColor: t.colors.sunken },
    ghost: { backgroundColor: 'transparent' },
    destructive: { backgroundColor: t.colors.dangerSoft },
  };

  const fgByVariant: Record<ButtonVariant, string> = {
    primary: t.colors.accentFg,
    secondary: t.colors.fg,
    ghost: t.colors.accent,
    destructive: t.colors.danger,
  };

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        {
          height: sz.height,
          minWidth: minHit,
          paddingHorizontal: sz.paddingX,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.45 : pressed ? 0.78 : 1,
        },
        containerByVariant[variant],
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color={fgByVariant[variant]} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={fgByVariant[variant]} /> : null}
          <RNText
            style={{
              color: fgByVariant[variant],
              fontSize: sz.fontSize,
              fontWeight: '600',
              letterSpacing: 0.1,
            }}
          >
            {label}
          </RNText>
        </>
      )}
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IoniconName;
  onPress?: () => void;
  accessibilityLabel: string;
  variant?: 'ghost' | 'soft';
  size?: number;
  style?: ViewStyle;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'ghost',
  size = 22,
  style,
}: IconButtonProps) {
  const t = useTheme();
  const bg = variant === 'soft' ? t.colors.sunken : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          width: minHit,
          height: minHit,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.pill,
          backgroundColor: bg,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={t.colors.fg} />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  multiline?: boolean;
}

export const Input = forwardRef<RNTextInput, FieldProps>(function Input(
  { label, hint, error, multiline, style, ...rest },
  ref,
) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <RNTextInput
        ref={ref}
        placeholderTextColor={t.colors.subtleFg}
        style={[
          {
            backgroundColor: t.colors.sunken,
            color: t.colors.fg,
            paddingHorizontal: spacing.md,
            paddingVertical: multiline ? spacing.md : 12,
            borderRadius: radius.md,
            minHeight: multiline ? 120 : 44,
            ...type.body,
          },
          error
            ? { borderWidth: 1, borderColor: t.colors.danger, backgroundColor: t.colors.dangerSoft }
            : null,
          style,
        ]}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...rest}
      />
      {error ? (
        <RNText style={[type.footnote, { color: t.colors.danger }]}>{error}</RNText>
      ) : hint ? (
        <RNText style={[type.footnote, { color: t.colors.mutedFg }]}>{hint}</RNText>
      ) : null}
    </View>
  );
});

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

export function LoadingState({ label }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'] }}>
      <ActivityIndicator color={t.colors.accent} />
      {label ? (
        <RNText style={[type.footnote, { color: t.colors.mutedFg, marginTop: spacing.md }]}>
          {label}
        </RNText>
      ) : null}
    </View>
  );
}

interface EmptyStateProps {
  icon?: IoniconName;
  title: string;
  message?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = 'sparkles-outline', title, message, action }: EmptyStateProps) {
  const t = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing['3xl'],
        gap: spacing.md,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.pill,
          backgroundColor: t.colors.sunken,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={24} color={t.colors.mutedFg} />
      </View>
      <RNText style={[type.bodyEmph, { color: t.colors.fg, textAlign: 'center' }]}>{title}</RNText>
      {message ? (
        <RNText
          style={[type.footnote, { color: t.colors.mutedFg, textAlign: 'center', maxWidth: 280 }]}
        >
          {message}
        </RNText>
      ) : null}
      {action}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* List row                                                                    */
/* -------------------------------------------------------------------------- */

interface ListRowProps {
  title: string;
  subtitle?: string;
  leftIcon?: IoniconName;
  trailing?: ReactNode;
  onPress?: () => void;
}

export function ListRow({ title, subtitle, leftIcon, trailing, onPress }: ListRowProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: t.colors.surface,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.base,
          paddingVertical: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: 64,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      {leftIcon ? (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.md,
            backgroundColor: t.colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={leftIcon} size={19} color={t.colors.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <RNText style={[type.body, { color: t.colors.fg, fontWeight: '600' }]}>{title}</RNText>
        {subtitle ? (
          <RNText style={[type.footnote, { color: t.colors.mutedFg }]}>{subtitle}</RNText>
        ) : null}
      </View>
      {trailing ?? <Ionicons name="chevron-forward" size={18} color={t.colors.subtleFg} />}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Large-title header (in-screen, replaces native header on tabs)              */
/* -------------------------------------------------------------------------- */

interface LargeTitleProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}

/**
 * In-screen large title. Renders at the top of a Screen, OUTSIDE the
 * scrollable content. Has its own horizontal padding matching the standard
 * screen gutter, so it aligns with cards inside a ScrollScreen/FlatList.
 */
export function LargeTitle({ title, subtitle, trailing }: LargeTitleProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.md,
        paddingHorizontal: spacing.base,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="largeTitle">{title}</Text>
        {subtitle ? (
          <Text variant="footnote" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}
