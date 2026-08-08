import { configureStore } from '@reduxjs/toolkit';
import authReducer, {
  hydrateAuth,
  setCredentials,
  setLoading,
  setUser,
  setTrialInfo,
  logout,
} from '@/store/authSlice';
import type { User, TrialInfo } from '@/types';

const mockUser: User = {
  id: 'user-1',
  phone: '9999999999',
  name: 'Test User',
  email: 'test@example.com',
  is_active: true,
  is_super_admin: false,
};

const mockTrial: TrialInfo = {
  expired: false,
  endsAt: '2026-04-01T00:00:00Z',
  daysRemaining: 25,
  planName: 'TRIAL',
  maxBusinesses: 1,
};

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } });
}

describe('authSlice', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const store = makeStore();
      const state = store.getState().auth;
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.loading).toBe(true);
      expect(state.trialInfo).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('sets loading to false', () => {
      const store = makeStore();
      store.dispatch(setLoading(false));
      expect(store.getState().auth.loading).toBe(false);
    });

    it('sets loading to true', () => {
      const store = makeStore();
      store.dispatch(setLoading(false));
      store.dispatch(setLoading(true));
      expect(store.getState().auth.loading).toBe(true);
    });
  });

  describe('hydrateAuth', () => {
    it('sets authenticated state when token present', () => {
      const store = makeStore();
      store.dispatch(
        hydrateAuth({
          user: mockUser,
          token: 'test-token',
          refreshToken: 'refresh-token',
          trialInfo: null,
        }),
      );
      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(true);
      expect(state.token).toBe('test-token');
      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(true); // still loading, awaiting data fetch
    });

    it('sets unauthenticated when no token', () => {
      const store = makeStore();
      store.dispatch(
        hydrateAuth({ user: null, token: null, refreshToken: null, trialInfo: null }),
      );
      const state = store.getState().auth;
      expect(state.isAuthenticated).toBe(false);
      expect(state.loading).toBe(false);
    });

    it('stores trial info when provided', () => {
      const store = makeStore();
      store.dispatch(
        hydrateAuth({
          user: mockUser,
          token: 'tok',
          refreshToken: 'rtok',
          trialInfo: mockTrial,
        }),
      );
      expect(store.getState().auth.trialInfo).toEqual(mockTrial);
    });
  });

  describe('setCredentials', () => {
    it('sets user, tokens and marks authenticated', () => {
      const store = makeStore();
      store.dispatch(
        setCredentials({
          user: mockUser,
          accessToken: 'access-123',
          refreshToken: 'refresh-456',
        }),
      );
      const state = store.getState().auth;
      expect(state.user).toEqual(mockUser);
      expect(state.token).toBe('access-123');
      expect(state.refreshToken).toBe('refresh-456');
      expect(state.isAuthenticated).toBe(true);
    });

    it('stores trial info if provided', () => {
      const store = makeStore();
      store.dispatch(
        setCredentials({
          user: mockUser,
          accessToken: 'tok',
          refreshToken: 'rtok',
          trial: mockTrial,
        }),
      );
      expect(store.getState().auth.trialInfo).toEqual(mockTrial);
    });
  });

  describe('setUser', () => {
    it('updates user and stops loading', () => {
      const store = makeStore();
      store.dispatch(setUser(mockUser));
      const state = store.getState().auth;
      expect(state.user).toEqual(mockUser);
      expect(state.loading).toBe(false);
    });
  });

  describe('setTrialInfo', () => {
    it('stores trial info', () => {
      const store = makeStore();
      store.dispatch(setTrialInfo(mockTrial));
      expect(store.getState().auth.trialInfo).toEqual(mockTrial);
    });

    it('clears trial info when null', () => {
      const store = makeStore();
      store.dispatch(setTrialInfo(mockTrial));
      store.dispatch(setTrialInfo(null));
      expect(store.getState().auth.trialInfo).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears all auth state', () => {
      const store = makeStore();
      store.dispatch(
        setCredentials({ user: mockUser, accessToken: 'tok', refreshToken: 'rtok' }),
      );
      store.dispatch(logout());
      const state = store.getState().auth;
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.loading).toBe(false);
    });
  });
});
