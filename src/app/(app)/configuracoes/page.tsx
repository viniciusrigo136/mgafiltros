import type { Metadata } from 'next';
import Link from 'next/link';
import { saveMaintenanceType, saveShopSettings, setMaintenanceTypeActive } from '@/lib/actions-admin';
import { listMaintenanceTypes } from '@/lib/maintenance';
import { getSettings } from '@/lib/settings';
import { loginEnabled, requireUser } from '@/lib/auth';
import { ActionForm } from '@/components/ActionForm';
import { Flash, PageHead, one, type SearchParams } from '@/components/ui';

export const metadata: Metadata = { title: 'Configurações' };

export default async function Configuracoes({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  const s = getSettings();
  const types = listMaintenanceTypes(true);
  const isAdmin = user.role === 'admin';

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <PageHead title="Configurações" />

      <div className="grid grid-3">
        <Link className="card item" href="/modelos">
          <span className="item-body"><span className="item-title">Modelos de trator</span><span className="item-sub">Óleo, intervalos e filtros por modelo</span></span>
        </Link>
        <Link className="card item" href="/configuracoes/importar">
          <span className="item-body"><span className="item-title">Importar planilha</span><span className="item-sub">Proprietários e tratores a partir de CSV</span></span>
        </Link>
        <Link className="card item" href="/configuracoes/usuarios">
          <span className="item-body"><span className="item-title">Usuários e acesso</span><span className="item-sub">{loginEnabled ? 'Login ativo' : 'Login desligado'}</span></span>
        </Link>
      </div>

      {!isAdmin && <p className="alert alert-warn">Somente administradores alteram as configurações.</p>}

      <section className="card">
        <h2>Oficina, alertas e mensagens</h2>
        <ActionForm action={saveShopSettings} submitLabel="Salvar configurações">
          <fieldset disabled={!isAdmin}>
            <h3>Dados da oficina (aparecem na OS e no orçamento)</h3>
            <div className="fields">
              <label>Nome *<input name="shopName" required maxLength={120} defaultValue={s.shopName} /></label>
              <label>CNPJ / CPF<input name="shopDocument" maxLength={30} defaultValue={s.shopDocument} /></label>
              <label>Telefone<input name="shopPhone" maxLength={40} defaultValue={s.shopPhone} /></label>
              <label>Endereço<input name="shopAddress" maxLength={200} defaultValue={s.shopAddress} /></label>
            </div>
            <div className="form-section">
              <h3>Quando avisar</h3>
              <div className="fields-3">
                <label>“Próxima” com até (horas)<input name="th_hours" inputMode="decimal" required defaultValue={s.thresholds.hours} /></label>
                <label>“Próxima” com até (dias)<input name="th_days" type="number" min={0} required defaultValue={s.thresholds.days} /></label>
                <label>Leitura desatualizada após (dias)<input name="th_stale" type="number" min={1} required defaultValue={s.thresholds.staleReadingDays} /></label>
              </div>
            </div>
            <div className="form-section">
              <h3>Mensagem do botão “Avisar cliente” (WhatsApp)</h3>
              <label>Texto *
                <textarea name="whatsappTemplate" required maxLength={1000} defaultValue={s.whatsappTemplate} />
                <span className="hint">Variáveis: {'{cliente} {numero} {trator} {situacao} {motivo} {oficina}'}. A mensagem só é enviada se você tocar em enviar no WhatsApp.</span>
              </label>
            </div>
            <div className="form-section">
              <h3>Checklist padrão das ordens de serviço</h3>
              <label>Um item por linha
                <textarea name="checklist" rows={8} defaultValue={s.checklist.join('\n')} />
              </label>
            </div>
          </fieldset>
        </ActionForm>
      </section>

      <section className="card" id="tipos">
        <h2>Tipos de manutenção</h2>
        <p className="hint">Usados nos planos de “Outras manutenções” de cada trator. Os intervalos são definidos por trator.</p>
        <ul className="list">
          {types.map((t) => (
            <li key={t.id} className="item">
              <span className="item-body">
                <span className="item-title">{t.name} {!t.is_active && <span className="badge badge-inativo">Inativo</span>}</span>
                <span className="item-sub">{t.plan_count} {t.plan_count === 1 ? 'trator com plano' : 'tratores com plano'}</span>
              </span>
              {isAdmin && (
                <form action={setMaintenanceTypeActive}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="active" value={t.is_active ? '0' : '1'} />
                  <button className="btn btn-sm" type="submit">{t.is_active ? 'Desativar' : 'Reativar'}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {isAdmin && (
          <ActionForm action={saveMaintenanceType} submitLabel="Adicionar tipo">
            <div className="fields" style={{ marginTop: '.75rem' }}>
              <label className="span-2">Novo tipo<input name="name" required maxLength={80} placeholder="ex.: Filtro de cabine" /></label>
            </div>
          </ActionForm>
        )}
      </section>

      <section className="card">
        <h2>Backup e exportação</h2>
        <p>O banco é um único arquivo. Baixe uma cópia regularmente e guarde fora do computador da oficina. Fotos e anexos ficam na pasta <code>data/uploads</code> e devem ser copiados junto.</p>
        <div className="inline-forms">
          {isAdmin && <a className="btn btn-dark" href="/backup" download>Baixar backup do banco</a>}
          <Link className="btn" href="/relatorios">Exportar planilhas</Link>
        </div>
      </section>
    </>
  );
}
