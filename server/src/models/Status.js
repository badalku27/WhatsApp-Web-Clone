import mongoose from 'mongoose';

const StatusItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['text', 'image'], default: 'text' },
  text: { type: String },
  mediaUrl: { type: String },
  timestamp: { type: Date, default: () => new Date() },
  expiresAt: { type: Date },
}, { _id: false });

const StatusSchema = new mongoose.Schema({
  wa_id: { type: String, index: true, required: true },
  name: { type: String },
  items: { type: [StatusItemSchema], default: [] },
  lastUpdated: { type: Date, index: true },
}, { timestamps: true });

StatusSchema.index({ lastUpdated: -1 });

export default mongoose.model('Status', StatusSchema, 'status_updates');
