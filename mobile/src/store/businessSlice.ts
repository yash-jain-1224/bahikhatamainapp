import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Business, BusinessState } from '../types';

const initialState: BusinessState = {
  currentBusiness: null,
  businesses: [],
  loading: false,
};

const businessSlice = createSlice({
  name: 'business',
  initialState,
  reducers: {
    hydrateBusiness(
      state,
      action: PayloadAction<{ savedBizId: string | null }>,
    ) {
      // Will be used after businesses are loaded from API
      if (state.businesses.length > 0 && !state.currentBusiness) {
        const saved = state.businesses.find(
          (b) => b.id === action.payload.savedBizId,
        );
        state.currentBusiness = saved || state.businesses[0];
      }
    },
    setBusinesses(state, action: PayloadAction<Business[]>) {
      state.businesses = action.payload;
      if (!state.currentBusiness && action.payload.length > 0) {
        // Will attempt to match saved business after hydration
        state.currentBusiness = action.payload[0];
        // Try to restore previously selected business
        AsyncStorage.getItem('bk_business_id').then((savedId) => {
          // This runs async – the actual restore is handled in hydrateBusiness
        });
      }
    },
    setCurrentBusiness(state, action: PayloadAction<Business>) {
      state.currentBusiness = action.payload;
      AsyncStorage.setItem('bk_business_id', action.payload.id);
    },
    clearBusiness(state) {
      state.currentBusiness = null;
      state.businesses = [];
      AsyncStorage.removeItem('bk_business_id');
    },
    setBusinessLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    updateBusinessLogo(
      state,
      action: PayloadAction<{ id: string; logo_url: string }>,
    ) {
      const { id, logo_url } = action.payload;
      const idx = state.businesses.findIndex((b) => b.id === id);
      if (idx !== -1) {
        state.businesses[idx] = { ...state.businesses[idx], logo_url };
      }
      if (state.currentBusiness?.id === id) {
        state.currentBusiness = { ...state.currentBusiness, logo_url };
      }
    },
  },
});

export const {
  hydrateBusiness,
  setBusinesses,
  setCurrentBusiness,
  clearBusiness,
  setBusinessLoading,
  updateBusinessLogo,
} = businessSlice.actions;
export default businessSlice.reducer;
