import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { useAdminSession } from '@/features/admin-auth/AdminSession';
import { adminApi, type AdminCatalog, type AdminCategory, type StockMovement } from '@/lib/api/admin';
import { PageHeader, Pager, Panel, dateTime, errorMessage, useAdminKey, useAdminMutation } from './common';
import styles from './admin.module.css';

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ───────────────────────── Categorias ─────────────────────────

export function CategoriesPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const categories = useQuery({ queryKey: key('categories'), queryFn: adminApi.categories });
  const [name, setName] = useState('');
  const create = useAdminMutation(
    () => adminApi.createCategory({ name, slug: slugify(name), description: null, parentId: null, position: categories.data?.items.length ?? 0, isActive: true }),
    () => setName(''),
  );
  const update = useAdminMutation((v: { id: string; body: Partial<AdminCategory> }) => adminApi.updateCategory(v.id, v.body));
  const err = create.error ?? update.error;

  return (
    <div className={styles.page}>
      <PageHeader title="Categorias" description="Organizam a vitrine e os filtros da loja." />
      {err ? <Alert tone="danger">{errorMessage(err)}</Alert> : null}
      {can('catalog:write') ? (
        <form
          className={styles.toolbar}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) create.mutate(undefined);
          }}
        >
          <label className={styles.field}>
            <span>Nova categoria</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Kimonos" />
          </label>
          <Button size="sm" type="submit" loading={create.isPending}>
            Criar
          </Button>
        </form>
      ) : null}
      <Panel>
        {categories.isPending ? (
          <LoadingState />
        ) : !categories.data?.items.length ? (
          <EmptyState title="Nenhuma categoria" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Slug</th>
                <th scope="col" className={styles.num}>Ordem</th>
                <th scope="col">Ativa</th>
              </tr>
            </thead>
            <tbody>
              {categories.data.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input
                      className={styles.inlineInput}
                      aria-label={`Nome de ${c.name}`}
                      defaultValue={c.name}
                      disabled={!can('catalog:write')}
                      onBlur={(e) => e.target.value.trim() !== c.name && update.mutate({ id: c.id, body: { name: e.target.value.trim() } })}
                    />
                  </td>
                  <td className={styles.code}>{c.slug}</td>
                  <td className={styles.num}>
                    <input
                      className={styles.inlineInput}
                      style={{ width: '5rem' }}
                      type="number"
                      aria-label={`Ordem de ${c.name}`}
                      defaultValue={c.position}
                      disabled={!can('catalog:write')}
                      onBlur={(e) => Number(e.target.value) !== c.position && update.mutate({ id: c.id, body: { position: Number(e.target.value) } })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${c.name} ativa`}
                      checked={c.isActive}
                      disabled={!can('catalog:write')}
                      onChange={(e) => update.mutate({ id: c.id, body: { isActive: e.target.checked } })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// ───────────────────────── Estoque ─────────────────────────

const movementLabel: Record<StockMovement['type'], string> = {
  INBOUND: 'Entrada',
  OUTBOUND: 'Saída',
  ADJUSTMENT: 'Ajuste',
  SALE: 'Venda',
  RELEASE: 'Devolução ao estoque',
  RETURN: 'Devolução de cliente',
};

export function InventoryPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const [params, setParams] = useSearchParams();
  const variantId = params.get('variante') ?? undefined;
  const page = Number(params.get('pagina') ?? 1);
  const low = useQuery({ queryKey: key('low-stock'), queryFn: adminApi.lowStock });
  const movements = useQuery({
    queryKey: key('movements', variantId, page),
    queryFn: () => adminApi.movements({ variantId, page, pageSize: 30 }),
    placeholderData: keepPreviousData,
  });
  const [form, setForm] = useState({ type: 'INBOUND' as 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT', quantity: 1, reason: '' });
  const move = useAdminMutation(
    () =>
      adminApi.move(
        variantId!,
        form.type === 'ADJUSTMENT' ? { type: 'ADJUSTMENT', countedStock: form.quantity, reason: form.reason } : { type: form.type, quantity: form.quantity, reason: form.reason },
      ),
    () => setForm((f) => ({ ...f, reason: '' })),
  );

  return (
    <div className={styles.page}>
      <PageHeader title="Estoque" description="Saldo por variante e histórico de todas as movimentações." />
      <div className={styles.split}>
        <Panel title={variantId ? 'Movimentações da variante' : 'Últimas movimentações'} actions={variantId ? <button type="button" className={styles.linkButton} onClick={() => setParams({})}>Ver todas</button> : null}>
          {movements.isPending ? (
            <LoadingState />
          ) : movements.isError ? (
            <Alert tone="danger">{errorMessage(movements.error)}</Alert>
          ) : !movements.data.items.length ? (
            <EmptyState title="Sem movimentações" />
          ) : (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">SKU</th>
                    <th scope="col">Tipo</th>
                    <th scope="col" className={styles.num}>Qtd.</th>
                    <th scope="col" className={styles.num}>Saldo</th>
                    <th scope="col">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.data.items.map((m) => (
                    <tr key={m.id}>
                      <td>{dateTime(m.createdAt)}</td>
                      <td>
                        <Link className={styles.code} to={`/admin/estoque?variante=${m.variantId}`}>
                          {m.sku}
                        </Link>
                      </td>
                      <td>{movementLabel[m.type]}</td>
                      <td className={styles.num}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                      <td className={styles.num}>{m.balanceAfter}</td>
                      <td>
                        {m.reason}
                        {m.orderId ? (
                          <>
                            {' '}
                            · <Link to={`/admin/pedidos/${m.orderId}`}>pedido</Link>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={movements.data.page} totalPages={movements.data.totalPages} onChange={(p) => setParams({ ...(variantId ? { variante: variantId } : {}), pagina: String(p) })} />
            </>
          )}
        </Panel>

        <div className={styles.page}>
          {variantId && can('inventory:write') ? (
            <Panel title="Registrar movimentação">
              {move.isError ? <Alert tone="danger">{errorMessage(move.error)}</Alert> : null}
              {move.isSuccess ? <Alert tone="success">Saldo atual: {move.data.balance}</Alert> : null}
              <form
                className={styles.page}
                onSubmit={(e) => {
                  e.preventDefault();
                  move.mutate(undefined);
                }}
              >
                <label className={styles.field}>
                  <span>Tipo</span>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>
                    <option value="INBOUND">Entrada</option>
                    <option value="OUTBOUND">Saída (perda, avaria, brinde)</option>
                    <option value="ADJUSTMENT">Ajuste para saldo contado</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{form.type === 'ADJUSTMENT' ? 'Saldo contado' : 'Quantidade'}</span>
                  <input type="number" min={form.type === 'ADJUSTMENT' ? 0 : 1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} required />
                </label>
                <label className={styles.field}>
                  <span>Motivo</span>
                  <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} minLength={2} required />
                </label>
                <Button size="sm" type="submit" loading={move.isPending}>
                  Registrar
                </Button>
              </form>
            </Panel>
          ) : (
            <p className={styles.muted}>Escolha uma variante (pelo SKU no histórico ou na página do produto) para registrar entrada, saída ou ajuste.</p>
          )}
          <Panel title="Estoque baixo">
            {low.data?.items.length ? (
              <ul className={styles.activity}>
                {low.data.items.map((v) => (
                  <li key={v.id}>
                    <Link to={`/admin/estoque?variante=${v.id}`}>{v.productName}</Link> <span className={styles.code}>{v.sku}</span> · <strong>{v.stock}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>Nada abaixo do limite.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Catálogos ─────────────────────────

const typeLabel: Record<AdminCatalog['type'], string> = { GENERAL: 'Geral', COLLECTION: 'Coleção', CAMPAIGN: 'Campanha' };
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function CatalogsPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const catalogs = useQuery({ queryKey: key('catalogs'), queryFn: adminApi.catalogs });
  const [editing, setEditing] = useState<AdminCatalog | 'new' | null>(null);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Catálogos"
        description="Catálogo geral, coleções e campanhas. Privados abrem só por link exclusivo."
        actions={can('catalog:write') ? <Button size="sm" onClick={() => setEditing('new')}>Novo catálogo</Button> : null}
      />
      {editing ? <CatalogEditor key={editing === 'new' ? 'new' : editing.id} catalog={editing === 'new' ? null : editing} onDone={() => setEditing(null)} /> : null}
      <Panel>
        {catalogs.isPending ? (
          <LoadingState />
        ) : !catalogs.data?.items.length ? (
          <EmptyState title="Nenhum catálogo" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Tipo</th>
                <th scope="col">Visibilidade</th>
                <th scope="col" className={styles.num}>Produtos</th>
                <th scope="col">Período</th>
                <th scope="col"><span className="visually-hidden">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {catalogs.data.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <div className={styles.code}>/catalogo/{c.slug}</div>
                  </td>
                  <td>{typeLabel[c.type]}</td>
                  <td>{!c.isActive ? 'Inativo' : c.isPublic ? 'Público' : 'Privado (link)'}</td>
                  <td className={styles.num}>{c.productIds.length}</td>
                  <td>{c.startsAt || c.endsAt ? `${dateTime(c.startsAt)} → ${dateTime(c.endsAt)}` : 'Sempre'}</td>
                  <td>
                    {can('catalog:write') ? (
                      <button type="button" className={styles.linkButton} onClick={() => setEditing(c)}>
                        Editar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function CatalogEditor({ catalog, onDone }: { catalog: AdminCatalog | null; onDone: () => void }) {
  const key = useAdminKey();
  const products = useQuery({ queryKey: key('products', 'all'), queryFn: () => adminApi.products({ pageSize: 100 }) });
  const [form, setForm] = useState({
    name: catalog?.name ?? '',
    slug: catalog?.slug ?? '',
    description: catalog?.description ?? '',
    type: catalog?.type ?? ('COLLECTION' as AdminCatalog['type']),
    isPublic: catalog?.isPublic ?? true,
    isActive: catalog?.isActive ?? true,
    heroImageUrl: catalog?.heroImageUrl ?? '',
    startsAt: toLocalInput(catalog?.startsAt ?? null),
    endsAt: toLocalInput(catalog?.endsAt ?? null),
  });
  const [selected, setSelected] = useState<string[]>(catalog?.productIds ?? []);
  const save = useAdminMutation(async () => {
    const body = {
      name: form.name,
      slug: form.slug || slugify(form.name),
      description: form.description,
      type: form.type,
      isPublic: form.isPublic,
      isActive: form.isActive,
      heroImageUrl: form.heroImageUrl || null,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
    };
    if (catalog) {
      await adminApi.updateCatalog(catalog.id, body);
      return adminApi.setCatalogProducts(catalog.id, selected);
    }
    return adminApi.createCatalog({ ...body, productIds: selected });
  }, onDone);

  return (
    <Panel title={catalog ? `Editar ${catalog.name}` : 'Novo catálogo'}>
      {save.isError ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined);
        }}
        className={styles.page}
      >
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Nome</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
          </label>
          <label className={styles.field}>
            <span>Slug</span>
            <input value={form.slug} placeholder={slugify(form.name)} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Tipo</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AdminCatalog['type'] })}>
              <option value="GENERAL">Geral</option>
              <option value="COLLECTION">Coleção</option>
              <option value="CAMPAIGN">Campanha</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Imagem de capa (URL, opcional)</span>
            <input type="url" value={form.heroImageUrl} onChange={(e) => setForm({ ...form, heroImageUrl: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Início (opcional)</span>
            <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span>Fim (opcional; ativa a contagem regressiva)</span>
            <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
          </label>
          <label className={`${styles.field} ${styles.span2}`}>
            <span>Descrição</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className={styles.actions}>
            <label className={styles.check}>
              <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Público (abre por slug)
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Ativo
            </label>
          </div>
        </div>
        <fieldset className={styles.field} style={{ border: 0, padding: 0 }}>
          <legend>Produtos ({selected.length})</legend>
          <div className={styles.picker}>
            {products.data?.items.map((p) => (
              <label key={p.id} className={styles.check}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                />
                {p.name} {!p.isActive ? '(inativo)' : ''}
              </label>
            ))}
          </div>
        </fieldset>
        <div className={styles.actions}>
          <Button size="sm" type="submit" loading={save.isPending}>
            Salvar
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ───────────────────────── Links exclusivos ─────────────────────────

export function LinksPage() {
  const key = useAdminKey();
  const { can } = useAdminSession();
  const links = useQuery({ queryKey: key('links'), queryFn: adminApi.links });
  const catalogs = useQuery({ queryKey: key('catalogs'), queryFn: adminApi.catalogs });
  const [form, setForm] = useState({ catalogId: '', label: '', expiresAt: '', maxUses: '' });
  const [copied, setCopied] = useState<string | null>(null);
  const create = useAdminMutation(
    () =>
      adminApi.createLink({
        catalogId: form.catalogId,
        label: form.label,
        expiresAt: fromLocalInput(form.expiresAt),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
      }),
    () => setForm({ catalogId: form.catalogId, label: '', expiresAt: '', maxUses: '' }),
  );
  const toggle = useAdminMutation((v: { id: string; isActive: boolean }) => adminApi.updateLink(v.id, { isActive: v.isActive }));
  const urlOf = (token: string) => `${window.location.origin}/c/${token}`;
  const now = Date.now();

  return (
    <div className={styles.page}>
      <PageHeader title="Links exclusivos" description="Compartilham uma seleção sem expor o catálogo. O token não dá acesso ao painel." />
      {create.isError ? <Alert tone="danger">{errorMessage(create.error)}</Alert> : null}
      {can('catalog:write') ? (
        <Panel title="Gerar link">
          <form
            className={styles.toolbar}
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(undefined);
            }}
          >
            <label className={styles.field}>
              <span>Catálogo</span>
              <select value={form.catalogId} onChange={(e) => setForm({ ...form, catalogId: e.target.value })} required>
                <option value="">Escolha…</option>
                {catalogs.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Identificação</span>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex.: Equipe de competição" required minLength={2} />
            </label>
            <label className={styles.field}>
              <span>Expira em (opcional)</span>
              <input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span>Limite de pedidos (opcional)</span>
              <input type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            </label>
            <Button size="sm" type="submit" loading={create.isPending}>
              Gerar
            </Button>
          </form>
        </Panel>
      ) : null}
      <Panel>
        {links.isPending ? (
          <LoadingState />
        ) : !links.data?.items.length ? (
          <EmptyState title="Nenhum link gerado" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Identificação</th>
                <th scope="col">Catálogo</th>
                <th scope="col">Situação</th>
                <th scope="col" className={styles.num}>Pedidos</th>
                <th scope="col">Link</th>
                <th scope="col">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {links.data.items.map((l) => {
                const expired = l.expiresAt && new Date(l.expiresAt).getTime() <= now;
                const exhausted = l.maxUses != null && l.useCount >= l.maxUses;
                return (
                  <tr key={l.id}>
                    <td>{l.label}</td>
                    <td>{l.catalog.name}</td>
                    <td>{!l.isActive ? 'Desativado' : expired ? 'Expirado' : exhausted ? 'Limite atingido' : l.expiresAt ? `Até ${dateTime(l.expiresAt)}` : 'Válido'}</td>
                    <td className={styles.num}>
                      {l.useCount}
                      {l.maxUses != null ? ` / ${l.maxUses}` : ''}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={async () => {
                          await navigator.clipboard?.writeText(urlOf(l.token));
                          setCopied(l.id);
                        }}
                      >
                        {copied === l.id ? 'Copiado' : 'Copiar URL'}
                      </button>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Link ${l.label} ativo`}
                        checked={l.isActive}
                        disabled={!can('catalog:write')}
                        onChange={(e) => toggle.mutate({ id: l.id, isActive: e.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
