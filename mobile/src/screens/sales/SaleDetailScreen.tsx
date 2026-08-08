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
import { salesApi } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils';
import type { Sale } from '../../types';
import Icon from 'react-native-vector-icons/Feather';

export default function SaleDetailScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id = route.params?.id;

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);

  const fetchSale = useCallback(async (isRefresh = false) => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const res = await salesApi.get(id);
      setSale(res.data?.data || null);
    } catch {
      toast.error('Failed to load sale details');
      navigation.goBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSale();
  }, [fetchSale]);

  const handleDelete = () => {
    Alert.alert(
      'Delete Sale',
      `Are you sure you want to delete sale #${sale?.sale_number}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              await salesApi.delete(id);
              toast.success('Sale deleted successfully');
              navigation.goBack();
            } catch {
              toast.error('Failed to delete sale');
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
      type: 'IN',
      partyId: sale?.party?.id,
      partyName: sale?.party?.name,
      referenceType: 'SALE',
      referenceId: sale?.id,
      defaultAmount: Number(sale?.balance_amount) > 0 ? Number(sale?.balance_amount) : undefined,
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
      await salesApi.uploadAttachment(id, formData);
      toast.success('Bill uploaded successfully');
      fetchSale();
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
              await salesApi.deleteAttachment(id, attachmentId);
              toast.success('Attachment deleted');
              fetchSale();
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
        <Text style={{ color: colors.error, fontSize: FontSize.md }}>Sale ID not provided</Text>
      </View>
    );
  }

  if (loading && !sale) {
    return <LoadingScreen />;
  }

  if (!sale) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Sale not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchSale(true)} tintColor={colors.primary} />
        }
      >
        {/* Header Card */}
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.saleNumber, { color: colors.primary }]}>
                #{sale.sale_number}
              </Text>
              <Text style={[styles.date, { color: colors.textSecondary }]}>
                {formatDate(sale.sale_date)}
              </Text>
            </View>
            <StatusBadge status={sale.payment_status} />
          </View>

          {/* Party Info */}
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <View style={styles.partyRow}>
            <View style={[styles.partyAvatar, { backgroundColor: colors.primary + '15' }]}>
              <Text style={[styles.partyInitial, { color: colors.primary }]}>
                {sale.party?.name?.[0]?.toUpperCase() || 'P'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.partyName, { color: colors.text }]}>
                {sale.party?.name || 'Unknown Party'}
              </Text>
              {sale.party?.phone && (
                <Text style={[styles.partyPhone, { color: colors.textSecondary }]}>
                  {sale.party.phone}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Amount Summary */}
        <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Amount Summary</Text>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Subtotal</Text>
            <Text style={[styles.amountValue, { color: colors.text }]}>
              {formatCurrency(sale.subtotal || sale.total_amount)}
            </Text>
          </View>
          {sale.discount != null && sale.discount > 0 && (
            <View style={styles.amountRow}>
              <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Discount</Text>
              <Text style={[styles.amountValue, { color: colors.success }]}>
                -{formatCurrency(sale.discount)}
              </Text>
            </View>
          )}
          {sale.gst_amount != null && sale.gst_amount > 0 && (
            <View style={styles.amountRow}>
              <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>
                GST ({sale.gst_mode} {sale.gst_value}%)
              </Text>
              <Text style={[styles.amountValue, { color: colors.text }]}>
                {formatCurrency(sale.gst_amount)}
              </Text>
            </View>
          )}
          <View style={[styles.totalDivider, { backgroundColor: colors.border }]} />
          <View style={styles.amountRow}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>Total</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>
              {formatCurrency(sale.total_amount)}
            </Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Paid</Text>
            <Text style={[styles.amountValue, { color: colors.success }]}>
              {formatCurrency(sale.paid_amount)}
            </Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>Balance</Text>
            <Text
              style={[
                styles.amountValue,
                { color: sale.balance_amount > 0 ? colors.error : colors.success },
              ]}
            >
              {formatCurrency(sale.balance_amount)}
            </Text>
          </View>
        </View>

        {/* Sale Items */}
        {sale.items && sale.items.length > 0 && (
          <View style={[styles.itemsCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Items ({sale.items.length})
            </Text>
            {sale.items.map((item: any, index: number) => (
              <View
                key={item.id || index}
                style={[
                  styles.itemRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.borderLight },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: colors.text }]}>
                    {item.item?.name || item.item_name || `Item ${index + 1}`}
                  </Text>
                  <Text style={[styles.itemDetail, { color: colors.textSecondary }]}>
                    {item.quantity} × {formatCurrency(item.rate)} • {item.unit || 'unit'}
                  </Text>
                </View>
                <Text style={[styles.itemAmount, { color: colors.text }]}>
                  {formatCurrency(item.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Sale Lots */}
        {sale.sale_lots && sale.sale_lots.length > 0 && (
          <View style={[styles.itemsCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Lots ({sale.sale_lots.length})
            </Text>
            {sale.sale_lots.map((lot: any, index: number) => (
              <View
                key={lot.id || index}
                style={[
                  styles.itemRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.borderLight },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, { color: colors.text }]}>
                    {lot.lot?.lot_number || `Lot ${index + 1}`}
                  </Text>
                  <Text style={[styles.itemDetail, { color: colors.textSecondary }]}>
                    {lot.quantity} × {formatCurrency(lot.rate)}
                  </Text>
                </View>
                <Text style={[styles.itemAmount, { color: colors.text }]}>
                  {formatCurrency(lot.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Notes */}
        {sale.notes && (
          <View style={[styles.notesCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.sm }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Notes</Text>
            <Text style={[styles.notesText, { color: colors.textSecondary }]}>
              {sale.notes}
            </Text>
          </View>
        )}

        {/* Payments Section */}
        {sale.payments && sale.payments.length > 0 && (
          <View style={[styles.itemsCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Payment Records ({sale.payments.length})
            </Text>
            {sale.payments.map((pmt: any, index: number) => (
              <View
                key={pmt.id || index}
                style={[
                  styles.paymentRow,
                  index > 0 && { borderTopWidth: 1, borderTopColor: colors.borderLight },
                ]}
              >
                <View style={[styles.paymentIcon, { backgroundColor: colors.success + '15' }]}>
                  <Icon name="credit-card" size={16} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.paymentHeader}>
                    <Text style={[styles.paymentAmount, { color: colors.success }]}>
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
        <View style={[styles.itemsCard, { backgroundColor: colors.card, borderColor: colors.border, ...Shadow.md }]}>
          <View style={styles.attachmentHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
              Bills & Attachments
            </Text>
            {uploadingAttachment && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>
          
          {sale.attachments && sale.attachments.length > 0 ? (
            <View style={styles.attachmentsList}>
              {(sale.attachments as any[]).map((att) => (
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
          {Number(sale.balance_amount) > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.paymentBtn, { backgroundColor: colors.success }]}
              onPress={handleRecordPayment}
            >
              <Icon name="credit-card" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Record Payment</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.editBtn, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('SaleEdit', { id })}
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  errorText: { textAlign: 'center', marginTop: 100, fontSize: FontSize.md },
  headerCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.xl, marginBottom: Spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  saleNumber: { fontSize: FontSize.xl, fontWeight: '700' },
  date: { fontSize: FontSize.sm, marginTop: 4 },
  divider: { height: 1, marginVertical: Spacing.lg },
  partyRow: { flexDirection: 'row', alignItems: 'center' },
  partyAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  partyInitial: { fontSize: FontSize.lg, fontWeight: '700' },
  partyName: { fontSize: FontSize.md, fontWeight: '600' },
  partyPhone: { fontSize: FontSize.sm, marginTop: 2 },
  amountCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.xl, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', marginBottom: Spacing.lg },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  amountLabel: { fontSize: FontSize.md },
  amountValue: { fontSize: FontSize.md, fontWeight: '600' },
  totalDivider: { height: 1, marginVertical: Spacing.md },
  totalLabel: { fontSize: FontSize.lg, fontWeight: '700' },
  totalValue: { fontSize: FontSize.lg, fontWeight: '700' },
  itemsCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.xl, marginBottom: Spacing.lg },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md },
  itemName: { fontSize: FontSize.md, fontWeight: '600' },
  itemDetail: { fontSize: FontSize.sm, marginTop: 2 },
  itemAmount: { fontSize: FontSize.md, fontWeight: '600' },
  notesCard: { borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.xl, marginBottom: Spacing.lg },
  notesText: { fontSize: FontSize.md, lineHeight: 22 },
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
  actionBtnText: { color: '#fff', fontWeight: '600', fontSize: FontSize.md },
});
