import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius } from '../../theme/colors';
import Icon from 'react-native-vector-icons/Feather';

export interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
  label?: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: boolean;
}

const DATE_PRESETS = [
  { label: 'Today', getValue: () => ({ startDate: new Date(), endDate: new Date() }) },
  {
    label: 'Yesterday',
    getValue: () => {
      const date = new Date();
      date.setDate(date.getDate() - 1);
      return { startDate: date, endDate: date };
    },
  },
  {
    label: 'Last 7 Days',
    getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return { startDate: start, endDate: end };
    },
  },
  {
    label: 'Last 30 Days',
    getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return { startDate: start, endDate: end };
    },
  },
  {
    label: 'This Month',
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: start, endDate: end };
    },
  },
  {
    label: 'Last Month',
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: start, endDate: end };
    },
  },
  {
    label: 'This Quarter',
    getValue: () => {
      const now = new Date();
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      return { startDate: start, endDate: end };
    },
  },
  {
    label: 'This Year',
    getValue: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return { startDate: start, endDate: end };
    },
  },
];

export default function DateRangeFilter({
  value,
  onChange,
  presets = true,
}: DateRangeFilterProps) {
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange>(value);

  const formatDateDisplay = (date: Date | null) => {
    if (!date) return 'Select';
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getDisplayText = () => {
    if (value.label) return value.label;
    if (!value.startDate && !value.endDate) return 'All Time';
    if (value.startDate && value.endDate) {
      return `${formatDateDisplay(value.startDate)} - ${formatDateDisplay(value.endDate)}`;
    }
    if (value.startDate) return `From ${formatDateDisplay(value.startDate)}`;
    if (value.endDate) return `Until ${formatDateDisplay(value.endDate)}`;
    return 'All Time';
  };

  const handlePresetSelect = (preset: (typeof DATE_PRESETS)[0]) => {
    const { startDate, endDate } = preset.getValue();
    onChange({ startDate, endDate, label: preset.label });
    setModalVisible(false);
  };

  const handleApply = () => {
    onChange({ ...tempRange, label: undefined });
    setModalVisible(false);
  };

  const handleClear = () => {
    onChange({ startDate: null, endDate: null, label: undefined });
    setTempRange({ startDate: null, endDate: null });
    setModalVisible(false);
  };

  const openModal = () => {
    setTempRange(value);
    setModalVisible(true);
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor: value.startDate || value.endDate ? colors.primary : colors.border,
            borderWidth: value.startDate || value.endDate ? 2 : 1,
          },
        ]}
        onPress={openModal}
        activeOpacity={0.7}
      >
        <Icon name="calendar" size={16} color={colors.primary} />
        <Text
          style={[
            styles.buttonText,
            {
              color: value.startDate || value.endDate ? colors.primary : colors.textSecondary,
            },
          ]}
          numberOfLines={1}
        >
          {getDisplayText()}
        </Text>
        <Icon name="chevron-down" size={16} color={colors.textTertiary} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Date Range</Text>
            <TouchableOpacity onPress={handleApply}>
              <Text style={[styles.applyText, { color: colors.primary }]}>Apply</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {presets && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  Quick Select
                </Text>
                <View style={styles.presetsGrid}>
                  {DATE_PRESETS.map((preset) => (
                    <TouchableOpacity
                      key={preset.label}
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor:
                            value.label === preset.label
                              ? colors.primary
                              : colors.surfaceSecondary,
                          borderColor:
                            value.label === preset.label ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => handlePresetSelect(preset)}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          {
                            color: value.label === preset.label ? '#FFFFFF' : colors.text,
                          },
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                Custom Range
              </Text>

              <View style={styles.dateRow}>
                <Text style={[styles.dateLabel, { color: colors.text }]}>From</Text>
                <TouchableOpacity
                  style={[
                    styles.dateButton,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                  ]}
                  onPress={() => setShowStartPicker(true)}
                >
                  <Icon name="calendar" size={16} color={colors.primary} />
                  <Text style={[styles.dateButtonText, { color: colors.text }]}>
                    {formatDateDisplay(tempRange.startDate)}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.dateRow}>
                <Text style={[styles.dateLabel, { color: colors.text }]}>To</Text>
                <TouchableOpacity
                  style={[
                    styles.dateButton,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                  ]}
                  onPress={() => setShowEndPicker(true)}
                >
                  <Icon name="calendar" size={16} color={colors.primary} />
                  <Text style={[styles.dateButtonText, { color: colors.text }]}>
                    {formatDateDisplay(tempRange.endDate)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.clearButton, { borderColor: colors.border }]}
              onPress={handleClear}
            >
              <Icon name="x" size={16} color={colors.error} />
              <Text style={[styles.clearButtonText, { color: colors.error }]}>Clear Filter</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Date Pickers */}
        {showStartPicker && (
          <DateTimePicker
            value={tempRange.startDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_event: DateTimePickerEvent, date?: Date) => {
              setShowStartPicker(Platform.OS === 'ios');
              if (date) {
                setTempRange((prev) => ({ ...prev, startDate: date, label: undefined }));
              }
            }}
            maximumDate={tempRange.endDate || undefined}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={tempRange.endDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_event: DateTimePickerEvent, date?: Date) => {
              setShowEndPicker(Platform.OS === 'ios');
              if (date) {
                setTempRange((prev) => ({ ...prev, endDate: date, label: undefined }));
              }
            }}
            minimumDate={tempRange.startDate || undefined}
          />
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
    maxWidth: 200,
  },
  buttonText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: FontSize.md,
  },
  applyText: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
    letterSpacing: 0.5,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  presetChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  presetText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  dateLabel: {
    fontSize: FontSize.md,
    fontWeight: '500',
    width: 50,
  },
  dateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  dateButtonText: {
    fontSize: FontSize.md,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: Spacing.sm,
  },
  clearButtonText: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
});
