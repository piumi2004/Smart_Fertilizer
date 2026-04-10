import mongoose from 'mongoose'

import { NotificationModel } from '../models/Notification'

export type NotifyPayload = {
  kind: string
  title: string
  body: string
  link?: string
}

export async function notifyUser(userId: string, payload: NotifyPayload) {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) return
    await NotificationModel.create({
      audience: 'user',
      userId,
      sellerId: null,
      kind: payload.kind,
      title: payload.title,
      body: payload.body,
      link: payload.link?.trim() ?? '',
    })
  } catch {
    /* non-blocking */
  }
}

export async function notifySeller(sellerId: string, payload: NotifyPayload) {
  try {
    if (!mongoose.Types.ObjectId.isValid(sellerId)) return
    await NotificationModel.create({
      audience: 'seller',
      userId: null,
      sellerId,
      kind: payload.kind,
      title: payload.title,
      body: payload.body,
      link: payload.link?.trim() ?? '',
    })
  } catch {
    /* non-blocking */
  }
}

export async function notifyAdmin(payload: NotifyPayload) {
  try {
    await NotificationModel.create({
      audience: 'admin',
      userId: null,
      sellerId: null,
      kind: payload.kind,
      title: payload.title,
      body: payload.body,
      link: payload.link?.trim() ?? '',
    })
  } catch {
    /* non-blocking */
  }
}
