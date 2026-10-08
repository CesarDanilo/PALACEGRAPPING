import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRightIcon, ChatIcon, MedalIcon, ShieldIcon, TruckIcon } from '@/components/icons';
import styles from './store.module.css';

/** Título de seção: display condensada + seta, link "ver tudo" à direita. */
export function SectionHeader({ id, title, eyebrow, to, linkLabel = 'Ver tudo' }: { id: string; title: string; eyebrow?: string; to?: string; linkLabel?: string }) {
  return (
    <header className={styles.sectionHeader}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={id} className={styles.sectionTitle}>
          {title} <ArrowRightIcon size={28} className={styles.sectionArrow} />
        </h2>
      </div>
      {to ? (
        <Link to={to} className={styles.viewAll}>
          {linkLabel} <ArrowRightIcon size={14} />
        </Link>
      ) : null}
    </header>
  );
}

/** Faixa de benefícios entre divisores finos, separados por "+". Rola no mobile. */
export function BenefitsStrip({ freeShippingLabel }: { freeShippingLabel: string | null }) {
  const items: { icon: ReactNode; label: string }[] = [
    { icon: <MedalIcon size={18} />, label: 'Qualidade de competição' },
    { icon: <TruckIcon size={18} />, label: freeShippingLabel ?? 'Entrega para todo o Brasil' },
    { icon: <ChatIcon size={18} />, label: 'Atendimento de quem treina' },
    { icon: <ShieldIcon size={18} />, label: 'Compra segura' },
  ];
  return (
    <section aria-label="Benefícios" className={styles.benefits}>
      <ul className={`container ${styles.benefitsList}`}>
        {items.map((item) => (
          <li key={item.label}>
            {item.icon}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function remaining(target: number) {
  const ms = Math.max(0, target - Date.now());
  return { d: Math.floor(ms / 86_400_000), h: Math.floor(ms / 3_600_000) % 24, m: Math.floor(ms / 60_000) % 60, s: Math.floor(ms / 1000) % 60, done: ms === 0 };
}

/** Contagem regressiva real até o fim de uma campanha (só existe se o catálogo tiver data de fim). */
export function Countdown({ endsAt }: { endsAt: string }) {
  const target = new Date(endsAt).getTime();
  const [left, setLeft] = useState(() => remaining(target));
  useEffect(() => {
    const t = setInterval(() => setLeft(remaining(target)), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (left.done) return <p className={styles.countdownDone}>Campanha encerrada</p>;
  const parts = [
    [left.d, 'dias'],
    [left.h, 'horas'],
    [left.m, 'min'],
    [left.s, 'seg'],
  ] as const;
  return (
    <div className={styles.countdown}>
      <span className="visually-hidden">
        Termina em {left.d} dias, {left.h} horas e {left.m} minutos
      </span>
      <ol aria-hidden="true">
        {parts.map(([value, label]) => (
          <li key={label}>
            <strong>{String(value).padStart(2, '0')}</strong>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Rótulo vertical das referências editoriais (decorativo). */
export function VerticalLabel({ children }: { children: ReactNode }) {
  return (
    <span className={styles.vertical} aria-hidden="true">
      {children}
    </span>
  );
}
