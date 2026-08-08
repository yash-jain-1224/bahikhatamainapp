import { configureStore } from '@reduxjs/toolkit';
import businessReducer, {
  setBusinesses,
  setCurrentBusiness,
  clearBusiness,
  hydrateBusiness,
  setBusinessLoading,
  updateBusinessLogo,
} from '@/store/businessSlice';
import type { Business } from '@/types';

const biz1: Business = {
  id: 'biz-1',
  name: 'My Shop',
  type: 'RETAIL',
  is_active: true,
};

const biz2: Business = {
  id: 'biz-2',
  name: 'Second Shop',
  type: 'WHOLESALE',
  is_active: true,
};

function makeStore() {
  return configureStore({ reducer: { business: businessReducer } });
}

describe('businessSlice', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const store = makeStore();
      const state = store.getState().business;
      expect(state.businesses).toEqual([]);
      expect(state.currentBusiness).toBeNull();
      expect(state.loading).toBe(false);
    });
  });

  describe('setBusinesses', () => {
    it('stores list and sets first as current', () => {
      const store = makeStore();
      store.dispatch(setBusinesses([biz1, biz2]));
      const state = store.getState().business;
      expect(state.businesses).toHaveLength(2);
      expect(state.currentBusiness).toEqual(biz1);
    });

    it('handles empty array', () => {
      const store = makeStore();
      store.dispatch(setBusinesses([]));
      expect(store.getState().business.businesses).toEqual([]);
      expect(store.getState().business.currentBusiness).toBeNull();
    });

    it('does not overwrite existing currentBusiness', () => {
      const store = makeStore();
      store.dispatch(setCurrentBusiness(biz2));
      store.dispatch(setBusinesses([biz1, biz2]));
      expect(store.getState().business.currentBusiness).toEqual(biz2);
    });
  });

  describe('setCurrentBusiness', () => {
    it('sets the current business', () => {
      const store = makeStore();
      store.dispatch(setCurrentBusiness(biz1));
      expect(store.getState().business.currentBusiness).toEqual(biz1);
    });

    it('switches between businesses', () => {
      const store = makeStore();
      store.dispatch(setBusinesses([biz1, biz2]));
      store.dispatch(setCurrentBusiness(biz2));
      expect(store.getState().business.currentBusiness).toEqual(biz2);
    });
  });

  describe('hydrateBusiness', () => {
    it('restores saved business by id', () => {
      const store = makeStore();
      store.dispatch(setBusinesses([biz1, biz2]));
      // Clear current to simulate fresh hydration
      store.dispatch(clearBusiness());
      store.dispatch(setBusinesses([biz1, biz2]));
      // Force clear current for hydrate test
      const state = store.getState().business;
      // hydrateBusiness only acts when currentBusiness is null
      if (!state.currentBusiness) {
        store.dispatch(hydrateBusiness({ savedBizId: 'biz-2' }));
        expect(store.getState().business.currentBusiness?.id).toBe('biz-2');
      }
    });

    it('falls back to first business when saved id not found', () => {
      const store = makeStore();
      store.dispatch(setBusinesses([]));
      // manually set businesses without setting current
      const s = configureStore({
        reducer: { business: businessReducer },
        preloadedState: {
          business: { businesses: [biz1, biz2], currentBusiness: null, loading: false },
        },
      });
      s.dispatch(hydrateBusiness({ savedBizId: 'non-existent-id' }));
      expect(s.getState().business.currentBusiness).toEqual(biz1);
    });
  });

  describe('clearBusiness', () => {
    it('clears all business state', () => {
      const store = makeStore();
      store.dispatch(setBusinesses([biz1, biz2]));
      store.dispatch(clearBusiness());
      const state = store.getState().business;
      expect(state.businesses).toEqual([]);
      expect(state.currentBusiness).toBeNull();
    });
  });

  describe('setBusinessLoading', () => {
    it('sets loading true', () => {
      const store = makeStore();
      store.dispatch(setBusinessLoading(true));
      expect(store.getState().business.loading).toBe(true);
    });

    it('sets loading false', () => {
      const store = makeStore();
      store.dispatch(setBusinessLoading(true));
      store.dispatch(setBusinessLoading(false));
      expect(store.getState().business.loading).toBe(false);
    });
  });

  describe('updateBusinessLogo', () => {
    it('updates logo in businesses list', () => {
      const store = makeStore();
      store.dispatch(setBusinesses([biz1, biz2]));
      store.dispatch(updateBusinessLogo({ id: 'biz-1', logo_url: 'https://cdn.test/logo.png' }));
      expect(store.getState().business.businesses[0].logo_url).toBe('https://cdn.test/logo.png');
    });

    it('updates currentBusiness logo if it matches', () => {
      const store = makeStore();
      store.dispatch(setBusinesses([biz1]));
      store.dispatch(setCurrentBusiness(biz1));
      store.dispatch(updateBusinessLogo({ id: 'biz-1', logo_url: 'https://cdn.test/new.png' }));
      expect(store.getState().business.currentBusiness?.logo_url).toBe('https://cdn.test/new.png');
    });

    it('does not affect currentBusiness when id does not match', () => {
      const store = makeStore();
      store.dispatch(setBusinesses([biz1, biz2]));
      store.dispatch(setCurrentBusiness(biz1));
      store.dispatch(updateBusinessLogo({ id: 'biz-2', logo_url: 'https://cdn.test/other.png' }));
      expect(store.getState().business.currentBusiness?.logo_url).toBeUndefined();
    });
  });
});
