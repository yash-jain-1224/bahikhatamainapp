import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Avatar, Button, Input } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { profileApi } from '../../services/api';
import { useAppSelector, useAppDispatch } from '../../hooks';
import { setUser } from '../../store/authSlice';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const navigation = useNavigation<any>();
  const user = useAppSelector((s) => s.auth.user);
  const trialInfo = useAppSelector((s) => s.auth.trialInfo);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleSave = async () => {
    try {
      setLoading(true);
      const res = await profileApi.update({ name, email });
      if (res.data?.data) {
        dispatch(setUser(res.data.data));
        toast.success('Profile updated!');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeAvatar = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 500,
        maxHeight: 500,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) return;

      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append('avatar', {
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        name: asset.fileName || 'avatar.jpg',
      } as any);

      const res = await profileApi.uploadAvatar(formData);
      if (res.data?.data?.user) {
        dispatch(setUser(res.data.data.user));
        toast.success('Profile photo updated!');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload photo');
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleChangeAvatar} disabled={uploadingAvatar}>
            <Avatar name={user?.name || 'U'} imageUrl={user?.avatar_url} size={80} fontSize={28} />
            {uploadingAvatar && (
              <View style={[styles.avatarOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                <Text style={{ color: '#FFF', fontSize: FontSize.xs }}>Uploading...</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleChangeAvatar} disabled={uploadingAvatar}>
            <Text style={[styles.changePhotoText, { color: colors.primary }]}>Change Photo</Text>
          </TouchableOpacity>
          <Text style={[styles.phone, { color: colors.textSecondary }]}>{user?.phone}</Text>
        </View>

        {/* Subscription/Trial Status */}
        {trialInfo && (
          <TouchableOpacity
            style={[
              styles.trialCard,
              {
                backgroundColor: trialInfo.expired
                  ? colors.error + '10'
                  : trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7
                    ? colors.warning + '10'
                    : colors.success + '10',
                borderColor: trialInfo.expired
                  ? colors.error + '30'
                  : trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7
                    ? colors.warning + '30'
                    : colors.success + '30',
              },
            ]}
            onPress={() => navigation.navigate('Subscription')}
          >
            <View style={styles.trialContent}>
              <Text style={{ fontSize: 24 }}>
                {trialInfo.expired ? '⚠️' : trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7 ? '⏳' : '✓'}
              </Text>
              <View style={styles.trialInfo}>
                <Text
                  style={[
                    styles.trialTitle,
                    {
                      color: trialInfo.expired
                        ? colors.error
                        : trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7
                          ? colors.warning
                          : colors.success,
                    },
                  ]}
                >
                  {trialInfo.expired
                    ? 'Trial Expired'
                    : trialInfo.daysRemaining !== null && trialInfo.daysRemaining <= 7
                      ? `${trialInfo.daysRemaining} days left in trial`
                      : 'Active Subscription'}
                </Text>
                <Text style={[styles.trialDesc, { color: colors.textSecondary }]}>
                  {trialInfo.planName || 'Free Plan'}
                </Text>
              </View>
              <Text style={{ color: colors.textTertiary }}>›</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Form */}
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Input label="Name" value={name} onChangeText={setName} placeholder="Enter your name" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="Enter email" keyboardType="email-address" autoCapitalize="none" />
          <View style={styles.phoneRow}>
            <Text style={[styles.phoneLabel, { color: colors.textSecondary }]}>Phone</Text>
            <Text style={[styles.phoneValue, { color: colors.textTertiary }]}>{user?.phone} (cannot change)</Text>
          </View>
          <Button title="Save Changes" onPress={handleSave} loading={loading} fullWidth size="lg" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  avatarSection: { alignItems: 'center', marginBottom: Spacing.xl, marginTop: Spacing.xl },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePhotoText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  phone: { fontSize: FontSize.md, marginTop: Spacing.xs },
  trialCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  trialContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trialInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  trialTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  trialDesc: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  formCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.xl },
  phoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  phoneLabel: {
    fontSize: FontSize.sm,
  },
  phoneValue: {
    fontSize: FontSize.sm,
  },
});
