import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import { apiUrl } from './apiBase'
import AdminLogin from './pages/admin/AdminLogin'
import AdminProtected from './pages/admin/AdminProtected'
import AdminUsers from './pages/admin/AdminUsers'
import AdminSellers from './pages/admin/AdminSellers'
import AdminConsultations from './pages/admin/AdminConsultations'
import AdminMachineryRentals from './pages/admin/AdminMachineryRentals'
import AdminEngagement from './pages/admin/AdminEngagement'
import AdminFertilizerOrders from './pages/admin/AdminFertilizerOrders'
import AdminAgriProducts from './pages/admin/AdminAgriProducts'
import AdminSellerProductApprovals from './pages/admin/AdminSellerProductApprovals'
import Login from './pages/Login'
import Register from './pages/Register'
import SellerLogin from './pages/seller/SellerLogin'
import SellerRegister from './pages/seller/SellerRegister'
import SellerProtected from './pages/seller/SellerProtected'
import SellerDashboard from './pages/seller/SellerDashboard'
import SellerMySubmissions from './pages/seller/SellerMySubmissions'
import SellerContact from './pages/seller/SellerContact'
import ServicesSelect from './pages/services/ServicesSelect'
import ConsultationPlaceholder from './pages/services/ConsultationPlaceholder'
import MachineryRental from './pages/services/MachineryRental'
import MyConsultationRequests from './pages/services/MyConsultationRequests'
import MyMachineryRentalRequests from './pages/services/MyMachineryRentalRequests'
import UserProtected from './pages/UserProtected'
import Profile from './pages/Profile'
import { CartProvider, useCart } from './context/CartContext'
import { AgriCartProvider, useAgriCart } from './context/AgriCartContext'
import { AgriCatalogProvider } from './context/AgriCatalogContext'
import CartPage from './pages/fertilizer/CartPage'
import CheckoutPage from './pages/fertilizer/CheckoutPage'
import FertilizerProductDetail from './pages/fertilizer/FertilizerProductDetail'
import FertilizerStore from './pages/fertilizer/FertilizerStore'
import OrderConfirmation from './pages/fertilizer/OrderConfirmation'
import FertilizerOrderTrack from './pages/fertilizer/FertilizerOrderTrack'
import './pages/fertilizer/fertilizerStore.css'
import ProductsStore from './pages/products/ProductsStore'
import ProductDetail from './pages/products/ProductDetail'
import ProductsCartPage from './pages/products/ProductsCartPage'
import ProductsCheckoutPage from './pages/products/ProductsCheckoutPage'
import ProductsOrderConfirmation from './pages/products/ProductsOrderConfirmation'
import Recommendation from './pages/Recommendation'
import NotificationBell from './components/NotificationBell'

const nav = [
  { label: 'Home', href: '#top' },
  { label: 'Recommendation', href: '/recommendation' },
  { label: 'Fertilizer', href: '/fertilizer-store' },
  { label: 'Products', href: '/products-store' },
  { label: 'Services', href: '#services' },
  { label: 'Contact', href: '#contact' },
] as const

const sellerNav = [
  { label: 'Home', href: '#top' },
  { label: 'Dashboard', href: '/seller/dashboard' },
  { label: 'My submissions', href: '/seller/submissions' },
  { label: 'Contact', href: '/seller/contact' },
] as const

function isHeaderNavActive(label: string, pathname: string, hash: string, search: string): boolean {
  switch (label) {
    case 'Home':
      return pathname === '/'
    case 'Fertilizer':
      return pathname.startsWith('/fertilizer-store')
    case 'Recommendation':
      return pathname === '/recommendation'
    case 'Products':
      return pathname.startsWith('/products-store')
    case 'Services':
      return pathname.startsWith('/services')
    case 'Contact':
      return (
        pathname.startsWith('/seller/contact') ||
        (pathname === '/' && hash === '#contact') ||
        (pathname === '/profile' && new URLSearchParams(search).get('section') === 'contact')
      )
    case 'Dashboard':
      return pathname.startsWith('/seller/dashboard')
    case 'My submissions':
      return pathname.startsWith('/seller/submissions')
    default:
      return false
  }
}

type MeUser = {
  id: string
  name: string
  email: string
  phone: string
  businessName?: string
  status?: 'pending' | 'approved' | 'rejected'
}

type AppContentProps = {
  me: MeUser | null
  sellerMe: MeUser | null
  setMe: Dispatch<SetStateAction<MeUser | null>>
  setSellerMe: Dispatch<SetStateAction<MeUser | null>>
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] ?? ''
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : ''
  const displayName = lastName ? `${firstName} ${lastName}` : firstName
  return { firstName, lastName, displayName }
}

function CartToast() {
  const { toastMessage, dismissToast } = useCart()
  if (!toastMessage) return null
  return (
    <div className="fs-toast" role="status" aria-live="polite">
      <span>{toastMessage}</span>
      <button type="button" onClick={dismissToast} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  )
}

function AgriCartToast() {
  const { toastMessage, dismissToast } = useAgriCart()
  if (!toastMessage) return null
  return (
    <div className="fs-toast" role="status" aria-live="polite">
      <span>{toastMessage}</span>
      <button type="button" onClick={dismissToast} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  )
}

function AppContent({ me, sellerMe, setMe, setSellerMe }: AppContentProps) {
  const { lineCount: fertilizerLineCount } = useCart()
  const { lineCount: agriLineCount } = useAgriCart()
  const cartLineCount = fertilizerLineCount + agriLineCount
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'
  const isSellerArea = location.pathname.startsWith('/seller')
  const headerNav = sellerMe || isSellerArea ? sellerNav : nav
  const isPublicAuth =
    location.pathname === '/login' ||
    location.pathname === '/register' ||
    location.pathname === '/seller/login' ||
    location.pathname === '/seller/register'
  const isAdmin = location.pathname.startsWith('/admin')
  const isAdminLogin = location.pathname === '/admin/login'
  const isServices = location.pathname.startsWith('/services')
  const isFertilizerStore = location.pathname.startsWith('/fertilizer-store')
  const isProductsStore = location.pathname.startsWith('/products-store')
  const isRecommendation = location.pathname === '/recommendation'
  const isUserDashboard = location.pathname === '/profile'
  // Only show the full homepage marketing sections on the homepage route.
  const showMarketing = !isAdmin && !isPublicAuth && isHome
  const mainClass =
    isAdminLogin || isPublicAuth
      ? 'main main--auth'
      : isAdmin
        ? 'main main--admin'
        : isServices ||
            isUserDashboard ||
            isFertilizerStore ||
            isProductsStore ||
            isRecommendation
          ? `main main--services${isUserDashboard ? ' main--user-dash' : ''}`
          : 'main'

  const [loggingOut, setLoggingOut] = useState(false)
  const userMenuDetailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const closeOnOutside = (e: PointerEvent) => {
      const el = userMenuDetailsRef.current
      if (!el?.open) return
      const t = e.target
      if (t instanceof Node && el.contains(t)) return
      el.removeAttribute('open')
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [])

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    const currentUserId = me?.id ?? null
    try {
      if (me) {
        await fetch(apiUrl('/api/fertilizer/cart'), { method: 'DELETE', credentials: 'include' }).catch(
          () => null,
        )
        await fetch(apiUrl('/api/agri/cart'), { method: 'DELETE', credentials: 'include' }).catch(
          () => null,
        )
      }
      await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' }).catch(
        () => null,
      )
      await fetch(apiUrl('/api/seller/logout'), { method: 'POST', credentials: 'include' }).catch(
        () => null,
      )
      if (currentUserId) {
        localStorage.removeItem(`govismart-agri-cart:${currentUserId}`)
      }
    } finally {
      setMe(null)
      setSellerMe(null)
      setLoggingOut(false)
      navigate('/', { replace: true })
    }
  }

  const nameParts = me ? splitName(me.name) : sellerMe ? splitName(sellerMe.name) : null

  return (
    <div className="page" id="top">
      <CartToast />
      <AgriCartToast />
      {!isHome ? (
        <div className="watermark" aria-hidden="true">
          <img src="/logo.png" alt="" className="watermark__img" />
        </div>
      ) : null}
      {!isAdmin ? (
      <header className="header">
        <div className="header__inner">
          <a
            className="brand"
            href="#top"
            aria-label="GoviSmart home"
            onClick={(e) => {
              if (!isHome) {
                e.preventDefault()
                navigate('/', { replace: false })
              }
            }}
          >
            <img
              src="/logo.png"
              alt="Smart Fertilizer & Agri Management — Paddy solutions for Sri Lanka"
              className="brand__logo"
              width={220}
              height={72}
            />
            <span className="brand__wordmark">GoviSmart</span>
          </a>

          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="nav-toggle__bar" />
            <span className="nav-toggle__bar" />
            <span className="nav-toggle__bar" />
            <span className="visually-hidden">Menu</span>
          </button>

          <nav
            id="site-nav"
            className={`nav ${menuOpen ? 'nav--open' : ''}`}
            aria-label="Primary"
          >
            <ul className="nav__list">
              {headerNav.map(({ label, href }) => {
                const navActive = isHeaderNavActive(
                  label,
                  location.pathname,
                  location.hash,
                  location.search,
                )
                return (
                <li key={href}>
                  <a
                    className={
                      navActive ? 'nav__link nav__link--active' : 'nav__link'
                    }
                    href={href}
                    aria-current={navActive ? 'page' : undefined}
                    onClick={(e) => {
                      if (label === 'Home' && !isHome) {
                        e.preventDefault()
                        navigate('/', { replace: false })
                      }
                      if (label === 'Dashboard') {
                        e.preventDefault()
                        navigate('/seller/dashboard', { replace: false })
                      }
                      if (label === 'My submissions') {
                        e.preventDefault()
                        navigate('/seller/submissions', { replace: false })
                      }
                      if (label === 'Contact' && href === '/seller/contact') {
                        e.preventDefault()
                        navigate('/seller/contact', { replace: false })
                      }
                      if (label === 'Contact' && href === '#contact' && me) {
                        e.preventDefault()
                        navigate('/profile?section=contact', { replace: false })
                      }
                      if (label === 'Products') {
                        e.preventDefault()
                        navigate('/products-store', { replace: false })
                      }
                      if (label === 'Services') {
                        e.preventDefault()
                        navigate('/services', { replace: false })
                      }
                      if (label === 'Fertilizer') {
                        e.preventDefault()
                        navigate('/fertilizer-store', { replace: false })
                      }
                      if (label === 'Recommendation') {
                        e.preventDefault()
                        navigate('/recommendation', { replace: false })
                      }
                      setMenuOpen(false)
                    }}
                  >
                    {label}
                  </a>
                </li>
                )
              })}
            </ul>
            <div className="nav__actions">
              {me ? (
                <Link
                  className="btn btn--ghost btn--sm nav-cart"
                  to="/fertilizer-store/cart"
                  onClick={() => setMenuOpen(false)}
                  aria-label={`Shopping cart${cartLineCount > 0 ? `, ${cartLineCount} items` : ''}`}
                >
                  <svg
                    className="nav-cart__icon"
                    width={24}
                    height={24}
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 12.5h8.5"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                    <circle cx="9" cy="20" r="1.75" fill="currentColor" />
                    <circle cx="18" cy="20" r="1.75" fill="currentColor" />
                  </svg>
                  <span className="nav-cart__label">
                    Cart{cartLineCount > 0 ? ` (${cartLineCount})` : ''}
                  </span>
                </Link>
              ) : null}

              {me ? (
                <>
                  <NotificationBell apiBasePath="/api/notifications" />
                  <details ref={userMenuDetailsRef} className="user-menu">
                    <summary className="user-menu__summary">
                      <div className="user-menu__avatar" aria-hidden="true">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden="true"
                        >
                          <path
                            d="M12 12c2.7614 0 5-2.2386 5-5S14.7614 2 12 2 7 4.2386 7 7s2.2386 5 5 5Z"
                            fill="currentColor"
                          />
                          <path
                            d="M3 22c0-4.4183 4.0294-8 9-8s9 3.5817 9 8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      <span className="user-menu__name">{nameParts?.displayName}</span>
                      <span className="user-menu__chevron" aria-hidden="true">
                        ▾
                      </span>
                    </summary>
                    <div className="user-menu__dropdown" role="menu" aria-label="User menu">
                      <div className="user-menu__label">{nameParts?.displayName}</div>
                      <Link
                        className="user-menu__item"
                        to="/profile"
                        role="menuitem"
                        onClick={() => userMenuDetailsRef.current?.removeAttribute('open')}
                      >
                        My dashboard
                      </Link>
                      <button
                        type="button"
                        className="user-menu__item user-menu__itemBtn"
                        onClick={logout}
                        disabled={loggingOut}
                      >
                        Logout
                      </button>
                    </div>
                  </details>
                </>
              ) : sellerMe ? (
                <>
                  {isSellerArea &&
                  location.pathname !== '/seller/login' &&
                  location.pathname !== '/seller/register' ? null : (
                    <NotificationBell apiBasePath="/api/seller/notifications" />
                  )}
                  <details ref={userMenuDetailsRef} className="user-menu">
                  <summary className="user-menu__summary">
                    <div className="user-menu__avatar" aria-hidden="true">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 12c2.7614 0 5-2.2386 5-5S14.7614 2 12 2 7 4.2386 7 7s2.2386 5 5 5Z"
                          fill="currentColor"
                        />
                        <path
                          d="M3 22c0-4.4183 4.0294-8 9-8s9 3.5817 9 8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <span className="user-menu__name">{nameParts?.displayName}</span>
                    <span className="user-menu__chevron" aria-hidden="true">
                      ▾
                    </span>
                  </summary>
                  <div className="user-menu__dropdown" role="menu" aria-label="Seller menu">
                    <div className="user-menu__label">{nameParts?.displayName}</div>
                    <button
                      type="button"
                      className="user-menu__item user-menu__itemBtn"
                      onClick={logout}
                      disabled={loggingOut}
                    >
                      Logout
                    </button>
                  </div>
                </details>
                </>
              ) : (
                <a className="btn btn--ghost" href="/login">
                  Log in
                </a>
              )}

              {sellerMe ? null : (
                <a className="btn btn--gold" href="/seller/login">
                  Partner with us
                </a>
              )}
            </div>
          </nav>
        </div>
      </header>
      ) : null}

      <main className={mainClass}>
        <Routes>
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin/users"
            element={
              <AdminProtected>
                <AdminUsers />
              </AdminProtected>
            }
          />
          <Route
            path="/admin/sellers"
            element={
              <AdminProtected>
                <AdminSellers />
              </AdminProtected>
            }
          />
          <Route
            path="/admin/sellers/product-approvals"
            element={
              <AdminProtected>
                <AdminSellerProductApprovals />
              </AdminProtected>
            }
          />
          <Route
            path="/admin/consultations/*"
            element={
              <AdminProtected>
                <AdminConsultations />
              </AdminProtected>
            }
          />
          <Route
            path="/admin/machinery-rentals"
            element={
              <AdminProtected>
                <AdminMachineryRentals />
              </AdminProtected>
            }
          />
          <Route
            path="/admin/engagement"
            element={
              <AdminProtected>
                <AdminEngagement />
              </AdminProtected>
            }
          />
          <Route
            path="/admin/fertilizer-orders"
            element={
              <AdminProtected>
                <AdminFertilizerOrders />
              </AdminProtected>
            }
          />
          <Route
            path="/admin/agri-products"
            element={
              <AdminProtected>
                <AdminAgriProducts />
              </AdminProtected>
            }
          />
          <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/seller/login" element={<SellerLogin />} />
          <Route path="/seller/register" element={<SellerRegister />} />
          <Route
            path="/seller/dashboard"
            element={
              <SellerProtected>
                <SellerDashboard />
              </SellerProtected>
            }
          />
          <Route
            path="/seller/submissions"
            element={
              <SellerProtected>
                <SellerMySubmissions />
              </SellerProtected>
            }
          />
          <Route
            path="/seller/contact"
            element={
              <SellerProtected>
                <SellerContact />
              </SellerProtected>
            }
          />
          <Route
            path="/profile"
            element={
              <UserProtected>
                <Profile />
              </UserProtected>
            }
          />
          <Route
            path="/services"
            element={
              <UserProtected>
                <ServicesSelect />
              </UserProtected>
            }
          />
          <Route
            path="/services/consultation"
            element={
              <UserProtected>
                <ConsultationPlaceholder />
              </UserProtected>
            }
          />
          <Route
            path="/services/machinery"
            element={
              <UserProtected>
                <MachineryRental />
              </UserProtected>
            }
          />
          <Route
            path="/services/my-consultation-requests"
            element={
              <UserProtected>
                <MyConsultationRequests />
              </UserProtected>
            }
          />
          <Route
            path="/services/my-machinery-rentals"
            element={
              <UserProtected>
                <MyMachineryRentalRequests />
              </UserProtected>
            }
          />
          <Route
            path="/services/my-requests"
            element={
              <UserProtected>
                <Navigate to="/services/my-consultation-requests" replace />
              </UserProtected>
            }
          />
          <Route path="/fertilizer-store" element={<FertilizerStore />} />
          <Route path="/fertilizer-store/product/:slug" element={<FertilizerProductDetail />} />
          <Route
            path="/fertilizer-store/cart"
            element={
              <UserProtected>
                <CartPage />
              </UserProtected>
            }
          />
          <Route
            path="/fertilizer-store/checkout"
            element={
              <UserProtected>
                <CheckoutPage />
              </UserProtected>
            }
          />
          <Route path="/fertilizer-store/order-confirmation" element={<OrderConfirmation />} />
          <Route
            path="/fertilizer-store/orders/:orderCode"
            element={
              <UserProtected>
                <FertilizerOrderTrack />
              </UserProtected>
            }
          />

          <Route path="/products-store" element={<ProductsStore />} />
          <Route path="/products-store/product/:slug" element={<ProductDetail />} />
          <Route
            path="/products-store/cart"
            element={
              <UserProtected>
                <ProductsCartPage />
              </UserProtected>
            }
          />
          <Route
            path="/products-store/checkout"
            element={
              <UserProtected>
                <ProductsCheckoutPage />
              </UserProtected>
            }
          />
          <Route path="/products-store/order-confirmation" element={<ProductsOrderConfirmation />} />

          <Route path="/recommendation" element={<Recommendation />} />

          <Route path="/" element={null} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {showMarketing ? (
          <>
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero__bg" aria-hidden="true">
            <span className="hero__orb hero__orb--1" />
            <span className="hero__orb hero__orb--2" />
            <svg
              className="hero__deco hero__deco--plant"
              viewBox="0 0 64 64"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                fillOpacity="0.12"
                d="M32 56c0-16 8-28 20-36-4 12-4 24 0 36H32zm0 0c0-16-8-28-20-36 4 12 4 24 0 36h20z"
              />
            </svg>
            <svg
              className="hero__deco hero__deco--grain"
              viewBox="0 0 80 80"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                fillOpacity="0.14"
                d="M40 8c-4 12-4 28 0 44 6-10 10-22 12-36-6 4-10 4-12-8zm8 48c8-6 14-16 18-28-10 6-16 14-18 28z"
              />
            </svg>
          </div>

          <div className="hero__content">
            <p className="hero__badge">PADDY CULTIVATION · SRI LANKA</p>
            <h1 id="hero-heading" className="hero__title">
              <span className="hero__titleLine">GOVISMART</span>
              <span className="hero__titleLine">
                <span className="hero__titleGold">PADDY</span> SOLUTIONS
              </span>
            </h1>
            <p className="hero__lead">
              Fertilizer, seeds, tools, and agronomy built around paddy — from nursery to harvest,
              with local field coordination across Sri Lanka&apos;s major rice-growing regions.
            </p>
            <div className="hero__cta">
              <Link className="btn btn--on-hero btn--primary" to="/recommendation">
                Get a recommendation
              </Link>
              <a
                className="btn btn--on-hero btn--outline"
                href="/products-store"
                onClick={(e) => {
                  // Ensure this CTA always navigates to the shop page.
                  e.preventDefault()
                  navigate('/products-store', { replace: false })
                }}
              >
                Browse paddy inputs
              </a>
            </div>
          </div>
        </section>

        <section
          id="solutions"
          className="section section--muted"
          aria-labelledby="solutions-heading"
        >
          <div className="section__inner">
            <header className="section__head">
              <h2 id="solutions-heading" className="section__title">
                How we support your paddy season
              </h2>
              <p className="section__intro">
                Everything here is tuned for rice farmers in Sri Lanka — nutrient plans, inputs,
                and field help that match your paddy stage, water, and district.
              </p>
            </header>
            <ul className="cards">
              <li className="card">
                <span className="card__icon" aria-hidden="true">
                  ◉
                </span>
                <h3 className="card__title">Paddy soil &amp; nutrient intelligence</h3>
                <p className="card__text">
                  NPK and specialty recommendations for paddy — tied to soil health, tillering
                  and grain-fill stages, and regional rice-growing practice — not generic labels.
                </p>
              </li>
              <li className="card">
                <span className="card__icon" aria-hidden="true">
                  ◆
                </span>
                <h3 className="card__title">Trusted inputs for rice fields</h3>
                <p className="card__text">
                  Fertilizers, paddy seeds, and farm tools with transparent sourcing and dependable
                  delivery where you farm.
                </p>
              </li>
              <li className="card">
                <span className="card__icon" aria-hidden="true">
                  ◇
                </span>
                <h3 className="card__title">Maha, Yala &amp; paddy advisory</h3>
                <p className="card__text">
                  Season planning for Sri Lanka&apos;s main paddy windows, water-smart methods, and
                  integrated nutrient management for your paddies.
                </p>
              </li>
              <li className="card">
                <span className="card__icon" aria-hidden="true">
                  ✦
                </span>
                <h3 className="card__title">Field services &amp; machinery</h3>
                <p className="card__text">
                  Consultations, soil sampling, and machinery rentals aligned with paddy land prep,
                  planting, and harvest in your area.
                </p>
              </li>
            </ul>
          </div>
        </section>

        <section id="products" className="section" aria-labelledby="products-heading">
          <div className="section__inner section__split">
            <div>
              <h2 id="products-heading" className="section__title">
                Built for paddy in Sri Lanka
              </h2>
              <p className="section__intro section__intro--left">
                From small paddy plots to larger grower networks, we align fertilizers, seeds, and
                tools with your land, water, and season — rice-first, with room for common rotation
                crops where you farm.
              </p>
              <ul className="checks">
                <li>Balanced NPK and paddy-focused blends matched to soil tests and growth stage</li>
                <li>Paddy seeds, tools, and integrated options suited to local practice</li>
                <li>Batch traceability and supplier accountability</li>
              </ul>
            </div>
            <div className="stat-panel" aria-label="Highlights">
              <div className="stat-panel__item">
                <span className="stat-panel__value">Sri Lanka</span>
                <span className="stat-panel__label">Nationwide field focus</span>
              </div>
              <div className="stat-panel__item">
                <span className="stat-panel__value">Paddy-first</span>
                <span className="stat-panel__label">
                  Programs tuned for major paddy regions
                </span>
              </div>
              <div className="stat-panel__item">
                <span className="stat-panel__value">Data-informed</span>
                <span className="stat-panel__label">
                  Recommendations you can document and revisit
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="section section--dark" aria-labelledby="services-heading">
          <div className="section__inner">
            <h2 id="services-heading" className="section__title section__title--on-dark">
              Ready when your paddy fields are
            </h2>
            <p className="section__intro section__intro--on-dark">
              Ask about paddy soil testing, fertilizer and seed schedules, bulk supply, and
              agronomy for your district — Maha, Yala, or year-round rice where you grow.
            </p>
            <a className="btn btn--gold btn--lg" href="#contact">
              Schedule a consultation
            </a>
          </div>
        </section>

        <section id="contact" className="section" aria-labelledby="contact-heading">
          <div className="section__inner contact">
            <div>
              <h2 id="contact-heading" className="section__title">
                Contact
              </h2>
              <p className="section__intro section__intro--left">
                For partnerships, bulk paddy inputs, or rice agronomy questions in Sri Lanka, reach
                out. We respond within two business days.
              </p>
            </div>
            <address className="contact__details">
              <p>
                <strong>GoviSmart</strong>
              </p>
              <p>
                Email:{' '}
                <a href="mailto:hello@smartfertilizer.example">
                  hello@smartfertilizer.example
                </a>
              </p>
              <p>Colombo &amp; regional field offices — Sri Lanka</p>
            </address>
          </div>
        </section>
          </>
        ) : null}
      </main>

      {!isAdmin ? (
      <footer className="footer">
        <div className="footer__inner">
          <img
            src="/logo.png"
            alt=""
            className="footer__logo"
            width={180}
            height={60}
            decoding="async"
          />
          <p className="footer__tagline">GoviSmart — Paddy solutions for Sri Lanka</p>
          <p className="footer__legal">
            © {new Date().getFullYear()} GoviSmart. All rights reserved.
          </p>
        </div>
      </footer>
      ) : null}
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')
  const [me, setMe] = useState<MeUser | null>(null)
  const [sellerMe, setSellerMe] = useState<MeUser | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (isAdmin) {
        setMe(null)
        setSellerMe(null)
        setAuthReady(true)
        return
      }

      try {
        // Customer session (used for cart + profile)
        try {
          const res = await fetch(apiUrl('/api/auth/me'), { credentials: 'include' })
          const data = (await res.json().catch(() => null)) as
            | { user?: MeUser; message?: string }
            | null

          if (!cancelled) {
            if (res.ok && data?.user) setMe(data.user)
            else setMe(null)
          }
        } catch {
          if (!cancelled) setMe(null)
        }

        // Seller session (used for header display only)
        try {
          const res = await fetch(apiUrl('/api/seller/me'), { credentials: 'include' })
          const data = (await res.json().catch(() => null)) as
            | { seller?: MeUser; message?: string }
            | null

          if (!cancelled) {
            if (res.ok && data?.seller) setSellerMe(data.seller)
            else setSellerMe(null)
          }
        } catch {
          if (!cancelled) setSellerMe(null)
        }
      } finally {
        if (!cancelled) setAuthReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAdmin, location.pathname])

  useEffect(() => {
    const onProfileUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<MeUser>).detail
      if (detail?.id && detail.email) setMe(detail)
    }
    window.addEventListener('govismart:profile-updated', onProfileUpdated)
    return () => window.removeEventListener('govismart:profile-updated', onProfileUpdated)
  }, [])

  return (
    <AgriCatalogProvider>
      <AgriCartProvider userId={me?.id ?? null} authReady={authReady}>
        <CartProvider userId={me?.id ?? null} authReady={authReady}>
          <AppContent me={me} sellerMe={sellerMe} setMe={setMe} setSellerMe={setSellerMe} />
        </CartProvider>
      </AgriCartProvider>
    </AgriCatalogProvider>
  )
}
