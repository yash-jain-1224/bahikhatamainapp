import React, { useState, useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, ShoppingCart, TrendingUp, Package, BookOpen,
  CreditCard, Users, Settings, Bell, Menu, X, ChevronDown,
  Building2, LogOut, Crown, Gift, Shield, User, FileText, HelpCircle,
  Sun, Moon, Monitor, Check, Plus, ArrowRightLeft, Receipt, ScrollText,
} from 'lucide-react';
import { cn } from '@/utils';
import { Avatar, AvatarImage, AvatarFallback, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui';
import { logout } from '@/store/authSlice';
import { authApi, notificationApi } from '@/lib/api';
import { clearBusiness, setCurrentBusiness } from '@/store/businessSlice';
import { useTheme } from '@/hooks/useTheme';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import type { RootState } from '@/store';

const navItems = [
  { path: '/dashboard', labelKey: 'nav:dashboard', icon: LayoutDashboard },
  { path: '/purchases', labelKey: 'nav:purchases', icon: ShoppingCart },
  { path: '/sales', labelKey: 'nav:sales', icon: TrendingUp },
  { path: '/inventory', labelKey: 'nav:inventory', icon: Package },
  { path: '/expenses', labelKey: 'nav:expenses', icon: Receipt },
  { path: '/ledger', labelKey: 'nav:ledger', icon: BookOpen },
  { path: '/payments', labelKey: 'nav:payments', icon: CreditCard },
  { path: '/parties', labelKey: 'nav:parties', icon: Users },
  { path: '/bills', labelKey: 'nav:bills', icon: ScrollText },
  { path: '/reports', labelKey: 'nav:reports', icon: FileText },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<{ name: string; logo_url?: string } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { t } = useTranslation(['nav', 'common']);
  const { user, trialInfo } = useSelector((s: RootState) => s.auth);
  const { currentBusiness, businesses } = useSelector((s: RootState) => s.business);

  const maxBusinesses = trialInfo?.maxBusinesses ?? 1;
  const canAddBusiness = businesses.length < maxBusinesses;
  const { theme, setTheme } = useTheme();

  // Real unread count for the bell badge — it used to be a hard-coded "3" for
  // every user on every page. Refreshed on navigation so marking things read
  // on /notifications clears it.
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    notificationApi.list({ limit: 1 })
      .then(res => { if (!cancelled) setUnreadCount(Number(res.data?.unreadCount) || 0); })
      .catch(() => { /* keep the last known count */ });
    return () => { cancelled = true; };
  }, [location.pathname]);

  const handleSwitchBusiness = useCallback((biz: (typeof businesses)[number]) => {
    if (biz.id === currentBusiness?.id) return;
    setSwitchingTo({ name: biz.name, logo_url: biz.logo_url });
    dispatch(setCurrentBusiness(biz));
    // Navigate to dashboard so stale data from previous business isn't shown
    navigate('/dashboard');
    // Clear the indicator after animation completes
    setTimeout(() => setSwitchingTo(null), 2200);
  }, [currentBusiness, dispatch, navigate]);

  const bottomNavItems = [
    { path: '/business', labelKey: 'nav:businesses', icon: Building2 },
    { path: '/subscription', labelKey: 'nav:subscription', icon: Crown },
    { path: '/referrals', labelKey: 'nav:referrals', icon: Gift },
    { path: '/help', labelKey: 'nav:help', icon: HelpCircle },
    { path: '/settings', labelKey: 'nav:settings', icon: Settings },
  ];

  const handleLogout = async () => {
    // Revoke the session server-side first. This used to only dispatch the
    // Redux action, which clears local state but leaves the refresh token valid
    // in the database — so a token captured before "Log out" stayed usable for
    // its full lifetime. Best-effort: a failed call must never trap the user in
    // a signed-in UI, so local state is cleared regardless.
    try {
      await authApi.logout(localStorage.getItem('bk_refresh_token') || undefined);
    } catch {
      // ignore — clearing local state below is what the user asked for
    }
    dispatch(logout());
    dispatch(clearBusiness());
    navigate('/login');
  };

  return (
    <div className="flex h-dvh bg-background overflow-hidden">

      {/* ── Business switch toast ─────────────────────────────────────── */}
      <AnimatePresence>
        {switchingTo && (
          <motion.div
            initial={{ opacity: 0, y: 48, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 48, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 rounded-xl border border-border bg-card shadow-2xl px-4 py-3 pointer-events-none"
          >
            <div className="h-8 w-8 rounded-lg overflow-hidden bg-primary/10 flex items-center justify-center shrink-0">
              {switchingTo.logo_url ? (
                <img src={switchingTo.logo_url} alt={switchingTo.name} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-4 w-4 text-primary" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">{t('dashboard:switched_to')} <span className="text-primary">{switchingTo.name}</span></span>
            </div>
            <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Check className="h-3 w-3 text-emerald-500" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col transform border-r border-border bg-card transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:shrink-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-border">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gradient">Bahi Khata</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Business Selector */}
        {currentBusiness && (
          <div className="p-3 border-b border-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-muted transition-colors text-left">
                  <div className="h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                    {currentBusiness.logo_url ? (
                      <img
                        src={currentBusiness.logo_url}
                        alt={currentBusiness.name}
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="h-full w-full bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{currentBusiness.name}</p>
                    <p className="text-xs text-muted-foreground">{currentBusiness.type}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>{t('nav:switch_business')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {businesses.map((biz) => {
                  const isActive = currentBusiness?.id === biz.id;
                  return (
                    <DropdownMenuItem
                      key={biz.id}
                      onClick={() => handleSwitchBusiness(biz)}
                      className={isActive ? 'bg-primary/10 text-primary focus:bg-primary/15 focus:text-primary' : ''}
                    >
                      <div className="h-5 w-5 rounded overflow-hidden mr-2 shrink-0 flex items-center justify-center">
                        {biz.logo_url ? (
                          <img
                            src={biz.logo_url}
                            alt={biz.name}
                            className="h-full w-full object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <Building2 className="h-4 w-4" />
                        )}
                      </div>
                      <span className="flex-1">{biz.name}</span>
                      {isActive && <Check className="h-3.5 w-3.5 ml-2 shrink-0" />}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                {canAddBusiness ? (
                  <DropdownMenuItem onClick={() => navigate('/business/new')}>
                    <Plus className="h-4 w-4 mr-2 text-muted-foreground" />
                    {t('nav:add_business')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => navigate('/subscription')} className="text-amber-600 dark:text-amber-400 focus:text-amber-600 dark:focus:text-amber-400">
                    <Crown className="h-4 w-4 mr-2" />
                    {t('nav:upgrade_to_add')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto min-h-0 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <item.icon className="h-5 w-5" />
                {t(item.labelKey)}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-indicator"
                    className="absolute left-0 h-8 w-1 rounded-r-full bg-primary"
                  />
                )}
              </Link>
            );
          })}

          <div className="pt-4 mt-4 border-t border-border space-y-1">
            {bottomNavItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* Overlay for mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-border px-4 lg:px-6 bg-card/80 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold hidden sm:block">
              {(() => {
                const nav = navItems.find(n => location.pathname.startsWith(n.path));
                if (nav) return t(nav.labelKey);
                const bottom = bottomNavItems.find(n => location.pathname.startsWith(n.path));
                if (bottom) return t(bottom.labelKey);
                return t('common:app_name_full');
              })()}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <LanguageSwitcher compact />

            {/* Theme Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
                  <span className="sr-only">{t('common:toggle_theme')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => setTheme('light')} className={cn(theme === 'light' && 'bg-accent')}>
                  <Sun className="h-4 w-4 mr-2" /> {t('common:theme_light')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')} className={cn(theme === 'dark' && 'bg-accent')}>
                  <Moon className="h-4 w-4 mr-2" /> {t('common:theme_dark')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')} className={cn(theme === 'system' && 'bg-accent')}>
                  <Monitor className="h-4 w-4 mr-2" /> {t('common:theme_system')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Notifications */}
            <Button variant="ghost" size="icon" onClick={() => navigate('/notifications')} className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full p-1 hover:bg-muted transition-colors">
                  <Avatar className="h-8 w-8">
                    {user?.avatar_url && <AvatarImage src={user.avatar_url} alt={user?.name || 'User'} />}
                    <AvatarFallback className="text-xs bg-primary/20 text-primary">
                      {user?.name?.charAt(0) || user?.phone?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div>
                    <p className="font-medium">{user?.name || 'User'}</p>
                    <p className="text-xs text-muted-foreground">{user?.phone}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  {t('nav:profile')}
                </DropdownMenuItem>
                {user?.is_super_admin && (
                  <DropdownMenuItem onClick={() => navigate('/admin')}>
                    <Shield className="h-4 w-4 mr-2" />
                    {t('nav:admin_panel')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-400">
                  <LogOut className="h-4 w-4 mr-2" />
                  {t('nav:logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto min-h-0">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="min-h-full p-4 pb-10 lg:p-6 lg:pb-12"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
