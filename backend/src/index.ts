import 'dotenv/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import mongoose from 'mongoose'

import { ALLOWED_CATEGORIES } from './constants/consultation'
import './models/AgriculturalOfficer'
import { AgriculturalOfficerModel } from './models/AgriculturalOfficer'
import { ConsultationRequestModel } from './models/ConsultationRequest'
import {
  LEGACY_EQUIPMENT_TYPE_TO_ID,
  isValidMachineryEquipmentId,
} from './constants/machineryEquipmentCatalog'
import { seedMachineryEquipmentIfEmpty } from './lib/machineryEquipmentDb'
import { MachineryRentalRequestModel } from './models/MachineryRentalRequest'
import { UserFeedbackModel } from './models/UserFeedback'
import { UserInquiryModel } from './models/UserInquiry'
import './models/UserReview'
import './models/Notification'
import { adminRouter } from './routes/admin'
import { authRouter } from './routes/auth'
import { sellerRouter } from './routes/seller'
import { fertilizerRouter } from './routes/fertilizer'
import { servicesRouter } from './routes/services'
import { agriRouter } from './routes/agriStore'
import { userNotificationsRouter } from './routes/notifications'
import { seedAgriCatalogIfEmpty } from './lib/agriCatalogDb'
import { maybeStartMlService } from './startMlService'

const PORT = Number(process.env.PORT || 5000)
const MONGODB_URI = process.env.MONGODB_URI
const CORS_ORIGIN_RAW =
  process.env.CORS_ORIGIN ??
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173'
const CORS_ORIGINS = new Set(
  CORS_ORIGIN_RAW.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)
const IS_PROD = process.env.NODE_ENV === 'production'

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI in environment.')
}

const app = express()

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(express.json())
app.use(cookieParser())

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      if (CORS_ORIGINS.has(origin)) return callback(null, origin)
      // Development: allow any browser origin (LAN IP, custom host, etc.) so login/register work.
      if (!IS_PROD) return callback(null, origin)
      callback(null, false)
    },
  }),
)

app.get('/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/notifications', userNotificationsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/seller', sellerRouter)
app.use('/api/services', servicesRouter)
app.use('/api/fertilizer', fertilizerRouter)
app.use('/api/agri', agriRouter)

void (async () => {
  await maybeStartMlService()

  app.listen(PORT, async () => {
    await mongoose.connect(MONGODB_URI)

    const coll = MachineryRentalRequestModel.collection
    for (const [legacy, id] of Object.entries(LEGACY_EQUIPMENT_TYPE_TO_ID)) {
      await coll.updateMany(
        { equipmentType: legacy },
        { $set: { equipmentId: id }, $unset: { equipmentType: '' } },
      )
    }
    const remaining = await coll
      .find({ equipmentType: { $exists: true }, equipmentId: { $exists: false } })
      .toArray()
    for (const doc of remaining) {
      const et = doc.equipmentType as string | undefined
      const mapped =
        et && LEGACY_EQUIPMENT_TYPE_TO_ID[et]
          ? LEGACY_EQUIPMENT_TYPE_TO_ID[et]
          : et && isValidMachineryEquipmentId(et)
            ? et
            : 'four-wheel-tractor'
      await coll.updateOne(
        { _id: doc._id },
        { $set: { equipmentId: mapped }, $unset: { equipmentType: '' } },
      )
    }

    await UserFeedbackModel.updateMany({ status: 'archived' }, { $set: { status: 'read' } })
    await UserFeedbackModel.updateMany({ adminNote: { $regex: /\S/ } }, { $set: { status: 'read' } })

    await UserInquiryModel.updateMany({ status: 'in_progress' }, { $set: { status: 'open' } })
    await UserInquiryModel.updateMany({ status: 'closed' }, { $set: { status: 'resolved' } })
    await UserInquiryModel.updateMany({ adminReply: { $regex: /\S/ } }, { $set: { status: 'resolved' } })

    await ConsultationRequestModel.updateMany({ status: 'in_review' }, { $set: { status: 'assigned' } })
    await AgriculturalOfficerModel.collection.updateMany(
      { $or: [{ specializations: { $exists: false } }, { specializations: { $size: 0 } }] },
      {
        $set: { specializations: [...ALLOWED_CATEGORIES] },
        $unset: { designation: '' },
      },
    )
    await seedMachineryEquipmentIfEmpty()
    await seedAgriCatalogIfEmpty()
    // eslint-disable-next-line no-console
    console.log(`Backend listening on port ${PORT}`)
  })
})()

