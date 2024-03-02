import { Card } from './components/card'
import { Fresh } from './components/fresh'
import { InputBox } from './components/inputbox'
import { List } from './components/list'
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
import { getUserShowName } from './lib/room'
import { sleep } from './lib/client'
import useUsers from './hooks/useUsers'
import { toast } from 'react-hot-toast'
import { useState } from 'react'

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

    peer.connect(
      fullName,
      {
        open: (conn) => addUser(conn),
        close: (conn) => removeUser(conn),
        error: (conn, err) => {
          toast.error(`connect to ${conn.id} fail: ${err.message}`)
          removeUser(conn)
        },
      },
    )
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
    const name = getUserShowName(curConn.id)
    const conn = curConn.getReal(peer)
    setCurConn(null) // close dialog
    toast.promise(sendFile(conn, file), {
      loading: `Sending to ${name} with file ${file.name}...`,
      success: `Success send to ${name} with file ${file.name}...`,
      error: (err) => `Send to ${name} with file ${file.name} fail: ${err}`,
    })
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
    <>
      <FileSendDialog
        open={() => !!curConn}
        onClose={() => setCurConn(null)}
        handleSendFile={handleSendFile}
        uid={curConn?.id || ''}
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
                selectCallback={(item) => setCurConn(item)}
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
