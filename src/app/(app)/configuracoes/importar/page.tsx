import type { Metadata } from 'next';
import { importSpreadsheet } from '@/lib/actions-admin';
import { IMPORT_COLUMNS } from '@/lib/csv';
import { ActionForm } from '@/components/ActionForm';
import { PageHead } from '@/components/ui';

export const metadata: Metadata = { title: 'Importar planilha' };

export default function Importar() {
  const example = `${IMPORT_COLUMNS.join(';')}\nJoão da Silva;(54) 99999-0000;Erechim;Marca;Modelo 100;2018;ABC123;1250;10/03/2026;15W40;12;250;6`;
  return (
    <>
      <PageHead title="Importar proprietários e tratores" back={{ href: '/configuracoes', label: 'Configurações' }} />
      <section className="card">
        <ol>
          <li>Monte a planilha no Excel com estas colunas na primeira linha (só <strong>proprietario</strong>, <strong>marca</strong> e <strong>modelo</strong> são obrigatórias):</li>
        </ol>
        <pre style={{ background: 'var(--bg)', padding: '.75rem', overflowX: 'auto', borderRadius: 4 }}>{example}</pre>
        <ol start={2}>
          <li>Salve como <strong>CSV (separado por ponto e vírgula)</strong>.</li>
          <li>Envie abaixo. Proprietários com o mesmo nome são reaproveitados; cada linha vira um trator com número novo.</li>
          <li>Se alguma linha tiver erro, nada é importado e a lista de correções aparece aqui.</li>
        </ol>
        <p className="hint">A última troca de cada trator não é importada: registre-a na ficha para iniciar o acompanhamento.</p>
        <ActionForm action={importSpreadsheet} submitLabel="Importar">
          <div className="fields">
            <label className="span-2">Arquivo CSV *<input type="file" name="file" accept=".csv,text/csv" required /></label>
          </div>
        </ActionForm>
      </section>
    </>
  );
}
