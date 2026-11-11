import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Users,
  Gem,
  Layers,
  BarChart3,
  Settings,
  KeyRound,
  LogOut,
  Menu,
  X,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext.jsx';
import { APP_NAME, APP_TAGLINE } from '@/lib/format.js';
import { useSettings } from '@/lib/hooks.js';
import { GoldRateBanner } from './GoldRateBanner.jsx';
import { IdleLogout } from './IdleLogout.jsx';
import { ErrorBoundary } from '@/components/ErrorBoundary.jsx';
import { Button, useConfirm } from '@/components/ui';

const NAV = [
  { section: 'Counter' },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/sales/new', label: 'Add Sale', icon: ShoppingCart },
  { to: '/sales', label: 'Sales History', icon: Receipt, end: true },
  { section: 'Shop' },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/items', label: 'Items', icon: Gem },
  { to: '/categories', label: 'Gold Rates & Karats', icon: Layers },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { section: 'Account' },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/change-password', label: 'Change Password', icon: KeyRound },
];

function Sidebar({ onNavigate }) {
  const { logout, admin } = useAuth();
  const confirm = useConfirm();
  const { data: settings } = useSettings();

  const doLogout = async () => {
    if (await confirm({ title: 'Log out', message: 'Are you sure you want to log out?', confirmText: 'Yes, log out' })) {
      logout('You have been logged out.');
    }
  };

  return (
    <div className="flex h-full flex-col bg-onyx-900 text-white/80">
      <div className="px-5 pb-3 pt-5">
        <div className="flex items-center gap-3">
          {settings?.logo_path ? (
            <img src={settings.logo_path} alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-0.5" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gold-400/40 bg-gradient-to-br from-gold-300 to-gold-600 text-onyx-900">
              <Gem className="h-5 w-5" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-display text-[1.25rem] font-semibold leading-tight text-white">{APP_NAME}</div>
            <div className="truncate text-[12px] text-gold-300/80">{settings?.shop_name || APP_TAGLINE}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Main menu">
        {NAV.map((item) =>
          item.section ? (
            <p key={item.section} className="px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
              {item.section}
            </p>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `group relative mb-0.5 flex min-h-[36px] items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors ${
                  isActive ? 'bg-white/[0.07] text-white' : 'text-white/65 hover:bg-white/[0.04] hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-gold-400" aria-hidden />}
                  <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-gold-300' : 'text-white/45 group-hover:text-white/70'}`} aria-hidden />
                  {item.label}
                </>
              )}
            </NavLink>
          ),
        )}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex items-center gap-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold uppercase text-gold-200">
            {admin?.username?.[0] || 'A'}
          </div>
          <span className="truncate text-[13px] text-white/60">{admin?.username}</span>
        </div>
        <button
          type="button"
          onClick={doLogout}
          className="flex min-h-[36px] w-full items-center justify-center gap-2 rounded-lg border border-white/15 text-[13px] font-medium text-white/80 transition-colors hover:border-gold-400/60 hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Log Out
        </button>
      </div>
    </div>
  );
}

export function Layout() {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const { admin } = useAuth();

  useEffect(() => {
    setDrawer(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen lg:pl-60">
      <IdleLogout />
      {/* Desktop sidebar: always visible */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <Sidebar />
      </aside>

      {/* Tablet / mobile drawer */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between bg-onyx-900 px-4 py-2 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-expanded={drawer}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-white/15 px-3 text-[14px]"
        >
          <Menu className="h-4 w-4" aria-hidden /> Menu
        </button>
        <span className="font-display text-[1.15rem] font-semibold">{APP_NAME}</span>
      </div>
      {drawer && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-onyx-900/50" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="page-enter absolute inset-y-0 left-0 flex w-[min(17rem,85vw)] flex-col bg-onyx-900 shadow-2xl">
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-2 text-[13px] text-white/70 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden /> Close menu
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar onNavigate={() => setDrawer(false)} />
            </div>
          </aside>
        </div>
      )}

      <GoldRateBanner />

      {admin?.must_change_password && location.pathname !== '/change-password' && (
        <div className="no-print mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:mx-8">
          <div className="flex items-start gap-3 text-[14px]">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-gold-600" aria-hidden />
            <p>
              <span className="font-semibold">Please change your password.</span>{' '}
              <span className="text-ink-soft">You are still using the starting password.</span>
            </p>
          </div>
          <Button to="/change-password" size="sm" icon={KeyRound}>
            Change Password
          </Button>
        </div>
      )}

      <main key={location.pathname} className="page-enter mx-auto max-w-[1400px] px-4 py-5 lg:px-8 lg:py-6">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
