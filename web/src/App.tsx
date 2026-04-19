import { Card } from './components/card'
import { Fresh } from './components/fresh'
import { InputBox } from './components/inputbox'
import { List } from './components/list'
import { UserHead } from './components/user-head'
import {
  LazyConnection,
  LazyConnectionImpl,
  PeerLink,
  RoomSession,
} from './lib/webrtc'

function lazyFromPeer(conn: PeerLink): LazyConnection {
  return new LazyConnectionImpl(conn.id, () => conn)
}
import { usePeer } from './hooks/usePeer'
import { Main } from './components/main'
import { UserText } from './components/user-text'
import {
  FileReceiveDialog,
  IncomingFileOffer,
} from './components/file-receive-dialog'
import {
  ChatLine,
  PeerDialog,
  PeerDialogState,
} from './components/peer-dialog'
import { LoadingPage } from './components/loading-page'
import { ErrorPage } from './components/error-page'
import { getUserShowName } from './lib/room'
import { useUsers } from './hooks/useUsers'
import { toast } from 'react-hot-toast'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LanguageSwitch } from './components/language-switch'

const generateListItem = ({ id }: LazyConnection) => {
  const name = getUserShowName(id)
  return (
    <div className="wd-peer-tile cursor-pointer flex flex-col items-center gap-2 rounded-2xl p-3 bg-[var(--wd-tile-bg)] border border-[var(--wd-border)] min-w-[5.75rem] max-w-[7rem]">
      <UserHead uid={id} size="sm" />
      <p className="text-[var(--wd-muted)] text-center text-xs font-medium leading-snug line-clamp-2 break-all">
        {name}
      </p>
    </div>
  )
}

const sendFile = async (conn: PeerLink, file: File) => {
  await conn.ready()
  await conn.sendFileWithConsent(file)
}

export default function Home() {
  const { t } = useTranslation()
  const { users, addUser, removeUser, resetRoomUsers } = useUsers()
  const [incomingFile, setIncomingFile] = useState<IncomingFileOffer | null>(
    null
  )
  const [peerUi, setPeerUi] = useState<PeerDialogState>(null)
  const [chatLines, setChatLines] = useState<Record<string, ChatLine[]>>({})
  const [listRefreshBusy, setListRefreshBusy] = useState(false)

  const incomingFileRef = useRef(incomingFile)
  useEffect(() => {
    incomingFileRef.current = incomingFile
  }, [incomingFile])

  const peerUiRef = useRef(peerUi)
  useEffect(() => {
    peerUiRef.current = peerUi
  }, [peerUi])

  const fileOfferRef = useRef<
    | ((
        conn: PeerLink,
        meta: { transferId: string; name: string; size: number },
        respond: (accepted: boolean) => void
      ) => void)
    | undefined
  >(undefined)

  const handleFileOffer = useCallback(
    (
      conn: PeerLink,
      meta: { transferId: string; name: string; size: number },
      respond: (accepted: boolean) => void
    ) => {
      setIncomingFile((prev) => {
        if (prev) {
          toast.error(t('toast.fileAwaitingConfirm'))
          respond(false)
          return prev
        }
        return {
          transferId: meta.transferId,
          uid: conn.id,
          name: meta.name,
          size: meta.size,
          respond,
        }
      })
    },
    [t]
  )

  const appendChatLine = useCallback(
    (
      peerId: string,
      self: boolean,
      text: string,
      extras?: { id?: string; pending?: boolean }
    ) => {
      setChatLines((prev) => {
        const row: ChatLine = {
          id: extras?.id ?? crypto.randomUUID(),
          self,
          text,
          pending: extras?.pending,
        }
        const list = prev[peerId] ?? []
        return { ...prev, [peerId]: [...list, row] }
      })
    },
    []
  )

  const ackChatLine = useCallback((peerId: string, messageId: string) => {
    setChatLines((prev) => {
      const list = prev[peerId]
      if (!list) {
        return prev
      }
      const idx = list.findIndex((l) => l.id === messageId && l.pending)
      if (idx < 0) {
        return prev
      }
      const next = list.slice()
      next[idx] = { ...next[idx], pending: false }
      return { ...prev, [peerId]: next }
    })
  }, [])

  const chatMessageRef = useRef<
    | ((conn: PeerLink, msg: { name: string; payload: string }) => void)
    | undefined
  >(undefined)
  const chatAckRef = useRef<
    ((conn: PeerLink, messageId: string) => void) | undefined
  >(undefined)

  const handleChatAck = useCallback(
    (conn: PeerLink, messageId: string) => {
      ackChatLine(conn.id, messageId)
    },
    [ackChatLine]
  )

  const handleChatMessage = useCallback(
    (conn: PeerLink, msg: { name: string; payload: string }) => {
      appendChatLine(conn.id, false, msg.payload)
      const current = peerUiRef.current
      if (current?.kind === 'chat' && current.peerId === conn.id) {
        return
      }
      if (current === null && incomingFileRef.current === null) {
        setPeerUi({ kind: 'chat', conn, peerId: conn.id })
        return
      }
      toast(
        t('toast.chatReceived', {
          name: msg.name,
          preview: msg.payload.length > 60
            ? `${msg.payload.slice(0, 60)}…`
            : msg.payload,
        }),
        { icon: '💬', duration: 5000 }
      )
    },
    [appendChatLine, t]
  )

  useEffect(() => {
    fileOfferRef.current = handleFileOffer
    chatMessageRef.current = handleChatMessage
    chatAckRef.current = handleChatAck
  }, [handleFileOffer, handleChatMessage, handleChatAck])

  const peer = usePeer(
    addUser,
    removeUser,
    fileOfferRef,
    chatMessageRef,
    chatAckRef
  )

  const outboundHandlers = useMemo(
    () => ({
      open: (conn: PeerLink) => addUser(lazyFromPeer(conn)),
      close: (conn: PeerLink) => removeUser(lazyFromPeer(conn)),
      error: (conn: PeerLink, err: Error) => {
        toast.error(
          t('toast.connectionFailed', { id: conn.id, message: err.message })
        )
        removeUser(lazyFromPeer(conn))
      },
      get fileOffer() {
        return fileOfferRef.current
      },
      get chatMessage() {
        return chatMessageRef.current
      },
      get chatAck() {
        return chatAckRef.current
      },
    }),
    [addUser, removeUser, t]
  )

  const syncRoomUsers = useCallback(
    (session: RoomSession, peerIds: string[]) => {
      const pending = peerIds
        .filter((id) => id !== session.id)
        .map((id) => {
          const builder = (p: RoomSession) =>
            p.connect(id, outboundHandlers)
          return new LazyConnectionImpl(id, builder)
        })
      resetRoomUsers(pending)
    },
    [outboundHandlers, resetRoomUsers]
  )

  useEffect(() => {
    if (!peer || peer.err) {
      return
    }
    const unsubscribe = peer.onPeers((list) => {
      syncRoomUsers(peer, list)
    })
    return unsubscribe
  }, [peer, syncRoomUsers])

  const handleRefreshRoomUsers = useCallback(() => {
    if (!peer || peer.err) {
      return
    }
    setListRefreshBusy(true)
    peer.refreshPeers()
    window.setTimeout(() => setListRefreshBusy(false), 400)
  }, [peer])

  if (!peer) {
    return <LoadingPage />
  }
  if (peer.err) {
    return <ErrorPage err={peer.err.message} />
  }

  const handleConnectToUser = (fullName: string) => {
    if (!peer) {
      toast.error(t('toast.connectPeerNull'))
      return
    }
    if (peer.isSelf(fullName)) {
      toast.error(t('toast.connectSelf'))
      return
    }
    const id = peer.getPeerId(fullName)
    if (!peer.roomPeers.includes(id)) {
      toast.error(t('toast.userNotOnline'))
      return
    }
    peer.connect(fullName, outboundHandlers)
  }

  const handleSendFileToPeer = async (conn: PeerLink, file: File) => {
    const name = getUserShowName(conn.id)
    toast.promise(sendFile(conn, file), {
      loading: t('toast.sendFileLoading', { name, fileName: file.name }),
      success: t('toast.sendFileSuccess', { name, fileName: file.name }),
      error: (err) =>
        t('toast.sendFileError', { message: String(err) }),
    })
  }

  const handleOpenChat = (lazy: LazyConnection) => {
    const conn = lazy.getReal(peer)
    setPeerUi({ kind: 'chat', conn, peerId: conn.id })
  }

  const handlePeerDialogClose = () => {
    setPeerUi(null)
  }

  const handleSendChat = (conn: PeerLink, text: string) => {
    const messageId = conn.sendChatText(text)
    if (!messageId) {
      return
    }
    appendChatLine(conn.id, true, text, { id: messageId, pending: true })
  }

  return (
    <>
      <FileReceiveDialog
        key={incomingFile?.transferId ?? 'closed'}
        open={() => !!incomingFile}
        offer={incomingFile}
        onClose={() => setIncomingFile(null)}
      />
      <PeerDialog
        state={peerUi}
        peer={peer}
        lines={
          peerUi?.kind === 'chat' ? chatLines[peerUi.peerId] ?? [] : []
        }
        open={() => !!peerUi}
        onClose={handlePeerDialogClose}
        onStateChange={setPeerUi}
        onSendFile={handleSendFileToPeer}
        onOpenChat={handleOpenChat}
        onSendChat={handleSendChat}
      />
      <Main>
        <div className="wd-stagger flex w-full flex-col gap-4">
          <header className="text-center space-y-1 px-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--wd-muted)] font-semibold">
              {t('app.tagline')}
            </p>
            <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-tight text-[var(--wd-text)]">
              {t('app.title')}
            </h1>
          </header>

          <Card>
            <UserText uid={peer.id} />
          </Card>

          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="text-left">
                <p className="text-xs font-medium text-[var(--wd-muted)]">
                  {t('app.onlineMembers')}
                </p>
                <p className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums text-[var(--wd-text)]">
                    {users.length}
                  </span>
                  <span className="text-sm text-[var(--wd-muted)]">
                    {t('app.peopleUnit')}
                  </span>
                </p>
              </div>
              <button
                type="button"
                aria-label={t('app.refreshListAria')}
                disabled={listRefreshBusy}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--wd-border)] bg-[var(--wd-surface)] text-[var(--wd-accent)] hover:bg-[var(--wd-surface-hover)] transition-all duration-200 active:scale-95 disabled:opacity-50"
                onClick={handleRefreshRoomUsers}
              >
                <Fresh
                  width={18}
                  height={18}
                  className="pointer-events-none shrink-0"
                  busy={listRefreshBusy}
                />
              </button>
            </div>

            <div className="text-left">
              <p className="text-xs text-[var(--wd-muted)] mb-2 font-medium">
                {t('app.connectByNameHint')}
              </p>
              <InputBox
                placeholder={t('app.connectPlaceholder')}
                buttonText={t('app.connectButton')}
                onSubmit={(id) => handleConnectToUser(id)}
                autoComplete="off"
              />
            </div>

            <div className="rounded-xl border border-[var(--wd-border)] bg-[var(--wd-surface-muted)] p-3 min-h-[7rem]">
              <p className="text-[11px] uppercase tracking-wider text-[var(--wd-muted)] font-semibold mb-3 px-1 text-left">
                {t('app.peerListHint')}
              </p>
              {users.length === 0 ? (
                <p className="text-center text-sm text-[var(--wd-muted)] py-8 px-2 leading-relaxed">
                  {t('app.emptyPeerList')}
                </p>
              ) : (
                <List
                  className="flex flex-row flex-wrap justify-center gap-3 py-1"
                  items={users}
                  itemClassName="list-none"
                  getKey={(item) => item.id}
                  selectCallback={(item) =>
                    setPeerUi({ kind: 'menu', lazy: item })
                  }
                  genContent={generateListItem}
                />
              )}
            </div>
          </Card>

          <LanguageSwitch className="mt-8 opacity-80" />
        </div>
      </Main>
    </>
  )
}
