/**
 * Template: Toggle-based Dialog
 * Copy to: apps/<APP>/src/pages/<featureName>/ui/<FeatureName>Dialog.tsx
 * Replace: <FeatureName>, <featureName>
 */
import { useState } from 'react';
import { Button } from '@mui/material';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { useTranslate } from 'react-admin';

interface <FeatureName>DialogProps {
  onSuccess?: () => void;
}

export const <FeatureName>Dialog = ({ onSuccess }: <FeatureName>DialogProps) => {
  const [open, setOpen] = useState(false);
  const t = useTranslate();

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleConfirm = () => {
    // ADD: action logic
    onSuccess?.();
    handleClose();
  };

  return (
    <>
      <Button onClick={handleOpen}>
        {t('<featureName>.dialog.trigger')}
      </Button>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{t('<featureName>.dialog.title')}</DialogTitle>
        <DialogContent>
          {/* ADD: dialog content */}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>{t('ra.action.cancel')}</Button>
          <Button onClick={handleConfirm} variant="contained">
            {t('ra.action.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
