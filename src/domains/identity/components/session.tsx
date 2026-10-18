import type { Session } from '@supabase/supabase-js'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { getSupabase } from '@/shared/lib/supabase.ts'

export type SessionState = {
  session: Session | null
  loading: boolean
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionStateProvider({
  value,
  children,
}: {
  value: SessionState
  children: ReactNode
}) {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(() => getSupabase() !== null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  return (
    <SessionStateProvider value={{ session, loading }}>
      {children}
    </SessionStateProvider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const state = useContext(SessionContext)
  if (!state) {
    throw new Error('A sessão precisa ficar dentro do AuthProvider.')
  }
  return state
}
