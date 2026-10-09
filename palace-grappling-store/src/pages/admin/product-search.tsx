import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { SearchIcon } from '@/components/icons';
import { LoadingState } from '@/components/ui/Feedback';
import { adminApi, type AdminProduct } from '@/lib/api/admin';
import { useAdminKey } from './common';
import { Thumb } from './highlights';
import styles from './admin.module.css';

/** Limite de caracteres das buscas do painel. */
export const SEARCH_MAX = 80;

/** Texto sem acento e em minúsculas, para buscar "kimono azul" e achar "Kimono Azul". */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Todos os produtos da loja (a API devolve no máximo 100 por página; busca todas). */
export function useAllProducts() {
  const key = useAdminKey();
  return useQuery({
    queryKey: key('products', 'all-pages'),
    staleTime: 60_000,
    queryFn: async () => {
      const first = await adminApi.products({ page: 1, pageSize: 100 });
      const rest = await Promise.all(Array.from({ length: Math.min(first.totalPages, 50) - 1 }, (_, i) => adminApi.products({ page: i + 2, pageSize: 100 })));
      return [first, ...rest].flatMap((p) => p.items);
    },
  });
}

export const coverOf = (p: AdminProduct) => [...p.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)[0]?.url;

/** Filtra por nome, categoria, tags ou SKU. Todas as palavras precisam aparecer. */
export function filterProducts(products: AdminProduct[], term: string) {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  if (!words.length) return products;
  return products.filter((p) => {
    const haystack = normalize([p.name, p.category?.name ?? '', p.tags.join(' '), ...p.variants.map((v) => v.sku)].join(' '));
    return words.every((w) => haystack.includes(w));
  });
}

/** Campo de busca do painel: filtra enquanto digita, com limite de caracteres. */
export function SearchField({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.searchBox}>
        <SearchIcon size={18} />
        <input id={id} type="search" maxLength={SEARCH_MAX} autoComplete="off" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value.slice(0, SEARCH_MAX))} />
      </div>
    </div>
  );
}

/** Seleção de produtos para um catálogo: busca instantânea, filtro "só selecionados", marcar visíveis. */
export function ProductPicker({ selected, onChange, max = 500 }: { selected: string[]; onChange: (ids: string[]) => void; max?: number }) {
  const all = useAllProducts();
  const [term, setTerm] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const chosen = useMemo(() => new Set(selected), [selected]);
  const visible = useMemo(() => {
    const list = filterProducts(all.data ?? [], term);
    return onlySelected ? list.filter((p) => chosen.has(p.id)) : list;
  }, [all.data, term, onlySelected, chosen]);

  const toggle = (id: string) => onChange(chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id].slice(0, max));
  const allVisibleChosen = visible.length > 0 && visible.every((p) => chosen.has(p.id));
  const toggleVisible = () => {
    if (allVisibleChosen) onChange(selected.filter((id) => !visible.some((p) => p.id === id)));
    else onChange([...new Set([...selected, ...visible.map((p) => p.id)])].slice(0, max));
  };

  return (
    <div className={styles.page} style={{ gap: 'var(--space-3)' }}>
      <div className={styles.pickerTools}>
        <SearchField id="picker-search" label={`Produtos (${selected.length} selecionados)`} value={term} onChange={setTerm} placeholder="Digite nome, categoria ou SKU…" />
        <div className={styles.actions}>
          <label className={styles.check}>
            <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> Só os selecionados
          </label>
          {visible.length ? (
            <button type="button" className={styles.linkButton} onClick={toggleVisible}>
              {allVisibleChosen ? 'Desmarcar' : 'Marcar'} {term || onlySelected ? `os ${visible.length} da busca` : 'todos'}
            </button>
          ) : null}
        </div>
      </div>
      {all.isPending ? (
        <LoadingState label="Carregando produtos…" />
      ) : !visible.length ? (
        <p className={styles.muted}>{term ? `Nenhum produto com “${term}”.` : 'Nenhum produto selecionado.'}</p>
      ) : (
        <ul className={styles.productPicker} aria-label="Produtos do catálogo">
          {visible.map((p) => (
            <li key={p.id}>
              <label className={chosen.has(p.id) ? styles.pickerOn : undefined}>
                <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                <Thumb url={coverOf(p)} alt="" size={36} />
                <span>
                  <strong>{p.name}</strong>
                  <span className={styles.muted}>
                    {p.category?.name ?? 'Sem categoria'}
                    {!p.isActive ? ' · inativo' : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {selected.length >= max ? <p className={styles.fieldError}>Limite de {max} produtos por catálogo.</p> : null}
    </div>
  );
}
