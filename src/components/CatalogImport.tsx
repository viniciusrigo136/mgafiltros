'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { commitCatalogImport, previewCatalogImport, type ImportSummary } from '@/lib/actions-catalog';

/** Importação do catálogo: pré-visualizar (nada é gravado) → importar. Mesmos arquivos nos dois passos. */
export function CatalogImport() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [source, setSource] = useState<'builtin' | 'file'>('builtin');

  async function run(commit: boolean) {
    const fd = new FormData(formRef.current!);
    if (source === 'builtin') fd.set('builtin', '1');
    setBusy(true);
    try {
      setResult(await (commit ? commitCatalogImport(fd) : previewCatalogImport(fd)));
      if (commit) router.refresh();
    } catch {
      setResult({ error: 'Falha ao processar. Tente novamente.' });
    } finally {
      setBusy(false);
    }
  }

  const pending = result?.counts?.reduce((n, c) => n + c.create + c.update, 0) ?? 0;

  return (
    <div>
      <form ref={formRef} className="form" onSubmit={(e) => { e.preventDefault(); run(false); }}>
        <fieldset disabled={busy}>
          <label className="check">
            <input type="radio" name="source" checked={source === 'builtin'} onChange={() => { setSource('builtin'); setResult(null); }} />
            Catálogo inicial incluído no sistema (14/10/2026: 12 marcas, 28 modelos, 110 aplicações)
          </label>
          <label className="check">
            <input type="radio" name="source" checked={source === 'file'} onChange={() => { setSource('file'); setResult(null); }} />
            Enviar arquivo: <code>catalogo_agricola_inicial.json</code> ou os CSVs (marcas, modelos, aplicações)
          </label>
          {source === 'file' && (
            <label style={{ marginTop: '.5rem' }}>Arquivo(s)
              <input type="file" name="files" multiple accept=".json,.csv,application/json,text/csv" required onChange={() => setResult(null)} />
            </label>
          )}
        </fieldset>
        <div className="form-actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Processando…' : '1. Pré-visualizar'}</button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !result || !!result.error || result.committed || pending === 0}
            onClick={() => run(true)}
          >
            2. Importar
          </button>
        </div>
      </form>

      {result?.error && <p className="alert alert-error" role="alert">{result.error}</p>}
      {result?.counts && (
        <div style={{ marginTop: '1rem' }}>
          <p className={`alert ${result.committed ? 'alert-ok' : 'alert-warn'}`} role="status">
            {result.committed
              ? 'Importação concluída.'
              : pending === 0
                ? 'Nada a importar: o catálogo já está atualizado.'
                : 'Pré-visualização: nada foi gravado ainda. Confira e clique em “Importar”.'}
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th></th><th className="num">Criar</th><th className="num">Atualizar</th><th className="num">Sem mudança</th><th className="num">Ignorar (oficina)</th></tr></thead>
              <tbody>
                {result.counts.map((c) => (
                  <tr key={c.label}><td>{c.label}</td><td className="num">{c.create}</td><td className="num">{c.update}</td><td className="num">{c.unchanged}</td><td className="num">{c.ignored}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!result.errors?.length && (
            <div className="alert alert-error" style={{ marginTop: '.75rem' }}>
              <strong>{result.errors.length} linha(s) com falha (não importadas):</strong>
              <ul>{result.errors.map((e, i) => <li key={i}>{e.where}: {e.message}</li>)}</ul>
            </div>
          )}
          {!!result.changes?.length && (
            <details style={{ marginTop: '.75rem' }}>
              <summary>Ver alterações ({result.changes.length})</summary>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {result.changes.map((c) => <tr key={`${c.kind}-${c.id}`}><td>{c.kind}</td><td>{c.action}</td><td>{c.id}</td><td>{c.text}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
