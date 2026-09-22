/**
 * models/Product.js
 *
 * Mongoose schema and model for the 'products' collection in MongoDB Atlas.
 *
 * Key design decision:
 *   - `firestoreId` stores the original Firestore document ID.
 *     This lets daas.js and products.js look up products by their Firestore ID
 *     (used in api_keys.linkedProductIds) without migrating api_keys data.
 *   - All other fields mirror the Firestore document structure exactly.
 */

import mongoose from 'mongoose';

const VariantSchema = new mongoose.Schema(
  {
    sku:            { type: String, default: null },
    flavor:         { type: String, default: null },
    size:           { type: String, default: null },
    price:          { type: mongoose.Schema.Types.Mixed, default: null }, // Number or String
    stock:          { type: Number, default: 0 },
    expirationDate: { type: String, default: null },
    imageUrl:       { type: String, default: null },
    image_url:      { type: String, default: null },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    // Original Firestore document ID — authoritative lookup key.
    // Used by daas.js and products.js to fetch by linkedProductIds.
    firestoreId: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },

    // ── Core catalog fields ───────────────────────────────────────────────
    name:        { type: String, required: true, trim: true },
    brand:       { type: String, default: null, trim: true },
    sku:         { type: String, default: null, trim: true },
    description: { type: String, default: '' },
    category:    { type: String, default: null },
    segment:     { type: String, default: null },  // 'Hardware' | 'Grocery' | 'Pharmacy'

    // Price / stock at root level (legacy — prefer variant-level values)
    price:       { type: mongoose.Schema.Types.Mixed, default: null },
    stock:       { type: Number, default: 0 },

    // ── Images ────────────────────────────────────────────────────────────
    image_url:   { type: String, default: null }, // Primary field used by daas.js
    imageUrl:    { type: String, default: null }, // Alt casing from Firestore

    // ── Variants ──────────────────────────────────────────────────────────
    variants:    { type: [VariantSchema], default: [] },

    // ── Extra metadata ────────────────────────────────────────────────────
    tags:        { type: [String], default: [] },
    metadata:    { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive:    { type: Boolean, default: true },
  },
  {
    timestamps:  true,           // Adds createdAt / updatedAt automatically
    collection:  'products',     // Explicit collection name in MongoDB
  }
);

// Compound text index for fast search queries
ProductSchema.index({ name: 'text', description: 'text', sku: 'text' });

const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);

export default Product;
