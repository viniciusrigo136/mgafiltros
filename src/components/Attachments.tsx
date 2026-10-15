import { deleteAttachment } from '@/lib/actions-admin';
import type { Attachment } from '@/lib/attachments';
import { ConfirmButton } from './ConfirmButton';
import { UploadForm } from './UploadForm';
import { Empty } from './ui';

/** Galeria de fotos/PDFs com envio (câmera do celular ou arquivo). */
export function Attachments({ items, tractorId, workOrderId, canEdit }: {
  items: Attachment[]; tractorId?: number; workOrderId?: number; canEdit: boolean;
}) {
  return (
    <>
      {items.length === 0 ? (
        <Empty>Nenhuma foto ou documento.</Empty>
      ) : (
        <div className="gallery">
          {items.map((a) => (
            <figure key={a.id}>
              {a.mime === 'application/pdf' ? (
                <a className="pdf" href={`/arquivos/${a.id}`} target="_blank" rel="noopener">PDF</a>
              ) : (
                <a href={`/arquivos/${a.id}`} target="_blank" rel="noopener">
                  {/* eslint-disable-next-line @next/next/no-img-element -- arquivo privado servido por rota autenticada */}
                  <img src={`/arquivos/${a.id}`} alt={a.caption ?? a.original_name} loading="lazy" />
                </a>
              )}
              <figcaption>
                <span>{a.caption ?? a.original_name}</span>
                {canEdit && (
                  <form action={deleteAttachment}>
                    <input type="hidden" name="id" value={a.id} />
                    <ConfirmButton className="btn btn-sm btn-ghost" message="Remover este anexo?">✕</ConfirmButton>
                  </form>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {canEdit && (
        <details>
          <summary>Anexar fotos ou PDF</summary>
          <UploadForm tractorId={tractorId} workOrderId={workOrderId} />
        </details>
      )}
    </>
  );
}
