import React from 'react';

interface Props {
  toast: { text: string; type: 'success' | 'error' | 'warning' } | null;
}

export function Toast({ toast }: Props) {
  return (
    <div className={`p-toast${toast ? ` ${toast.type} visible` : ''}`}>
      <span>{toast?.text ?? ''}</span>
    </div>
  );
}
