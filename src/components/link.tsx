import React from 'react'

type Props = {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  className?: string
  noDefaultClass?: boolean
}

export function Link(props: Props) {
  const defaultClass = 'text-blue-500 hover:text-blue-700 hover:pointer'
  return (
    <a
      onClick={props.onClick}
      href={props.href}
      className={`${props.className} ${props.noDefaultClass ? '' : defaultClass}`}
    >
      {props.children}
    </a>
  )
}
