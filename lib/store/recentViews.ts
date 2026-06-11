export const MAX_RECENT_VIEWS = 6

export function addRecentView(ids: string[], id: string): string[] {
  return [id, ...ids.filter(existing => existing !== id)].slice(0, MAX_RECENT_VIEWS)
}
