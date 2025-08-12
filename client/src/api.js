import axios from 'axios'

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

export const api = axios.create({ baseURL: API_BASE })

export async function getChats() {
  const { data } = await api.get('/messages/chats')
  return data.chats
}

export async function getConversation(wa_id) {
  const { data } = await api.get(`/messages/conversations/${wa_id}`)
  return data
}

export async function sendMessage(wa_id, text, name) {
  const { data } = await api.post('/messages/send', { wa_id, text, name })
  return data.message
}

export async function getStatuses() {
  const { data } = await api.get('/status')
  return data.statuses
}

export async function postStatus({ wa_id, name, type = 'text', text, mediaUrl }) {
  const { data } = await api.post('/status', { wa_id, name, type, text, mediaUrl })
  return data.status
}

export async function uploadStatusMedia({ wa_id, name, type = 'video', file }) {
  const form = new FormData()
  form.append('wa_id', wa_id)
  if (name) form.append('name', name)
  form.append('type', type)
  form.append('file', file)
  // Do not set Content-Type manually; the browser adds multipart boundaries
  const { data } = await api.post('/status/upload', form)
  return data.status
}

// Profile picture APIs
export async function uploadProfilePic({ wa_id, name, file }) {
  const form = new FormData()
  form.append('wa_id', wa_id)
  if (name) form.append('name', name)
  form.append('file', file)
  // Do not set Content-Type manually; the browser adds multipart boundaries
  const { data } = await api.post('/users/profilePic', form)
  return data.user
}

export async function setProfilePicUrl({ wa_id, name, profilePic }) {
  const { data } = await api.post('/users/profilePic/url', { wa_id, name, profilePic })
  return data.user
}

// Delete chat for a wa_id
export async function deleteChat(wa_id) {
  try {
    const { data } = await api.delete(`/messages/chats/${wa_id}`)
    return data
  } catch (err) {
    // bubble minimal info; caller can show a toast
    const msg = err?.response?.data?.error || err.message || 'Failed to delete chat'
    throw new Error(msg)
  }
}

// Delete all statuses for a user
export async function deleteStatuses(wa_id) {
  const { data } = await api.delete(`/status/${wa_id}`)
  return data
}

// Delete a specific status item
export async function deleteStatusItem(wa_id, id) {
  const { data } = await api.delete(`/status/${wa_id}/items/${id}`)
  return data
}

// Clear a user's profile picture
export async function clearProfilePic(wa_id) {
  const { data } = await api.delete(`/users/${wa_id}/profilePic`)
  return data
}

// --- Spec-compatible endpoints (optional usage) ---
export async function specGetChats() {
  const { data } = await api.get('/chats')
  return data.chats
}

export async function specGetMessages(wa_id) {
  const { data } = await api.get(`/messages/${wa_id}`)
  return data.messages
}

export async function specPostMessage({ wa_id, name, text, status }) {
  const { data } = await api.post('/messages', { wa_id, name, text, status })
  return data.message
}
