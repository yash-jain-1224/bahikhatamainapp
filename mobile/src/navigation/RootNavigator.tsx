import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppDispatch, useAppSelector } from '../hooks';
import { hydrateAuth, setLoading, setUser, setTrialInfo } from '../store/authSlice';
import { setBusinesses, hydrateBusiness } from '../store/businessSlice';
import { useTheme } from '../theme';
import { authApi, businessApi, subscriptionApi } from '../services/api';
import type { RootStackParamList } from '../types';

import AuthNavigator from './AuthNavigator';
import MainTabNavigator from './MainTabNavigator';
import BusinessCreateScreen from '../screens/business/BusinessCreateScreen';
import BusinessListScreen from '../screens/business/BusinessListScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const dispatch = useAppDispatch();
  const { colors } = useTheme();
  const { isAuthenticated, loading: authLoading, token } = useAppSelector((s) => s.auth);
  const { businesses, currentBusiness, loading: businessLoading } = useAppSelector((s) => s.business);
  const [isHydrating, setIsHydrating] = useState(true);
  const [businessesFetched, setBusinessesFetched] = useState(false);

  // Reset businessesFetched when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      setBusinessesFetched(false);
    }
  }, [isAuthenticated]);

  // ── Step 1: Hydrate auth state from AsyncStorage on mount ──
  useEffect(() => {
    const hydrate = async () => {
      try {
        const [storedToken, storedRefreshToken, storedUser, storedTrial] = await AsyncStorage.multiGet([
          'bk_token',
          'bk_refresh_token',
          'bk_user',
          'bk_trial',
        ]);

        const tkn = storedToken[1];
        const rtkn = storedRefreshToken[1];
        const usr = storedUser[1] ? JSON.parse(storedUser[1]) : null;
        const trial = storedTrial[1] ? JSON.parse(storedTrial[1]) : null;

        dispatch(
          hydrateAuth({
            user: usr,
            token: tkn,
            refreshToken: rtkn,
            trialInfo: trial,
          }),
        );
      } catch (err) {
        console.warn('Auth hydration failed:', err);
        dispatch(setLoading(false));
      } finally {
        setIsHydrating(false);
      }
    };
    hydrate();
  }, [dispatch]);

  // ── Step 2: After hydration, if authenticated, fetch user & businesses ──
  useEffect(() => {
    if (isHydrating || !token) return;

    const fetchInitialData = async () => {
      try {
        // Fetch current user profile
        const [userRes, bizRes] = await Promise.all([
          authApi.me(),
          businessApi.list(),
        ]);

        if (userRes.data?.data) {
          dispatch(setUser(userRes.data.data));
        }

        if (bizRes.data?.data) {
          dispatch(setBusinesses(bizRes.data.data));
          // Restore previously selected business
          const savedBizId = await AsyncStorage.getItem('bk_business_id');
          dispatch(hydrateBusiness({ savedBizId }));
        }

        // Fetch trial info
        try {
          const trialRes = await subscriptionApi.current();
          if (trialRes.data?.data) {
            dispatch(setTrialInfo(trialRes.data.data));
          }
        } catch {
          // trial info is optional
        }
      } catch (err) {
        console.warn('Initial data fetch failed:', err);
      } finally {
        setBusinessesFetched(true);
        dispatch(setLoading(false));
      }
    };

    fetchInitialData();
  }, [isHydrating, token, dispatch]);

  // ── Show splash / loading screen while hydrating or fetching businesses ──
  if (isHydrating || authLoading || (isAuthenticated && !businessesFetched)) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={[styles.logoText, { color: colors.primary }]}>📒</Text>
        <Text style={[styles.appName, { color: colors.text }]}>Bahi Khata</Text>
        <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
      </View>
    );
  }

  // ── Determine which flow to show ──
  const needsBusiness = isAuthenticated && businessesFetched && businesses.length === 0;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : needsBusiness ? (
        <Stack.Screen name="BusinessCreate" component={BusinessCreateScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabNavigator} />
          <Stack.Group screenOptions={{ presentation: 'modal', headerShown: true }}>
            <Stack.Screen
              name="BusinessList"
              component={BusinessListScreen}
              options={{
                title: 'Switch Business',
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
              }}
            />
            <Stack.Screen
              name="BusinessCreate"
              component={BusinessCreateScreen}
              options={{
                title: 'Create Business',
                headerStyle: { backgroundColor: colors.surface },
                headerTintColor: colors.text,
              }}
            />
          </Stack.Group>
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 64,
    marginBottom: 12,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
  },
  spinner: {
    marginTop: 8,
  },
});
