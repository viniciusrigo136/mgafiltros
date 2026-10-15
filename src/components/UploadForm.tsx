'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { uploadAttachment } from '@/lib/actions-admin';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 1920;

/** Reduz fotos grandes no próprio aparelho (JPEG, lado maior até 1920 px) antes do envio. */
async function prepare(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || (file.size < 1_500_000 && file.type !== 'image/heic')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // formato que o navegador não decodifica: envia como está
  }
}

export function UploadForm({ tractorId, workOrderId }: { tractorId?: number; workOrderId?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('files') as HTMLInputElement;
    const caption = (form.elements.namedItem('caption') as HTMLInputElement).value;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setMessage(null);
    let sent = 0;
    try {
      for (const original of files) {
        setMessage({ ok: true, text: `Enviando ${sent + 1} de ${files.length}…` });
        const file = await prepare(original);
        if (file.size > MAX_BYTES) {
          setMessage({ ok: false, text: `${original.name}: arquivo maior que 4 MB mesmo após reduzir.` });
          return;
        }
        const fd = new FormData();
        if (tractorId) fd.set('tractor_id', String(tractorId));
        if (workOrderId) fd.set('work_order_id', String(workOrderId));
        fd.set('caption', caption);
        fd.set('file', file);
        const res = await uploadAttachment(fd);
        if (res?.error) {
          setMessage({ ok: false, text: res.error });
          return;
        }
        sent++;
      }
      form.reset();
      setMessage({ ok: true, text: sent === 1 ? 'Arquivo anexado.' : `${sent} arquivos anexados.` });
    } catch {
      setMessage({ ok: false, text: 'Falha no envio. Verifique a conexão e tente de novo.' });
    } finally {
      setBusy(false);
      if (sent) startTransition(() => router.refresh());
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      {message && <p className={`alert ${message.ok ? 'alert-ok' : 'alert-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      <fieldset disabled={busy}>
        <div className="fields">
          <label>Fotos ou PDF
            <input type="file" name="files" multiple accept="image/*,application/pdf" required />
            <span className="hint">Fotos são reduzidas automaticamente. PDF até 4 MB.</span>
          </label>
          <label>Legenda<input name="caption" maxLength={200} placeholder="ex.: placa do motor, nota fiscal" /></label>
        </div>
      </fieldset>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
      </div>
    </form>
  );
}
