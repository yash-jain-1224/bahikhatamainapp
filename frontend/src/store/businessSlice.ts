import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Business, BusinessState } from '@/types';

const savedBizId = localStorage.getItem('bk_business_id');

const initialState: BusinessState = {
  currentBusiness: null,
  businesses: [],
  loading: false,
  loaded: false,
};

const businessSlice = createSlice({
  name: 'business',
  initialState,
  reducers: {
    setBusinesses(state, action: PayloadAction<Business[]>) {
      state.businesses = action.payload;
      state.loaded = true;
      // Auto-select if only one, or previously selected
      if (!state.currentBusiness && action.payload.length > 0) {
        const saved = action.payload.find(b => b.id === savedBizId);
        state.currentBusiness = saved || action.payload[0];
      }
    },
    setCurrentBusiness(state, action: PayloadAction<Business>) {
      state.currentBusiness = action.payload;
      localStorage.setItem('bk_business_id', action.payload.id);
    },
    clearBusiness(state) {
      state.currentBusiness = null;
      state.businesses = [];
      localStorage.removeItem('bk_business_id');
    },
    setBusinessLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    updateBusinessLogo(state, action: PayloadAction<{ id: string; logo_url: string }>) {
      const { id, logo_url } = action.payload;
      // Update in businesses array
      const idx = state.businesses.findIndex(b => b.id === id);
      if (idx !== -1) {
        state.businesses[idx] = { ...state.businesses[idx], logo_url };
      }
      // Update currentBusiness if it matches
      if (state.currentBusiness?.id === id) {
        state.currentBusiness = { ...state.currentBusiness, logo_url };
      }
    },
  },
});

export const { setBusinesses, setCurrentBusiness, clearBusiness, setBusinessLoading, updateBusinessLogo } = businessSlice.actions;
export default businessSlice.reducer;
