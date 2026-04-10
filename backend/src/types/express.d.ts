export {}

declare global {
  namespace Express {
    interface Locals {
      admin?: { sub: string }
      user?: { sub: string }
      seller?: { sub: string }
    }
  }
}
