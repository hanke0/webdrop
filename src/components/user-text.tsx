import { UserHead } from './user-head'
import toast from 'react-hot-toast'

export type UserTextProps = {
  uid: string
  user: string
}

export function UserText(props: UserTextProps) {
  return (
    <div>
      You are
      <span
        onClick={() => {
          navigator?.clipboard
            ?.writeText(props.uid)
            .then(() => {
              toast.success('copy username to clipboard')
            })
            .catch((err) => {
              console.log('copy fail:', err)
            })
        }}
        className="inline border rounded-full mx-3 py-1 px-3"
      >
        <UserHead
          className="inline mb-1"
          user={props.user}
          width={20}
          height={20}
        />
        <span className="cursor-pointer">{props.user}</span>
      </span>
    </div>
  )
}
