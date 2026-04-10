import type { Router } from 'express'
import mongoose from 'mongoose'

import { requireAdmin } from '../middleware/requireAdmin'
import { NotificationModel } from '../models/Notification'

function mapRow(r: {
  _id: unknown
  kind: string
  title: string
  body: string
  link?: string
  readAt?: Date | null
  createdAt?: Date
}) {
  return {
    id: String(r._id),
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link ?? '',
    read: Boolean(r.readAt),
    readAt: r.readAt ? new Date(r.readAt).toISOString() : null,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
  }
}

/** Admin in-app notifications at /api/admin/notifications */
export function attachAdminNotificationRoutes(router: Router) {
  router.get('/notifications', requireAdmin, async (req, res) => {
    try {
      const limitRaw = Number(req.query.limit)
      const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 30
      const unreadOnly = req.query.unread === '1' || req.query.unread === 'true'

      const filter: Record<string, unknown> = { audience: 'admin' }
      if (unreadOnly) filter.readAt = null

      const rows = await NotificationModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean()

      return res.json({ notifications: rows.map((r) => mapRow(r)) })
    } catch {
      return res.status(500).json({ message: 'Could not load notifications.' })
    }
  })

  router.get('/notifications/unread-count', requireAdmin, async (_req, res) => {
    try {
      const count = await NotificationModel.countDocuments({
        audience: 'admin',
        readAt: null,
      })
      return res.json({ count })
    } catch {
      return res.status(500).json({ message: 'Could not load count.' })
    }
  })

  router.post('/notifications/read-all', requireAdmin, async (_req, res) => {
    try {
      const now = new Date()
      await NotificationModel.updateMany({ audience: 'admin', readAt: null }, { $set: { readAt: now } })
      return res.json({ ok: true })
    } catch {
      return res.status(500).json({ message: 'Could not update notifications.' })
    }
  })

  router.patch('/notifications/:id/read', requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id ?? '').trim()
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid notification id.' })
      }

      const doc = await NotificationModel.findOneAndUpdate(
        { _id: id, audience: 'admin', readAt: null },
        { $set: { readAt: new Date() } },
        { new: true },
      ).lean()

      if (!doc) return res.status(404).json({ message: 'Notification not found.' })
      return res.json({ notification: mapRow(doc) })
    } catch {
      return res.status(500).json({ message: 'Could not update notification.' })
    }
  })
}
