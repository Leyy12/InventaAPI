import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema(
  {
    firestoreId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    type: { type: String, default: 'system' },
    link: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { collection: 'notifications' }
);

const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export default Notification;
