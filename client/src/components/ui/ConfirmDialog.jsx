import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';

const ConfirmContext = createContext(null);

/**
 * const confirm = useConfirm();
 * if (await confirm({ title, message, confirmText: 'Yes, delete', danger: true })) ...
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setState(opts);
      }),
    [],
  );

  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={Boolean(state)}
        title={state?.title}
        message={state?.message}
        confirmText={state?.confirmText}
        cancelText={state?.cancelText}
        danger={state?.danger}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmText = 'Yes, continue',
  cancelText = 'No, go back',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'dangerSolid' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="text-[15px] leading-relaxed text-ink">{message}</div>
    </Modal>
  );
}
