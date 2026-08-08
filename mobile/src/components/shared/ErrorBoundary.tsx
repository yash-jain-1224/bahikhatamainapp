import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { Spacing, BorderRadius, FontSize } from '../../theme/colors';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Icon name="alert-triangle" size={48} color="#EF4444" />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
              <Icon name="refresh-cw" size={18} color="#FFFFFF" />
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// Functional component for retry with animation
interface RetryViewProps {
  onRetry: () => void;
  title?: string;
  message?: string;
  loading?: boolean;
}

export function RetryView({ onRetry, title = 'Failed to load', message = 'Please try again', loading = false }: RetryViewProps) {
  const shakeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;

  React.useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  }, [scaleAnim]);

  const handleRetry = () => {
    // Shake animation on tap
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => onRetry());
  };

  return (
    <Animated.View 
      style={[
        styles.retryContainer,
        { 
          transform: [
            { scale: scaleAnim },
            { translateX: shakeAnim },
          ],
        },
      ]}
    >
      <View style={styles.retryIconContainer}>
        <Icon name="wifi-off" size={40} color="#9CA3AF" />
      </View>
      <Text style={styles.retryTitle}>{title}</Text>
      <Text style={styles.retryMessage}>{message}</Text>
      <TouchableOpacity 
        style={[styles.retryButton, loading && styles.retryButtonDisabled]} 
        onPress={handleRetry}
        disabled={loading}
      >
        <Icon name={loading ? 'loader' : 'refresh-cw'} size={18} color="#FFFFFF" />
        <Text style={styles.retryText}>{loading ? 'Loading...' : 'Retry'}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// Network error component
interface NetworkErrorProps {
  onRetry: () => void;
}

export function NetworkError({ onRetry }: NetworkErrorProps) {
  return (
    <RetryView
      onRetry={onRetry}
      title="No internet connection"
      message="Please check your network and try again"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: '#F9FAFB',
  },
  content: {
    alignItems: 'center',
    maxWidth: 300,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSize.sm,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryText: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  retryContainer: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  retryIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  retryTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  retryMessage: {
    fontSize: FontSize.sm,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
});
