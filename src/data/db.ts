// A small promise wrapper over IndexedDB. Two stores: "kv" holds Nod's one state document,
// "photos" holds photo Blobs by id (too big for the document, and Blobs stay Blobs here).
const DB_NAME = 'nod'
const DB_VERSION = 1

let opening: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos')
    }
    req.onsuccess = () => {
      const db = req.result
      // Another tab upgrading the schema: let it, and reopen on the next call.
      db.onversionchange = () => {
        db.close()
        opening = null
      }
      resolve(db)
    }
    req.onerror = () => {
      opening = null
      reject(req.error ?? new Error('IndexedDB could not open'))
    }
    req.onblocked = () => {
      opening = null
      reject(new Error('IndexedDB is blocked by another tab'))
    }
  })
  return opening
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function getValue<T>(store: 'kv' | 'photos', key: string): Promise<T | undefined> {
  const db = await openDb()
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>
}

export async function putValue(store: 'kv' | 'photos', key: string, value: unknown): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).put(value, key)
  await done(tx)
}

export async function deleteValue(store: 'kv' | 'photos', key: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).delete(key)
  await done(tx)
}

export async function clearStore(store: 'kv' | 'photos'): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  tx.objectStore(store).clear()
  await done(tx)
}
