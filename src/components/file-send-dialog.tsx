import { useState } from 'react'
import { Dialog, OpenState } from './dialog'
import { UserHead } from './user-head'
import { Upload } from './upload'
import { Button } from './button'
import toast from 'react-hot-toast'

export type FileSendDialogProps = {
  handleSendFile: (file: File) => Promise<void>
  onClose: () => void
  open: OpenState
  user: string
}

export function FileSendDialog(props: FileSendDialogProps) {
  const [file, setFile] = useState(null as File | null)
  const [sending, setSending] = useState(false)

  const handleClick = async () => {
    if (sending) {
      setSending(false)
      return true
    }
    if (file) {
      setSending(true)
      const send = async () => {
        try {
          await props.handleSendFile(file)
          toast.success('Send file success')
          setFile(null)
        } catch (err) {
          toast.error(`Send file fail: ${err}`)
        }
        setSending(false)
      }
      send()
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
      <h3 className="py-3 px-3 text-[20px]">
        <span className="text-[20px]">Send to</span>
        <div className="inline border rounded-lg px-1 mx-1">
          <UserHead
            user={props.user}
            className="inline text-center mb-1"
            width={20}
            height={20}
          />
          <span className="text-[20px]">{props.user}</span>
        </div>
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
