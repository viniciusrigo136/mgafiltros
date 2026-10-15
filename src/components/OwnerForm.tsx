import Link from 'next/link';
import { saveOwner } from '@/lib/actions';
import { formatPhone } from '@/lib/format';
import type { Owner } from '@/lib/data';
import { ActionForm } from './ActionForm';

export function OwnerForm({ owner }: { owner?: Owner }) {
  return (
    <ActionForm
      action={saveOwner}
      submitLabel={owner ? 'Salvar alterações' : 'Cadastrar proprietário'}
      secondary={<Link className="btn btn-ghost" href={owner ? `/proprietarios/${owner.id}` : '/proprietarios'}>Cancelar</Link>}
    >
      {owner && <input type="hidden" name="id" value={owner.id} />}
      <div className="fields">
        <label className="span-2">Nome *
          <input name="name" required maxLength={120} defaultValue={owner?.name} autoComplete="off" />
        </label>
        <label>Telefone / WhatsApp
          <input name="phone" type="tel" inputMode="tel" placeholder="(54) 99999-9999" defaultValue={formatPhone(owner?.phone ?? null)} />
          <span className="hint">Com DDD. Será normalizado.</span>
        </label>
        <label>Município / localidade
          <input name="city" maxLength={120} defaultValue={owner?.city ?? ''} />
        </label>
        <label className="span-2">Observações
          <textarea name="notes" maxLength={2000} defaultValue={owner?.notes ?? ''} />
        </label>
      </div>
    </ActionForm>
  );
}
