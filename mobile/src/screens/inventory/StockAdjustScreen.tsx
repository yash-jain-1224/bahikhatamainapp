import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Input, Button, SearchBar, LoadingScreen } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { inventoryApi } from '../../services/api';
import type { InventoryItem } from '../../types';

type AdjustmentType = 'add' | 'remove' | 'set';

export default function StockAdjustScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<any>();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await inventoryApi.listItems({});
      setItems(res.data?.data || []);
    } catch {
      toast.error('Failed to load inventory items');
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    (item.sku && item.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const calculateNewStock = () => {
    if (!selectedItem || !quantity) return selectedItem?.current_stock || 0;
    const qty = parseInt(quantity, 10) || 0;
    switch (adjustmentType) {
      case 'add':
        return selectedItem.current_stock + qty;
      case 'remove':
        return Math.max(0, selectedItem.current_stock - qty);
      case 'set':
        return qty;
      default:
        return selectedItem.current_stock;
    }
  };

  const handleSubmit = async () => {
    if (!selectedItem) {
      toast.error('Please select an item');
      return;
    }
    if (!quantity || parseInt(quantity, 10) <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    try {
      setSubmitting(true);
      const qty = parseInt(quantity, 10);
      let adjustmentQty = qty;
      
      if (adjustmentType === 'remove') {
        adjustmentQty = -qty;
      } else if (adjustmentType === 'set') {
        adjustmentQty = qty - selectedItem.current_stock;
      }

      await inventoryApi.adjustStock({
        item_id: selectedItem.id,
        quantity: adjustmentQty,
        reason: reason.trim() || undefined,
        type: adjustmentType === 'set' ? 'SET' : adjustmentType === 'add' ? 'IN' : 'OUT',
      });

      toast.success('Stock adjusted successfully');
      navigation.goBack();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to adjust stock');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Select Item Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>📦</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Select Item</Text>
            </View>

            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search items..."
            />

            {!selectedItem ? (
              <View style={styles.itemList}>
                {filteredItems.slice(0, 5).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemOption, { borderColor: colors.border }]}
                    onPress={() => setSelectedItem(item)}
                  >
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, { color: colors.text }]}>{item.name}</Text>
                      {item.sku && (
                        <Text style={[styles.itemSku, { color: colors.textTertiary }]}>
                          SKU: {item.sku}
                        </Text>
                      )}
                    </View>
                    <View style={styles.itemStock}>
                      <Text style={[styles.stockValue, { color: colors.primary }]}>
                        {item.current_stock}
                      </Text>
                      <Text style={[styles.stockUnit, { color: colors.textSecondary }]}>
                        {item.unit}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {filteredItems.length === 0 && (
                  <Text style={[styles.noItems, { color: colors.textSecondary }]}>
                    No items found
                  </Text>
                )}
              </View>
            ) : (
              <View style={[styles.selectedItem, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
                <View style={styles.selectedInfo}>
                  <Text style={[styles.selectedName, { color: colors.text }]}>{selectedItem.name}</Text>
                  <Text style={[styles.selectedStock, { color: colors.textSecondary }]}>
                    Current: {selectedItem.current_stock} {selectedItem.unit}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.changeBtn, { backgroundColor: colors.surface }]}
                  onPress={() => setSelectedItem(null)}
                >
                  <Text style={[styles.changeBtnText, { color: colors.primary }]}>Change</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {selectedItem && (
            <>
              {/* Adjustment Type Card */}
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <Text style={{ fontSize: 20 }}>⚙️</Text>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Adjustment Type</Text>
                </View>

                <View style={styles.typeOptions}>
                  {[
                    { type: 'add' as AdjustmentType, label: 'Add Stock', icon: '➕', color: colors.success },
                    { type: 'remove' as AdjustmentType, label: 'Remove Stock', icon: '➖', color: colors.error },
                    { type: 'set' as AdjustmentType, label: 'Set Stock', icon: '🔢', color: colors.primary },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.type}
                      style={[
                        styles.typeOption,
                        {
                          borderColor: adjustmentType === opt.type ? opt.color : colors.border,
                          backgroundColor: adjustmentType === opt.type ? opt.color + '10' : 'transparent',
                        },
                      ]}
                      onPress={() => setAdjustmentType(opt.type)}
                    >
                      <Text style={styles.typeIcon}>{opt.icon}</Text>
                      <Text
                        style={[
                          styles.typeLabel,
                          { color: adjustmentType === opt.type ? opt.color : colors.text },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Quantity Card */}
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <Text style={{ fontSize: 20 }}>🔢</Text>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>Quantity</Text>
                </View>

                <Input
                  label={adjustmentType === 'set' ? 'New Stock Quantity' : 'Quantity to ' + (adjustmentType === 'add' ? 'Add' : 'Remove')}
                  placeholder="Enter quantity"
                  value={quantity}
                  onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric"
                />

                {quantity && (
                  <View style={[styles.preview, { backgroundColor: colors.primary + '10' }]}>
                    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                      New Stock Level:
                    </Text>
                    <Text style={[styles.previewValue, { color: colors.primary }]}>
                      {calculateNewStock()} {selectedItem.unit}
                    </Text>
                  </View>
                )}

                <Input
                  label="Reason (Optional)"
                  placeholder="e.g., Damaged goods, Purchase, Sale correction"
                  value={reason}
                  onChangeText={setReason}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Submit Button */}
              <Button
                title="Adjust Stock"
                onPress={handleSubmit}
                loading={submitting}
                fullWidth
                size="lg"
              />
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    ...Shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginLeft: Spacing.sm,
  },
  itemList: {
    marginTop: Spacing.md,
  },
  itemOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: FontSize.sm, fontWeight: '600' },
  itemSku: { fontSize: FontSize.xs, marginTop: 2 },
  itemStock: { alignItems: 'flex-end' },
  stockValue: { fontSize: FontSize.md, fontWeight: '700' },
  stockUnit: { fontSize: FontSize.xs },
  noItems: { textAlign: 'center', paddingVertical: Spacing.xl },
  selectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  selectedInfo: { flex: 1 },
  selectedName: { fontSize: FontSize.md, fontWeight: '600' },
  selectedStock: { fontSize: FontSize.sm, marginTop: 2 },
  changeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  changeBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  typeOptions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeOption: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  typeIcon: { fontSize: 24, marginBottom: Spacing.xs },
  typeLabel: { fontSize: FontSize.xs, fontWeight: '600', textAlign: 'center' },
  preview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  previewLabel: { fontSize: FontSize.sm },
  previewValue: { fontSize: FontSize.lg, fontWeight: '700' },
});
