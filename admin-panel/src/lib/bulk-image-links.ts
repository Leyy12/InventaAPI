// Plans and sends a CSV of image links of any size without the admin checking rows:
// clear matches are queued, repeats and products that already have a photo are
// skipped, and rows that match no product or several products are set aside for a
// downloadable report. Queued rows are sent to the API in batches.
import type { ImageMatch } from './bulk-image-match';

export const IMAGE_BATCH_SIZE = 100;

export type LinkRecord = Record<string, string | undefined>;
export type QueuedLink = { row: number; label: string; productId: string; image_url: string };
export type SetAsideLink = { row: number; label: string; image_url: string; reason: string };
export type LinkPlan = { queue: QueuedLink[]; skipped: SetAsideLink[]; attention: SetAsideLink[] };

export function linkLabel(record: LinkRecord): string {
  return (record.id || record.product_id || record.sku || [record.brand, record.name].filter(Boolean).join(' ') || '').trim();
}

// Rows are numbered like a spreadsheet: the header is row 1.
// normalizeUrl is normalizeProductImageUrl (passed in so this file has no app imports).
export function planImageLinks(records: LinkRecord[], match: (label: string) => ImageMatch,
  hasPhoto: (productId: string) => boolean, normalizeUrl: (url: string) => string): LinkPlan {
  const plan: LinkPlan = { queue: [], skipped: [], attention: [] };
  const claimed = new Map<string, number>();
  records.forEach((record, index) => {
    const row = index + 2, label = linkLabel(record), raw = (record.image_url || '').trim();
    if (!raw) return;
    let image_url = '';
    try { image_url = normalizeUrl(raw); } catch { /* reported below */ }
    if (!image_url) { plan.attention.push({ row, label, image_url: raw, reason: 'Image link must be an HTTPS URL.' }); return; }
    const found = label ? match(label) : { productIds: [], by: 'none' as const };
    if (!found.productIds.length) { plan.attention.push({ row, label, image_url, reason: 'No matching product.' }); return; }
    if (found.productIds.length > 1) {
      plan.attention.push({ row, label, image_url, reason: `Matches ${found.productIds.length} products (${found.productIds.join(', ')}); put the right one in the id column.` });
      return;
    }
    const productId = found.productIds[0];
    if (claimed.has(productId)) { plan.skipped.push({ row, label, image_url, reason: `Same product as row ${claimed.get(productId)}.` }); return; }
    claimed.set(productId, row);
    if (hasPhoto(productId)) { plan.skipped.push({ row, label, image_url, reason: 'Product already has a photo.' }); return; }
    plan.queue.push({ row, label, productId, image_url });
  });
  return plan;
}

export type LinkResult<P> = { productId: string; status: 'SAVED' | 'SKIPPED' | 'FAILED'; reason?: string; product?: P };
export type BatchProgress<P> = { sent: number; total: number; saved: P[]; results: (LinkResult<P> & { row: number; label: string; image_url: string })[]; waiting?: string };

type SendError = Error & { status?: number };
const isRateLimit = (error: unknown) => (error as SendError)?.status === 429;
const isRetryable = (error: unknown) => { const status = (error as SendError)?.status; return status === undefined || status >= 500; };

// Sends the queue one batch at a time. A rate limit waits a minute and tries the same
// batch again; network or server errors retry a few times, then that batch is
// reported as failed and the next batch continues. `stopped` ends after the current batch.
export async function sendImageBatches<P>({ queue, send, onProgress, stopped = () => false,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), batchSize = IMAGE_BATCH_SIZE, retries = 3 }: {
  queue: QueuedLink[]; send: (items: { productId: string; image_url: string }[]) => Promise<{ results: LinkResult<P>[] }>;
  onProgress: (progress: BatchProgress<P>) => void; stopped?: () => boolean;
  wait?: (ms: number) => Promise<unknown>; batchSize?: number; retries?: number;
}): Promise<BatchProgress<P>> {
  const progress: BatchProgress<P> = { sent: 0, total: queue.length, saved: [], results: [] };
  for (let start = 0; start < queue.length && !stopped(); start += batchSize) {
    const batch = queue.slice(start, start + batchSize);
    let results: LinkResult<P>[] | null = null, reason = '';
    for (let attempt = 0; !results; attempt++) {
      try {
        results = (await send(batch.map(({ productId, image_url }) => ({ productId, image_url })))).results;
      } catch (error) {
        if (isRateLimit(error)) {
          onProgress({ ...progress, waiting: 'Server is busy; continuing in 1 minute…' });
          await wait(60000);
        } else if (isRetryable(error) && attempt < retries) {
          onProgress({ ...progress, waiting: 'Connection problem; retrying…' });
          await wait(2000 * 2 ** attempt);
        } else {
          reason = error instanceof Error ? error.message : 'Save failed.';
          break;
        }
      }
    }
    batch.forEach((item, index) => {
      const result = results?.[index] ?? { productId: item.productId, status: 'FAILED' as const, reason: reason || 'No result returned.' };
      progress.results.push({ ...result, row: item.row, label: item.label, image_url: item.image_url });
      if (result.status === 'SAVED' && result.product) progress.saved.push(result.product);
    });
    progress.sent += batch.length;
    onProgress({ ...progress });
  }
  return progress;
}
