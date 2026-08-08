import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius } from '../../theme/colors';
import Icon from 'react-native-vector-icons/Feather';

interface FloatingActionButtonProps {
  onPress: () => void;
  icon?: string;
  label?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  position?: 'bottom-right' | 'bottom-center' | 'bottom-left';
  children?: React.ReactNode;
}

export function FloatingActionButton({
  onPress,
  icon = 'plus',
  label,
  color,
  size = 'md',
  position = 'bottom-right',
  children,
}: FloatingActionButtonProps) {
  const { colors } = useTheme();
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const buttonColor = color || colors.primary;
  const buttonSize = size === 'sm' ? 48 : size === 'lg' ? 64 : 56;
  const iconSize = size === 'sm' ? 20 : size === 'lg' ? 28 : 24;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      tension: 200,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 200,
      friction: 10,
    }).start();
  };

  const getPositionStyle = () => {
    switch (position) {
      case 'bottom-left':
        return { left: Spacing.xl };
      case 'bottom-center':
        return { alignSelf: 'center' as const, left: undefined, right: undefined };
      default:
        return { right: Spacing.xl };
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        getPositionStyle(),
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.button,
          {
            backgroundColor: buttonColor,
            width: label ? undefined : buttonSize,
            height: buttonSize,
            borderRadius: label ? buttonSize / 2 : buttonSize / 2,
            paddingHorizontal: label ? Spacing.xl : 0,
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
      >
        {children || (
          <>
            <Icon name={icon} size={iconSize} color="#FFF" />
            {label && <Text style={styles.label}>{label}</Text>}
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// Extended FAB with multiple actions
interface FABAction {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
}

interface ExpandableFABProps {
  actions: FABAction[];
  mainIcon?: string;
  mainColor?: string;
}

export function ExpandableFAB({
  actions,
  mainIcon = 'plus',
  mainColor,
}: ExpandableFABProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);
  const rotateAnim = React.useRef(new Animated.Value(0)).current;
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnims = React.useRef(actions.map(() => new Animated.Value(0))).current;

  const buttonColor = mainColor || colors.primary;

  const toggleMenu = () => {
    const toValue = isOpen ? 0 : 1;
    
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(fadeAnim, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
      ...slideAnims.map((anim, index) =>
        Animated.spring(anim, {
          toValue,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
          delay: isOpen ? 0 : index * 50,
        })
      ),
    ]).start();
    
    setIsOpen(!isOpen);
  };

  const handleActionPress = (action: FABAction) => {
    toggleMenu();
    setTimeout(() => action.onPress(), 200);
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <View style={styles.expandableContainer}>
      {/* Backdrop */}
      {isOpen && (
        <TouchableOpacity
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={toggleMenu}
        />
      )}

      {/* Action buttons */}
      {actions.map((action, index) => {
        const translateY = slideAnims[index].interpolate({
          inputRange: [0, 1],
          outputRange: [0, -(70 * (index + 1))],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.actionItem,
              {
                opacity: fadeAnim,
                transform: [{ translateY }],
              },
            ]}
          >
            <View style={[styles.actionLabel, { backgroundColor: colors.card }]}>
              <Text style={[styles.actionLabelText, { color: colors.text }]}>
                {action.label}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: action.color || colors.surfaceSecondary },
              ]}
              onPress={() => handleActionPress(action)}
            >
              <Icon name={action.icon} size={20} color={action.color ? '#FFF' : colors.primary} />
            </TouchableOpacity>
          </Animated.View>
        );
      })}

      {/* Main button */}
      <TouchableOpacity
        style={[styles.mainButton, { backgroundColor: buttonColor }]}
        onPress={toggleMenu}
        activeOpacity={0.9}
      >
        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
          <Icon name={mainIcon} size={24} color="#FFF" />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.xl,
    zIndex: 100,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
  },
  label: {
    color: '#FFF',
    fontSize: FontSize.md,
    fontWeight: '600',
    marginLeft: Spacing.sm,
  },
  expandableContainer: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.xl,
    alignItems: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -100,
    bottom: -100,
    width: 3000,
    height: 3000,
  },
  actionItem: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionLabel: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  actionLabelText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.23,
    shadowRadius: 2.62,
  },
  mainButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
  },
});
