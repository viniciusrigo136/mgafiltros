import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTractor, getTractorFilters, listHourReadings, listOilChanges } from '@/lib/data';
import { setTractorActive, updateHours } from '@/lib/actions';
import { modelFromTractor } from '@/lib/actions-models';
import { deletePlan, deleteRecord, savePlan, saveRecord } from '@/lib/actions-maintenance';
import { listMaintenanceTypes, listPlans, listRecords } from '@/lib/maintenance';
import { listOrders } from '@/lib/orders';
import { partsForNextChange } from '@/lib/stock';
import { listAttachments } from '@/lib/attachments';
import { getSettings } from '@/lib/settings';
import { canEdit, requireUser } from '@/lib/auth';
import { filterTypeLabel, formatDate, formatHours, formatNumber, whatsappUrl } from '@/lib/format';
import { formatMoney, orderTotals } from '@/lib/money';
import { STATUS_LABEL, todayInTimeZone } from '@/lib/status';
import { ActionForm } from '@/components/ActionForm';
import { Attachments } from '@/components/Attachments';
import { ConfirmButton } from '@/components/ConfirmButton';
import { CopyButton } from '@/components/CopyButton';
import { OilChangeList } from '@/components/OilChangeList';
import { Empty, Flash, NotifyLink, OrderBadge, ReadingInfo, StatusBadge, one, statusReason, type SearchParams } from '@/components/ui';

export default async function Trator({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const tractorId = Number(id);
  // Consultas independentes em paralelo (banco remoto: cada ida e volta conta).
  const [t, settings, filters, changes, readings, plans, records, types, orders, attachments] = await Promise.all([
    getTractor(tractorId),
    getSettings(),
    getTractorFilters(tractorId),
    listOilChanges({ tractorId }),
    listHourReadings(tractorId),
    listPlans({ tractorId }),
    listRecords({ tractorId, limit: 50 }),
    listMaintenanceTypes(),
    listOrders({ tractorId, limit: 20 }),
    listAttachments({ tractorId }),
  ]);
  if (!t) notFound();
  const editable = canEdit(user);
  const parts = await partsForNextChange(filters, { spec: t.oil_spec, liters: t.oil_capacity_liters }, filterTypeLabel);
  const { st } = t;
  const limits = settings.thresholds;
  const today = todayInTimeZone();
  const wa = whatsappUrl(t.owner_phone);
  const level = (v: number | null, limit: number) => (v == null ? '' : v <= 0 ? 'bad' : v <= limit ? 'warn' : '');

  return (
    <>
      <Flash ok={one(sp.ok)} erro={one(sp.erro)} />
      <Link href="/tratores" className="back">← Tratores</Link>
      <div className="page-head">
        <div className="hero">
          <div className="hero-num"><small>Trator nº</small>{t.sequential_number}</div>
          <div>
            <h1>{t.brand} {t.model}{t.year ? `, ${t.year}` : ''}</h1>
            <div>
              <Link href={`/proprietarios/${t.owner_id}`}><strong>{t.owner_name}</strong></Link>
              {wa && <> (<a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>)</>}
            </div>
            {t.serial_number && <div className="muted">Série {t.serial_number}</div>}
            {!t.is_active && <span className="badge badge-inativo">Inativo</span>}
          </div>
        </div>
        {editable && (
          <div className="page-actions">
            <Link className="btn btn-primary" href={`/manutencoes/nova?trator=${t.id}`}>Registrar troca</Link>
            <Link className="btn" href={`/ordens/nova?trator=${t.id}`}>Abrir OS</Link>
            <Link className="btn" href={`/tratores/${t.id}/editar`}>Editar</Link>
            <Link className="btn" href={`/tratores/${t.id}/etiqueta`}>Etiqueta QR</Link>
          </div>
        )}
      </div>

      <section className="card" id="oleo">
        <h2>
          <span>Troca de óleo do motor <StatusBadge status={st.status} /></span>
          {(st.status === 'vencida' || st.status === 'proxima') && (
            <NotifyLink
              className="btn btn-sm btn-wa"
              phone={t.owner_phone}
              settings={settings}
              vars={{ cliente: t.owner_name, numero: t.sequential_number, trator: `${t.brand} ${t.model}`, situacao: STATUS_LABEL[st.status].toLowerCase(), motivo: statusReason(st) }}
            />
          )}
        </h2>
        {st.reasons.length > 0 && (
          <p className={`alert ${st.status === 'vencida' ? 'alert-error' : 'alert-warn'}`}>Motivo: {st.reasons.join(', ')}</p>
        )}
        {st.missing.length > 0 && <p className="alert alert-warn">Verificar cadastro. Falta: {st.missing.join(', ')}.</p>}
        <div className="big-figures">
          <div className="fig"><span>Horímetro atual</span><strong>{formatHours(t.current_hours)}</strong></div>
          <div className={`fig ${level(st.hoursRemaining, limits.hours)}`}>
            <span>Próxima por horas</span>
            <strong>{t.interval_hours ? formatHours(st.nextHours) : 'não configurado'}</strong>
          </div>
          <div className={`fig ${level(st.hoursRemaining, limits.hours)}`}>
            <span>Horas restantes</span><strong>{formatHours(st.hoursRemaining)}</strong>
          </div>
          <div className={`fig ${level(st.daysRemaining, limits.days)}`}>
            <span>Próxima por data</span>
            <strong>{t.interval_months ? formatDate(st.nextDate) : 'não configurado'}</strong>
          </div>
          <div className={`fig ${level(st.daysRemaining, limits.days)}`}>
            <span>Dias restantes</span><strong>{st.daysRemaining ?? '—'}</strong>
          </div>
          <div className="fig">
            <span>Previsão pelo uso</span>
            <strong>{t.estimatedHoursDate ? formatDate(t.estimatedHoursDate) : '—'}</strong>
          </div>
          <div className="fig">
            <span>Última troca</span>
            <strong>{t.last_change_date ? `${formatDate(t.last_change_date)}, ${formatHours(t.last_change_hours)}` : '—'}</strong>
          </div>
        </div>
        <p>
          <ReadingInfo st={st} readAt={t.hours_read_at} staleDays={limits.staleReadingDays} />
          {t.usageRate != null && <span className="muted">. Uso médio: {formatNumber(t.usageRate)} h/dia.</span>}
          <br />
          <span className="hint">
            O horímetro só muda quando alguém registra uma leitura, troca ou serviço. Não há leitura automática.
            Intervalo: {[t.interval_hours && `${formatNumber(t.interval_hours)} h`, t.interval_months && `${t.interval_months} meses`].filter(Boolean).join(' ou ') || 'não configurado'}.
          </span>
        </p>
      </section>

      <div className="grid grid-2">
        <section className="card">
          <h2>Filtros compatíveis</h2>
          {filters.length === 0 ? (
            <Empty>Nenhum filtro cadastrado. {editable && <Link href={`/tratores/${t.id}/editar`}>Adicionar</Link>}</Empty>
          ) : (
            <ul className="filters">
              {filters.map((f) => (
                <li className="filter" key={f.id}>
                  <span className="filter-type">{filterTypeLabel(f.filter_type)}{f.quantity > 1 ? ` ×${f.quantity}` : ''}</span>
                  <span>
                    <span className="code">{f.reference_code}</span>
                    {(f.manufacturer || f.notes) && <span className="item-sub">{[f.manufacturer, f.notes].filter(Boolean).join(', ')}</span>}
                  </span>
                  <CopyButton value={f.reference_code} />
                </li>
              ))}
            </ul>
          )}
          <h2 style={{ marginTop: '1.25rem' }}>Óleo do motor</h2>
          <dl className="kv">
            <dt>Especificação</dt><dd>{t.oil_spec || '—'}</dd>
            <dt>Capacidade</dt><dd>{t.oil_capacity_liters != null ? `${formatNumber(t.oil_capacity_liters)} L` : '—'}</dd>
          </dl>
          {t.notes && <p className="item-sub" style={{ whiteSpace: 'pre-wrap' }}>{t.notes}</p>}
          {editable && filters.length > 0 && (
            <form action={modelFromTractor} style={{ marginTop: '1rem' }}>
              <input type="hidden" name="tractor_id" value={t.id} />
              <button className="btn btn-sm" type="submit">Salvar como modelo {t.brand} {t.model}</button>
            </form>
          )}
        </section>

        <section className="card">
          <h2>Peças para a próxima troca</h2>
          {parts.length === 0 ? (
            <p className="muted">Cadastre filtros e óleo para conferir o estoque.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Peça</th><th>Código</th><th className="num">Precisa</th><th className="num">Estoque</th></tr></thead>
                <tbody>
                  {parts.map((p, i) => (
                    <tr key={i}>
                      <td>{p.label}</td>
                      <td>{p.itemId ? <Link href={`/estoque/${p.itemId}`}>{p.code}</Link> : p.code}</td>
                      <td className="num">{formatNumber(p.needed)}</td>
                      <td className={`num ${p.ok ? 'ok-text' : 'bad-text'}`}>
                        {p.balance == null ? 'sem cadastro' : `${formatNumber(p.balance)} ${p.unit}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {parts.some((p) => !p.ok) && <p className="alert alert-warn" style={{ marginTop: '.75rem' }}>Há peças em falta ou sem cadastro no estoque.</p>}
        </section>
      </div>

      <section className="card" id="outras">
        <h2>Outras manutenções</h2>
        {plans.length === 0 ? (
          <p className="muted">Nenhum plano configurado (transmissão, hidráulico, correias…).</p>
        ) : (
          <ul className="list">
            {plans.map((p) => (
              <li key={p.id} className="item">
                <span className="item-body">
                  <span className="item-title">{p.type_name} <StatusBadge status={p.st.status} /></span>
                  <span className="item-sub">
                    {[p.interval_hours && `a cada ${formatNumber(p.interval_hours)} h`, p.interval_months && `${p.interval_months} meses`].filter(Boolean).join(' ou ')}
                    {p.spec ? `, ${p.spec}` : ''}
                  </span>
                  <span className="item-sub">
                    {p.last_date ? `Último: ${formatDate(p.last_date)}${p.last_hours != null ? ` (${formatHours(p.last_hours)})` : ''}. ` : 'Sem registro anterior. '}
                    {statusReason(p.st)}
                  </span>
                </span>
                {editable && (
                  <form action={deletePlan}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="tractor_id" value={t.id} />
                    <ConfirmButton className="btn btn-sm btn-ghost" message="Remover este plano? Os serviços já registrados continuam no histórico.">Remover</ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
          <div className="grid grid-2" style={{ marginTop: '1rem' }}>
            <details>
              <summary>Registrar serviço</summary>
              <ActionForm action={saveRecord} submitLabel="Registrar serviço">
                <input type="hidden" name="tractor_id" value={t.id} />
                <div className="fields">
                  <label className="span-2">Tipo *
                    <select name="type_id" required defaultValue="">
                      <option value="" disabled>Selecione…</option>
                      {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
                    </select>
                  </label>
                  <label>Data *<input name="serviced_at" type="date" required max={today} defaultValue={today} /></label>
                  <label>Horímetro (h) *<input name="service_hours" inputMode="decimal" required defaultValue={t.current_hours ?? ''} /></label>
                  <label>Produto / peça<input name="product_used" maxLength={120} /></label>
                  <label>Quantidade<input name="quantity" inputMode="decimal" /></label>
                  <label className="span-2">Observações<input name="notes" maxLength={2000} /></label>
                </div>
              </ActionForm>
            </details>
            <details>
              <summary>Configurar plano</summary>
              <ActionForm action={savePlan} submitLabel="Salvar plano">
                <input type="hidden" name="tractor_id" value={t.id} />
                <p className="hint">Use os intervalos do manual ou da oficina. Salvar um tipo já configurado atualiza o plano.</p>
                <div className="fields">
                  <label className="span-2">Tipo *
                    <select name="type_id" required defaultValue="">
                      <option value="" disabled>Selecione…</option>
                      {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
                    </select>
                  </label>
                  <label>Intervalo em horas<input name="interval_hours" inputMode="decimal" /></label>
                  <label>Intervalo em meses<input name="interval_months" type="number" min={1} inputMode="numeric" /></label>
                  <label className="span-2">Produto / peça<input name="spec" maxLength={120} /></label>
                </div>
              </ActionForm>
            </details>
          </div>
        )}
        {records.length > 0 && (
          <details>
            <summary>Histórico de outros serviços ({records.length})</summary>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Tipo</th><th className="num">Horímetro</th><th>Produto</th><th>Resp.</th><th></th></tr></thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDate(r.serviced_at)}</td>
                      <td>{r.type_name}{r.notes ? <span className="item-sub">{r.notes}</span> : null}</td>
                      <td className="num">{formatHours(r.service_hours)}</td>
                      <td>{[r.product_used, r.quantity != null ? formatNumber(r.quantity) : null].filter(Boolean).join(' × ') || '—'}</td>
                      <td>{r.performed_by ?? '—'}</td>
                      <td>
                        {editable && (
                          <form action={deleteRecord}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="tractor_id" value={t.id} />
                            <ConfirmButton className="btn btn-sm btn-ghost" message="Excluir este registro de serviço?">Excluir</ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <div className="grid grid-2">
        {editable && (
          <section className="card">
            <h2>Atualizar horímetro</h2>
            <p className="hint">Registra a leitura sem lançar serviço.</p>
            <ActionForm action={updateHours} submitLabel="Salvar leitura">
              <input type="hidden" name="tractor_id" value={t.id} />
              <div className="fields">
                <label>Horímetro (h) *<input name="hours" inputMode="decimal" required /></label>
                <label>Data da leitura *<input name="read_at" type="date" required max={today} defaultValue={today} /></label>
              </div>
              <details>
                <summary>Correção (leitura menor ou troca do horímetro)</summary>
                <div className="fields">
                  <label className="check span-2"><input type="checkbox" name="correction" value="1" /> Esta leitura é uma correção</label>
                  <label className="span-2">Justificativa<input name="reason" maxLength={500} /></label>
                </div>
              </details>
            </ActionForm>
            {readings.length > 0 && (
              <details>
                <summary>Últimas leituras</summary>
                <table>
                  <thead><tr><th>Data</th><th className="num">Horímetro</th><th></th></tr></thead>
                  <tbody>
                    {readings.map((r) => (
                      <tr key={r.id}>
                        <td>{formatDate(r.read_at)}</td>
                        <td className="num">{formatHours(r.hours)}</td>
                        <td>{r.is_correction ? `Correção: ${r.reason}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </section>
        )}

        <section className="card">
          <h2>
            Ordens de serviço
            {editable && <Link className="btn btn-sm" href={`/ordens/nova?trator=${t.id}`}>+ Abrir OS</Link>}
          </h2>
          {orders.length === 0 ? (
            <p className="muted">Nenhuma OS para este trator.</p>
          ) : (
            <ul className="list">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/ordens/${o.id}`} className="item">
                    <span className="item-body">
                      <span className="item-title">OS {o.number}, {formatDate(o.opened_at)}</span>
                      <span className="item-sub">{o.complaint ?? 'Sem descrição'}</span>
                    </span>
                    <span className="item-side">
                      <OrderBadge status={o.status} />
                      <span className="muted">{formatMoney(orderTotals([{ kind: 'peca', quantity: 1, unit_price: o.gross }], o.discount).total)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card" id="historico">
        <h2>
          Histórico de trocas de óleo
          {editable && <Link className="btn btn-sm btn-primary" href={`/manutencoes/nova?trator=${t.id}`}>+ Registrar</Link>}
        </h2>
        <OilChangeList changes={changes} allowDelete={editable} />
      </section>

      <section className="card" id="anexos">
        <h2>Fotos e documentos</h2>
        <Attachments items={attachments} tractorId={t.id} canEdit={editable} />
      </section>

      {editable && (
        <form action={setTractorActive}>
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="active" value={t.is_active ? '0' : '1'} />
          {t.is_active ? (
            <ConfirmButton className="btn btn-danger" message="Inativar este trator? O histórico é mantido e o número não será reutilizado.">Inativar trator</ConfirmButton>
          ) : (
            <button className="btn" type="submit">Reativar trator</button>
          )}
        </form>
      )}
    </>
  );
}
