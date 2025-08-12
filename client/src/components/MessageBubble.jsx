import React from 'react'
import dayjs from 'dayjs'

// Render a single chat message with WhatsApp-like bubble and nib
export default function MessageBubble({ message }) {
  const isOutbound = message.direction === 'outbound'
  const timeText = message.timestamp ? formatTime(message.timestamp) : ''
  return (
    <div
      className={`bubble ${isOutbound ? 'bubble-out' : 'bubble-in'} sm:max-w-[75%] max-w-[85%] w-fit px-3 py-2 rounded-lg text-sm shadow transition-all duration-200 ${isOutbound ? 'ml-auto bg-[#DCF8C6] rounded-tr-none' : 'bg-white rounded-tl-none'} animate-fade-in`}
    >
      <div>{message.text}</div>
      <div className="text-[10px] text-[#667781] text-right mt-1 flex items-center gap-1 justify-end">
        <span>{timeText}</span>
        {statusIcon(message)}
      </div>
    </div>
  )
}

function formatTime(ts) {
  const d = dayjs(ts)
  const now = dayjs()
  if (d.isSame(now, 'day')) return d.format('hh:mm A')
  if (d.isSame(now.subtract(1, 'day'), 'day')) return `Yesterday ${d.format('hh:mm A')}`
  return d.format('MMM D, hh:mm A')
}

function statusIcon(m) {
  if (m.direction !== 'outbound') return null
  const base = 'ml-1'
  if (m.status === 'read') return <span className={`${base} text-[#53bdeb]`}>✅✅</span>
  if (m.status === 'delivered') return <span className={`${base} text-[#8696a0]`}>✅✅</span>
  return <span className={`${base} text-[#8696a0]`}>✅</span>
}
