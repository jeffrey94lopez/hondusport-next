export function toggleWishlist(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
}
