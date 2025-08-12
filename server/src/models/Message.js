import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  meta_msg_id: { type: String, index: true }, // sometimes provided
  id: { type: String }, // primary message id
  wa_id: { type: String, index: true, required: true },
  name: { type: String },
  direction: { type: String, enum: ['inbound', 'outbound'], required: true },
  type: { type: String, default: 'text' },
  text: { type: String },
  timestamp: { type: Date, index: true },
  status: { type: String, enum: ['sent', 'delivered', 'read', 'failed', 'pending'], default: 'sent' },
  profilePic: { type: String }, // optional avatar url
}, { timestamps: true });

MessageSchema.index({ wa_id: 1, timestamp: -1 });
MessageSchema.index({ id: 1 }, { unique: true, sparse: true });

export default mongoose.model('Message', MessageSchema, 'processed_messages');
