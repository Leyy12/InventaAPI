import { ApiSecurityError, sendSecurityError, validDocumentId } from './api-key-security.js';
import { formatDaaSProduct, resolveCurrentCatalogProducts } from './daas-catalog.js';

export const PREVIEW_MAX_PRODUCTS = 500;

function previewScope(body) {
  const full = body?.linkedProductIds ?? [];
  const partial = body?.linkedVariantSelections ?? {};
  if (!Array.isArray(full) || !full.every(validDocumentId)
    || !partial || typeof partial !== 'object' || Array.isArray(partial)
    || !Object.entries(partial).every(([id, values]) => validDocumentId(id) && Array.isArray(values)
      && values.length > 0 && values.every(value => typeof value === 'string' && value.length <= 500))) {
    throw new ApiSecurityError(400, 'INVALID_SCOPE', 'Provide product document IDs and non-empty variant selections.');
  }
  const ids = [...new Set(full)].filter(id => !Object.hasOwn(partial, id));
  if (ids.length + Object.keys(partial).length > PREVIEW_MAX_PRODUCTS) {
    throw new ApiSecurityError(400, 'INVALID_SCOPE', `Preview at most ${PREVIEW_MAX_PRODUCTS} products.`);
  }
  return { linkedProductIds: ids, linkedVariantSelections: partial, linkedProducts: [] };
}

/**
 * Signed-in dashboard preview of a product selection before any key exists.
 * It returns the same product shape as /daas/v1/catalog, scoped to the
 * caller's own segment, without issuing a key, consuming request allowance
 * or writing telemetry.
 */
export function createPlaygroundPreviewHandler({ getDb, verifyIdToken }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const match = typeof req.headers.authorization === 'string'
        ? /^Bearer ([^\s]+)$/u.exec(req.headers.authorization) : null;
      if (!match) throw new ApiSecurityError(401, 'UNAUTHENTICATED', 'A Firebase ID token is required.');
      let actor;
      try { actor = await verifyIdToken(match[1], true); } catch {
        throw new ApiSecurityError(401, 'UNAUTHENTICATED', 'Invalid or expired authentication.');
      }
      if (!validDocumentId(actor?.uid)) throw new ApiSecurityError(401, 'UNAUTHENTICATED', 'Invalid authentication.');
      const scope = previewScope(req.body);
      const search = typeof req.body?.search === 'string' ? req.body.search.slice(0, 200) : '';
      const db = getDb();
      const account = await db.collection('users').doc(actor.uid).get();
      if (!account.exists) throw new ApiSecurityError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
      const { products } = await resolveCurrentCatalogProducts({
        apiKeyData: scope, userData: account.data(), searchQuery: search,
        loadProductById: async id => {
          const doc = await db.collection('products').doc(id).get();
          return doc.exists ? doc.data() : null;
        },
      });
      return res.json({
        status: 'success', preview: true,
        message: 'Preview of your selected products. No API key was used and no request allowance was consumed.',
        meta: { count: products.length, mode: 'preview', searchQuery: search || undefined },
        products: products.map(product => formatDaaSProduct(product, {
          selectedVariants: scope.linkedVariantSelections[product.id],
        })),
      });
    } catch (error) { return sendSecurityError(res, error); }
  };
}
