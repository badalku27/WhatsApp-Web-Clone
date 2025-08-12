// Utilities: capture screenshots and export demo data
// Optional dependency: Include html2canvas via <script> to enable captureElementAsPNG.

export async function captureElementAsPNG(element) {
  if (!element) throw new Error('No element to capture')
  if (typeof window !== 'undefined' && typeof window.html2canvas === 'function') {
    const canvas = await window.html2canvas(element)
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
  }
  throw new Error('html2canvas not found. Include it or pass your own capturer.')
}

export function downloadBlob(blob, filename = 'screenshot.png') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function exportSampleChats(chats = [], messagesById = {}) {
  const payload = { chats, messagesById, exportedAt: new Date().toISOString() }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, 'sample-chats.json')
}
