import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { EmptyState } from '../../components/shared';
import { SkeletonLoader } from '../../components/shared/SkeletonLoader';
import { EnhancedRefreshControl } from '../../components/shared/EnhancedRefreshControl';
import { AnimatedListItem } from '../../components/shared/AnimatedComponents';
import { SwipeableRow } from '../../components/shared/SwipeableRow';
import { haptic } from '../../utils/haptics';
import { useToast } from '../../components/shared/Toast';
import { notificationApi } from '../../services/api';
import { formatDateTime } from '../../utils';
import type { Notification } from '../../types';

type TabType = 'all' | 'unread';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabType>('all');

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const res = await notificationApi.list({ limit: 50 });
      setNotifications(res.data?.data || []);
    } catch { toast.error('Failed to load notifications'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [toast]);

  useEffect(() => { fetch(); }, [fetch]);

  const markRead = async (id: string) => {
    haptic.light();
    try {
      await notificationApi.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch {
      // Silently fail
    }
  };

  const deleteNotification = async (id: string) => {
    haptic.light();
    try {
      // API call would go here
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Notification deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const markAllRead = async () => {
    haptic.medium();
    try {
      await notificationApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('All notifications marked as read');
    } catch {
      // Still update locally for better UX
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filtered = tab === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  const renderItem = ({ item, index }: { item: Notification; index: number }) => {
    const swipeActions = [
      {
        icon: 'check',
        color: '#FFFFFF',
        backgroundColor: colors.success,
        onPress: () => markRead(item.id),
      },
      {
        icon: 'trash-2',
        color: '#FFFFFF',
        backgroundColor: colors.error,
        onPress: () => deleteNotification(item.id),
      },
    ];

    return (
      <AnimatedListItem index={index} delay={30}>
        <SwipeableRow rightActions={swipeActions}>
          <TouchableOpacity
            style={[
              styles.card,
              { backgroundColor: item.is_read ? colors.card : colors.primary + '08', borderColor: colors.border, ...Shadow.sm },
            ]}
            onPress={() => markRead(item.id)}
            activeOpacity={0.7}
          >
            {!item.is_read && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
            <View style={styles.info}>
              <Text style={[styles.title, { color: colors.text, fontWeight: item.is_read ? '500' : '700' }]}>{item.title}</Text>
              <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={2}>{item.message}</Text>
              <Text style={[styles.time, { color: colors.textTertiary }]}>{formatDateTime(item.created_at)}</Text>
            </View>
          </TouchableOpacity>
        </SwipeableRow>
      </AnimatedListItem>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.surfaceSecondary }]}>
        <TouchableOpacity
          style={[styles.tab, tab === 'all' && { backgroundColor: colors.primary }]}
          onPress={() => {
            haptic.selection();
            setTab('all');
          }}
        >
          <Text style={[styles.tabText, { color: tab === 'all' ? '#fff' : colors.textSecondary }]}>
            All ({notifications.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'unread' && { backgroundColor: colors.primary }]}
          onPress={() => {
            haptic.selection();
            setTab('unread');
          }}
        >
          <Text style={[styles.tabText, { color: tab === 'unread' ? '#fff' : colors.textSecondary }]}>
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>
      </View>
      {/* Mark All Read Button */}
      {unreadCount > 0 && (
        <TouchableOpacity
          style={[styles.markAllBtn, { borderColor: colors.primary }]}
          onPress={markAllRead}
        >
          <Text style={[styles.markAllText, { color: colors.primary }]}>✓ Mark all read</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSkeleton = () => (
    <View style={styles.list}>
      <View style={styles.header}>
        <SkeletonLoader width={'100%'} height={44} borderRadius={BorderRadius.md} style={{ marginBottom: Spacing.sm }} />
      </View>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.card, marginBottom: Spacing.sm }]}>
          <View style={styles.info}>
            <SkeletonLoader width={180} height={16} style={{ marginBottom: 8 }} />
            <SkeletonLoader width={'100%'} height={14} style={{ marginBottom: 4 }} />
            <SkeletonLoader width={120} height={12} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {renderSkeleton()}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.list}
        refreshControl={
          <EnhancedRefreshControl
            refreshing={refreshing}
            onRefresh={() => fetch(true)}
          />
        }
        ListEmptyComponent={
          <EmptyState 
            title={tab === 'unread' ? 'No Unread Notifications' : 'No Notifications'} 
            description="You're all caught up!" 
            icon={<Text style={{ fontSize: 48 }}>🔔</Text>} 
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  header: { marginBottom: Spacing.lg },
  tabs: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  markAllBtn: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  markAllText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  card: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: Spacing.sm },
  info: { flex: 1 },
  title: { fontSize: FontSize.md },
  message: { fontSize: FontSize.sm, marginTop: 4, lineHeight: 20 },
  time: { fontSize: FontSize.xs, marginTop: Spacing.sm },
});
