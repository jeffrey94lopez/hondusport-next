'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult } from '@/types'

export async function saveConfig(updates: Record<string, string>): Promise<ActionResult> {
  const supabase = await createClient()
  const rows = Object.entries(updates).map(([key, value]) => ({ key, value }))
  const { error } = await supabase
    .from('configuracion')
    .upsert(rows, { onConflict: 'key' })
  if (error) return { error: error.message }
  revalidatePath('/admin/configuracion')
  return {}
}
