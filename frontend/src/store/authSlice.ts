import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthState, User, TrialInfo } from '@/types';

// Restore user from localStorage
const savedUser = localStorage.getItem('bk_user');
let parsedUser: User | null = null;
try {
  if (savedUser) parsedUser = JSON.parse(savedUser);
} catch { /* ignore */ }

const savedTrial = localStorage.getItem('bk_trial');
let parsedTrial: TrialInfo | null = null;
try {
  if (savedTrial) parsedTrial = JSON.parse(savedTrial);
} catch { /* ignore */ }

const initialState: AuthState = {
  user: parsedUser,
  token: localStorage.getItem('bk_token'),
  refreshToken: localStorage.getItem('bk_refresh_token'),
  isAuthenticated: !!localStorage.getItem('bk_token'),
  // Start as loading=true when we have a saved token so ProtectedRoute
  // waits for the initial data fetch before making redirect decisions.
  loading: !!localStorage.getItem('bk_token'),
  trialInfo: parsedTrial,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setCredentials(state, action: PayloadAction<{ user: User; accessToken: string; refreshToken: string; trial?: TrialInfo }>) {
      state.user = action.payload.user;
      state.token = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      // NOTE: Do NOT set loading = false here.
      // Loading is managed by the caller (fetchInitialData / login handlers)
      // to prevent ProtectedRoute from evaluating before businesses are loaded.
      if (action.payload.trial) {
        state.trialInfo = action.payload.trial;
        localStorage.setItem('bk_trial', JSON.stringify(action.payload.trial));
      }
      localStorage.setItem('bk_token', action.payload.accessToken);
      localStorage.setItem('bk_refresh_token', action.payload.refreshToken);
      localStorage.setItem('bk_user', JSON.stringify(action.payload.user));
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      state.loading = false;
      localStorage.setItem('bk_user', JSON.stringify(action.payload));
    },
    setTrialInfo(state, action: PayloadAction<TrialInfo | null>) {
      state.trialInfo = action.payload;
      if (action.payload) {
        localStorage.setItem('bk_trial', JSON.stringify(action.payload));
      } else {
        localStorage.removeItem('bk_trial');
      }
    },
    logout(state) {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.trialInfo = null;
      localStorage.removeItem('bk_token');
      localStorage.removeItem('bk_refresh_token');
      localStorage.removeItem('bk_business_id');
      localStorage.removeItem('bk_user');
      localStorage.removeItem('bk_trial');
    },
  },
});

export const { setLoading, setCredentials, setUser, setTrialInfo, logout } = authSlice.actions;
export default authSlice.reducer;
