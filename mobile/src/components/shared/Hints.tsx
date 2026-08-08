import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius } from '../../theme/colors';
import Icon from 'react-native-vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haptic } from '../../utils/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Tooltip component that appears near a target element
interface TooltipProps {
  visible: boolean;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  onDismiss: () => void;
  targetPosition?: { x: number; y: number; width: number; height: number };
}

export function Tooltip({
  visible,
  text,
  position = 'bottom',
  onDismiss,
  targetPosition,
}: TooltipProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, opacity]);

  if (!visible) return null;

  const getPositionStyle = () => {
    if (!targetPosition) return {};
    
    switch (position) {
      case 'top':
        return {
          bottom: SCREEN_WIDTH - targetPosition.y + 8,
          left: targetPosition.x + targetPosition.width / 2 - 100,
        };
      case 'bottom':
        return {
          top: targetPosition.y + targetPosition.height + 8,
          left: targetPosition.x + targetPosition.width / 2 - 100,
        };
      default:
        return {};
    }
  };

  return (
    <Animated.View
      style={[
        styles.tooltip,
        {
          backgroundColor: colors.text,
          opacity,
        },
        getPositionStyle(),
      ]}
    >
      <Text style={[styles.tooltipText, { color: colors.background }]}>{text}</Text>
      <TouchableOpacity style={styles.tooltipClose} onPress={onDismiss}>
        <Icon name="x" size={14} color={colors.background} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// Feature highlight/spotlight component
interface SpotlightProps {
  visible: boolean;
  targetPosition: { x: number; y: number; width: number; height: number };
  title: string;
  description: string;
  step?: number;
  totalSteps?: number;
  onNext?: () => void;
  onSkip?: () => void;
}

export function Spotlight({
  visible,
  targetPosition,
  title,
  description,
  step = 1,
  totalSteps = 1,
  onNext,
  onSkip,
}: SpotlightProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[styles.spotlightOverlay, { opacity }]}>
        {/* Cutout effect would be here */}
        <View
          style={[
            styles.spotlightCard,
            {
              backgroundColor: colors.card,
              top: targetPosition.y + targetPosition.height + 16,
              left: Math.max(16, Math.min(SCREEN_WIDTH - 300, targetPosition.x)),
            },
          ]}
        >
          <Text style={[styles.spotlightTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.spotlightDesc, { color: colors.textSecondary }]}>
            {description}
          </Text>
          <View style={styles.spotlightFooter}>
            <Text style={[styles.spotlightStep, { color: colors.textTertiary }]}>
              {step} of {totalSteps}
            </Text>
            <View style={styles.spotlightActions}>
              <TouchableOpacity onPress={onSkip}>
                <Text style={[styles.spotlightSkip, { color: colors.textSecondary }]}>
                  Skip
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.spotlightNext, { backgroundColor: colors.primary }]}
                onPress={() => {
                  haptic.light();
                  onNext?.();
                }}
              >
                <Text style={styles.spotlightNextText}>
                  {step === totalSteps ? 'Done' : 'Next'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

// Hook for managing first-time hints
const HINTS_STORAGE_KEY = '@bahi_khata_hints_shown';

export function useHints(screenKey: string) {
  const [shownHints, setShownHints] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHints();
  }, []);

  const loadHints = async () => {
    try {
      const data = await AsyncStorage.getItem(HINTS_STORAGE_KEY);
      if (data) {
        setShownHints(JSON.parse(data));
      }
    } catch {
      // Ignore errors
    } finally {
      setIsLoading(false);
    }
  };

  const markHintShown = async (hintKey: string) => {
    const fullKey = `${screenKey}_${hintKey}`;
    const newHints = [...shownHints, fullKey];
    setShownHints(newHints);
    
    try {
      await AsyncStorage.setItem(HINTS_STORAGE_KEY, JSON.stringify(newHints));
    } catch {
      // Ignore errors
    }
  };

  const shouldShowHint = (hintKey: string): boolean => {
    const fullKey = `${screenKey}_${hintKey}`;
    return !isLoading && !shownHints.includes(fullKey);
  };

  const resetHints = async () => {
    setShownHints([]);
    try {
      await AsyncStorage.removeItem(HINTS_STORAGE_KEY);
    } catch {
      // Ignore errors
    }
  };

  return {
    shouldShowHint,
    markHintShown,
    resetHints,
    isLoading,
  };
}

// Pull-to-refresh hint component
interface PullToRefreshHintProps {
  visible: boolean;
  onDismiss: () => void;
}

export function PullToRefreshHint({ visible, onDismiss }: PullToRefreshHintProps) {
  const { colors } = useTheme();
  const translateY = useRef(new Animated.Value(-50)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss after 3 seconds
      const timer = setTimeout(() => {
        onDismiss();
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -50,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity, onDismiss]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.pullHint,
        {
          backgroundColor: colors.primary,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <Icon name="arrow-down" size={16} color="#FFFFFF" />
      <Text style={styles.pullHintText}>Pull down to refresh</Text>
    </Animated.View>
  );
}

// Swipe hint animation
interface SwipeHintProps {
  visible: boolean;
  direction?: 'left' | 'right';
}

export function SwipeHint({ visible, direction = 'left' }: SwipeHintProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(translateX, {
            toValue: direction === 'left' ? -20 : 20,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      
      animation.start();
      
      return () => animation.stop();
    }
  }, [visible, translateX, direction]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.swipeHint,
        { transform: [{ translateX }] },
      ]}
    >
      <Icon
        name={direction === 'left' ? 'chevrons-left' : 'chevrons-right'}
        size={24}
        color="rgba(0,0,0,0.3)"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    maxWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  tooltipText: {
    fontSize: FontSize.sm,
    flex: 1,
  },
  tooltipClose: {
    marginLeft: Spacing.sm,
    padding: 2,
  },
  spotlightOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  spotlightCard: {
    position: 'absolute',
    width: 280,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  spotlightTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  spotlightDesc: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  spotlightFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spotlightStep: {
    fontSize: FontSize.xs,
  },
  spotlightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  spotlightSkip: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  spotlightNext: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  spotlightNextText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  pullHint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  pullHintText: {
    color: '#FFFFFF',
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  swipeHint: {
    position: 'absolute',
    right: Spacing.md,
    top: '50%',
    marginTop: -12,
  },
});
