import express from 'express';
import Message from '../models/Message.js';
import User from '../models/User.js';

const router = express.Router();

// List chats grouped by wa_id with last message (existing route)
router.get('/chats', async (req, res) => {
  try {
  const pipeline = [
      { $sort: { timestamp: -1 } },
  { $group: { _id: '$wa_id', lastMessage: { $first: '$$ROOT' }, name: { $first: '$name' } } },
  { $project: { wa_id: '$_id', _id: 0, lastMessage: 1, name: 1 } },
      { $sort: { 'lastMessage.timestamp': -1 } },
    ];
  const raw = await Message.aggregate(pipeline);
  // join with User collection to fetch profilePic
  const waIds = raw.map(c => c.wa_id);
  const users = await User.find({ wa_id: { $in: waIds } }).lean();
  const userMap = new Map(users.map(u => [u.wa_id, u]));
  const chats = raw.map(c => ({ ...c, profilePic: userMap.get(c.wa_id)?.profilePic || '' }));
  res.json({ chats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// Get conversation for a wa_id
router.get('/conversations/:wa_id', async (req, res) => {
  try {
    const { wa_id } = req.params;
    const messages = await Message.find({ wa_id }).sort({ timestamp: 1 }).lean();
  const name = messages.find(m => m.name)?.name || '';
  const user = await User.findOne({ wa_id }).lean();
  res.json({ wa_id, name, profilePic: user?.profilePic || '', messages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Send message (demo: store only)
router.post('/send', async (req, res) => {
  try {
    const { wa_id, text, name, profilePic } = req.body;
    if (!wa_id || !text) return res.status(400).json({ error: 'wa_id and text required' });
    const now = new Date();
    // upsert user record (store latest display name and optional profilePic)
    if (name || profilePic) {
      await User.updateOne(
        { wa_id },
        { $set: { name: name || '', ...(profilePic ? { profilePic } : {}) } },
        { upsert: true }
      );
    }
    const doc = await Message.create({
      id: `local_${Date.now()}`,
      wa_id,
      name: name || '',
      direction: 'outbound',
      type: 'text',
      text,
      timestamp: now,
      status: 'sent',
    });
  // Broadcast globally; client filters by wa_id
  req.app.get('io').emit('message:new', doc);
    // Simulate delivery and read updates for demo purposes
    const io = req.app.get('io');
    setTimeout(async () => {
      try {
        await Message.updateOne({ _id: doc._id }, { $set: { status: 'delivered' } });
        io.emit('message:status', { id: doc.id, status: 'delivered' });
      } catch (_) {}
    }, 800);
    setTimeout(async () => {
      try {
        await Message.updateOne({ _id: doc._id }, { $set: { status: 'read' } });
        io.emit('message:status', { id: doc.id, status: 'read' });
      } catch (_) {}
    }, 2200);
    res.json({ ok: true, message: doc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Delete a chat (all messages for a wa_id)
router.delete('/chats/:wa_id', async (req, res) => {
  try {
    const { wa_id } = req.params;
    if (!wa_id) return res.status(400).json({ error: 'wa_id required' });
    const result = await Message.deleteMany({ wa_id });
    // notify clients
    req.app.get('io').emit('chat:deleted', { wa_id });
    res.json({ ok: true, deletedCount: result.deletedCount || 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

export default router;

// --- Compatibility endpoints required by spec ---
// GET /api/chats → Return all chats grouped by wa_id with last message and timestamp.
export const compatRoutes = (app) => {
  const listChatsHandler = async (_req, res) => {
    try {
      const pipeline = [
        { $sort: { timestamp: -1 } },
        { $group: { _id: '$wa_id', lastMessage: { $first: '$$ROOT' }, name: { $first: '$name' } } },
        { $project: { wa_id: '$_id', _id: 0, lastMessage: 1, name: 1 } },
        { $sort: { 'lastMessage.timestamp': -1 } },
      ];
      const raw = await Message.aggregate(pipeline);
      res.json({ chats: raw });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch chats' });
    }
  };
  app.get('/api/chats', listChatsHandler);
  app.get('/chats', listChatsHandler);

  // GET /api/messages/:wa_id → Return all messages for that wa_id sorted by date/time.
  const listMessagesHandler = async (req, res) => {
    try {
      const { wa_id } = req.params;
      const messages = await Message.find({ wa_id }).sort({ timestamp: 1 }).lean();
      res.json({ messages });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  };
  app.get('/api/messages/:wa_id', listMessagesHandler);
  app.get('/messages/:wa_id', listMessagesHandler);

  // POST /api/messages → Accept new message and insert into DB.
  const createMessageHandler = async (req, res) => {
    try {
      const { wa_id, name, text, status = 'sent', profilePic } = req.body;
      if (!wa_id || !text) return res.status(400).json({ error: 'wa_id and text required' });
      const now = new Date();
      const doc = await Message.create({
        id: `local_${Date.now()}`,
        wa_id,
        name: name || '',
        direction: 'outbound',
        type: 'text',
        text,
        timestamp: now,
        status,
        profilePic: profilePic || '',
      });
      req.app.get('io').emit('message:new', doc);
      res.json({ ok: true, message: doc });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to create message' });
    }
  };
  app.post('/api/messages', createMessageHandler);
  app.post('/messages', createMessageHandler);
};
