import type { User, Business } from '@/types';

/**
 * Mock data used in development mode when VITE_DEV_SKIP_LOGIN is enabled.
 * This allows developers to bypass the OTP login flow and immediately
 * access the app with realistic sample data.
 */

export const DEV_USER: User = {
  id: 'dev-user-001',
  phone: '9999999999',
  name: 'Dev User',
  email: 'dev@bahikhata.pro',
  avatar_url: undefined,
  is_active: true,
  is_super_admin: true,
};

export const DEV_BUSINESS: Business = {
  id: 'dev-biz-001',
  name: 'Dev Mandi Trading Co.',
  type: 'TRADING',
  gst_number: '09AADCD1234F1ZK',
  logo_url: undefined,
  address: '123 Mandi Road, Azadpur',
  city: 'New Delhi',
  state: 'Delhi',
  phone: '9999999999',
  is_active: true,
};

export const DEV_BUSINESSES: Business[] = [
  DEV_BUSINESS,
  {
    id: 'dev-biz-002',
    name: 'Dev Agro Exports',
    type: 'EXPORT',
    gst_number: '07AADCD5678G2ZL',
    logo_url: undefined,
    address: '456 Export House, Gurgaon',
    city: 'Gurgaon',
    state: 'Haryana',
    phone: '9999999998',
    is_active: true,
  },
];

export const DEV_TOKEN = 'dev-mock-token-do-not-use-in-production';
export const DEV_REFRESH_TOKEN = 'dev-mock-refresh-token';

export function isDevMode(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_SKIP_LOGIN === 'true';
}
