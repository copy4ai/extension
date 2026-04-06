import React from 'react';

interface Props {
  visible: boolean;
}

export function LoadingBar({ visible }: Props) {
  return <div className={`p-loading${visible ? ' visible' : ''}`} />;
}
