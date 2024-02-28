import { Dialog } from './dialog'

export type SettingDialogProps = {
  room: string
  onClose?: () => void
}

export const SettingDialog = (props: SettingDialogProps) => {
  return <Dialog onClose={props.onClose}></Dialog>
}
