import { LoadingIcon } from './loading-icon'

export type ButtonProps = {
  children: React.ReactNode
  handleClick?: (ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  cancelContent?: { txt: string; state: boolean }
}

function cancelContent(txt: string) {
  return (
    <>
      <LoadingIcon className="w-4 h-4 me-3"></LoadingIcon>
      <span>{txt}</span>
    </>
  )
}

export function Button(props: ButtonProps) {
  let content = props.children
  if (props.cancelContent) {
    content = (
      <>
        {props.cancelContent.state
          ? cancelContent(props.cancelContent.txt)
          : props.children}
      </>
    )
  }

  return (
    <button
      onClick={(ev) => {
        if (props.handleClick) {
          ev.preventDefault()
          ev.stopPropagation()
          props.handleClick(ev)
        }
      }}
      className={`py-2.5 px-5 mt-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 inline-flex items-center`}
      type={props.type || 'button'}
      disabled={props.disabled}
    >
      {content}
    </button>
  )
}
