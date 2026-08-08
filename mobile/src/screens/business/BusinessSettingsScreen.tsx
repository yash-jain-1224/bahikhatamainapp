import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius } from '../../theme/colors';
import { Button, Input, BusinessAvatar } from '../../components/shared';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { useToast } from '../../components/shared/Toast';
import { businessApi } from '../../services/api';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { setBusinesses, updateBusinessLogo } from '../../store/businessSlice';
import { haptic } from '../../utils/haptics';

export default function BusinessSettingsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useAppDispatch();
  const businesses = useAppSelector((s) => s.business.businesses);
  const currentBusiness = businesses.find((b) => b.id === route.params?.id);

  const [name, setName] = useState(currentBusiness?.name || '');
  const [type, setType] = useState(currentBusiness?.type || '');
  const [phone, setPhone] = useState(currentBusiness?.phone || '');
  const [address, setAddress] = useState(currentBusiness?.address || '');
  const [gstNumber, setGstNumber] = useState(currentBusiness?.gst_number || '');
  const [city, setCity] = useState(currentBusiness?.city || '');
  const [state, setState] = useState(currentBusiness?.state || '');
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleUploadLogo = async () => {
    haptic.selection();
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 512,
        maxHeight: 512,
      });

      if (result.didCancel || !result.assets?.[0]) return;
      const asset = result.assets[0];

      if (!asset.uri) {
        toast.error('Failed to select image');
        return;
      }

      setUploadingLogo(true);
      const formData = new FormData();
      formData.append('logo', {
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        name: asset.fileName || 'logo.jpg',
      } as any);

      const res = await businessApi.uploadLogo(currentBusiness!.id, formData);
      if (res.data?.data?.logo_url) {
        dispatch(updateBusinessLogo({ id: currentBusiness!.id, logo_url: res.data.data.logo_url }));
        toast.success('Logo updated!');
        haptic.success();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload logo');
      haptic.error();
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    setShowRemoveConfirm(false);
    haptic.warning();
    try {
      setUploadingLogo(true);
      await businessApi.removeLogo(currentBusiness!.id);
      dispatch(updateBusinessLogo({ id: currentBusiness!.id, logo_url: '' }));
      toast.success('Logo removed');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Business name is required');
      return;
    }
    if (!currentBusiness) return;

    try {
      setLoading(true);
      const res = await businessApi.update(currentBusiness.id, {
        name: name.trim(),
        type: type.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        gst_number: gstNumber.trim() || undefined,
      });
      if (res.data?.data) {
        // Refresh business list
        const listRes = await businessApi.list();
        if (listRes.data?.data) {
          dispatch(setBusinesses(listRes.data.data));
        }
        toast.success('Business updated!');
        navigation.goBack();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update business');
    } finally {
      setLoading(false);
    }
  };

  if (!currentBusiness) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Business not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <TouchableOpacity
            onPress={handleUploadLogo}
            disabled={uploadingLogo}
            activeOpacity={0.8}
            style={styles.logoContainer}
          >
            {uploadingLogo ? (
              <View style={[styles.logoPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <BusinessAvatar
                name={currentBusiness.name}
                logoUrl={currentBusiness.logo_url}
                size={100}
                fontSize={36}
              />
            )}
            <View style={[styles.cameraIcon, { backgroundColor: colors.primary }]}>
              <Text style={styles.cameraEmoji}>📷</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.businessId, { color: colors.textTertiary }]}>
            ID: {currentBusiness.id.slice(0, 8)}...
          </Text>
          <View style={styles.logoActions}>
            <TouchableOpacity
              onPress={handleUploadLogo}
              disabled={uploadingLogo}
              style={[styles.logoButton, { backgroundColor: colors.primary + '15' }]}
            >
              <Text style={[styles.logoButtonText, { color: colors.primary }]}>
                {currentBusiness.logo_url ? 'Change Logo' : 'Upload Logo'}
              </Text>
            </TouchableOpacity>
            {currentBusiness.logo_url && (
              <TouchableOpacity
                onPress={() => setShowRemoveConfirm(true)}
                disabled={uploadingLogo}
                style={[styles.logoButton, { backgroundColor: colors.error + '15', marginLeft: Spacing.sm }]}
              >
                <Text style={[styles.logoButtonText, { color: colors.error }]}>Remove</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Form */}
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Input label="Business Name *" value={name} onChangeText={setName} placeholder="Enter business name" />
          <Input label="Business Type" value={type} onChangeText={setType} placeholder="e.g., General, Retail" />
          <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="Business phone" keyboardType="phone-pad" />
          <Input label="Address" value={address} onChangeText={setAddress} placeholder="Street address" multiline />
          <Input label="City" value={city} onChangeText={setCity} placeholder="City" />
          <Input label="State" value={state} onChangeText={setState} placeholder="State" />
          <Input label="GST Number" value={gstNumber} onChangeText={setGstNumber} placeholder="e.g., 22AAAAA0000A1Z5" autoCapitalize="characters" />

          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={loading}
            fullWidth
            size="lg"
            style={{ marginTop: Spacing.lg }}
          />
        </View>
      </ScrollView>

      {/* Confirm Remove Logo Dialog */}
      <ConfirmDialog
        visible={showRemoveConfirm}
        title="Remove Logo"
        message="Are you sure you want to remove the business logo?"
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleRemoveLogo}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  errorText: { textAlign: 'center', marginTop: 100, fontSize: FontSize.md },
  logoSection: { alignItems: 'center', marginBottom: Spacing.xxl, marginTop: Spacing.xl },
  logoContainer: { position: 'relative' },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraEmoji: { fontSize: 16 },
  businessId: { fontSize: FontSize.xs, marginTop: Spacing.sm },
  logoActions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  logoButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  logoButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  formCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.xl },
});
