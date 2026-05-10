import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  )
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabasePublishableKey)

export function createServiceClient(): SupabaseClient {
  if (!supabaseSecretKey) {
    throw new Error('Missing SUPABASE_SECRET_KEY env var (server-only)')
  }
  return createClient(supabaseUrl!, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
