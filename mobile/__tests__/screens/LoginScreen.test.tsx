import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/store/authSlice';
import businessReducer from '@/store/businessSlice';
import LoginScreen from '@/screens/auth/LoginScreen';

// ── Mocks ────────────────────────────────────────────────────────────
// Mock by the resolved path so it intercepts both @/ alias AND relative imports
// that LoginScreen uses internally (e.g. ../../theme, ../../services/api).

const mockThemeFactory = () => {
  const Colors = jest.requireActual('../../../src/theme/colors').Colors;
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    useTheme: () => ({
      mode: 'light',
      isDark: false,
      colors: Colors.light,
      setMode: jest.fn(),
      toggleTheme: jest.fn(),
    }),
  };
};
jest.mock('@/theme/ThemeContext', mockThemeFactory);
jest.mock('@/theme', mockThemeFactory);

const mockToastFactory = () => {
  const React = require('react');
  const toastValue = {
    show: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  };
  const ToastCtx = React.createContext(toastValue);
  return {
    ToastProvider: ({ children }: { children: React.ReactNode }) => (
      React.createElement(ToastCtx.Provider, { value: toastValue }, children)
    ),
    useToast: () => React.useContext(ToastCtx),
  };
};
jest.mock('@/components/shared/Toast', mockToastFactory);

const mockApiFactory = () => ({
  authApi: {
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
  },
  businessApi: {
    list: jest.fn().mockResolvedValue({ data: { data: [] } }),
  },
});
jest.mock('@/services/api', mockApiFactory);

import { authApi, businessApi } from '@/services/api';

const mockUser = {
  id: 'u-1', phone: '9999999999', name: 'Test User',
  is_active: true, is_super_admin: false,
};

function makeStore() {
  return configureStore({
    reducer: { auth: authReducer, business: businessReducer },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function renderLogin() {
  const store = makeStore();
  const utils = render(
    <Provider store={store}>
      <LoginScreen />
    </Provider>,
  );
  return { ...utils, store };
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the phone input step by default', () => {
    const { getByText, getByPlaceholderText } = renderLogin();
    expect(getByText('Sign In')).toBeTruthy();
    expect(getByPlaceholderText('Enter 10-digit number')).toBeTruthy();
    expect(getByText('Send OTP')).toBeTruthy();
  });

  it('renders Bahi Khata branding', () => {
    const { getByText } = renderLogin();
    expect(getByText('Bahi Khata')).toBeTruthy();
    expect(getByText('Smart Business Accounting')).toBeTruthy();
  });

  it('Send OTP button is disabled when phone is less than 10 digits', () => {
    const { getByPlaceholderText, getByText } = renderLogin();
    fireEvent.changeText(getByPlaceholderText('Enter 10-digit number'), '98765');
    const btn = getByText('Send OTP').parent?.parent;
    // Button disabled prop should be true (< 10 digits)
    expect(btn?.props.accessibilityState?.disabled).toBeTruthy();
  });

  it('calls sendOtp when valid 10-digit phone is entered and button pressed', async () => {
    (authApi.sendOtp as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { getByPlaceholderText, getByText } = renderLogin();

    fireEvent.changeText(getByPlaceholderText('Enter 10-digit number'), '9876543210');
    fireEvent.press(getByText('Send OTP'));

    await waitFor(() => {
      expect(authApi.sendOtp).toHaveBeenCalledWith('9876543210');
    });
  });

  it('shows OTP step after successful sendOtp', async () => {
    (authApi.sendOtp as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { getByPlaceholderText, getByText, findByText } = renderLogin();

    fireEvent.changeText(getByPlaceholderText('Enter 10-digit number'), '9876543210');
    fireEvent.press(getByText('Send OTP'));

    await findByText('Verify OTP');
    expect(getByText('Verify & Sign In')).toBeTruthy();
  });

  it('shows resend and change number options on OTP step', async () => {
    (authApi.sendOtp as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { getByPlaceholderText, getByText, findByText } = renderLogin();

    fireEvent.changeText(getByPlaceholderText('Enter 10-digit number'), '9876543210');
    fireEvent.press(getByText('Send OTP'));

    await findByText('Verify OTP');
    expect(getByText(/Didn't receive OTP/)).toBeTruthy();
    expect(getByText('← Change Phone Number')).toBeTruthy();
  });

  it('goes back to phone step when "Change Phone Number" pressed', async () => {
    (authApi.sendOtp as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { getByPlaceholderText, getByText, findByText } = renderLogin();

    fireEvent.changeText(getByPlaceholderText('Enter 10-digit number'), '9876543210');
    fireEvent.press(getByText('Send OTP'));

    await findByText('Verify OTP');
    fireEvent.press(getByText('← Change Phone Number'));
    expect(getByText('Sign In')).toBeTruthy();
  });

  it('calls verifyOtp with phone and otp on submit', async () => {
    (authApi.sendOtp as jest.Mock).mockResolvedValue({ data: { success: true } });
    (authApi.verifyOtp as jest.Mock).mockResolvedValue({
      data: {
        data: {
          user: mockUser, accessToken: 'access-123',
          refreshToken: 'refresh-456',
        },
      },
    });

    const { getByPlaceholderText, getByText, findByText } = renderLogin();
    fireEvent.changeText(getByPlaceholderText('Enter 10-digit number'), '9876543210');
    fireEvent.press(getByText('Send OTP'));

    await findByText('Verify OTP');
    fireEvent.changeText(getByPlaceholderText('Enter OTP'), '123456');
    fireEvent.press(getByText('Verify & Sign In'));

    await waitFor(() => {
      expect(authApi.verifyOtp).toHaveBeenCalledWith('9876543210', '123456');
    });
  });

  it('dispatches setCredentials to store after successful login', async () => {
    (authApi.sendOtp as jest.Mock).mockResolvedValue({ data: { success: true } });
    (authApi.verifyOtp as jest.Mock).mockResolvedValue({
      data: {
        data: {
          user: mockUser, accessToken: 'access-123',
          refreshToken: 'refresh-456',
        },
      },
    });
    (businessApi.list as jest.Mock).mockResolvedValue({ data: { data: [] } });

    const { getByPlaceholderText, getByText, findByText, store } = renderLogin();
    fireEvent.changeText(getByPlaceholderText('Enter 10-digit number'), '9876543210');
    fireEvent.press(getByText('Send OTP'));

    await findByText('Verify OTP');
    fireEvent.changeText(getByPlaceholderText('Enter OTP'), '123456');
    fireEvent.press(getByText('Verify & Sign In'));

    await waitFor(() => {
      const state = store.getState() as any;
      expect(state.auth.isAuthenticated).toBe(true);
      expect(state.auth.token).toBe('access-123');
      expect(state.auth.user).toEqual(mockUser);
    });
  });
});
