import { ReactNode } from 'react'

type MainProps = {
  children: ReactNode
}

export function Main(props: MainProps) {
  return (
    <main
      className="font-sans min-h-dvh w-full max-w-lg mx-auto flex flex-col justify-center px-4 py-6 sm:py-10"
      style={{
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
      }}
    >
      {props.children}
    </main>
  )
}
