import { useEffect, useState } from 'react'
import { router } from 'expo-router'
import { H1, Loading, Muted, Screen } from '@/components/ui'
import { getDatabase } from '@/db'
import { getOwner } from '@/db/queries'
import { getClientProfile } from '@/db/client-queries'

/**
 * Boot gate: open/migrate the database, then send the user either to onboarding
 * (first run) or straight into the app.
 */
export default function BootScreen() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await getDatabase()
        const owner = await getOwner()
        if (cancelled) return
        if (owner) {
          router.replace('/(tabs)/dashboard')
          return
        }
        const profile = await getClientProfile()
        if (cancelled) return
        router.replace(profile ? '/(client)/home' : '/onboarding')
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Screen>
      <H1>SiteBooks</H1>
      <Muted>Project finance for interior work.</Muted>
      {error ? <Muted>Could not open the local database: {error}</Muted> : <Loading label="Preparing…" />}
    </Screen>
  )
}
