import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';
import { useTheme } from '../../theme';
import { getInitials } from '../../utils';
import { getImageUrl } from '../../services/api';

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: number;
  fontSize?: number;
  /** Optional: use square shape instead of circle */
  square?: boolean;
}

export function Avatar({ name, imageUrl, size = 40, fontSize, square = false }: AvatarProps) {
  const { colors } = useTheme();
  const [imageError, setImageError] = useState(false);

  const borderRadius = square ? size * 0.2 : size / 2;
  const fullImageUrl = getImageUrl(imageUrl);

  if (fullImageUrl && !imageError) {
    return (
      <Image
        source={{ uri: fullImageUrl }}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius,
          },
        ]}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: colors.primaryLight + '30',
        },
      ]}
    >
      <Text
        style={[
          styles.initials,
          {
            color: colors.primary,
            fontSize: fontSize || size * 0.4,
          },
        ]}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

interface BusinessAvatarProps {
  name: string;
  logoUrl?: string | null;
  size?: number;
  fontSize?: number;
}

/**
 * BusinessAvatar displays a business logo (square with rounded corners) or fallback initials.
 */
export function BusinessAvatar({ name, logoUrl, size = 40, fontSize }: BusinessAvatarProps) {
  const { colors } = useTheme();
  const [imageError, setImageError] = useState(false);

  const borderRadius = size * 0.2;
  const fullLogoUrl = getImageUrl(logoUrl);

  if (fullLogoUrl && !imageError) {
    return (
      <Image
        source={{ uri: fullLogoUrl }}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius,
          },
        ]}
        onError={() => setImageError(true)}
      />
    );
  }

  // Fallback: show initials with Building icon style
  return (
    <View
      style={[
        styles.placeholder,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: colors.primary + '15',
        },
      ]}
    >
      <Text
        style={[
          styles.initials,
          {
            color: colors.primary,
            fontSize: fontSize || size * 0.45,
          },
        ]}
      >
        {name ? getInitials(name) : '🏢'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontWeight: '700',
  },
});
