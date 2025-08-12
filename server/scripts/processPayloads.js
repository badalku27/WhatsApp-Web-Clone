import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Message from '../src/models/Message.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in env');
  process.exit(1);
}

async function processDir(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  let inserted = 0, updated = 0, statuses = 0;

  for (const file of files) {
    const full = path.join(dir, file);
    const raw = fs.readFileSync(full, 'utf8');
    const payload = JSON.parse(raw);

    if (payload.messages) {
      const ops = payload.messages.map((m) => ({
        updateOne: {
          filter: { id: m.id },
          update: {
            $setOnInsert: {
              id: m.id,
              meta_msg_id: m.meta_msg_id,
              wa_id: payload.wa_id || m.wa_id,
              name: payload.name || m.name || '',
              direction: m.direction || 'inbound',
              type: m.type || 'text',
              text: m.text || '',
              timestamp: m.timestamp ? new Date(m.timestamp * 1000) : new Date(),
            },
            $set: { status: m.status || 'sent' }
          },
          upsert: true,
        }
      }));
      const res = await Message.bulkWrite(ops);
      inserted += res.upsertedCount || 0;
      updated += (res.modifiedCount || 0);
    } else if (payload.statuses) {
      const ops = payload.statuses.map((s) => ({
        updateMany: {
          filter: { $or: [{ id: s.id }, { meta_msg_id: s.id }] },
          update: { $set: { status: s.status } }
        }
      }));
      const res = await Message.bulkWrite(ops);
      statuses += (res.modifiedCount || 0);
    } else {
      console.warn('Unknown payload type:', file);
    }
  }

  return { inserted, updated, statuses };
}

(async () => {
  await mongoose.connect(MONGODB_URI, { dbName: 'whatsapp' });
  const dir = process.argv[2] || path.resolve(process.cwd(), 'payloads');
  if (!fs.existsSync(dir)) {
    console.error('Payloads directory not found:', dir);
    process.exit(1);
  }
  const summary = await processDir(dir);
  console.log('Done:', summary);
  await mongoose.disconnect();
})();
