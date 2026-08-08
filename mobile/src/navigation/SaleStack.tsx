import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import type { SaleStackParamList } from '../types';
import SaleListScreen from '../screens/sales/SaleListScreen';
import SaleDetailScreen from '../screens/sales/SaleDetailScreen';
import SaleCreateScreen from '../screens/sales/SaleCreateScreen';

const Stack = createNativeStackNavigator<SaleStackParamList>();

export default function SaleStack() {
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
        name="SaleList"
        component={SaleListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SaleDetail"
        component={SaleDetailScreen}
        options={{ title: 'Sale Details' }}
      />
      <Stack.Screen
        name="SaleCreate"
        component={SaleCreateScreen}
        options={{ title: 'New Sale' }}
      />
      <Stack.Screen
        name="SaleEdit"
        component={SaleCreateScreen}
        options={{ title: 'Edit Sale' }}
      />
    </Stack.Navigator>
  );
}
