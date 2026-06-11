'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult, EstadoPedido } from '@/types'

export async function cambiarEstado(id: string, estado: EstadoPedido): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('pedidos').update({ estado }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/pedidos')
  return {}
}
