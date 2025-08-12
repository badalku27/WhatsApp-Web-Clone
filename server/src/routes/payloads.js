import express from 'express';
import Message from '../models/Message.js';

const router = express.Router();

// Optional: join rooms per wa_id for realtime
router.post('/subscribe', (req, res) => {
  const { wa_id } = req.body;
  const io = req.app.get('io');
  io.sockets.sockets.forEach((s) => s.join(wa_id));
  res.json({ ok: true });
});

// Ingest payload (simulate webhook)
router.post('/ingest', async (req, res) => {
  try {
    const payload = req.body;

    // Simple heuristic: detect message or status payloads
    if (payload?.messages) {
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
      const result = await Message.bulkWrite(ops);
      // Emit to clients globally; clients filter by wa_id
      (payload.messages || []).forEach((m) => {
        req.app.get('io').emit('message:new', {
          ...m,
          wa_id: payload.wa_id || m.wa_id,
          name: payload.name || m.name || '',
          timestamp: m.timestamp ? new Date(m.timestamp * 1000) : new Date(),
        });
      });
      return res.json({ ok: true, result });
    }

    if (payload?.statuses) {
      const ops = payload.statuses.map((s) => ({
        updateMany: {
          filter: { $or: [{ id: s.id }, { meta_msg_id: s.id }] },
          update: { $set: { status: s.status } }
        }
      }));
      const result = await Message.bulkWrite(ops);
      (payload.statuses || []).forEach((s) => {
        req.app.get('io').emit('message:status', { id: s.id, status: s.status });
      });
      return res.json({ ok: true, result });
    }

    res.status(400).json({ error: 'Unknown payload shape' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to ingest payload' });
  }
});

export default router;
