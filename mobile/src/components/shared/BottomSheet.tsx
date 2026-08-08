import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius } from '../../theme/colors';
import { haptic } from '../../utils/haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapPoints?: number[];
  enableDrag?: boolean;
  showHandle?: boolean;
  showCloseButton?: boolean;
  scrollable?: boolean;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  snapPoints = [0.5, 0.9],
  enableDrag = true,
  showHandle = true,
  showCloseButton = true,
  scrollable = false,
}: BottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const currentSnapIndex = useRef(0);

  const snapPointsInPixels = snapPoints.map(sp => SCREEN_HEIGHT * (1 - sp));

  useEffect(() => {
    if (visible) {
      // Open animation
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: snapPointsInPixels[0],
          useNativeDriver: true,
          tension: 100,
          friction: 12,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Close animation
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, overlayOpacity, snapPointsInPixels]);

  const handleClose = useCallback(() => {
    haptic.light();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [translateY, overlayOpacity, onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => enableDrag,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return enableDrag && Math.abs(gestureState.dy) > 10;
      },
      onPanResponderGrant: () => {
        translateY.setOffset((translateY as any)._value);
        translateY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const newValue = Math.max(0, gestureState.dy);
        translateY.setValue(newValue);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();
        
        const currentY = (translateY as any)._value;
        const velocity = gestureState.vy;

        // If velocity is high, close or snap
        if (velocity > 0.5) {
          handleClose();
          return;
        }

        // Find nearest snap point
        let nearestSnapIndex = 0;
        let minDistance = Math.abs(currentY - snapPointsInPixels[0]);
        
        snapPointsInPixels.forEach((sp, index) => {
          const distance = Math.abs(currentY - sp);
          if (distance < minDistance) {
            minDistance = distance;
            nearestSnapIndex = index;
          }
        });

        // If dragged past last snap point, close
        if (currentY > SCREEN_HEIGHT * 0.7) {
          handleClose();
          return;
        }

        // Snap to nearest point
        Animated.spring(translateY, {
          toValue: snapPointsInPixels[nearestSnapIndex],
          useNativeDriver: true,
          tension: 100,
          friction: 12,
        }).start();
        
        currentSnapIndex.current = nearestSnapIndex;
        haptic.selection();
      },
    })
  ).current;

  const ContentWrapper = scrollable ? ScrollView : View;
  const contentWrapperProps = scrollable ? { 
    showsVerticalScrollIndicator: false,
    contentContainerStyle: { paddingBottom: insets.bottom + Spacing.lg },
  } : {};

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Overlay */}
        <Animated.View
          style={[
            styles.overlay,
            {
              backgroundColor: colors.overlay,
              opacity: overlayOpacity,
            },
          ]}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              transform: [{ translateY }],
              paddingBottom: insets.bottom,
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Handle */}
          {showHandle && (
            <View style={styles.handleContainer}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
            </View>
          )}

          {/* Header */}
          {(title || showCloseButton) && (
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
              {showCloseButton && (
                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]}
                  onPress={handleClose}
                >
                  <Icon name="x" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Content */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.content}
          >
            <ContentWrapper {...contentWrapperProps}>
              {children}
            </ContentWrapper>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// Action sheet variant
interface ActionSheetAction {
  label: string;
  icon?: string;
  onPress: () => void;
  variant?: 'default' | 'danger';
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionSheetAction[];
  cancelLabel?: string;
}

export function ActionSheet({
  visible,
  onClose,
  title,
  actions,
  cancelLabel = 'Cancel',
}: ActionSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const handleAction = (action: ActionSheetAction) => {
    haptic.light();
    onClose();
    setTimeout(() => action.onPress(), 200);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      snapPoints={[0.4]}
      showCloseButton={false}
    >
      <View style={styles.actionSheetContent}>
        {actions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.actionItem,
              { borderBottomColor: colors.border },
              index < actions.length - 1 && styles.actionItemBorder,
            ]}
            onPress={() => handleAction(action)}
          >
            {action.icon && (
              <Icon
                name={action.icon}
                size={20}
                color={action.variant === 'danger' ? colors.error : colors.text}
                style={styles.actionIcon}
              />
            )}
            <Text
              style={[
                styles.actionLabel,
                { color: action.variant === 'danger' ? colors.error : colors.text },
              ]}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[
            styles.cancelButton,
            { backgroundColor: colors.surfaceSecondary, marginBottom: insets.bottom },
          ]}
          onPress={onClose}
        >
          <Text style={[styles.cancelLabel, { color: colors.textSecondary }]}>
            {cancelLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: SCREEN_HEIGHT * 0.9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  actionSheetContent: {
    paddingTop: Spacing.sm,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  actionItemBorder: {
    borderBottomWidth: 1,
  },
  actionIcon: {
    marginRight: Spacing.md,
  },
  actionLabel: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  cancelButton: {
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelLabel: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
});
