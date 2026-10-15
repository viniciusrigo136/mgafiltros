'use client';
import { startTransition, useActionState, type ReactNode } from 'react';
import type { ActionState } from '@/lib/action-utils';

/** Formulário com server action: mostra erro de validação, estado de envio e mantém os campos preenchidos. */
export function ActionForm({
  action, children, submitLabel = 'Salvar', className = 'form', secondary,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  secondary?: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, undefined);
  return (
    <form
      className={className}
      // Sem JS carregado ainda, o formulário envia direto à server action (POST), nunca por GET.
      action={dispatch}
      onSubmit={(e) => {
        // Com JS: envio manual para não limpar os campos quando houver erro de validação.
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      {state?.error && <p className="alert alert-error" role="alert">{state.error}</p>}
      <fieldset disabled={pending}>{children}</fieldset>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Salvando…' : submitLabel}
        </button>
        {secondary}
      </div>
    </form>
  );
}
