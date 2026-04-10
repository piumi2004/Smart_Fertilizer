import { isValidEmail, normalizePhone } from './registrationFieldErrors'

/** Shared business + contact + address fields (website optional, not validated). */
export type AdminSellerCoreFields = {
  name: string
  registrationNumber: string
  storeType: string
  onlineStore: string
  contactName: string
  email: string
  phone: string
  addressLine1: string
  city: string
  region: string
  postalCode: string
  country: string
  taxNumber: string
}

export type AdminSellerAddFormValues = AdminSellerCoreFields & {
  website: string
  password: string
  confirmPassword: string
}

export function adminSellerCoreFieldErrors(
  values: AdminSellerCoreFields,
): Partial<Record<keyof AdminSellerCoreFields, string>> {
  const next: Partial<Record<keyof AdminSellerCoreFields, string>> = {}

  if (!values.name.trim()) next.name = 'Business name is required.'
  if (!values.registrationNumber.trim()) {
    next.registrationNumber = 'Registration number is required.'
  }
  if (!values.storeType.trim()) next.storeType = 'Store type is required.'
  if (!values.onlineStore.trim()) next.onlineStore = 'Online store name is required.'

  if (!values.contactName.trim()) next.contactName = 'Contact person is required.'

  if (!values.email.trim()) next.email = 'Email is required.'
  else if (!isValidEmail(values.email)) next.email = 'Enter a valid email.'

  const p = normalizePhone(values.phone)
  if (!p) next.phone = 'Phone number is required.'
  else if (p.replace(/\D/g, '').length !== 10) {
    next.phone = 'Enter a valid 10-digit phone number.'
  }

  if (!values.addressLine1.trim()) next.addressLine1 = 'Address is required.'
  if (!values.city.trim()) next.city = 'City is required.'
  if (!values.region.trim()) next.region = 'Region is required.'
  if (!values.postalCode.trim()) next.postalCode = 'Postal code is required.'
  if (!values.country.trim()) next.country = 'Country is required.'
  if (!values.taxNumber.trim()) next.taxNumber = 'Tax number is required.'

  return next
}

export function adminSellerPasswordFieldErrors(values: {
  password: string
  confirmPassword: string
}): Partial<Record<'password' | 'confirmPassword', string>> {
  const next: Partial<Record<'password' | 'confirmPassword', string>> = {}

  if (!values.password) next.password = 'Password is required.'
  else if (values.password.length < 6) {
    next.password = 'Password must be at least 6 characters.'
  }

  if (!values.confirmPassword) {
    next.confirmPassword = 'Confirm your password.'
  } else if (values.confirmPassword !== values.password) {
    next.confirmPassword = 'Passwords do not match.'
  }

  return next
}

export function adminSellerAddFieldErrors(
  values: AdminSellerAddFormValues,
): Partial<Record<keyof AdminSellerAddFormValues, string>> {
  return {
    ...adminSellerCoreFieldErrors(values),
    ...adminSellerPasswordFieldErrors(values),
  }
}
