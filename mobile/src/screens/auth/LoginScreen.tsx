import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../theme';
import { FontSize, Spacing, BorderRadius, Shadow } from '../../theme/colors';
import { Button, Input } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { authApi } from '../../services/api';
import { useAppDispatch } from '../../hooks';
import { setCredentials, setTrialInfo } from '../../store/authSlice';
import { setBusinesses } from '../../store/businessSlice';
import { businessApi } from '../../services/api';

const { width } = Dimensions.get('window');

type AuthMethod = 'email' | 'phone';
type EmailStep = 'login' | 'register';
type PhoneStep = 'phone' | 'otp';

export default function LoginScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const dispatch = useAppDispatch();

  // Auth method toggle
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');

  // Phone/OTP state
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // Email/Password state
  const [emailStep, setEmailStep] = useState<EmailStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, []);

  // OTP countdown timer
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // ─── Helper: Fetch businesses after login ───────────────
  const fetchBusinessesAfterLogin = async (): Promise<boolean> => {
    try {
      const bizRes = await businessApi.list();
      if (bizRes.data?.data && bizRes.data.data.length > 0) {
        dispatch(setBusinesses(bizRes.data.data));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // ─── Phone/OTP handlers ─────────────────────────────────
  const handleSendOtp = async () => {
    if (phone.length < 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }
    try {
      setLoading(true);
      await authApi.sendOtp(phone);
      setPhoneStep('otp');
      setTimer(30);
      toast.success('OTP sent successfully!');
    } catch (err: any) {
      const code = err.response?.data?.code;
      const message = err.response?.data?.message || 'Failed to send OTP';
      if (code === 'USER_NOT_FOUND') {
        toast.error('No account found with this phone. Please register first.');
        setAuthMethod('email');
        setEmailStep('register');
        setRegisterPhone(phone);
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      toast.error('Please enter the OTP');
      return;
    }
    try {
      setLoading(true);
      const res = await authApi.verifyOtp(phone, otp);
      const { user, accessToken, refreshToken, trial, businesses: otpBusinesses } = res.data?.data || {};

      if (user && accessToken && refreshToken) {
        if (trial) dispatch(setTrialInfo(trial));
        if (otpBusinesses?.length) {
          dispatch(setBusinesses(otpBusinesses));
        }
        // Dispatch credentials - RootNavigator will fetch businesses if needed
        dispatch(setCredentials({ user, accessToken, refreshToken, trial }));
        toast.success('Welcome to Bahi Khata!');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = () => {
    if (timer > 0) return;
    handleSendOtp();
  };

  // ─── Email/Password handlers ────────────────────────────
  const handleEmailLogin = async () => {
    if (!email.trim()) {
      toast.error('Please enter your email');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    try {
      setLoading(true);
      const res = await authApi.login(email.trim(), password);
      const { user, accessToken, refreshToken, trial, businesses: loginBusinesses } = res.data?.data || {};

      if (user && accessToken && refreshToken) {
        // Set trial info first
        if (trial) dispatch(setTrialInfo(trial));
        
        // If login response includes businesses, use them
        if (loginBusinesses?.length) {
          dispatch(setBusinesses(loginBusinesses));
        }
        
        // Dispatch credentials - RootNavigator will handle fetching businesses if needed
        dispatch(setCredentials({ user, accessToken, refreshToken, trial }));
        toast.success('Welcome to Bahi Khata!');
      }
    } catch (err: any) {
      const code = err.response?.data?.code;
      const message = err.response?.data?.message || 'Invalid email or password';
      if (code === 'USER_NOT_FOUND') {
        toast.error('No account found with this email. Please register.');
        setEmailStep('register');
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerName.trim()) {
      toast.error('Please enter your name');
      return;
    }
    if (!email.trim()) {
      toast.error('Please enter your email');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (registerPhone.length !== 10) {
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }
    try {
      setLoading(true);
      const res = await authApi.register({
        name: registerName.trim(),
        email: email.trim(),
        password,
        phone: registerPhone,
      });
      const { user, accessToken, refreshToken, trial } = res.data?.data || {};

      if (user && accessToken && refreshToken) {
        dispatch(setCredentials({ user, accessToken, refreshToken, trial }));
        if (trial) dispatch(setTrialInfo(trial));
        toast.success('Account created! Welcome to Bahi Khata!');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  // ─── Get title and subtitle ─────────────────────────────
  const getTitle = () => {
    if (authMethod === 'phone') {
      return phoneStep === 'phone' ? 'Sign In' : 'Verify OTP';
    }
    return emailStep === 'login' ? 'Sign In' : 'Create Account';
  };

  const getSubtitle = () => {
    if (authMethod === 'phone') {
      return phoneStep === 'phone'
        ? 'Enter your phone number to continue'
        : `Enter the OTP sent to +91 ${phone}`;
    }
    return emailStep === 'login'
      ? 'Enter your email and password'
      : 'Fill in your details to get started';
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo & Branding */}
        <Animated.View
          style={[
            styles.logoSection,
            {
              opacity: fadeAnim,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <View
            style={[
              styles.logoCircle,
              { backgroundColor: colors.primary + '15' },
            ]}
          >
            <Text style={[styles.logoText, { color: colors.primary }]}>₹</Text>
          </View>
          <Text style={[styles.appName, { color: colors.text }]}>
            Bahi Khata
          </Text>
          <Text style={[styles.appTagline, { color: colors.textSecondary }]}>
            Smart Business Accounting
          </Text>
        </Animated.View>

        {/* Form Card */}
        <Animated.View
          style={[
            styles.formCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              ...Shadow.lg,
            },
          ]}
        >
          <Text style={[styles.formTitle, { color: colors.text }]}>
            {getTitle()}
          </Text>
          <Text style={[styles.formSubtitle, { color: colors.textSecondary }]}>
            {getSubtitle()}
          </Text>

          {/* Auth Method Toggle */}
          <View style={[styles.authToggle, { backgroundColor: colors.surfaceSecondary }]}>
            <TouchableOpacity
              style={[
                styles.authToggleBtn,
                authMethod === 'email' && { backgroundColor: colors.card },
              ]}
              onPress={() => {
                setAuthMethod('email');
                setPhoneStep('phone');
              }}
            >
              <Text
                style={[
                  styles.authToggleText,
                  { color: authMethod === 'email' ? colors.text : colors.textSecondary },
                ]}
              >
                Email
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.authToggleBtn,
                authMethod === 'phone' && { backgroundColor: colors.card },
              ]}
              onPress={() => {
                setAuthMethod('phone');
                setEmailStep('login');
              }}
            >
              <Text
                style={[
                  styles.authToggleText,
                  { color: authMethod === 'phone' ? colors.text : colors.textSecondary },
                ]}
              >
                Phone
              </Text>
            </TouchableOpacity>
          </View>

          {/* ─── Email Auth ─── */}
          {authMethod === 'email' && emailStep === 'login' && (
            <>
              <Input
                label="Email"
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Input
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <Button
                title="Sign In"
                onPress={handleEmailLogin}
                loading={loading}
                disabled={!email.trim() || password.length < 6}
                fullWidth
                size="lg"
              />
              <View style={styles.switchRow}>
                <Text style={{ color: colors.textSecondary, fontSize: FontSize.sm }}>
                  Don't have an account?{' '}
                </Text>
                <TouchableOpacity onPress={() => setEmailStep('register')}>
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: FontSize.sm }}>
                    Register
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {authMethod === 'email' && emailStep === 'register' && (
            <>
              <Input
                label="Full Name"
                placeholder="Enter your name"
                value={registerName}
                onChangeText={setRegisterName}
                autoCapitalize="words"
              />
              <Input
                label="Email"
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Input
                label="Password"
                placeholder="Create a password (min 6 characters)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <Input
                label="Phone Number"
                placeholder="Enter 10-digit number"
                value={registerPhone}
                onChangeText={(text) => setRegisterPhone(text.replace(/[^0-9]/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
                leftIcon={
                  <Text style={{ color: colors.textSecondary, fontSize: FontSize.md }}>+91</Text>
                }
              />
              <Button
                title="Create Account"
                onPress={handleRegister}
                loading={loading}
                disabled={!registerName.trim() || !email.trim() || password.length < 6 || registerPhone.length !== 10}
                fullWidth
                size="lg"
              />
              <View style={styles.switchRow}>
                <Text style={{ color: colors.textSecondary, fontSize: FontSize.sm }}>
                  Already have an account?{' '}
                </Text>
                <TouchableOpacity onPress={() => setEmailStep('login')}>
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: FontSize.sm }}>
                    Sign In
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ─── Phone/OTP Auth ─── */}
          {authMethod === 'phone' && phoneStep === 'phone' && (
            <>
              <Input
                label="Phone Number"
                placeholder="Enter 10-digit number"
                value={phone}
                onChangeText={(text) => setPhone(text.replace(/[^0-9]/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                maxLength={10}
                leftIcon={
                  <Text style={{ color: colors.textSecondary, fontSize: FontSize.md }}>+91</Text>
                }
              />
              <Button
                title="Send OTP"
                onPress={handleSendOtp}
                loading={loading}
                disabled={phone.length < 10}
                fullWidth
                size="lg"
              />
            </>
          )}

          {authMethod === 'phone' && phoneStep === 'otp' && (
            <>
              <Input
                label="OTP"
                placeholder="Enter OTP"
                value={otp}
                onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Button
                title="Verify & Sign In"
                onPress={handleVerifyOtp}
                loading={loading}
                disabled={otp.length < 4}
                fullWidth
                size="lg"
              />
              <View style={styles.resendRow}>
                <Text style={{ color: colors.textSecondary, fontSize: FontSize.sm }}>
                  Didn't receive OTP?{' '}
                </Text>
                <TouchableOpacity onPress={handleResendOtp} disabled={timer > 0}>
                  <Text
                    style={{
                      color: timer > 0 ? colors.textTertiary : colors.primary,
                      fontWeight: '600',
                      fontSize: FontSize.sm,
                    }}
                  >
                    {timer > 0 ? `Resend in ${timer}s` : 'Resend'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setPhoneStep('phone');
                  setOtp('');
                }}
                style={styles.changeNumber}
              >
                <Text style={{ color: colors.primary, fontSize: FontSize.sm, fontWeight: '500' }}>
                  ← Change Phone Number
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '700',
  },
  appName: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  appTagline: {
    fontSize: FontSize.md,
  },
  formCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    borderWidth: 1,
  },
  formTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  formSubtitle: {
    fontSize: FontSize.sm,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  authToggle: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.xl,
  },
  authToggleBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  authToggleText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  changeNumber: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
});
