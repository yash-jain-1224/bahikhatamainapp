import { Platform } from 'react-native';

// Try to use react-native-haptic-feedback if available, fallback to Vibration
let HapticFeedback: any = null;

try {
  HapticFeedback = require('react-native-haptic-feedback').default;
} catch {
  // react-native-haptic-feedback not installed
}

type HapticType = 
  | 'selection'
  | 'impactLight'
  | 'impactMedium'
  | 'impactHeavy'
  | 'notificationSuccess'
  | 'notificationWarning'
  | 'notificationError';

const hapticTypeMap: Record<HapticType, string> = {
  selection: 'selection',
  impactLight: 'impactLight',
  impactMedium: 'impactMedium',
  impactHeavy: 'impactHeavy',
  notificationSuccess: 'notificationSuccess',
  notificationWarning: 'notificationWarning',
  notificationError: 'notificationError',
};

export function triggerHaptic(type: HapticType = 'selection') {
  if (HapticFeedback && Platform.OS === 'ios') {
    try {
      HapticFeedback.trigger(hapticTypeMap[type], {
        enableVibrateFallback: true,
        ignoreAndroidSystemSettings: false,
      });
    } catch {
      // Silently fail
    }
  } else if (Platform.OS === 'android') {
    // Use Vibration API as fallback for Android
    try {
      const { Vibration } = require('react-native');
      const durations: Record<HapticType, number> = {
        selection: 10,
        impactLight: 20,
        impactMedium: 40,
        impactHeavy: 60,
        notificationSuccess: 30,
        notificationWarning: 50,
        notificationError: 80,
      };
      Vibration.vibrate(durations[type]);
    } catch {
      // Silently fail
    }
  }
}

// Convenience functions
export const haptic = {
  selection: () => triggerHaptic('selection'),
  light: () => triggerHaptic('impactLight'),
  medium: () => triggerHaptic('impactMedium'),
  heavy: () => triggerHaptic('impactHeavy'),
  success: () => triggerHaptic('notificationSuccess'),
  warning: () => triggerHaptic('notificationWarning'),
  error: () => triggerHaptic('notificationError'),
};

export default haptic;
