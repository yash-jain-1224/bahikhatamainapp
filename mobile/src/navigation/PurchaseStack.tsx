import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import type { PurchaseStackParamList } from '../types';
import PurchaseListScreen from '../screens/purchase/PurchaseListScreen';
import PurchaseDetailScreen from '../screens/purchase/PurchaseDetailScreen';
import PurchaseCreateScreen from '../screens/purchase/PurchaseCreateScreen';

const Stack = createNativeStackNavigator<PurchaseStackParamList>();

export default function PurchaseStack() {
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
        name="PurchaseList"
        component={PurchaseListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PurchaseDetail"
        component={PurchaseDetailScreen}
        options={{ title: 'Purchase Details' }}
      />
      <Stack.Screen
        name="PurchaseCreate"
        component={PurchaseCreateScreen}
        options={{ title: 'New Purchase' }}
      />
      <Stack.Screen
        name="PurchaseEdit"
        component={PurchaseCreateScreen}
        options={{ title: 'Edit Purchase' }}
      />
    </Stack.Navigator>
  );
}
