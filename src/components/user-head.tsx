import { parseUsername } from '../lib/room'

export type UserHeadProps = {
  fullName: string
  className?: string
  width?: number
  height?: number
}

export const UserHead = (props: UserHeadProps) => {
  const name = parseUsername(props.fullName)
  if (!name) {
    return <></>
  }
  return (
    <img
      className={props.className}
      width={props.width}
      height={props.height}
      alt={props.fullName}
      src={`/icons/${name.name}.svg`}
    />
  )
}
