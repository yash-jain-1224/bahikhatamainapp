import React from 'react';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { StyleSheet, View, Text, LogBox, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { store } from './src/store';
import { ThemeProvider } from './src/theme/ThemeContext';
import RootNavigator from './src/navigation/RootNavigator';
import { ToastProvider } from './src/components/shared/Toast';

// Suppress non-critical warnings in dev
LogBox.ignoreLogs(['ViewPropTypes', 'ColorPropType']);

// ── Error Boundary ──────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App Error Boundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.emoji}>⚠️</Text>
          <Text style={errorStyles.title}>Something went wrong</Text>
          <Text style={errorStyles.message}>
            {this.state.error?.message || 'Unknown error'}
          </Text>
          <Text style={errorStyles.stack}>
            {this.state.error?.stack?.slice(0, 500)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// ── Splash ──────────────────────────────────────
function SplashScreen() {
  return (
    <View style={splashStyles.container}>
      <Text style={splashStyles.logo}>📒</Text>
      <Text style={splashStyles.name}>Bahi Khata</Text>
      <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 20 }} />
    </View>
  );
}

// ── Main App ────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <Provider store={store}>
          <SafeAreaProvider>
            <ThemeProvider>
              <NavigationContainer fallback={<SplashScreen />}>
                <ToastProvider>
                  <RootNavigator />
                </ToastProvider>
              </NavigationContainer>
            </ThemeProvider>
          </SafeAreaProvider>
        </Provider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  logo: {
    fontSize: 64,
    marginBottom: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
});

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FEF2F2',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  stack: {
    fontSize: 10,
    color: '#7F1D1D',
    fontFamily: 'Courier',
    textAlign: 'left',
    paddingHorizontal: 12,
  },
});
