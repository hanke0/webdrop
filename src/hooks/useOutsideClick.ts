import { useCallback, useEffect } from 'react';

const MOUSE_UP = 'mouseup';

export default function useOutsideClick(
  handleClose: () => void,
  ref: React.RefObject<HTMLElement>) {
  const handleClick = useCallback((event: MouseEvent) => {
    if (!ref?.current) {
      return
    }
    if (!ref.current.contains(event.target as Node)) {
      handleClose();
    }
  }, [handleClose, ref]);

  useEffect(() => {
    const click = handleClick
    document.addEventListener(MOUSE_UP, click);
    return () => {
      document.removeEventListener(MOUSE_UP, click);
    };
  }, [handleClick]);
}
