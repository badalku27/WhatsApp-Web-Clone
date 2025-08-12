export function makeSampleChats() {
  const now = Date.now()
  const mk = (i, name) => ({
    wa_id: `9199990000${i}`,
    name,
    lastMessage: {
      id: `local_${now - i * 10000}`,
      wa_id: `9199990000${i}`,
      name,
      direction: i % 2 ? 'inbound' : 'outbound',
      type: 'text',
      text: `Hello from ${name}`,
      timestamp: new Date(now - i * 10000).toISOString(),
      status: 'delivered',
    },
    profilePic: '',
  })
  return [mk(1,'Alice'), mk(2,'Bob'), mk(3,'Charlie'), mk(4,'Daisy')]
}

export function makeSampleConversation(wa_id, name='Demo User') {
  const base = Date.now() - 600000
  const seq = Array.from({ length: 8 }).map((_, i) => ({
    id: `local_${base + i*60000}`,
    wa_id,
    name,
    direction: i % 2 ? 'inbound' : 'outbound',
    type: 'text',
    text: i % 2 ? 'Got it 👍' : 'Sending a message…',
    timestamp: new Date(base + i*60000).toISOString(),
    status: i < 6 ? 'read' : 'sent',
  }))
  return seq
}
