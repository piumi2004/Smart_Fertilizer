import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { apiUrl } from '../apiBase'

type NotifItem = {
  id: string
  title: string
  body: string
  link: string
  read: boolean
  createdAt: string
}

type Props = {
  apiBasePath: string
  variant?: 'site' | 'admin'
  className?: string
}

function formatRelative(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString()
}

export default function NotificationBell({
  apiBasePath,
  variant = 'site',
  className = '',
}: Props) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<NotifItem[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const base = apiBasePath.replace(/\/$/, '')

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch(apiUrl(`${base}/unread-count`), { credentials: 'include' })
      if (!res.ok) return
      const data = (await res.json()) as { count?: number }
      if (typeof data.count === 'number') setCount(data.count)
    } catch {
      /* ignore */
    }
  }, [base])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl(`${base}?limit=30`), { credentials: 'include' })
      const data = (await res.json()) as { notifications?: NotifItem[] }
      if (res.ok && Array.isArray(data.notifications)) setItems(data.notifications)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => {
    void fetchCount()
    const id = setInterval(() => void fetchCount(), 45_000)
    const onFocus = () => void fetchCount()
    const onVis = () => {
      if (document.visibilityState === 'visible') void fetchCount()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [fetchCount])

  useEffect(() => {
    if (!open) return
    void fetchList()
    void fetchCount()
  }, [open, fetchList, fetchCount])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const markRead = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`${base}/${id}/read`), {
        method: 'PATCH',
        credentials: 'include',
      })
      if (res.ok) {
        void fetchCount()
        void fetchList()
      }
    } catch {
      /* ignore */
    }
  }

  const markAllRead = async () => {
    try {
      const res = await fetch(apiUrl(`${base}/read-all`), {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        setCount(0)
        void fetchList()
      }
    } catch {
      /* ignore */
    }
  }

  const onItemClick = (n: NotifItem) => {
    if (!n.read) void markRead(n.id)
    const link = n.link?.trim()
    if (link?.startsWith('/')) {
      navigate(link)
      setOpen(false)
    }
  }

  const wrapClass =
    `notif-bell${variant === 'admin' ? ' notif-bell--light' : ''}${className ? ` ${className}` : ''}`.trim()

  return (
    <div ref={wrapRef} className={wrapClass}>
      <button
        type="button"
        className="notif-btn"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12 22c1.1046 0 2-.8954 2-2h-4c0 1.1046.8954 2 2 2Z"
            fill="currentColor"
          />
          <path
            d="M18 16V11a6 6 0 1 0-12 0v5l-2 2h16l-2-2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        {count > 0 ? (
          <span className="notif-bell__badge">{count > 99 ? '99+' : count}</span>
        ) : null}
      </button>
      {open ? (
        <div className="notif-bell__panel" role="menu" aria-label="Notification list">
          <div className="notif-bell__head">
            <span className="notif-bell__headTitle">Notifications</span>
            {count > 0 ? (
              <button type="button" className="notif-bell__markAll" onClick={() => void markAllRead()}>
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="notif-bell__list">
            {loading ? <p className="notif-bell__empty">Loading…</p> : null}
            {!loading && items.length === 0 ? (
              <p className="notif-bell__empty">No notifications yet.</p>
            ) : null}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                role="menuitem"
                className={`notif-bell__item${n.read ? '' : ' notif-bell__item--unread'}`}
                onClick={() => onItemClick(n)}
              >
                <span className="notif-bell__itemTitle">{n.title}</span>
                <span className="notif-bell__itemBody">{n.body}</span>
                <span className="notif-bell__itemMeta">{formatRelative(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
