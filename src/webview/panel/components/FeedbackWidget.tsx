import React, { useEffect, useRef } from 'react';

interface Props {
  visible: boolean;
  onFeedback: (positive: boolean) => void;
}

export function FeedbackWidget({ visible, onFeedback }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [visible]);

  if (!visible) return null;
  return (
    <div ref={ref} className="p-feedback visible">
      <span className="p-feedback-text">Was this helpful?</span>
      <button className="p-feedback-btn" title="Yes" onClick={() => onFeedback(true)}>&#x1F44D;</button>
      <button className="p-feedback-btn" title="No" onClick={() => onFeedback(false)}>&#x1F44E;</button>
    </div>
  );
}
