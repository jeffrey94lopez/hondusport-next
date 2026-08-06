import type { EstadoPedido } from '@/types'

// Colores de estado de pedido (valores Merlin *-150; ver spec de diseño)
export const ESTADO_COLOR: Record<EstadoPedido, string> = {
  recibido: '#0a53a5',    // --info
  preparando: '#a16b00',  // --warning
  enviado: '#227ad1',     // --info-strong
  entregado: '#1b8959',   // --success
  cancelado: '#910022',   // --error
}
