import { Dialog, OpenState } from './dialog'
import { Upload } from './upload'
import { Button } from './button'
import { getUserShowName } from '../lib/room'
import { useState } from 'react'
import toast from 'react-hot-toast'

export type FileSendDialogProps = {
  handleSendFile: (file: File) => Promise<void>
  onClose: () => void
  open: OpenState
  uid: string
}

export function FileSendDialog(props: FileSendDialogProps) {
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
        toast.error(`Send file fail: ${err}`)
      }
      setSending(false)
    } else {
      toast.error('No file selected')
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
      <h3 className="py-3 px-3">
        To: {name}
      </h3>
      <Upload callback={(file) => setFile(file)}>
        {file && (
          <>
            <span className="text-blue-400">{file.name}</span>
          </>
        )}
      </Upload>
      <Button
        handleClick={handleClick}
        cancelContent={{ txt: 'Cancel', state: sending }}
      >
        Send
      </Button>
    </Dialog>
  )
}
