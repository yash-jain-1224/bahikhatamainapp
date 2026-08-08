import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius } from '../../theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
  textStyle,
}: ButtonProps) {
  const { colors } = useTheme();

  const getButtonStyle = (): ViewStyle => {
    const base: ViewStyle = {
      borderRadius: BorderRadius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: size === 'sm' ? Spacing.md : size === 'lg' ? Spacing.xxl : Spacing.xl,
      paddingVertical: size === 'sm' ? Spacing.sm : size === 'lg' ? Spacing.lg : Spacing.md,
      opacity: disabled || loading ? 0.6 : 1,
    };

    if (fullWidth) base.width = '100%';

    switch (variant) {
      case 'primary':
        return { ...base, backgroundColor: colors.primary };
      case 'secondary':
        return { ...base, backgroundColor: colors.surfaceSecondary };
      case 'outline':
        return { ...base, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border };
      case 'ghost':
        return { ...base, backgroundColor: 'transparent' };
      case 'danger':
        return { ...base, backgroundColor: colors.error };
      default:
        return { ...base, backgroundColor: colors.primary };
    }
  };

  const getTextStyle = (): TextStyle => {
    const base: TextStyle = {
      fontWeight: '600',
      fontSize: size === 'sm' ? FontSize.sm : size === 'lg' ? FontSize.lg : FontSize.md,
    };

    switch (variant) {
      case 'primary':
        return { ...base, color: '#FFFFFF' };
      case 'secondary':
        return { ...base, color: colors.text };
      case 'outline':
        return { ...base, color: colors.text };
      case 'ghost':
        return { ...base, color: colors.primary };
      case 'danger':
        return { ...base, color: '#FFFFFF' };
      default:
        return { ...base, color: '#FFFFFF' };
    }
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? '#FFF' : colors.primary}
          style={{ marginRight: title ? Spacing.sm : 0 }}
        />
      ) : icon ? (
        <>{icon}</>
      ) : null}
      {title ? <Text style={[getTextStyle(), icon ? { marginLeft: Spacing.sm } : undefined, textStyle]}>{title}</Text> : null}
    </TouchableOpacity>
  );
}
