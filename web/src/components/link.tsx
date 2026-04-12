import React from 'react'

type Props = {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  className?: string
  noDefaultClass?: boolean
}

export function Link(props: Props) {
  const defaultClass =
    'cursor-pointer text-[var(--wd-accent)] hover:text-[var(--wd-accent-bright)] underline-offset-2 hover:underline transition-colors duration-200'
  return (
    <a
      onClick={props.onClick}
      href={props.href}
      className={`${props.className ?? ''} ${props.noDefaultClass ? '' : defaultClass}`}
    >
      {props.children}
    </a>
  )
}
