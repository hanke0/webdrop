import { Card } from './components/card'
import { Fresh } from './components/fresh'
import { InputBox } from './components/inputbox'
import { List } from './components/list'
import { RoomText } from './components/room-text'
import { UserHead } from './components/user-head'
import {
  Connection,
  Data,
  LazyConnection,
  LazyConnectionImpl,
  P2P,
} from './lib/p2p'
import { usePeer } from './hooks/userPeer'
import { Main } from './components/main'
import { getRoomUserListURL } from './lib/client'
import { UserText } from './components/user-text'
import { FileSendDialog } from './components/file-send-dialog'
import { LoadingPage } from './components/loading-page'
import { ErrorPage } from './components/error-page'
import { getUserShowName, splitRoomAndUser } from './lib/room'
import { sleep } from './lib/client'
import useUsers from './hooks/useUsers'
import { toast } from 'react-hot-toast'
import { useState } from 'react'

const generateListItem = ({ id }: LazyConnection) => {
  const [, user] = splitRoomAndUser(id)
  return (
    <div className="inline block">
      <UserHead
        user={user || ''}
        className="inline text-center mb-1"
        width={40}
        height={40}
      />
      <span className="inline text-[16px]">{user || id}</span>
    </div>
  )
}

const sendFile = async (conn: Connection, file: File) => {
  const blob = new Blob([file], { type: file.type })
  const data: Data = {
    type: 'file',
    name: file.name,
    payload: blob,
  }
  console.log('sending file: ', conn.id, file.name)
  if (!conn.opened) {
    await sleep(500) // wait for connection open
  }
  const sender = conn.send(data)
  if (!sender) {
    toast.error('Send file fail')
    return
  }
  await sender
  console.log('sended file:', conn.id, file.name)
}

export default function Home() {
  const [getUsers, addUser, removeUser, resetRoomUsers] = useUsers()
  const peer = usePeer(addUser, removeUser)
  const [curConn, setCurConn] = useState<LazyConnection | null>(null)

  if (!peer) {
    return <LoadingPage />
  }
  if (peer.err) {
    return <ErrorPage err={peer.err.message} />
  }

  const handleConnectToUser = (fullName: string) => {
    if (!peer) {
      toast.error('Connect fail: peer is null')
      return
    }
    if (peer.isSelf(fullName)) {
      toast.error('Connect fail: cannot connect to self')
      return
    }
    peer.connect(fullName, {
      open: (conn) => addUser(conn),
      close: (conn) => removeUser(conn),
      error: (conn, err) => {
        toast.error(`connect to ${conn.id} fail: ${err.message}`)
        removeUser(conn)
      },
    })
  }

  const handleSendFile = async (file: File) => {
    console.log('send file:', file.name)
    if (!curConn) {
      toast.error('Connect not selected')
      return
    }
    if (!peer.peer) {
      toast.error('Send fail: peer is null')
      return
    }
    const conn = curConn.getReal(peer)
    await sendFile(conn, file)
  }

  const handleRefreshRoomUsers = async () => {
    try {
      const res = await fetch(getRoomUserListURL(peer.room))
      if (!res.ok) {
        toast.error('fetch room users fail: ' + res.statusText)
        return
      }
      const data = await res.json() as { id: string }[]
      console.log('fetch room users:', peer.id, data)
      const pending = data.map((ele: { id: string }) => {
        const id = ele.id
        const builder = (p: P2P) => {
          return p.connect(id, {
            open: (conn) => addUser(conn),
            close: (conn) => removeUser(conn),
            error: (conn, err) => {
              toast.error(`connection with ${conn.id} fail: ${err.message}`)
              removeUser(conn)
            },
          })
        }
        return new LazyConnectionImpl(id, builder)
      }).filter((c) => c.id !== peer.id)
      resetRoomUsers(pending)
    } catch (err) {
      console.log('fetch room users fail:', err)
      toast.error(`fetch room users fail: ${err}`)
    }
  }

  return (
    <Main>
      <Card>
        <h1 className={`text-4xl font-bold text-center px-2 py-8`}>Web Drop</h1>
        <div className="h-full items-center justify-center">
          <Card className="mb-4">
            <RoomText peer={peer} />
            <UserText uid={peer.id} />
            <div className="w-1/2 my-2">
              <InputBox
                placeholder="Put your friend's name here.."
                buttonText="Invite"
                onSubmit={(id) => handleConnectToUser(id)}
                autoComplete="off"
              />
            </div>
          </Card>
          <FileSendDialog
            open={() => !!curConn}
            onClose={() => setCurConn(null)}
            handleSendFile={handleSendFile}
            user={curConn?.id ? getUserShowName(curConn.id) : ''}
          />
          <Card className="h-full">
            <div className={`text-1xl font-bold`}>
              {getUsers().length} Users
              <Fresh
                width={16}
                height={16}
                className="mb-1 mx-2 fill-current inline hover:fill-cyan-700 cursor-pointer"
                onClick={handleRefreshRoomUsers}
              />
            </div>

            <List
              className="flex flex-row flex-wrap justify-center"
              itemClassName="rounded-full px-6"
              items={getUsers()}
              getKey={(item) => item.id}
              selectCallback={(item) => setCurConn(item)}
              genContent={generateListItem}
            />
          </Card>
        </div>
        <div className="h-8" />
      </Card>
    </Main>
  )
}
