import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ObjectStorage, StoredObject } from '../../application/ports/services.js';
import { AppError } from '../../shared/errors.js';

/**
 * Supabase Storage. Usa a chave service_role, que existe apenas no backend.
 * O bucket deve ser público para leitura (as URLs das fotos vão para a vitrine);
 * escrita e exclusão acontecem só por esta API. Ver README > Storage.
 */
export class SupabaseObjectStorage implements ObjectStorage {
  private readonly client: SupabaseClient;

  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly bucket: string,
  ) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  readonly configured = true;

  async upload(path: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const { error } = await this.client.storage.from(this.bucket).upload(path, body, {
      contentType,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) throw new AppError('BAD_GATEWAY', `Falha no upload para o Storage: ${error.message}`);
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }

  async remove(paths: string[]): Promise<void> {
    if (!paths.length) return;
    const { error } = await this.client.storage.from(this.bucket).remove(paths);
    if (error) throw new AppError('BAD_GATEWAY', `Falha ao remover do Storage: ${error.message}`);
  }
}

/** Usado quando o Supabase não está configurado: uploads respondem 503 em vez de fingir sucesso. */
export const unconfiguredStorage: ObjectStorage = {
  configured: false,
  upload: () => Promise.reject(new AppError('SERVICE_UNAVAILABLE', 'Armazenamento de imagens não configurado')),
  remove: () => Promise.resolve(),
};
