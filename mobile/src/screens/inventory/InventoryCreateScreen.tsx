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
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Input, Button, LoadingScreen } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { inventoryApi } from '../../services/api';
import type { Category, InventoryItem } from '../../types';

const UNITS = ['Kg', 'Quintal', 'Ton', 'Litre', 'Piece', 'Box', 'Bag', 'Packet', 'Dozen', 'Meter'];

export default function InventoryCreateScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const editId = route.params?.id;
  const isEdit = !!editId;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    unit: 'Kg',
    category_id: '',
    min_stock: '0',
    current_stock: '0',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCategories();
    if (isEdit) {
      fetchItem();
    }
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await inventoryApi.categories();
      setCategories(res.data?.data || []);
    } catch {
      // Use default categories if fetch fails
      setCategories([
        { id: '1', name: 'Grains' },
        { id: '2', name: 'Oils' },
        { id: '3', name: 'Pulses' },
        { id: '4', name: 'Sugar' },
        { id: '5', name: 'Spices' },
      ] as Category[]);
    }
  };

  const fetchItem = async () => {
    try {
      setFetching(true);
      const res = await inventoryApi.getItem(editId);
      const item: InventoryItem = res.data?.data;
      if (item) {
        setForm({
          name: item.name,
          sku: item.sku || '',
          unit: item.unit,
          category_id: item.category?.id || '',
          min_stock: String(item.min_stock),
          current_stock: String(item.current_stock),
        });
      }
    } catch {
      toast.error('Failed to load item');
      navigation.goBack();
    } finally {
      setFetching(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = 'Item name is required';
    if (!form.unit) newErrors.unit = 'Unit is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        unit: form.unit,
        category_id: form.category_id || undefined,
        min_stock: parseInt(form.min_stock, 10) || 0,
        current_stock: parseInt(form.current_stock, 10) || 0,
      };

      if (isEdit) {
        await inventoryApi.updateItem(editId, payload);
        toast.success('Item updated successfully');
      } else {
        await inventoryApi.createItem(payload);
        toast.success('Item created successfully');
      }
      navigation.goBack();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find((c) => c.id === form.category_id);

  if (fetching) return <LoadingScreen />;

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
          {/* Item Details Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>📦</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Item Details</Text>
            </View>

            <Input
              label="Item Name *"
              placeholder="e.g., Wheat Grade A"
              value={form.name}
              onChangeText={(text) => {
                setForm({ ...form, name: text });
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
              error={errors.name}
              autoFocus={!isEdit}
            />

            <Input
              label="SKU"
              placeholder="e.g., WHT-A-001"
              value={form.sku}
              onChangeText={(text) => setForm({ ...form, sku: text })}
            />

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Unit *</Text>
              <TouchableOpacity
                style={[
                  styles.selectBtn,
                  {
                    backgroundColor: colors.surface,
                    borderColor: errors.unit ? colors.error : colors.border,
                  },
                ]}
                onPress={() => setShowUnitPicker(!showUnitPicker)}
              >
                <Text style={[styles.selectText, { color: colors.text }]}>{form.unit}</Text>
                <Text style={{ color: colors.textTertiary }}>▼</Text>
              </TouchableOpacity>
              {errors.unit && (
                <Text style={[styles.errorText, { color: colors.error }]}>{errors.unit}</Text>
              )}
            </View>

            {showUnitPicker && (
              <View style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {UNITS.map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.pickerItem,
                      form.unit === unit && { backgroundColor: colors.primary + '20' },
                    ]}
                    onPress={() => {
                      setForm({ ...form, unit });
                      setShowUnitPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerText,
                        { color: form.unit === unit ? colors.primary : colors.text },
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
              <TouchableOpacity
                style={[
                  styles.selectBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
              >
                <Text style={[styles.selectText, { color: selectedCategory ? colors.text : colors.textTertiary }]}>
                  {selectedCategory?.name || 'Select category'}
                </Text>
                <Text style={{ color: colors.textTertiary }}>▼</Text>
              </TouchableOpacity>
            </View>

            {showCategoryPicker && (
              <View style={[styles.picker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setForm({ ...form, category_id: '' });
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={[styles.pickerText, { color: colors.textSecondary }]}>
                    None
                  </Text>
                </TouchableOpacity>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.pickerItem,
                      form.category_id === cat.id && { backgroundColor: colors.primary + '20' },
                    ]}
                    onPress={() => {
                      setForm({ ...form, category_id: cat.id });
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerText,
                        { color: form.category_id === cat.id ? colors.primary : colors.text },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Stock Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <Text style={{ fontSize: 20 }}>📊</Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Stock Information</Text>
            </View>

            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Input
                  label="Current Stock"
                  placeholder="0"
                  value={form.current_stock}
                  onChangeText={(text) => setForm({ ...form, current_stock: text.replace(/[^0-9]/g, '') })}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.halfInput}>
                <Input
                  label="Minimum Stock"
                  placeholder="0"
                  value={form.min_stock}
                  onChangeText={(text) => setForm({ ...form, min_stock: text.replace(/[^0-9]/g, '') })}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              You'll get alerts when stock falls below minimum level
            </Text>
          </View>

          {/* Submit Button */}
          <Button
            title={isEdit ? 'Update Item' : 'Add Item'}
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
          />
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
  inputGroup: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  selectBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  selectText: {
    fontSize: FontSize.md,
  },
  errorText: {
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  picker: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    maxHeight: 200,
  },
  pickerItem: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  pickerText: {
    fontSize: FontSize.sm,
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.xs,
  },
  halfInput: {
    flex: 1,
    paddingHorizontal: Spacing.xs,
  },
  hint: {
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
  },
});
