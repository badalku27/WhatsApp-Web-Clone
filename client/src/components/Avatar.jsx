import React, { useMemo } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api'
const SERVER_ORIGIN = API_BASE.replace(/\/api\/?$/, '')

function hashColor(key = '') {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h << 5) - h + key.charCodeAt(i)
  const hue = Math.abs(h) % 360
  return `hsl(${hue} 65% 35%)`
}

function initials(name = '', fallback = '') {
  const n = (name || '').trim()
  if (!n) return (fallback || '').slice(-2).toUpperCase()
  const parts = n.split(/\s+/)
  const a = parts[0]?.[0] || ''
  const b = parts[1]?.[0] || ''
  return (a + b || a).toUpperCase()
}

export default function Avatar({ name, id, size = 40, src }) {
  const bg = hashColor(id || name || 'user')
  const label = initials(name, id)
  const style = { width: size, height: size, backgroundColor: bg }
  const fallback = '/images/default-avatar.png'
  const imgSrc = useMemo(() => {
    if (src && typeof src === 'string' && src.trim()) {
      // If server returned a relative /uploads path, prefix with backend origin
      if (/^\//.test(src)) return `${SERVER_ORIGIN}${src}`
      return src
    }
    // Default placeholder
    return `https://i.pravatar.cc/150?u=${encodeURIComponent(id || name || 'user')}`
  }, [src, id, name])

  const [error, setError] = React.useState(false)

  if (!src && !error) {
    // Render a placeholder image with circular crop; if it fails, show initials block
    return (
      <img
        src={imgSrc}
        alt={name || id || 'avatar'}
        onError={() => setError(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }

  if (src && !error) {
    return (
      <img
        src={imgSrc}
        alt={name || id || 'avatar'}
        onError={() => setError(true)}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }

  // Fallback to default static asset or colored initials circle
  return (
    <div className="rounded-full flex items-center justify-center text-white font-semibold select-none shrink-0" style={style} aria-label={name || id}>
      {fallback ? (
        <img src={fallback} alt="avatar" className="rounded-full object-cover w-full h-full" />
      ) : (
        <span style={{ fontSize: Math.max(12, size * 0.4) }}>{label}</span>
      )}
    </div>
  )
}
