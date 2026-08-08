import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { StatusBadge, LoadingScreen, Button } from '../../components/shared';
import AttachmentUpload, { Attachment } from '../../components/shared/AttachmentUpload';
import { useToast } from '../../components/shared/Toast';
import { purchaseApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';
import type { Purchase } from '../../types';
import Icon from 'react-native-vector-icons/Feather';

export default function PurchaseDetailScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id = route.params?.id;

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  const fetchPurchase = useCallback(async (isRefresh = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await purchaseApi.get(id);
      if (res.data?.data) {
        setPurchase(res.data.data);
      }
    } catch (err: any) {
      toast.error('Failed to load purchase details');
      navigation.goBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPurchase();
  }, [fetchPurchase]);

  const handleDelete = () => {
    Alert.alert(
      'Delete Purchase',
      `Are you sure you want to delete purchase #${purchase?.purchase_number}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await purchaseApi.delete(id);
              toast.success('Purchase deleted successfully');
              navigation.goBack();
            } catch {
              toast.error('Failed to delete purchase');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleRecordPayment = () => {
    navigation.navigate('RecordPayment', {
      type: 'OUT',
      partyId: purchase?.party?.id,
      partyName: purchase?.party?.name,
      referenceType: 'PURCHASE',
      referenceId: purchase?.id,
      defaultAmount: Number(purchase?.balance_amount) > 0 ? Number(purchase?.balance_amount) : undefined,
    });
  };

  const handleUploadAttachment = async (attachments: Attachment[]) => {
    if (attachments.length === 0 || !id) return;
    const newAttachment = attachments[attachments.length - 1];
    try {
      setUploadingAttachment(true);
      const formData = new FormData();
      formData.append('file', {
        uri: newAttachment.uri,
        type: newAttachment.type,
        name: newAttachment.name,
      } as any);
      await purchaseApi.uploadAttachment(id, formData);
      toast.success('Bill uploaded successfully');
      fetchPurchase();
    } catch {
      toast.error('Failed to upload bill');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    Alert.alert(
      'Delete Attachment',
      'Are you sure you want to delete this attachment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingAttachmentId(attachmentId);
              await purchaseApi.deleteAttachment(id, attachmentId);
              toast.success('Attachment deleted');
              fetchPurchase();
            } catch {
              toast.error('Failed to delete attachment');
            } finally {
              setDeletingAttachmentId(null);
            }
          },
        },
      ]
    );
  };

  const handleViewAttachment = (url: string) => {
    Linking.openURL(url).catch(() => {
      toast.error('Unable to open attachment');
    });
  };

  if (!id) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.error, fontSize: FontSize.md }}>Purchase ID not provided</Text>
      </View>
    );
  }

  if (loading || !purchase) return <LoadingScreen message="Loading purchase..." />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={[styles.purchaseNumber, { color: colors.primary }]}>
                #{purchase.purchase_number}
              </Text>
              <Text style={[styles.partyName, { color: colors.text }]}>
                {purchase.party?.name}
              </Text>
              <Text style={[styles.date, { color: colors.textTertiary }]}>
                {formatDate(purchase.purchase_date)}
              </Text>
            </View>
            <StatusBadge status={purchase.payment_status} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.amountGrid}>
            <AmountRow label="Total" value={formatCurrency(purchase.total_amount)} colors={colors} bold />
            <AmountRow label="Paid" value={formatCurrency(purchase.paid_amount)} colors={colors} color="#10B981" />
            <AmountRow label="Balance" value={formatCurrency(purchase.balance_amount)} colors={colors} color="#EF4444" />
          </View>
        </View>

        {/* Items */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Items</Text>
          {purchase.items?.map((item, idx) => (
            <View
              key={item.id || idx}
              style={[styles.itemRow, idx > 0 && { borderTopColor: colors.borderLight, borderTopWidth: 1 }]}
            >
              <View style={styles.itemLeft}>
                <Text style={[styles.itemName, { color: colors.text }]}>
                  {item.item?.name || 'Item'}
                </Text>
                <Text style={[styles.itemMeta, { color: colors.textTertiary }]}>
                  {item.quantity} {item.unit} × {formatCurrency(item.rate)}
                </Text>
              </View>
              <Text style={[styles.itemAmount, { color: colors.text }]}>
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}
        </View>

        {/* Additional Info */}
        {purchase.notes && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
            <Text style={[styles.notesText, { color: colors.textSecondary }]}>
              {purchase.notes}
            </Text>
          </View>
        )}

        {/* Payments Section */}
        {purchase.payments && purchase.payments.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Payment Records ({purchase.payments.length})
            </Text>
            {purchase.payments.map((pmt: any, index: number) => (
              <View
                key={pmt.id || index}
                style={[
                  styles.paymentRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.borderLight },
                ]}
              >
                <View style={[styles.paymentIcon, { backgroundColor: colors.error + '15' }]}>
                  <Icon name="credit-card" size={16} color={colors.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.paymentHeader}>
                    <Text style={[styles.paymentAmount, { color: colors.error }]}>
                      {formatCurrency(pmt.amount)}
                    </Text>
                    <View style={[styles.paymentModeBadge, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.paymentModeText, { color: colors.textSecondary }]}>
                        {pmt.payment_mode}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.paymentDate, { color: colors.textTertiary }]}>
                    {formatDate(pmt.payment_date)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Attachments Section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.attachmentHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
              Bills & Attachments
            </Text>
            {uploadingAttachment && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>
          
          {purchase.attachments && purchase.attachments.length > 0 ? (
            <View style={styles.attachmentsList}>
              {(purchase.attachments as any[]).map((att) => (
                <View
                  key={att.id}
                  style={[styles.attachmentItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.attachmentIcon, { backgroundColor: colors.primary + '15' }]}>
                    <Icon
                      name={att.file_type?.startsWith('image/') ? 'image' : 'file-text'}
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.attachmentName, { color: colors.text }]} numberOfLines={1}>
                      {att.file_name}
                    </Text>
                    <Text style={[styles.attachmentMeta, { color: colors.textTertiary }]}>
                      {att.file_size ? `${Math.round(att.file_size / 1024)} KB` : ''} • {formatDate(att.created_at)}
                    </Text>
                  </View>
                  <View style={styles.attachmentActions}>
                    <TouchableOpacity
                      style={styles.attachmentActionBtn}
                      onPress={() => handleViewAttachment(att.file_url)}
                    >
                      <Icon name="external-link" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.attachmentActionBtn}
                      onPress={() => handleDeleteAttachment(att.id)}
                      disabled={deletingAttachmentId === att.id}
                    >
                      {deletingAttachmentId === att.id ? (
                        <ActivityIndicator size="small" color={colors.error} />
                      ) : (
                        <Icon name="x" size={16} color={colors.error} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyAttachments}>
              <Icon name="paperclip" size={24} color={colors.textTertiary} />
              <Text style={[styles.emptyAttachmentsText, { color: colors.textSecondary }]}>
                No bills attached yet
              </Text>
            </View>
          )}
          
          <AttachmentUpload
            attachments={[]}
            onAttachmentsChange={handleUploadAttachment}
            maxAttachments={5}
            allowedTypes={['image', 'pdf']}
          />
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {/* Record Payment Button - Show when balance > 0 */}
          {Number(purchase.balance_amount) > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.paymentBtn, { backgroundColor: colors.error }]}
              onPress={handleRecordPayment}
            >
              <Icon name="credit-card" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Record Payment</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.editBtn, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('PurchaseEdit', { id })}
            >
              <Icon name="edit-2" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Edit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn, { backgroundColor: colors.error }]}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="trash-2" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Delete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function AmountRow({ label, value, colors, bold, color }: {
  label: string; value: string; colors: any; bold?: boolean; color?: string;
}) {
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[
        styles.amountValue,
        { color: color || colors.text },
        bold && { fontWeight: '700', fontSize: FontSize.lg },
      ]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  summaryCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  purchaseNumber: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 4 },
  partyName: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: 2 },
  date: { fontSize: FontSize.xs },
  divider: { height: 1, marginVertical: Spacing.lg },
  amountGrid: {},
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  amountLabel: { fontSize: FontSize.sm },
  amountValue: { fontSize: FontSize.md, fontWeight: '600' },
  section: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '700', marginBottom: Spacing.md },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  itemLeft: { flex: 1, marginRight: Spacing.md },
  itemName: { fontSize: FontSize.sm, fontWeight: '600' },
  itemMeta: { fontSize: FontSize.xs, marginTop: 2 },
  itemAmount: { fontSize: FontSize.sm, fontWeight: '600' },
  notesText: { fontSize: FontSize.sm, lineHeight: 20 },
  // Payment row styles
  paymentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md },
  paymentIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  paymentAmount: { fontSize: FontSize.md, fontWeight: '700' },
  paymentModeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  paymentModeText: { fontSize: 10, fontWeight: '600' },
  paymentDate: { fontSize: FontSize.xs, marginTop: 2 },
  // Attachment styles
  attachmentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  attachmentsList: { marginBottom: Spacing.md },
  attachmentItem: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 1, marginBottom: Spacing.sm },
  attachmentIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  attachmentName: { fontSize: FontSize.sm, fontWeight: '500' },
  attachmentMeta: { fontSize: FontSize.xs, marginTop: 2 },
  attachmentActions: { flexDirection: 'row', gap: Spacing.xs },
  attachmentActionBtn: { padding: Spacing.sm },
  emptyAttachments: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyAttachmentsText: { fontSize: FontSize.sm, marginTop: Spacing.sm },
  // Actions styles
  actionsContainer: { marginTop: Spacing.md },
  actionsRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  actions: { marginTop: Spacing.md },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  paymentBtn: { marginBottom: Spacing.sm },
  editBtn: { flex: 1 },
  deleteBtn: { flex: 1 },
  actionBtnText: { color: '#FFF', fontWeight: '600', fontSize: FontSize.md },
});
