import React from 'react'

type CardProps = {
  children: React.ReactNode
  className?: string
}

export function Card(props: CardProps) {
  return (
    <div
      className={`wd-surface-card rounded-2xl px-4 py-5 sm:px-5 sm:py-6 ${props.className ?? ''}`}
    >
      {props.children}
    </div>
  )
}
