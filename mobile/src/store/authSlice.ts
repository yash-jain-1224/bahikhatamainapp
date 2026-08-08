import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthState, User, TrialInfo } from '../types';

const initialState: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  loading: true, // start loading until hydration completes
  trialInfo: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    hydrateAuth(
      state,
      action: PayloadAction<{
        user: User | null;
        token: string | null;
        refreshToken: string | null;
        trialInfo: TrialInfo | null;
      }>,
    ) {
      const { user, token, refreshToken, trialInfo } = action.payload;
      state.user = user;
      state.token = token;
      state.refreshToken = refreshToken;
      state.isAuthenticated = !!token;
      state.trialInfo = trialInfo;
      state.loading = !!token; // if token present, keep loading until data fetch completes
    },
    setCredentials(
      state,
      action: PayloadAction<{
        user: User;
        accessToken: string;
        refreshToken: string;
        trial?: TrialInfo;
      }>,
    ) {
      state.user = action.payload.user;
      state.token = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      if (action.payload.trial) {
        state.trialInfo = action.payload.trial;
      }
      // Persist to AsyncStorage
      AsyncStorage.setItem('bk_token', action.payload.accessToken);
      AsyncStorage.setItem('bk_refresh_token', action.payload.refreshToken);
      AsyncStorage.setItem('bk_user', JSON.stringify(action.payload.user));
      if (action.payload.trial) {
        AsyncStorage.setItem('bk_trial', JSON.stringify(action.payload.trial));
      }
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      state.loading = false;
      AsyncStorage.setItem('bk_user', JSON.stringify(action.payload));
    },
    setTrialInfo(state, action: PayloadAction<TrialInfo | null>) {
      state.trialInfo = action.payload;
      if (action.payload) {
        AsyncStorage.setItem('bk_trial', JSON.stringify(action.payload));
      } else {
        AsyncStorage.removeItem('bk_trial');
      }
    },
    logout(state) {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.trialInfo = null;
      AsyncStorage.multiRemove([
        'bk_token',
        'bk_refresh_token',
        'bk_business_id',
        'bk_user',
        'bk_trial',
      ]);
    },
  },
});

export const { setLoading, hydrateAuth, setCredentials, setUser, setTrialInfo, logout } =
  authSlice.actions;
export default authSlice.reducer;
