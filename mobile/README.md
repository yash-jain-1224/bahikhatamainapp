# Bahi Khata — React Native Mobile App

A modern, production-ready React Native mobile app for **Bahi Khata** (बही खाता) — a comprehensive business accounting and management platform. Built for both **iOS** (min iOS 15) and **Android** (min Android 10 / API 29).

## 📱 Features

- **Phone OTP Login** — Secure, passwordless authentication
- **Dashboard** — Real-time business stats: purchases, sales, receivables, payables, alerts
- **Purchases** — Full purchase lifecycle: list, detail, create, edit
- **Sales** — Manage sales with lot-based and item-based billing
- **Inventory** — Track items, stock levels, low-stock alerts
- **Parties** — Customer/supplier management with contacts and bank details
- **Ledger** — Double-entry ledger with party-wise statements
- **Payments** — Record and track payments
- **Reports** — Day book, trial balance, profit & loss, balance sheet, outstanding
- **Subscription** — Plan management and trial tracking
- **Referrals** — Invite friends, earn rewards
- **Notifications** — In-app notification center
- **Business Switching** — Multi-business support
- **Dark Mode** — Full dark/light/system theme support
- **Offline-ready architecture** — AsyncStorage persistence for auth and preferences

## 🏗️ Architecture

```
mobile/
├── App.tsx                      # Root component with providers
├── index.js                     # Entry point
├── package.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
└── src/
    ├── navigation/              # React Navigation setup
    │   ├── RootNavigator.tsx    # Auth/Main flow with hydration
    │   ├── AuthNavigator.tsx    # Login stack
    │   ├── MainTabNavigator.tsx # Bottom tabs (Dashboard, Purchase, Sale, Inventory, More)
    │   ├── DashboardStack.tsx   # Dashboard + Notifications
    │   ├── PurchaseStack.tsx    # Purchase CRUD
    │   ├── SaleStack.tsx        # Sale CRUD
    │   ├── InventoryStack.tsx   # Inventory CRUD
    │   └── MoreStack.tsx        # All secondary screens
    ├── screens/                 # Screen components (one per route)
    │   ├── auth/                # LoginScreen
    │   ├── dashboard/           # DashboardScreen
    │   ├── purchase/            # PurchaseList, PurchaseDetail
    │   ├── sales/               # SaleList, SaleDetail
    │   ├── inventory/           # InventoryList, InventoryDetail
    │   ├── parties/             # Parties, PartyDetail, CutterDetail
    │   ├── ledger/              # Ledger, PartyLedger
    │   ├── payments/            # Payments
    │   ├── more/                # MoreScreen (menu hub)
    │   ├── profile/             # Profile editing
    │   ├── business/            # BusinessCreate, BusinessList, BusinessSettings
    │   ├── subscription/        # Plan management
    │   ├── referrals/           # Referral dashboard
    │   ├── reports/             # Report types
    │   ├── notifications/       # Notification list
    │   └── help/                # FAQ and support
    ├── components/
    │   └── shared/              # Reusable UI components
    │       ├── Avatar.tsx
    │       ├── Button.tsx
    │       ├── EmptyState.tsx
    │       ├── Input.tsx
    │       ├── ListCard.tsx
    │       ├── Loading.tsx
    │       ├── SearchBar.tsx
    │       ├── StatCard.tsx
    │       ├── StatusBadge.tsx
    │       └── Toast.tsx
    ├── hooks/                   # Custom hooks
    │   ├── useRedux.ts          # Typed useSelector/useDispatch
    │   └── useApi.ts            # API call & pagination hooks
    ├── services/
    │   └── api.ts               # Axios instance + all API modules
    ├── store/                   # Redux Toolkit
    │   ├── index.ts
    │   ├── authSlice.ts
    │   └── businessSlice.ts
    ├── theme/                   # Theming system
    │   ├── colors.ts            # Design tokens (colors, spacing, typography)
    │   └── ThemeContext.tsx      # Theme provider with dark mode
    ├── types/
    │   └── index.ts             # All TypeScript types & navigation params
    └── utils/
        └── index.ts             # Utility functions (formatCurrency, formatDate, etc.)
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Watchman** (recommended for macOS): `brew install watchman`
- **Xcode** ≥ 15 (for iOS development)
- **Android Studio** with SDK 29+ (for Android development)
- **CocoaPods** (for iOS): `gem install cocoapods`

### Installation

```bash
# Navigate to the mobile directory
cd mobile

# Install JavaScript dependencies
npm install

# Install iOS native dependencies
cd ios && pod install && cd ..
```

### Running the App

```bash
# Start Metro bundler
npm start

# Run on iOS Simulator
npm run ios

# Run on Android Emulator
npm run android
```

### Backend Connection

The app automatically connects to:
- **Android Emulator**: `http://10.0.2.2:4000/api/v1`
- **iOS Simulator**: `http://localhost:4000/api/v1`
- **Production**: `https://api.bahikhata.app/api/v1`

Make sure the backend is running locally (see root project's `start-dev.sh`).

## 🎨 Design System

### Theme
- **Light mode**: Clean white/slate palette with Indigo-500 accent
- **Dark mode**: Deep slate palette with Indigo-400 accent
- **System mode**: Follows device preference

### Typography
| Token    | Size |
|----------|------|
| `xs`     | 11   |
| `sm`     | 13   |
| `md`     | 15   |
| `lg`     | 17   |
| `xl`     | 20   |
| `xxl`    | 24   |
| `xxxl`   | 30   |
| `display`| 36   |

### Spacing
| Token   | Value |
|---------|-------|
| `xs`    | 4     |
| `sm`    | 8     |
| `md`    | 12    |
| `lg`    | 16    |
| `xl`    | 20    |
| `xxl`   | 24    |
| `xxxl`  | 32    |
| `xxxxl` | 40    |

## 📦 Key Dependencies

| Package | Purpose |
|---------|---------|
| `react-native` | Core framework |
| `@react-navigation/native` | Navigation |
| `@react-navigation/native-stack` | Stack navigator |
| `@react-navigation/bottom-tabs` | Tab navigator |
| `@reduxjs/toolkit` + `react-redux` | State management |
| `@react-native-async-storage/async-storage` | Persistent storage |
| `axios` | HTTP client |
| `react-native-gesture-handler` | Gesture support |
| `react-native-reanimated` | Animations |
| `react-native-safe-area-context` | Safe area handling |
| `react-native-screens` | Native screen containers |
| `react-native-svg` | SVG rendering |
| `zod` | Schema validation |

## 🔑 State Management

- **Redux Toolkit** for global state (auth, business selection)
- **AsyncStorage** for persistence (tokens, theme, business ID)
- **Local component state** for screen-specific data
- **Auto-hydration** on app launch restores user session

## 🔒 Authentication Flow

1. User enters phone number → OTP sent via API
2. User enters OTP → API returns access + refresh tokens
3. Tokens stored in AsyncStorage + Redux
4. API interceptor auto-attaches token to all requests
5. On 401 → silent token refresh with queue for concurrent requests
6. On refresh failure → auto-logout

## 🧪 Testing

```bash
npm test
```

## 📝 Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start Metro bundler |
| `npm run ios` | Run on iOS |
| `npm run android` | Run on Android |
| `npm test` | Run tests |
| `npm run lint` | Run ESLint |
| `npm run clean` | Clean native builds |
| `npm run pod-install` | Install iOS CocoaPods |
| `npm run reset-cache` | Reset Metro cache |

## 📋 Navigation Structure

```
RootNavigator
├── AuthNavigator (when not authenticated)
│   └── LoginScreen
├── BusinessCreateScreen (when authenticated but no business)
└── MainTabNavigator (when authenticated with business)
    ├── DashboardTab
    │   ├── Dashboard
    │   └── Notifications
    ├── PurchasesTab
    │   ├── PurchaseList
    │   ├── PurchaseDetail
    │   ├── PurchaseCreate
    │   └── PurchaseEdit
    ├── SalesTab
    │   ├── SaleList
    │   ├── SaleDetail
    │   ├── SaleCreate
    │   └── SaleEdit
    ├── InventoryTab
    │   ├── InventoryList
    │   ├── InventoryDetail
    │   ├── InventoryCreate
    │   └── StockAdjust
    └── MoreTab
        ├── MoreMenu
        ├── Ledger
        ├── PartyLedger
        ├── Payments
        ├── Parties
        ├── PartyDetail
        ├── CutterDetail
        ├── Reports
        ├── Profile
        ├── Subscription
        ├── BusinessSettings
        ├── Referrals
        └── Help
    + Modals: BusinessList, BusinessCreate
```
