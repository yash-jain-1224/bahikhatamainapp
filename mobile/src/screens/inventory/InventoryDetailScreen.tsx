import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { LoadingScreen, Button } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { inventoryApi } from '../../services/api';
import type { InventoryItem } from '../../types';

export default function InventoryDetailScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id } = route.params;

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchItem = useCallback(async () => {
    try {
      setLoading(true);
      const res = await inventoryApi.getItem(id);
      setItem(res.data?.data || null);
    } catch {
      toast.error('Failed to load item');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  if (loading && !item) return <LoadingScreen />;

  if (!item) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Item not found.</Text>
      </View>
    );
  }

  const isLowStock = item.current_stock <= item.min_stock;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Item Info Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + '15' }]}>
            <Text style={styles.icon}>📦</Text>
          </View>
          <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
          {item.sku && (
            <Text style={[styles.sku, { color: colors.textSecondary }]}>SKU: {item.sku}</Text>
          )}
          {item.category && (
            <View style={[styles.categoryBadge, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[styles.categoryText, { color: colors.primary }]}>
                {item.category.name}
              </Text>
            </View>
          )}
        </View>

        {/* Stock Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Stock Information</Text>

          <View style={styles.stockRow}>
            <View style={styles.stockItem}>
              <Text style={[styles.stockLabel, { color: colors.textSecondary }]}>Current Stock</Text>
              <Text
                style={[
                  styles.stockValue,
                  { color: isLowStock ? colors.error : colors.success },
                ]}
              >
                {item.current_stock} {item.unit}
              </Text>
            </View>
            <View style={styles.stockItem}>
              <Text style={[styles.stockLabel, { color: colors.textSecondary }]}>Min Stock</Text>
              <Text style={[styles.stockValue, { color: colors.text }]}>
                {item.min_stock} {item.unit}
              </Text>
            </View>
          </View>

          {isLowStock && (
            <View style={[styles.alertBanner, { backgroundColor: colors.errorLight }]}>
              <Text style={[styles.alertText, { color: colors.error }]}>
                ⚠️ Stock is below minimum level
              </Text>
            </View>
          )}
        </View>

        {/* Unit */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Details</Text>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Unit</Text>
            <Text style={[styles.detailValue, { color: colors.text }]}>{item.unit}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('InventoryEdit', { id })}
          >
            <Text style={styles.actionBtnText}>✏️ Edit Item</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtnOutline, { borderColor: colors.primary }]}
            onPress={() => navigation.navigate('StockAdjust')}
          >
            <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>📊 Adjust Stock</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  errorText: { textAlign: 'center', marginTop: 100, fontSize: FontSize.md },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  icon: { fontSize: 28 },
  itemName: { fontSize: FontSize.xxl, fontWeight: '700', textAlign: 'center' },
  sku: { fontSize: FontSize.sm, marginTop: 4, textAlign: 'center' },
  categoryBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.md,
  },
  categoryText: { fontSize: FontSize.sm, fontWeight: '600' },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.lg, alignSelf: 'flex-start' },
  stockRow: { flexDirection: 'row', width: '100%' },
  stockItem: { flex: 1, alignItems: 'center' },
  stockLabel: { fontSize: FontSize.sm, marginBottom: 4 },
  stockValue: { fontSize: FontSize.xl, fontWeight: '700' },
  alertBanner: {
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  alertText: { fontSize: FontSize.sm, fontWeight: '600' },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: Spacing.sm,
  },
  detailLabel: { fontSize: FontSize.md },
  detailValue: { fontSize: FontSize.md, fontWeight: '600' },
  actions: {
    gap: Spacing.sm,
  },
  actionBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  actionBtnText: { color: '#FFF', fontWeight: '600', fontSize: FontSize.md },
  actionBtnOutline: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  actionBtnOutlineText: { fontWeight: '600', fontSize: FontSize.md },
});
