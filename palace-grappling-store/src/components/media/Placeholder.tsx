import { useId } from 'react';
import styles from './media.module.css';

// Ilustrações TEMPORÁRIAS usadas enquanto não existem fotografias oficiais.
// Sempre exibem o selo "Foto temporária" e nunca se passam por fotos de produto.

export type ArtKind = 'kimono' | 'rashguard' | 'shorts' | 'spats' | 'belt' | 'bag';

const shapes: Record<ArtKind, React.ReactNode> = {
  kimono: (
    <>
      <path d="M60 30 100 52 140 30 182 72 166 106 150 96v120H50V96l-16 10-16-34Z" />
      <path className={styles.line} d="m100 52-22 92M100 52l22 92M100 52v164" />
      <rect className={styles.beltShape} x="48" y="138" width="104" height="12" />
      <path className={styles.beltShape} d="m92 150-10 46h9l9-40 9 40h9l-10-46Z" />
    </>
  ),
  rashguard: (
    <>
      <path d="M70 30q30 16 60 0l45 25 20 105-23 5-22-80v130H50V85l-22 80-23-5L25 55Z" />
      <path className={styles.line} d="M70 30q30 16 60 0M50 120h100" />
      <path className={styles.accentShape} d="M150 85l22 80 7-1-25-78Z" />
    </>
  ),
  shorts: (
    <>
      <path d="M44 44h112l16 158h-60l-12-92-12 92H28Z" />
      <rect className={styles.line} x="44" y="44" width="112" height="16" />
      <path className={styles.accentShape} d="M156 60l6 58-14 0Z" />
    </>
  ),
  spats: (
    <>
      <path d="M62 28h76l-6 194h-26l-6-130-6 130H68Z" />
      <rect className={styles.line} x="62" y="28" width="76" height="12" />
      <path className={styles.accentShape} d="M130 40l-2 182h4l2-182Z" />
    </>
  ),
  belt: (
    <>
      <rect x="20" y="104" width="160" height="22" />
      <path d="m88 120-20 92h20l12-60 12 60h20l-20-92Z" />
      <rect className={styles.accentShape} x="132" y="104" width="34" height="22" />
      <path className={styles.line} d="M140 104v22M148 104v22M156 104v22" />
    </>
  ),
  bag: (
    <>
      <path d="M24 96h152v100H24Z" />
      <path className={styles.line} d="M70 96c0-40 60-40 60 0M24 126h152" />
      <rect className={styles.accentShape} x="150" y="140" width="14" height="30" />
    </>
  ),
};

export function Placeholder({ art, label, brief, tone = 'dark' }: { art: ArtKind; label: string; brief?: string; tone?: 'dark' | 'paper' }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={`${styles.placeholder} ${tone === 'paper' ? styles.paper : ''}`} role="img" aria-label={`${label} (ilustração temporária)`}>
      <svg viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice" className={styles.art} aria-hidden="true">
        <defs>
          <filter id={`grain-${id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.09 0" />
          </filter>
          <linearGradient id={`light-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="200" height="240" fill={`url(#light-${id})`} />
        <g className={styles.grid}>
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${i * 25} 240 L${100 + (i - 4) * 8} 150`} />
          ))}
          <path d="M0 200h200M0 175h200M0 160h200" />
        </g>
        <g className={styles.shape}>{shapes[art]}</g>
        <rect width="200" height="240" filter={`url(#grain-${id})`} />
      </svg>
      <span className={styles.tag}>
        Foto temporária{brief ? <span className={styles.brief}> · {brief}</span> : null}
      </span>
    </div>
  );
}
