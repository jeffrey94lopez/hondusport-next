'use client'
import styles from './SizeGuideModal.module.css'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface SizeGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SizeGuideModal({ isOpen, onClose }: SizeGuideModalProps) {
  useEscapeKey(isOpen, onClose)

  return (
    <>
      <div className={`${styles.overlay} ${isOpen ? styles.overlayActive : ''}`} onClick={onClose} />
      <div className={`${styles.modal} ${isOpen ? styles.modalActive : ''}`} role="dialog" aria-label="Guía de tallas">
        <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <h2 className={styles.heading}>GUÍA DE TALLAS</h2>

        <div className={styles.tableSection}>
          <h4>ROPA DEPORTIVA</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Talla</th>
                <th>Pecho (cm)</th>
                <th>Largo (cm)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>S</td>
                <td>96-104</td>
                <td>69-71</td>
              </tr>
              <tr>
                <td>M</td>
                <td>104-112</td>
                <td>71-73</td>
              </tr>
              <tr>
                <td>L</td>
                <td>112-124</td>
                <td>73-75</td>
              </tr>
              <tr>
                <td>XL</td>
                <td>124-136</td>
                <td>75-77</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={styles.tableSection}>
          <h4>ZAPATILLAS (EUR)</h4>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>EUR</th>
                <th>US Men</th>
                <th>CM</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>40</td>
                <td>7</td>
                <td>25</td>
              </tr>
              <tr>
                <td>41</td>
                <td>8</td>
                <td>26</td>
              </tr>
              <tr>
                <td>42</td>
                <td>8.5</td>
                <td>26.5</td>
              </tr>
              <tr>
                <td>43</td>
                <td>9.5</td>
                <td>27.5</td>
              </tr>
              <tr>
                <td>44</td>
                <td>10</td>
                <td>28</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className={styles.note}>* Las medidas son aproximadas.</p>
      </div>
    </>
  )
}
