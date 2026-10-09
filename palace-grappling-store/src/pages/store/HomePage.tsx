import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { BeltBar, CircleBadge, Slashes } from '@/brand/Brand';
import { ArrowDownIcon, ArrowRightIcon, ArrowUpRightIcon } from '@/components/icons';
import { Media, ProductImage } from '@/components/media/Media';
import { ProductGrid, ProductGridSkeleton } from '@/components/store/ProductCard';
import { Price } from '@/components/store/Price';
import { BenefitsStrip, Countdown, SectionHeader, VerticalLabel } from '@/components/store/Sections';
import { Alert } from '@/components/ui/Feedback';
import { media } from '@/content/media';
import { storefrontApi, storefrontKeys } from '@/lib/api/storefront';
import { formatMoney } from '@/lib/money';
import styles from './home.module.css';
import { brand } from '@/config/env';

const pillars = [
  { title: 'Força', text: 'Tecidos pesados e costuras que aguentam pegada, raspagem e rotina de seis treinos por semana.' },
  { title: 'Performance', text: 'Modelagem que acompanha a guarda: nada sobra, nada prende, nada distrai.' },
  { title: 'Disciplina', text: 'Peças pensadas para o treino de todo dia, não só para o dia da luta.' },
  { title: 'Exclusividade', text: 'Lançamentos em lotes curtos e seleções enviadas por convite.' },
];

export function HomePage() {
  const newest = useQuery({ queryKey: storefrontKeys.products({ sort: 'newest', pageSize: 4 }), queryFn: () => storefrontApi.products({ sort: 'newest', pageSize: 4 }) });
  const featured = useQuery({ queryKey: storefrontKeys.products({ featured: true, pageSize: 8 }), queryFn: () => storefrontApi.products({ featured: true, pageSize: 8 }) });
  const categories = useQuery({ queryKey: storefrontKeys.categories, queryFn: storefrontApi.categories });
  const catalogs = useQuery({ queryKey: storefrontKeys.catalogs, queryFn: storefrontApi.catalogs });
  const store = useQuery({ queryKey: storefrontKeys.store, queryFn: storefrontApi.store, staleTime: 5 * 60_000 });

  const drop = newest.data?.items[0];
  const campaign =
    catalogs.data?.items.find((c) => c.type === 'CAMPAIGN' && c.endsAt) ??
    catalogs.data?.items.find((c) => c.type === 'CAMPAIGN') ??
    catalogs.data?.items.find((c) => c.type === 'COLLECTION');
  const freeAbove = store.data?.shipping.mode === 'FLAT_RATE' && store.data.shipping.freeShippingThreshold;
  const freeShippingLabel =
    store.data?.shipping.mode === 'FREE' ? 'Frete grátis' : freeAbove ? `Frete grátis acima de ${formatMoney(freeAbove)}` : null;

  return (
    <>
      {/* 1. Hero */}
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={`container ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <h1 id="hero-title" className={styles.heroTitle}>
              Disciplina <br />
              vestida<span className={styles.dot}>.</span>
            </h1>
            <p className={styles.heroLead}>Kimonos, rash guards e shorts feitos para aguentar o treino de todo dia e brilhar no dia da luta.</p>
            <div className={styles.heroActions}>
              <Link to="/loja" className={styles.ctaPrimary}>
                Comprar agora <ArrowRightIcon size={18} />
              </Link>
              <Link to="/loja?ordem=newest" className={styles.ctaGhost}>
                Lançamentos
              </Link>
            </div>
            <a href="#lancamentos" className={styles.scroll}>
              <ArrowDownIcon size={14} /> Role
            </a>
          </div>
          <div className={styles.heroMedia}>
            <Media slot={media.hero} className={styles.heroImage} eager />
            <VerticalLabel>{`${brand.name} / Est. ${brand.since}`}</VerticalLabel>
            {drop ? (
              <Link to={`/produto/${drop.slug}`} className={styles.dropCard}>
                <ProductImage product={drop} className={styles.dropThumb} />
                <span className={styles.dropText}>
                  <span className="label">Novo drop</span>
                  <strong>{drop.name}</strong>
                  <Price min={drop.priceRange.min} />
                </span>
                <span className={styles.dropPlus} aria-hidden="true">
                  <ArrowUpRightIcon size={16} />
                </span>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* 2. Benefícios */}
      <BenefitsStrip freeShippingLabel={freeShippingLabel || null} />

      {/* 3. Lançamentos */}
      <section id="lancamentos" className={`container ${styles.section}`} aria-labelledby="novos">
        <SectionHeader id="novos" title="Lançamentos" to="/loja?ordem=newest" />
        {newest.isPending ? <ProductGridSkeleton /> : newest.isError ? <Alert tone="danger">Não foi possível carregar os lançamentos.</Alert> : <ProductGrid products={newest.data.items} />}
      </section>

      {/* 4. Gi e No-Gi */}
      <section className={`container ${styles.lines}`} aria-label="Linhas Gi e No-Gi">
        {[
          { to: '/loja?linha=gi', title: 'Gi', slot: media.gi, text: 'Kimonos trançados, faixas e tudo que vai com a gola.' },
          { to: '/loja?linha=no-gi', title: 'No-Gi', slot: media.noGi, text: 'Rash guards, shorts e spats para o jogo sem pano.' },
        ].map((line) => (
          <Link key={line.title} to={line.to} className={styles.lineTile}>
            <Media slot={line.slot} className={styles.lineImage} />
            <span className={styles.lineCopy}>
              <span className={styles.lineTitle}>{line.title}</span>
              <span className={styles.lineText}>{line.text}</span>
            </span>
            <span className={styles.lineArrow} aria-hidden="true">
              <ArrowUpRightIcon size={22} />
            </span>
          </Link>
        ))}
      </section>

      {/* Categorias numeradas + colagem */}
      {categories.data?.items.length ? (
        <section className={`container ${styles.explore}`} aria-labelledby="explore">
          <nav aria-label="Categorias" className={styles.catList}>
            <ol>
              {categories.data.items.map((c) => (
                <li key={c.id}>
                  <Link to={`/categoria/${c.slug}`}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <h2 id="explore" className={styles.exploreTitle}>
            Explore <br />o tatame
            <span className={styles.underline} aria-hidden="true" />
          </h2>
          <div className={styles.collage}>
            <Media slot={media.culture1} className={styles.collageMain} />
            <Media slot={media.culture2} className={styles.collageSmall} />
            <span className={styles.collageCode} aria-hidden="true">
              PG—BJJ—026 <Slashes />
            </span>
          </div>
        </section>
      ) : null}

      {/* 5. Banner editorial de campanha/coleção */}
      {campaign ? (
        <section className={styles.campaign} aria-labelledby="campanha">
          <div className={`container ${styles.campaignInner}`}>
            <div className={styles.campaignCopy}>
              <h2 id="campanha" className={styles.campaignTitle}>
                {campaign.name}
              </h2>
              {campaign.description ? <p className={styles.campaignText}>{campaign.description}</p> : null}
              {campaign.type === 'CAMPAIGN' ? <p className={styles.campaignMeta}>Edição limitada{campaign.endsAt ? ', termina em' : ''}</p> : null}
              {campaign.endsAt ? <Countdown endsAt={campaign.endsAt} /> : null}
              <Link to={`/catalogo/${campaign.slug}`} className={styles.ctaPrimary}>
                Ver seleção <ArrowRightIcon size={18} />
              </Link>
            </div>
            <div className={styles.campaignMedia}>
              {campaign.heroImageUrl ? <img src={campaign.heroImageUrl} alt={campaign.name} loading="lazy" /> : <Media slot={media.heroDrop} />}
              <span className={styles.campaignBadge}>
                <CircleBadge text={campaign.type === 'CAMPAIGN' ? 'Edição limitada' : `Coleção ${brand.short}`} tone="paper" />
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {/* 6. Destaques */}
      <section className={`container ${styles.section}`} aria-labelledby="destaques">
        <SectionHeader id="destaques" title="Em destaque" to="/loja" />
        {featured.isPending ? (
          <ProductGridSkeleton count={8} />
        ) : featured.isError ? (
          <Alert tone="danger">Não foi possível carregar os destaques.</Alert>
        ) : (
          <ProductGrid products={featured.data.items} />
        )}
      </section>

      {/* 7. Identidade da marca (manifesto) */}
      <section className={styles.manifesto} aria-labelledby="manifesto">
        <div className={`container ${styles.manifestoInner}`}>
          <VerticalLabel>O que nos move</VerticalLabel>
          <div>
            <h2 id="manifesto" className={styles.manifestoTitle}>
              Não existe atalho <br />
              para a <mark>faixa preta</mark>
              <span className={styles.dotDark}>.</span>
            </h2>
            <ol className={styles.pillars}>
              {pillars.map((p) => (
                <li key={p.title}>
                  <strong>{p.title}</strong>
                  <p>{p.text}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className={styles.manifestoMedia}>
            <Media slot={media.manifesto} tone="paper" />
            <span className={styles.manifestoBadge}>
              <CircleBadge text={`${brand.name} · Oss`} />
            </span>
          </div>
        </div>
        <BeltBar />
      </section>

      {/* 8. Inspiração */}
      <section className={`container ${styles.section}`} aria-labelledby="inspiracao">
        <SectionHeader id="inspiracao" title="No tatame" to="/colecoes" linkLabel="Ver coleções" />
        <ul className={styles.inspiration}>
          {media.inspiration.map((slot) => (
            <li key={slot.alt}>
              <Media slot={slot} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
