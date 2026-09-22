import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    firestoreId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    businessName: { type: String, default: null },
    plan: { type: String, default: 'free' },
    role: { type: String, default: 'consumer' },
    selectedSegment: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, collection: 'users' }
);

const User = mongoose.models.User || mongoose.model('User', UserSchema);
export default User;
