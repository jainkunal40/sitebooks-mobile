import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export const colors = {
  bg: '#F6F7F9',
  card: '#FFFFFF',
  text: '#111827',
  muted: '#6B7280',
  border: '#E5E7EB',
  primary: '#1D4ED8',
  primaryText: '#FFFFFF',
  success: '#047857',
  danger: '#B91C1C',
  warning: '#B45309',
}

export function Screen({
  children,
  scroll = true,
}: {
  children: ReactNode
  scroll?: boolean
}) {
  const content = <View style={styles.screenInner}>{children}</View>
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  )
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (pressed || disabled) && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' && styles.buttonTextSecondary,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  )
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator />
      <Text style={styles.muted}>{label}</Text>
    </View>
  )
}

export function Divider() {
  return <View style={styles.divider} />
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 40 },
  screenInner: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  h1: { fontSize: 26, fontWeight: '700', color: colors.text },
  h2: { fontSize: 17, fontWeight: '600', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  body: { fontSize: 15, color: colors.text },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: colors.primaryText, fontWeight: '600', fontSize: 15 },
  buttonTextSecondary: { color: colors.text },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted },
  input: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  hint: { fontSize: 12, color: colors.muted },
  loading: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
})
