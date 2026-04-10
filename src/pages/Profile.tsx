import { useCallback, useEffect, useMemo, useState } from 'react'

import { apiUrl } from '../apiBase'
import { isFertilizerOrderCancellableStatus } from '../utils/fertilizerOrderStatus'
import { isAgriOrderCancellableStatus } from '../utils/agriOrderStatus'
import { Link, useSearchParams } from 'react-router-dom'
import { ContactPanel } from './ContactPanel'
import {
  UserFeedbackPanel,
  UserInquiryPanel,
  UserReviewPanel,
} from './profile/UserEngagementPanels'
import {
  formatCategoryShort,
  formatRentalTableDate,
  formatServiceTypeShort,
  formatTableDate,
  machineryEquipmentDisplay,
  rentalStatusDisplay,
  statusDisplay,
  type ConsultationRequestRow,
  type MachineryRentalRow,
} from './services/serviceRequestsShared'

type MeUser = {
  id: string
  name: string
  email: string
  phone: string
}

const RECENT_LIMIT = 8

type FertilizerOrderRow = {
  id: string
  orderCode: string
  createdAt: string
  status: string
  estimatedDeliveryAt?: string | null
  trackingRef?: string
  subtotalRs: number
  shippingRs: number
  discountRs: number
  totalRs: number
  lines: {
    productId: string
    productName: string
    categoryLabel: string
    qtyKg: number
    pricePerKg: number
    lineTotal: number
  }[]
  shipping: {
    firstName: string
    lastName: string
    phone: string
    email: string
    address: string
    address2?: string
    district: string
    postal?: string
    country?: string
  }
  payment: { label: string; cardMasked?: string; nameOnCard?: string }
  fulfillmentEvents?: { at: string; status: string; message?: string }[]
  /** True when the customer may cancel online (only before out for delivery). */
  canCancel?: boolean
}

/** Seeds & tools (products store / agri) orders — shape from GET /api/agri/orders/me */
type AgriOrderRow = {
  id: string
  orderCode: string
  createdAt: string
  status: string
  estimatedDeliveryAt?: string | null
  trackingRef?: string
  subtotalRs: number
  shippingRs: number
  discountRs: number
  totalRs: number
  lines: {
    productId: string
    productName: string
    categoryLabel: string
    qtyUnits: number
    pricePerUnit: number
    lineTotal: number
  }[]
  shipping: FertilizerOrderRow['shipping']
  payment: FertilizerOrderRow['payment']
}

function mapAgriOrderFromApi(raw: Record<string, unknown>): AgriOrderRow | null {
  const id = String(raw._id ?? '')
  const orderCode = String(raw.orderCode ?? '')
  if (!id || !orderCode) return null
  const ship = (raw.shipping as Record<string, unknown>) || {}
  const pay = (raw.payment as Record<string, unknown>) || {}
  const linesRaw = Array.isArray(raw.lines) ? raw.lines : []
  const createdRaw = raw.createdAt
  const createdAt =
    typeof createdRaw === 'string'
      ? createdRaw
      : createdRaw instanceof Date
        ? createdRaw.toISOString()
        : new Date(String(createdRaw ?? Date.now())).toISOString()
  return {
    id,
    orderCode,
    createdAt,
    status: String(raw.status ?? 'confirmed'),
    estimatedDeliveryAt: raw.estimatedDeliveryAt
      ? String(raw.estimatedDeliveryAt)
      : null,
    trackingRef: typeof raw.trackingRef === 'string' ? raw.trackingRef : '',
    subtotalRs: Number(raw.subtotalRs ?? 0),
    shippingRs: Number(raw.shippingRs ?? 0),
    discountRs: Number(raw.discountRs ?? 0),
    totalRs: Number(raw.totalRs ?? 0),
    lines: linesRaw.map((ln) => {
      const l = ln as Record<string, unknown>
      return {
        productId: String(l.productId ?? ''),
        productName: String(l.productName ?? ''),
        categoryLabel: String(l.categoryLabel ?? ''),
        qtyUnits: Number(l.qtyUnits ?? 0),
        pricePerUnit: Number(l.pricePerUnit ?? 0),
        lineTotal: Number(l.lineTotal ?? 0),
      }
    }),
    shipping: {
      firstName: String(ship.firstName ?? ''),
      lastName: String(ship.lastName ?? ''),
      phone: String(ship.phone ?? ''),
      email: String(ship.email ?? ''),
      address: String(ship.address ?? ''),
      address2: String(ship.address2 ?? ''),
      district: String(ship.district ?? ''),
      postal: String(ship.postal ?? ''),
      country: String(ship.country ?? ''),
    },
    payment: {
      label: String(pay.label ?? '—'),
      cardMasked: typeof pay.cardMasked === 'string' ? pay.cardMasked : undefined,
      nameOnCard: typeof pay.nameOnCard === 'string' ? pay.nameOnCard : undefined,
    },
  }
}

/** Saved ML fertilizer recommendations — GET /api/fertilizer/recommendations/me */
type FertilizerRecommendationRow = {
  id: string
  district: string
  agroZone: string
  season: string
  soilPh: number
  totalNPercent: number
  availablePMgkg: number
  availableKMgkg: number
  organicCarbonPercent: number
  rainfall30dMm: number
  temperatureMeanC: number
  ureaKgHa: number
  tspKgHa: number
  mopKgHa: number
  createdAt: string
}

function formatRecSeason(s: string) {
  const x = s.toLowerCase()
  if (x === 'maha') return 'Maha'
  if (x === 'yala') return 'Yala'
  return s
}

function formatFertRs(n: number) {
  return `Rs. ${n.toFixed(2)}`
}

function formatFertOrderDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-LK', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function fertStatusLabel(s: string) {
  switch (s) {
    case 'confirmed':
      return 'Confirmed'
    case 'processing':
      return 'Confirmed'
    case 'out_for_delivery':
      return 'Out for delivery'
    case 'delivered':
      return 'Delivered'
    case 'cancelled':
      return 'Cancelled'
    default:
      return s
  }
}

/** Add new dashboard sections here and in NAV + render below. */
const DASH_SECTIONS = [
  'overview',
  'account',
  'orders',
  'agri-orders',
  'recommendations',
  'consultations',
  'machinery',
  'feedback',
  'inquiries',
  'reviews',
  'contact',
] as const
type DashSection = (typeof DASH_SECTIONS)[number]

const NAV: { id: DashSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'account', label: 'Account' },
  { id: 'orders', label: 'Fertilizer orders' },
  { id: 'agri-orders', label: 'Seeds & tools orders' },
  { id: 'recommendations', label: 'Fertilizer recommendations' },
  { id: 'consultations', label: 'Consultations' },
  { id: 'machinery', label: 'Machinery rentals' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'inquiries', label: 'Inquiries' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'contact', label: 'Contact' },
]

function parseSection(raw: string | null): DashSection {
  if (raw && (DASH_SECTIONS as readonly string[]).includes(raw)) {
    return raw as DashSection
  }
  return 'overview'
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function firstName(full: string) {
  const p = full.trim().split(/\s+/)[0]
  return p || 'there'
}

function statusPillClass(badge: string) {
  return `admin-consultations__st admin-consultations__st--${badge}`
}

export default function Profile() {
  const [searchParams] = useSearchParams()
  const section = parseSection(searchParams.get('section'))

  const [user, setUser] = useState<MeUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [consultations, setConsultations] = useState<ConsultationRequestRow[]>([])
  const [consultationsErr, setConsultationsErr] = useState<string | null>(null)
  const [rentals, setRentals] = useState<MachineryRentalRow[]>([])
  const [rentalsErr, setRentalsErr] = useState<string | null>(null)
  const [fertilizerOrders, setFertilizerOrders] = useState<FertilizerOrderRow[]>([])
  const [fertilizerOrdersErr, setFertilizerOrdersErr] = useState<string | null>(null)
  const [agriOrders, setAgriOrders] = useState<AgriOrderRow[]>([])
  const [agriOrdersErr, setAgriOrdersErr] = useState<string | null>(null)
  const [fertRecommendations, setFertRecommendations] = useState<FertilizerRecommendationRow[]>([])
  const [fertRecommendationsErr, setFertRecommendationsErr] = useState<string | null>(null)
  const [fertCancelErr, setFertCancelErr] = useState<string | null>(null)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)
  const [agriCancelErr, setAgriCancelErr] = useState<string | null>(null)
  const [cancellingAgriOrderId, setCancellingAgriOrderId] = useState<string | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formCurrentPassword, setFormCurrentPassword] = useState('')
  const [formNewPassword, setFormNewPassword] = useState('')
  const [formConfirmPassword, setFormConfirmPassword] = useState('')
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)

  const loadMe = useCallback(async () => {
    setError(null)
    const res = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' })
    const data = (await res.json().catch(() => null)) as
      | { user?: MeUser; message?: string }
      | null

    if (!res.ok || !data?.user) {
      setError(data?.message || 'Could not load your profile.')
      setUser(null)
      return null
    }
    setUser(data.user)
    return data.user
  }, [])

  const loadActivity = useCallback(async () => {
    setConsultationsErr(null)
    setRentalsErr(null)
    setFertilizerOrdersErr(null)
    setAgriOrdersErr(null)
    setFertRecommendationsErr(null)
    try {
      const [cRes, rRes, oRes, aRes, recRes] = await Promise.all([
        fetch(apiUrl('/api/services/consultation-requests'), { credentials: 'include' }),
        fetch(apiUrl('/api/services/machinery-rental-requests'), { credentials: 'include' }),
        fetch(apiUrl('/api/fertilizer/orders/me'), { credentials: 'include' }),
        fetch(apiUrl('/api/agri/orders/me'), { credentials: 'include' }),
        fetch(apiUrl('/api/fertilizer/recommendations/me'), { credentials: 'include' }),
      ])
      const cData = (await cRes.json().catch(() => null)) as
        | { requests?: ConsultationRequestRow[]; message?: string }
        | null
      const rData = (await rRes.json().catch(() => null)) as
        | { requests?: MachineryRentalRow[]; message?: string }
        | null
      const oData = (await oRes.json().catch(() => null)) as
        | { orders?: FertilizerOrderRow[]; message?: string }
        | null
      const aData = (await aRes.json().catch(() => null)) as
        | { orders?: Record<string, unknown>[]; message?: string }
        | null
      const recData = (await recRes.json().catch(() => null)) as
        | { recommendations?: FertilizerRecommendationRow[]; message?: string }
        | null

      if (cRes.ok && Array.isArray(cData?.requests)) setConsultations(cData.requests)
      else {
        setConsultations([])
        setConsultationsErr(cData?.message || 'Could not load consultation requests.')
      }

      if (rRes.ok && Array.isArray(rData?.requests)) setRentals(rData.requests)
      else {
        setRentals([])
        setRentalsErr(rData?.message || 'Could not load machinery rentals.')
      }

      if (oRes.ok) {
        setFertilizerOrders(Array.isArray(oData?.orders) ? oData.orders : [])
        setFertilizerOrdersErr(null)
      } else {
        setFertilizerOrders([])
        setFertilizerOrdersErr(
          oData?.message ||
            (oRes.status === 401 ? 'Sign in to see fertilizer orders.' : 'Could not load fertilizer orders.'),
        )
      }

      if (aRes.ok && Array.isArray(aData?.orders)) {
        const parsed = aData.orders
          .map((row) => mapAgriOrderFromApi(row))
          .filter((x): x is AgriOrderRow => x !== null)
        setAgriOrders(parsed)
        setAgriOrdersErr(null)
      } else {
        setAgriOrders([])
        setAgriOrdersErr(
          aData?.message ||
            (aRes.status === 401
              ? 'Sign in to see seeds & tools orders.'
              : 'Could not load seeds & tools orders.'),
        )
      }

      if (recRes.ok && Array.isArray(recData?.recommendations)) {
        setFertRecommendations(recData.recommendations)
        setFertRecommendationsErr(null)
      } else {
        setFertRecommendations([])
        setFertRecommendationsErr(
          recData?.message ||
            (recRes.status === 401
              ? 'Sign in to see saved recommendations.'
              : 'Could not load fertilizer recommendations.'),
        )
      }
    } catch {
      setConsultations([])
      setRentals([])
      setFertilizerOrders([])
      setAgriOrders([])
      setConsultationsErr('Could not load consultation requests.')
      setRentalsErr('Could not load machinery rentals.')
      setFertilizerOrdersErr('Could not load fertilizer orders.')
      setAgriOrdersErr('Could not load seeds & tools orders.')
      setFertRecommendations([])
      setFertRecommendationsErr('Could not load fertilizer recommendations.')
    }
  }, [])

  const cancelFertilizerOrder = useCallback(
    async (orderCode: string, orderId: string) => {
      if (
        !window.confirm(
          'Cancel this order? You can only cancel before the order is out for delivery. This cannot be undone.',
        )
      ) {
        return
      }
      setFertCancelErr(null)
      setCancellingOrderId(orderId)
      try {
        const res = await fetch(
          apiUrl(`/api/fertilizer/orders/cancel-by-code/${encodeURIComponent(orderCode)}`),
          { method: 'POST', credentials: 'include' },
        )
        const data = (await res.json().catch(() => null)) as { message?: string } | null
        if (!res.ok) {
          setFertCancelErr(data?.message || 'Could not cancel order.')
          return
        }
        await loadActivity()
      } finally {
        setCancellingOrderId(null)
      }
    },
    [loadActivity],
  )

  const cancelAgriOrder = useCallback(
    async (orderCode: string, orderId: string) => {
      if (
        !window.confirm(
          'Cancel this order? You can only cancel before the order is out for delivery. This cannot be undone.',
        )
      ) {
        return
      }

      setAgriCancelErr(null)
      setCancellingAgriOrderId(orderId)
      try {
        const res = await fetch(
          apiUrl(`/api/agri/orders/cancel-by-code/${encodeURIComponent(orderCode)}`),
          { method: 'POST', credentials: 'include' },
        )
        const data = (await res.json().catch(() => null)) as { message?: string } | null
        if (!res.ok) {
          setAgriCancelErr(data?.message || 'Could not cancel order.')
          return
        }
        await loadActivity()
      } finally {
        setCancellingAgriOrderId(null)
      }
    },
    [loadActivity],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const u = await loadMe()
      if (cancelled) return
      if (u) {
        setFormName(u.name)
        setFormEmail(u.email)
        setFormPhone(u.phone)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [loadMe])

  useEffect(() => {
    if (!user) {
      setActivityLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setActivityLoading(true)
      await loadActivity()
      if (!cancelled) setActivityLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, loadActivity])

  const passwordAttempt =
    formCurrentPassword.trim() !== '' ||
    formNewPassword.trim() !== '' ||
    formConfirmPassword.trim() !== ''

  const formErrors = useMemo(() => {
    const next: Partial<Record<'name' | 'email' | 'phone', string>> = {}
    if (!formName.trim()) next.name = 'Name is required.'
    if (!formEmail.trim()) next.email = 'Email is required.'
    else if (!isValidEmail(formEmail)) next.email = 'Enter a valid email.'
    if (!formPhone.trim()) next.phone = 'Phone is required.'
    else if (formPhone.replace(/\D/g, '').length < 9) {
      next.phone = 'Enter a valid phone number.'
    }
    return next
  }, [formName, formEmail, formPhone])

  const passwordErrors = useMemo(() => {
    const next: Partial<
      Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>
    > = {}
    if (!passwordAttempt) return next
    if (!formCurrentPassword.trim()) {
      next.currentPassword = 'Enter your current password.'
    }
    if (!formNewPassword) {
      next.newPassword = 'Enter a new password.'
    } else if (formNewPassword.length < 6) {
      next.newPassword = 'At least 6 characters.'
    }
    if (formNewPassword !== formConfirmPassword) {
      next.confirmPassword = 'Does not match new password.'
    }
    return next
  }, [
    passwordAttempt,
    formCurrentPassword,
    formNewPassword,
    formConfirmPassword,
  ])

  const allFieldErrors = { ...formErrors, ...passwordErrors }
  const profileDirty =
    !!user &&
    (formName.trim() !== user.name ||
      formEmail.trim().toLowerCase() !== user.email ||
      formPhone.trim() !== user.phone)
  const passwordDirty =
    passwordAttempt &&
    Object.keys(passwordErrors).length === 0 &&
    formNewPassword.length >= 6

  const canSave =
    Object.keys(allFieldErrors).length === 0 &&
    !saving &&
    user &&
    (profileDirty || passwordDirty)

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSaveOk(null)
    setTouched({
      name: true,
      email: true,
      phone: true,
      currentPassword: passwordAttempt,
      newPassword: passwordAttempt,
      confirmPassword: passwordAttempt,
    })
    if (Object.keys(allFieldErrors).length > 0 || !user) return

    setSaving(true)
    try {
      const payload: Record<string, string> = {
        name: formName.trim(),
        email: formEmail.trim(),
        phone: formPhone.trim(),
      }
      if (passwordAttempt) {
        payload.currentPassword = formCurrentPassword
        payload.newPassword = formNewPassword
        payload.confirmPassword = formConfirmPassword
      }

      const res = await fetch(apiUrl('/api/auth/profile'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as
        | { user?: MeUser; message?: string }
        | null
      if (!res.ok || !data?.user) {
        setSaveError(data?.message || 'Could not update profile.')
        return
      }
      setUser(data.user)
      setFormName(data.user.name)
      setFormEmail(data.user.email)
      setFormPhone(data.user.phone)
      setFormCurrentPassword('')
      setFormNewPassword('')
      setFormConfirmPassword('')
      setSaveOk(
        passwordAttempt ? 'Account and password updated.' : 'Account details saved.',
      )
      window.dispatchEvent(new CustomEvent('govismart:profile-updated', { detail: data.user }))
    } catch {
      setSaveError('Could not update profile.')
    } finally {
      setSaving(false)
    }
  }

  const navLinkTo = (id: DashSection) =>
    id === 'overview' ? '/profile' : `/profile?section=${id}`

  const sectionTitle: Record<DashSection, string> = {
    overview: 'Overview',
    account: 'Account settings',
    orders: 'Fertilizer orders',
    'agri-orders': 'Seeds & tools orders',
    recommendations: 'Fertilizer recommendations',
    consultations: 'Consultation requests',
    machinery: 'Machinery rentals',
    feedback: 'Feedback',
    inquiries: 'Inquiries',
    reviews: 'Ratings & reviews',
    contact: 'Contact',
  }

  if (loading) {
    return (
      <div className="services-request user-dash-page">
        <div className="admin-shell admin-shell--loading user-dash">
          <p className="admin-shell__loadingText">Loading your dashboard…</p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="services-request user-dash-page">
        <div className="admin-shell admin-shell--loading user-dash">
          <div className="user-dash__centered">
            <p className="admin-shell__loadingText">{error || 'Profile not available.'}</p>
            <Link to="/" className="admin-shell__link user-dash__centeredLink">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const recentConsultations = consultations.slice(0, RECENT_LIMIT)
  const recentRentals = rentals.slice(0, RECENT_LIMIT)

  return (
    <div className="services-request user-dash-page">
      <div className="admin-shell user-dash">
        <aside className="admin-shell__aside" aria-label="Dashboard navigation">
          <div className="admin-shell__brand">
            <span className="admin-shell__brandName">GoviSmart</span>
            <span className="admin-shell__brandMeta">My account</span>
          </div>
          <nav className="admin-shell__nav">
            {NAV.map((item) => (
              <Link
                key={item.id}
                to={navLinkTo(item.id)}
                className={
                  section === item.id
                    ? 'admin-shell__navLink admin-shell__navLink--active'
                    : 'admin-shell__navLink'
                }
                aria-current={section === item.id ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="admin-shell__body">
          <header className="admin-shell__top">
            <h1 className="admin-shell__title">{sectionTitle[section]}</h1>
            <div className="admin-shell__actions">
              <Link className="admin-shell__link" to="/">
                Home
              </Link>
            </div>
          </header>

          <div className="admin-shell__content">
            {section === 'overview' ? (
            <section className="user-dash__overview" aria-labelledby="user-dash-overview-title">
              <div className="user-dash__overviewIntro">
                <h2 id="user-dash-overview-title" className="user-dash__overviewLead">
                  Hello, <strong>{firstName(user.name)}</strong>
                </h2>
              </div>

              <div className="user-dash__metricGrid">
                <article className="user-dash__metricCard user-dash__metricCard--orders">
                  <div className="user-dash__metricCardHead">
                    <span className="user-dash__metricIcon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M6 8h15l-1.5 9H7.5L6 8z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8 12.5h8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <circle cx="9" cy="20" r="1.5" fill="currentColor" />
                        <circle cx="18" cy="20" r="1.5" fill="currentColor" />
                      </svg>
                    </span>
                    <span className="user-dash__metricLabel">Fertilizer orders</span>
                  </div>
                  <p className="user-dash__metricValue">
                    {activityLoading ? '—' : fertilizerOrders.length}
                  </p>
                  <Link to="/profile?section=orders" className="user-dash__metricLink">
                    View fertilizer orders
                    <span className="user-dash__metricLinkChevron" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </article>

                <article className="user-dash__metricCard user-dash__metricCard--agri">
                  <div className="user-dash__metricCardHead">
                    <span className="user-dash__metricIcon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M12 3c-3 4-6 7.5-6 11a6 6 0 1 0 12 0c0-3.5-3-7-6-11Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 14v3M10 16h4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="user-dash__metricLabel">Seeds &amp; tools orders</span>
                  </div>
                  <p className="user-dash__metricValue">
                    {activityLoading ? '—' : agriOrders.length}
                  </p>
                  <Link to="/profile?section=agri-orders" className="user-dash__metricLink">
                    View seeds &amp; tools orders
                    <span className="user-dash__metricLinkChevron" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </article>

                <article className="user-dash__metricCard user-dash__metricCard--consultations">
                  <div className="user-dash__metricCardHead">
                    <span className="user-dash__metricIcon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M8 10h8M8 14h5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M6 4h12a2 2 0 0 1 2 2v12l-4-3H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="user-dash__metricLabel">Consultation requests</span>
                  </div>
                  <p className="user-dash__metricValue">
                    {activityLoading ? '—' : consultations.length}
                  </p>
                  <Link to="/profile?section=consultations" className="user-dash__metricLink">
                    View consultations
                    <span className="user-dash__metricLinkChevron" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </article>

                <article className="user-dash__metricCard user-dash__metricCard--machinery">
                  <div className="user-dash__metricCardHead">
                    <span className="user-dash__metricIcon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M4 16h2l1-4h10l1 4h2"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle cx="8" cy="18" r="2" stroke="currentColor" strokeWidth="2" />
                        <circle cx="17" cy="18" r="2" stroke="currentColor" strokeWidth="2" />
                        <path d="M7 12h10l-1-4H8l-1 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className="user-dash__metricLabel">Machinery rentals</span>
                  </div>
                  <p className="user-dash__metricValue">
                    {activityLoading ? '—' : rentals.length}
                  </p>
                  <Link to="/profile?section=machinery" className="user-dash__metricLink">
                    View machinery rentals
                    <span className="user-dash__metricLinkChevron" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </article>

                <article className="user-dash__metricCard user-dash__metricCard--orders">
                  <div className="user-dash__metricCardHead">
                    <span className="user-dash__metricIcon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M12 3v18M8 8h8M8 16h8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="user-dash__metricLabel">Fertilizer recommendations</span>
                  </div>
                  <p className="user-dash__metricValue">
                    {activityLoading ? '—' : fertRecommendations.length}
                  </p>
                  <Link to="/profile?section=recommendations" className="user-dash__metricLink">
                    View saved recommendations
                    <span className="user-dash__metricLinkChevron" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </article>
              </div>

              <div className="user-dash__quickBlock">
                <h3 className="user-dash__quickBlockTitle">Where to next</h3>
                <p className="user-dash__quickBlockLead">
                  Jump to a section — manage your profile, track orders, or open full service lists for details and
                  uploads.
                </p>
                <nav className="user-dash__tileGrid" aria-label="Quick links">
                  <Link to="/profile?section=account" className="user-dash__tile">
                    <span className="user-dash__tileTitle">Account &amp; security</span>
                    <span className="user-dash__tileDesc">Name, email, phone, and password</span>
                    <span className="user-dash__tileArrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                  <Link to="/profile?section=orders" className="user-dash__tile">
                    <span className="user-dash__tileTitle">Fertilizer order history</span>
                    <span className="user-dash__tileDesc">Track deliveries and past purchases</span>
                    <span className="user-dash__tileArrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                  <Link to="/profile?section=agri-orders" className="user-dash__tile">
                    <span className="user-dash__tileTitle">Seeds &amp; tools orders</span>
                    <span className="user-dash__tileDesc">Paddy seeds and farm tools from the products store</span>
                    <span className="user-dash__tileArrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                  <Link to="/profile?section=recommendations" className="user-dash__tile">
                    <span className="user-dash__tileTitle">Saved fertilizer recommendations</span>
                    <span className="user-dash__tileDesc">Urea, TSP, and MOP rates from the recommendation tool</span>
                    <span className="user-dash__tileArrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                  <Link to="/services/my-consultation-requests" className="user-dash__tile">
                    <span className="user-dash__tileTitle">All consultation requests</span>
                    <span className="user-dash__tileDesc">Full list with status and details</span>
                    <span className="user-dash__tileArrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                  <Link to="/services/my-machinery-rentals" className="user-dash__tile">
                    <span className="user-dash__tileTitle">All machinery rentals</span>
                    <span className="user-dash__tileDesc">Bookings and confirmations</span>
                    <span className="user-dash__tileArrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </nav>
              </div>
            </section>
          ) : null}

          {section === 'account' ? (
            <>
              <p className="user-dash__muted user-dash__muted--tight">
                Change account details — name, email, phone, and password.
              </p>
              <div className="user-dash__panel user-dash__panel--account">
              <form className="form user-dash__form user-dash__form--account" onSubmit={onSaveProfile} noValidate>
                {saveError ? (
                  <p className="admin-users__banner admin-users__banner--error" role="alert">
                    {saveError}
                  </p>
                ) : null}
                {saveOk ? (
                  <p className="user-dash__saveOk" role="status">
                    {saveOk}
                  </p>
                ) : null}

                <div className="user-dash__formGrid user-dash__formGrid--profile">
                  <div className="field">
                    <label className="field__label" htmlFor="profile-name">
                      Name
                    </label>
                    <input
                      id="profile-name"
                      className="field__input"
                      type="text"
                      autoComplete="name"
                      value={formName}
                      onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                      onChange={(e) => {
                        setFormName(e.target.value)
                        setSaveOk(null)
                      }}
                      aria-invalid={Boolean(touched.name && formErrors.name)}
                      aria-describedby={touched.name && formErrors.name ? 'profile-name-err' : undefined}
                    />
                    {touched.name && formErrors.name ? (
                      <p className="field__error" id="profile-name-err" role="alert">
                        {formErrors.name}
                      </p>
                    ) : null}
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor="profile-email">
                      Email
                    </label>
                    <input
                      id="profile-email"
                      className="field__input"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={formEmail}
                      onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                      onChange={(e) => {
                        setFormEmail(e.target.value)
                        setSaveOk(null)
                      }}
                      aria-invalid={Boolean(touched.email && formErrors.email)}
                      aria-describedby={
                        touched.email && formErrors.email ? 'profile-email-err' : undefined
                      }
                    />
                    {touched.email && formErrors.email ? (
                      <p className="field__error" id="profile-email-err" role="alert">
                        {formErrors.email}
                      </p>
                    ) : null}
                  </div>

                  <div className="field user-dash__formGrid__full">
                    <label className="field__label" htmlFor="profile-phone">
                      Phone
                    </label>
                    <input
                      id="profile-phone"
                      className="field__input"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      value={formPhone}
                      onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                      onChange={(e) => {
                        setFormPhone(e.target.value)
                        setSaveOk(null)
                      }}
                      aria-invalid={Boolean(touched.phone && formErrors.phone)}
                      aria-describedby={
                        touched.phone && formErrors.phone ? 'profile-phone-err' : undefined
                      }
                    />
                    {touched.phone && formErrors.phone ? (
                      <p className="field__error" id="profile-phone-err" role="alert">
                        {formErrors.phone}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="user-dash__formDivider" aria-hidden="true" />

                <p className="user-dash__formSectionTitle">Password</p>
                <p className="user-dash__formSectionLead">
                  Optional. Minimum 6 characters, same as when you registered.
                </p>

                <div className="user-dash__formGrid user-dash__formGrid--password">
                  <div className="field">
                    <label className="field__label" htmlFor="profile-current-password">
                      Current password
                    </label>
                    <input
                      id="profile-current-password"
                      className="field__input"
                      type="password"
                      autoComplete="current-password"
                      value={formCurrentPassword}
                      onBlur={() => setTouched((t) => ({ ...t, currentPassword: true }))}
                      onChange={(e) => {
                        setFormCurrentPassword(e.target.value)
                        setSaveOk(null)
                      }}
                      aria-invalid={Boolean(touched.currentPassword && passwordErrors.currentPassword)}
                      aria-describedby={
                        touched.currentPassword && passwordErrors.currentPassword
                          ? 'profile-current-password-err'
                          : undefined
                      }
                    />
                    {touched.currentPassword && passwordErrors.currentPassword ? (
                      <p className="field__error" id="profile-current-password-err" role="alert">
                        {passwordErrors.currentPassword}
                      </p>
                    ) : null}
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor="profile-new-password">
                      New password
                    </label>
                    <input
                      id="profile-new-password"
                      className="field__input"
                      type="password"
                      autoComplete="new-password"
                      value={formNewPassword}
                      onBlur={() => setTouched((t) => ({ ...t, newPassword: true }))}
                      onChange={(e) => {
                        setFormNewPassword(e.target.value)
                        setSaveOk(null)
                      }}
                      aria-invalid={Boolean(touched.newPassword && passwordErrors.newPassword)}
                      aria-describedby={
                        touched.newPassword && passwordErrors.newPassword
                          ? 'profile-new-password-err'
                          : undefined
                      }
                    />
                    {touched.newPassword && passwordErrors.newPassword ? (
                      <p className="field__error" id="profile-new-password-err" role="alert">
                        {passwordErrors.newPassword}
                      </p>
                    ) : null}
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor="profile-confirm-password">
                      Confirm new password
                    </label>
                    <input
                      id="profile-confirm-password"
                      className="field__input"
                      type="password"
                      autoComplete="new-password"
                      value={formConfirmPassword}
                      onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
                      onChange={(e) => {
                        setFormConfirmPassword(e.target.value)
                        setSaveOk(null)
                      }}
                      aria-invalid={Boolean(touched.confirmPassword && passwordErrors.confirmPassword)}
                      aria-describedby={
                        touched.confirmPassword && passwordErrors.confirmPassword
                          ? 'profile-confirm-password-err'
                          : undefined
                      }
                    />
                    {touched.confirmPassword && passwordErrors.confirmPassword ? (
                      <p className="field__error" id="profile-confirm-password-err" role="alert">
                        {passwordErrors.confirmPassword}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="user-dash__formActions">
                  <button type="submit" className="user-dash__pillBtn user-dash__pillBtn--primary" disabled={!canSave}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </form>
              </div>
            </>
          ) : null}

          {section === 'orders' ? (
            <>
              {fertilizerOrdersErr ? (
                <p className="admin-users__banner admin-users__banner--error" role="alert">
                  {fertilizerOrdersErr}
                </p>
              ) : null}

              {fertCancelErr ? (
                <p className="admin-users__banner admin-users__banner--error" role="alert">
                  {fertCancelErr}
                </p>
              ) : null}

              <p className="user-dash__muted user-dash__muted--tight">
                Fertilizer products ordered through the{' '}
                <Link className="admin-shell__link" to="/fertilizer-store">
                  fertilizer store
                </Link>
                .
              </p>

              {activityLoading ? (
                <p className="user-dash__muted">Loading…</p>
              ) : fertilizerOrders.length === 0 ? (
                <div className="user-dash__panel user-dash__panel--empty">
                  <p className="user-dash__muted">No fertilizer orders yet.</p>
                  <Link to="/fertilizer-store" className="user-dash__pillBtn user-dash__pillBtn--primary">
                    Browse fertilizer store
                  </Link>
                </div>
              ) : (
                <div className="user-dash__fertOrders">
                  {fertilizerOrders.map((o) => (
                    <article key={o.id} className="user-dash__fertOrder">
                      <header className="user-dash__fertOrderHead">
                        <div>
                          <span className="user-dash__fertOrderCode">#{o.orderCode}</span>
                          <span className="user-dash__fertStatusPill" title="Order status">
                            {fertStatusLabel(o.status)}
                          </span>
                          <span className="user-dash__fertOrderMeta">
                            {formatFertOrderDate(o.createdAt)} · {o.shipping?.district ?? '—'}
                          </span>
                          {o.estimatedDeliveryAt ? (
                            <span className="user-dash__fertOrderMeta">
                              Est. delivery: {formatFertOrderDate(o.estimatedDeliveryAt)}
                            </span>
                          ) : null}
                          {o.trackingRef?.trim() ? (
                            <span className="user-dash__fertOrderMeta">Ref: {o.trackingRef}</span>
                          ) : null}
                          <div className="user-dash__fertOrderActions">
                            <Link
                              className="user-dash__fertTrackLink"
                              to={`/fertilizer-store/orders/${encodeURIComponent(o.orderCode)}`}
                            >
                              Track order
                            </Link>
                            {isFertilizerOrderCancellableStatus(o.status) ? (
                              <button
                                type="button"
                                className="user-dash__fertCancelBtn"
                                disabled={cancellingOrderId === o.id}
                                onClick={() => void cancelFertilizerOrder(o.orderCode, o.id)}
                              >
                                {cancellingOrderId === o.id ? 'Cancelling…' : 'Cancel order'}
                              </button>
                            ) : null}
                          </div>
                          {(o.status === 'out_for_delivery' || o.status === 'delivered') ? (
                            <p className="user-dash__fertCancelHint">
                              Online cancellation is only available before dispatch. Contact us if you need help.
                            </p>
                          ) : null}
                        </div>
                        <div className="user-dash__fertOrderTotal">
                          <span className="user-dash__fertOrderTotalLabel">Total</span>
                          <span className="user-dash__fertOrderTotalValue">{formatFertRs(o.totalRs)}</span>
                        </div>
                      </header>
                      <ul className="user-dash__fertOrderLines">
                        {o.lines.map((l) => (
                          <li key={`${o.id}-${l.productId}`}>
                            <span className="user-dash__fertLineName">{l.productName}</span>
                            <span className="user-dash__fertLineQty">{l.qtyKg} kg</span>
                            <span className="user-dash__fertLinePrice">{formatFertRs(l.lineTotal)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="user-dash__fertOrderFoot">
                        <span>
                          Payment: <strong>{o.payment?.label ?? '—'}</strong>
                        </span>
                        <span>
                          Ship to:{' '}
                          <strong>
                            {o.shipping?.firstName} {o.shipping?.lastName}
                          </strong>
                          , {o.shipping?.address}
                          {o.shipping?.address2 ? `, ${o.shipping.address2}` : ''}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {section === 'agri-orders' ? (
            <>
              {agriOrdersErr ? (
                <p className="admin-users__banner admin-users__banner--error" role="alert">
                  {agriOrdersErr}
                </p>
              ) : null}
              {agriCancelErr ? (
                <p className="admin-users__banner admin-users__banner--error" role="alert">
                  {agriCancelErr}
                </p>
              ) : null}

              <p className="user-dash__muted user-dash__muted--tight">
                Paddy seeds and agricultural tools ordered through the{' '}
                <Link className="admin-shell__link" to="/products-store">
                  products store
                </Link>
                .
              </p>

              {activityLoading ? (
                <p className="user-dash__muted">Loading…</p>
              ) : agriOrders.length === 0 ? (
                <div className="user-dash__panel user-dash__panel--empty">
                  <p className="user-dash__muted">No seeds &amp; tools orders yet.</p>
                  <Link to="/products-store" className="user-dash__pillBtn user-dash__pillBtn--primary">
                    Browse products store
                  </Link>
                </div>
              ) : (
                <div className="user-dash__fertOrders">
                  {agriOrders.map((o) => (
                    <article key={o.id} className="user-dash__fertOrder">
                      <header className="user-dash__fertOrderHead">
                        <div>
                          <span className="user-dash__fertOrderCode">#{o.orderCode}</span>
                          <span className="user-dash__fertStatusPill" title="Order status">
                            {fertStatusLabel(o.status)}
                          </span>
                          <span className="user-dash__fertOrderMeta">
                            {formatFertOrderDate(o.createdAt)} · {o.shipping?.district ?? '—'}
                          </span>
                          {o.estimatedDeliveryAt ? (
                            <span className="user-dash__fertOrderMeta">
                              Est. delivery: {formatFertOrderDate(o.estimatedDeliveryAt)}
                            </span>
                          ) : null}
                          {o.trackingRef?.trim() ? (
                            <span className="user-dash__fertOrderMeta">Ref: {o.trackingRef}</span>
                          ) : null}
                          <div className="user-dash__fertOrderActions">
                            {isAgriOrderCancellableStatus(o.status) ? (
                              <button
                                type="button"
                                className="user-dash__fertCancelBtn"
                                disabled={cancellingAgriOrderId === o.id}
                                onClick={() => void cancelAgriOrder(o.orderCode, o.id)}
                              >
                                {cancellingAgriOrderId === o.id ? 'Cancelling…' : 'Cancel order'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="user-dash__fertOrderTotal">
                          <span className="user-dash__fertOrderTotalLabel">Total</span>
                          <span className="user-dash__fertOrderTotalValue">{formatFertRs(o.totalRs)}</span>
                        </div>
                      </header>
                      {(o.status === 'out_for_delivery' || o.status === 'delivered') ? (
                        <p className="user-dash__fertCancelHint">
                          Online cancellation is only available before dispatch. Contact us if you need help.
                        </p>
                      ) : null}
                      <ul className="user-dash__fertOrderLines">
                        {o.lines.map((l) => (
                          <li key={`${o.id}-${l.productId}`}>
                            <span className="user-dash__fertLineName">
                              {l.productName}
                              {l.categoryLabel ? (
                                <span className="user-dash__agriLineCat"> · {l.categoryLabel}</span>
                              ) : null}
                            </span>
                            <span className="user-dash__fertLineQty">{l.qtyUnits} units</span>
                            <span className="user-dash__fertLinePrice">{formatFertRs(l.lineTotal)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="user-dash__fertOrderFoot">
                        <span>
                          Payment: <strong>{o.payment?.label ?? '—'}</strong>
                        </span>
                        <span>
                          Ship to:{' '}
                          <strong>
                            {o.shipping?.firstName} {o.shipping?.lastName}
                          </strong>
                          , {o.shipping?.address}
                          {o.shipping?.address2 ? `, ${o.shipping.address2}` : ''}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {section === 'recommendations' ? (
            <>
              {fertRecommendationsErr ? (
                <p className="admin-users__banner admin-users__banner--error" role="alert">
                  {fertRecommendationsErr}
                </p>
              ) : null}

              <p className="user-dash__muted user-dash__muted--tight">
                Recommendations from the{' '}
                <Link className="admin-shell__link" to="/recommendation">
                  fertilizer recommendation
                </Link>{' '}
                tool are saved here when you are signed in.
              </p>

              {activityLoading ? (
                <p className="user-dash__muted">Loading…</p>
              ) : fertRecommendations.length === 0 ? (
                <div className="user-dash__panel user-dash__panel--empty">
                  <p className="user-dash__muted">No saved recommendations yet.</p>
                  <Link to="/recommendation" className="user-dash__pillBtn user-dash__pillBtn--primary">
                    Get a recommendation
                  </Link>
                </div>
              ) : (
                <div className="services-request__requestsTableWrap">
                  <table className="services-request__requestsTable">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">District</th>
                        <th scope="col">Season</th>
                        <th scope="col">Zone</th>
                        <th scope="col">Urea (kg/ha)</th>
                        <th scope="col">TSP (kg/ha)</th>
                        <th scope="col">MOP (kg/ha)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fertRecommendations.slice(0, RECENT_LIMIT).map((r) => (
                        <tr key={r.id}>
                          <td>{formatFertOrderDate(r.createdAt)}</td>
                          <td>{r.district}</td>
                          <td>{formatRecSeason(r.season)}</td>
                          <td>{r.agroZone}</td>
                          <td>{r.ureaKgHa.toFixed(1)}</td>
                          <td>{r.tspKgHa.toFixed(1)}</td>
                          <td>{r.mopKgHa.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {fertRecommendations.length > RECENT_LIMIT ? (
                <p className="user-dash__footnote">
                  Showing {RECENT_LIMIT} of {fertRecommendations.length} saved recommendations.
                </p>
              ) : null}
            </>
          ) : null}

          {section === 'consultations' ? (
            <>
              <p className="user-dash__muted user-dash__muted--tight">
                Recent requests — open the full list for details, documents, and cancel.
              </p>

              {consultationsErr ? (
                <p className="admin-users__banner admin-users__banner--error" role="alert">
                  {consultationsErr}
                </p>
              ) : null}

              {activityLoading ? (
                <p className="user-dash__muted">Loading…</p>
              ) : consultations.length === 0 ? (
                <div className="user-dash__panel user-dash__panel--empty">
                  <p className="user-dash__muted">You have no consultation requests yet.</p>
                  <Link to="/services/consultation" className="user-dash__pillBtn user-dash__pillBtn--primary">
                    Book a consultation
                  </Link>
                </div>
              ) : (
                <div className="services-request__requestsTableWrap">
                  <table className="services-request__requestsTable">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Category</th>
                        <th scope="col">Service type</th>
                        <th scope="col">Assigned agent</th>
                        <th scope="col">Status</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentConsultations.map((r) => {
                        const { label, badge } = statusDisplay(r.status)
                        const agent = (r.assignedAgentName ?? '').trim()
                        return (
                          <tr key={r.id}>
                            <td>{formatTableDate(r)}</td>
                            <td>{formatCategoryShort(r.category)}</td>
                            <td>{formatServiceTypeShort(r.serviceType)}</td>
                            <td>{agent || '—'}</td>
                            <td>
                              <span className={`services-request__statusBadge services-request__statusBadge--${badge}`}>
                                {label}
                              </span>
                            </td>
                            <td>
                              <Link to="/services/my-consultation-requests" className="services-request__tableActionLink">
                                View
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="user-dash__footnote">
                {consultations.length > RECENT_LIMIT ? `Showing ${RECENT_LIMIT} of ${consultations.length}. ` : ''}
                <Link to="/services/my-consultation-requests" className="admin-shell__link">
                  View all →
                </Link>
              </p>
            </>
          ) : null}

          {section === 'machinery' ? (
            <>
              <p className="user-dash__muted user-dash__muted--tight">
                Recent rentals — use the full list to open or cancel pending requests.
              </p>

              {rentalsErr ? (
                <p className="admin-users__banner admin-users__banner--error" role="alert">
                  {rentalsErr}
                </p>
              ) : null}

              {activityLoading ? (
                <p className="user-dash__muted">Loading…</p>
              ) : rentals.length === 0 ? (
                <div className="user-dash__panel user-dash__panel--empty">
                  <p className="user-dash__muted">You have no machinery rental requests yet.</p>
                  <Link to="/services/machinery" className="user-dash__pillBtn user-dash__pillBtn--primary">
                    Request machinery
                  </Link>
                </div>
              ) : (
                <div className="services-request__requestsTableWrap">
                  <table className="services-request__requestsTable">
                    <thead>
                      <tr>
                        <th scope="col">Equipment</th>
                        <th scope="col">Start</th>
                        <th scope="col">Duration</th>
                        <th scope="col">District</th>
                        <th scope="col">Status</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRentals.map((r) => {
                        const { label, badge } = rentalStatusDisplay(r.status)
                        return (
                          <tr key={r.id}>
                            <td>{machineryEquipmentDisplay(r)}</td>
                            <td>{formatRentalTableDate(r)}</td>
                            <td>
                              {r.durationDays} day{r.durationDays === 1 ? '' : 's'}
                            </td>
                            <td>{r.district}</td>
                            <td>
                              <span className={`services-request__statusBadge services-request__statusBadge--${badge}`}>
                                {label}
                              </span>
                            </td>
                            <td>
                              <Link to="/services/my-machinery-rentals" className="services-request__tableActionLink">
                                View
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="user-dash__footnote">
                {rentals.length > RECENT_LIMIT ? `Showing ${RECENT_LIMIT} of ${rentals.length}. ` : ''}
                <Link to="/services/my-machinery-rentals" className="admin-shell__link">
                  View all →
                </Link>
              </p>
            </>
          ) : null}

          {section === 'feedback' ? (
            <UserFeedbackPanel contact={{ name: user.name, email: user.email }} />
          ) : null}

          {section === 'inquiries' ? (
            <UserInquiryPanel contact={{ name: user.name, email: user.email }} />
          ) : null}

          {section === 'reviews' ? (
            <UserReviewPanel contact={{ name: user.name, email: user.email }} />
          ) : null}

          {section === 'contact' ? (
            <div className="user-dash__panel">
              <ContactPanel headingId="user-contact-heading" />
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
