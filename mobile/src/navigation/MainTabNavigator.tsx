import React from 'react';
import { Platform, StyleSheet, View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { FontSize, Spacing } from '../theme/colors';
import type { MainTabParamList } from '../types';
import DashboardStack from './DashboardStack';
import PurchaseStack from './PurchaseStack';
import SaleStack from './SaleStack';
import InventoryStack from './InventoryStack';
import MoreStack from './MoreStack';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Simple emoji-based tab icons (can be replaced with react-native-vector-icons)
function TabIcon({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  const icons: Record<string, string> = {
    DashboardTab: '📊',
    PurchasesTab: '🛒',
    SalesTab: '💵',
    InventoryTab: '📦',
    MoreTab: '☰',
  };

  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, { opacity: focused ? 1 : 0.5 }]}>
        {icons[label] || '•'}
      </Text>
    </View>
  );
}

export default function MainTabNavigator() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }: { route: { name: string } }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => (
          <TabIcon label={route.name} focused={focused} color={color} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: Spacing.sm,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : Spacing.sm,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarHideOnKeyboard: true,
      })}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardStack}
        options={{ tabBarLabel: 'Dashboard' }}
      />
      <Tab.Screen
        name="PurchasesTab"
        component={PurchaseStack}
        options={{ tabBarLabel: 'Purchases' }}
      />
      <Tab.Screen
        name="SalesTab"
        component={SaleStack}
        options={{ tabBarLabel: 'Sales' }}
      />
      <Tab.Screen
        name="InventoryTab"
        component={InventoryStack}
        options={{ tabBarLabel: 'Inventory' }}
      />
      <Tab.Screen
        name="MoreTab"
        component={MoreStack}
        options={{ tabBarLabel: 'More' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  tabIcon: {
    fontSize: 20,
  },
});
