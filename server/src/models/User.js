import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    wa_id: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    profilePic: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.model('User', UserSchema);
