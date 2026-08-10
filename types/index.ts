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
  es_cliente: boolean
  es_proveedor: boolean
  contacto: string | null
  dias_credito: number
  limite_credito: number | null
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
  es_cliente: boolean
  es_proveedor: boolean
  contacto: string
  dias_credito: number
  // Opcional en el form (solo lo captura el módulo de clientes): texto crudo,
  // vacío = sin límite (null). Los otros formularios que arman un ClienteForm
  // (POS, proveedores en compras) lo omiten y persisten null.
  limite_credito?: string
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
  favorito_pos: boolean
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

export type MetodoPagoTipo = 'efectivo_lps' | 'efectivo_usd' | 'tarjeta' | 'transferencia' | 'otro' | 'credito' | 'saldo_favor'

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

// Documentos: factura, comprobante, nota de crédito o devolución (espejo 1:1
// de la tabla documentos). nota_credito/devolucion (POS P5a) llevan
// `documento_origen_id` apuntando a la factura/comprobante que devuelven —
// null en los documentos originales.
export interface Documento {
  id: string
  tipo: 'factura' | 'comprobante' | 'nota_credito' | 'devolucion'
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
  documento_origen_id: string | null
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

// Pago de documento con el nombre/tipo de método ya resuelto (join a
// metodos_pago). Lo consume DocumentoHoja (papel imprimible, Task 11); dos
// fuentes lo producen de forma independiente con el mismo mapeo — cada una
// hace su propio fetch (documento/[id]/page.tsx y la server action
// obtenerDocumento para el modal) — a propósito, ver nota de esa tarea sobre
// no compartir estado de servidor entre la página y el modal.
export interface DocumentoPagoConMetodo extends DocumentoPago {
  metodo_nombre: string
  metodo_tipo: MetodoPagoTipo
}

// Ventas en espera (para pausar y reanudar transacciones)
export interface VentaEspera {
  id: string
  caja_id: string
  nombre: string
  payload: unknown
  created_at: string
}

// POS P3: Cotizaciones CRM
export type CotizacionEtapaTipo = 'abierta' | 'ganada' | 'perdida'

export interface CotizacionEtapa {
  id: string
  nombre: string
  tipo: CotizacionEtapaTipo
  color: string
  orden: number
  activo: boolean
}

export interface CotizacionItem {
  id: string
  cotizacion_id: string
  producto_id: string | null
  variante_id: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  isv: IsvTipo
  precio_manual: boolean
  orden: number
}

export interface Cotizacion {
  id: string
  numero: string
  etapa_id: string
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_rtn: string | null
  vendedor_id: string | null
  descuento_global: number
  validez_dias: number
  valido_hasta: string
  condiciones: string | null
  notas: string | null
  total: number
  documento_id: string | null
  created_at: string
  updated_at: string
}

// Cotización con sus líneas y relaciones resueltas (para editor y PDF)
export interface CotizacionConDatos extends Cotizacion {
  items: CotizacionItem[]
  etapa: CotizacionEtapa | null
}

export interface EtapaForm {
  nombre: string
  tipo: CotizacionEtapaTipo
  color: string
}

// POS P4a: Compras y proveedores
export type CompraEstado = 'borrador' | 'ordenada' | 'parcial' | 'recibida' | 'anulada'
export type CompraMoneda = 'L' | 'USD'
export type CondicionPago = 'contado' | 'credito'

export interface CompraItem {
  id: string
  compra_id: string
  producto_id: string
  variante_id: string | null
  descripcion: string
  cantidad_ordenada: number
  cantidad_recibida: number
  costo_unitario: number
  orden: number
}

export interface Compra {
  id: string
  numero: string
  proveedor_id: string
  estado: CompraEstado
  moneda: CompraMoneda
  tasa_cambio: number | null
  factura_proveedor: string | null
  condicion_pago: CondicionPago
  dias_credito: number
  fecha: string
  fecha_vencimiento: string | null
  notas: string | null
  total: number
  anulado_motivo: string | null
  created_at: string
  updated_at: string
}

export interface CompraConDatos extends Compra {
  items: CompraItem[]
  proveedor: Cliente | null   // el proveedor es un Cliente con es_proveedor=true
}

// Línea sugerida de reorden (producto o variante bajo mínimo)
export interface ReordenLinea {
  producto_id: string
  variante_id: string | null
  descripcion: string
  stock: number
  stock_minimo: number
  cantidad_sugerida: number
  costo: number | null
}

// POS P4b: Cuentas por pagar
export type PagoMetodo = 'efectivo' | 'transferencia' | 'cheque' | 'otro'
export type EstadoPago = 'pagada' | 'parcial' | 'pendiente' | 'vencida'
export type BucketAntiguedad = 'por_vencer' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_mas'

export interface PagoProveedor {
  id: string
  numero: string
  proveedor_id: string
  fecha: string
  monto: number
  metodo: PagoMetodo
  referencia: string | null
  notas: string | null
  usuario: string | null
  created_at: string
}

export interface PagoAplicacion {
  id: string
  pago_id: string
  compra_id: string
  monto: number
}

// Fila de la vista compra_saldos
export interface CompraSaldo {
  compra_id: string
  proveedor_id: string
  numero: string
  fecha: string
  fecha_vencimiento: string | null
  total: number
  pagado: number
  saldo: number
}

// Fila del tablero de CxP (saldo + datos derivados + nombre del proveedor)
export interface CxpFila extends CompraSaldo {
  proveedor_nombre: string
  estado: EstadoPago
  bucket: BucketAntiguedad
  dias_vencido: number
}

// POS P4c: Cuentas por cobrar
export type CobroMetodo = 'efectivo' | 'transferencia' | 'tarjeta' | 'cheque' | 'otro'

export interface Cobro {
  id: string
  numero: string
  cliente_id: string
  fecha: string
  monto: number
  metodo: CobroMetodo
  referencia: string | null
  notas: string | null
  sesion_id: string | null
  usuario: string | null
  created_at: string
}

export interface CobroAplicacion {
  id: string
  cobro_id: string
  documento_id: string
  monto: number
}

// Fila de la vista documento_saldos
export interface DocumentoSaldo {
  documento_id: string
  cliente_id: string
  cliente_nombre: string
  tipo: 'factura' | 'comprobante'
  correlativo: string | null
  numero_comprobante: number | null
  fecha: string
  fecha_vencimiento: string
  credito_total: number
  cobrado: number
  // POS P5a: suma de reembolsos tipo 'cxc' de devoluciones no anuladas del
  // documento (ya restada en `saldo` por la vista, ver 2026-08-09-pos-p5a-devoluciones.sql).
  nc_cxc: number
  saldo: number
}

// Fila del tablero de CxC (saldo + derivados)
export interface CxcFila extends DocumentoSaldo {
  estado: EstadoPago
  bucket: BucketAntiguedad
  dias_vencido: number
}

// POS P4d: Inventario físico / Conteos
export type EstadoConteo = 'en_conteo' | 'aplicada' | 'anulada'
export type AlcanceTipo = 'todo' | 'categoria' | 'subcategoria' | 'seleccion'

export interface ConteoFisico {
  id: string
  numero: string
  estado: EstadoConteo
  alcance_tipo: AlcanceTipo
  alcance_ref: string | null
  descripcion: string | null
  notas: string | null
  usuario: string | null
  created_at: string
  aplicada_at: string | null
}

export interface ConteoLinea {
  id: string
  conteo_id: string
  producto_id: string
  variante_id: string | null
  sku: string | null
  nombre: string
  stock_snapshot: number
  contado: number | null
  stock_al_aplicar: number | null
  ajuste: number | null
  aplicada: boolean
  aviso_movimiento: boolean
}

// POS P5a: Devoluciones y notas de crédito
export type ReembolsoTipo = 'efectivo' | 'saldo_favor' | 'cxc'

export interface ReembolsoDevolucion {
  tipo: ReembolsoTipo
  monto: number
  metodo_id?: string | null
}

// Fila de nota_credito_reembolsos (espejo 1:1 de la tabla) — el reembolso ya
// persistido de una NC/devolución (Task 5: la hoja imprimible lo consume
// para la sección "Reembolso").
export interface NotaCreditoReembolso {
  id: string
  documento_id: string
  tipo: ReembolsoTipo
  metodo_id: string | null
  monto: number
}

// Fila de documento_items del documento original (lo que se puede devolver)
export interface LineaOriginalDoc {
  id: string
  producto_id: string | null
  variante_id: string | null
  descripcion: string
  cantidad: number
  precio_unitario: number
  descuento: number
  isv: '15' | '18' | 'exento'
  importe: number
  base: number
  isv_monto: number
  ya_devuelto: number
}

export interface SaldoFavorMovimiento {
  id: string
  cliente_id: string
  monto: number
  tipo: 'devolucion' | 'venta' | 'cobro'
  documento_id: string | null
  cobro_id: string | null
  notas: string | null
  usuario: string | null
  created_at: string
}

// Fila de la vista saldo_favor_clientes (saldo_favor_movimientos agrupado
// por cliente). Solo lectura en /admin/clientes (Task 6, P5a); el gasto del
// saldo a favor es P5b.
export interface SaldoFavorCliente {
  cliente_id: string
  saldo: number
}

// Visor de Kardex (POS P5b)
export type MovimientoTipo =
  | 'entrada' | 'ajuste' | 'venta_web' | 'reposicion_cancelacion'
  | 'venta_pos' | 'devolucion' | 'compra' | 'inicial' | 'conteo'

export interface MovimientoInventario {
  id: string
  producto_id: string
  variante_id: string | null
  tipo: MovimientoTipo
  cantidad: number
  costo_unitario: number | null
  costo_resultante: number | null
  referencia: string | null
  usuario: string | null
  notas: string | null
  created_at: string
}

export interface MovimientoResuelto extends MovimientoInventario {
  producto_nombre: string
  variante_nombre: string | null
  sku: string | null
  ref_etiqueta: string
  ref_href: string | null
  saldo: number | null
}

export interface FiltrosMovimientos {
  tipo: MovimientoTipo | null
  desde: string | null
  hasta: string | null
  producto: string | null
  usuario: string | null
}

export type KardexResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }
