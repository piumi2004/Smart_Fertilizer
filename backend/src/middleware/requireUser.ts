import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'govismart_auth'
const JWT_SECRET = process.env.JWT_SECRET || ''

type UserPayload = {
  sub?: string
}

export const requireUser: RequestHandler = (req, res, next) => {
  if (!JWT_SECRET) {
    return res.status(500).json({ message: 'Auth misconfigured.' })
  }

  const token = req.cookies?.[COOKIE_NAME] as string | undefined
  if (!token) return res.status(401).json({ message: 'Unauthorized.' })

  try {
    const payload = jwt.verify(token, JWT_SECRET) as UserPayload
    if (!payload.sub || typeof payload.sub !== 'string') {
      return res.status(403).json({ message: 'Forbidden.' })
    }

    res.locals.user = { sub: payload.sub }
    next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized.' })
  }
}

