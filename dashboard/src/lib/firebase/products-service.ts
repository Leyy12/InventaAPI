/**
 * Firebase Firestore Products Service
 * Alternative to PostgreSQL - uses existing Firebase setup
 */

import { db } from './config';
import { 
  collection, 
  getDocs, 
  addDoc, 
  doc, 
  getDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit
} from 'firebase/firestore';

/**
 * Product Variant Interface — new schema after variants migration
 */
export interface ProductVariant {
  flavor?: string;           // Flavor or variant label (e.g., "Original", "Barbecue")
  size?: string;             // Package size (e.g., "150 g", "500 ml")
  price: number;             // Variant-specific price
  sku?: string;              // Optional SKU per variant
  expirationDate?: string | null; // YYYY-MM-DD or ISO string
  // Legacy fields (some old docs may still have these)
  value?: string;
  variantName?: string;
  id?: string;
  image_url?: string | null;
}

export interface Product {
  id?: string;
  name: string;
  description: string;
  category: string;
  segment: 'Pharmacy' | 'Hardware' | 'Grocery';
  brand?: string;
  image_url?: string;
  image?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  is_active?: boolean;
  status?: string;
  variants?: ProductVariant[];
  // Legacy root-level fields (may be absent on migrated docs — use variants instead)
  price?: number;
  size?: string | null;
  sku?: string;
  expirationDate?: string | null;
}

/** Returns lowest price from variants array, or 0 if no variants */
export function getBasePrice(product: Product): number {
  const variants = product.variants || [];
  if (variants.length === 0) return product.price ?? 0;
  return variants.reduce((min, v) => {
    const p = typeof v.price === 'number' ? v.price : parseFloat(String(v.price)) || Infinity;
    return p < min ? p : min;
  }, Infinity) || 0;
}

/** Returns size of lowest-priced variant, or null */
export function getBaseSize(product: Product): string | null {
  const variants = product.variants || [];
  if (variants.length === 0) return product.size || null;
  let base = variants[0];
  for (const v of variants) {
    const vP = typeof v.price === 'number' ? v.price : parseFloat(String(v.price)) || Infinity;
    const bP = typeof base.price === 'number' ? base.price : parseFloat(String(base.price)) || Infinity;
    if (vP < bP) base = v;
  }
  return base.size || null;
}

/** Returns true if any variant expires within 30 days */
export function hasNearExpiry(product: Product): boolean {
  const now = Date.now();
  const MS_30 = 30 * 24 * 60 * 60 * 1000;
  return (product.variants || []).some(v => {
    if (!v.expirationDate) return false;
    const exp = new Date(v.expirationDate).getTime();
    return exp > now && exp - now <= MS_30;
  });
}

// Fetch all active products (handles both is_active and status field)
export async function getAllProducts(): Promise<Product[]> {
  try {
    console.log('[Firebase Service] Fetching products...');
    const productsRef = collection(db, 'products');
    // Fetch all and filter in memory — handles both is_active:true and status:'Active'
    const snapshot = await getDocs(productsRef);
    
    console.log('[Firebase Service] Total docs in collection:', snapshot.size);
    
    const products = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }) as Product)
      .filter(p => p.is_active === true || p.status === 'Active' || p.status === 'active');
    
    console.log('[Firebase Service] Active products:', products.length);
    
    // Sort alphabetically
    products.sort((a, b) => a.name.localeCompare(b.name));
    
    return products;
  } catch (error) {
    console.error('[Firebase Service] Error fetching products:', error);
    return [];
  }
}

// Fetch products by segment
export async function getProductsBySegment(segment: string): Promise<Product[]> {
  try {
    const productsRef = collection(db, 'products');
    const q = query(
      productsRef, 
      where('is_active', '==', true),
      where('segment', '==', segment),
      orderBy('name')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Product[];
  } catch (error) {
    console.error(`Error fetching ${segment} products:`, error);
    return [];
  }
}

// Fetch single product by ID
export async function getProductById(productId: string): Promise<Product | null> {
  try {
    const productRef = doc(db, 'products', productId);
    const snapshot = await getDoc(productRef);
    
    if (snapshot.exists()) {
      return {
        id: snapshot.id,
        ...snapshot.data()
      } as Product;
    }
    return null;
  } catch (error) {
    console.error('Error fetching product:', error);
    return null;
  }
}

// Add a new product
export async function addProduct(product: Omit<Product, 'id'>): Promise<string | null> {
  try {
    const productsRef = collection(db, 'products');
    const docRef = await addDoc(productsRef, {
      ...product,
      created_at: new Date(),
      updated_at: new Date()
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding product:', error);
    return null;
  }
}

// Search products
export async function searchProducts(searchTerm: string): Promise<Product[]> {
  try {
    const productsRef = collection(db, 'products');
    const snapshot = await getDocs(productsRef);
    
    const searchLower = searchTerm.toLowerCase();
    
    return snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter((product: any) => {
        return (
          product.is_active &&
          (product.name?.toLowerCase().includes(searchLower) ||
           product.description?.toLowerCase().includes(searchLower) ||
           product.sku?.toLowerCase().includes(searchLower) ||
           product.tags?.some((tag: string) => tag.toLowerCase().includes(searchLower)))
        );
      }) as Product[];
  } catch (error) {
    console.error('Error searching products:', error);
    return [];
  }
}
