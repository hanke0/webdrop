import { RefObject, useCallback, useEffect, useState } from 'react'

type Props = {
  onClose?: () => void
  children?: React.ReactNode
  open?: OpenState
}

export type OpenState = boolean | (() => boolean) | RefObject<HTMLElement>

export function Dialog(props: Props) {
  const [isOpen, setOpen] = useState(false)

  const click = useCallback(() => {
    setOpen(true)
  }, [setOpen])

  useEffect(() => {
    let set = false
    if (typeof props.open === 'object') {
      props.open.current?.addEventListener('click', click)
      set = true
    }
    return () => {
      if (set) {
        if (typeof props.open === 'object') {
          props.open.current?.removeEventListener('click', click)
        }
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

  const onClose = () => {
    if (props.onClose) {
      props.onClose()
    }
    setOpen(false)
  }

  return (
    <div
      className={`overflow-y-auto overflow-x-hidden fixed top-0 right-0 left-0 z-50 justify-center items-center w-full md:inset-0 h-[calc(100%-1rem)] max-h-full`}
    >
      <div className="relative p-4 w-full max-w-md max-h-full m-auto">
        <div className="relative bg-white rounded-lg shadow">
          <button
            onClick={onClose}
            type="button"
            className="absolute top-3 end-2.5 text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center"
          >
            <svg
              className="w-3 h-3"
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
          <div className="p-4 md:p-5 text-center">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
