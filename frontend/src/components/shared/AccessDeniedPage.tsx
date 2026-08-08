import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ShieldOff, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui';

export default function AccessDeniedPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        <div className="h-20 w-20 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-6">
          <ShieldOff className="h-10 w-10 text-red-500" />
        </div>
        <h1 className="text-5xl font-bold text-red-500 mb-4">403</h1>
        <h2 className="text-xl font-semibold mb-2">{t('access_denied')}</h2>
        <p className="text-muted-foreground mb-8">
          {t('access_denied_desc')}
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> {t('go_back')}
          </Button>
          <Button onClick={() => navigate('/dashboard')}>
            <Home className="h-4 w-4 mr-2" /> {t('dashboard')}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
