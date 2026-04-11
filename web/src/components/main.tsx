import { ReactNode } from 'react'

type MainProps = {
  children: ReactNode
}

export function Main(props: MainProps) {
  return (
    <main
      className={`fond-sans min-h-screen m-auto items-center justify-between px-4 py-4 lg:py-16 lg:px-32 max-w-[900px]`}
    >
      {props.children}
    </main>
  )
}
