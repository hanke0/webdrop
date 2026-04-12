import { LoadingIcon } from './loading-icon'

export type ButtonProps = {
  children: React.ReactNode
  handleClick?: (ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  cancelContent?: { txt: string; state: boolean }
  variant?: 'primary' | 'secondary' | 'ghost'
  className?: string
}

function cancelContent(txt: string) {
  return (
    <>
      <LoadingIcon className="w-4 h-4 shrink-0 me-2" />
      <span>{txt}</span>
    </>
  )
}

const variantBase =
  'inline-flex items-center justify-center gap-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-45'

const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-[var(--wd-accent)] text-[var(--wd-on-accent)] border border-[color-mix(in_oklab,var(--wd-accent)_78%,black)] shadow-[0_8px_24px_-6px_var(--wd-accent-glow)] hover:bg-[var(--wd-accent-bright)] active:scale-[0.98]',
  secondary:
    'bg-[var(--wd-surface-muted)] text-[var(--wd-text)] border border-[var(--wd-border-strong)] hover:bg-[var(--wd-surface-hover)] active:scale-[0.98]',
  ghost:
    'bg-transparent text-[var(--wd-muted)] border border-transparent hover:bg-[var(--wd-surface-hover)] hover:text-[var(--wd-text)] active:scale-[0.98]',
}

export function Button(props: ButtonProps) {
  const v = props.variant ?? 'secondary'
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
      className={`${variantBase} ${variants[v]} ${props.className ?? ''}`}
      type={props.type || 'button'}
      disabled={props.disabled}
    >
      {content}
    </button>
  )
}
