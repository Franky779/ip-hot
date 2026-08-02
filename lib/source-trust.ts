export type OfficialSourceVerification = {
  platform?: string | null
  verification_status?: string | null
  x_handle?: string | null
  x_user_id?: string | null
  x_profile_url?: string | null
  official_evidence_url?: string | null
}

export function isVerifiedOfficialX(source: OfficialSourceVerification | null | undefined): boolean {
  return Boolean(
    source
    && source.platform?.toLowerCase() === 'x'
    && source.verification_status === 'verified'
    && source.x_handle
    && source.x_user_id
    && source.x_profile_url?.startsWith('https://x.com/')
    && source.official_evidence_url?.startsWith('https://')
  )
}

export type OfficialSourcePolicyInput = {
  relevance_score: number
  is_selected: boolean
  safety_blocked: boolean
  trusted_official_x: boolean
}

export type OfficialSourcePolicyResult =
  | { action: 'delete' }
  | { action: 'publish'; relevance_score: number; is_selected: boolean }

export function applyOfficialSourcePolicy(input: OfficialSourcePolicyInput): OfficialSourcePolicyResult {
  if (input.safety_blocked) return { action: 'delete' }
  if (input.trusted_official_x) return { action: 'publish', relevance_score: 7, is_selected: true }
  return { action: 'publish', relevance_score: input.relevance_score, is_selected: input.is_selected }
}

export async function loadVerifiedOfficialXNames(supabase: { from: (table: string) => any }): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('info_sources')
    .select('name, platform, verification_status, x_handle, x_user_id, x_profile_url, official_evidence_url')
  if (error) throw new Error(error.message)
  return new Set((data ?? []).filter(isVerifiedOfficialX).map((source: { name: string }) => source.name))
}
