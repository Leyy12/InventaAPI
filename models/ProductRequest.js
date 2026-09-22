import mongoose from 'mongoose';

const ProductRequestSchema = new mongoose.Schema(
  {
    firestoreId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true },
    userEmail: { type: String, default: null },
    businessName: { type: String, default: null },
    productName: { type: String, required: true },
    brand: { type: String, default: null },
    category: { type: String, default: null },
    description: { type: String, default: null },
    reason: { type: String, default: null },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'product_requests' }
);

const ProductRequest = mongoose.models.ProductRequest || mongoose.model('ProductRequest', ProductRequestSchema);
export default ProductRequest;
