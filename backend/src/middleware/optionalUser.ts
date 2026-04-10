import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'govismart_auth'
const JWT_SECRET = process.env.JWT_SECRET || ''

type UserPayload = {
  sub?: string
}

/** Sets `res.locals.user` when a valid user JWT cookie is present. */
export const optionalUser: RequestHandler = (req, res, next) => {
  if (!JWT_SECRET) return next()

  const token = req.cookies?.[COOKIE_NAME] as string | undefined
  if (!token) return next()

  try {
    const payload = jwt.verify(token, JWT_SECRET) as UserPayload
    if (payload.sub && typeof payload.sub === 'string') {
      res.locals.user = { sub: payload.sub }
    }
  } catch {
    /* guest checkout */
  }
  next()
}
