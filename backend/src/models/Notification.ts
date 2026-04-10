import mongoose from 'mongoose'

export type NotificationAudience = 'user' | 'seller' | 'admin'

const NotificationSchema = new mongoose.Schema(
  {
    audience: {
      type: String,
      required: true,
      enum: ['user', 'seller', 'admin'] satisfies NotificationAudience[],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      default: null,
      index: true,
    },
    kind: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    link: { type: String, default: '', trim: true, maxlength: 500 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
)

NotificationSchema.index({ audience: 1, userId: 1, createdAt: -1 })
NotificationSchema.index({ audience: 1, sellerId: 1, createdAt: -1 })
NotificationSchema.index({ audience: 1, createdAt: -1 })

export const NotificationModel = mongoose.model('Notification', NotificationSchema)
