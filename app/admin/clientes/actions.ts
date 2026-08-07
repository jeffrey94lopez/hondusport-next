'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { validarRtn } from '@/lib/pos/fiscal'
import type { ActionResult, ClienteForm } from '@/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

function toPayload(form: ClienteForm) {
  return {
    nombre: form.nombre.trim(),
    rtn: form.rtn.trim() || null,
    identidad: form.identidad.trim() || null,
    tipo_cliente: form.tipo_cliente,
    exonerado: form.exonerado,
    constancia_exonerado: form.exonerado ? form.constancia_exonerado.trim() || null : null,
    registro_sag: form.exonerado ? form.registro_sag.trim() || null : null,
    direccion: form.direccion.trim() || null,
    telefono: form.telefono.trim() || null,
    correo: form.correo.trim() || null,
    notas: form.notas.trim() || null,
  }
}

// El índice único clientes_rtn_unico solo cubre rtn no nulo: si el 23505 salta
// consultamos quién es el dueño actual del RTN para dar un mensaje accionable.
async function mensajeRtnDuplicado(supabase: SupabaseServerClient, rtn: string): Promise<string> {
  const { data } = await supabase.from('clientes').select('nombre').eq('rtn', rtn).maybeSingle()
  return `El RTN ya pertenece a "${data?.nombre ?? 'otro cliente'}"`
}

function esRtnDuplicado(error: { code?: string; message: string }): boolean {
  return error.code === '23505' && error.message.includes('clientes_rtn_unico')
}

export async function createCliente(form: ClienteForm): Promise<ActionResult> {
  if (!form.nombre.trim()) return { error: 'El nombre es requerido' }
  const rtn = form.rtn.trim()
  if (rtn) {
    const rtnError = validarRtn(rtn)
    if (rtnError) return { error: rtnError }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('clientes').insert(toPayload(form))
  if (error) {
    if (esRtnDuplicado(error)) return { error: await mensajeRtnDuplicado(supabase, rtn) }
    return { error: error.message }
  }

  revalidatePath('/admin/clientes')
  return {}
}

export async function updateCliente(id: string, form: ClienteForm): Promise<ActionResult> {
  if (!form.nombre.trim()) return { error: 'El nombre es requerido' }
  const rtn = form.rtn.trim()
  if (rtn) {
    const rtnError = validarRtn(rtn)
    if (rtnError) return { error: rtnError }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update(toPayload(form)).eq('id', id)
  if (error) {
    if (esRtnDuplicado(error)) return { error: await mensajeRtnDuplicado(supabase, rtn) }
    return { error: error.message }
  }

  revalidatePath('/admin/clientes')
  return {}
}

export async function toggleClienteActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').update({ activo }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/clientes')
  return {}
}

// P1 no tiene documentos de venta que referencien clientes todavía (llegan en
// P2), así que eliminar es seguro; el guard de "no eliminar si tiene ventas"
// se agrega ahí. Mientras tanto, "Desactivar" es la acción primaria en la UI.
export async function deleteCliente(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('clientes').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/clientes')
  return {}
}
