import { useState } from 'react'
import { Dialog } from './dialog'
import { UserHead } from './user-head'
import { Upload } from './upload'
import { Button } from './button'
import toast from 'react-hot-toast'

export type FileSendDialogProps = {
  handleSendFile: (file: File) => Promise<void>
  onClose: () => void
  user: string
}

export function FileSendDialog(props: FileSendDialogProps) {
  const [file, setFile] = useState(null as File | null)
  const [isSend, setIsSend] = useState(false)

  return (
    <Dialog
      closeable={true}
      onClose={() => {
        setFile(null)
        setIsSend(false)
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
      <Upload callback={(file) => setFile(file)}></Upload>
      {file && <div className="py-3 px-3">{file.name}</div>}
      <Button
        onClick={async () => {
          if (isSend) {
            setIsSend(false)
            return
          }
          if (file) {
            setIsSend(true)
            try {
              await props.handleSendFile(file)
              toast.success('Send file success')
              setFile(null)
            } catch (err) {
              toast.error(`Send file fail: ${err}`)
            }
            setIsSend(false)
          } else {
            toast.error('No file selected')
          }
        }}
        cancelContent={{ txt: 'Cancel', state: isSend }}
      >
        Send
      </Button>
    </Dialog>
  )
}
