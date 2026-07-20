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

export interface Product {
  id?: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  segment: 'Pharmacy' | 'Hardware' | 'Grocery';
  price: number;
  size?: string | null;  // NEW: Nullable size field (e.g., "500mg", "1/2 inch x 10ft", "1 Liter")
  image_url: string;     // REQUIRED: Product image URL
  metadata?: Record<string, any>;
  tags?: string[];
  is_active: boolean;
  is_featured?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

// Fetch all products
export async function getAllProducts(): Promise<Product[]> {
  try {
    console.log('[Firebase Service] Fetching products...');
    const productsRef = collection(db, 'products');
    
    // Simplified query - removed orderBy to avoid index requirement
    const q = query(productsRef, where('is_active', '==', true));
    const snapshot = await getDocs(q);
    
    console.log('[Firebase Service] Found', snapshot.size, 'products');
    
    const products = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Product[];
    
    // Sort in memory instead of in Firestore
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
