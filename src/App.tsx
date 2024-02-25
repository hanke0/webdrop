import { Card } from "./components/card";
import { Upload } from "./components/upload";
import { List, Item, Items } from "./components/list";
import { useEffect, useState } from "react";
import { Dialog } from "./components/dialog";
import { isGoodRoom, parseRoomAndName, generateName, parseName as parseUsername } from "./lib/room";
import { getRoomAndUid, getRoomFromCookie } from "./lib/client";
import { P2P, Connection, Data } from "./lib/p2p";
import { Button } from "./components/button";
import { InputBox } from "./components/inputbox";
import { toast } from 'react-hot-toast';
import config from "./lib/config"
import { UserHead } from "./components/user-head";
import fileDownload from 'js-file-download';
import { Fresh } from "./components/fresh";
import { Room } from "./components/room";

type ConnItemValue = {
  id: string
  fullName: string
  hasListenData?: boolean
  conn?: Connection
}

export default function Home() {
  const items: Items<ConnItemValue> = [
    // { id: 1, value: { id: '1', fullName: 'reserved-ram' }, selected: false },
    // { id: 2, value: { id: '2', fullName: 'reserved-raccoon' }, selected: false },
    // { id: 3, value: { id: '3', fullName: 'sensitive-giraffe' }, selected: false },
    // { id: 4, value: { id: '4', fullName: 'gentle-flamingo' }, selected: false },
  ]
  const [sItems, setItems] = useState<Items<ConnItemValue>>(items);
  const [sSelectedItem, setSelectedItem] = useState<Item<ConnItemValue> | null>(null);
  const [sFile, setFile] = useState<File | null>(null);
  const [sSendStatus, setSendStatus] = useState(false);
  const [sUser, setUser] = useState(generateName());
  const [sRoom, setRoom] = useState('');
  const [sPeer, setPeer] = useState<P2P | null>(null);

  const generateListItem = (item: Item<ConnItemValue>) => {
    const fullName = item.value.fullName
    return <div className="inline block">
      <UserHead fullName={fullName} className="inline text-center mb-1" width={40} height={40} />
      <span className="inline text-[16px]">{fullName}</span>
    </div>
  }

  useEffect(() => {
    let [roomID, uid] = getRoomAndUid();
    if (!uid) {
      uid = sUser.fullName;
    } else {
      const name = parseUsername(uid)
      if (name) {
        setUser(name);
      }
    }
    if (!roomID || !isGoodRoom(roomID)) {
      roomID = getRoomFromCookie();
      if (!roomID || !isGoodRoom(roomID)) {
        roomID = 'DEFAULT';
      }
    }
    setRoom(roomID);
  }, [])

  useEffect(() => {
    if (!sRoom || !sUser) {
      return
    }
    console.log(`room: ${sRoom}, user:${sUser.fullName}`);
    const peer = new P2P({
      room: sRoom,
      username: sUser,
      hostname: config.PEER_HOSTNAME,
      port: config.PEER_PORT,
      path: config.PEER_PATH
    });

    console.log("construct peer", peer);
    peer.onOpen((id) => {
      console.log("peer open", id);
    })
    peer.onError((err) => {
      console.log("peer error ---- ", err);
      toast.error(`peer error: ${err.message}`);
    })
    peer.onConnection(onConnectionOpen)
    setPeer(peer);
  }, [sRoom, sUser])

  const onConnectionOpen = (id: string, conn: Connection) => {
    console.log("connection open:", id);
    let item = sItems.find((item) => item.value.id === id)
    if (!item) {
      const [, user] = parseRoomAndName(id);

      const value: ConnItemValue = { id: id, conn: conn, fullName: id };
      if (user) {
        value.fullName = user.fullName;
      }

      console.log("add connection:", value.fullName);
      item = { id: sItems.length + 1, value: value, selected: false };
      const items = [...sItems, item];
      setItems(items);
    }

    if (item.value.hasListenData) {
      return;
    }

    conn.onReceive((data) => {
      console.log("receive data:", data.type, data.name);
      if (data.type !== 'file') {
        toast(`receive message from ${data.name}: ${data.payload}`)
        return
      }
      toast(`receive file ${data.name}`)
      fileDownload(data.payload, data.name);
    })
    conn.onError((err) => {
      toast.error(`connection to ${id} fail: ${err}`);
      const items = sItems.filter((item) => item.value.fullName !== id);
      setItems(items);
    })
    item.value.hasListenData = true;
  }

  const onConnectUser = (fullName: string) => {
    if (!sPeer) {
      console.log("peer is null. connect to peer:", fullName);
      return;
    }
    console.log("connect to peer:", fullName);
    const conn = sPeer.connect(fullName);
    console.log("conn:", conn);
    conn.onOpen(() => {
      onConnectionOpen(conn.id, conn);
    })
  }

  function onFileChange(file?: File) {
    if (file) {
      console.log("upload file", file.name);
    }
    setFile(file || null);
  }

  const handleSendFile = async () => {
    if (sSendStatus) {
      setSendStatus(false);
      setFile(null);
      return;
    }
    if (!sFile) {
      toast.error("No file to send");
      return;
    }
    if (!sPeer) {
      toast.error("No peer to send");
      return;
    }
    if (!sSelectedItem) {
      toast.error("No peer selected");
      return;
    }
    const item = sSelectedItem;
    const file = sFile;
    setSendStatus(true);

    const sendFile = (file: File, conn: Connection) => {
      const blob = new Blob([file], { type: file.type });
      const data: Data = {
        type: 'file',
        name: file.name,
        payload: blob,
      }
      console.log("send file:", file.name);
      conn.send(data)?.then(() => {
        console.log("send file done:", file.name);
        toast.success(`send file to ${item.value.fullName} success`)
        setSendStatus(false);
        setFile(null);
      }).catch((err: Error) => {
        console.log("send file fail:", err);
        toast.error(`send file fail: ${err}`);
        setSendStatus(false);
        setFile(null);
      })
    }

    if (!item.value.conn || !item.value.conn.ok) {
      const conn = sPeer.connect(item.value.fullName);
      onConnectionOpen(conn.id, conn);
      conn.onOpen(() => {
        item.value.conn = conn;
        sendFile(file, conn)
      })
    } else {
      sendFile(file, item.value.conn)
    }
  }

  const onSelectItem = (item: Item<ConnItemValue>) => {
    item.selected = true;
    setSelectedItem(item);
  }

  const onCloseSelectItem = () => {
    setSelectedItem(null);
    setFile(null);
    setSendStatus(false);
  }

  const [sShowRoom, setShowRoom] = useState(false);

  const [sIsRefresh, setIsRefresh] = useState(false);
  const onFreshRoomUsers = () => {
    if (sIsRefresh) {
      return
    }
    if (!sPeer) {
      console.log("peer is null. fresh room users");
      return;
    }
    if (!sRoom) {
      console.log("room is null. fresh room users");
      return;
    }
    const me = sPeer.id;
    setIsRefresh(true)
    console.log("fresh room users");
    fetch(`/api/room/${sRoom}/users`).then((res) => {
      if (res.ok) {
        return res.json();
      }
      throw new Error("fetch room users fail: " + res.statusText);
    }).then((data) => {
      console.log("fetch room users:", data);
      const items = [...sItems];
      let added = false;
      data.map((ele: { id: string }) => {
        const id = ele.id;
        if (!id || id == me) {
          return
        }
        if (!items.find((item) => item.value.id === id)) {
          added = true;
          const [, user] = parseRoomAndName(id);
          const value = {
            id: items.length + 1,
            value: { id: id, fullName: id },
            selected: false
          }
          if (user) {
            value.value.fullName = user.fullName;
          }
          items.push(value)
        }
      })
      if (added) {
        setItems(items);
      }
      setIsRefresh(false);
    }).catch((err) => {
      console.log("fetch room users fail:", err);
      toast.error(`fetch room users fail: ${err}`);
      setIsRefresh(false);
    })
  }

  return (
    <>
      <main
        className={`fond-sans min-h-screen m-auto items-center justify-between px-4 py-4 lg:py-16 lg:px-32 max-w-[900px]`}
      >
        {sRoom && sUser && sPeer ?
          <Card>
            <h1 className={`text-4xl font-bold text-center px-2 py-8`}>Web Drop</h1>
            <div className="h-full items-center justify-center">
              <Card className="mb-4">
                <div className={`text-1xl mb-3`}>Room: <a
                  className="text-blue-500 hover:pointer" href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowRoom(true);
                  }}>{sRoom}</a>
                  {sShowRoom &&
                    <Room
                      currentRoom={sRoom}
                      currentUser={sUser}
                      setCurrentRoom={setRoom}
                      onClose={() => setShowRoom(false)}
                    />
                  }
                </div>
                <div>You are
                  <span onClick={() => {
                    navigator?.clipboard?.writeText(sUser.fullName).then(() => {
                      toast.success("copy username to clipboard");
                    }).catch((err) => {
                      console.log("copy fail:", err);
                    })
                  }} className="inline border rounded-full mx-3 py-1 px-3">
                    <UserHead className="inline mb-1" fullName={sUser.fullName} width={20} height={20} />
                    <span className="select-all">{sUser.fullName}</span>
                  </span>
                </div>
                <div className="w-1/2 my-2">
                  <InputBox placeholder="Input user id to connect..." buttonText="Invite"
                    onSubmit={(id) => onConnectUser(id)}
                  />
                </div>
              </Card>
              {
                sSelectedItem && <Dialog closeable={true} onClose={onCloseSelectItem}>
                  <h3 className="py-3 px-3 text-[20px]">
                    <span className="text-[20px]">Send to</span>
                    <div className="inline border rounded-lg px-1 mx-1">
                      <UserHead fullName={sSelectedItem.value.fullName}
                        className="inline text-center mb-1" width={20} height={20}
                      />
                      <span className="text-[20px]">{sSelectedItem.value.fullName}</span>
                    </div>
                  </h3>
                  <Upload callback={onFileChange}></Upload>
                  {
                    sFile && <div className="py-3 px-3">
                      {sFile.name}
                    </div>
                  }
                  <Button onClick={handleSendFile}>
                    {sSendStatus ?
                      <>
                        <svg aria-hidden="true" role="status" className="inline w-4 h-4 me-3 text-gray-200 animate-spin" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" />
                          <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="#1C64F2" />
                        </svg>
                        <span>Cancel</span>
                      </>
                      :
                      <span>Send</span>
                    }
                  </Button>
                </ Dialog>
              }

              <Card className="h-full">
                <div className={`text-1xl font-bold`}>{sItems.length} Users
                  <Fresh width={16} height={16}
                    className="mb-1 mx-2 fill-current inline hover:fill-cyan-700 cursor-pointer"
                    onClick={onFreshRoomUsers} />
                </div>

                <List className="flex flex-row flex-wrap justify-center"
                  itemClassName="rounded-full px-6"
                  items={sItems} setItems={setItems}
                  selectCallback={onSelectItem}
                  genContent={generateListItem} />
              </Card>
            </div>
            <div className="h-8"></div>
          </Card>
          :
          <Card>
            <h1>Loading...</h1>
          </Card>
        }
      </main>
    </>
  );
}
