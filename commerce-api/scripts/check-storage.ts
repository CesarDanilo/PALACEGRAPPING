// Verifica o Supabase Storage configurado no .env: garante o bucket público e faz
// um upload/remoção de teste. Uso: npx tsx --env-file=.env scripts/check-storage.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'product-images';
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: buckets, error: listError } = await supabase.storage.listBuckets();
if (listError) throw new Error(`listBuckets: ${listError.message}`);
if (!buckets.some((b) => b.name === bucket)) {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: '5MB',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  });
  if (error) throw new Error(`createBucket: ${error.message}`);
  console.log(`bucket "${bucket}" criado (público para leitura)`);
} else console.log(`bucket "${bucket}" já existe`);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const path = `_healthcheck/${Date.now()}.png`;
const up = await supabase.storage.from(bucket).upload(path, png, { contentType: 'image/png' });
if (up.error) throw new Error(`upload: ${up.error.message}`);
const { data } = supabase.storage.from(bucket).getPublicUrl(path);
const res = await fetch(data.publicUrl);
console.log('upload ok; leitura pública:', res.status);
const rm = await supabase.storage.from(bucket).remove([path]);
if (rm.error) throw new Error(`remove: ${rm.error.message}`);
console.log('remoção ok');
