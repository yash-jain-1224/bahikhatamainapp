import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import type { MoreStackParamList } from '../types';
import MoreScreen from '../screens/more/MoreScreen';
import LedgerScreen from '../screens/ledger/LedgerScreen';
import PartyLedgerScreen from '../screens/ledger/PartyLedgerScreen';
import PaymentsScreen from '../screens/payments/PaymentsScreen';
import RecordPaymentScreen from '../screens/payments/RecordPaymentScreen';
import PartiesScreen from '../screens/parties/PartiesScreen';
import PartyDetailScreen from '../screens/parties/PartyDetailScreen';
import PartyCreateScreen from '../screens/parties/PartyCreateScreen';
import CutterDetailScreen from '../screens/parties/CutterDetailScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import DayBookReportScreen from '../screens/reports/DayBookReportScreen';
import TrialBalanceReportScreen from '../screens/reports/TrialBalanceReportScreen';
import ProfitLossReportScreen from '../screens/reports/ProfitLossReportScreen';
import BalanceSheetReportScreen from '../screens/reports/BalanceSheetReportScreen';
import OutstandingReportScreen from '../screens/reports/OutstandingReportScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import SubscriptionScreen from '../screens/subscription/SubscriptionScreen';
import BusinessSettingsScreen from '../screens/business/BusinessSettingsScreen';
import ReferralsScreen from '../screens/referrals/ReferralsScreen';
import HelpScreen from '../screens/help/HelpScreen';

const Stack = createNativeStackNavigator<MoreStackParamList>();

export default function MoreStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="MoreMenu"
        component={MoreScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Ledger" component={LedgerScreen} options={{ title: 'Ledger' }} />
      <Stack.Screen name="PartyLedger" component={PartyLedgerScreen} options={{ title: 'Party Ledger' }} />
      <Stack.Screen name="Payments" component={PaymentsScreen} options={{ title: 'Payments' }} />
      <Stack.Screen name="RecordPayment" component={RecordPaymentScreen} options={{ title: 'Record Payment' }} />
      <Stack.Screen name="Parties" component={PartiesScreen} options={{ title: 'Parties' }} />
      <Stack.Screen name="PartyDetail" component={PartyDetailScreen} options={{ title: 'Party Details' }} />
      <Stack.Screen name="PartyCreate" component={PartyCreateScreen} options={{ title: 'Add Party' }} />
      <Stack.Screen name="PartyEdit" component={PartyCreateScreen} options={{ title: 'Edit Party' }} />
      <Stack.Screen name="CutterDetail" component={CutterDetailScreen} options={{ title: 'Cutter Details' }} />
      <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
      <Stack.Screen name="DayBookReport" component={DayBookReportScreen} options={{ title: 'Day Book' }} />
      <Stack.Screen name="TrialBalanceReport" component={TrialBalanceReportScreen} options={{ title: 'Trial Balance' }} />
      <Stack.Screen name="ProfitLossReport" component={ProfitLossReportScreen} options={{ title: 'Profit & Loss' }} />
      <Stack.Screen name="BalanceSheetReport" component={BalanceSheetReportScreen} options={{ title: 'Balance Sheet' }} />
      <Stack.Screen name="OutstandingReport" component={OutstandingReportScreen} options={{ title: 'Outstanding' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ title: 'Subscription' }} />
      <Stack.Screen name="BusinessSettings" component={BusinessSettingsScreen} options={{ title: 'Business Settings' }} />
      <Stack.Screen name="Referrals" component={ReferralsScreen} options={{ title: 'Referrals' }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ title: 'Help & Support' }} />
    </Stack.Navigator>
  );
}
