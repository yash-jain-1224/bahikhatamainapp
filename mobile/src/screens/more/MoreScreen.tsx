import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Avatar, BusinessAvatar } from '../../components/shared';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { logout } from '../../store/authSlice';
import { clearBusiness } from '../../store/businessSlice';

interface MenuItem {
  label: string;
  icon: string;
  screen: string;
  params?: any;
}

const accountingItems: MenuItem[] = [
  { label: 'Ledger', icon: '📒', screen: 'Ledger' },
  { label: 'Payments', icon: '💰', screen: 'Payments' },
  { label: 'Parties', icon: '👥', screen: 'Parties' },
  { label: 'Reports', icon: '📊', screen: 'Reports' },
];

const accountItems: MenuItem[] = [
  { label: 'Profile', icon: '👤', screen: 'Profile' },
  { label: 'Help & Support', icon: '❓', screen: 'Help' },
];

export default function MoreScreen() {
  const { colors, toggleTheme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const business = useAppSelector((s) => s.business.currentBusiness);
  const businesses = useAppSelector((s) => s.business.businesses);

  const businessItems: MenuItem[] = [
    ...(business
      ? [{ label: 'Business Settings', icon: '⚙️', screen: 'BusinessSettings', params: { id: business.id } }]
      : []),
    ...(businesses.length > 1
      ? [{ label: 'Switch Business', icon: '🔄', screen: 'BusinessList' } as MenuItem]
      : []),
    { label: 'Subscription', icon: '⭐', screen: 'Subscription' },
    { label: 'Referrals', icon: '🎁', screen: 'Referrals' },
  ];

  const menuSections = [
    { title: 'Accounting', items: accountingItems },
    { title: 'Business', items: businessItems },
    { title: 'Account', items: accountItems },
  ];

  const handleLogout = () => {
    dispatch(logout());
    dispatch(clearBusiness());
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Business Card */}
        {business && (
          <TouchableOpacity
            style={[styles.businessCard, { backgroundColor: colors.primary, ...Shadow.md }]}
            onPress={() => navigation.navigate('BusinessSettings', { id: business.id })}
            activeOpacity={0.7}
          >
            <BusinessAvatar name={business.name} logoUrl={business.logo_url} size={48} />
            <View style={styles.businessInfo}>
              <Text style={styles.businessCardName} numberOfLines={1}>{business.name}</Text>
              <Text style={styles.businessCardType}>{business.type || 'Business'}</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        )}

        {/* Profile Card */}
        <TouchableOpacity
          style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
        >
          <Avatar name={user?.name || 'U'} imageUrl={user?.avatar_url} size={52} />
          <View style={styles.profileInfo}>
            <Text style={[styles.userName, { color: colors.text }]}>{user?.name || 'User'}</Text>
            <Text style={[styles.userPhone, { color: colors.textSecondary }]}>{user?.phone}</Text>
            {business && (
              <Text style={[styles.businessLabel, { color: colors.primary }]} numberOfLines={1}>
                {business.name}
              </Text>
            )}
          </View>
          <Text style={{ color: colors.textTertiary, fontSize: 20 }}>›</Text>
        </TouchableOpacity>

        {/* Menu Sections */}
        {menuSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {section.title}
            </Text>
            <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.menuItem,
                    idx > 0 && { borderTopWidth: 1, borderTopColor: colors.borderLight },
                  ]}
                  onPress={() => navigation.navigate(item.screen, item.params)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuIcon}>{item.icon}</Text>
                  <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 18 }}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Dark Mode Toggle */}
        <View style={styles.section}>
          <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.menuItem} onPress={toggleTheme} activeOpacity={0.7}>
              <Text style={styles.menuIcon}>{isDark ? '🌙' : '☀️'}</Text>
              <Text style={[styles.menuLabel, { color: colors.text }]}>
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </Text>
              <View style={[styles.toggle, { backgroundColor: isDark ? colors.primary : colors.surfaceSecondary }]}>
                <View style={[styles.toggleThumb, { backgroundColor: '#FFF', left: isDark ? 20 : 2 }]} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.error + '40' }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Text style={[styles.logoutText, { color: colors.error }]}>🚪 Sign Out</Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.textTertiary }]}>
          Bahi Khata v1.0.0
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  businessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  businessInfo: { flex: 1, marginLeft: Spacing.md },
  businessCardName: { fontSize: FontSize.lg, fontWeight: '700', color: '#FFF' },
  businessCardType: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
  profileInfo: { flex: 1, marginLeft: Spacing.md },
  userName: { fontSize: FontSize.lg, fontWeight: '700' },
  userPhone: { fontSize: FontSize.sm, marginTop: 2 },
  businessLabel: { fontSize: FontSize.xs, fontWeight: '600', marginTop: 4 },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm, paddingHorizontal: Spacing.xs },
  menuCard: { borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg },
  menuIcon: { fontSize: 20, marginRight: Spacing.md, width: 28, textAlign: 'center' },
  menuLabel: { flex: 1, fontSize: FontSize.md, fontWeight: '500' },
  toggle: { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, position: 'absolute' },
  logoutBtn: { padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, alignItems: 'center', marginBottom: Spacing.lg },
  logoutText: { fontSize: FontSize.md, fontWeight: '600' },
  version: { textAlign: 'center', fontSize: FontSize.xs, marginBottom: Spacing.xxl },
});
