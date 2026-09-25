// Best-effort IndexedDB persistence for user-supplied music files.
// Stores the ORIGINAL encoded bytes (compact) — decoding happens lazily on play.
// Every function resolves (never rejects) so callers can fire-and-forget.

const DB_NAME = 'outrun-remake-audio'
const STORE = 'userTracks'
const VERSION = 1

let dbPromise = null

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    let req
    try {
      req = indexedDB.open(DB_NAME, VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

function tx(db, mode, fn) {
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode)
      const store = t.objectStore(STORE)
      const out = fn(store)
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : true)
      t.onerror = () => resolve(null)
      t.onabort = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Save { name, title, type, size, data: ArrayBuffer }. Resolves to the key or null. */
export async function saveUserTrack(rec) {
  const db = await openDb()
  if (!db) return null
  return tx(db, 'readwrite', (s) => s.add({ ...rec, added: Date.now() }))
}

/** All stored records in insertion order (possibly empty). */
export async function loadUserTracks() {
  const db = await openDb()
  if (!db) return []
  const res = await tx(db, 'readonly', (s) => s.getAll())
  return Array.isArray(res) ? res.sort((a, b) => a.key - b.key) : []
}

export async function clearUserTracks() {
  const db = await openDb()
  if (!db) return false
  return !!(await tx(db, 'readwrite', (s) => s.clear()))
}
