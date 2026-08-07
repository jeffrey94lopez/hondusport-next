export interface Cliente {
  id: string
  nombre: string
  rtn: string | null
  identidad: string | null
  tipo_cliente: 'final' | 'revendedor'
  exonerado: boolean
  constancia_exonerado: string | null
  registro_sag: string | null
  direccion: string | null
  telefono: string | null
  correo: string | null
  notas: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ClienteForm {
  nombre: string
  rtn: string
  identidad: string
  tipo_cliente: 'final' | 'revendedor'
  exonerado: boolean
  constancia_exonerado: string
  registro_sag: string
  direccion: string
  telefono: string
  correo: string
  notas: string
}

export interface CaiAutorizacion {
  id: string
  cai: string
  establecimiento: string
  punto_emision: string
  tipo_documento: string
  rango_desde: number
  rango_hasta: number
  correlativo_actual: number
  fecha_limite: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface CaiForm {
  cai: string
  establecimiento: string
  punto_emision: string
  tipo_documento: string
  rango_desde: number
  rango_hasta: number
  fecha_limite: string
  activo: boolean
}

export interface Categoria {
  id: string
  tipo: 'cat' | 'subcat' | 'talla' | 'genero'
  valor: string
  imagen: string | null
  slug: string
  categorias_padre: string[] | null
  orden: number
  activo: boolean
}

export interface Producto {
  id: string
  nombre: string
  slug: string
  descripcion: string | null
  precio: number
  precio_original: number | null
  categoria_id: string | null
  subcategoria_id: string | null
  stock: number | null
  genero: string | null
  badge: string | null
  tallas: string[] | null
  colores: string[] | null
  imagenes: string[] | null
  marca: string | null
  sku: string | null
  personalizable: boolean
  oferta_fin: string | null
  canal: 'tienda' | 'mostrador' | 'ambas'
  isv: '15' | '18' | 'exento'
  costo: number | null
  precio_revendedor: number | null
  stock_minimo: number | null
  activo: boolean
  rating: number
  created_at: string
  updated_at: string
  categorias?: { valor: string } | null
  subcategorias?: { valor: string } | null
  producto_variantes?: ProductoVariante[]
}

export interface ProductoVariante {
  id: string
  producto_id: string
  nombre: string
  sku: string | null
  precio: number | null   // null = hereda productos.precio
  stock: number | null    // null = ilimitado
  costo: number | null    // null = hereda producto.costo
  precio_revendedor: number | null  // null = hereda producto.precio_revendedor
  activo: boolean
  orden: number
  created_at: string
  updated_at: string
}

export interface VarianteForm {
  id?: string
  nombre: string
  sku: string
  precio: number | null
  stock: number | null
  costo: number | null
  precio_revendedor: number | null
  activo: boolean
  // Costo de la entrada cuando `stock` sube respecto al valor guardado en BD
  // (kardexable vía registrar_entrada). No se persiste como campo propio.
  costoEntrada: number | null
}

export interface ProductoForm {
  nombre: string
  slug: string
  descripcion: string
  precio: number
  precio_original: number | null
  categoria_id: string | null
  subcategoria_id: string | null
  stock: number | null
  genero: string
  badge: string
  tallas: string
  colores: string
  marca: string
  sku: string
  imagenes: string[]
  personalizable: boolean
  canal: 'tienda' | 'mostrador' | 'ambas'
  isv: '15' | '18' | 'exento'
  costo: number | null
  precio_revendedor: number | null
  stock_minimo: number | null
  activo: boolean
  variantes: VarianteForm[]
  // Costo de la entrada cuando `stock` sube respecto al valor guardado en BD
  // (kardexable vía registrar_entrada). No se persiste como campo propio.
  costoEntrada: number | null
}

export type EstadoPedido = 'recibido' | 'preparando' | 'enviado' | 'entregado' | 'cancelado'

export interface Pedido {
  id: string
  numero: number
  nombre_cliente: string
  telefono: string
  ciudad: string
  envio_id: string | null
  envio_nombre: string | null
  cupon_codigo: string | null
  subtotal: number
  descuento_cupon: number
  costo_envio: number
  total: number
  estado: EstadoPedido
  notas: string | null
  created_at: string
  updated_at: string
  pedido_items?: PedidoItem[]
}

export interface PedidoItem {
  id: string
  pedido_id: string
  producto_id: string | null
  nombre_producto: string
  precio: number
  cantidad: number
  talla: string | null
  color: string | null
  variante_id: string | null
  variante_nombre: string | null
  personalizado_nombre: string | null
  personalizado_numero: string | null
  imagen_url: string | null
}

export interface Envio {
  id: string
  nombre: string
  descripcion: string | null
  tipo: 'delivery' | 'pickup'
  costo: number
  descuento: number
  activo: boolean
}

export interface Cupon {
  id: string
  codigo: string
  descuento: number
  tipo: string
  activo: boolean
  created_at: string
}

export interface Banner {
  id: string
  titulo: string | null
  subtitulo: string | null
  btn_texto: string
  btn_link: string
  imagen: string | null
  orden: number
  activo: boolean
}

export interface ConfigEntry {
  key: string
  value: string
}

export type ConfigMap = Record<string, string>

export interface ActionResult {
  error?: string
  // Aviso no bloqueante: la acción tuvo éxito pero ignoró algo (p.ej. un
  // cambio de costo directo sobre un producto que ya tiene historial).
  aviso?: string
}

// POS P2: Caja, sesiones, vendedores, métodos de pago
export interface Caja {
  id: string
  nombre: string
  punto_emision: string
  formato_impresion: '80mm' | 'carta'
  activo: boolean
  created_at: string
  updated_at: string
}

export interface SesionCaja {
  id: string
  caja_id: string
  estado: 'abierta' | 'cerrada'
  monto_inicial: number
  abierta_at: string
  cerrada_at: string | null
  monto_esperado: number | null
  monto_contado: number | null
  diferencia: number | null
  notas: string | null
  usuario: string | null
}

export interface Vendedor {
  id: string
  nombre: string
  activo: boolean
  created_at: string
  updated_at: string
}

export type MetodoPagoTipo = 'efectivo_lps' | 'efectivo_usd' | 'tarjeta' | 'transferencia' | 'otro'

export interface MetodoPago {
  id: string
  nombre: string
  tipo: MetodoPagoTipo
  activo: boolean
  orden: number
}

// Líneas de venta: composición de producto/variante, cantidad, precios y ISV
export type IsvTipo = '15' | '18' | 'exento'

export interface LineaPos {
  producto_id: string | null
  variante_id: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  isv: IsvTipo
}

export interface LineaDesglosada extends LineaPos {
  importe: number
  base: number
  isv_monto: number
}

export interface TotalesDocumento {
  total_exento: number
  total_exonerado: number
  total_gravado15: number
  total_gravado18: number
  isv15: number
  isv18: number
  descuento_total: number
  total: number
  total_letras: string
}

export interface PagoPos {
  metodo_id: string
  tipo: MetodoPagoTipo
  monto: number
  monto_usd?: number | null
  tasa?: number | null
  referencia?: string | null
}

// Forma simple de un documento + sus pagos para calcular el arqueo
// (esperadoCaja, lib/pos/emision.ts). La usan tanto cerrarSesion (server,
// app/admin/pos/actions.ts) como el resumen previo del modal de cierre en
// PosClient — ambos releen `documentos` con el mismo embed
// `documento_pagos(monto, metodos_pago(tipo))` y lo mapean a esta forma.
export interface DocumentoParaArqueo {
  estado: string
  total: number
  pagos: Array<{ tipo: MetodoPagoTipo; monto: number }>
}

// Documentos: factura o comprobante (espejo 1:1 de la tabla documentos)
export interface Documento {
  id: string
  tipo: 'factura' | 'comprobante'
  correlativo: string | null
  numero_comprobante: number | null
  cai_id: string | null
  caja_id: string
  sesion_id: string | null
  vendedor_id: string | null
  cliente_id: string | null
  cliente_nombre: string
  cliente_rtn: string | null
  cliente_identidad: string | null
  exonerado: boolean
  orden_compra_exenta: string | null
  constancia_exonerado: string | null
  registro_sag: string | null
  pedido_id: string | null
  total_exento: number
  total_exonerado: number
  total_gravado15: number
  total_gravado18: number
  isv15: number
  isv18: number
  descuento_total: number
  total: number
  total_letras: string
  tasa_usd: number | null
  estado: 'emitido' | 'anulado'
  anulado_motivo: string | null
  anulado_at: string | null
  notas: string | null
  usuario: string | null
  created_at: string
}

// Ítems de documento (espejo 1:1 de la tabla documento_items)
export interface DocumentoItem {
  id: string
  documento_id: string
  producto_id: string | null
  variante_id: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  isv: IsvTipo
  importe: number
  base: number
  isv_monto: number
}

// Pagos de documento (espejo 1:1 de la tabla documento_pagos)
export interface DocumentoPago {
  id: string
  documento_id: string
  metodo_id: string
  monto: number
  monto_usd: number | null
  tasa: number | null
  referencia: string | null
  created_at: string
}

// Ventas en espera (para pausar y reanudar transacciones)
export interface VentaEspera {
  id: string
  caja_id: string
  nombre: string
  payload: unknown
  created_at: string
}
