'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { ActionResult, MetodoPagoTipo } from '@/types'

export interface CajaForm {
  nombre: string
  punto_emision: string
  formato_impresion: '80mm' | 'carta'
  activo: boolean
}

export interface VendedorForm {
  nombre: string
  activo: boolean
}

export interface MetodoPagoForm {
  nombre: string
  tipo: MetodoPagoTipo
  orden: number
  activo: boolean
}

function mensajeError(error: { code?: string; message: string }): string {
  return error.message
}

// ---------- Cajas ----------

function validarCajaForm(form: CajaForm): string | null {
  if (!form.nombre.trim()) return 'El nombre es requerido'
  if (!/^[0-9]{3}$/.test(form.punto_emision)) return 'El punto de emisión debe tener 3 dígitos'
  return null
}

export async function createCaja(form: CajaForm): Promise<ActionResult> {
  const formError = validarCajaForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('cajas').insert({
    nombre: form.nombre.trim(),
    punto_emision: form.punto_emision,
    formato_impresion: form.formato_impresion,
    activo: form.activo,
  })
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

export async function updateCaja(id: string, form: CajaForm): Promise<ActionResult> {
  const formError = validarCajaForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('cajas').update({
    nombre: form.nombre.trim(),
    punto_emision: form.punto_emision,
    formato_impresion: form.formato_impresion,
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

export async function toggleCajaActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('cajas').update({ activo }).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

// ---------- Vendedores ----------

function validarVendedorForm(form: VendedorForm): string | null {
  if (!form.nombre.trim()) return 'El nombre es requerido'
  return null
}

export async function createVendedor(form: VendedorForm): Promise<ActionResult> {
  const formError = validarVendedorForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('vendedores').insert({
    nombre: form.nombre.trim(),
    activo: form.activo,
  })
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

export async function updateVendedor(id: string, form: VendedorForm): Promise<ActionResult> {
  const formError = validarVendedorForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('vendedores').update({
    nombre: form.nombre.trim(),
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

export async function toggleVendedorActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('vendedores').update({ activo }).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

// ---------- Métodos de pago ----------

const TIPOS_METODO_PAGO: MetodoPagoTipo[] = ['efectivo_lps', 'efectivo_usd', 'tarjeta', 'transferencia', 'otro']

function validarMetodoPagoForm(form: MetodoPagoForm): string | null {
  if (!form.nombre.trim()) return 'El nombre es requerido'
  if (!TIPOS_METODO_PAGO.includes(form.tipo)) return 'El tipo de método de pago no es válido'
  if (!Number.isFinite(form.orden) || form.orden < 0) return 'El orden debe ser un número mayor o igual a 0'
  return null
}

export async function createMetodoPago(form: MetodoPagoForm): Promise<ActionResult> {
  const formError = validarMetodoPagoForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('metodos_pago').insert({
    nombre: form.nombre.trim(),
    tipo: form.tipo,
    orden: form.orden,
    activo: form.activo,
  })
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

// El tipo de un método de pago (efectivo/tarjeta/transferencia/otro) determina
// cómo se calcula el vuelto y el desglose en caja: cambiarlo en un método ya
// usado en documento_pagos dejaría pagos históricos con un tipo distinto al
// que tenían al emitirse. Los métodos sembrados (Efectivo L., Tarjeta,
// Transferencia / Depósito, Efectivo USD) nunca cambian de tipo; por
// simplicidad y seguridad la regla se aplica a TODOS los métodos: el tipo se
// fija al crear y updateMetodoPago lo ignora aunque el formulario lo envíe.
export async function updateMetodoPago(id: string, form: MetodoPagoForm): Promise<ActionResult> {
  const formError = validarMetodoPagoForm(form)
  if (formError) return { error: formError }

  const supabase = await createClient()
  const { error } = await supabase.from('metodos_pago').update({
    nombre: form.nombre.trim(),
    orden: form.orden,
    activo: form.activo,
  }).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}

export async function toggleMetodoPagoActivo(id: string, activo: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('metodos_pago').update({ activo }).eq('id', id)
  if (error) return { error: mensajeError(error) }

  revalidatePath('/admin/configuracion')
  return {}
}
