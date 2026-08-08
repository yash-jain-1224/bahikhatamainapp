import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius } from '../../theme/colors';
import { Button, Input } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { businessApi } from '../../services/api';
import { useAppDispatch } from '../../hooks';
import { setBusinesses, setCurrentBusiness } from '../../store/businessSlice';

export default function BusinessCreateScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Business name is required'); return; }
    try {
      setLoading(true);
      const res = await businessApi.create({
        name: name.trim(),
        type: type.trim() || 'General',
        phone: phone.trim(),
        address: address.trim(),
        gst_number: gstNumber.trim() || undefined,
      });
      if (res.data?.data) {
        dispatch(setCurrentBusiness(res.data.data));
        // Refresh business list
        const listRes = await businessApi.list();
        if (listRes.data?.data) dispatch(setBusinesses(listRes.data.data));
        toast.success('Business created!');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create business');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.text }]}>Create Business</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Set up your business to start managing your accounts</Text>

        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Input label="Business Name *" value={name} onChangeText={setName} placeholder="e.g. Sharma Traders" />
          <Input label="Business Type" value={type} onChangeText={setType} placeholder="e.g. Wholesale, Retail" />
          <Input label="Phone" value={phone} onChangeText={setPhone} placeholder="Business phone" keyboardType="phone-pad" />
          <Input label="Address" value={address} onChangeText={setAddress} placeholder="Business address" multiline />
          <Input label="GST Number" value={gstNumber} onChangeText={setGstNumber} placeholder="e.g. 22AAAAA0000A1Z5" autoCapitalize="characters" />
          <Button title="Create Business" onPress={handleCreate} loading={loading} disabled={!name.trim()} fullWidth size="lg" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  title: { fontSize: FontSize.xxl, fontWeight: '700', marginBottom: 4, marginTop: Spacing.xl },
  subtitle: { fontSize: FontSize.sm, marginBottom: Spacing.xxl, lineHeight: 20 },
  form: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.xl },
});
