import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Trash2, ZoomIn, X, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils';

interface ImageUploadProps {
  /** Current image URL (from server or local blob) */
  src: string | null;
  /** Fallback content when no image — e.g. initials or an icon */
  fallback: React.ReactNode;
  /** Called when user picks a new file */
  onFileSelected: (file: File) => void;
  /** Called when user confirms removal. If undefined, remove button is hidden. */
  onRemove?: () => void;
  /** Whether an upload/remove is in progress */
  loading?: boolean;
  /** Shape of the image area */
  shape?: 'circle' | 'rounded';
  /** Tailwind size class for width/height, e.g. "h-20 w-20" */
  size?: string;
  className?: string;
  accept?: string;
}

/**
 * Reusable image upload control with:
 *  - hover overlay showing change / remove actions
 *  - click-to-preview modal (full-size lightbox)
 *  - remove confirmation built-in
 */
export function ImageUpload({
  src,
  fallback,
  onFileSelected,
  onRemove,
  loading = false,
  shape = 'circle',
  size = 'h-20 w-20',
  className,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
}: ImageUploadProps) {
  const { t } = useTranslation('common');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onFileSelected(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <div className={cn('relative group shrink-0', size, className)}>
        {/* Image / fallback */}
        <div
          className={cn(
            'h-full w-full overflow-hidden flex items-center justify-center',
            shapeClass,
            src ? 'bg-transparent' : 'bg-primary/10 border-2 border-dashed border-border',
          )}
        >
          {src ? (
            <img src={src} alt="avatar" className="h-full w-full object-cover" onError={() => {}} />
          ) : (
            fallback
          )}
        </div>

        {/* Hover overlay */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-1.5',
            'bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity',
            shapeClass,
            loading && 'opacity-100',
          )}
        >
          {loading ? (
            <span className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              {/* Change */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-white text-[10px] font-semibold hover:text-primary-foreground transition-colors"
                title={t('change_image')}
              >
                <Camera className="h-3.5 w-3.5" />
                {t('change')}
              </button>

              {/* Preview — only if there's an image */}
              {src && (
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="flex items-center gap-1 text-white text-[10px] font-semibold hover:text-blue-300 transition-colors"
                  title={t('preview_image')}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                  {t('preview')}
                </button>
              )}

              {/* Remove — only if handler provided and image exists */}
              {src && onRemove && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="flex items-center gap-1 text-white text-[10px] font-semibold hover:text-red-400 transition-colors"
                  title={t('remove_image')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('remove')}
                </button>
              )}

              {/* Upload hint when no image */}
              {!src && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-white text-[10px] font-semibold"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t('upload')}
                </button>
              )}
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* ── Full-size preview lightbox ── */}
      <AnimatePresence>
        {previewOpen && src && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setPreviewOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-sm w-full"
            >
              <img
                src={src}
                alt="Preview"
                className="w-full rounded-2xl shadow-2xl object-contain max-h-[70vh]"
              />
              {/* Actions bar */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 rounded-b-2xl bg-black/60 backdrop-blur-sm px-4 py-3">
                <button
                  type="button"
                  onClick={() => { setPreviewOpen(false); fileInputRef.current?.click(); }}
                  className="flex items-center gap-1.5 text-white text-xs font-semibold hover:text-blue-300 transition-colors"
                >
                  <Camera className="h-4 w-4" /> {t('change')}
                </button>
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => { setPreviewOpen(false); setConfirmRemove(true); }}
                    className="flex items-center gap-1.5 text-white text-xs font-semibold hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" /> {t('remove')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="flex items-center gap-1.5 text-white/70 text-xs font-semibold hover:text-white transition-colors ml-auto"
                >
                  <X className="h-4 w-4" /> {t('close')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Remove confirmation dialog ── */}
      <AnimatePresence>
        {confirmRemove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4"
            onClick={() => setConfirmRemove(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-xs text-center space-y-4"
            >
              <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                <Trash2 className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="font-semibold">{t('remove_image')}?</p>
                <p className="text-sm text-muted-foreground mt-1">{t('remove_image_desc')}</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmRemove(false)}
                  className="flex-1 rounded-lg border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmRemove(false); onRemove?.(); }}
                  className="flex-1 rounded-lg bg-red-500 text-white py-2 text-sm font-semibold hover:bg-red-600 transition-colors"
                >
                  {t('remove')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
