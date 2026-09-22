import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema(
  {
    firestoreId: { type: String, required: true, unique: true, index: true },
    action: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    email: { type: String, default: null },
    endpoint: { type: String, default: null },
    status: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { collection: 'audit_logs' }
);

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;
