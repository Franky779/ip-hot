import { createServiceClient } from '@/lib/supabase'
import { ABOUT_PAGE_ID } from '@/lib/site-pages'
import { AboutPageClient } from './AboutPageClient'

export const dynamic = 'force-dynamic'

export default async function AboutPage() {
  const { data } = await createServiceClient().from('site_pages').select('title, blocks').eq('id', ABOUT_PAGE_ID).maybeSingle()
  return <AboutPageClient initialContent={data ?? { title: '关于老贾', blocks: [] }} />
}
