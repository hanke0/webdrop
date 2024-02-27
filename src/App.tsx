import fileDownload from 'js-file-download'
import { useState } from 'react'
import { LoaderIcon, toast } from 'react-hot-toast'

import { Card } from './components/card'
import { Fresh } from './components/fresh'
import { InputBox } from './components/inputbox'
import { Item, Items, List } from './components/list'
import { RoomText } from './components/room-text'
import { UserHead } from './components/user-head'
import { Connection, Data } from './lib/p2p'
import { useInitRoom } from './hooks/useInitRoom'
import { Main } from './components/main'
import { Link } from './components/link'
import { splitRoomAndUser } from './lib/room'
import { getRoomUserListURL } from './lib/client'
import { UserText } from './components/user-text'
import { FileSendDialog } from './components/file-send-dialog'

type ConnItemValue = {
  id: string
  user: string
  hasListenData?: boolean
  conn?: Connection
}

const generateListItem = (item: Item<ConnItemValue>) => {
  const fullName = item.payload.user
  return (
    <div className="inline block">
      <UserHead
        user={fullName}
        className="inline text-center mb-1"
        width={40}
        height={40}
      />
      <span className="inline text-[16px]">{fullName}</span>
    </div>
  )
}

function getLoading() {
  return (
    <Main>
      <Card>
        <h1>
          <LoaderIcon className="w-4 h-4" />
          <span className="inline block">Loading...</span>
        </h1>
      </Card>
    </Main>
  )
}

function getErrorPage(err: Error) {
  return (
    <Main>
      <Card>
        <h1>
          Error:{' '}
          <Link
            onClick={() => {
              window.location.reload()
            }}
          >
            reload
          </Link>
        </h1>
        <div>{err.message}</div>
      </Card>
    </Main>
  )
}

export default function Home() {
  const items: Items<ConnItemValue> = []
  const [sItems, setItems] = useState(items)
  const [sSelectedItem, setSelectedItem] = useState<Item<ConnItemValue> | null>(
    null
  )
  const [sIsRefresh, setIsRefresh] = useState(false)
  const room = useInitRoom()

  if (room.isLoading) {
    return getLoading()
  }
  if (room.err) {
    return getErrorPage(room.err)
  }
  if (!room.peer) {
    return getErrorPage(new Error('peer is null'))
  }

  const onConnectionOpen = (id: string, conn: Connection) => {
    console.log('connection open:', id)
    let item = sItems.find((item) => item.payload.id === id)
    if (!item) {
      const [, user] = splitRoomAndUser(id)

      const value: ConnItemValue = { id: id, conn: conn, user: id }
      if (user) {
        value.user = user
      }

      console.log('add connection:', value.user)
      item = { id: sItems.length + 1, payload: value, selected: false }
      const items = [...sItems, item]
      setItems(items)
    }

    if (item.payload.hasListenData) {
      return
    }

    conn.onReceive((data) => {
      console.log('receive data:', data.type, data.name)
      if (data.type !== 'file') {
        toast(`receive message from ${data.name}: ${data.payload}`)
        return
      }
      toast(`receive file ${data.name}`)
      fileDownload(data.payload, data.name)
    })
    conn.onError((err) => {
      toast.error(`connection to ${id} fail: ${err}`)
      const items = sItems.filter((item) => item.payload.user !== id)
      setItems(items)
    })
    item.payload.hasListenData = true
  }

  room.peer.onConnection(onConnectionOpen)

  const handleConnectToUser = (fullName: string) => {
    if (!room.peer) {
      toast.error('Connect fail: peer is null')
      return
    }
    console.log('connect to peer:', fullName)
    const conn = room.peer.connect(fullName)
    conn.onOpen(() => {
      onConnectionOpen(conn.id, conn)
    })
  }

  const handleSendFile = async (file: File) => {
    if (!sSelectedItem) {
      toast.error('No peer selected')
      return
    }
    if (!room.peer) {
      toast.error('Send fail: peer is null')
      return
    }

    let flag = false
    const checkFlag = (conn: Connection) => {
      flag || (conn.err && setTimeout(checkFlag, 500, conn))
    }

    const checkFlagPromise = (conn: Connection) => {
      return new Promise(() => {
        checkFlag(conn)
      })
    }
    const sendFile = async (conn: Connection) => {
      const blob = new Blob([file], { type: file.type })
      const data: Data = {
        type: 'file',
        name: file.name,
        payload: blob,
      }
      console.log('send file:', file.name)
      const sender = conn.send(data)
      if (!sender) {
        toast.error('Send file fail')
        return
      }
      await sender
      flag = true
    }

    const item = sSelectedItem
    if (!item.payload.conn || !item.payload.conn.ok) {
      const conn = room.peer.connect(item.payload.user)
      onConnectionOpen(conn.id, conn)
      conn.onOpen(() => {
        item.payload.conn = conn
        sendFile(conn)
      })
      await checkFlagPromise(conn)
    } else {
      await sendFile(item.payload.conn)
    }
  }

  const handleRefreshRoomUsers = () => {
    if (sIsRefresh) {
      return
    }
    setIsRefresh(true)
    fetch(getRoomUserListURL(room.room))
      .then((res) => {
        if (res.ok) {
          return res.json()
        }
        throw new Error('fetch room users fail: ' + res.statusText)
      })
      .then((data) => {
        console.log('fetch room users:', data)
        const items = [...sItems]
        let added = false
        data.map((ele: { id: string }) => {
          const id = ele.id
          if (!id || id == room.me) {
            return
          }
          if (!items.find((item) => item.payload.id === id)) {
            added = true
            const [, user] = splitRoomAndUser(id)
            const item: Item<ConnItemValue> = {
              id: items.length + 1,
              payload: { id: id, user: id },
              selected: false,
            }
            if (user) {
              item.payload.user = user
            }
            items.push(item)
          }
        })
        if (added) {
          setItems(items)
        }
        setIsRefresh(false)
      })
      .catch((err) => {
        console.log('fetch room users fail:', err)
        toast.error(`fetch room users fail: ${err}`)
        setIsRefresh(false)
      })
  }

  return (
    <Main>
      <Card>
        <h1 className={`text-4xl font-bold text-center px-2 py-8`}>Web Drop</h1>
        <div className="h-full items-center justify-center">
          <Card className="mb-4">
            <RoomText room={room} />
            <UserText room={room}></UserText>
            <div className="w-1/2 my-2">
              <InputBox
                placeholder="Input user id to connect..."
                buttonText="Invite"
                onSubmit={(id) => handleConnectToUser(id)}
              />
            </div>
          </Card>
          {sSelectedItem && (
            <FileSendDialog
              onClose={() => setSelectedItem(null)}
              handleSendFile={handleSendFile}
              user={room.user}
            />
          )}
          <Card className="h-full">
            <div className={`text-1xl font-bold`}>
              {sItems.length} Users
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
              items={sItems}
              setItems={setItems}
              selectCallback={(item) => setSelectedItem(item)}
              genContent={generateListItem}
            />
          </Card>
        </div>
        <div className="h-8"></div>
      </Card>
    </Main>
  )
}
