/**
 * API service module tests
 * Tests endpoint construction, interceptors, and helper functions
 */

// All jest.mock calls must be hoisted before imports
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: any) => obj.ios },
}));

// Mock the store and axios before importing api
jest.mock('@/store', () => ({
  store: {
    getState: jest.fn(() => ({
      auth: { token: 'mock-token', refreshToken: 'mock-refresh' },
      business: { currentBusiness: { id: 'biz-1' } },
    })),
    dispatch: jest.fn(),
  },
}));

jest.mock('axios', () => {
  const instance = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    request: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: { headers: { common: {} } },
    isCancel: jest.fn(() => false),
  };
  const mockAxios = { ...instance, create: jest.fn(() => instance), default: instance };
  return mockAxios;
});

import {
  authApi,
  businessApi,
  purchaseApi,
  salesApi,
  inventoryApi,
  ledgerApi,
  billingApi,
  profileApi,
  notificationApi,
  subscriptionApi,
  referralApi,
} from '@/services/api';

describe('API service endpoints', () => {
  describe('authApi', () => {
    it('exposes sendOtp, verifyOtp, refreshToken, logout, me', () => {
      expect(typeof authApi.sendOtp).toBe('function');
      expect(typeof authApi.verifyOtp).toBe('function');
      expect(typeof authApi.refreshToken).toBe('function');
      expect(typeof authApi.logout).toBe('function');
      expect(typeof authApi.me).toBe('function');
    });
  });

  describe('businessApi', () => {
    it('exposes CRUD + dashboard + logo methods', () => {
      expect(typeof businessApi.list).toBe('function');
      expect(typeof businessApi.get).toBe('function');
      expect(typeof businessApi.create).toBe('function');
      expect(typeof businessApi.update).toBe('function');
      expect(typeof businessApi.uploadLogo).toBe('function');
      expect(typeof businessApi.removeLogo).toBe('function');
      expect(typeof businessApi.dashboard).toBe('function');
    });
  });

  describe('purchaseApi', () => {
    it('exposes list, get, create, update, delete, dashboard', () => {
      expect(typeof purchaseApi.list).toBe('function');
      expect(typeof purchaseApi.get).toBe('function');
      expect(typeof purchaseApi.create).toBe('function');
      expect(typeof purchaseApi.update).toBe('function');
      expect(typeof purchaseApi.delete).toBe('function');
      expect(typeof purchaseApi.dashboard).toBe('function');
    });
  });

  describe('salesApi', () => {
    it('exposes list, get, create, update, delete, lots', () => {
      expect(typeof salesApi.list).toBe('function');
      expect(typeof salesApi.get).toBe('function');
      expect(typeof salesApi.create).toBe('function');
      expect(typeof salesApi.update).toBe('function');
      expect(typeof salesApi.delete).toBe('function');
      expect(typeof salesApi.lots).toBe('function');
      expect(typeof salesApi.lotDetail).toBe('function');
    });
  });

  describe('inventoryApi', () => {
    it('exposes item CRUD and dashboard', () => {
      expect(typeof inventoryApi.listItems).toBe('function');
      expect(typeof inventoryApi.getItem).toBe('function');
      expect(typeof inventoryApi.createItem).toBe('function');
      expect(typeof inventoryApi.updateItem).toBe('function');
      expect(typeof inventoryApi.lowStock).toBe('function');
      expect(typeof inventoryApi.categories).toBe('function');
      expect(typeof inventoryApi.dashboard).toBe('function');
      expect(typeof inventoryApi.adjustStock).toBe('function');
    });
  });

  describe('ledgerApi', () => {
    it('exposes entries, partyLedger, reports', () => {
      expect(typeof ledgerApi.entries).toBe('function');
      expect(typeof ledgerApi.partyLedger).toBe('function');
      expect(typeof ledgerApi.partyStatement).toBe('function');
      expect(typeof ledgerApi.createEntry).toBe('function');
      expect(typeof ledgerApi.trialBalance).toBe('function');
      expect(typeof ledgerApi.profitLoss).toBe('function');
      expect(typeof ledgerApi.balanceSheet).toBe('function');
      expect(typeof ledgerApi.outstanding).toBe('function');
      expect(typeof ledgerApi.dayBook).toBe('function');
    });
  });

  describe('billingApi', () => {
    it('exposes payments and invoices', () => {
      expect(typeof billingApi.payments).toBe('function');
      expect(typeof billingApi.createPayment).toBe('function');
      expect(typeof billingApi.createBulkPayment).toBe('function');
      expect(typeof billingApi.partyOutstandingBills).toBe('function');
      expect(typeof billingApi.invoices).toBe('function');
    });
  });

  describe('profileApi', () => {
    it('exposes profile and party management', () => {
      expect(typeof profileApi.get).toBe('function');
      expect(typeof profileApi.update).toBe('function');
      expect(typeof profileApi.parties).toBe('function');
      expect(typeof profileApi.getParty).toBe('function');
      expect(typeof profileApi.createParty).toBe('function');
      expect(typeof profileApi.cutters).toBe('function');
    });
  });

  describe('notificationApi', () => {
    it('exposes list, markRead, markAllRead', () => {
      expect(typeof notificationApi.list).toBe('function');
      expect(typeof notificationApi.markRead).toBe('function');
      expect(typeof notificationApi.markAllRead).toBe('function');
      expect(typeof notificationApi.sendReminder).toBe('function');
    });
  });

  describe('subscriptionApi', () => {
    it('exposes plans, current, subscribe, cancel', () => {
      expect(typeof subscriptionApi.plans).toBe('function');
      expect(typeof subscriptionApi.current).toBe('function');
      expect(typeof subscriptionApi.subscribe).toBe('function');
      expect(typeof subscriptionApi.cancel).toBe('function');
    });
  });

  describe('referralApi', () => {
    it('exposes referral methods', () => {
      expect(typeof referralApi.myReferrals).toBe('function');
      expect(typeof referralApi.eligibility).toBe('function');
      expect(typeof referralApi.createCode).toBe('function');
      expect(typeof referralApi.apply).toBe('function');
      expect(typeof referralApi.redeemRewards).toBe('function');
      expect(typeof referralApi.leaderboard).toBe('function');
    });
  });
});
