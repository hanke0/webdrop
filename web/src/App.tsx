import { Card } from './components/card'
import { Fresh } from './components/fresh'
import { InputBox } from './components/inputbox'
import { List } from './components/list'
import { UserHead } from './components/user-head'
import {
  Connection,
  LazyConnection,
  LazyConnectionImpl,
  P2P,
} from './lib/p2p'
import { usePeer } from './hooks/usePeer'
import { Main } from './components/main'
import { fetchRoomUsers } from './lib/api'
import { sleep } from './lib/util'
import { UserText } from './components/user-text'
import {
  FileReceiveDialog,
  IncomingFileOffer,
} from './components/file-receive-dialog'
import {
  ChatInviteDialog,
  IncomingChatInvite,
} from './components/chat-invite-dialog'
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

const sendFile = async (conn: Connection, file: File) => {
  if (!conn.opened) {
    await sleep(500)
  }
  await conn.sendFileWithConsent(file)
}

export default function Home() {
  const { users, addUser, removeUser, resetRoomUsers } = useUsers()
  const [incomingFile, setIncomingFile] = useState<IncomingFileOffer | null>(
    null
  )
  const [incomingChat, setIncomingChat] = useState<IncomingChatInvite | null>(
    null
  )
  const [peerUi, setPeerUi] = useState<PeerDialogState>(null)
  const [chatLines, setChatLines] = useState<Record<string, ChatLine[]>>({})
  const chatLoadDismissedRef = useRef(false)
  const [listRefreshBusy, setListRefreshBusy] = useState(false)

  const incomingFileRef = useRef(incomingFile)
  const incomingChatRef = useRef(incomingChat)
  useEffect(() => {
    incomingFileRef.current = incomingFile
  }, [incomingFile])
  useEffect(() => {
    incomingChatRef.current = incomingChat
  }, [incomingChat])

  const fileOfferRef = useRef<
    | ((
        conn: Connection,
        meta: { transferId: string; name: string; size: number },
        respond: (accepted: boolean) => void
      ) => void)
    | undefined
  >(undefined)

  const handleFileOffer = useCallback(
    (
      conn: Connection,
      meta: { transferId: string; name: string; size: number },
      respond: (accepted: boolean) => void
    ) => {
      if (incomingChatRef.current) {
        toast.error('已有聊天请求待处理，无法接受文件')
        respond(false)
        return
      }
      setIncomingFile((prev) => {
        if (prev) {
          toast.error('已有文件正在等待你的确认')
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
    []
  )

  const chatInviteRef = useRef<
    | ((
        conn: Connection,
        meta: { inviteId: string },
        respond: (accepted: boolean) => void
      ) => void)
    | undefined
  >(undefined)

  const handleChatInvite = useCallback(
    (
      conn: Connection,
      meta: { inviteId: string },
      respond: (accepted: boolean) => void
    ) => {
      if (incomingFileRef.current) {
        toast.error('正在处理文件传输请求，无法接受聊天')
        respond(false)
        return
      }
      setIncomingChat((prev) => {
        if (prev) {
          toast.error('已有聊天或文件请求待处理')
          respond(false)
          return prev
        }
        return {
          inviteId: meta.inviteId,
          uid: conn.id,
          respond,
        }
      })
    },
    []
  )

  const appendChatLine = useCallback(
    (peerId: string, self: boolean, text: string) => {
      setChatLines((prev) => {
        const row: ChatLine = {
          id: crypto.randomUUID(),
          self,
          text,
        }
        const list = prev[peerId] ?? []
        return { ...prev, [peerId]: [...list, row] }
      })
    },
    []
  )

  const chatMessageRef = useRef<
    | ((conn: Connection, msg: { name: string; payload: string }) => void)
    | undefined
  >(undefined)

  const handleChatMessage = useCallback(
    (conn: Connection, msg: { name: string; payload: string }) => {
      const line = msg.name ? `${msg.name}: ${msg.payload}` : msg.payload
      appendChatLine(conn.id, false, line)
    },
    [appendChatLine]
  )

  useEffect(() => {
    fileOfferRef.current = handleFileOffer
    chatInviteRef.current = handleChatInvite
    chatMessageRef.current = handleChatMessage
  }, [handleFileOffer, handleChatInvite, handleChatMessage])

  const peer = usePeer(
    addUser,
    removeUser,
    fileOfferRef,
    chatInviteRef,
    chatMessageRef
  )

  const outboundHandlers = useMemo(
    () => ({
      open: (conn: Connection) => addUser(conn),
      close: (conn: Connection) => removeUser(conn),
      error: (conn: Connection, err: Error) => {
        toast.error(`Connection to ${conn.id} failed: ${err.message}`)
        removeUser(conn)
      },
      get fileOffer() {
        return fileOfferRef.current
      },
      get chatInvite() {
        return chatInviteRef.current
      },
      get chatMessage() {
        return chatMessageRef.current
      },
    }),
    [addUser, removeUser]
  )

  const handleRefreshRoomUsers = useCallback(async () => {
    if (!peer || peer.err) {
      return
    }
    setListRefreshBusy(true)
    try {
      const data = await fetchRoomUsers(peer.room)
      const pending = data
        .map((ele) => {
          const id = ele.id
          const addrs = ele.addrs ?? []
          const builder = (p: P2P) => p.connect(id, addrs, outboundHandlers)
          return new LazyConnectionImpl(id, builder)
        })
        .filter((c) => c.id !== peer.id)
      resetRoomUsers(pending)
    } catch {
    } finally {
      window.setTimeout(() => setListRefreshBusy(false), 400)
    }
  }, [peer, outboundHandlers, resetRoomUsers])

  useEffect(() => {
    void handleRefreshRoomUsers()
  }, [handleRefreshRoomUsers])

  if (!peer) {
    return <LoadingPage />
  }
  if (peer.err) {
    return <ErrorPage err={peer.err.message} />
  }

  const handleConnectToUser = async (fullName: string) => {
    if (!peer) {
      toast.error('Connect fail: peer is null')
      return
    }
    if (peer.isSelf(fullName)) {
      toast.error('Connect fail: cannot connect to self')
      return
    }

    const id = peer.getConnectID(fullName)
    try {
      const data = await fetchRoomUsers(peer.room)
      const u = data.find((x) => x.id === id)
      if (!u) {
        toast.error(
          'That user is not online in this room — refresh the user list first'
        )
        return
      }
      peer.connect(fullName, u.addrs ?? [], outboundHandlers)
    } catch {
      /* fetchRoomUsers already toasts HTTP / parse errors */
    }
  }

  const handleSendFileToPeer = async (conn: Connection, file: File) => {
    const name = getUserShowName(conn.id)
    toast.promise(sendFile(conn, file), {
      loading: `正在向 ${name} 发送 ${file.name}…`,
      success: `已发送 ${file.name} 给 ${name}`,
      error: (err) => `发送失败: ${err}`,
    })
  }

  const handleStartChat = async (lazy: LazyConnection) => {
    chatLoadDismissedRef.current = false
    const conn = lazy.getReal(peer)
    setPeerUi({ kind: 'chat-loading', lazy })
    const ok = await conn.requestChat()
    if (chatLoadDismissedRef.current) {
      return
    }
    if (!ok) {
      toast.error('对方拒绝了聊天或未在规定时间内响应')
      setPeerUi({ kind: 'menu', lazy })
      return
    }
    setPeerUi({ kind: 'chat', conn, peerId: conn.id })
  }

  const handlePeerDialogClose = () => {
    setPeerUi((cur) => {
      if (cur?.kind === 'chat-loading') {
        chatLoadDismissedRef.current = true
      }
      return null
    })
  }

  const handleSendChat = (conn: Connection, text: string) => {
    conn.sendChatText(text)
    appendChatLine(conn.id, true, text)
  }

  const handleChatInviteResolved = (
    accepted: boolean,
    offer: IncomingChatInvite
  ) => {
    setIncomingChat(null)
    if (!accepted) {
      return
    }
    const lazy = users.find((c) => c.id === offer.uid)
    const conn = lazy?.getReal(peer)
    if (conn?.isChatActive()) {
      setPeerUi({ kind: 'chat', conn, peerId: conn.id })
    }
  }

  return (
    <>
      <FileReceiveDialog
        key={incomingFile?.transferId ?? 'closed'}
        open={() => !!incomingFile}
        offer={incomingFile}
        onClose={() => setIncomingFile(null)}
      />
      <ChatInviteDialog
        key={incomingChat?.inviteId ?? 'no-chat'}
        open={() => !!incomingChat}
        offer={incomingChat}
        onResolved={handleChatInviteResolved}
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
        onStartChat={handleStartChat}
        onSendChat={handleSendChat}
      />
      <Main>
        <div className="wd-stagger flex w-full flex-col gap-4">
          <header className="text-center space-y-1 px-1">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--wd-muted)] font-semibold">
              点对点 · 安全直连
            </p>
            <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-tight text-[var(--wd-text)]">
              Web Drop
            </h1>
          </header>

          <Card>
            <UserText uid={peer.id} />
          </Card>

          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="text-left">
                <p className="text-xs font-medium text-[var(--wd-muted)]">
                  在线成员
                </p>
                <p className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums text-[var(--wd-text)]">
                    {users.length}
                  </span>
                  <span className="text-sm text-[var(--wd-muted)]">人</span>
                </p>
              </div>
              <button
                type="button"
                aria-label="刷新在线列表"
                disabled={listRefreshBusy}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--wd-border)] bg-[var(--wd-surface)] text-[var(--wd-accent)] hover:bg-[var(--wd-surface-hover)] transition-all duration-200 active:scale-95 disabled:opacity-50"
                onClick={() => void handleRefreshRoomUsers()}
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
                按显示名连接对方
              </p>
              <InputBox
                placeholder="对方在房间里的名字"
                buttonText="连接"
                onSubmit={(id) => handleConnectToUser(id)}
                autoComplete="off"
              />
            </div>

            <div className="rounded-xl border border-[var(--wd-border)] bg-[var(--wd-surface-muted)] p-3 min-h-[7rem]">
              <p className="text-[11px] uppercase tracking-wider text-[var(--wd-muted)] font-semibold mb-3 px-1 text-left">
                点击头像 · 发文件或聊天
              </p>
              {users.length === 0 ? (
                <p className="text-center text-sm text-[var(--wd-muted)] py-8 px-2 leading-relaxed">
                  还没有其他成员。可先点右上角刷新，或分享房间码邀请对方加入。
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
        </div>
      </Main>
    </>
  )
}
