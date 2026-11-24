import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { colors } from './ui'

export function BackHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  )
}

export function SubHeader({ children }: { children: ReactNode }) {
  return <View style={styles.sub}>{children}</View>
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.muted },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 8 },
})
