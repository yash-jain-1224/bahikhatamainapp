import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { SearchBar, Avatar, EmptyState, Button } from '../../components/shared';
import { SkeletonLoader } from '../../components/shared/SkeletonLoader';
import { SwipeableRow } from '../../components/shared/SwipeableRow';
import { FloatingActionButton } from '../../components/shared/FloatingActionButton';
import { EnhancedRefreshControl } from '../../components/shared/EnhancedRefreshControl';
import { AnimatedListItem } from '../../components/shared/AnimatedComponents';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { haptic } from '../../utils/haptics';
import { useToast } from '../../components/shared/Toast';
import { profileApi } from '../../services/api';
import { formatCurrency } from '../../utils';
import { exportData, showExportDialog } from '../../utils/export';
import { importData, showImportResult } from '../../utils/import';
import type { Party } from '../../types';

export default function PartiesScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [partyToDelete, setPartyToDelete] = useState<Party | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchParties = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await profileApi.parties({ search });
      setParties(res.data?.data || []);
    } catch {
      toast.error('Failed to load parties');
    } finally { setLoading(false); setRefreshing(false); }
  }, [search]);

  useEffect(() => { fetchParties(); }, [search]);

  const handleExport = (format: 'csv' | 'json' | 'excel') => {
    exportData({
      data: parties,
      filename: 'parties',
      format,
    });
  };

  const handleImport = async () => {
    try {
      const result = await importData<{ name: string; type?: string; phone?: string; email?: string }>({
        requiredFields: ['name'],
      });
      
      if (result.success && result.data.length > 0) {
        toast.success(`Imported ${result.data.length} parties`);
        showImportResult(result);
        fetchParties(true);
      } else if (result.errors.length > 0) {
        showImportResult(result);
      }
    } catch (err) {
      toast.error('Import failed');
    }
  };

  const handleDeleteParty = async () => {
    if (!partyToDelete) return;
    
    setDeleting(true);
    try {
      // API call would go here
      // await profileApi.deleteParty(partyToDelete.id);
      haptic.success();
      toast.success('Party deleted successfully');
      setParties(prev => prev.filter(p => p.id !== partyToDelete.id));
    } catch {
      haptic.error();
      toast.error('Failed to delete party');
    } finally {
      setDeleting(false);
      setDeleteDialogVisible(false);
      setPartyToDelete(null);
    }
  };

  const handleCallParty = (party: Party) => {
    haptic.light();
    if (party.phone) {
      // Would open phone dialer
      Alert.alert('Call', `Call ${party.name} at ${party.phone}?`);
    } else {
      toast.info('No phone number available');
    }
  };

  const handleMessageParty = (party: Party) => {
    haptic.light();
    if (party.phone) {
      // Would open messaging app
      Alert.alert('Message', `Send message to ${party.name}?`);
    } else {
      toast.info('No phone number available');
    }
  };

  const renderItem = ({ item, index }: { item: Party; index: number }) => {
    const swipeActions = [
      {
        icon: 'phone',
        color: '#FFFFFF',
        backgroundColor: colors.success,
        onPress: () => handleCallParty(item),
      },
      {
        icon: 'message-circle',
        color: '#FFFFFF',
        backgroundColor: colors.primary,
        onPress: () => handleMessageParty(item),
      },
      {
        icon: 'edit-2',
        color: '#FFFFFF',
        backgroundColor: colors.warning,
        onPress: () => {
          haptic.light();
          navigation.navigate('PartyEdit', { partyId: item.id });
        },
      },
      {
        icon: 'trash-2',
        color: '#FFFFFF',
        backgroundColor: colors.error,
        onPress: () => {
          haptic.warning();
          setPartyToDelete(item);
          setDeleteDialogVisible(true);
        },
      },
    ];

    return (
      <AnimatedListItem index={index} delay={50}>
        <SwipeableRow rightActions={swipeActions}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.sm }]}
            onPress={() => {
              haptic.light();
              navigation.navigate('PartyDetail', { partyId: item.id });
            }}
            activeOpacity={0.7}
          >
            <Avatar name={item.name} size={42} />
            <View style={styles.info}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.type, { color: colors.textSecondary }]}>{item.type}</Text>
            </View>
            <View style={styles.balanceCol}>
              <Text style={[styles.balance, { color: item.balance >= 0 ? colors.success : colors.error }]}>
                {formatCurrency(Math.abs(item.balance))}
              </Text>
              <Text style={[styles.balanceLabel, { color: colors.textTertiary }]}>
                {item.balance >= 0 ? 'Receivable' : 'Payable'}
              </Text>
            </View>
          </TouchableOpacity>
        </SwipeableRow>
      </AnimatedListItem>
    );
  };

  const renderSkeleton = () => (
    <View style={styles.list}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.card, marginBottom: Spacing.sm }]}>
          <SkeletonLoader width={42} height={42} borderRadius={21} />
          <View style={[styles.info, { marginLeft: Spacing.md }]}>
            <SkeletonLoader width={120} height={16} style={{ marginBottom: 6 }} />
            <SkeletonLoader width={80} height={12} />
          </View>
          <View style={styles.balanceCol}>
            <SkeletonLoader width={70} height={16} style={{ marginBottom: 4 }} />
            <SkeletonLoader width={50} height={12} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search parties..." />
        </View>
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
            showExportDialog({ data: parties, filename: 'parties', onExport: handleExport });
          }}
        >
          <Icon name="download" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
      
      {loading ? renderSkeleton() : (
        <FlatList
          data={parties}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <EnhancedRefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchParties(true)}
            />
          }
          ListEmptyComponent={
            <EmptyState 
              title="No Parties" 
              description="Add suppliers and customers" 
              icon={<Text style={{ fontSize: 48 }}>👥</Text>} 
              action={
                <Button 
                  title="Add Party" 
                  onPress={() => {
                    haptic.light();
                    navigation.navigate('PartyCreate');
                  }} 
                />
              } 
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
      
      {/* Enhanced FAB */}
      <View style={{ position: 'absolute', bottom: 20 + insets.bottom, right: 0, left: 0 }}>
        <FloatingActionButton
          icon="plus"
          onPress={() => {
            haptic.medium();
            navigation.navigate('PartyCreate');
          }}
          label="Add Party"
        />
      </View>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        visible={deleteDialogVisible}
        title="Delete Party"
        message={`Are you sure you want to delete "${partyToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDeleteParty}
        onCancel={() => {
          setDeleteDialogVisible(false);
          setPartyToDelete(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: Spacing.lg, 
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchContainer: { flex: 1 },
  iconBtn: { 
    width: 36, 
    height: 36, 
    borderRadius: BorderRadius.md, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  list: { padding: Spacing.lg, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm },
  info: { flex: 1, marginLeft: Spacing.md },
  name: { fontSize: FontSize.md, fontWeight: '600' },
  type: { fontSize: FontSize.xs, marginTop: 2 },
  balanceCol: { alignItems: 'flex-end' },
  balance: { fontSize: FontSize.sm, fontWeight: '700' },
  balanceLabel: { fontSize: FontSize.xs, marginTop: 2 },
});
