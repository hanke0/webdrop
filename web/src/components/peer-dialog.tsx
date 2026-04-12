import { Dialog, OpenState } from './dialog'
import { Upload } from './upload'
import { Button } from './button'
import { getUserShowName } from '../lib/room'
import { Connection, LazyConnection, P2P } from '../lib/p2p'
import { LoadingIcon } from './loading-icon'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

export type PeerDialogState =
  | null
  | { kind: 'menu'; lazy: LazyConnection }
  | { kind: 'file'; lazy: LazyConnection }
  | { kind: 'chat-loading'; lazy: LazyConnection }
  | { kind: 'chat'; conn: Connection; peerId: string }

export type ChatLine = { id: string; self: boolean; text: string }

export type PeerDialogProps = {
  state: PeerDialogState
  peer: P2P
  lines: ChatLine[]
  open: OpenState
  onClose: () => void
  onStateChange: (next: PeerDialogState) => void
  onSendFile: (conn: Connection, file: File) => Promise<void>
  onStartChat: (lazy: LazyConnection) => Promise<void>
  onSendChat: (conn: Connection, text: string) => void
}

export function PeerDialog(props: PeerDialogProps) {
  const {
    state,
    peer,
    lines,
    onClose,
    onStateChange,
    onSendFile,
    onStartChat,
    onSendChat,
  } = props
  const [file, setFile] = useState(null as File | null)
  const [sendingFile, setSendingFile] = useState(false)
  const [draft, setDraft] = useState('')
  const listEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length, state?.kind])

  const uid =
    state && state.kind !== 'chat'
      ? state.lazy.id
      : state?.kind === 'chat'
        ? state.peerId
        : ''
  const name = uid ? getUserShowName(uid) : ''

  const handleDialogClose = () => {
    setFile(null)
    setSendingFile(false)
    setDraft('')
    onClose()
  }

  const handleSendFileClick = async () => {
    if (sendingFile) {
      return
    }
    if (!file || state?.kind !== 'file') {
      toast.error('请选择文件')
      return
    }
    const conn = state.lazy.getReal(peer)
    setSendingFile(true)
    try {
      await onSendFile(conn, file)
      setFile(null)
      handleDialogClose()
    } catch (err) {
      toast.error(`发送失败: ${err}`)
    }
    setSendingFile(false)
  }

  if (!state) {
    return null
  }

  return (
    <Dialog open={props.open} onClose={handleDialogClose}>
      {state.kind === 'menu' && (
        <>
          <h3 className="py-3 px-1 text-lg font-semibold">与 {name}</h3>
          <p className="text-gray-500 text-sm pb-3">选择要进行的操作</p>
          <div className="flex flex-col gap-2">
            <Button
              handleClick={() =>
                onStateChange({ kind: 'file', lazy: state.lazy })
              }
            >
              发送文件
            </Button>
            <Button
              handleClick={() => {
                void onStartChat(state.lazy)
              }}
            >
              文字聊天
            </Button>
          </div>
        </>
      )}

      {state.kind === 'file' && (
        <>
          <h3 className="py-3 px-3">发送给 {name}</h3>
          <Upload callback={(f) => setFile(f)}>
            {file && (
              <span className="text-blue-400 break-all">{file.name}</span>
            )}
          </Upload>
          <div className="flex flex-col gap-2 mt-2">
            <Button
              handleClick={handleSendFileClick}
              cancelContent={{ txt: '发送中…', state: sendingFile }}
            >
              发送
            </Button>
            <Button
              handleClick={() =>
                onStateChange({ kind: 'menu', lazy: state.lazy })
              }
            >
              返回
            </Button>
          </div>
        </>
      )}

      {state.kind === 'chat-loading' && (
        <div className="py-8 flex flex-col items-center gap-3 text-gray-600">
          <LoadingIcon className="w-8 h-8" />
          <p>正在等待 {name} 接受文字聊天…</p>
        </div>
      )}

      {state.kind === 'chat' && (
        <>
          <h3 className="py-2 text-lg font-semibold text-left">与 {name} 聊天</h3>
          <div className="h-56 overflow-y-auto text-left border border-gray-200 rounded-lg p-2 mb-2 bg-gray-50">
            {lines.length === 0 && (
              <p className="text-gray-400 text-sm">暂无消息，开始输入吧。</p>
            )}
            {lines.map((line) => (
              <div
                key={line.id}
                className={`py-1 px-2 rounded-md text-sm mb-1 max-w-[90%] break-words ${
                  line.self
                    ? 'ml-auto bg-cyan-100 text-gray-900'
                    : 'mr-auto bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {line.text}
              </div>
            ))}
            <div ref={listEndRef} />
          </div>
          <form
            className="flex gap-2 items-end"
            onSubmit={(e) => {
              e.preventDefault()
              const t = draft.trim()
              if (!t) {
                return
              }
              onSendChat(state.conn, t)
              setDraft('')
            }}
          >
            <textarea
              className="flex-1 min-h-[4rem] p-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500 resize-y"
              placeholder="输入消息，Enter 发送"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  const t = draft.trim()
                  if (t) {
                    onSendChat(state.conn, t)
                    setDraft('')
                  }
                }
              }}
            />
            <Button type="submit">发送</Button>
          </form>
        </>
      )}
    </Dialog>
  )
}
