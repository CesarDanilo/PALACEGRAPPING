import { useId } from 'react';
import styles from './brand.module.css';
import { brand } from '@/config/env';

// Identidade original da Palace Grappling (ver docs/DIRECAO-VISUAL.md).
// Monograma: "P" geométrico chanfrado apoiado sobre uma faixa de Jiu-Jitsu;
// a ponteira da faixa, com 4 graus, é o único ponto de cor.

export function Monogram({ size = 40, title = brand.name }: { size?: number; title?: string | null }) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-labelledby={title ? id : undefined}
      aria-hidden={title ? undefined : true}
      className={styles.monogram}
    >
      {title ? <title id={id}>{title}</title> : null}
      <path fill="currentColor" fillRule="evenodd" d="M12 6h28l10 10v14l-10 10H24v4H12V6Zm12 10v14h12l4-4v-6l-4-4H24Z" />
      <rect x="6" y="50" width="34" height="8" fill="currentColor" />
      <rect x="40" y="50" width="18" height="8" fill="var(--accent)" />
      <g fill="var(--color-black)">
        <rect x="43" y="50" width="2" height="8" />
        <rect x="47" y="50" width="2" height="8" />
        <rect x="51" y="50" width="2" height="8" />
        <rect x="55" y="50" width="2" height="8" />
      </g>
    </svg>
  );
}

/** Logotipo completo: monograma + nome curto condensado + subtítulo em tracking largo (ver brand em config/env). */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className={styles.logo}>
      <Monogram size={compact ? 30 : 36} title={null} />
      <span className={styles.wordmark}>
        <span className={styles.word}>{brand.short}</span>
        {brand.subtitle ? <span className={styles.sub}>{brand.subtitle}</span> : null}
      </span>
    </span>
  );
}

/** Faixa com 4 graus: motivo gráfico recorrente (divisores, selos, estados). */
export function BeltBar({ className }: { className?: string }) {
  return (
    <span className={[styles.belt, className].filter(Boolean).join(' ')} aria-hidden="true">
      <span className={styles.beltTip}>
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

/** Selo circular com texto em volta (gira devagar; parado com prefers-reduced-motion). */
export function CircleBadge({ text, children, tone = 'dark' }: { text: string; children?: React.ReactNode; tone?: 'dark' | 'paper' }) {
  const id = useId();
  // Repete o texto até ~34 caracteres para o espaçamento ficar uniforme em volta do anel.
  const ring = `${text} · `.repeat(Math.max(1, Math.round(34 / (text.length + 3))));
  return (
    <span className={`${styles.badge} ${tone === 'paper' ? styles.badgePaper : ''}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" className={styles.badgeRing}>
        <defs>
          <path id={id} d="M60 60m-46 0a46 46 0 1 1 92 0a46 46 0 1 1 -92 0" />
        </defs>
        <text>
          {/* textLength fecha o círculo exatamente, sem sobrepor o início do texto (2πr ≈ 289). */}
          <textPath href={`#${id}`} textLength={286} lengthAdjust="spacing">{ring}</textPath>
        </text>
      </svg>
      <span className={styles.badgeCenter}>{children ?? <Monogram size={34} title={null} />}</span>
    </span>
  );
}

/** "/////" das referências editoriais. */
export function Slashes() {
  return (
    <span className={styles.slashes} aria-hidden="true">
      /////
    </span>
  );
}
