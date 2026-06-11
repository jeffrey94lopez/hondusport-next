export interface Review {
  author: string
  text: string
}

const VERIFIED_REVIEW: Review = {
  author: 'Cliente Verificado',
  text: 'Excelente producto, muy buena calidad y el envío fue rápido.',
}

const ANONYMOUS_REVIEW: Review = {
  author: 'Usuario Anónimo',
  text: 'Me encantó. Recomendado.',
}

const HIGH_RATING_THRESHOLD = 4

export function getReviews(rating: number): Review[] {
  return rating >= HIGH_RATING_THRESHOLD ? [VERIFIED_REVIEW, ANONYMOUS_REVIEW] : [VERIFIED_REVIEW]
}
