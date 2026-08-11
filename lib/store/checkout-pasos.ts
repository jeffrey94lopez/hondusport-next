// Pasos del asistente de checkout (carrusel). `direccion` es el único paso
// condicional: solo aplica cuando el envío seleccionado es delivery; en
// pickup (o mientras no hay envío seleccionado todavía) se omite, porque no
// se pide dirección. Regla con peso -> vive aquí con test, no embebida en el
// componente (ver CLAUDE.md).
export type Paso = 'contacto' | 'envio' | 'direccion' | 'confirmar'

export function pasosActivos(tipo: 'delivery' | 'pickup' | undefined): Paso[] {
  const base: Paso[] = ['contacto', 'envio']
  if (tipo === 'delivery') base.push('direccion')
  base.push('confirmar')
  return base
}
