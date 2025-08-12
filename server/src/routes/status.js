import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Status from '../models/Status.js'
import User from '../models/User.js'

const router = express.Router()

// Resolve to server/uploads (same as index.js static mount)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `status_${Date.now()}${ext}`)
  }
})
const upload = multer({ storage })

// List all statuses (last updated desc), filter out expired items
router.get('/', async (req, res) => {
  try {
    const now = new Date()
    const docs = await Status.find({}).sort({ lastUpdated: -1 }).lean()
    const waIds = docs.map(d => d.wa_id)
    const users = await User.find({ wa_id: { $in: waIds } }).lean()
    const userMap = new Map(users.map(u => [u.wa_id, u]))
    const result = docs
      .map(d => ({
        wa_id: d.wa_id,
        name: d.name,
        lastUpdated: d.lastUpdated,
        profilePic: userMap.get(d.wa_id)?.profilePic || '',
        items: (d.items || []).filter(i => !i.expiresAt || i.expiresAt > now)
      }))
      .filter(d => d.items.length > 0)
    res.json({ statuses: result })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to fetch status' })
  }
})

// Create a status for a user
router.post('/', async (req, res) => {
  try {
  const { wa_id, name, type = 'text', text, mediaUrl, profilePic } = req.body
    if (!wa_id) return res.status(400).json({ error: 'wa_id required' })
    const id = `status_${Date.now()}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const update = {
      $setOnInsert: { wa_id, name: name || '' },
      $push: { items: { id, type, text, mediaUrl, timestamp: now, expiresAt } },
      $set: { lastUpdated: now }
    }
    const doc = await Status.findOneAndUpdate({ wa_id }, update, { upsert: true, new: true })
    if (name || profilePic) {
      await User.updateOne(
        { wa_id },
        { $set: { name: name || '', ...(profilePic ? { profilePic } : {}) } },
        { upsert: true }
      )
    }
    req.app.get('io').emit('status:new', { wa_id, name: doc.name, item: doc.items.at(-1) })
    res.json({ ok: true, status: doc })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to create status' })
  }
})

// Upload media status (image/video) via multipart form-data
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
  const { wa_id, name, type, profilePic } = req.body
    if (!wa_id) return res.status(400).json({ error: 'wa_id required' })
    if (!req.file) return res.status(400).json({ error: 'file required' })
    const id = `status_${Date.now()}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const mediaType = type === 'image' ? 'image' : 'video'
    const mediaUrl = `/uploads/${req.file.filename}`

    const update = {
      $setOnInsert: { wa_id, name: name || '' },
      $push: { items: { id, type: mediaType, mediaUrl, timestamp: now, expiresAt } },
      $set: { lastUpdated: now }
    }
    const doc = await Status.findOneAndUpdate({ wa_id }, update, { upsert: true, new: true })
    if (name || profilePic) {
      await User.updateOne(
        { wa_id },
        { $set: { name: name || '', ...(profilePic ? { profilePic } : {}) } },
        { upsert: true }
      )
    }
    req.app.get('io').emit('status:new', { wa_id, name: doc.name, item: doc.items.at(-1) })
    res.json({ ok: true, status: doc })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to upload status' })
  }
})

export default router
// Delete all statuses for a user
router.delete('/:wa_id', async (req, res) => {
  try {
    const { wa_id } = req.params
    if (!wa_id) return res.status(400).json({ error: 'wa_id required' })
    const result = await Status.deleteOne({ wa_id })
    req.app.get('io').emit('status:deleted', { wa_id })
    res.json({ ok: true, deletedCount: result.deletedCount || 0 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to delete status' })
  }
})

// Delete a specific status item by id
router.delete('/:wa_id/items/:id', async (req, res) => {
  try {
    const { wa_id, id } = req.params
    if (!wa_id || !id) return res.status(400).json({ error: 'wa_id and id required' })
    const doc = await Status.findOneAndUpdate(
      { wa_id },
      { $pull: { items: { id } } },
      { new: true }
    )
    req.app.get('io').emit('status:itemDeleted', { wa_id, id })
    res.json({ ok: true, status: doc })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to delete status item' })
  }
})
