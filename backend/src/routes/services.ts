import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

import { Router } from 'express'
import multer from 'multer'
import mongoose from 'mongoose'

import {
  ALLOWED_CATEGORIES,
  ALLOWED_DISTRICTS,
  TIME_SLOTS,
} from '../constants/consultation'
import {
  MACHINERY_CATALOG_GROUPS,
  isValidMachineryEquipmentId,
  resolveEquipmentIdFromDoc,
} from '../constants/machineryEquipmentCatalog'
import {
  assertDistrictBookingAllowed,
  checkProposedMachineryWindow,
  dbHasAnyMachineryEquipment,
  findActiveEquipmentForBooking,
  getLabelsByEquipmentIds,
  getMachineryCatalogGroupsFromDb,
} from '../lib/machineryEquipmentDb'
import { mapMachineryRentalRow } from '../lib/machineryRentalRow'
import { MACHINERY_PREFERRED_TIMES } from '../constants/machineryRental'
import { getMachineryDailyRate } from '../constants/machineryPricing'
import { hasAvailableOfficer } from '../lib/consultationAvailability'
import { resolveConsultationDocumentFilePath, UPLOAD_ROOT } from '../lib/consultationDocumentFile'
import { requireUser } from '../middleware/requireUser'
import { ConsultationRequestModel } from '../models/ConsultationRequest'
import { notifyAdmin, notifyUser } from '../services/notificationHelpers'
import { MachineryRentalRequestModel } from '../models/MachineryRentalRequest'
import { attachUserEngagementRoutes } from './userEngagement'

function pid(p: string | string[] | undefined): string {
  if (Array.isArray(p)) return p[0] ?? ''
  return typeof p === 'string' ? p : ''
}

function ensureUploadsDir() {
  fs.mkdirSync(path.join(UPLOAD_ROOT, 'consultations'), { recursive: true })
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      ensureUploadsDir()
      const dir = path.join(UPLOAD_ROOT, 'consultations', pid(req.params.id))
      fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ''
      cb(null, `${randomUUID()}${ext}`)
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'
    cb(null, ok)
  },
})

export const servicesRouter = Router()

servicesRouter.get('/health', (_req, res) => {
  res.json({ ok: true, services: true })
})

servicesRouter.get('/machinery-catalog', async (_req, res) => {
  try {
    const fromDb = await getMachineryCatalogGroupsFromDb()
    if (fromDb?.length) {
      return res.json({ groups: fromDb })
    }
    return res.json({
      groups: MACHINERY_CATALOG_GROUPS.map((g) => ({
        ...g,
        items: g.items.map((i) => ({
          ...i,
          dailyRate: getMachineryDailyRate(i.id),
        })),
      })),
    })
  } catch {
    return res.json({
      groups: MACHINERY_CATALOG_GROUPS.map((g) => ({
        ...g,
        items: g.items.map((i) => ({
          ...i,
          dailyRate: getMachineryDailyRate(i.id),
        })),
      })),
    })
  }
})

servicesRouter.get('/machinery-availability', requireUser, async (req, res) => {
  try {
    const { equipmentId, district, startDate, durationDays, quantity } = req.query as Record<
      string,
      string | undefined
    >
    if (
      typeof equipmentId !== 'string' ||
      !equipmentId.trim() ||
      typeof district !== 'string' ||
      typeof startDate !== 'string' ||
      durationDays === undefined ||
      quantity === undefined
    ) {
      return res
        .status(400)
        .json({ message: 'equipmentId, district, startDate, durationDays, and quantity are required.' })
    }
    if (!ALLOWED_DISTRICTS.includes(district as (typeof ALLOWED_DISTRICTS)[number])) {
      return res.status(400).json({ message: 'Invalid district.' })
    }
    const dur = parseMachineryDurationDays(durationDays)
    if (Number.isNaN(dur) || dur < 1 || dur > 30) {
      return res.status(400).json({ message: 'durationDays must be between 1 and 30.' })
    }
    const qty = parseMachineryDurationDays(quantity)
    if (Number.isNaN(qty) || qty < 1 || qty > 20) {
      return res.status(400).json({ message: 'quantity must be between 1 and 20.' })
    }
    if (!ISO_DATE_RE.test(startDate.trim())) {
      return res.status(400).json({ message: 'startDate must be YYYY-MM-DD.' })
    }

    const hasDb = await dbHasAnyMachineryEquipment()
    if (!hasDb) {
      return res.json({
        available: true,
        overlappingCount: 0,
        units: null as number | null,
      })
    }

    const result = await checkProposedMachineryWindow({
      equipmentId: equipmentId.trim(),
      district,
      startDate: startDate.trim(),
      durationDays: dur,
      requestedQuantity: qty,
    })
    return res.json(result)
  } catch {
    return res.status(500).json({ message: 'Could not check availability.' })
  }
})

servicesRouter.get('/consultation-requests/availability', requireUser, async (req, res) => {
  try {
    const { date, timeSlot, district, serviceType, category } = req.query as Record<
      string,
      string | undefined
    >
    if (
      typeof date !== 'string' ||
      typeof timeSlot !== 'string' ||
      typeof district !== 'string' ||
      typeof category !== 'string' ||
      (serviceType !== 'Online service' && serviceType !== 'Onsite visit')
    ) {
      return res
        .status(400)
        .json({ message: 'date, timeSlot, district, category, and serviceType are required.' })
    }
    if (!ALLOWED_CATEGORIES.includes(category as (typeof ALLOWED_CATEGORIES)[number])) {
      return res.status(400).json({ message: 'Invalid category.' })
    }
    if (!TIME_SLOTS.includes(timeSlot as (typeof TIME_SLOTS)[number])) {
      return res.status(400).json({ message: 'Invalid time slot.' })
    }
    if (!ALLOWED_DISTRICTS.includes(district as (typeof ALLOWED_DISTRICTS)[number])) {
      return res.status(400).json({ message: 'Invalid district.' })
    }
    const available = await hasAvailableOfficer({
      date: date.trim(),
      timeSlot,
      district,
      serviceType,
      category,
    })
    return res.json({ available })
  } catch {
    return res.status(500).json({ message: 'Could not check availability.' })
  }
})

servicesRouter.post('/consultation-requests', requireUser, async (req, res) => {
  try {
    const userId = res.locals.user?.sub as string | undefined
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' })

    const body = req.body as Record<string, unknown>
    const {
      date,
      timeSlot,
      district,
      category,
      serviceType,
      contactName,
      phone,
      email,
      address,
      notes,
      urgentPestOutbreak,
    } = body

    if (typeof date !== 'string' || !date.trim()) {
      return res.status(400).json({ message: 'Date is required.' })
    }
    if (typeof timeSlot !== 'string' || !TIME_SLOTS.includes(timeSlot as (typeof TIME_SLOTS)[number])) {
      return res.status(400).json({ message: 'Invalid time slot.' })
    }
    if (typeof district !== 'string' || !ALLOWED_DISTRICTS.includes(district as (typeof ALLOWED_DISTRICTS)[number])) {
      return res.status(400).json({ message: 'Invalid district.' })
    }
    if (
      typeof category !== 'string' ||
      !ALLOWED_CATEGORIES.includes(category as (typeof ALLOWED_CATEGORIES)[number])
    ) {
      return res.status(400).json({ message: 'Invalid service category.' })
    }
    if (serviceType !== 'Online service' && serviceType !== 'Onsite visit') {
      return res.status(400).json({ message: 'Invalid service type.' })
    }
    if (typeof contactName !== 'string' || !contactName.trim()) {
      return res.status(400).json({ message: 'Contact name is required.' })
    }
    if (typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ message: 'Phone is required.' })
    }
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required.' })
    }
    if (typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ message: 'Address is required.' })
    }

    const notesStr = typeof notes === 'string' ? notes : ''
    const urgent = urgentPestOutbreak === true

    const slotOk = await hasAvailableOfficer({
      date: date.trim(),
      timeSlot,
      district,
      serviceType,
      category,
    })
    if (!slotOk) {
      return res.status(409).json({
        message:
          'No agricultural officer is available for this date and time in your district. Please choose another date or time slot.',
      })
    }

    const doc = await ConsultationRequestModel.create({
      userId,
      date: date.trim(),
      timeSlot,
      district,
      category,
      serviceType,
      contactName: contactName.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      address: address.trim(),
      notes: notesStr.trim(),
      urgentPestOutbreak: urgent,
    })

    void notifyAdmin({
      kind: 'consultation_new',
      title: 'New consultation request',
      body: `${contactName.trim()} requested a consultation in ${district} (${category}) on ${date.trim()}, ${timeSlot}.`,
      link: '/admin/consultations/requests',
    })

    return res.status(201).json({
      request: {
        id: String(doc._id),
        date: doc.date,
        timeSlot: doc.timeSlot,
        district: doc.district,
        category: doc.category,
        serviceType: doc.serviceType,
        status: doc.status,
        urgentPestOutbreak: doc.urgentPestOutbreak,
        assignedAgentName: doc.assignedAgentName || '',
        createdAt: doc.createdAt,
      },
    })
  } catch {
    return res.status(500).json({ message: 'Could not save request.' })
  }
})

servicesRouter.get('/consultation-requests', requireUser, async (req, res) => {
  try {
    const userId = res.locals.user?.sub as string | undefined
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' })

    const rows = await ConsultationRequestModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean()

    const requests = rows.map((r) => ({
      id: String(r._id),
      date: r.date,
      timeSlot: r.timeSlot,
      district: r.district,
      category: r.category,
      serviceType: r.serviceType,
      contactName: r.contactName,
      phone: r.phone,
      email: r.email,
      address: r.address,
      notes: r.notes,
      urgentPestOutbreak: r.urgentPestOutbreak,
      assignedAgentName: r.assignedAgentName || '',
      assignedOfficerId: r.assignedOfficerId ? String(r.assignedOfficerId) : null,
      status: r.status === 'in_review' ? 'assigned' : r.status,
      officerInstructions: r.officerInstructions || '',
      meetingUrl: r.meetingUrl || '',
      documents: (r.documents ?? []).map((d) => ({
        id: String(d._id),
        originalName: d.originalName,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt,
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))

    return res.json({ requests })
  } catch {
    return res.status(500).json({ message: 'Could not load requests.' })
  }
})

type LeanConsultation = {
  _id: mongoose.Types.ObjectId
  date: string
  timeSlot: string
  district: string
  category: string
  serviceType: string
  contactName: string
  phone: string
  email: string
  address: string
  notes: string
  urgentPestOutbreak: boolean
  status: string
  assignedAgentName?: string
  officerInstructions?: string
  meetingUrl?: string
  assignedOfficerId?: mongoose.Types.ObjectId | null
  documents?: Array<{
    _id: mongoose.Types.ObjectId
    originalName: string
    storageKey: string
    mimeType: string
    size: number
    uploadedAt: Date
  }>
  createdAt?: Date
  updatedAt?: Date
}

function mapRequestDetail(
  r: LeanConsultation,
  officer: {
    _id: mongoose.Types.ObjectId
    name: string
    phone: string
    email: string
    specializations?: string[]
  } | null,
) {
  return {
    id: String(r._id),
    date: r.date,
    timeSlot: r.timeSlot,
    district: r.district,
    category: r.category,
    serviceType: r.serviceType,
    contactName: r.contactName,
    phone: r.phone,
    email: r.email,
    address: r.address,
    notes: r.notes,
    urgentPestOutbreak: r.urgentPestOutbreak,
    status: r.status === 'in_review' ? 'assigned' : r.status,
    rawStatus: r.status,
    assignedAgentName: r.assignedAgentName || '',
    officerInstructions: r.officerInstructions || '',
    meetingUrl: r.meetingUrl || '',
    assignedOfficerId: r.assignedOfficerId ? String(r.assignedOfficerId) : null,
    officer: officer
      ? {
          id: String(officer._id),
          name: officer.name,
          phone: officer.phone,
          email: officer.email || '',
          specializations: officer.specializations ?? [],
        }
      : null,
    documents: (r.documents ?? []).map((d) => ({
      id: String(d._id),
      originalName: d.originalName,
      mimeType: d.mimeType,
      uploadedAt: d.uploadedAt,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

servicesRouter.get('/consultation-requests/:id', requireUser, async (req, res) => {
  try {
    const userId = res.locals.user?.sub as string | undefined
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' })
    const id = pid(req.params.id)
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id.' })
    }
    const r = await ConsultationRequestModel.findOne({ _id: id, userId })
      .populate('assignedOfficerId')
      .lean()
    if (!r) return res.status(404).json({ message: 'Request not found.' })
    const off = r.assignedOfficerId as unknown as {
      _id: mongoose.Types.ObjectId
      name: string
      phone: string
      email: string
      specializations?: string[]
    } | null
    return res.json({ request: mapRequestDetail(r as LeanConsultation, off && off._id ? off : null) })
  } catch {
    return res.status(500).json({ message: 'Could not load request.' })
  }
})

servicesRouter.post(
  '/consultation-requests/:id/documents',
  requireUser,
  upload.single('file'),
  async (req, res) => {
    try {
      const userId = res.locals.user?.sub as string | undefined
      if (!userId) return res.status(401).json({ message: 'Unauthorized.' })
      const id = pid(req.params.id)
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: 'Invalid request id.' })
      }
      const doc = await ConsultationRequestModel.findOne({ _id: id, userId })
      if (!doc) return res.status(404).json({ message: 'Request not found.' })
      if (doc.serviceType !== 'Onsite visit') {
        return res.status(400).json({ message: 'Documents are only for onsite visits.' })
      }
      if (doc.status === 'completed' || doc.status === 'cancelled') {
        return res.status(400).json({ message: 'Upload is not allowed for this request status.' })
      }
      const file = req.file
      if (!file) {
        return res.status(400).json({ message: 'File is required (images or PDF, max 8MB).' })
      }
      const relKey = path.join('consultations', id, file.filename).replace(/\\/g, '/')
      doc.documents.push({
        originalName: file.originalname.slice(0, 240),
        storageKey: relKey,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
      })
      await doc.save()
      const last = doc.documents[doc.documents.length - 1]
      return res.status(201).json({
        document: {
          id: String(last._id),
          originalName: last.originalName,
          mimeType: last.mimeType,
          uploadedAt: last.uploadedAt,
        },
      })
    } catch {
      return res.status(500).json({ message: 'Could not upload file.' })
    }
  },
)

servicesRouter.get('/consultation-requests/:id/documents/:docId/file', requireUser, async (req, res) => {
  try {
    const userId = res.locals.user?.sub as string | undefined
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' })
    const id = pid(req.params.id)
    const docId = pid(req.params.docId)
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(docId)) {
      return res.status(400).json({ message: 'Invalid id.' })
    }
    const r = await ConsultationRequestModel.findOne({ _id: id, userId }).lean()
    if (!r) return res.status(404).json({ message: 'Not found.' })
    const d = (r.documents ?? []).find((x) => String(x._id) === docId)
    if (!d) return res.status(404).json({ message: 'Document not found.' })
    const resolved = resolveConsultationDocumentFilePath(d.storageKey)
    if (!resolved.ok) return res.status(400).json({ message: 'Invalid path.' })
    const full = resolved.fullPath
    if (!fs.existsSync(full)) return res.status(404).json({ message: 'File missing.' })
    res.setHeader('Content-Type', d.mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(d.originalName)}"`)
    return fs.createReadStream(full).pipe(res)
  } catch {
    return res.status(500).json({ message: 'Could not read file.' })
  }
})

servicesRouter.patch('/consultation-requests/:id/cancel', requireUser, async (req, res) => {
  try {
    const userId = res.locals.user?.sub as string | undefined
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' })

    const id = pid(req.params.id)
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id.' })
    }

    const doc = await ConsultationRequestModel.findOne({ _id: id, userId })
    if (!doc) return res.status(404).json({ message: 'Request not found.' })

    if (doc.status === 'in_progress') {
      return res.status(400).json({
        message: 'This request is in progress and cannot be cancelled.',
      })
    }
    if (doc.status === 'completed' || doc.status === 'cancelled') {
      return res.status(400).json({ message: 'This request cannot be cancelled.' })
    }

    doc.status = 'cancelled'
    await doc.save()

    void notifyUser(userId, {
      kind: 'consultation_cancelled',
      title: 'Consultation cancelled',
      body: 'Your consultation request was cancelled.',
      link: '/services/my-consultation-requests',
    })

    return res.json({
      request: {
        id: String(doc._id),
        status: doc.status,
        updatedAt: doc.updatedAt,
      },
    })
  } catch {
    return res.status(500).json({ message: 'Could not cancel request.' })
  }
})

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseMachineryDurationDays(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(raw)
  if (typeof raw === 'string' && raw.trim()) {
    const n = parseInt(raw.trim(), 10)
    if (Number.isFinite(n)) return n
  }
  return NaN
}

servicesRouter.post('/machinery-rental-requests', requireUser, async (req, res) => {
  try {
    const userId = res.locals.user?.sub as string | undefined
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' })
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(403).json({ message: 'Invalid session. Please log in again.' })
    }
    const userObjectId = new mongoose.Types.ObjectId(userId)

    const body = req.body as Record<string, unknown>
    const {
      equipmentId: equipmentIdRaw,
      equipmentType: equipmentTypeLegacy,
      startDate,
      durationDays,
      preferredTime,
      district,
      contactName,
      phone,
      email,
      farmAddress,
      notes,
      quantity,
    } = body

    let equipmentId =
      typeof equipmentIdRaw === 'string' && equipmentIdRaw.trim()
        ? equipmentIdRaw.trim()
        : typeof equipmentTypeLegacy === 'string'
          ? resolveEquipmentIdFromDoc({
              equipmentType: equipmentTypeLegacy,
            })
          : ''
    if (!equipmentId) {
      return res.status(400).json({ message: 'Invalid equipment selection.' })
    }

    if (typeof startDate !== 'string' || !ISO_DATE_RE.test(startDate.trim())) {
      return res.status(400).json({ message: 'Start date must be YYYY-MM-DD.' })
    }
    const dur = parseMachineryDurationDays(durationDays)
    if (Number.isNaN(dur) || dur < 1 || dur > 30) {
      return res.status(400).json({ message: 'Duration must be between 1 and 30 days.' })
    }
    const qtyRaw = typeof quantity === 'number' ? quantity : parseInt(String(quantity ?? ''), 10)
    const qty = Number.isFinite(qtyRaw) ? Math.floor(qtyRaw) : NaN
    if (Number.isNaN(qty) || qty < 1 || qty > 20) {
      return res.status(400).json({ message: 'Quantity must be between 1 and 20.' })
    }
    if (
      typeof preferredTime !== 'string' ||
      !MACHINERY_PREFERRED_TIMES.includes(preferredTime as (typeof MACHINERY_PREFERRED_TIMES)[number])
    ) {
      return res.status(400).json({ message: 'Invalid preferred time.' })
    }
    if (typeof district !== 'string' || !ALLOWED_DISTRICTS.includes(district as (typeof ALLOWED_DISTRICTS)[number])) {
      return res.status(400).json({ message: 'Invalid district.' })
    }
    if (typeof contactName !== 'string' || !contactName.trim()) {
      return res.status(400).json({ message: 'Contact name is required.' })
    }
    if (typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ message: 'Phone is required.' })
    }
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required.' })
    }
    if (typeof farmAddress !== 'string' || !farmAddress.trim()) {
      return res.status(400).json({ message: 'Farm address is required.' })
    }

    const hasDbCatalog = await dbHasAnyMachineryEquipment()
    if (hasDbCatalog) {
      const eq = await findActiveEquipmentForBooking(equipmentId)
      if (!eq) {
        return res.status(400).json({ message: 'Invalid or unavailable equipment selection.' })
      }
      const districtCheck = await assertDistrictBookingAllowed(eq, district, startDate.trim(), dur, qty)
      if (!districtCheck.ok) {
        return res.status(400).json({ message: districtCheck.message })
      }
    } else if (!isValidMachineryEquipmentId(equipmentId)) {
      return res.status(400).json({ message: 'Invalid equipment selection.' })
    }

    const notesStr = typeof notes === 'string' ? notes : ''
    const dailyRate = getMachineryDailyRate(equipmentId)

    const doc = await MachineryRentalRequestModel.create({
      userId: userObjectId,
      equipmentId,
      startDate: startDate.trim(),
      durationDays: dur,
      quantity: qty,
      dailyRate,
      preferredTime,
      district,
      contactName: contactName.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      farmAddress: farmAddress.trim(),
      notes: notesStr.trim(),
    })

    void notifyAdmin({
      kind: 'machinery_rental_new',
      title: 'New machinery rental request',
      body: `${contactName.trim()} requested a rental starting ${startDate.trim()} in ${district}.`,
      link: '/admin/machinery-rentals',
    })

    const labelMap = await getLabelsByEquipmentIds([equipmentId])
    return res.status(201).json({
      request: mapMachineryRentalRow(doc.toObject(), labelMap.get(equipmentId)),
    })
  } catch {
    return res.status(500).json({ message: 'Could not save rental request.' })
  }
})

servicesRouter.get('/machinery-rental-requests', requireUser, async (req, res) => {
  try {
    const userId = res.locals.user?.sub as string | undefined
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' })
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(403).json({ message: 'Invalid session. Please log in again.' })
    }

    const rows = await MachineryRentalRequestModel.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()

    const ids = rows.map((r) => resolveEquipmentIdFromDoc(r))
    const labelMap = await getLabelsByEquipmentIds(ids)
    return res.json({
      requests: rows.map((r) => {
        const eid = resolveEquipmentIdFromDoc(r)
        return mapMachineryRentalRow(r, labelMap.get(eid))
      }),
    })
  } catch {
    return res.status(500).json({ message: 'Could not load rental requests.' })
  }
})

servicesRouter.get('/machinery-rental-requests/:id', requireUser, async (req, res) => {
  try {
    const userId = res.locals.user?.sub as string | undefined
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' })
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(403).json({ message: 'Invalid session. Please log in again.' })
    }
    const id = pid(req.params.id)
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id.' })
    }
    const r = await MachineryRentalRequestModel.findOne({
      _id: id,
      userId: new mongoose.Types.ObjectId(userId),
    }).lean()
    if (!r) return res.status(404).json({ message: 'Request not found.' })
    const eid = resolveEquipmentIdFromDoc(r)
    const labelMap = await getLabelsByEquipmentIds([eid])
    return res.json({ request: mapMachineryRentalRow(r, labelMap.get(eid)) })
  } catch {
    return res.status(500).json({ message: 'Could not load request.' })
  }
})

servicesRouter.patch('/machinery-rental-requests/:id/cancel', requireUser, async (req, res) => {
  try {
    const userId = res.locals.user?.sub as string | undefined
    if (!userId) return res.status(401).json({ message: 'Unauthorized.' })
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(403).json({ message: 'Invalid session. Please log in again.' })
    }
    const id = pid(req.params.id)
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id.' })
    }
    const doc = await MachineryRentalRequestModel.findOne({
      _id: id,
      userId: new mongoose.Types.ObjectId(userId),
    })
    if (!doc) return res.status(404).json({ message: 'Request not found.' })
    if (doc.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending rental requests can be cancelled.' })
    }
    doc.status = 'cancelled'
    await doc.save()

    void notifyUser(userId, {
      kind: 'machinery_cancelled',
      title: 'Rental request cancelled',
      body: 'Your machinery rental request was cancelled.',
      link: '/services/my-machinery-rentals',
    })

    return res.json({
      request: {
        id: String(doc._id),
        status: doc.status,
        updatedAt: doc.updatedAt,
      },
    })
  } catch {
    return res.status(500).json({ message: 'Could not cancel request.' })
  }
})

attachUserEngagementRoutes(servicesRouter)
