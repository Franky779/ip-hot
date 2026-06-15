import { createClient, SupabaseClient } from '@supabase/supabase-js'

function getEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    )
  }
  return { url, publishableKey }
}

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const { url, publishableKey } = getEnv()
    _supabase = createClient(url, publishableKey)
  }
  return _supabase
}

export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Vercel 上常用 SUPABASE_SERVICE_ROLE_KEY，本地用 SUPABASE_SECRET_KEY，优先兼容两种命名
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL env var')
  }
  if (!secretKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY env var (server-only)')
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
