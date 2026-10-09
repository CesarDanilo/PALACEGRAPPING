import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { BeltBar, CircleBadge } from '@/brand/Brand';
import { ArrowUpRightIcon } from '@/components/icons';
import { Media } from '@/components/media/Media';
import { ListingHero, ProductListing, lineLabel, useFacets, useListingQuery } from '@/components/store/ProductListing';
import { Countdown } from '@/components/store/Sections';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { media } from '@/content/media';
import { ApiError } from '@/lib/api/client';
import { storefrontApi, storefrontKeys } from '@/lib/api/storefront';
import type { SalesContext } from '@/lib/api/types';
import styles from './pages.module.css';

export { HomePage } from './HomePage';
export { ProductPage } from './ProductPage';
export { CartPage } from './CartPage';
export { CheckoutResultPage, MyOrdersPage, OrderTrackingPage } from './OrderPages';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Não foi possível carregar agora.');

/** /loja: toda a vitrine, com busca (q), linha e demais filtros na URL. */
export function ShopPage() {
  const [params] = useSearchParams();
  const query = useListingQuery();
  const facets = useFacets();
  const categories = useQuery({ queryKey: storefrontKeys.categories, queryFn: storefrontApi.categories });
  const q = params.get('q');
  const line = params.get('linha');
  const title = q ? `Busca: ${q}` : line ? lineLabel(line) : query.sort === 'newest' ? 'Lançamentos' : 'Loja';
  return (
    <>
      <ListingHero title={title} />
      <div className="container">
        <ProductListing query={query} fetcher={storefrontApi.products} queryKey={['products', 'shop']} facets={facets.data} categories={categories.data?.items} />
      </div>
    </>
  );
}

export function CategoryPage() {
  const { slug = '' } = useParams();
  const categories = useQuery({ queryKey: storefrontKeys.categories, queryFn: storefrontApi.categories });
  const category = categories.data?.items.find((c) => c.slug === slug);
  const query = useListingQuery({ category: slug });
  const facets = useFacets();
  if (categories.isSuccess && !category) {
    return (
      <div className="container">
        <EmptyState title="Categoria não encontrada">
          <Link to="/colecoes">Ver coleções</Link>
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <ListingHero title={category?.name ?? '…'} description={category?.description} />
      <div className="container">
        <ProductListing query={query} fetcher={storefrontApi.products} queryKey={['products', 'category']} facets={facets.data} hide={['category']} />
      </div>
    </>
  );
}

/** Catálogo público compartilhável (/catalogo/:slug). */
export function CatalogPage() {
  const { slug = '' } = useParams();
  const query = useListingQuery();
  const head = useQuery({ queryKey: storefrontKeys.catalog(slug, {}), queryFn: () => storefrontApi.catalog(slug, { pageSize: 1 }), retry: false });
  const facets = useFacets(slug);
  const context: SalesContext = { kind: 'catalog', slug };
  if (head.isError) {
    return (
      <div className={`container ${styles.pad}`}>
        <Alert tone="warning" title="Catálogo indisponível">
          {errorText(head.error)} <Link to="/colecoes">Ver coleções</Link>
        </Alert>
      </div>
    );
  }
  const catalog = head.data?.catalog;
  return (
    <>
      <ListingHero title={catalog?.name ?? '…'} description={catalog?.description}>
        {catalog?.endsAt ? <Countdown endsAt={catalog.endsAt} /> : null}
      </ListingHero>
      <div className="container">
        <ProductListing
          query={query}
          fetcher={async (q) => (await storefrontApi.catalog(slug, q)).products}
          queryKey={['catalog-products', slug]}
          facets={facets.data}
          context={context}
        />
      </div>
    </>
  );
}

/** Link exclusivo (/c/:token): o token abre só a vitrine da seleção, nunca o painel. */
export function ExclusiveLinkPage() {
  const { token = '' } = useParams();
  const query = useListingQuery();
  const head = useQuery({ queryKey: storefrontKeys.link(token, {}), queryFn: () => storefrontApi.link(token, { pageSize: 1 }), retry: false });
  const context: SalesContext = { kind: 'link', token };

  if (head.isPending) return <LoadingState label="Abrindo seleção exclusiva…" />;
  if (head.isError) {
    return (
      <section className={styles.linkGate}>
        <div className={`container ${styles.linkGateInner}`}>
          <CircleBadge text="Acesso exclusivo · Palace Grappling" />
          <h1 className={styles.linkTitle}>
            Link indisponível<span className={styles.dot}>.</span>
          </h1>
          <p>{errorText(head.error)}</p>
          <Link to="/loja" className={styles.textLink}>
            Conhecer a loja <ArrowUpRightIcon size={16} />
          </Link>
        </div>
      </section>
    );
  }
  const { link, catalog } = head.data;
  return (
    <>
      <section className={styles.linkHero}>
        <div className={`container ${styles.linkHeroInner}`}>
          <div>
            <p className={styles.vip}>Acesso exclusivo · {link.label}</p>
            <h1 className={styles.linkTitle}>
              {catalog.name}
              <span className={styles.dot}>.</span>
            </h1>
            {catalog.description ? <p className={styles.lead}>{catalog.description}</p> : null}
            {link.expiresAt ? (
              <div className={styles.expires}>
                <span className="label">Disponível até {new Date(link.expiresAt).toLocaleString('pt-BR')}</span>
                <Countdown endsAt={link.expiresAt} />
              </div>
            ) : null}
          </div>
          <CircleBadge text="Seleção por convite · Palace" />
        </div>
        <BeltBar />
      </section>
      <div className="container">
        <ProductListing
          query={query}
          fetcher={async (q) => (await storefrontApi.link(token, q)).products}
          queryKey={['link-products', token]}
          facets={undefined}
          context={context}
        />
      </div>
    </>
  );
}

export function CollectionsPage() {
  const catalogs = useQuery({ queryKey: storefrontKeys.catalogs, queryFn: storefrontApi.catalogs });
  const categories = useQuery({ queryKey: storefrontKeys.categories, queryFn: storefrontApi.categories });
  return (
    <>
      <ListingHero title="Coleções" />
      <div className={`container ${styles.pad}`}>
        {catalogs.isPending ? (
          <LoadingState />
        ) : catalogs.isError ? (
          <Alert tone="danger">{errorText(catalogs.error)}</Alert>
        ) : (
          <ul className={styles.mosaic}>
            {catalogs.data.items.map((c, i) => (
              <li key={c.slug} className={i % 3 === 1 ? styles.mosaicAccent : i % 3 === 2 ? styles.mosaicPaper : undefined}>
                <Link to={`/catalogo/${c.slug}`}>
                  <strong>{c.name}</strong>
                  <span className={styles.mosaicMeta}>
                    {c.type === 'CAMPAIGN' ? 'Campanha' : c.type === 'GENERAL' ? 'Catálogo geral' : 'Coleção'} · {c.productCount} produtos
                  </span>
                  <ArrowUpRightIcon size={22} />
                </Link>
              </li>
            ))}
            {categories.data?.items.map((c) => (
              <li key={c.id}>
                <Link to={`/categoria/${c.slug}`}>
                  <strong>{c.name}</strong>
                  {c.description ? <span className={styles.mosaicMeta}>{c.description}</span> : null}
                  <ArrowUpRightIcon size={22} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function AboutPage() {
  return (
    <>
      <section className={styles.about}>
        <div className={`container ${styles.aboutInner}`}>
          <div>
            <h1 className={styles.aboutTitle}>
              Nascida <br />
              no tatame<span className={styles.dot}>.</span>
            </h1>
          </div>
          <div className={styles.aboutText}>
            <p>
              A Palace Grappling existe para quem faz do Jiu-Jitsu uma rotina: o treino das seis da manhã, o rola puxado de sexta, o campeonato que chega depois de
              meses de preparo.
            </p>
            <p>
              Desenhamos kimonos, rash guards, shorts e acessórios pensando no que acontece no tatame: pegada, raspagem, suor, lavagem. Peças que aguentam o
              uso e continuam com presença fora dele.
            </p>
            <p>Lançamos em lotes curtos, ouvimos quem treina e preferimos fazer menos, melhor.</p>
          </div>
        </div>
      </section>
      <div className="container">
        <Media slot={media.about} className={styles.aboutMedia} />
      </div>
    </>
  );
}

export function ContactPage() {
  const store = useQuery({ queryKey: storefrontKeys.store, queryFn: storefrontApi.store });
  return (
    <>
      <ListingHero title="Contato" description="Dúvidas sobre tamanho, pedido ou troca? Fale direto com a equipe." />
      <div className={`container ${styles.pad}`}>
        {store.isPending ? (
          <LoadingState />
        ) : store.data?.contactEmail || store.data?.contactPhone ? (
          <ul className={styles.contact}>
            {store.data.contactEmail ? (
              <li>
                <span className="label">E-mail</span>
                <a href={`mailto:${store.data.contactEmail}`}>{store.data.contactEmail}</a>
              </li>
            ) : null}
            {store.data.contactPhone ? (
              <li>
                <span className="label">WhatsApp</span>
                <a href={`https://wa.me/55${store.data.contactPhone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                  {store.data.contactPhone}
                </a>
              </li>
            ) : null}
          </ul>
        ) : (
          <Alert tone="info">Os canais de contato ainda não foram configurados pela loja.</Alert>
        )}
      </div>
    </>
  );
}

/** Texto-modelo: precisa ser revisado pela loja (e, idealmente, por um advogado) antes de publicar. */
export function PoliciesPage() {
  const store = useQuery({ queryKey: storefrontKeys.store, queryFn: storefrontApi.store });
  return (
    <>
      <ListingHero title="Termos, trocas e privacidade" />
      <div className={`container ${styles.policies}`}>
        <Alert tone="warning" title="Texto-modelo">
          Conteúdo provisório. A loja deve revisar estas políticas antes de vender.
          {store.data?.termsUrl ? (
            <>
              {' '}
              Versão oficial: <a href={store.data.termsUrl}>{store.data.termsUrl}</a>
            </>
          ) : null}
        </Alert>
        <section id="compra">
          <h2>Compra e pagamento</h2>
          <p>Preços e disponibilidade são confirmados no fechamento do pedido. O pedido é considerado pago somente após a confirmação do provedor de pagamento.</p>
          <p>Pedidos não pagos dentro do prazo exibido no checkout são cancelados automaticamente e os itens voltam ao estoque.</p>
        </section>
        <section id="trocas">
          <h2>Trocas e devoluções</h2>
          <p>Compras online podem ser devolvidas em até 7 dias após o recebimento (Código de Defesa do Consumidor, art. 49). Peças devem estar sem uso e com etiqueta.</p>
        </section>
        <section id="privacidade">
          <h2>Privacidade</h2>
          <p>Usamos nome, telefone, e-mail e endereço apenas para processar e entregar o pedido e para atendimento. Dados de cartão são tratados exclusivamente pelo provedor de pagamento.</p>
        </section>
      </div>
    </>
  );
}

export function NotFoundPage() {
  return (
    <section className={styles.linkGate}>
      <div className={`container ${styles.linkGateInner}`}>
        <h1 className={styles.linkTitle}>
          Fora do tatame<span className={styles.dot}>.</span>
        </h1>
        <p>A página que você procurou não existe.</p>
        <Link to="/" className={styles.textLink}>
          Voltar para a loja <ArrowUpRightIcon size={16} />
        </Link>
      </div>
    </section>
  );
}
