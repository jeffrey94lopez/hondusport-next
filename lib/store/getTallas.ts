import type { StoreProducto, Categoria } from '@/types/store'

export function getTallas(producto: StoreProducto, tallaFiltros: Categoria[]): string[] {
  if (producto.tallas.length > 0) return producto.tallas

  return tallaFiltros
    .filter(filtro => (filtro.categorias_padre ?? []).includes(producto.catId))
    .map(filtro => filtro.valor)
}
