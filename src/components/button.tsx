export type ButtonProps = {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}

export function Button(props: ButtonProps) {
  return (
    <button
      onClick={props.onClick}
      className={`py-2.5 px-5 mt-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 inline-flex items-center`}
      type={props.type}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  )
}
