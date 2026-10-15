'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="empty">
      <h2>Algo deu errado</h2>
      <p>Não foi possível concluir a operação. Tente novamente; se persistir, verifique o servidor.</p>
      <button className="btn btn-primary" onClick={reset}>Tentar novamente</button>
    </div>
  );
}
