import React, { useEffect, useMemo, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import { getChats, getConversation, sendMessage, getStatuses, postStatus, uploadStatusMedia, deleteChat, deleteStatuses, deleteStatusItem } from './api'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
dayjs.extend(relativeTime)
import Avatar from './components/Avatar'
import { format } from 'date-fns'
import MessageBubble from './components/MessageBubble'
import Logo from './assets/logo.svg'

let API_BASE = import.meta.env.VITE_API_BASE
if (!API_BASE) {
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location
    const devApiPort = (port === '5173' || port === '5174') ? '8081' : '8080'
    API_BASE = `${protocol}//${hostname}:${devApiPort}/api`
  } else {
    API_BASE = 'http://localhost:8081/api'
  }
}
const SOCKET_BASE = API_BASE.replace(/\/api\/?$/, '')
const LOGO_URL = import.meta.env.VITE_LOGO_URL || Logo

export default function App() {
  const [chats, setChats] = useState([])
  const [unread, setUnread] = useState({}) // wa_id -> count
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [newWaId, setNewWaId] = useState('')
  const [newName, setNewName] = useState('')
  const [tab, setTab] = useState('chats') // chats | status
  const [statuses, setStatuses] = useState([])
  const [viewer, setViewer] = useState(null) // { wa_id, name, item }
  const [query, setQuery] = useState('') // chat search
  const [typing, setTyping] = useState({}) // wa_id -> boolean
  const [statusMsg, setStatusMsg] = useState('') // status tab feedback
  const [statusOpen, setStatusOpen] = useState(false) // status modal
  const [statusType, setStatusType] = useState('image') // image | video | text
  const messagesEndRef = useRef(null)
  const statusFileRef = useRef(null)
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' && localStorage.getItem('theme')) || 'light')

  const socket = useMemo(() => io(SOCKET_BASE, { transports: ['websocket'] }), [])

  // Resolve media URLs from status items robustly
  const mediaUrlFor = (u) => {
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    if (u.startsWith('/')) return SOCKET_BASE + u
    return SOCKET_BASE + '/' + u
  }
  const [imgErr, setImgErr] = useState('')

  const fmtTimeShort = (ts) => {
    if (!ts) return ''
    const d = dayjs(ts)
    const now = dayjs()
  if (d.isSame(now, 'day')) return d.format('hh:mm A')
  if (d.isSame(now.subtract(1, 'day'), 'day')) return `Yesterday ${d.format('hh:mm A')}`
  return d.format('MMM D, hh:mm A')
  }

  const statusIcon = (m) => {
    if (m.direction !== 'outbound') return null
    const base = 'ml-1'
    if (m.status === 'read') return <span className={`${base} text-[#53bdeb]`}>✅✅</span>
    if (m.status === 'delivered') return <span className={`${base} text-[#8696a0]`}>✅✅</span>
    return <span className={`${base} text-[#8696a0]`}>✅</span>
  }

  useEffect(() => {
    getChats()
      .then((c) => { setChats(c); setError('') })
      .catch((e) => {
        console.error(e)
        setError('Backend is unreachable. Check server and MONGODB connection.')
      })
    getStatuses().then(setStatuses).catch(() => {})
  }, [])

  useEffect(() => {
    if (!active) return
    getConversation(active.wa_id)
      .then((c) => { setMessages(c.messages); setActive((prev)=>prev?{...prev, profilePic: c.profilePic || prev.profilePic}:prev); setError('') })
      .catch((e) => {
        console.error(e)
        setError('Failed to load conversation')
      })
  }, [active])

  // When viewing a chat, mark outbound messages as read locally for immediate feedback
  useEffect(() => {
    if (!active || !messages?.length) return
    setMessages((prev) => prev.map(m => (m.direction === 'outbound' && m.status !== 'read') ? { ...m, status: 'read' } : m))
  }, [active])

  // Auto-scroll to latest message on updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, active])

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])

  useEffect(() => {
    socket.on('connect', () => {})
  socket.on('message:new', (msg) => {
      if (active && msg.wa_id === active.wa_id) {
        setMessages((prev) => [...prev, msg])
      }
      // Unread badge when message arrives for other chats
      if (!active || msg.wa_id !== active.wa_id) {
        setUnread((u) => ({ ...u, [msg.wa_id]: (u[msg.wa_id] || 0) + 1 }))
      }
      setChats((prev) => {
        const idx = prev.findIndex(c => c.wa_id === msg.wa_id)
        const item = { wa_id: msg.wa_id, name: msg.name, lastMessage: msg, profilePic: msg.profilePic }
        const list = idx >= 0 ? [item, ...prev.filter((_, i) => i !== idx)] : [item, ...prev]
        return list.sort((a,b)=>{
          const ta = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : 0
          const tb = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : 0
          return tb - ta
        })
      })
    })
    socket.on('message:status', ({ id, status }) => {
      setMessages((prev) => prev.map(m => (m.id === id || m.meta_msg_id === id) ? { ...m, status } : m))
    })
    socket.on('typing', ({ wa_id }) => {
      if (!wa_id) return
      setTyping((t) => ({ ...t, [wa_id]: true }))
      // auto-clear typing after 2s of inactivity
      setTimeout(() => {
        setTyping((t) => ({ ...t, [wa_id]: false }))
      }, 2000)
    })
    socket.on('status:new', ({ wa_id, name, item }) => {
      setStatuses((prev) => {
        const idx = prev.findIndex(s => s.wa_id === wa_id)
        if (idx >= 0) {
          const copy = [...prev]
          const updated = { ...copy[idx], items: [...copy[idx].items, item], lastUpdated: item.timestamp }
          copy.splice(idx, 1)
          return [updated, ...copy]
        }
        return [{ wa_id, name, items: [item], lastUpdated: item.timestamp }, ...prev]
      })
    })
    socket.on('chat:deleted', ({ wa_id }) => {
      setChats((prev) => prev.filter((c) => c.wa_id !== wa_id))
      if (active?.wa_id === wa_id) {
        setActive(null)
        setMessages([])
      }
    })
    socket.on('user:updated', (user) => {
      // update active header
      setActive((prev)=> prev && prev.wa_id===user.wa_id ? { ...prev, name: user.name || prev.name, profilePic: user.profilePic || prev.profilePic } : prev)
      // update chats list avatar/name
      setChats((prev)=> prev.map(c => c.wa_id===user.wa_id ? { ...c, name: user.name || c.name, profilePic: user.profilePic || c.profilePic } : c))
      // update statuses card label if shown
      setStatuses((prev)=> prev.map(s => s.wa_id===user.wa_id ? { ...s, name: user.name || s.name } : s))
    })
    return () => {
      socket.off('message:new')
      socket.off('message:status')
      socket.off('typing')
      socket.off('status:new')
  socket.off('chat:deleted')
  socket.off('user:updated')
    }
  }, [socket, active])

  const onSend = async (e) => {
    e.preventDefault()
    if (!active) {
      setError('Select or create a chat before sending')
      return
    }
    if (!input.trim()) {
      setError('Type a message')
      return
    }
    try {
      const msg = await sendMessage(active.wa_id, input.trim(), active.name)
      setMessages((prev) => [...prev, msg])
      setInput('')
      setError('')
      // reset unread for active chat after you send
      setUnread((u) => ({ ...u, [active.wa_id]: 0 }))
    } catch (e) {
      console.error(e)
      setError('Failed to send message')
    }
  }

  // Emit typing when user types
  useEffect(() => {
    if (!active) return
    if (!input) return
    socket.emit('typing', { wa_id: active.wa_id })
  }, [input, active, socket])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(c => (c.name || c.wa_id).toLowerCase().includes(q) || c.lastMessage?.text?.toLowerCase().includes(q))
  }, [chats, query])

  return (
    <>
    <div className="h-screen w-screen flex bg-[#f0f0f0] text-[#111] dark:bg-[#0b141a] dark:text-[#e9edef]">
  <aside className={`${active ? 'hidden sm:flex' : 'flex'} w-full sm:w-[36%] md:w-[32%] lg:w-[28%] bg-[#f0f0f0] border-r border-[#d1d7db] flex-col`}>
  <div className="p-3 border-b border-[#d1d7db] flex items-center gap-2 sticky top-0 bg-[#075E54] text-white z-10 dark:bg-[#111b21] dark:border-[#222e35]">
          <img src={LOGO_URL} alt="logo" className="w-5 h-5" />
          <div className="font-semibold tracking-wide text-sm pr-1 hidden md:block">WHATSAPP WEB CLONE</div>
          <input
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder="Search or start conversation"
            className="w-full bg-white text-black rounded-full px-3 py-2 text-sm border border-[#c7c7c7] dark:bg-[#202c33] dark:border-[#2a3942] dark:placeholder-[#8696a0]"
          />
          <button onClick={() => setNewOpen(v=>!v)} className="text-xs px-3 py-2 rounded bg-white text-black border border-white/20 hover:bg-white/90 dark:bg-[#202c33] dark:border-[#2a3942] dark:hover:bg-[#1f2c34]">+ New Chat</button>
          <button onClick={() => setStatusOpen(true)} className="text-xs px-3 py-2 rounded bg-white text-black border border-white/20 hover:bg-white/90 dark:bg-[#202c33] dark:border-[#2a3942] dark:hover:bg-[#1f2c34]">Status</button>
          <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="text-xs px-3 py-2 rounded bg-white border border-[#c7c7c7] hover:bg-[#f6f6f6] dark:bg-[#202c33] dark:border-[#2a3942] dark:hover:bg-[#1f2c34]">{theme==='dark' ? 'Light' : 'Dark'}</button>
        </div>
        {newOpen && (
          <div className="p-3 border-b border-[#d1d7db] space-y-2 bg-white dark:bg-[#111b21] dark:border-[#222e35]">
            <input
              value={newWaId}
              onChange={e=>setNewWaId(e.target.value)}
              placeholder="Phone (wa_id) e.g. 919999000001"
              className="w-full bg-white text-[#111] rounded px-2 py-2 text-sm border border-[#c7c7c7] dark:bg-[#202c33] dark:text-[#e9edef] dark:border-[#2a3942]"
            />
            <input
              value={newName}
              onChange={e=>setNewName(e.target.value)}
              placeholder="Name (optional)"
              className="w-full bg-white text-[#111] rounded px-2 py-2 text-sm border border-[#c7c7c7] dark:bg-[#202c33] dark:text-[#e9edef] dark:border-[#2a3942]"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!newWaId.trim()) return
                  const c = { wa_id: newWaId.trim(), name: newName.trim() }
                  setActive(c)
                  setMessages([])
                  // ensure the chat appears on the list even before first message
                  setChats((prev) => {
                    const exists = prev.some(x => x.wa_id === c.wa_id)
                    if (exists) return prev
                    return [{ wa_id: c.wa_id, name: c.name || c.wa_id, lastMessage: null }, ...prev]
                  })
                  setNewOpen(false)
                }}
                className="bg-[#00a884] text-white px-3 py-2 rounded text-xs hover:bg-[#029a79]">
                Start
              </button>
              <button onClick={()=>{ setNewOpen(false); setNewWaId(''); setNewName(''); }} className="text-xs px-3 py-2 rounded bg-white border border-[#c7c7c7] hover:bg-[#f6f6f6] dark:bg-[#202c33] dark:border-[#2a3942] dark:hover:bg-[#1f2c34]">Cancel</button>
            </div>
          </div>
        )}
        <div className="overflow-y-auto">
          {error && (
            <div className="p-3 text-sm text-red-500 border-b border-[#d1d7db] bg-white dark:bg-[#111b21] dark:border-[#222e35]">{error}</div>
          )}
          {(!chats || chats.length===0) && (
            <div className="p-3 text-sm text-[#667781] border-b border-[#d1d7db] bg-white dark:bg-[#111b21] dark:border-[#222e35] dark:text-[#8696a0]">No conversations yet — start one.</div>
          )}
          {filtered
            .slice()
            .sort((a,b)=>{
              const ta = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : 0
              const tb = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : 0
              return tb - ta
            })
            .map((c) => (
            <button key={c.wa_id} onClick={() => { setActive(c); setUnread((u)=>({ ...u, [c.wa_id]: 0 })) }} className={`w-full flex gap-3 px-3 py-2 hover:bg-[#ebedef] ${active?.wa_id===c.wa_id ? 'bg-[#d9fdd3]' : 'bg-white'} border-b border-[#f0f2f5] dark:bg-[#111b21] dark:hover:bg-[#202c33] dark:border-[#222e35]`}>
              <Avatar id={c.wa_id} name={c.name || c.wa_id} src={c.profilePic} size={44} />
              <div className="flex-1 text-left">
                <div className="flex justify-between items-baseline">
                  <div className="font-medium truncate">{c.name || c.wa_id}</div>
                  {c.lastMessage?.timestamp && (<div className="text-xs text-[#667781] dark:text-[#8696a0]">{fmtTimeShort(c.lastMessage.timestamp)}</div>)}
                </div>
                <div className="text-sm text-[#667781] truncate dark:text-[#8696a0]">{c.lastMessage?.text || ' '}</div>
              </div>
              {unread[c.wa_id] > 0 && (
                <span className="text-[10px] bg-[#25D366] text-white rounded-full w-5 h-5 grid place-items-center">{unread[c.wa_id]}</span>
              )}
            </button>
          ))}
        </div>
      </aside>

  <main className={`${active ? 'flex' : 'hidden sm:flex'} flex-1 flex-col bg-[#e5ddd5] wa-chat-bg dark:bg-[#0b141a]`}>
  {active ? (
          <>
  <header className="p-3 border-b border-[#d1d7db] bg-[#075E54] text-white flex items-center gap-3 sticky top-0 z-10 dark:bg-[#111b21] dark:border-[#222e35]">
      <img src={LOGO_URL} alt="logo" className="w-5 h-5 hidden sm:block" />
      <button className="sm:hidden text-xs px-2 py-1 bg-white border border-[#c7c7c7] rounded" onClick={()=>setActive(null)}>Back</button>
      <Avatar id={active.wa_id} name={active.name || active.wa_id} src={active.profilePic} size={40} />
              <div>
    <div className="font-medium">{active.name || active.wa_id}</div>
  <div className="text-xs opacity-90">{active.wa_id}</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!active) return
                    if (!confirm('Delete this chat permanently?')) return
                    try {
                      await deleteChat(active.wa_id)
                    } catch (e) {
                      console.warn('Server delete failed, removing locally:', e?.message)
                    } finally {
                      setChats((prev) => prev.filter((c) => c.wa_id !== active.wa_id))
                      setMessages([])
                      setActive(null)
                      setError('')
                    }
                  }}
                  className="text-xs px-2 py-1 bg-white border border-[#c7c7c7] rounded hover:bg-[#f6f6f6]"
                >
                  Delete chat
                </button>
              </div>
            </header>
            <section className="flex-1 overflow-y-auto p-4 space-y-2">
              {typing[active.wa_id] && (
                <div className="mx-auto text-xs text-[#667781] bg-white/80 px-2 py-1 rounded-full w-fit dark:bg-[#202c33] dark:text-[#8696a0]">typing…</div>
              )}
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              <div ref={messagesEndRef} />
            </section>
            <form onSubmit={onSend} className="p-3 bg-[#f0f0f0] border-t border-[#d1d7db] flex gap-2 sticky bottom-0 pb-[env(safe-area-inset-bottom)] dark:bg-[#111b21] dark:border-[#222e35]">
              <input value={input} onChange={(e)=>setInput(e.target.value)} placeholder="Type a message" className="flex-1 bg-white text-[#111] rounded-full px-4 py-2 outline-none border border-[#c7c7c7] dark:bg-[#202c33] dark:text-[#e9edef] dark:border-[#2a3942]" />
              <button disabled={!active || !input.trim()} className={`font-semibold rounded-full px-4 ${(!active || !input.trim()) ? 'bg-gray-300 text-black/60 cursor-not-allowed' : 'bg-[#00a884] hover:bg-[#029a79] text-white'}`}>Send</button>
            </form>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-[#667781]">Pick a conversation from the list to get started.</div>
        )}

        {viewer && (
          <div className="absolute inset-0 bg-black/80 grid place-items-center p-6" onClick={()=>setViewer(null)}>
            <div className="max-w-2xl w-full bg-[#111b21] rounded-lg p-4" onClick={(e)=>e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-3">
                <div className="font-medium flex-1">{viewer.name}</div>
                <button
                  onClick={async ()=>{ try{ await deleteStatusItem(viewer.wa_id, viewer.item.id); setStatuses((prev)=>{ const copy = prev.map(s=> s.wa_id===viewer.wa_id ? { ...s, items: (s.items||[]).filter(it=>it.id!==viewer.item.id) } : s).filter(s=> (s.items||[]).length>0); return copy;}); setViewer(null);}catch(err){ console.error(err);} }}
                  className="text-xs px-2 py-1 rounded bg-white text-black border border-[#8a8a8a] hover:bg-[#f6f6f6]"
                >Delete</button>
                <button className="text-xs px-2 py-1 rounded bg-white text-black border border-[#8a8a8a] hover:bg-[#f6f6f6]" onClick={()=>setViewer(null)}>Close</button>
              </div>
              {viewer.item?.type==='text' ? (
                <div className="p-6 text-center text-lg">{viewer.item.text}</div>
              ) : viewer.item?.type==='image' ? (
                <img alt="status" src={mediaUrlFor(viewer.item?.mediaUrl)} onError={()=>setImgErr('Failed to load image')} className="max-h-[70vh] w-full object-contain rounded bg-black/20" />
              ) : (
                <video controls src={mediaUrlFor(viewer.item?.mediaUrl)} className="max-h-[70vh] w-full object-contain rounded bg-black/20" />
              )}
              <div className="text-xs text-gray-400 text-right mt-3">{viewer.item?.timestamp ? format(new Date(viewer.item.timestamp),'MMM d, p') : ''}</div>
              {imgErr && (
                <div className="text-xs text-red-400 mt-2">{imgErr} — <a href={mediaUrlFor(viewer.item?.mediaUrl)} target="_blank" rel="noreferrer" className="underline">Open in new tab</a></div>
              )}
            </div>
          </div>
        )}
      </main>
  </div>

  {statusOpen && (
      <div className="fixed inset-0 bg-black/50 grid place-items-center p-4" onClick={()=>setStatusOpen(false)}>
        <div className="w-full max-w-md bg-white text-black rounded-lg p-4 dark:bg-[#111b21] dark:text-[#e9edef]" onClick={(e)=>e.stopPropagation()}>
          <div className="font-semibold mb-3">Status — upload image or video</div>
          <div className="text-xs opacity-80 mb-2">API: {API_BASE}</div>
          <div className="grid gap-2 text-sm">
            <input value={newWaId} onChange={e=>setNewWaId(e.target.value)} placeholder="Your wa_id" className="bg-white text-black border border-[#8a8a8a] rounded px-2 py-2 dark:bg-[#202c33] dark:text-[#e9edef] dark:border-[#2a3942]" />
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Your name (optional)" className="bg-white text-black border border-[#8a8a8a] rounded px-2 py-2 dark:bg-[#202c33] dark:text-[#e9edef] dark:border-[#2a3942]" />
            <div className="flex items-center gap-2">
              <select value={statusType} onChange={e=>setStatusType(e.target.value)} className="bg-white text-black border border-[#8a8a8a] rounded px-2 py-2 dark:bg-[#202c33] dark:text-[#e9edef] dark:border-[#2a3942]">
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="text">Text</option>
              </select>
              {statusType !== 'text' ? (
                <>
                  <input ref={statusFileRef} name="file" type="file" accept={statusType==='image' ? 'image/*' : 'video/*'} className="text-sm" />
                  <button onClick={async ()=>{ const file=statusFileRef.current?.files?.[0]; if(!newWaId||!file){ setStatusMsg('Set wa_id and pick a file'); return;} try{ const res = await uploadStatusMedia({ wa_id:newWaId, name:newName, type: statusType, file }); if(statusFileRef.current) statusFileRef.current.value=''; setStatusMsg('Status uploaded'); setError(''); // optimistic update
                    if(res?.status){ setStatuses((prev)=>{ const idx=prev.findIndex(s=>s.wa_id===res.status.wa_id); if(idx>=0){ const copy=[...prev]; copy[idx]=res.status; return copy; } return [res.status, ...prev]; }); }
                  }catch(err){ console.error(err); setStatusMsg('Failed to upload'); } setTimeout(()=>setStatusMsg(''), 2000) }} className="px-3 py-2 rounded bg-[#00a884] text-white hover:bg-[#029a79]">Upload</button>
                </>
              ) : (
                <>
                  <input value={statusText} onChange={e=>setStatusText(e.target.value)} placeholder="What's on your mind?" className="flex-1 bg-white text-black border border-[#8a8a8a] rounded px-2 py-2 dark:bg-[#202c33] dark:text-[#e9edef] dark:border-[#2a3942]" />
                  <button onClick={async ()=>{ if(!newWaId||!statusText.trim()){ setStatusMsg('Set wa_id and type some text'); return;} try{ const res = await postStatus({ wa_id:newWaId, name:newName, type:'text', text: statusText.trim() }); setStatusText(''); setStatusMsg('Status posted'); setError(''); if(res?.status){ setStatuses((prev)=>{ const idx=prev.findIndex(s=>s.wa_id===res.status.wa_id); if(idx>=0){ const copy=[...prev]; copy[idx]=res.status; return copy; } return [res.status, ...prev]; }); } }catch(err){ console.error(err); setStatusMsg('Failed to post'); } setTimeout(()=>setStatusMsg(''), 2000) }} className="px-3 py-2 rounded bg-[#00a884] text-white hover:bg-[#029a79]">Post</button>
                </>
              )}
            </div>
            {newWaId && (
              <button onClick={async()=>{ try{ await deleteStatuses(newWaId); setStatuses((prev)=>prev.filter(s=>s.wa_id!==newWaId)); setStatusMsg('All your statuses deleted'); }catch(e){ console.error(e); setStatusMsg('Failed to delete'); } setTimeout(()=>setStatusMsg(''),2000) }} className="text-xs px-3 py-2 rounded bg-white border border-[#c7c7c7] hover:bg-[#f6f6f6] dark:bg-[#202c33] dark:border-[#2a3942] dark:hover:bg-[#1f2c34]">Delete my statuses</button>
            )}
            {statusMsg && <div className="text-xs text-[#444] dark:text-[#8696a0]">{statusMsg}</div>}
          </div>

          <div className="mt-4">
            <div className="font-medium mb-2">Recent statuses</div>
            <div className="max-h-60 overflow-y-auto divide-y divide-[#f0f2f5] dark:divide-[#222e35]">
              {statuses.length === 0 && (
                <div className="text-xs text-[#667781] dark:text-[#8696a0] py-2">No statuses yet.</div>
              )}
              {statuses.map(s => (
                <div key={s.wa_id} className="py-2">
                  <div className="text-sm font-semibold">{s.name || s.wa_id}</div>
                  <div className="flex gap-3 mt-2 flex-wrap items-center">
                    {(s.items||[]).map(item => {
                      const url = mediaUrlFor(item?.mediaUrl)
                      return (
                        <div key={item.id} className="flex items-center gap-2">
                          <button onClick={()=>{ setImgErr(''); setViewer({ wa_id:s.wa_id, name: s.name || s.wa_id, item })}} className="rounded border border-[#c7c7c7] dark:border-[#2a3942] overflow-hidden">
                            {item.type==='image' ? (
                              <img alt="thumb" src={url} className="w-10 h-10 object-cover" />
                            ) : item.type==='video' ? (
                              <div className="w-10 h-10 grid place-items-center bg-black/20 text-[10px]">video</div>
                            ) : (
                              <div className="w-10 h-10 grid place-items-center bg-white/50 text-[10px]">{(item.text||'text').slice(0,4)}</div>
                            )}
                          </button>
                          {item.type!=='text' && (
                            <a href={url} target="_blank" rel="noreferrer" className="text-xs underline text-[#0b93f6]">Open</a>
                          )}
                          <button
                            title="Delete"
                            onClick={async ()=>{ try{ await deleteStatusItem(s.wa_id, item.id); setStatuses((prev)=>{ const copy = prev.map(st=> st.wa_id===s.wa_id ? { ...st, items: (st.items||[]).filter(it=>it.id!==item.id) } : st).filter(st=> (st.items||[]).length>0); return copy;}); }catch(err){ console.error(err);} }}
                            className="text-xs px-2 py-1 rounded bg-white text-black border border-[#8a8a8a] hover:bg-[#f6f6f6]"
                          >Delete</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right mt-2">
              <button onClick={async()=>{ try{ const s = await getStatuses(); setStatuses(s); }catch(e){ console.error(e);} }} className="text-xs px-3 py-2 rounded bg-white border border-[#c7c7c7] hover:bg-[#f6f6f6] dark:bg-[#202c33] dark:border-[#2a3942] dark:hover:bg-[#1f2c34]">Refresh statuses</button>
            </div>
          </div>

          <div className="mt-4 text-right">
            <div className="float-left text-xs text-[#667781]">Built by <a className="underline" href="https://github.com/badalku27" target="_blank" rel="noreferrer">badalku27</a></div>
            <button onClick={()=>setStatusOpen(false)} className="px-3 py-2 rounded bg-[#00a884] text-white hover:bg-[#029a79]">Close</button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
