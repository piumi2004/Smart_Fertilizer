import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { apiUrl } from '../../apiBase'
import { FERTILIZER_PRODUCTS } from '../../data/fertilizerProducts'
import { computeAdminFertilizerCreateErrors } from '../../utils/adminFertilizerCreateOrderValidation'
import { SRI_LANKA_DISTRICTS } from '../../data/sriLankaDistricts'

const STATUSES = ['confirmed', 'out_for_delivery', 'delivered', 'cancelled'] as const

const NEXT_STATUS: Record<string, string[]> = {
  confirmed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}

function statusLabel(s: string) {
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

function statusPillClass(raw: string) {
  switch (raw) {
    case 'confirmed':
    case 'processing':
      return 'services-request__statusBadge--pending'
    case 'out_for_delivery':
      return 'services-request__statusBadge--assigned'
    case 'delivered':
      return 'services-request__statusBadge--completed'
    case 'cancelled':
      return 'services-request__statusBadge--cancelled'
    default:
      return 'services-request__statusBadge--pending'
  }
}

function effectiveOrderStatus(raw: string) {
  return raw === 'processing' ? 'confirmed' : raw
}

function OrderStatusStepper({ status }: { status: string }) {
  const s = effectiveOrderStatus(status)
  const steps = [
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'out_for_delivery', label: 'Out for delivery' },
    { key: 'delivered', label: 'Delivered' },
  ] as const

  if (s === 'cancelled') {
    return (
      <div className="admin-fert-stepper admin-fert-stepper--cancelled">
        <span className="admin-fert-stepper__cancelBadge">Order cancelled</span>
        <p className="admin-fert-stepper__cancelNote">No further delivery steps apply.</p>
      </div>
    )
  }

  const idx = steps.findIndex((x) => x.key === s)
  const activeIdx = idx >= 0 ? idx : 0

  return (
    <div className="admin-fert-stepper" aria-label="Delivery progress">
      <ol className="admin-fert-stepper__track">
        {steps.map((step, i) => {
          const done = activeIdx > i
          const current = activeIdx === i
          return (
            <li
              key={step.key}
              className={`admin-fert-stepper__step${done ? ' admin-fert-stepper__step--done' : ''}${current ? ' admin-fert-stepper__step--current' : ''}`}
            >
              <span className="admin-fert-stepper__dot" aria-hidden>
                {done ? '✓' : i + 1}
              </span>
              <span className="admin-fert-stepper__label">{step.label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

type OrderListRow = {
  id: string
  orderCode: string
  createdAt: string
  status: string
  totalRs: number
  shipping?: { district?: string; firstName?: string; lastName?: string; email?: string; phone?: string }
  user?: { id: string; name: string; email: string; phone?: string } | null
}

type FulfillmentEvent = { at: string; status: string; message?: string }

type OrderDetail = {
  id: string
  orderCode: string
  createdAt: string
  updatedAt: string
  status: string
  estimatedDeliveryAt: string | null
  trackingRef: string
  adminInternalNote: string
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
  shipping?: {
    firstName?: string
    lastName?: string
    phone?: string
    email?: string
    address?: string
    address2?: string
    district?: string
    postal?: string
    country?: string
  }
  payment?: { label?: string }
  fulfillmentEvents: FulfillmentEvent[]
  user?: { id: string; name: string; email: string; phone?: string } | null
}

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

function fromDatetimeLocalValue(v: string): string | null {
  if (!v.trim()) return null
  const d = new Date(v)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
}

export default function AdminFertilizerOrders() {
  const [orders, setOrders] = useState<OrderListRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 20
  const [statusF, setStatusF] = useState('all')
  const [districtF, setDistrictF] = useState('all')
  const [searchF, setSearchF] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [stats, setStats] = useState<{
    pendingOrders: number
    outForDelivery: number
    delivered: number
  } | null>(null)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [patching, setPatching] = useState(false)

  const [statusNext, setStatusNext] = useState('')
  const [publicMessage, setPublicMessage] = useState('')
  const [estimatedLocal, setEstimatedLocal] = useState('')
  const [trackingRef, setTrackingRef] = useState('')
  const [adminInternalNote, setAdminInternalNote] = useState('')

  const [tab, setTab] = useState<'orders' | 'inventory'>('orders')

  const [stockRows, setStockRows] = useState<
    { productId: string; name: string; pricePerKg: number; qtyKg: number }[]
  >([])
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({})
  // Tracks whether an input value was edited locally so polling doesn't overwrite drafts.
  const [stockDraftDirty, setStockDraftDirty] = useState<Record<string, boolean>>({})

  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})
  const [priceDraftDirty, setPriceDraftDirty] = useState<Record<string, boolean>>({})
  const [stockLoading, setStockLoading] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)
  const [saveStockKey, setSaveStockKey] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createUserId, setCreateUserId] = useState('')
  const [cFirst, setCFirst] = useState('')
  const [cLast, setCLast] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cAddress, setCAddress] = useState('')
  const [cAddress2, setCAddress2] = useState('')
  const [cDistrict, setCDistrict] = useState('')
  const [cPostal, setCPostal] = useState('')
  const [cCountry] = useState('Sri Lanka')
  const [cPayment, setCPayment] = useState<'credit' | 'debit' | 'cod'>('cod')
  const [cCardNum, setCCardNum] = useState('')
  const [cCardName, setCCardName] = useState('')
  const [cCardExpiry, setCCardExpiry] = useState('')
  const [cCardCvv, setCCardCvv] = useState('')
  const [qtyById, setQtyById] = useState<Record<string, string>>({
    'urea-46': '',
    'tsp-46': '',
    'mop-60': '',
  })
  const [createTouched, setCreateTouched] = useState<Record<string, boolean>>({})

  const createErrors = useMemo(
    () =>
      computeAdminFertilizerCreateErrors({
        qtyById,
        createUserId,
        cFirst,
        cLast,
        cPhone,
        cEmail,
        cAddress,
        cDistrict,
        cPayment,
        cCardName,
        cCardExpiry,
        cCardCvv,
      }),
    [
      qtyById,
      createUserId,
      cFirst,
      cLast,
      cPhone,
      cEmail,
      cAddress,
      cDistrict,
      cPayment,
      cCardName,
      cCardExpiry,
      cCardCvv,
    ],
  )

  const canCreateSubmit = Object.keys(createErrors).length === 0 && !createSubmitting

  const loadOrders = useCallback(async () => {
    setError(null)
    setLoading(true)
    const qs = new URLSearchParams()
    qs.set('page', String(page))
    qs.set('limit', String(limit))
    if (statusF !== 'all') qs.set('status', statusF)
    if (districtF !== 'all') qs.set('district', districtF)
    if (searchF.trim()) qs.set('search', searchF.trim())
    try {
      const res = await fetch(apiUrl(`/api/admin/fertilizer-orders?${qs}`), {
        credentials: 'include',
      })
      const data = (await res.json().catch(() => null)) as
        | { orders?: OrderListRow[]; total?: number; message?: string }
        | null
      if (!res.ok) {
        setError(data?.message || 'Could not load orders.')
        setOrders([])
        setTotal(0)
        return
      }
      setOrders(data?.orders ?? [])
      setTotal(typeof data?.total === 'number' ? data.total : 0)
    } finally {
      setLoading(false)
    }
  }, [page, statusF, districtF, searchF])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/fertilizer-order-stats'), { credentials: 'include' })
      const data = (await res.json().catch(() => null)) as
        | {
            pendingOrders?: number
            outForDelivery?: number
            delivered?: number
            message?: string
          }
        | null
      if (!res.ok) return

      setStats({
        pendingOrders: typeof data?.pendingOrders === 'number' ? data.pendingOrders : 0,
        outForDelivery: typeof data?.outForDelivery === 'number' ? data.outForDelivery : 0,
        delivered: typeof data?.delivered === 'number' ? data.delivered : 0,
      })
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const loadStock = useCallback(async (opts?: { syncDrafts?: boolean }) => {
    setStockError(null)
    setStockLoading(true)
    try {
      const res = await fetch(apiUrl('/api/admin/fertilizer-stock'), { credentials: 'include' })
      const data = (await res.json().catch(() => null)) as
        | {
            products?: { productId: string; name: string; pricePerKg: number; qtyKg: number }[]
            message?: string
          }
        | null
      if (!res.ok) {
        setStockError(data?.message || 'Could not load stock.')
        setStockRows([])
        return
      }
      const rows = data?.products ?? []
      setStockRows(rows)
      if (opts?.syncDrafts) {
        const d: Record<string, string> = {}
        const dirty: Record<string, boolean> = {}
        const pd: Record<string, string> = {}
        const pdirty: Record<string, boolean> = {}
        for (const r of rows) {
          d[r.productId] = String(r.qtyKg)
          dirty[r.productId] = false
          pd[r.productId] = String(r.pricePerKg)
          pdirty[r.productId] = false
        }
        setStockDrafts(d)
        setStockDraftDirty(dirty)
        setPriceDrafts(pd)
        setPriceDraftDirty(pdirty)
      }
    } finally {
      setStockLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'inventory') return

    void loadStock({ syncDrafts: true })
    const id = window.setInterval(() => void loadStock({ syncDrafts: false }), 10000)
    return () => window.clearInterval(id)
  }, [tab, loadStock])

  useEffect(() => {
    if (!detailId) {
      setDetail(null)
      setDetailError(null)
      setStatusNext('')
      setPublicMessage('')
      setEstimatedLocal('')
      setTrackingRef('')
      setAdminInternalNote('')
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    ;(async () => {
      try {
        const res = await fetch(apiUrl(`/api/admin/fertilizer-orders/${detailId}`), {
          credentials: 'include',
        })
        const data = (await res.json().catch(() => null)) as
          | { order?: OrderDetail; message?: string }
          | null
        if (cancelled) return
        if (!res.ok) {
          setDetailError(data?.message || 'Could not load order.')
          setDetail(null)
          return
        }
        const o = data?.order ?? null
        setDetail(o)
        if (o) {
          setEstimatedLocal(toDatetimeLocalValue(o.estimatedDeliveryAt))
          setTrackingRef(o.trackingRef ?? '')
          setAdminInternalNote(o.adminInternalNote ?? '')
          const next = NEXT_STATUS[effectiveOrderStatus(o.status)] ?? []
          setStatusNext(next[0] ?? '')
        }
      } catch {
        if (!cancelled) setDetailError('Could not load order.')
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [detailId])

  async function applyPatch() {
    if (!detail) return
    setPatching(true)
    setDetailError(null)
    try {
      const body: Record<string, unknown> = {}
      if (statusNext && statusNext !== effectiveOrderStatus(detail.status)) {
        body.status = statusNext
        if (publicMessage.trim()) body.publicMessage = publicMessage.trim()
      } else if (publicMessage.trim()) {
        body.publicMessage = publicMessage.trim()
      }
      const newEstIso = fromDatetimeLocalValue(estimatedLocal)
      const prevIso = detail.estimatedDeliveryAt
        ? new Date(detail.estimatedDeliveryAt).toISOString()
        : null
      const newNorm = newEstIso
      if (prevIso !== newNorm) {
        body.estimatedDeliveryAt = newEstIso
      }
      if (trackingRef !== (detail.trackingRef ?? '')) body.trackingRef = trackingRef
      if (adminInternalNote !== (detail.adminInternalNote ?? '')) body.adminInternalNote = adminInternalNote

      if (Object.keys(body).length === 0) {
        setDetailError('Nothing to save.')
        return
      }

      const res = await fetch(apiUrl(`/api/admin/fertilizer-orders/${detail.id}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => null)) as { order?: OrderDetail; message?: string } | null
      if (!res.ok) {
        setDetailError(data?.message || 'Could not update order.')
        return
      }
      const o = data?.order
      if (o) {
        setDetail(o)
        setEstimatedLocal(toDatetimeLocalValue(o.estimatedDeliveryAt))
        setTrackingRef(o.trackingRef ?? '')
        setAdminInternalNote(o.adminInternalNote ?? '')
        const next = NEXT_STATUS[effectiveOrderStatus(o.status)] ?? []
        setStatusNext(next[0] ?? '')
        setPublicMessage('')
      }
      await loadOrders()
      await loadStats()
    } finally {
      setPatching(false)
    }
  }

  async function saveStockRow(productId: string) {
    setStockError(null)
    const currentQty = stockRows.find((r) => r.productId === productId)?.qtyKg ?? 0
    const shouldUpdateQty = stockDraftDirty[productId] === true
    const rawQty = shouldUpdateQty ? (stockDrafts[productId] ?? String(currentQty)) : String(currentQty)
    const qty = Number(rawQty)

    const currentPrice = stockRows.find((r) => r.productId === productId)?.pricePerKg ?? 0
    const shouldUpdatePrice = priceDraftDirty[productId] === true
    const rawPrice = shouldUpdatePrice ? (priceDrafts[productId] ?? String(currentPrice)) : String(currentPrice)
    const pricePerKg = Number(rawPrice)

    if (!shouldUpdateQty && !shouldUpdatePrice) {
      setStockError('Nothing to save.')
      return
    }

    if (shouldUpdateQty && (!Number.isFinite(qty) || qty < 0)) {
      setStockError('Enter a valid quantity (kg).')
      return
    }
    if (shouldUpdatePrice && (!Number.isFinite(pricePerKg) || pricePerKg < 0)) {
      setStockError('Enter a valid price per kg.')
      return
    }

    const payload: Record<string, unknown> = {}
    if (shouldUpdateQty) payload.qtyKg = Math.round(qty * 100) / 100
    if (shouldUpdatePrice) payload.pricePerKg = Math.round(pricePerKg * 100) / 100
    setSaveStockKey(productId)
    try {
      const res = await fetch(apiUrl(`/api/admin/fertilizer-stock/${encodeURIComponent(productId)}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as { message?: string } | null
      if (!res.ok) {
        setStockError(data?.message || 'Could not save stock.')
        return
      }
      await loadStock({ syncDrafts: true })
    } finally {
      setSaveStockKey(null)
    }
  }

  function resetCreateForm() {
    setCreateError(null)
    setCreateTouched({})
    setCreateUserId('')
    setCFirst('')
    setCLast('')
    setCPhone('')
    setCEmail('')
    setCAddress('')
    setCAddress2('')
    setCDistrict('')
    setCPostal('')
    setCPayment('cod')
    setCCardNum('')
    setCCardName('')
    setCCardExpiry('')
    setCCardCvv('')
    setQtyById({ 'urea-46': '', 'tsp-46': '', 'mop-60': '' })
  }

  function markAllCreateFieldsTouched() {
    const t: Record<string, boolean> = {
      lines: true,
      userId: true,
      cFirst: true,
      cLast: true,
      cPhone: true,
      cEmail: true,
      cAddress: true,
      cDistrict: true,
      cCardName: true,
      cCardExpiry: true,
      cCardCvv: true,
    }
    for (const p of FERTILIZER_PRODUCTS) {
      t[`line_${p.id}`] = true
    }
    setCreateTouched(t)
  }

  async function submitCreateOrder(e: FormEvent) {
    e.preventDefault()
    setCreateError(null)
    const errs = computeAdminFertilizerCreateErrors({
      qtyById,
      createUserId,
      cFirst,
      cLast,
      cPhone,
      cEmail,
      cAddress,
      cDistrict,
      cPayment,
      cCardName,
      cCardExpiry,
      cCardCvv,
    })
    if (Object.keys(errs).length > 0) {
      markAllCreateFieldsTouched()
      setCreateError('Please fix the highlighted fields.')
      return
    }

    const lines: { productId: string; qtyKg: number }[] = []
    for (const p of FERTILIZER_PRODUCTS) {
      const raw = (qtyById[p.id] ?? '').trim()
      if (!raw) continue
      const q = Number(raw)
      if (!Number.isFinite(q) || q <= 0) continue
      lines.push({ productId: p.id, qtyKg: q })
    }

    const paymentLabel = 'Cash on delivery'
    setCreateSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        lines,
        shipping: {
          firstName: cFirst.trim(),
          lastName: cLast.trim(),
          phone: cPhone.trim(),
          email: cEmail.trim(),
          address: cAddress.trim(),
          address2: cAddress2.trim(),
          district: cDistrict,
          postal: cPostal.trim(),
          country: cCountry,
        },
        payment: {
          label: paymentLabel,
        },
      }
      if (createUserId.trim() && /^[a-f\d]{24}$/i.test(createUserId.trim())) {
        body.userId = createUserId.trim()
      }
      const res = await fetch(apiUrl('/api/admin/fertilizer-orders'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => null)) as { message?: string } | null
      if (!res.ok) {
        setCreateError(data?.message || 'Could not create order.')
        return
      }
      setCreateOpen(false)
      resetCreateForm()
      setTab('orders')
      await loadOrders()
      await loadStats()
    } finally {
      setCreateSubmitting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const nextOptions = detail ? NEXT_STATUS[effectiveOrderStatus(detail.status)] ?? [] : []

  return (
    <div className="admin-consultations admin-machinery-management">
      {error ? <div className="admin-users__banner admin-users__banner--error">{error}</div> : null}

      <div className="admin-fert-tabs">
        <button
          type="button"
          className={`admin-fert-tabs__btn${tab === 'orders' ? ' admin-fert-tabs__btn--active' : ''}`}
          onClick={() => setTab('orders')}
        >
          Orders
        </button>
        <button
          type="button"
          className={`admin-fert-tabs__btn${tab === 'inventory' ? ' admin-fert-tabs__btn--active' : ''}`}
          onClick={() => setTab('inventory')}
        >
          Inventory
        </button>
        {tab === 'orders' ? (
          <div className="admin-fert-tabs__actions">
            <button
              type="button"
              className="admin-fert-modal__btnPrimary"
              onClick={() => {
                setCreateOpen(true)
                setCreateError(null)
                setCreateTouched({})
              }}
            >
              Create order
            </button>
          </div>
        ) : null}
      </div>

      {tab === 'orders' ? (
        <>
          {loading ? (
            <p className="admin-users__muted">Loading…</p>
          ) : (
            <>
              <div className="admin-consultations__stats">
                <div className="admin-consultations__stat admin-consultations__stat--amber">
                  <span className="admin-consultations__statLabel">Pending orders</span>
                  <span className="admin-consultations__statValue">
                    {stats?.pendingOrders ?? 0}
                  </span>
                </div>
                <div className="admin-consultations__stat admin-consultations__stat--blue">
                  <span className="admin-consultations__statLabel">Out for delivery</span>
                  <span className="admin-consultations__statValue">
                    {stats?.outForDelivery ?? 0}
                  </span>
                </div>
                <div className="admin-consultations__stat admin-consultations__stat--green">
                  <span className="admin-consultations__statLabel">Delivered</span>
                  <span className="admin-consultations__statValue">
                    {stats?.delivered ?? 0}
                  </span>
                </div>
              </div>

              <div className="admin-consultations__filters">
                <label className="admin-consultations__filter">
                  <span>Status</span>
                  <select
                    value={statusF}
                    onChange={(e) => {
                      setPage(1)
                      setStatusF(e.target.value)
                    }}
                  >
                    <option value="all">All</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-consultations__filter">
                  <span>District</span>
                  <select
                    value={districtF}
                    onChange={(e) => {
                      setPage(1)
                      setDistrictF(e.target.value)
                    }}
                  >
                    <option value="all">All</option>
                    {SRI_LANKA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="admin-consultations__filter admin-consultations__filter--grow">
                  <span>Search</span>
                  <input
                    type="search"
                    value={searchF}
                    onChange={(e) => {
                      setPage(1)
                      setSearchF(e.target.value)
                    }}
                    placeholder="Order code, email, phone…"
                  />
                </label>
              </div>

              <div className="admin-users__tableWrap">
                <table className="admin-users__table">
                  <thead>
                    <tr>
                      <th scope="col">Order</th>
                      <th scope="col">Date</th>
                      <th scope="col">Customer</th>
                      <th scope="col">District</th>
                      <th scope="col">Status</th>
                      <th scope="col">Total</th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <span className="admin-users__muted">No orders match your filters.</span>
                        </td>
                      </tr>
                    ) : (
                      orders.map((r) => (
                        <tr key={r.id}>
                          <td className="admin-consultations__mono">{r.orderCode}</td>
                          <td>
                            {new Date(r.createdAt).toLocaleString('en-LK', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td>
                            {r.shipping?.firstName} {r.shipping?.lastName}
                            <div className="admin-consultations__sub">{r.shipping?.email}</div>
                            {r.user ? (
                              <div className="admin-consultations__sub">
                                Account: {r.user.name} ({r.user.email})
                              </div>
                            ) : null}
                          </td>
                          <td>{r.shipping?.district ?? '—'}</td>
                          <td>
                            <span className={`services-request__statusBadge ${statusPillClass(r.status)}`}>
                              {statusLabel(r.status)}
                            </span>
                          </td>
                          <td>Rs. {Number(r.totalRs).toFixed(2)}</td>
                          <td>
                            <button
                              type="button"
                              className="admin-consultations__linkbtn"
                              onClick={() => setDetailId(r.id)}
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="admin-consultations__pager">
                <span>
                  Showing {from}-{to} of {total} orders
                </span>
                <div className="admin-consultations__pagerBtns">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {stockError ? <div className="admin-users__banner admin-users__banner--error">{stockError}</div> : null}
          {stockLoading ? (
            <p className="admin-users__muted">Loading…</p>
          ) : (
            <div className="admin-users__tableWrap">
              <table className="admin-users__table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Price / kg</th>
                    <th scope="col">Stock (kg)</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((r) => (
                    <tr key={r.productId}>
                      <td>{r.name}</td>
                      <td>
                        <div className="admin-fert-stockUpdate">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={
                              priceDraftDirty[r.productId]
                                ? priceDrafts[r.productId] ?? String(r.pricePerKg)
                                : String(r.pricePerKg)
                            }
                            onChange={(e) => {
                              const v = e.target.value
                              setPriceDrafts((prev) => ({ ...prev, [r.productId]: v }))
                              setPriceDraftDirty((prev) => ({ ...prev, [r.productId]: true }))
                            }}
                            aria-label={`Update price per kg ${r.name}`}
                          />
                        </div>
                      </td>
                      <td>
                        <div className="admin-fert-stockUpdate">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={
                              stockDraftDirty[r.productId]
                                ? stockDrafts[r.productId] ?? String(r.qtyKg)
                                : String(r.qtyKg)
                            }
                            onChange={(e) => {
                              const v = e.target.value
                              setStockDrafts((prev) => ({ ...prev, [r.productId]: v }))
                              setStockDraftDirty((prev) => ({ ...prev, [r.productId]: true }))
                            }}
                            aria-label={`Update stock kg ${r.name}`}
                          />
                          <span
                            className={`admin-fert-stockUpdate__badge${
                              r.qtyKg <= 0.5 ? ' admin-fert-stockUpdate__badge--zero' : ''
                            }`}
                            aria-hidden="true"
                          >
                            {r.qtyKg} kg
                          </span>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-consultations__linkbtn"
                          disabled={saveStockKey === r.productId}
                          onClick={() => void saveStockRow(r.productId)}
                        >
                          {saveStockKey === r.productId ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {createOpen ? (
        <div
          className="admin-consultations__overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-fert-create-title"
          onClick={() => {
            if (!createSubmitting) {
              setCreateOpen(false)
              resetCreateForm()
            }
          }}
        >
          <div
            className="admin-consultations__modal admin-consultations__modal--wide admin-fert-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={(e) => void submitCreateOrder(e)}
              noValidate
            >
              <header className="admin-fert-modal__header">
                <h3 id="admin-fert-create-title">Create fertilizer order</h3>
                <p className="admin-fert-modal__code">Manual entry (admin)</p>
              </header>

              {createError ? (
                <div className="admin-users__banner admin-users__banner--error" style={{ margin: '0 1.75rem' }}>
                  {createError}
                </div>
              ) : null}

              <section className="admin-fert-modal__section admin-fert-modal__section--form">
                <h4 className="admin-fert-modal__sectionTitle">Order lines</h4>
                <div className="admin-fert-modal__fieldRow">
                  {FERTILIZER_PRODUCTS.map((p) => {
                    const lineKey = `line_${p.id}`
                    const lineErr = createErrors[lineKey]
                    const showLineErr = createTouched[lineKey] && lineErr
                    return (
                      <label key={p.id} className="admin-fert-modal__field admin-fert-modal__field--grow">
                        <span className="admin-fert-modal__label">{p.name} (kg)</span>
                        <input
                          className="admin-fert-modal__input"
                          type="number"
                          min={0}
                          step={0.5}
                          value={qtyById[p.id] ?? ''}
                          onBlur={() => setCreateTouched((t) => ({ ...t, [lineKey]: true }))}
                          onChange={(e) => setQtyById((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="0"
                          aria-invalid={Boolean(showLineErr)}
                        />
                        {showLineErr ? (
                          <span className="field__error" role="alert">
                            {lineErr}
                          </span>
                        ) : null}
                      </label>
                    )
                  })}
                </div>
                {createTouched.lines && createErrors.lines ? (
                  <p className="field__error" role="alert" style={{ marginTop: '0.35rem' }}>
                    {createErrors.lines}
                  </p>
                ) : null}
              </section>

              <section className="admin-fert-modal__section admin-fert-modal__section--form">
                <h4 className="admin-fert-modal__sectionTitle">Optional account link</h4>
                <label className="admin-fert-modal__field">
                    <span className="admin-fert-modal__label">User ID</span>
                  <input
                    className="admin-fert-modal__input"
                    value={createUserId}
                    onBlur={() => setCreateTouched((t) => ({ ...t, userId: true }))}
                    onChange={(e) => setCreateUserId(e.target.value)}
                    placeholder="Leave blank for guest"
                    autoComplete="off"
                    aria-invalid={Boolean(createTouched.userId && createErrors.userId)}
                  />
                  {createTouched.userId && createErrors.userId ? (
                    <span className="field__error" role="alert">
                      {createErrors.userId}
                    </span>
                  ) : null}
                </label>
              </section>

              <section className="admin-fert-modal__section admin-fert-modal__section--form">
                <h4 className="admin-fert-modal__sectionTitle">Shipping</h4>
                <div className="admin-fert-modal__fieldRow">
                  <label className="admin-fert-modal__field admin-fert-modal__field--grow">
                    <span className="admin-fert-modal__label">First name</span>
                    <input
                      className="admin-fert-modal__input"
                      value={cFirst}
                      onBlur={() => setCreateTouched((t) => ({ ...t, cFirst: true }))}
                      onChange={(e) => setCFirst(e.target.value)}
                      autoComplete="given-name"
                      aria-invalid={Boolean(createTouched.cFirst && createErrors.cFirst)}
                    />
                    {createTouched.cFirst && createErrors.cFirst ? (
                      <span className="field__error" role="alert">
                        {createErrors.cFirst}
                      </span>
                    ) : null}
                  </label>
                  <label className="admin-fert-modal__field admin-fert-modal__field--grow">
                    <span className="admin-fert-modal__label">Last name</span>
                    <input
                      className="admin-fert-modal__input"
                      value={cLast}
                      onBlur={() => setCreateTouched((t) => ({ ...t, cLast: true }))}
                      onChange={(e) => setCLast(e.target.value)}
                      autoComplete="family-name"
                      aria-invalid={Boolean(createTouched.cLast && createErrors.cLast)}
                    />
                    {createTouched.cLast && createErrors.cLast ? (
                      <span className="field__error" role="alert">
                        {createErrors.cLast}
                      </span>
                    ) : null}
                  </label>
                </div>
                <label className="admin-fert-modal__field">
                  <span className="admin-fert-modal__label">Phone</span>
                  <input
                    className="admin-fert-modal__input"
                    type="tel"
                    inputMode="tel"
                    value={cPhone}
                    onBlur={() => setCreateTouched((t) => ({ ...t, cPhone: true }))}
                    onChange={(e) => setCPhone(e.target.value)}
                    autoComplete="tel"
                    placeholder="07X XXX XXXX"
                    aria-invalid={Boolean(createTouched.cPhone && createErrors.cPhone)}
                  />
                  {createTouched.cPhone && createErrors.cPhone ? (
                    <span className="field__error" role="alert">
                      {createErrors.cPhone}
                    </span>
                  ) : null}
                </label>
                <label className="admin-fert-modal__field">
                  <span className="admin-fert-modal__label">Email</span>
                  <input
                    className="admin-fert-modal__input"
                    type="email"
                    inputMode="email"
                    value={cEmail}
                    onBlur={() => setCreateTouched((t) => ({ ...t, cEmail: true }))}
                    onChange={(e) => setCEmail(e.target.value)}
                    autoComplete="email"
                    aria-invalid={Boolean(createTouched.cEmail && createErrors.cEmail)}
                  />
                  {createTouched.cEmail && createErrors.cEmail ? (
                    <span className="field__error" role="alert">
                      {createErrors.cEmail}
                    </span>
                  ) : null}
                </label>
                <label className="admin-fert-modal__field">
                  <span className="admin-fert-modal__label">Address</span>
                  <input
                    className="admin-fert-modal__input"
                    value={cAddress}
                    onBlur={() => setCreateTouched((t) => ({ ...t, cAddress: true }))}
                    onChange={(e) => setCAddress(e.target.value)}
                    autoComplete="street-address"
                    aria-invalid={Boolean(createTouched.cAddress && createErrors.cAddress)}
                  />
                  {createTouched.cAddress && createErrors.cAddress ? (
                    <span className="field__error" role="alert">
                      {createErrors.cAddress}
                    </span>
                  ) : null}
                </label>
                <label className="admin-fert-modal__field">
                  <span className="admin-fert-modal__label">Address line 2</span>
                  <input
                    className="admin-fert-modal__input"
                    value={cAddress2}
                    onChange={(e) => setCAddress2(e.target.value)}
                  />
                </label>
                <label className="admin-fert-modal__field">
                  <span className="admin-fert-modal__label">District</span>
                  <select
                    className="admin-fert-modal__select"
                    value={cDistrict}
                    onBlur={() => setCreateTouched((t) => ({ ...t, cDistrict: true }))}
                    onChange={(e) => setCDistrict(e.target.value)}
                    aria-invalid={Boolean(createTouched.cDistrict && createErrors.cDistrict)}
                  >
                    <option value="">Select district</option>
                    {SRI_LANKA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  {createTouched.cDistrict && createErrors.cDistrict ? (
                    <span className="field__error" role="alert">
                      {createErrors.cDistrict}
                    </span>
                  ) : null}
                </label>
                <label className="admin-fert-modal__field">
                  <span className="admin-fert-modal__label">Postal code</span>
                  <input
                    className="admin-fert-modal__input"
                    value={cPostal}
                    onChange={(e) => setCPostal(e.target.value)}
                  />
                </label>
                <label className="admin-fert-modal__field">
                  <span className="admin-fert-modal__label">Country</span>
                  <input className="admin-fert-modal__input" value={cCountry} readOnly />
                </label>
              </section>

              <section className="admin-fert-modal__section admin-fert-modal__section--form">
                <h4 className="admin-fert-modal__sectionTitle">Payment</h4>
                <label className="admin-fert-modal__field">
                  <span className="admin-fert-modal__label">Method</span>
                  <input className="admin-fert-modal__input" value="Cash on delivery" readOnly />
                </label>
              </section>

              <div className="admin-fert-modal__actions">
                <button
                  type="submit"
                  className="admin-fert-modal__btnPrimary"
                  disabled={!canCreateSubmit}
                >
                  {createSubmitting ? 'Creating…' : 'Create order'}
                </button>
                <button
                  type="button"
                  className="admin-fert-modal__btnGhost"
                  disabled={createSubmitting}
                  onClick={() => {
                    setCreateOpen(false)
                    resetCreateForm()
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailId ? (
        <div
          className="admin-consultations__overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-fert-order-title"
          onClick={() => setDetailId(null)}
        >
          <div
            className="admin-consultations__modal admin-consultations__modal--wide admin-fert-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading ? (
              <p className="admin-users__muted">Loading…</p>
            ) : detailError ? (
              <div className="admin-users__banner admin-users__banner--error">{detailError}</div>
            ) : detail ? (
              <>
                <header className="admin-fert-modal__header">
                  <h3 id="admin-fert-order-title">Fertilizer order</h3>
                  <p className="admin-fert-modal__code">{detail.orderCode}</p>
                  <OrderStatusStepper status={detail.status} />
                </header>

                <section className="admin-fert-modal__section">
                  <h4 className="admin-fert-modal__sectionTitle">Order summary</h4>
                  <div className="admin-fert-modal__summaryGrid">
                    <div className="admin-fert-modal__kv">
                      <span className="admin-fert-modal__k">Total</span>
                      <span className="admin-fert-modal__v">Rs. {detail.totalRs.toFixed(2)}</span>
                    </div>
                    <div className="admin-fert-modal__kv">
                      <span className="admin-fert-modal__k">District</span>
                      <span className="admin-fert-modal__v">{detail.shipping?.district ?? '—'}</span>
                    </div>
                    <div className="admin-fert-modal__kv">
                      <span className="admin-fert-modal__k">Payment</span>
                      <span className="admin-fert-modal__v">{detail.payment?.label ?? '—'}</span>
                    </div>
                    <div className="admin-fert-modal__kv">
                      <span className="admin-fert-modal__k">Status</span>
                      <span className="admin-fert-modal__v">
                        <span
                          className={`services-request__statusBadge ${statusPillClass(detail.status)}`}
                        >
                          {statusLabel(detail.status)}
                        </span>
                      </span>
                    </div>
                  </div>
                </section>

                <section className="admin-fert-modal__section">
                  <h4 className="admin-fert-modal__sectionTitle">Items</h4>
                  <div className="admin-fert-modal__tableWrap">
                    <table className="admin-fert-modal__linesTable">
                      <thead>
                        <tr>
                          <th scope="col">Product</th>
                          <th scope="col">Qty</th>
                          <th scope="col" className="admin-fert-modal__num">
                            Line total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((l) => (
                          <tr key={l.productId}>
                            <td>{l.productName}</td>
                            <td>{l.qtyKg} kg</td>
                            <td className="admin-fert-modal__num">Rs. {l.lineTotal.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="admin-fert-modal__section">
                  <h4 className="admin-fert-modal__sectionTitle">Shipping address</h4>
                  <p className="admin-fert-modal__bodyText">
                    <strong>
                      {detail.shipping?.firstName} {detail.shipping?.lastName}
                    </strong>
                  </p>
                  <p className="admin-fert-modal__bodyText">{detail.shipping?.address}</p>
                  {detail.shipping?.address2 ? (
                    <p className="admin-fert-modal__bodyText">{detail.shipping.address2}</p>
                  ) : null}
                  <p className="admin-fert-modal__bodyText">{detail.shipping?.district}</p>
                  <p className="admin-fert-modal__bodyText">
                    <a href={`tel:${detail.shipping?.phone}`}>{detail.shipping?.phone}</a>
                    {' · '}
                    <a href={`mailto:${detail.shipping?.email}`}>{detail.shipping?.email}</a>
                  </p>
                </section>

                <section className="admin-fert-modal__section">
                  <h4 className="admin-fert-modal__sectionTitle">Activity timeline</h4>
                  <ul className="admin-fert-modal__timeline">
                    {detail.fulfillmentEvents.map((ev, i) => (
                      <li key={`${ev.at}-${i}`}>
                        <span className="admin-fert-modal__timelineWhen">
                          {new Date(ev.at).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <span className="admin-fert-modal__timelineStatus">{statusLabel(ev.status)}</span>
                        {ev.message ? <span className="admin-fert-modal__timelineMsg">{ev.message}</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="admin-fert-modal__section admin-fert-modal__section--form">
                  <h4 className="admin-fert-modal__sectionTitle">Update delivery &amp; status</h4>
                  <p className="admin-fert-modal__hint">
                    Move the order through: <strong>Confirmed</strong> → <strong>Out for delivery</strong> →{' '}
                    <strong>Delivered</strong>, or <strong>Cancel</strong> if needed. Add an optional message for
                    the customer on each status change.
                  </p>

                  {nextOptions.length > 0 ? (
                    <label className="admin-fert-modal__field">
                      <span className="admin-fert-modal__label">Next status</span>
                      <select
                        className="admin-fert-modal__select"
                        value={statusNext}
                        onChange={(e) => setStatusNext(e.target.value)}
                      >
                        {nextOptions.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="admin-fert-modal__hint">No further status changes are available for this order.</p>
                  )}

                  <label className="admin-fert-modal__field">
                    <span className="admin-fert-modal__label">Message to customer (optional)</span>
                    <textarea
                      className="admin-fert-modal__textarea"
                      rows={3}
                      value={publicMessage}
                      onChange={(e) => setPublicMessage(e.target.value)}
                      placeholder="Shown on the customer’s order tracking page with this update."
                    />
                  </label>

                  <div className="admin-fert-modal__fieldRow">
                    <label className="admin-fert-modal__field admin-fert-modal__field--grow">
                      <span className="admin-fert-modal__label">Estimated delivery</span>
                      <input
                        className="admin-fert-modal__input"
                        type="datetime-local"
                        value={estimatedLocal}
                        onChange={(e) => setEstimatedLocal(e.target.value)}
                      />
                    </label>
                    <label className="admin-fert-modal__field admin-fert-modal__field--grow">
                      <span className="admin-fert-modal__label">Tracking / batch reference</span>
                      <input
                        className="admin-fert-modal__input"
                        value={trackingRef}
                        onChange={(e) => setTrackingRef(e.target.value)}
                        placeholder="e.g. Vehicle / batch ID"
                      />
                    </label>
                  </div>

                  <label className="admin-fert-modal__field">
                    <span className="admin-fert-modal__label">Internal note (staff only)</span>
                    <textarea
                      className="admin-fert-modal__textarea admin-fert-modal__textarea--internal"
                      rows={3}
                      value={adminInternalNote}
                      onChange={(e) => setAdminInternalNote(e.target.value)}
                      placeholder="Not visible to the customer."
                    />
                  </label>
                </section>

                <div className="admin-fert-modal__actions">
                  <button
                    type="button"
                    className="admin-fert-modal__btnPrimary"
                    disabled={patching}
                    onClick={() => void applyPatch()}
                  >
                    {patching ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" className="admin-fert-modal__btnGhost" onClick={() => setDetailId(null)}>
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
