import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SectionLoader } from '@/components/shared/loading';
import { purchaseApi } from '@/lib/api';
import type { Purchase } from '@/types';
import PurchaseForm from './PurchaseForm';

export default function PurchaseEditPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation(['purchases']);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    purchaseApi.get(id)
      .then(res => setPurchase(res.data?.data || null))
      .catch(() => setPurchase(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <SectionLoader />;
  if (!purchase) return (
    <div className="text-center py-20 text-muted-foreground">
      {t('purchases:purchase_not_found')}
    </div>
  );

  return <PurchaseForm existingPurchase={purchase} />;
}
