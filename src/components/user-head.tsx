import { getUserIconPath } from '../lib/room'

export type UserHeadProps = {
  user: string
  className?: string
  width?: number
  height?: number
}

export const UserHead = (props: UserHeadProps) => {
  const path = getUserIconPath(props.user)
  if (!path) {
    return <></>
  }
  return (
    <img
      className={props.className}
      width={props.width}
      height={props.height}
      alt={props.user}
      src={path}
    />
  )
}
