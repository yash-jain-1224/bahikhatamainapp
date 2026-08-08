import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';

interface AnimatedListItemProps {
  children: React.ReactNode;
  index: number;
  delay?: number;
  duration?: number;
  style?: ViewStyle;
}

export function AnimatedListItem({
  children,
  index,
  delay = 50,
  duration = 300,
  style,
}: AnimatedListItemProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration,
        delay: index * delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay: index * delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY, index, delay, duration]);

  return (
    <Animated.View
      style={[
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Scale animation for cards
interface AnimatedCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}

export function AnimatedCard({ children, style }: AnimatedCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      {children}
    </Animated.View>
  );
}

// Fade in animation wrapper
interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: ViewStyle;
}

export function FadeInView({
  children,
  delay = 0,
  duration = 300,
  style,
}: FadeInViewProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, delay, duration]);

  return (
    <Animated.View style={[{ opacity: fadeAnim }, style]}>
      {children}
    </Animated.View>
  );
}

// Slide in animation
interface SlideInViewProps {
  children: React.ReactNode;
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
  duration?: number;
  distance?: number;
  style?: ViewStyle;
}

export function SlideInView({
  children,
  direction = 'up',
  delay = 0,
  duration = 300,
  distance = 30,
  style,
}: SlideInViewProps) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    }).start();
  }, [anim, delay, duration]);

  const getTransform = () => {
    switch (direction) {
      case 'left':
        return {
          translateX: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [distance, 0],
          }),
        };
      case 'right':
        return {
          translateX: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [-distance, 0],
          }),
        };
      case 'down':
        return {
          translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [-distance, 0],
          }),
        };
      case 'up':
      default:
        return {
          translateY: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [distance, 0],
          }),
        };
    }
  };

  return (
    <Animated.View
      style={[
        {
          opacity: anim,
          transform: [getTransform()],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
