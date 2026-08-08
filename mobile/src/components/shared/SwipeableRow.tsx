import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
} from 'react-native';
import { useTheme } from '../../theme';
import Icon from 'react-native-vector-icons/Feather';

const SWIPE_THRESHOLD = 80;

interface SwipeAction {
  icon: string;
  color: string;
  backgroundColor: string;
  onPress: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function SwipeableRow({
  children,
  leftActions = [],
  rightActions = [],
  onSwipeLeft,
  onSwipeRight,
}: SwipeableRowProps) {
  const { colors } = useTheme();
  const translateX = React.useRef(new Animated.Value(0)).current;
  const [isOpen, setIsOpen] = React.useState<'left' | 'right' | null>(null);

  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
      },
      onPanResponderGrant: () => {
        translateX.setOffset((translateX as any)._value);
        translateX.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const maxLeft = leftActions.length * 70;
        const maxRight = rightActions.length * 70;
        const newValue = Math.max(-maxRight, Math.min(maxLeft, gestureState.dx));
        translateX.setValue(newValue);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateX.flattenOffset();
        
        const maxLeft = leftActions.length * 70;
        const maxRight = rightActions.length * 70;

        if (gestureState.dx > SWIPE_THRESHOLD && leftActions.length > 0) {
          Animated.spring(translateX, {
            toValue: maxLeft,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
          setIsOpen('left');
          onSwipeRight?.();
        } else if (gestureState.dx < -SWIPE_THRESHOLD && rightActions.length > 0) {
          Animated.spring(translateX, {
            toValue: -maxRight,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
          setIsOpen('right');
          onSwipeLeft?.();
        } else {
          closeRow();
        }
      },
    })
  ).current;

  const closeRow = () => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start(() => setIsOpen(null));
  };

  const handleActionPress = (action: SwipeAction) => {
    closeRow();
    action.onPress();
  };

  return (
    <View style={styles.container}>
      {/* Left actions */}
      <View style={[styles.actionsContainer, styles.leftActions]}>
        {leftActions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.actionButton, { backgroundColor: action.backgroundColor }]}
            onPress={() => handleActionPress(action)}
          >
            <Icon name={action.icon} size={20} color={action.color} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Right actions */}
      <View style={[styles.actionsContainer, styles.rightActions]}>
        {rightActions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.actionButton, { backgroundColor: action.backgroundColor }]}
            onPress={() => handleActionPress(action)}
          >
            <Icon name={action.icon} size={20} color={action.color} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Main content */}
      <Animated.View
        style={[
          styles.content,
          {
            backgroundColor: colors.card,
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={isOpen ? closeRow : undefined}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  content: {
    zIndex: 1,
  },
  actionsContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftActions: {
    left: 0,
  },
  rightActions: {
    right: 0,
  },
  actionButton: {
    width: 70,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
