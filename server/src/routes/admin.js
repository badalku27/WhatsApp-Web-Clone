import express from 'express'
import mongoose from 'mongoose'

const router = express.Router()

router.get('/cluster', async (req, res) => {
  try {
    const conn = mongoose.connection

    // Ensure DB is connected
    if (!conn || conn.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: 'Database not connected',
        readyState: conn?.readyState ?? -1,
      })
    }

    const admin = conn.db.admin()

    // Try to get limited server info (may fail on shared/limited roles)
    let serverStatus = null
    try {
      serverStatus = await admin.serverStatus()
    } catch (_) {
      // ignore; not critical
    }

    const dbName = conn.name || conn.client?.options?.dbName || conn.db?.databaseName || 'unknown'

    // List collections and estimated counts (fast, no full scan)
    const collections = await conn.db.listCollections().toArray()
    const top = collections.slice(0, 5)
    const sampleCounts = {}
    for (const c of top) {
      try {
        sampleCounts[c.name] = await conn.db.collection(c.name).estimatedDocumentCount()
      } catch (_) {
        sampleCounts[c.name] = null
      }
    }

    res.json({
      ok: true,
      readyState: conn.readyState,
      mongooseVersion: mongoose.version,
      dbName,
      host: conn.host || conn.client?.s?.url || 'n/a',
      topology: serverStatus?.process || 'unknown',
      collections: collections.map(c => c.name),
      sampleCounts,
    })
  } catch (e) {
    console.error('[admin/cluster]', e)
    res.status(500).json({ ok: false, error: e?.message || 'Failed to fetch cluster info' })
  }
})

export default router
