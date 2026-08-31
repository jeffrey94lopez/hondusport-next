import type { CSSProperties } from 'react'
import Image from 'next/image'
import styles from './ProductImage.module.css'

/* next/image revienta la consola cuando el src es '' o undefined
   ("An empty string was passed to the src attribute" / "Image is missing
   required src property"), y hay productos sin foto en la BD. Este componente
   centraliza la guarda: con src pinta el <Image>, sin src pinta un placeholder
   del mismo tamaño para que no quede un hueco en blanco. */

type ProductImageProps = {
  src: string | null | undefined
  alt: string
  className?: string
  priority?: boolean
  /* Solo aplica a la imagen real (p. ej. el zoom del detalle); el placeholder
     no se transforma. */
  style?: CSSProperties
} & (
  | { fill: true; sizes: string; width?: never; height?: never }
  | { fill?: false; width: number; height: number; sizes?: never }
)

export default function ProductImage(props: ProductImageProps) {
  const { src, alt, className, priority, style } = props

  if (src) {
    return props.fill ? (
      <Image src={src} alt={alt} className={className} priority={priority} style={style} fill sizes={props.sizes} />
    ) : (
      <Image
        src={src}
        alt={alt}
        className={className}
        priority={priority}
        style={style}
        width={props.width}
        height={props.height}
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={`${alt} — sin imagen`}
      className={`${styles.placeholder} ${props.fill ? styles.placeholderFill : ''} ${className ?? ''}`}
      style={props.fill ? undefined : { width: props.width, height: props.height }}
    >
      <i className={`fa-regular fa-image ${styles.icon}`} />
    </div>
  )
}
