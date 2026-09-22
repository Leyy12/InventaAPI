import mongoose from 'mongoose';

const ApiKeySchema = new mongoose.Schema(
  {
    firestoreId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, default: null },
    key: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    plan: { type: String, required: true },
    linkedProductIds: { type: [String], default: [] },
    linkedVariantSelections: { type: mongoose.Schema.Types.Mixed, default: {} },
    productAvailability: { type: mongoose.Schema.Types.Mixed, default: {} },
    requestsUsed: { type: Number, default: 0 },
    lastUsed: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'api_keys' }
);

const ApiKey = mongoose.models.ApiKey || mongoose.model('ApiKey', ApiKeySchema);
export default ApiKey;
