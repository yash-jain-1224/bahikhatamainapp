import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { SearchBar, EmptyState, Button } from '../../components/shared';
import { SkeletonLoader } from '../../components/shared/SkeletonLoader';
import { SwipeableRow } from '../../components/shared/SwipeableRow';
import { EnhancedRefreshControl } from '../../components/shared/EnhancedRefreshControl';
import { AnimatedListItem } from '../../components/shared/AnimatedComponents';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { haptic } from '../../utils/haptics';
import { useToast } from '../../components/shared/Toast';
import { inventoryApi } from '../../services/api';
import { exportData, showExportDialog } from '../../utils/export';
import { importData, showImportResult } from '../../utils/import';
import type { InventoryItem } from '../../types';

export default function InventoryListScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchItems = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await inventoryApi.listItems({ search });
      setItems(res.data?.data || []);
    } catch {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  useEffect(() => { fetchItems(); }, [search]);

  const handleExport = (format: 'csv' | 'json' | 'excel') => {
    exportData({
      data: items,
      filename: 'inventory',
      format,
    });
  };

  const handleImport = async () => {
    try {
      const result = await importData<{ name: string; sku?: string; unit?: string; current_stock?: string }>({
        requiredFields: ['name'],
      });
      
      if (result.success && result.data.length > 0) {
        toast.success(`Imported ${result.data.length} items`);
        showImportResult(result);
        fetchItems(true);
      } else if (result.errors.length > 0) {
        showImportResult(result);
      }
    } catch {
      toast.error('Import failed');
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    
    setDeleting(true);
    try {
      // API call would go here
      // await inventoryApi.deleteItem(itemToDelete.id);
      haptic.success();
      toast.success('Item deleted successfully');
      setItems(prev => prev.filter(i => i.id !== itemToDelete.id));
    } catch {
      haptic.error();
      toast.error('Failed to delete item');
    } finally {
      setDeleting(false);
      setDeleteDialogVisible(false);
      setItemToDelete(null);
    }
  };

  const renderItem = ({ item, index }: { item: InventoryItem; index: number }) => {
    const isLow = item.current_stock <= item.min_stock;
    
    const swipeActions = [
      {
        icon: 'edit-2',
        color: '#FFFFFF',
        backgroundColor: colors.primary,
        onPress: () => {
          haptic.light();
          navigation.navigate('InventoryEdit', { id: item.id });
        },
      },
      {
        icon: 'sliders',
        color: '#FFFFFF',
        backgroundColor: colors.warning,
        onPress: () => {
          haptic.light();
          navigation.navigate('StockAdjust', { itemId: item.id });
        },
      },
      {
        icon: 'trash-2',
        color: '#FFFFFF',
        backgroundColor: colors.error,
        onPress: () => {
          haptic.warning();
          setItemToDelete(item);
          setDeleteDialogVisible(true);
        },
      },
    ];

    return (
      <AnimatedListItem index={index} delay={50}>
        <SwipeableRow rightActions={swipeActions}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.card, borderColor: isLow ? colors.warning + '50' : colors.border, ...Shadow.sm }]}
            onPress={() => {
              haptic.light();
              navigation.navigate('InventoryDetail', { id: item.id });
            }}
            activeOpacity={0.7}
          >
            <View style={styles.cardContent}>
              <View style={[styles.stockBadge, { backgroundColor: isLow ? colors.warningLight : colors.successLight }]}>
                <Text style={[styles.stockText, { color: isLow ? colors.warning : colors.success }]}>
                  {item.current_stock}
                </Text>
                <Text style={[styles.unitText, { color: isLow ? colors.warning : colors.success }]}>
                  {item.unit}
                </Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                {item.sku && <Text style={[styles.sku, { color: colors.textTertiary }]}>SKU: {item.sku}</Text>}
                {item.category && <Text style={[styles.category, { color: colors.textSecondary }]}>{item.category.name}</Text>}
              </View>
              {isLow && (
                <View style={[styles.lowBadge, { backgroundColor: colors.warningLight }]}>
                  <Text style={{ color: colors.warning, fontSize: FontSize.xs, fontWeight: '600' }}>Low</Text>
                </View>
              )}
              <Icon name="chevron-right" size={18} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>
        </SwipeableRow>
      </AnimatedListItem>
    );
  };

  const renderSkeleton = () => (
    <View style={styles.list}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.card, marginBottom: Spacing.sm }]}>
          <View style={styles.cardContent}>
            <SkeletonLoader width={56} height={56} borderRadius={BorderRadius.md} />
            <View style={[styles.cardInfo, { marginLeft: Spacing.md }]}>
              <SkeletonLoader width={150} height={16} style={{ marginBottom: 6 }} />
              <SkeletonLoader width={80} height={12} style={{ marginBottom: 4 }} />
              <SkeletonLoader width={60} height={12} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Text style={[styles.title, { color: colors.text }]}>Inventory</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => {
              haptic.light();
              handleImport();
            }}
          >
            <Icon name="upload" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => {
              haptic.light();
              showExportDialog({ data: items, filename: 'inventory', onExport: handleExport });
            }}
          >
            <Icon name="download" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.adjustBtn, { borderColor: colors.primary }]}
            onPress={() => {
              haptic.light();
              navigation.navigate('StockAdjust');
            }}
          >
            <Text style={[styles.adjustBtnText, { color: colors.primary }]}>📊 Adjust</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              haptic.medium();
              navigation.navigate('InventoryCreate');
            }}
          >
            <Text style={styles.addBtnText}>+ Add Item</Text>
          </TouchableOpacity>
        </View>
      </View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search items..." />
      
      {loading ? renderSkeleton() : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <EnhancedRefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchItems(true)}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No Items"
              description="Add items to track your inventory"
              icon={<Text style={{ fontSize: 48 }}>📦</Text>}
              action={
                <Button 
                  title="Add Item" 
                  onPress={() => {
                    haptic.light();
                    navigation.navigate('InventoryCreate');
                  }} 
                />
              }
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        visible={deleteDialogVisible}
        title="Delete Item"
        message={`Are you sure you want to delete "${itemToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDeleteItem}
        onCancel={() => {
          setDeleteDialogVisible(false);
          setItemToDelete(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  iconBtn: { width: 36, height: 36, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center' },
  adjustBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1.5 },
  adjustBtnText: { fontWeight: '600', fontSize: FontSize.sm },
  addBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  addBtnText: { color: '#FFF', fontWeight: '600', fontSize: FontSize.sm },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  card: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.lg, marginBottom: Spacing.sm },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  stockBadge: { width: 56, height: 56, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  stockText: { fontSize: FontSize.lg, fontWeight: '700' },
  unitText: { fontSize: FontSize.xs },
  cardInfo: { flex: 1 },
  itemName: { fontSize: FontSize.md, fontWeight: '600' },
  sku: { fontSize: FontSize.xs, marginTop: 2 },
  category: { fontSize: FontSize.xs, marginTop: 2 },
  lowBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full, marginRight: Spacing.sm },
});
