import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Animated,
  RefreshControl as RNRefreshControl,
  RefreshControlProps,
} from 'react-native';
import { useTheme } from '../../theme';
import { Spacing } from '../../theme/colors';
import Icon from 'react-native-vector-icons/Feather';

interface EnhancedRefreshControlProps extends Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> {
  refreshing: boolean;
  onRefresh: () => void;
  message?: string;
  lastUpdated?: Date;
}

export function EnhancedRefreshControl({
  refreshing,
  onRefresh,
  message = 'Pull to refresh',
  lastUpdated,
  ...props
}: EnhancedRefreshControlProps) {
  const { colors } = useTheme();

  const formatLastUpdated = () => {
    if (!lastUpdated) return null;
    const now = new Date();
    const diff = now.getTime() - lastUpdated.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return lastUpdated.toLocaleDateString();
  };

  return (
    <RNRefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
      colors={[colors.primary]}
      progressBackgroundColor={colors.card}
      title={refreshing ? 'Refreshing...' : formatLastUpdated() || message}
      titleColor={colors.textSecondary}
      {...props}
    />
  );
}

// Pull indicator component for custom refresh implementations
interface PullIndicatorProps {
  pullProgress: Animated.Value;
  refreshing: boolean;
}

export function PullIndicator({ pullProgress, refreshing }: PullIndicatorProps) {
  const { colors } = useTheme();
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (refreshing) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.setValue(0);
    }
  }, [refreshing, spinAnim]);

  const rotation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const scale = pullProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
    extrapolate: 'clamp',
  });

  const translateY = pullProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        styles.pullIndicator,
        {
          backgroundColor: colors.card,
          transform: [{ scale }, { translateY }],
          opacity: pullProgress,
        },
      ]}
    >
      <Animated.View style={refreshing ? { transform: [{ rotate: rotation }] } : undefined}>
        <Icon 
          name={refreshing ? 'loader' : 'arrow-down'} 
          size={20} 
          color={colors.primary} 
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pullIndicator: {
    position: 'absolute',
    top: Spacing.md,
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
});
