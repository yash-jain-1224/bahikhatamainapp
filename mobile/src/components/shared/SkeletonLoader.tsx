import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import { BorderRadius, Spacing } from '../../theme/colors';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonLoader({
  width = '100%',
  height = 20,
  borderRadius = BorderRadius.md,
  style,
}: SkeletonLoaderProps) {
  const { colors } = useTheme();
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

// Preset skeleton components for common use cases
export function CardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <SkeletonLoader width={48} height={48} borderRadius={24} />
        <View style={styles.cardHeaderText}>
          <SkeletonLoader width="60%" height={16} />
          <SkeletonLoader width="40%" height={12} style={{ marginTop: 8 }} />
        </View>
      </View>
      <SkeletonLoader width="100%" height={12} style={{ marginTop: 16 }} />
      <SkeletonLoader width="80%" height={12} style={{ marginTop: 8 }} />
    </View>
  );
}

export function ListItemSkeleton() {
  return (
    <View style={styles.listItem}>
      <SkeletonLoader width={40} height={40} borderRadius={20} />
      <View style={styles.listItemContent}>
        <SkeletonLoader width="70%" height={14} />
        <SkeletonLoader width="50%" height={10} style={{ marginTop: 6 }} />
      </View>
      <SkeletonLoader width={60} height={14} />
    </View>
  );
}

export function StatCardSkeleton() {
  return (
    <View style={styles.statCard}>
      <SkeletonLoader width={32} height={32} borderRadius={16} />
      <SkeletonLoader width="50%" height={12} style={{ marginTop: 12 }} />
      <SkeletonLoader width="70%" height={20} style={{ marginTop: 8 }} />
    </View>
  );
}

export function TableRowSkeleton() {
  return (
    <View style={styles.tableRow}>
      <SkeletonLoader width="30%" height={14} />
      <SkeletonLoader width="25%" height={14} />
      <SkeletonLoader width="20%" height={14} />
      <SkeletonLoader width="15%" height={14} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  listItemContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  statCard: {
    padding: Spacing.lg,
    alignItems: 'flex-start',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
});
