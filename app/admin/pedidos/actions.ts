'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { traducirErrorPedido } from '@/lib/store/variantes'
import type { ActionResult, EstadoPedido } from '@/types'

export async function cambiarEstado(id: string, estado: EstadoPedido): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cambiar_estado_pedido', {
    p_pedido_id: id,
    p_estado: estado,
  })
  if (error) return { error: traducirErrorPedido(error.message) ?? error.message }
  revalidatePath('/admin/pedidos')
  return {}
}
