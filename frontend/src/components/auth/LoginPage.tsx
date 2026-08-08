import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, ArrowRight, BookOpen, Shield, Zap, BarChart3, Code2, Sun, Moon, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { authApi } from '@/lib/api';
import { useAppDispatch } from '@/hooks';
import { setCredentials, setLoading, setTrialInfo } from '@/store/authSlice';
import { setBusinesses } from '@/store/businessSlice';
import { useTheme } from '@/hooks/useTheme';
import { isDevMode, DEV_USER, DEV_BUSINESSES, DEV_TOKEN, DEV_REFRESH_TOKEN } from '@/lib/mock-data';
import toast from 'react-hot-toast';

type AuthMethod = 'phone' | 'email';
type EmailStep = 'login' | 'register';

export default function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  // Auth method toggle
  const [authMethod, setAuthMethod] = useState<AuthMethod>('email');

  // Phone/OTP state
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  // Email/Password state
  const [emailStep, setEmailStep] = useState<EmailStep>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notFoundHint, setNotFoundHint] = useState<string | null>(null); // shown on register after redirect

  const [loading, setLocalLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { resolvedTheme, toggleTheme } = useTheme();

  const handleDevLogin = () => {
    dispatch(setCredentials({
      user: DEV_USER,
      accessToken: DEV_TOKEN,
      refreshToken: DEV_REFRESH_TOKEN,
    }));
    dispatch(setBusinesses(DEV_BUSINESSES));
    dispatch(setLoading(false));
    toast.success(t('auth:dev_login_toast'));
    navigate('/dashboard');
  };

  // ─── Phone/OTP handlers ───────────────────────────────
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length < 10) return toast.error(t('auth:invalid_phone'));
    try {
      setLocalLoading(true);
      await authApi.sendOtp(phone);
      toast.success(t('auth:otp_sent'));
      setStep('otp');
    } catch (err: any) {
      const code = err.response?.data?.code;
      const message = err.response?.data?.message || 'Failed to send OTP';
      if (code === 'USER_NOT_FOUND') {
        toast.error(t('auth:no_account_phone'));
        // Switch to email/register tab, pre-fill the phone
        setAuthMethod('email');
        setEmailStep('register');
        setRegisterPhone(phone);
        setNotFoundHint(t('auth:no_account_found_for_phone', { phone }));
      } else {
        toast.error(message);
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return toast.error(t('auth:invalid_otp'));
    try {
      setLocalLoading(true);
      dispatch(setLoading(true));
      const { data } = await authApi.verifyOtp(phone, otp);
      dispatch(setCredentials(data.data));
      if (data.data.businesses?.length) {
        dispatch(setBusinesses(data.data.businesses));
      }
      if (data.data.trial) {
        dispatch(setTrialInfo(data.data.trial));
      }
      dispatch(setLoading(false));
      if (data.data.trial?.expired && !data.data.user?.is_super_admin) {
        toast.error(t('auth:trial_expired_message'));
        navigate('/subscription');
      } else if (!data.data.businesses || data.data.businesses.length === 0) {
        toast.success(t('auth:create_business_message'));
        navigate('/business/new');
      } else {
        toast.success(t('auth:welcome_message'));
        if (data.data.user?.is_super_admin) {
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('auth:invalid_otp_message'));
      dispatch(setLoading(false));
    } finally {
      setLocalLoading(false);
    }
  };

  // ─── Email/Password handlers ──────────────────────────
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error(t('auth:invalid_email'));
    if (password.length < 6) return toast.error(t('auth:invalid_password'));
    try {
      setLocalLoading(true);
      dispatch(setLoading(true));
      const { data } = await authApi.login(email.trim(), password);
      if (!data.success) {
        const code = data.code;      if (code === 'USER_NOT_FOUND') {
        toast.error(t('auth:no_account_email'));
        setEmailStep('register');
        setNotFoundHint(t('auth:no_account_found_for_email', { email: email.trim() }));
        // Keep email pre-filled
      } else {
        toast.error(data.message || t('auth:login_failed'));
      }
        dispatch(setLoading(false));
        return;
      }
      dispatch(setCredentials(data.data));
      if (data.data.businesses?.length) {
        dispatch(setBusinesses(data.data.businesses));
      }
      if (data.data.trial) {
        dispatch(setTrialInfo(data.data.trial));
      }
      dispatch(setLoading(false));
      if (data.data.trial?.expired && !data.data.user?.is_super_admin) {
        toast.error(t('auth:trial_expired_message'));
        navigate('/subscription');
      } else if (!data.data.businesses || data.data.businesses.length === 0) {
        toast.success(t('auth:create_business_message'));
        navigate('/business/new');
      } else {
        toast.success(t('auth:welcome_message'));
        if (data.data.user?.is_super_admin) {
          navigate('/admin');
        } else {
          navigate('/dashboard');
        }
      }
    } catch (err: any) {
      const code = err.response?.data?.code;
      const message = err.response?.data?.message || t('auth:invalid_email_or_password');
      if (code === 'USER_NOT_FOUND') {
        toast.error(t('auth:no_account_email'));
        setEmailStep('register');
        setNotFoundHint(t('auth:no_account_found_for_email', { email: email.trim() }));
        // Keep email pre-filled
      } else {
        toast.error(message);
      }
      dispatch(setLoading(false));
    } finally {
      setLocalLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerName.trim()) return toast.error(t('auth:invalid_name'));
    if (!email.trim()) return toast.error(t('auth:invalid_email'));
    if (password.length < 6) return toast.error(t('auth:invalid_password'));
    if (registerPhone.length !== 10) return toast.error(t('auth:invalid_phone_register'));
    try {
      setLocalLoading(true);
      dispatch(setLoading(true));
      const { data } = await authApi.register({
        name: registerName.trim(),
        email: email.trim(),
        password,
        phone: registerPhone,
      });
      if (!data.success) {
        toast.error(data.message || t('auth:registration_failed'));
        dispatch(setLoading(false));
        return;
      }
      dispatch(setCredentials(data.data));
      if (data.data.trial) {
        dispatch(setTrialInfo(data.data.trial));
      }
      dispatch(setLoading(false));
      toast.success(t('auth:account_created'));
      // New user has no business yet — send to business creation
      navigate('/business/new');
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('auth:registration_failed'));
      dispatch(setLoading(false));
    } finally {
      setLocalLoading(false);
    }
  };

  const features = [
    { icon: BookOpen, title: t('auth:feature_manage'), desc: t('auth:feature_manage_desc') },
    { icon: BarChart3, title: t('auth:feature_reports'), desc: t('auth:feature_reports_desc') },
    { icon: Zap, title: t('auth:feature_fast'), desc: t('auth:feature_fast_desc') },
    { icon: Shield, title: t('auth:feature_secure'), desc: t('auth:feature_secure_desc') },
  ];

  return (
    <div className="h-dvh flex relative overflow-hidden">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 z-50 h-10 w-10 rounded-full bg-muted/80 backdrop-blur-sm flex items-center justify-center hover:bg-muted transition-colors"
        aria-label="Toggle theme"
      >
        {resolvedTheme === 'dark' ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5 text-indigo-500" />}
      </button>

      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary p-12 flex-col justify-between overflow-y-auto">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Bahi Khata Pro</h1>
              <p className="text-white/70 text-sm">{t('auth:branding_tagline')}</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
            Run your business<br />like a <span className="text-yellow-300">Pro</span>
          </h2>
          <p className="text-lg text-white/80 mb-8">
            {t('auth:branding_description')}
          </p>
          <div className="grid grid-cols-2 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white/10 backdrop-blur-sm rounded-xl p-4"
              >
                <f.icon className="h-8 w-8 text-white mb-2" />
                <h3 className="text-white font-semibold">{f.title}</h3>
                <p className="text-white/60 text-sm">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
        <p className="text-white/40 text-sm">{t('auth:trusted_by')}</p>
      </div>

      {/* Right - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">Bahi Khata Pro</span>
          </div>

          <h2 className="text-2xl font-bold mb-2">
            {authMethod === 'phone'
              ? step === 'phone' ? t('auth:login_title') : t('auth:verify_otp_title')
              : emailStep === 'login' ? t('auth:login_title') : t('auth:register_title')}
          </h2>
          <p className="text-muted-foreground mb-6">
            {authMethod === 'phone'
              ? step === 'phone' ? t('auth:login_subtitle') : t('auth:otp_sent_to', { phone })
              : emailStep === 'login' ? t('auth:login_subtitle') : t('auth:register_subtitle')}
          </p>

          {/* Auth Method Toggle */}
          <div className="flex rounded-lg bg-muted p-1 mb-6">
            <button
              onClick={() => { setAuthMethod('email'); setStep('phone'); setNotFoundHint(null); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                authMethod === 'email' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Mail className="h-4 w-4" /> {t('auth:email_tab')}
            </button>
            <button
              onClick={() => { setAuthMethod('phone'); setEmailStep('login'); setNotFoundHint(null); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${
                authMethod === 'phone' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Phone className="h-4 w-4" /> {t('auth:phone_tab')}
            </button>
          </div>

          {/* ── Email/Password Auth ── */}
          {authMethod === 'email' && emailStep === 'login' && (
            <motion.form
              key="email-login"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={handleEmailLogin}
              className="space-y-4"
            >
              <div>
                <label className="text-sm font-medium mb-2 block">{t('auth:email_label')}</label>
                <Input
                  icon={<Mail className="h-4 w-4" />}
                  type="email"
                  placeholder={t('auth:email_placeholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t('auth:password_label')}</label>
                <div className="relative">
                  <Input
                    icon={<Lock className="h-4 w-4" />}
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth:password_placeholder')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" size="lg" loading={loading}>
                {t('auth:login_button')} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                {t('auth:switch_to_register').split('Register')[0]}
                <button
                  type="button"
                  onClick={() => { setEmailStep('register'); setNotFoundHint(null); }}
                  className="text-primary font-medium hover:underline"
                >
                  {t('auth:register_button')}
                </button>
              </p>
            </motion.form>
          )}

          {authMethod === 'email' && emailStep === 'register' && (
            <motion.form
              key="email-register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={handleRegister}
              className="space-y-4"
            >
              {/* Hint banner shown when redirected from a failed login */}
              {notFoundHint && (
                <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-500">
                  <span className="mt-px shrink-0">⚠️</span>
                  <span>{notFoundHint}</span>
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-2 block">{t('auth:name_label')} *</label>
                <Input
                  icon={<User className="h-4 w-4" />}
                  type="text"
                  placeholder={t('auth:name_placeholder')}
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t('auth:email_label')} *</label>
                <Input
                  icon={<Mail className="h-4 w-4" />}
                  type="email"
                  placeholder={t('auth:email_placeholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t('auth:password_label')} *</label>
                <div className="relative">
                  <Input
                    icon={<Lock className="h-4 w-4" />}
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth:min_6_chars')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{t('auth:phone_label')} *</label>
                <Input
                  icon={<Phone className="h-4 w-4" />}
                  type="tel"
                  placeholder={t('auth:phone_placeholder')}
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                />
              </div>
              <Button type="submit" className="w-full" size="lg" loading={loading}>
                {t('auth:register_button')} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                {t('auth:switch_to_login').split('Sign In')[0]}
                <button
                  type="button"
                  onClick={() => { setEmailStep('login'); setNotFoundHint(null); }}
                  className="text-primary font-medium hover:underline"
                >
                  {t('auth:login_button')}
                </button>
              </p>
            </motion.form>
          )}

          {/* ── Phone/OTP Auth ── */}
          {authMethod === 'phone' && step === 'phone' && (
            <motion.form
              key="phone"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={handleSendOtp}
              className="space-y-4"
            >
              <div>
                <label className="text-sm font-medium mb-2 block">{t('auth:phone_label')}</label>
                <Input
                  icon={<Phone className="h-4 w-4" />}
                  type="tel"
                  placeholder={t('auth:phone_placeholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" size="lg" loading={loading}>
                {t('auth:send_otp')} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </motion.form>
          )}

          {authMethod === 'phone' && step === 'otp' && (
            <motion.form
              key="otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={handleVerifyOtp}
              className="space-y-4"
            >
              <div>
                <label className="text-sm font-medium mb-2 block">{t('auth:otp_label')}</label>
                <Input
                  type="text"
                  placeholder={t('auth:otp_placeholder')}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                />
              </div>
              <Button type="submit" className="w-full" size="lg" loading={loading}>
                {t('auth:verify_otp')} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
              >
                {t('auth:change_number')}
              </button>
            </motion.form>
          )}

          {/* Dev mode: Skip Login */}
          {isDevMode() && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6 pt-4 border-t border-dashed border-amber-500/30"
            >
              <Button
                type="button"
                variant="outline"
                className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                size="lg"
                onClick={handleDevLogin}
              >
                <Code2 className="h-4 w-4 mr-2" />
                {t('auth:dev_login')}
              </Button>
              <p className="text-xs text-amber-500/60 text-center mt-2">
                Development only — bypasses OTP with mock data
              </p>
            </motion.div>
          )}

          <p className="mt-8 text-xs text-muted-foreground text-center">
            {t('auth:terms_notice')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
