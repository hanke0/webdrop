import { Dialog, OpenState } from './dialog'
import { Upload } from './upload'
import { Button } from './button'
import { getUserShowName } from '../lib/room'
import { Connection, LazyConnection, P2P } from '../lib/p2p'
import { LoadingIcon } from './loading-icon'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
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

  const uid = !state ? '' : state.kind === 'chat' ? state.peerId : state.lazy.id
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
      toast.error(t('peer.pickFile'))
      return
    }
    const conn = state.lazy.getReal(peer)
    setSendingFile(true)
    try {
      await onSendFile(conn, file)
      setFile(null)
      handleDialogClose()
    } catch (err) {
      toast.error(t('peer.sendFailed', { message: String(err) }))
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
          <h3 className="text-lg font-semibold text-[var(--wd-text)] pr-8">
            {t('peer.with', { name })}
          </h3>
          <p className="text-sm text-[var(--wd-muted)] pb-4 pt-1">
            {t('peer.chooseAction')}
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              className="w-full"
              handleClick={() =>
                onStateChange({ kind: 'file', lazy: state.lazy })
              }
            >
              {t('peer.sendFile')}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              handleClick={() => {
                void onStartChat(state.lazy)
              }}
            >
              {t('peer.textChat')}
            </Button>
          </div>
        </>
      )}

      {state.kind === 'file' && (
        <>
          <h3 className="text-lg font-semibold text-[var(--wd-text)] pr-8">
            {t('peer.sendTo', { name })}
          </h3>
          <p className="text-xs text-[var(--wd-muted)] pt-1 pb-3">
            {t('peer.pickFileHint')}
          </p>
          <Upload callback={(f) => setFile(f)}>
            {file && (
              <span className="text-[var(--wd-accent)] break-all font-medium">
                {file.name}
              </span>
            )}
          </Upload>
          <div className="flex flex-col gap-2 mt-4">
            <Button
              variant="primary"
              className="w-full"
              handleClick={handleSendFileClick}
              cancelContent={{ txt: t('peer.sending'), state: sendingFile }}
            >
              {t('peer.send')}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              handleClick={() =>
                onStateChange({ kind: 'menu', lazy: state.lazy })
              }
            >
              {t('peer.back')}
            </Button>
          </div>
        </>
      )}

      {state.kind === 'chat-loading' && (
        <div className="py-10 flex flex-col items-center gap-4 text-[var(--wd-muted)]">
          <LoadingIcon className="w-9 h-9" />
          <p className="text-sm text-center leading-relaxed">
            {t('peer.waitingChatInvite', { name })}
          </p>
        </div>
      )}

      {state.kind === 'chat' && (
        <>
          <h3 className="text-lg font-semibold text-[var(--wd-text)] pr-8">
            {t('peer.chatWith', { name })}
          </h3>
          <div className="h-56 overflow-y-auto text-left border border-[var(--wd-border)] rounded-xl p-3 mb-3 bg-[var(--wd-input-bg)] mt-2">
            {lines.length === 0 && (
              <p className="text-[var(--wd-muted)] text-sm">
                {t('peer.noMessages')}
              </p>
            )}
            {lines.map((line) => (
              <div
                key={line.id}
                className={`py-2 px-3 rounded-xl text-sm mb-2 max-w-[92%] break-words transition-opacity duration-200 ${
                  line.self
                    ? 'ml-auto bg-[color-mix(in_oklab,var(--wd-accent)_22%,transparent)] text-[var(--wd-text)] border border-[color-mix(in_oklab,var(--wd-accent)_35%,transparent)]'
                    : 'mr-auto bg-[var(--wd-surface)] border border-[var(--wd-border)] text-[var(--wd-text)]'
                }`}
              >
                {line.text}
              </div>
            ))}
            <div ref={listEndRef} />
          </div>
          <form
            className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
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
              className="flex-1 min-h-[4.5rem] p-3 text-sm text-[var(--wd-text)] placeholder:text-[var(--wd-faint)] bg-[var(--wd-input-bg)] border border-[var(--wd-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--wd-accent-glow)] focus:border-[color-mix(in_oklab,var(--wd-accent)_45%,var(--wd-border))] resize-y transition-[box-shadow,border-color] duration-200"
              placeholder={t('peer.chatPlaceholder')}
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
            <Button type="submit" variant="primary" className="sm:w-auto w-full shrink-0">
              {t('peer.sendMessage')}
            </Button>
          </form>
        </>
      )}
    </Dialog>
  )
}
