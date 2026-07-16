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
  activo: boolean
  rating: number
  created_at: string
  updated_at: string
  categorias?: { valor: string } | null
  subcategorias?: { valor: string } | null
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
  activo: boolean
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
}
