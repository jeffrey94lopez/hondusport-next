'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { EstadoPedido } from '@/types'

export async function updateEstadoPedido(id: string, estado: EstadoPedido): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('pedidos')
    .update({ estado, updated_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/admin/pedidos')
}
