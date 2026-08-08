/**
 * Jest global setup for Bahi Khata Mobile tests
 */
import '@testing-library/jest-native/extend-expect';

// ── Mock Platform ─────────────────────────────────────────────────────
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'ios',
  select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
  Version: 14,
  isPad: false,
  isTVOS: false,
}));

// ── Mock AsyncStorage ─────────────────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ── Mock react-native-safe-area-context ──────────────────────────────
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaConsumer: ({ children }: { children: (insets: typeof insets) => React.ReactNode }) =>
      children(insets),
    useSafeAreaInsets: () => insets,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  };
});

// ── Mock react-native-gesture-handler ────────────────────────────────
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual('react-native');
  return {
    GestureHandlerRootView: RN.View,
    PanGestureHandler: RN.View,
    TapGestureHandler: RN.View,
    State: {},
    Directions: {},
  };
});

// ── Mock react-native-reanimated ─────────────────────────────────────
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// ── Mock react-native-vector-icons ───────────────────────────────────
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-vector-icons/FontAwesome', () => 'Icon');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');

// ── Mock @react-navigation ────────────────────────────────────────────
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      reset: jest.fn(),
      dispatch: jest.fn(),
    }),
    useRoute: () => ({ params: {} }),
    NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
    useFocusEffect: jest.fn(),
  };
});

// ── Mock react-native-svg ─────────────────────────────────────────────
jest.mock('react-native-svg', () => {
  const RN = jest.requireActual('react-native');
  return {
    Svg: RN.View,
    Circle: RN.View,
    Rect: RN.View,
    Path: RN.View,
    G: RN.View,
  };
});

// ── Silence irrelevant console noise ─────────────────────────────────
const originalWarn = console.warn;
const originalError = console.error;
beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('ViewPropTypes') ||
        args[0].includes('ColorPropType') ||
        args[0].includes('Animated'))
    ) {
      return;
    }
    originalWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('not wrapped in act')
    ) {
      return;
    }
    originalError(...args);
  };
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});
