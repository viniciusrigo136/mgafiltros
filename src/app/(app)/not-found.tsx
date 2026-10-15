import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="empty">
      <h2>Registro não encontrado</h2>
      <p>O item procurado não existe.</p>
      <Link className="btn" href="/">Voltar ao painel</Link>
    </div>
  );
}
