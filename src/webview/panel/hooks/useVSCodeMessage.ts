import { useEffect, useRef } from 'react';
import { ExtensionMessage } from '../types';

export function useVSCodeMessage(handler: (msg: ExtensionMessage) => void): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const fn = (e: MessageEvent) => ref.current(e.data as ExtensionMessage);
    window.addEventListener('message', fn);
    return () => window.removeEventListener('message', fn);
  }, []);
}
