import useEscClose from '../hooks/useEscClose'
import useOutsideClick from '../hooks/useOutsideClick'
import { RefObject, useCallback, useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  onClose?: () => void
  children?: React.ReactNode
  open?: OpenState
  /**
   * When `false`, outside-clicks, Escape, and the close (X) button do not
   * close the dialog. Use for decision dialogs that require an explicit
   * in-content button press. Defaults to `true`.
   */
  dismissible?: boolean
}

export type OpenState = boolean | (() => boolean) | RefObject<HTMLElement | null>

function isRefOpenTarget(
  open: OpenState | undefined
): open is RefObject<HTMLElement | null> {
  return typeof open === 'object' && open !== null && 'current' in open
}

export function Dialog(props: Props) {
  const dismissible = props.dismissible ?? true
  const [isOpen, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const click = useCallback(() => {
    setOpen(true)
  }, [setOpen])

  const onClose = () => {
    if (props.onClose) {
      props.onClose()
    }
    setOpen(false)
  }

  const noop = useCallback(() => {}, [])
  useOutsideClick(dismissible ? onClose : noop, dialogRef)
  useEscClose(dismissible ? onClose : noop)

  useEffect(() => {
    let set = false
    if (isRefOpenTarget(props.open)) {
      props.open.current?.addEventListener('click', click)
      set = true
    }
    return () => {
      if (set && isRefOpenTarget(props.open)) {
        props.open.current?.removeEventListener('click', click)
      }
    }
  }, [props.open, click])

  let open = true
  if (props.open !== undefined) {
    if (typeof props.open === 'function') {
      open = props.open()
    } else if (typeof props.open === 'boolean') {
      open = props.open
    } else {
      open = isOpen
    }
  }

  if (!open) {
    return <></>
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 overflow-y-auto overflow-x-hidden"
      role="presentation"
    >
      <div
        className="absolute inset-0 wd-modal-backdrop bg-slate-900/35 backdrop-blur-md"
        aria-hidden
      />
      <div
        className="relative z-10 w-full max-w-md max-h-[min(90dvh,720px)] sm:max-h-[min(85dvh,640px)] px-0 sm:px-0 pb-[env(safe-area-inset-bottom)]"
        ref={dialogRef}
      >
        <div className="wd-modal-panel rounded-t-[1.75rem] sm:rounded-2xl bg-[var(--wd-panel)] border border-[var(--wd-border)] shadow-[0_25px_50px_-12px_rgba(15,23,42,0.12)] overflow-hidden">
          {dismissible && (
            <button
              ref={closeRef}
              onClick={onClose}
              type="button"
              className="absolute top-3.5 end-3 z-20 text-[var(--wd-muted)] hover:text-[var(--wd-text)] hover:bg-[var(--wd-surface-hover)] rounded-xl text-sm w-9 h-9 inline-flex justify-center items-center transition-colors duration-200"
            >
              <svg
                className="w-4 h-4"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 14 14"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                  d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                />
              </svg>
            </button>
          )}
          <div
            className={`p-5 sm:p-6 ${dismissible ? 'pt-14' : 'pt-6 sm:pt-7'} text-left text-[var(--wd-text)]`}
          >
            {props.children}
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return <></>
  }

  return createPortal(modal, document.body)
}
