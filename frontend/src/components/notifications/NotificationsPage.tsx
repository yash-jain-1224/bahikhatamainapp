import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Bell, Check, CheckCheck, ShoppingCart, TrendingUp, CreditCard, AlertTriangle, Package, Info, FileText, MessageCircle, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionLoader } from '@/components/shared/loading';
import { notificationApi } from '@/lib/api';
import { formatDateTime } from '@/utils';
import type { Notification } from '@/types';
import toast from 'react-hot-toast';

// Keys are the backend's Prisma NotificationType enum values.
const iconMap: Record<string, React.ElementType> = {
  PAYMENT_REMINDER: CreditCard,
  BILL_REMINDER: FileText,
  LOW_STOCK: Package,
  SUBSCRIPTION_EXPIRY: AlertTriangle,
  NEW_PURCHASE: ShoppingCart,
  NEW_SALE: TrendingUp,
  SYSTEM: Info,
  WHATSAPP: MessageCircle,
};

const colorMap: Record<string, string> = {
  PAYMENT_REMINDER: 'bg-purple-500/10 text-purple-400',
  BILL_REMINDER: 'bg-orange-500/10 text-orange-400',
  LOW_STOCK: 'bg-amber-500/10 text-amber-400',
  SUBSCRIPTION_EXPIRY: 'bg-red-500/10 text-red-400',
  NEW_PURCHASE: 'bg-blue-500/10 text-blue-400',
  NEW_SALE: 'bg-emerald-500/10 text-emerald-400',
  SYSTEM: 'bg-cyan-500/10 text-cyan-400',
  WHATSAPP: 'bg-green-500/10 text-green-400',
};

export default function NotificationsPage() {
  const { t } = useTranslation(['notifications', 'common']);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState('all');
  // Server-driven totals: the page used to derive counts from the first 20
  // rows only, so tab labels and the unread count lied on any real inbox.
  const [serverUnread, setServerUnread] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    fetchNotifications(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchNotifications = async (targetPage: number) => {
    try {
      setLoading(targetPage === 1);
      setLoadError(false);
      const { data } = await notificationApi.list({ page: targetPage, limit: PAGE_SIZE });
      const rows: Notification[] = data?.data || [];
      // NOTE: fabricated fallback notifications ("Gupta Trading paid ₹80,000")
      // used to be substituted on any error here. Errors must look like errors.
      setNotifications(prev => (targetPage === 1 ? rows : [...prev, ...rows]));
      setServerUnread(Number(data?.unreadCount) || 0);
      setTotalCount(Number(data?.meta?.total) || rows.length);
      setPage(targetPage);
    } catch {
      if (targetPage === 1) setNotifications([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    // Optimistic, but reverted on failure — asserting success for a failed
    // write silently un-reads itself on the next load.
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setServerUnread(c => Math.max(0, c - 1));
    try {
      await notificationApi.markRead(id);
    } catch {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: false } : n));
      setServerUnread(c => c + 1);
      toast.error(t('common:error', 'Something went wrong'));
    }
  };

  const handleDelete = async (target: Notification) => {
    // Optimistic removal — restore the previous list on failure
    const prevList = notifications;
    setNotifications(prev => prev.filter(n => n.id !== target.id));
    setTotalCount(c => Math.max(0, c - 1));
    if (!target.is_read) setServerUnread(c => Math.max(0, c - 1));
    try {
      await notificationApi.delete(target.id);
    } catch {
      setNotifications(prevList);
      setTotalCount(c => c + 1);
      if (!target.is_read) setServerUnread(c => c + 1);
      toast.error(t('common:error', 'Something went wrong'));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      toast.success(t('notifications:all_read_toast'));
      // Refetch rather than patching local state — the server cleared rows
      // beyond the loaded page too.
      fetchNotifications(1);
    } catch {
      toast.error(t('common:error', 'Something went wrong'));
    }
  };

  const unreadCount = serverUnread;
  const filtered = tab === 'unread' ? notifications.filter(n => !n.is_read) : notifications;
  const hasMore = notifications.length < totalCount;

  if (loading) return <SectionLoader />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">{t('notifications:title')}</h2>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? t('notifications:unread_count', { count: unreadCount }) : t('notifications:all_caught_up')}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            <CheckCheck className="h-4 w-4 mr-2" /> {t('notifications:mark_all_read')}
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">{t('notifications:tab_all')} ({notifications.length})</TabsTrigger>
          <TabsTrigger value="unread">{t('notifications:tab_unread')} ({unreadCount})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-16 w-16 text-muted-foreground" />}
              title={tab === 'unread' ? t('notifications:empty_unread_title') : t('notifications:empty_all_title')}
              description={tab === 'unread' ? t('notifications:empty_unread_desc') : t('notifications:empty_all_desc')}
            />
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {filtered.map((notification, i) => {
                  const Icon = iconMap[notification.type] || Info;
                  const color = colorMap[notification.type] || colorMap.SYSTEM;

                  return (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <Card className={`glass transition-all hover:bg-muted/30 ${!notification.is_read ? 'border-primary/30 bg-primary/5' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className={`text-sm font-medium ${!notification.is_read ? 'text-foreground' : 'text-muted-foreground'}`}>
                                    {notification.title}
                                  </p>
                                  <p className="text-sm text-muted-foreground mt-0.5">{notification.message}</p>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  {!notification.is_read && (
                                    <button
                                      onClick={() => handleMarkRead(notification.id)}
                                      className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                      title={t('notifications:mark_read')}
                                    >
                                      <Check className="h-4 w-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDelete(notification)}
                                    className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-red-400"
                                    title={t('notifications:delete', 'Delete')}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">{formatDateTime(notification.created_at)}</p>
                            </div>
                            {!notification.is_read && (
                              <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {hasMore && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={() => fetchNotifications(page + 1)}>
                    {t('common:load_more', 'Load more')} ({notifications.length}/{totalCount})
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {loadError && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm text-red-400">{t('common:load_error', "Couldn't load notifications.")}</p>
          <Button variant="outline" size="sm" onClick={() => fetchNotifications(1)}>{t('common:retry', 'Retry')}</Button>
        </div>
      )}
    </div>
  );
}
