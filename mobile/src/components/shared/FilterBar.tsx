import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius } from '../../theme/colors';

export interface FilterChip {
  key: string;
  label: string;
  icon?: string;
  active?: boolean;
}

interface FilterBarProps {
  filters: FilterChip[];
  onFilterPress: (key: string) => void;
  activeFilter?: string;
  showClear?: boolean;
  onClear?: () => void;
}

export default function FilterBar({
  filters,
  onFilterPress,
  activeFilter,
  showClear = false,
  onClear,
}: FilterBarProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {filters.map((filter) => {
          const isActive = filter.active || activeFilter === filter.key;
          return (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? colors.primary : colors.surfaceSecondary,
                  borderColor: isActive ? colors.primary : colors.border,
                },
              ]}
              onPress={() => onFilterPress(filter.key)}
              activeOpacity={0.7}
            >
              {filter.icon && (
                <Icon
                  name={filter.icon}
                  size={14}
                  color={isActive ? '#FFFFFF' : colors.textSecondary}
                  style={styles.chipIcon}
                />
              )}
              <Text
                style={[
                  styles.chipText,
                  { color: isActive ? '#FFFFFF' : colors.text },
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {showClear && activeFilter && (
          <TouchableOpacity
            style={[styles.clearBtn, { borderColor: colors.border }]}
            onPress={onClear}
          >
            <Icon name="x" size={14} color={colors.textTertiary} />
            <Text style={[styles.clearText, { color: colors.textTertiary }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipIcon: {
    marginRight: Spacing.xs,
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: Spacing.xs,
  },
  clearText: {
    fontSize: FontSize.sm,
  },
});
