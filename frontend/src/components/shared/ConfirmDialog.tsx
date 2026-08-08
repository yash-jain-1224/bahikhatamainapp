import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation('common');
  const resolvedTitle = title || t('are_you_sure');
  const resolvedDesc = description || t('cannot_be_undone');
  const resolvedConfirm = confirmLabel || t('confirm');
  const resolvedCancel = cancelLabel || t('cancel');

  const iconColors: Record<string, string> = {
    danger: 'bg-red-500/10 text-red-400',
    warning: 'bg-amber-500/10 text-amber-400',
    default: 'bg-primary/10 text-primary',
  };
  const btnVariant = variant === 'danger' ? 'destructive' : 'default';

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${iconColors[variant]}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{resolvedTitle}</DialogTitle>
              <DialogDescription className="mt-1">{resolvedDesc}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {resolvedCancel}
          </Button>
          <Button variant={btnVariant as any} onClick={onConfirm} loading={loading}>
            {resolvedConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
