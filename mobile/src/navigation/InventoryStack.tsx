import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import type { InventoryStackParamList } from '../types';
import InventoryListScreen from '../screens/inventory/InventoryListScreen';
import InventoryDetailScreen from '../screens/inventory/InventoryDetailScreen';
import InventoryCreateScreen from '../screens/inventory/InventoryCreateScreen';
import StockAdjustScreen from '../screens/inventory/StockAdjustScreen';

const Stack = createNativeStackNavigator<InventoryStackParamList>();

export default function InventoryStack() {
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
        name="InventoryList"
        component={InventoryListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="InventoryDetail"
        component={InventoryDetailScreen}
        options={{ title: 'Item Details' }}
      />
      <Stack.Screen
        name="InventoryCreate"
        component={InventoryCreateScreen}
        options={{ title: 'Add Item' }}
      />
      <Stack.Screen
        name="InventoryEdit"
        component={InventoryCreateScreen}
        options={{ title: 'Edit Item' }}
      />
      <Stack.Screen
        name="StockAdjust"
        component={StockAdjustScreen}
        options={{ title: 'Adjust Stock' }}
      />
    </Stack.Navigator>
  );
}
