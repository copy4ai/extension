import React from 'react';

interface Props {
  message: string | null;
  onClose: () => void;
}

export function WarningBanner({ message, onClose }: Props) {
  if (!message) return null;
  return (
    <div className="p-warning visible">
      <span>{message}</span>
      <button className="p-warning-close" onClick={onClose}>&#x2715;</button>
    </div>
  );
}
