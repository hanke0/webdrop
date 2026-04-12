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
import useUsers from './hooks/useUsers'
import { toast } from 'react-hot-toast'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const generateListItem = ({ id }: LazyConnection) => {
  const name = getUserShowName(id)
  return (
    <div className="cursor-pointer max-w-24 transition ease-in-out delay-150 hover:-translate-y-1 hover:scale-110">
      <UserHead uid={id} />
      <p className="text-gray-700 text-center text-xs">{name}</p>
    </div>
  )
}

const sendFile = async (conn: Connection, file: File) => {
  console.log('sending file: ', conn.id, file.name)
  if (!conn.opened) {
    await sleep(500)
  }
  await conn.sendFileWithConsent(file)
  console.log('sent file:', conn.id, file.name)
}

export default function Home() {
  const [getUsers, addUser, removeUser, resetRoomUsers] = useUsers()
  const [incomingFile, setIncomingFile] = useState<IncomingFileOffer | null>(
    null
  )
  const [incomingChat, setIncomingChat] = useState<IncomingChatInvite | null>(
    null
  )
  const [peerUi, setPeerUi] = useState<PeerDialogState>(null)
  const [chatLines, setChatLines] = useState<Record<string, ChatLine[]>>({})
  const chatLoadDismissedRef = useRef(false)

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

  fileOfferRef.current = handleFileOffer
  chatInviteRef.current = handleChatInvite
  chatMessageRef.current = handleChatMessage

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

  const handleRefreshRoomUsers = async () => {
    try {
      const data = await fetchRoomUsers(peer.room)
      console.log('fetch room users:', peer.id, data)
      const pending = data
        .map((ele) => {
          const id = ele.id
          const addrs = ele.addrs ?? []
          const builder = (p: P2P) => p.connect(id, addrs, outboundHandlers)
          return new LazyConnectionImpl(id, builder)
        })
        .filter((c) => c.id !== peer.id)
      resetRoomUsers(pending)
    } catch (err) {
      console.log('fetch room users fail:', err)
    }
  }

  const handleChatInviteResolved = (
    accepted: boolean,
    offer: IncomingChatInvite
  ) => {
    setIncomingChat(null)
    if (!accepted) {
      return
    }
    const lazy = getUsers().find((c) => c.id === offer.uid)
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
        <Card>
          <h1 className="text-4xl font-bold text-center px-2 py-8 divide-y w-full">Web Drop</h1>
          <div className="h-full items-center justify-center">
            <div className="mb-4">
              <UserText uid={peer.id} />
            </div>
            <Card className="h-full min-h-48">
              <div className="container flex py-2">
                <div className="grow w-full py-2">
                  {getUsers().length} Users
                  <Fresh
                    width={16}
                    height={16}
                    className="mb-1 mx-2 fill-current inline hover:fill-cyan-700 cursor-pointer"
                    onClick={handleRefreshRoomUsers}
                  />
                </div>
                <div className="w-96">
                  <InputBox
                    placeholder="Your friend's name"
                    buttonText="Invite"
                    onSubmit={(id) => handleConnectToUser(id)}
                    autoComplete="off"
                  />
                </div>
              </div>

              <List
                className="flex flex-row flex-wrap justify-center py-4"
                items={getUsers()}
                itemClassName="px-4 block"
                getKey={(item) => item.id}
                selectCallback={(item) =>
                  setPeerUi({ kind: 'menu', lazy: item })
                }
                genContent={generateListItem}
              />
            </Card>
          </div>
          <div className="h-8" />
        </Card>
      </Main>
    </>
  )
}
