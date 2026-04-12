import { Dialog, OpenState } from './dialog'
import { Upload } from './upload'
import { Button } from './button'
import { getUserShowName } from '../lib/room'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

export type FileSendDialogProps = {
  handleSendFile: (file: File) => Promise<void>
  onClose: () => void
  open: OpenState
  uid: string
}

export function FileSendDialog(props: FileSendDialogProps) {
  const { t } = useTranslation()
  const [file, setFile] = useState(null as File | null)
  const [sending, setSending] = useState(false)
  const name = getUserShowName(props.uid)

  const handleClick = async () => {
    if (sending) {
      setSending(false)
      return true
    }
    if (file) {
      setSending(true)
      try {
        await props.handleSendFile(file)
        setFile(null)
      } catch (err) {
        toast.error(t('fileSend.sendFail', { message: String(err) }))
      }
      setSending(false)
    } else {
      toast.error(t('fileSend.noFile'))
    }
  }

  return (
    <Dialog
      open={props.open}
      onClose={() => {
        setFile(null)
        setSending(false)
        props.onClose()
      }}
    >
      <h3 className="text-lg font-semibold text-[var(--wd-text)] pr-8">
        {t('fileSend.sendTo', { name })}
      </h3>
      <Upload callback={(file) => setFile(file)}>
        {file && (
          <span className="text-[var(--wd-accent)] font-medium">{file.name}</span>
        )}
      </Upload>
      <Button
        variant="primary"
        className="w-full mt-4"
        handleClick={handleClick}
        cancelContent={{ txt: t('fileSend.sending'), state: sending }}
      >
        {t('fileSend.send')}
      </Button>
    </Dialog>
  )
}
