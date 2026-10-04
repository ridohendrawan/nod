// Review's photo (ux-spec 4, item 10; D83): two buttons, because one file input can't offer
// both the camera and the library on every phone. The photo is prepared on the phone, stored as
// a Blob in this browser (D91), and shown on Sarah's card. NSW calls it "Plans or photo".
import { Camera, ImagePlus, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { StateCode } from '../../../shared/states.ts'
import type { Variation } from '../../../shared/types.ts'
import { announce } from '../../lib/announce.ts'
import { api, isApiError } from '../../lib/api.ts'
import { Button } from '../../ui/Button.tsx'
import { usePhotoUrl } from '../../ui/usePhotoUrl.ts'
import { PhotoError, preparePhoto } from './photo.ts'

export function PhotoSection({
  variation: v,
  state,
  onChanged,
}: {
  variation: Variation
  state: StateCode
  onChanged: (next: Variation) => void
}) {
  const url = usePhotoUrl(v.photo_id, api.photo)
  const titleId = useId()
  const take = useRef<HTMLInputElement>(null)
  const choose = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'preparing' | 'saving' | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A prepared photo that didn't save, kept for Try again.
  const [unsaved, setUnsaved] = useState<Blob | null>(null)
  const title = state === 'NSW' ? 'Plans or photo (optional)' : 'Photo (optional)'

  const save = async (blob: Blob) => {
    setBusy('saving')
    try {
      const { variation } = await api.putPhoto(v.id, blob)
      onChanged(variation)
      setUnsaved(null)
      setError(null)
      announce('Photo added.')
    } catch (e) {
      setUnsaved(isApiError(e) && e.code === 'invalid' ? null : blob)
      const message =
        isApiError(e) && e.code === 'invalid' ? e.message : 'The photo didn’t save. Try again.'
      setError(message)
      announce(message)
    } finally {
      setBusy(null)
    }
  }

  const use = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setBusy('preparing')
    let blob: Blob
    try {
      blob = await preparePhoto(file)
    } catch (e) {
      setBusy(null)
      const message =
        e instanceof PhotoError ? e.message : 'Nod couldn’t use that photo. Try taking it again.'
      setError(message)
      announce(message)
      return
    }
    await save(blob)
  }

  const remove = async () => {
    try {
      const { variation } = await api.deletePhoto(v.id)
      onChanged(variation)
      announce('Photo removed.')
    } catch {
      announce('That didn’t go through. The photo is still there.')
    }
  }

  return (
    <section className="card form-card" aria-labelledby={titleId} data-field="photo">
      <div className="form-card-head">
        <span className="form-card-icon" aria-hidden="true">
          <Camera size={20} strokeWidth={2.25} />
        </span>
        <h2 id={titleId} className="t-title-2">
          {title}
        </h2>
      </div>
      {v.photo_id && url ? (
        <div className="photo-picked">
          <img className="photo-thumb" src={url} alt={v.title || 'The change'} />
          <Button
            variant="outline"
            size={48}
            icon={<X size={20} strokeWidth={2.25} aria-hidden="true" />}
            onClick={() => void remove()}
          >
            Remove photo
          </Button>
        </div>
      ) : (
        <div className="photo-buttons">
          <Button
            variant="outline"
            size={48}
            pending={busy !== null}
            icon={<Camera size={20} strokeWidth={2.25} aria-hidden="true" />}
            onClick={() => take.current?.click()}
          >
            Take photo
          </Button>
          <Button
            variant="outline"
            size={48}
            pending={busy !== null}
            icon={<ImagePlus size={20} strokeWidth={2.25} aria-hidden="true" />}
            onClick={() => choose.current?.click()}
          >
            Choose photo
          </Button>
        </div>
      )}
      {busy ? <p className="field-hint">Getting the photo ready…</p> : null}
      {error ? (
        <div className="photo-error">
          <p className="field-error">
            <span>{error}</span>
          </p>
          {unsaved ? (
            <Button variant="outline" size={48} onClick={() => void save(unsaved)}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      <input
        ref={take}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void use(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={choose}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void use(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </section>
  )
}
