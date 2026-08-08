import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { StatusBadge } from './StatusBadge';
import { formatCurrency, formatDate } from '../../utils';

interface ListItemData {
  id: string;
  title: string;
  subtitle?: string;
  amount?: number;
  date?: string;
  status?: string;
  rightLabel?: string;
}

interface ListCardProps {
  data: ListItemData[];
  onPress: (item: ListItemData) => void;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  emptyComponent?: React.ReactNode;
  headerComponent?: React.ReactNode;
}

export function ListCard({
  data,
  onPress,
  loading,
  refreshing = false,
  onRefresh,
  onEndReached,
  emptyComponent,
  headerComponent,
}: ListCardProps) {
  const { colors } = useTheme();

  const renderItem = ({ item }: { item: ListItemData }) => (
    <TouchableOpacity
      style={[
        styles.item,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...Shadow.sm,
        },
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.itemLeft}>
        <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.subtitle && (
          <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.subtitle}
          </Text>
        )}
        {item.date && (
          <Text style={[styles.itemDate, { color: colors.textTertiary }]}>
            {formatDate(item.date)}
          </Text>
        )}
      </View>
      <View style={styles.itemRight}>
        {item.amount !== undefined && (
          <Text style={[styles.itemAmount, { color: colors.text }]}>
            {formatCurrency(item.amount)}
          </Text>
        )}
        {item.status && <StatusBadge status={item.status} size="sm" />}
        {item.rightLabel && (
          <Text style={[styles.itemRightLabel, { color: colors.textSecondary }]}>
            {item.rightLabel}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.3}
      ListHeaderComponent={headerComponent ? <>{headerComponent}</> : null}
      ListEmptyComponent={emptyComponent ? <>{emptyComponent}</> : null}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  itemLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  itemTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: FontSize.sm,
    marginBottom: 2,
  },
  itemDate: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemAmount: {
    fontSize: FontSize.md,
    fontWeight: '700',
    marginBottom: 4,
  },
  itemRightLabel: {
    fontSize: FontSize.xs,
  },
});
