import { useState, useCallback, useRef } from 'react';

type Errors<T extends string = string> = Partial<Record<T, string>>;

/**
 * Lightweight hook for managing inline field-level form errors.
 *
 * Usage:
 *   const { errors, setError, clearError, clearAll, validate } = useFormErrors<'name' | 'email'>();
 *
 *   // In onChange handlers — clear error when user starts typing
 *   clearError('name');
 *
 *   // In submit handler — validate all at once
 *   const ok = validate({
 *     name:  [!form.name.trim(), 'Name is required'],
 *     email: [!isValidEmail(form.email), 'Enter a valid email'],
 *   });
 *   if (!ok) return;           // errors are now set, fields are highlighted
 */
export function useFormErrors<T extends string = string>() {
  const [errors, setErrors] = useState<Errors<T>>({});
  const errorsRef = useRef<Errors<T>>({});

  const setError = useCallback((field: T, message: string) => {
    setErrors(prev => {
      const next = { ...prev, [field]: message };
      errorsRef.current = next;
      return next;
    });
  }, []);

  const clearError = useCallback((field: T) => {
    setErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      errorsRef.current = next;
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setErrors({});
    errorsRef.current = {};
  }, []);

  /**
   * Validate multiple fields at once.
   * Accepts an object of `{ field: [condition, message] }`.
   * Returns `true` if all validations pass.
   * On failure, sets errors for all failing fields and returns `false`.
   */
  const validate = useCallback((rules: Partial<Record<T, [boolean, string]>>): boolean => {
    const next: Errors<T> = {};
    let valid = true;
    for (const [field, rule] of Object.entries(rules) as [T, [boolean, string]][]) {
      if (rule && rule[0]) {
        next[field] = rule[1];
        valid = false;
      }
    }
    setErrors(next);
    errorsRef.current = next;
    return valid;
  }, []);

  return { errors, setError, clearError, clearAll, validate };
}
