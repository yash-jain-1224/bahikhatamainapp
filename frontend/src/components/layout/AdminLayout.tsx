import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import {
  Shield, LayoutDashboard, Users, ScrollText, Settings, ArrowLeft,
  Menu, X, Bell, LogOut, User, BookOpen, Building2, Crown,
  Sun, Moon, Monitor, CreditCard, Receipt,
} from 'lucide-react';
import { cn } from '@/utils';
import {
  Avatar, AvatarImage, AvatarFallback, Button,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui';
import { logout } from '@/store/authSlice';
import { authApi } from '@/lib/api';
import { clearBusiness } from '@/store/businessSlice';
import { useTheme } from '@/hooks/useTheme';
import type { RootState } from '@/store';

const adminNavItems = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/businesses', label: 'Businesses', icon: Building2 },
  { path: '/admin/plans', label: 'Plans', icon: Crown },
  { path: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { path: '/admin/invoices', label: 'Invoices', icon: Receipt },
  { path: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
  { path: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((s: RootState) => s.auth);
  const { theme, setTheme } = useTheme();

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

  const isActive = (item: typeof adminNavItems[0]) => {
    if (item.exact) return location.pathname === item.path;
    return location.pathname.startsWith(item.path);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Admin Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col transform border-r border-border bg-card transition-transform duration-200 lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Admin Logo / Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-red-500/20 flex items-center justify-center">
              <Shield className="h-4 w-4 text-red-500" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">Admin</span>
              <span className="text-xs text-muted-foreground block -mt-1">Super Admin Panel</span>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Back to App */}
        <div className="p-3 border-b border-border">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to App
          </Link>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto min-h-0 p-3 space-y-1">
          {adminNavItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all relative',
                  active
                    ? 'bg-red-500/10 text-red-500'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
                {active && (
                  <motion.div
                    layoutId="admin-sidebar-indicator"
                    className="absolute left-0 h-8 w-1 rounded-r-full bg-red-500"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Admin badge at bottom */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Shield className="h-4 w-4 text-red-500" />
            <div>
              <p className="font-medium text-foreground">{user?.name || 'Admin'}</p>
              <p>Super Administrator</p>
            </div>
          </div>
        </div>
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
      <div className="flex flex-1 flex-col min-h-0">
        {/* Top Bar */}
        <header className="flex h-16 items-center justify-between border-b border-border px-4 lg:px-6 bg-card/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-muted-foreground hover:text-foreground">
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 text-red-500 text-xs font-semibold">
                <Shield className="h-3 w-3" />
                ADMIN
              </span>
              <h1 className="text-lg font-semibold hidden sm:block">
                {adminNavItems.find(n => isActive(n))?.label || 'Admin Panel'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
                  <span className="sr-only">Toggle theme</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => setTheme('light')} className={cn(theme === 'light' && 'bg-accent')}>
                  <Sun className="h-4 w-4 mr-2" /> Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')} className={cn(theme === 'dark' && 'bg-accent')}>
                  <Moon className="h-4 w-4 mr-2" /> Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')} className={cn(theme === 'system' && 'bg-accent')}>
                  <Monitor className="h-4 w-4 mr-2" /> System
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Notifications */}
            <Button variant="ghost" size="icon" onClick={() => navigate('/notifications')} className="relative">
              <Bell className="h-5 w-5" />
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full p-1 hover:bg-muted transition-colors">
                  <Avatar className="h-8 w-8">
                    {user?.avatar_url && <AvatarImage src={user.avatar_url} alt={user?.name || 'Admin'} />}
                    <AvatarFallback className="text-xs bg-red-500/20 text-red-500">
                      {user?.name?.charAt(0) || 'A'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div>
                    <p className="font-medium">{user?.name || 'Admin'}</p>
                    <p className="text-xs text-muted-foreground">{user?.phone}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  Back to App
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-400">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto min-h-0 p-4 lg:p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
