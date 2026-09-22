import mongoose from 'mongoose';

const ApiTelemetrySchema = new mongoose.Schema(
  {
    firestoreId: { type: String, required: true, unique: true, index: true },
    apiKeyId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    keyName: { type: String, default: null },
    endpoint: { type: String, required: true },
    method: { type: String, required: true },
    statusCode: { type: Number, required: true },
    success: { type: Boolean, required: true },
    latencyMs: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { collection: 'api_telemetry' }
);

const ApiTelemetry = mongoose.models.ApiTelemetry || mongoose.model('ApiTelemetry', ApiTelemetrySchema);
export default ApiTelemetry;
