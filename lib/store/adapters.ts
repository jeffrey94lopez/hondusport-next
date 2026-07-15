import type { Producto, ConfigEntry, ConfigMap } from '@/types'
import type { StoreProducto } from '@/types/store'

export function toConfigMap(rows: ConfigEntry[]): ConfigMap {
  return Object.fromEntries(rows.map(r => [r.key, r.value ?? '']))
}

export function toStoreProducto(p: Producto): StoreProducto {
  return {
    id: p.id,
    nombre: p.nombre,
    slug: p.slug,
    descripcion: p.descripcion ?? '',
    precio: Number(p.precio),
    precioOriginal: p.precio_original != null ? Number(p.precio_original) : null,
    cat: p.categorias?.valor ?? '',
    catId: p.categoria_id ?? '',
    subcat: p.subcategorias?.valor ?? null,
    subcatId: p.subcategoria_id ?? null,
    genero: p.genero,
    badge: p.badge,
    tallas: p.tallas ?? [],
    imagenes: (p.imagenes ?? []).filter(Boolean),
    stock: p.stock,
    rating: p.rating ?? 5,
    ofertaFin: p.oferta_fin,
    personalizable: p.personalizable,
  }
}
