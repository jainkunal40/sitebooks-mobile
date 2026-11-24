import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router'
import { colors } from '@/components/ui'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={typeof color === 'string' ? color : colors.text} size={size} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={typeof color === 'string' ? color : colors.text} size={size} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => <Ionicons name="mail-outline" color={typeof color === 'string' ? color : colors.text} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={typeof color === 'string' ? color : colors.text} size={size} />,
        }}
      />
    </Tabs>
  )
}
