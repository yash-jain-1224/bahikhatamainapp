import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing } from '../../theme/colors';

interface LoadingIndicatorProps {
  size?: 'small' | 'medium' | 'large';
  variant?: 'spinner' | 'dots' | 'pulse';
  color?: string;
  text?: string;
  fullScreen?: boolean;
  overlay?: boolean;
  style?: ViewStyle;
}

export function LoadingIndicator({
  size = 'medium',
  variant = 'spinner',
  color,
  text,
  fullScreen = false,
  overlay = false,
  style,
}: LoadingIndicatorProps) {
  const { colors } = useTheme();
  const indicatorColor = color || colors.primary;

  const content = (
    <View style={[styles.content, style]}>
      {variant === 'spinner' && (
        <ActivityIndicator
          size={size === 'small' ? 'small' : 'large'}
          color={indicatorColor}
        />
      )}
      {variant === 'dots' && (
        <DotsLoader color={indicatorColor} size={size} />
      )}
      {variant === 'pulse' && (
        <PulseLoader color={indicatorColor} size={size} />
      )}
      {text && (
        <Text style={[styles.text, { color: colors.textSecondary }]}>{text}</Text>
      )}
    </View>
  );

  if (fullScreen) {
    return (
      <View style={[styles.fullScreen, { backgroundColor: colors.background }]}>
        {content}
      </View>
    );
  }

  if (overlay) {
    return (
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.overlayContent, { backgroundColor: colors.card }]}>
          {content}
        </View>
      </View>
    );
  }

  return content;
}

// Dots loading animation
function DotsLoader({ color, size }: { color: string; size: 'small' | 'medium' | 'large' }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  const dotSize = size === 'small' ? 6 : size === 'large' ? 12 : 8;
  const dotSpacing = size === 'small' ? 4 : size === 'large' ? 8 : 6;

  useEffect(() => {
    const createAnimation = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.ease,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.ease,
          }),
        ])
      );
    };

    const anim1 = createAnimation(dot1, 0);
    const anim2 = createAnimation(dot2, 150);
    const anim3 = createAnimation(dot3, 300);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  const renderDot = (anim: Animated.Value) => (
    <Animated.View
      style={[
        {
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: color,
          marginHorizontal: dotSpacing / 2,
          transform: [
            {
              scale: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.4],
              }),
            },
          ],
          opacity: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.4, 1],
          }),
        },
      ]}
    />
  );

  return (
    <View style={styles.dotsContainer}>
      {renderDot(dot1)}
      {renderDot(dot2)}
      {renderDot(dot3)}
    </View>
  );
}

// Pulse loading animation
function PulseLoader({ color, size }: { color: string; size: 'small' | 'medium' | 'large' }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const pulseSize = size === 'small' ? 24 : size === 'large' ? 48 : 36;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1.5,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.ease,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
          easing: Easing.ease,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [scale, opacity]);

  return (
    <View style={styles.pulseContainer}>
      <Animated.View
        style={[
          styles.pulseOuter,
          {
            width: pulseSize,
            height: pulseSize,
            borderRadius: pulseSize / 2,
            backgroundColor: color,
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
      <View
        style={[
          styles.pulseInner,
          {
            width: pulseSize * 0.6,
            height: pulseSize * 0.6,
            borderRadius: pulseSize * 0.3,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

// Full page loading screen
interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.loadingScreen, { backgroundColor: colors.background }]}>
      <LoadingIndicator size="large" variant="dots" />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  text: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayContent: {
    padding: Spacing.xl,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulseContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseOuter: {
    position: 'absolute',
  },
  pulseInner: {
    // Inner circle
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: Spacing.lg,
    fontSize: FontSize.md,
  },
});
