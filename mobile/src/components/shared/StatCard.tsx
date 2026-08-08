import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: string;
}

export function StatCard({ title, value, subtitle, icon, color }: StatCardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          ...Shadow.md,
        },
      ]}
    >
      <View style={styles.header}>
        {icon && (
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: color ? `${color}20` : colors.primaryLight + '20' },
            ]}
          >
            {icon}
          </View>
        )}
        <Text style={[styles.title, { color: colors.textSecondary }]}>
          {title}
        </Text>
      </View>
      <Text
        style={[
          styles.value,
          { color: color || colors.text },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    minWidth: 150,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    flex: 1,
  },
  value: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginTop: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
});
