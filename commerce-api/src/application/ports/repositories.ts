// Portas de persistência. Todo método que toca dados comerciais recebe `tenantId`
// explicitamente: o isolamento entre lojas não depende de estado implícito.
import type { Role } from '../../domain/access/permissions.js';
import type { OrderStatus } from '../../domain/orders/order-status.js';
import type { PaymentMethod, PaymentStatus } from '../../domain/payments/payment-status.js';
import type { Cents } from '../../shared/money.js';
import type { Pagination } from '../../shared/pagination.js';
import type {
  CatalogLinkRecord,
  CatalogRecord,
  CategoryRecord,
  CustomerRecord,
  FinanceCategoryRecord,
  FinancialTransactionRecord,
  ImageRecord,
  MemberRecord,
  MembershipRecord,
  OrderHistoryRecord,
  OrderRecord,
  OrderSource,
  PaymentRecord,
  ProductRecord,
  RefreshTokenRecord,
  ShippingAddress,
  StockMovementRecord,
  TenantRecord,
  TenantSettingsRecord,
  UserRecord,
  VariantRecord,
} from './records.js';

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(data: { email: string; name: string; passwordHash: string; isPlatformAdmin?: boolean }): Promise<UserRecord>;
  markLogin(id: string, at: Date): Promise<void>;
}

export interface RefreshTokenRepository {
  create(data: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  }): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Marca como rotacionado somente se ainda não foi (proteção contra corrida). */
  markRotated(id: string, at: Date): Promise<boolean>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
}

export interface TenantRepository {
  findById(id: string): Promise<TenantRecord | null>;
  findBySlug(slug: string): Promise<TenantRecord | null>;
  /** Cria a loja, suas configurações, categorias financeiras padrão e o primeiro OWNER. */
  createWithOwner(data: { slug: string; name: string; ownerUserId: string }): Promise<TenantRecord>;
  listMemberships(userId: string): Promise<MembershipRecord[]>;
  findRole(userId: string, tenantId: string): Promise<Role | null>;
  listMembers(tenantId: string): Promise<MemberRecord[]>;
  upsertMember(tenantId: string, userId: string, role: Role): Promise<void>;
  removeMember(tenantId: string, userId: string): Promise<boolean>;
  countOwners(tenantId: string): Promise<number>;
  getSettings(tenantId: string): Promise<TenantSettingsRecord>;
  updateSettings(tenantId: string, data: Partial<Omit<TenantSettingsRecord, 'tenantId'>>): Promise<TenantSettingsRecord>;
}

export interface CategoryRepository {
  list(tenantId: string, opts: { onlyActive: boolean }): Promise<CategoryRecord[]>;
  findById(tenantId: string, id: string): Promise<CategoryRecord | null>;
  findBySlug(tenantId: string, slug: string): Promise<CategoryRecord | null>;
  create(tenantId: string, data: Omit<CategoryRecord, 'id' | 'tenantId'>): Promise<CategoryRecord>;
  update(tenantId: string, id: string, data: Partial<Omit<CategoryRecord, 'id' | 'tenantId'>>): Promise<CategoryRecord | null>;
}

export type ProductSort = 'relevance' | 'price_asc' | 'price_desc' | 'newest';

export interface ProductFilter {
  search?: string;
  categoryId?: string;
  line?: string;
  size?: string;
  color?: string;
  inStock?: boolean;
  featured?: boolean;
  /** Restringe a produtos de um catálogo. */
  catalogId?: string;
  /** Vitrine: só ativos, não excluídos e com variantes ativas. */
  publicOnly: boolean;
  includeDeleted?: boolean;
  sort: ProductSort;
}

export interface ProductWrite {
  categoryId: string | null;
  name: string;
  slug: string;
  description: string;
  line: string | null;
  tags: string[];
  price: Cents;
  salePrice: Cents | null;
  sizeGuide: string | null;
  shippingInfo: string | null;
  isActive: boolean;
  isFeatured: boolean;
  releasedAt: Date | null;
}

export interface VariantWrite {
  sku: string;
  size: string | null;
  color: string | null;
  colorHex: string | null;
  price: Cents | null;
  salePrice: Cents | null;
  isActive: boolean;
  position: number;
}

export interface ProductRepository {
  list(tenantId: string, filter: ProductFilter, page: Pagination): Promise<{ items: ProductRecord[]; total: number }>;
  findById(tenantId: string, id: string): Promise<ProductRecord | null>;
  findBySlug(tenantId: string, slug: string): Promise<ProductRecord | null>;
  /** Produtos ativos da mesma categoria/linha, excluindo o próprio. */
  related(tenantId: string, product: ProductRecord, limit: number): Promise<ProductRecord[]>;
  create(tenantId: string, data: ProductWrite, variants: (VariantWrite & { stock: number })[]): Promise<ProductRecord>;
  update(tenantId: string, id: string, data: Partial<ProductWrite>): Promise<ProductRecord | null>;
  softDelete(tenantId: string, id: string, at: Date): Promise<boolean>;
  /** Mapa de produtos existentes no tenant (validação de associações). */
  existingIds(tenantId: string, ids: string[]): Promise<Set<string>>;
}

export interface VariantRepository {
  findById(tenantId: string, id: string): Promise<(VariantRecord & { tenantId: string }) | null>;
  /** Variantes com o produto, para checkout/quote. */
  findManyForPricing(tenantId: string, ids: string[]): Promise<VariantForPricing[]>;
  create(tenantId: string, productId: string, data: VariantWrite): Promise<VariantRecord>;
  update(tenantId: string, id: string, data: Partial<VariantWrite>): Promise<VariantRecord | null>;
  /**
   * Aplica uma variação de estoque de forma atômica (UPDATE condicional).
   * Retorna o novo saldo, ou null se o resultado ficaria negativo.
   */
  applyStockDelta(tenantId: string, variantId: string, delta: number): Promise<number | null>;
  /** Trava a linha (SELECT ... FOR UPDATE) e devolve o saldo atual. Usar dentro de transação. */
  lockStock(tenantId: string, variantId: string): Promise<number | null>;
  lowStock(tenantId: string, threshold: number, limit: number): Promise<(VariantRecord & { productName: string })[]>;
}

export interface VariantForPricing {
  variant: VariantRecord;
  product: {
    id: string;
    name: string;
    slug: string;
    price: Cents;
    salePrice: Cents | null;
    isActive: boolean;
    deletedAt: Date | null;
    imageUrl: string | null;
  };
}

export interface ImageRepository {
  listForProduct(tenantId: string, productId: string): Promise<ImageRecord[]>;
  findById(tenantId: string, productId: string, id: string): Promise<ImageRecord | null>;
  create(tenantId: string, data: Omit<ImageRecord, 'id'>): Promise<ImageRecord>;
  update(tenantId: string, productId: string, id: string, data: { alt?: string; position?: number; variantId?: string | null }): Promise<ImageRecord | null>;
  setPrimary(tenantId: string, productId: string, id: string): Promise<void>;
  delete(tenantId: string, productId: string, id: string): Promise<boolean>;
}

export interface StockMovementRepository {
  create(tenantId: string, data: Omit<StockMovementRecord, 'id' | 'sku' | 'createdAt'>): Promise<void>;
  list(tenantId: string, filter: { variantId?: string; orderId?: string }, page: Pagination): Promise<{ items: StockMovementRecord[]; total: number }>;
}

export interface CatalogWrite {
  name: string;
  slug: string;
  description: string;
  type: CatalogRecord['type'];
  isPublic: boolean;
  isActive: boolean;
  heroImageUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface CatalogRepository {
  list(tenantId: string): Promise<CatalogRecord[]>;
  findById(tenantId: string, id: string): Promise<CatalogRecord | null>;
  findBySlug(tenantId: string, slug: string): Promise<CatalogRecord | null>;
  create(tenantId: string, data: CatalogWrite): Promise<CatalogRecord>;
  update(tenantId: string, id: string, data: Partial<CatalogWrite>): Promise<CatalogRecord | null>;
  setProducts(tenantId: string, catalogId: string, productIds: string[]): Promise<void>;
  addProduct(tenantId: string, catalogId: string, productId: string): Promise<void>;
  removeProduct(tenantId: string, catalogId: string, productId: string): Promise<void>;
}

export interface CatalogLinkRepository {
  list(tenantId: string, catalogId?: string): Promise<CatalogLinkRecord[]>;
  findById(tenantId: string, id: string): Promise<CatalogLinkRecord | null>;
  /** Busca global pelo token (o token identifica a loja). */
  findByToken(token: string): Promise<CatalogLinkRecord | null>;
  create(tenantId: string, data: { catalogId: string; token: string; label: string; expiresAt: Date | null; maxUses: number | null; createdById: string }): Promise<CatalogLinkRecord>;
  update(tenantId: string, id: string, data: { label?: string; expiresAt?: Date | null; maxUses?: number | null; isActive?: boolean }): Promise<CatalogLinkRecord | null>;
  /** Incrementa o uso respeitando maxUses de forma atômica. */
  consumeUse(tenantId: string, id: string): Promise<boolean>;
}

export interface CustomerRepository {
  list(tenantId: string, search: string | undefined, page: Pagination): Promise<{ items: CustomerRecord[]; total: number }>;
  findById(tenantId: string, id: string): Promise<CustomerRecord | null>;
  upsertByPhone(tenantId: string, data: { name: string; phone: string; email: string | null }): Promise<{ id: string }>;
  addAddress(tenantId: string, customerId: string, address: ShippingAddress): Promise<void>;
}

export interface NewOrder {
  number: string;
  customerId: string;
  source: OrderSource;
  catalogId: string | null;
  catalogLinkId: string | null;
  paymentMethod: PaymentMethod;
  currency: string;
  subtotal: Cents;
  shippingTotal: Cents;
  discountTotal: Cents;
  total: Cents;
  address: ShippingAddress;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  notes: string | null;
  idempotencyKey: string;
  trackingTokenHash: string;
  termsAcceptedAt: Date;
  paymentExpiresAt: Date | null;
  items: Omit<OrderRecord['items'][number], 'id'>[];
}

export interface OrderFilter {
  status?: OrderStatus;
  search?: string;
  customerId?: string;
  from?: Date;
  to?: Date;
}

export interface OrderRepository {
  create(tenantId: string, data: NewOrder): Promise<OrderRecord>;
  findById(tenantId: string, id: string): Promise<OrderRecord | null>;
  findByNumber(tenantId: string, number: string): Promise<OrderRecord | null>;
  findByIdempotencyKey(tenantId: string, key: string): Promise<OrderRecord | null>;
  list(tenantId: string, filter: OrderFilter, page: Pagination): Promise<{ items: OrderRecord[]; total: number }>;
  /**
   * Troca o status somente se o atual for `from` (concorrência otimista).
   * Retorna false quando outro processo já mudou o pedido.
   */
  transition(tenantId: string, id: string, from: OrderStatus, to: OrderStatus, patch: Partial<Pick<OrderRecord, 'paidAt' | 'shippedAt' | 'deliveredAt' | 'cancelledAt' | 'shippingCarrier' | 'trackingCode'>>): Promise<boolean>;
  updateShipping(tenantId: string, id: string, data: { shippingCarrier: string | null; trackingCode: string | null }): Promise<void>;
  addHistory(tenantId: string, data: Omit<OrderHistoryRecord, 'id' | 'createdAt' | 'orderNumber'>): Promise<void>;
  history(tenantId: string, orderId: string): Promise<OrderHistoryRecord[]>;
  recentActivity(tenantId: string, limit: number): Promise<OrderHistoryRecord[]>;
  /** Pedidos aguardando pagamento cujo prazo venceu (todas as lojas; usado pela varredura). */
  findExpired(now: Date, limit: number): Promise<{ id: string; tenantId: string }[]>;
  countByStatus(tenantId: string, statuses: OrderStatus[]): Promise<number>;
  stats(tenantId: string, from: Date, to: Date): Promise<{ createdCount: number; createdTotal: Cents; paidCount: number; paidTotal: Cents }>;
}

export interface PaymentRepository {
  create(tenantId: string, data: { orderId: string; provider: string; method: PaymentMethod; amount: Cents; externalReference: string }): Promise<PaymentRecord>;
  attachCheckout(tenantId: string, id: string, data: { checkoutId: string; checkoutUrl: string }): Promise<void>;
  findByExternalReference(externalReference: string): Promise<PaymentRecord | null>;
  listForOrder(tenantId: string, orderId: string): Promise<PaymentRecord[]>;
  /** SELECT ... FOR UPDATE do pagamento; usar dentro de transação. */
  lock(tenantId: string, id: string): Promise<PaymentRecord | null>;
  update(tenantId: string, id: string, data: { status?: PaymentStatus; externalId?: string; rawStatus?: string; approvedAt?: Date | null }): Promise<void>;
  expirePendingForOrder(tenantId: string, orderId: string): Promise<void>;
  countByStatus(tenantId: string, status: PaymentStatus): Promise<number>;
}

export interface PaymentEventRepository {
  /** Registra o evento; retorna null se já foi processado (duplicado). */
  begin(data: { provider: string; eventKey: string; type: string; payload: unknown }): Promise<{ id: string } | null>;
  finish(id: string, data: { tenantId: string | null; paymentId: string | null; result: string }): Promise<void>;
}

export interface TransactionFilter {
  kind?: 'INCOME' | 'EXPENSE';
  status?: 'PENDING' | 'PAID' | 'CANCELLED';
  from?: Date;
  to?: Date;
}

export interface FinanceRepository {
  listCategories(tenantId: string): Promise<FinanceCategoryRecord[]>;
  findCategory(tenantId: string, id: string): Promise<FinanceCategoryRecord | null>;
  findSystemCategory(tenantId: string, kind: 'INCOME' | 'EXPENSE', name: string): Promise<FinanceCategoryRecord | null>;
  createCategory(tenantId: string, data: { name: string; kind: 'INCOME' | 'EXPENSE' }): Promise<FinanceCategoryRecord>;
  createTransaction(tenantId: string, data: Omit<FinancialTransactionRecord, 'id' | 'tenantId' | 'categoryName' | 'createdAt'> & { createdById: string | null }): Promise<FinancialTransactionRecord>;
  /** Cria a receita de um pagamento aprovado se ainda não existir (paymentId é único). */
  ensureIncomeForPayment(tenantId: string, data: Omit<FinancialTransactionRecord, 'id' | 'tenantId' | 'categoryName' | 'createdAt' | 'kind' | 'status'> & { paymentId: string }): Promise<boolean>;
  cancelIncomeForPayment(tenantId: string, paymentId: string): Promise<void>;
  findTransaction(tenantId: string, id: string): Promise<FinancialTransactionRecord | null>;
  updateTransaction(tenantId: string, id: string, data: { status?: 'PENDING' | 'PAID' | 'CANCELLED'; paidAt?: Date | null }): Promise<FinancialTransactionRecord | null>;
  listTransactions(tenantId: string, filter: TransactionFilter, page: Pagination): Promise<{ items: FinancialTransactionRecord[]; total: number }>;
  /** Soma de lançamentos PAID por data de pagamento. */
  sumPaid(tenantId: string, kind: 'INCOME' | 'EXPENSE', from: Date, to: Date): Promise<Cents>;
  /** Soma de lançamentos não cancelados por competência. */
  sumCompetence(tenantId: string, kind: 'INCOME' | 'EXPENSE', from: Date, to: Date): Promise<Cents>;
  /** Série mensal/diária de lançamentos pagos. */
  cashflow(tenantId: string, from: Date, to: Date, groupBy: 'day' | 'month'): Promise<{ period: string; income: Cents; expense: Cents }[]>;
}

export interface Repositories {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  tenants: TenantRepository;
  categories: CategoryRepository;
  products: ProductRepository;
  variants: VariantRepository;
  images: ImageRepository;
  stockMovements: StockMovementRepository;
  catalogs: CatalogRepository;
  catalogLinks: CatalogLinkRepository;
  customers: CustomerRepository;
  orders: OrderRepository;
  payments: PaymentRepository;
  paymentEvents: PaymentEventRepository;
  finance: FinanceRepository;
}

export interface UnitOfWork {
  /** Repositórios fora de transação. */
  readonly repos: Repositories;
  /** Executa `fn` numa transação; qualquer erro desfaz tudo. */
  transaction<T>(fn: (repos: Repositories) => Promise<T>): Promise<T>;
  /** Verifica conectividade com o banco (readiness). */
  ping(): Promise<void>;
}
