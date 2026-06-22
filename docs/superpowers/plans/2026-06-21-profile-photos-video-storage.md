# Profile Photos (HQ + Admin Zoom) + Video Streaming Storage

> **For agentic workers:** specialized subagents implement disjoint file sets in parallel, controller reviews + commits.

**Goal:** (A) Let clients upload a profile photo in good quality, stored in studio file storage, with an admin zoom view to verify identity. (B) Add the missing video streaming endpoint with HTTP Range support so uploaded videos play and seek correctly.

**Architecture:**
- Backend: two photo-upload endpoints (client self + admin-on-behalf) that normalize with `sharp` (auto-orient, max 1280px, JPEG q90) and store via existing `uploadBufferToDrive`; one `GET /api/drive/video/:fileId` Range-aware streaming proxy.
- Frontend: a shared `<Lightbox>`/`<ZoomableImage>` component; admin ClientDetail shows the real photo with click-to-zoom + a reception "change photo" control; client ProfileEdit gets an avatar uploader.

**Storage note:** Files live on the studio's external storage (Google Drive, 5TB) served through `/api/drive/*` proxies. NEVER surface "Google Drive" in any user-facing label or copy.

**Tech Stack:** Node.js ESM, `sharp` (already imported line 16), `multer` memory storage (`upload`), PostgreSQL, React + TanStack Query + shadcn.

---

## Global Constraints

- Reuse existing helpers: `uploadBufferToDrive(buffer, fileName, mimeType, accessToken)`, `getGoogleDriveAccessToken()`, `makeGoogleDriveFilePublic(fileId, accessToken)`, `getDriveFolderId()`.
- Photo column already exists: `users.photo_url` (TEXT). `mapUser()` already returns `photoUrl` (line 2489). `GET /api/users/:id` already returns it.
- `upload` is the multer memory-storage instance (line 382), 10 MB limit.
- `authMiddleware` sets `req.userId`. `adminMiddleware` allows admin/super_admin/instructor/reception.
- Never reveal "Google Drive" in UI copy. Use "foto de perfil" / "almacenamiento".
- Photo URL format stored in DB: `/api/drive/image/{fileId}` (served by existing image proxy).
- Video URL format: `/api/drive/video/{fileId}` (NEW endpoint this plan adds).

---

## API Contracts (fixed — frontend + backend depend on these)

### `POST /api/me/photo` (authMiddleware, `upload.single("photo")`)
- Uploads the authenticated client's own profile photo.
- Processes buffer with sharp, uploads to storage, sets `users.photo_url` for `req.userId`.
- Response: `{ data: { photoUrl: "/api/drive/image/<id>" } }`
- Errors: 400 `{ message: "No se envió archivo" }` if no file.

### `POST /api/users/:id/photo` (adminMiddleware, `upload.single("photo")`)
- Reception/admin uploads/replaces a client's photo.
- Same processing; sets `users.photo_url` for `:id`.
- Response: `{ data: { photoUrl: "/api/drive/image/<id>" } }`
- Errors: 404 if user not found, 400 if no file.

### `GET /api/drive/video/:fileId` (no auth — public proxy, mirrors image proxy)
- Streams a stored video with HTTP Range support (seeking).
- With `Range` header: 206 Partial Content + `Content-Range`, `Accept-Ranges: bytes`, `Content-Length`.
- Without `Range`: 200 + `Accept-Ranges: bytes`, full stream.

---

## Task 1 (BACKEND): Photo upload endpoints + sharp processing + video Range proxy

**File:** `server/index.js`

### Shared sharp helper
Add near the other Drive helpers (after `uploadFileToDriveResumable`, ~line 515):

```js
// Normaliza una foto de perfil: corrige orientación EXIF, acota a 1280px
// (sin agrandar), recomprime a JPEG de buena calidad y limpia metadatos.
// Devuelve { buffer, mimeType, ext } listos para subir al almacenamiento.
async function processProfilePhoto(inputBuffer) {
  const out = await sharp(inputBuffer)
    .rotate()
    .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return { buffer: out, mimeType: "image/jpeg", ext: "jpg" };
}

// Sube una foto de perfil ya procesada al almacenamiento y la hace pública.
// Devuelve la URL servida por el proxy (/api/drive/image/<id>) o null si el
// almacenamiento no está configurado (en cuyo caso el caller decide fallback).
async function storeProfilePhoto(processed, label) {
  const isDriveConfigured = Boolean(
    process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN
  );
  if (!isDriveConfigured) {
    return `data:${processed.mimeType};base64,${processed.buffer.toString("base64")}`;
  }
  const token = await getGoogleDriveAccessToken();
  const fileName = `perfil_${label}_${Date.now()}.${processed.ext}`;
  const up = await uploadBufferToDrive(processed.buffer, fileName, processed.mimeType, token);
  if (!up?.id) throw new Error("upload falló");
  await makeGoogleDriveFilePublic(up.id, token);
  return `/api/drive/image/${up.id}`;
}
```

### `POST /api/me/photo`
Place near other `/api/me` or user routes. Example body:

```js
app.post("/api/me/photo", authMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const processed = await processProfilePhoto(req.file.buffer);
    const photoUrl = await storeProfilePhoto(processed, req.userId);
    await pool.query("UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2", [photoUrl, req.userId]);
    triggerWalletPassSync(req.userId, "profile_photo_updated");
    return res.json({ data: { photoUrl } });
  } catch (err) {
    console.error("POST /me/photo error:", err?.message);
    return res.status(500).json({ message: "Error al subir la foto" });
  }
});
```

### `POST /api/users/:id/photo`
```js
app.post("/api/users/:id/photo", adminMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const exists = await pool.query("SELECT id FROM users WHERE id = $1", [req.params.id]);
    if (!exists.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const processed = await processProfilePhoto(req.file.buffer);
    const photoUrl = await storeProfilePhoto(processed, req.params.id);
    await pool.query("UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2", [photoUrl, req.params.id]);
    triggerWalletPassSync(req.params.id, "profile_photo_updated");
    return res.json({ data: { photoUrl } });
  } catch (err) {
    console.error("POST /users/:id/photo error:", err?.message);
    return res.status(500).json({ message: "Error al subir la foto" });
  }
});
```

### `GET /api/drive/video/:fileId` (Range-aware) — place right after the image proxy (~line 12002)
```js
app.get("/api/drive/video/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.length < 10) return res.status(400).end();
    const accessToken = await getGoogleDriveAccessToken();
    const metaResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { mimeType, name, size } = metaResp.data;
    const range = req.headers.range;
    const driveHeaders = { Authorization: `Bearer ${accessToken}` };
    if (range) driveHeaders.Range = range;
    const driveResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: driveHeaders, responseType: "stream", validateStatus: (s) => s === 200 || s === 206 }
    );
    const baseHeaders = {
      "Content-Type": mimeType || "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=604800",
      "Content-Disposition": `inline; filename="${name || "video.mp4"}"`,
    };
    if (driveResp.status === 206 && driveResp.headers["content-range"]) {
      res.status(206).set({
        ...baseHeaders,
        "Content-Range": driveResp.headers["content-range"],
        "Content-Length": driveResp.headers["content-length"],
      });
    } else {
      res.status(200).set({ ...baseHeaders, ...(size ? { "Content-Length": size } : {}) });
    }
    driveResp.data.pipe(res);
  } catch (err) {
    console.error("Drive video proxy error:", err?.response?.status || err?.message);
    if (!res.headersSent) res.status(500).json({ message: "Error al obtener video" });
  }
});
```

### Verify
- `node --check server/index.js` → `SYNTAX OK`
- Do NOT commit (controller commits).

---

## Task 2 (FRONTEND): Shared Lightbox + admin photo/zoom + client uploader

**Files:**
- Create: `src/components/app/Lightbox.tsx` — reusable `<Lightbox>` + `<ZoomableImage>`
- Modify: `src/pages/admin/orders/OrdersVerification.tsx` — use shared Lightbox (remove local copy)
- Modify: `src/pages/admin/clients/ClientDetail.tsx` — show photo, zoom, reception upload
- Modify: `src/pages/client/ProfileEdit.tsx` — avatar uploader

### `src/components/app/Lightbox.tsx`
Extract the existing custom lightbox from OrdersVerification (lines 77-97) into a shared component, plus a `ZoomableImage` wrapper that manages its own open state:

```tsx
import { useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

export const Lightbox = ({ src, alt = "", onClose }: { src: string; alt?: string; onClose: () => void }) => (
  <div className="fixed inset-0 z-[200] bg-alma-ink-deep/95 flex items-center justify-center p-4" onClick={onClose}>
    <button aria-label="Cerrar" className="absolute top-4 right-4 text-alma-canvas/80 hover:text-alma-canvas bg-alma-ink/60 rounded-full p-2" onClick={onClose}>
      <X size={20} />
    </button>
    <img src={src} alt={alt} className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
  </div>
);

// Imagen que abre un lightbox al hacer click. Maneja su propio estado.
export const ZoomableImage = ({ src, alt = "", className, overlayLabel = "Ver completo" }: { src: string; alt?: string; className?: string; overlayLabel?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={cn("relative group cursor-zoom-in", className)} onClick={() => setOpen(true)}>
        <img src={src} alt={alt} className="h-full w-full rounded-xl object-cover" />
        <span className="absolute inset-0 bg-alma-ink-deep/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2 text-alma-canvas text-sm">
          <ZoomIn size={18} /> {overlayLabel}
        </span>
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
};
```

In OrdersVerification.tsx: remove the local `Lightbox` definition and `import { Lightbox } from "@/components/app/Lightbox"`. Keep its existing `lightboxSrc` state pattern (the shared `Lightbox` has the same `src`/`onClose` props, so the call site `{lightboxSrc && <Lightbox src={lightboxSrc} onClose={...} />}` still works — just add `alt="Comprobante"`).

### ClientDetail.tsx — admin photo + zoom + reception upload
- Import `ZoomableImage` and a `useRef` + hidden file input + upload mutation.
- In the header (lines ~298-303), replace the initials-only `<span>` with: if `u?.photoUrl`, render a 56px `ZoomableImage` (rounded-full, `overlayLabel="Ver"`); else keep initials. Add a small camera button overlay to trigger the hidden file input.
- Upload mutation: `POST /users/${id}/photo` with `FormData` (`photo` field). On success invalidate `["client", id]`.

```tsx
const photoInputRef = useRef<HTMLInputElement>(null);
const photoMutation = useMutation({
  mutationFn: (file: File) => {
    const fd = new FormData();
    fd.append("photo", file);
    return api.post(`/users/${id}/photo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
  },
  onSuccess: () => { qc.invalidateQueries({ queryKey: ["client", id] }); toast({ title: "Foto actualizada" }); },
  onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al subir la foto", variant: "destructive" }),
});
```

Header avatar block (replace initials span):
```tsx
<div className="relative shrink-0">
  {u?.photoUrl ? (
    <ZoomableImage src={u.photoUrl} alt={u.displayName ?? "Cliente"} overlayLabel="Ver" className="h-14 w-14 overflow-hidden rounded-full" />
  ) : (
    <span className="grid h-14 w-14 place-items-center rounded-full bg-alma-oat font-display text-lg text-alma-ink">
      {initialsOf(u?.displayName)}
    </span>
  )}
  <button type="button" onClick={() => photoInputRef.current?.click()}
    className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-alma-ink text-alma-canvas shadow-sm hover:bg-alma-ink-deep"
    aria-label="Cambiar foto">
    <Camera size={12} />
  </button>
  <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
    onChange={(e) => { const f = e.target.files?.[0]; if (f) photoMutation.mutate(f); e.target.value = ""; }} />
</div>
```
(Import `Camera` from lucide-react; `ZoomableImage` needs `rounded-full` + `overflow-hidden` on its wrapper so the inner img is clipped to a circle — the inner img uses `object-cover`.)

### ProfileEdit.tsx — client avatar uploader
- Add above the form: current avatar (photoUrl or initials) + a "Cambiar foto" button → hidden file input → `POST /me/photo` mutation.
- On success: update auth store user photoUrl (or invalidate the profile query) and toast.

```tsx
const avatarInputRef = useRef<HTMLInputElement>(null);
const avatarMutation = useMutation({
  mutationFn: (file: File) => {
    const fd = new FormData();
    fd.append("photo", file);
    return api.post(`/me/photo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
  },
  onSuccess: (res) => {
    const photoUrl = res?.data?.data?.photoUrl;
    if (photoUrl) setUser({ ...(user as any), photoUrl });   // adapt to actual auth store setter
    toast({ title: "Foto de perfil actualizada" });
  },
  onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo subir la foto", variant: "destructive" }),
});
```
Render a circular preview (use `user?.photoUrl`), a button that opens the file input, and a hint "Se usa para identificarte en el estudio." (no mention of storage provider). Match the existing form's spacing/visual language. Inspect the real auth store hook used on this page to wire `setUser`/refetch correctly.

### Verify
- `npx tsc --noEmit` clean.
- Do NOT commit (controller commits).

---

## Self-Review Checklist
1. Endpoints return `{ data: { photoUrl } }`; DB updated; wallet sync triggered.
2. Video endpoint sets `Accept-Ranges` always, 206 + `Content-Range` when Range present.
3. No "Google Drive" string in any user-facing copy.
4. Shared Lightbox used in both OrdersVerification and ClientDetail (no duplicate definitions).
5. sharp pipeline: `.rotate().resize(1280,1280,{fit:inside,withoutEnlargement:true}).jpeg({quality:90,mozjpeg:true})`.
