import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
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
    cb(null, `profile_${Date.now()}${ext}`)
  },
})
const upload = multer({ storage })

// Upload and set a user's profile picture
router.post('/profilePic', upload.single('file'), async (req, res) => {
  try {
    const { wa_id, name } = req.body
    if (!wa_id) return res.status(400).json({ error: 'wa_id required' })
    if (!req.file) return res.status(400).json({ error: 'file required' })
    const profilePic = `/uploads/${req.file.filename}`
    const update = { $set: { profilePic, ...(name ? { name } : {}) } }
    const opts = { upsert: true, new: true }
    const user = await User.findOneAndUpdate({ wa_id }, update, opts).lean()
    // Notify clients so they can refresh avatars
    req.app.get('io').emit('user:updated', { wa_id: user.wa_id, name: user.name, profilePic: user.profilePic })
    res.json({ ok: true, user })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to update profile picture' })
  }
})

// Optionally set by URL (no upload). Accepts { wa_id, name?, profilePic }
router.post('/profilePic/url', async (req, res) => {
  try {
    const { wa_id, name, profilePic } = req.body
    if (!wa_id || !profilePic) return res.status(400).json({ error: 'wa_id and profilePic required' })
    const user = await User.findOneAndUpdate(
      { wa_id },
      { $set: { profilePic, ...(name ? { name } : {}) } },
      { upsert: true, new: true }
    ).lean()
    req.app.get('io').emit('user:updated', { wa_id: user.wa_id, name: user.name, profilePic: user.profilePic })
    res.json({ ok: true, user })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to set profile picture URL' })
  }
})

export default router
// Clear a user's profile picture
router.delete('/:wa_id/profilePic', async (req, res) => {
  try {
    const { wa_id } = req.params
    if (!wa_id) return res.status(400).json({ error: 'wa_id required' })
    const user = await User.findOneAndUpdate(
      { wa_id },
      { $unset: { profilePic: '' } },
      { new: true }
    ).lean()
    req.app.get('io').emit('user:updated', { wa_id, name: user?.name || '', profilePic: '' })
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to clear profile picture' })
  }
})
