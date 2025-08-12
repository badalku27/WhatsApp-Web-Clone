import React, { useMemo, useState } from 'react'
import './whatsapp-demo.css'

function timeNow() {
  const d = new Date()
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const DUMMY_CHATS = Array.from({ length: 10 }).map((_, i) => {
  const n = 9000000000 + i
  const name = [
    'Aarav', 'Ishita', 'Rohan', 'Priya', 'Kabir', 'Anaya', 'Vihaan', 'Sara', 'Arjun', 'Maya'
  ][i % 10]
  return {
    id: String(n),
    name,
    number: `+91 ${n}`,
    avatar: `https://i.pravatar.cc/100?u=${n}`,
    lastMessage: i % 2 ? 'Let’s catch up soon' : 'Typing…',
    time: '12:3' + (i % 10)
  }
})

const DUMMY_MESSAGES = [
  { id: 'm1', dir: 'in', text: 'Hey there! 👋', time: '11:45' },
  { id: 'm2', dir: 'out', text: 'Hi! How are you?', time: '11:46', status: 'read' },
  { id: 'm3', dir: 'in', text: 'All good. Coffee later?', time: '11:47' },
  { id: 'm4', dir: 'out', text: 'Sounds great. 5 PM works?', time: '11:48', status: 'delivered' },
]

export default function WhatsAppChatDemo() {
  const [chats] = useState(DUMMY_CHATS)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(chats[0])
  const [messages, setMessages] = useState(DUMMY_MESSAGES)
  const [input, setInput] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return chats
    return chats.filter(c => (c.name + ' ' + c.number).toLowerCase().includes(q))
  }, [search, chats])

  function send() {
    if (!input.trim()) return
    const m = {
      id: 'm' + Math.random().toString(36).slice(2),
      dir: 'out',
      text: input.trim(),
      time: timeNow(),
      status: 'sent'
    }
    setMessages(prev => [...prev, m])
    setInput('')
    // simulate delivered/read
    setTimeout(() => setMessages(prev => prev.map(x => x.id === m.id ? { ...x, status: 'delivered' } : x)), 600)
    setTimeout(() => setMessages(prev => prev.map(x => x.id === m.id ? { ...x, status: 'read' } : x)), 1600)
  }

  return (
    <div className="wa-demo">
      {/* Sidebar */}
      <aside className="wa-sidebar">
        <div className="wa-search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start new chat"
          />
        </div>
        <div className="wa-chat-list">
          {filtered.map((c) => (
            <button key={c.id} className={`wa-chat-item ${selected?.id === c.id ? 'active' : ''}`} onClick={() => setSelected(c)}>
              <img className="wa-avatar" src={c.avatar} alt={c.name} />
              <div className="wa-chat-meta">
                <div className="wa-chat-row">
                  <div className="wa-name">{c.name}</div>
                  <div className="wa-time">{c.time}</div>
                </div>
                <div className="wa-last">{c.lastMessage}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat window */}
      <main className="wa-chat">
        <header className="wa-chat-header">
          <img className="wa-avatar" src={selected.avatar} alt={selected.name} />
          <div className="wa-chat-title">
            <div className="wa-name">{selected.name}</div>
            <div className="wa-sub">{selected.number}</div>
          </div>
        </header>

        <section className="wa-messages">
          {messages.map((m) => (
            <div key={m.id} className={`wa-bubble ${m.dir === 'out' ? 'out' : 'in'}`}>
              <div className="wa-bubble-text">{m.text}</div>
              <div className="wa-bubble-meta">
                <span>{m.time}</span>
                {m.dir === 'out' && (
                  <span className={`wa-ticks ${m.status}`}>{m.status === 'read' ? '✓✓' : '✓✓'}</span>
                )}
              </div>
            </div>
          ))}
        </section>

        <div className="wa-inputbar">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message"
            onKeyDown={(e) => { if (e.key === 'Enter') send() }}
          />
          <button onClick={send}>Send</button>
        </div>
      </main>
    </div>
  )
}
