'use client';
import type { ReactNode } from 'react';

/** Botão de envio que pede confirmação antes de ações destrutivas. */
export function ConfirmButton({ message, children, className = 'btn' }: { message: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
