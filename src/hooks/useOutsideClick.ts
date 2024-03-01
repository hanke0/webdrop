import { useCallback, useEffect } from 'react';

const MOUSE_UP = 'mouseup';

export default function useOutsideClick(
  handleClose: () => void,
  ref: React.RefObject<HTMLElement>) {
  const handleClick = useCallback((event: MouseEvent) => {
    if (ref?.current?.contains(event.target as Node)) {
      handleClose();
    }
  }, [handleClose, ref]);

  useEffect(() => {
    document.addEventListener(MOUSE_UP, handleClick);

    return () => { document.removeEventListener(MOUSE_UP, handleClick); };
  }, [handleClick]);
}
