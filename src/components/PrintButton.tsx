'use client';

export function PrintButton({ label = 'Imprimir' }: { label?: string }) {
  return (
    <button type="button" className="btn btn-dark no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
