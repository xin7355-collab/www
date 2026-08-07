'use client';

import Modal from './Modal';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = '確定',
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-mist-silver">{message}</p>
      <div className="mt-5 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-ink-border-strong py-2 text-sm text-mist-silver transition hover:text-mist"
        >
          取消
        </button>
        <button
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="flex-1 rounded-lg bg-cinnabar py-2 text-sm text-mist transition hover:opacity-90"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
