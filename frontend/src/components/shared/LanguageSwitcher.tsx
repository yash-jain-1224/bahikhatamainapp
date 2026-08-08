import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { cn } from '@/utils';

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ||
    SUPPORTED_LANGUAGES[0];

  const switchLanguage = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('bk_lang', code);
    document.cookie = `bk_lang=${code};path=/;max-age=31536000`;
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-lg text-sm font-medium transition-colors',
          compact
            ? 'p-2 hover:bg-muted text-muted-foreground hover:text-foreground'
            : 'px-3 py-2 hover:bg-muted text-muted-foreground hover:text-foreground',
        )}
      >
        <Globe className="h-4 w-4" />
        {!compact && (
          <>
            <span className="hidden sm:inline">{currentLang.nativeName}</span>
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
            />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
            >
              <div className="max-h-80 overflow-y-auto py-2">
                {SUPPORTED_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => switchLanguage(l.code)}
                    className={cn(
                      'w-full px-4 py-2.5 text-left text-sm flex items-center justify-between hover:bg-muted transition-colors',
                      currentLang.code === l.code &&
                        'bg-primary/10 text-primary font-semibold',
                    )}
                  >
                    <span className="font-medium">{l.nativeName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{l.name}</span>
                      {currentLang.code === l.code && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
