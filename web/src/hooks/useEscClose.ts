import { useCallback, useEffect } from 'react';

const KEY_UP = 'keyup';

export default function useEscClose(
  handleClose: () => void) {
  const handleClick = useCallback((event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    if (event.key === 'Escape') {
      handleClose();
    }
  }, [handleClose]);

  useEffect(() => {
    document.addEventListener(KEY_UP, handleClick);

    return () => { document.removeEventListener(KEY_UP, handleClick); };
  }, [handleClick]);
}
