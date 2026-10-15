import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { getTractor, getTractorFilters } from '@/lib/data';
import { filterTypeLabel } from '@/lib/format';
import { PrintButton } from '@/components/PrintButton';
import { PageHead } from '@/components/ui';

/** Etiqueta para colar no trator: QR abre a ficha direto pelo celular (na rede da oficina). */
export default async function Etiqueta({ params }: { params: Promise<{ id: string }> }) {
  const t = getTractor(Number((await params).id));
  if (!t) notFound();
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const url = `${proto}://${host}/tratores/${t.id}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
  const filters = getTractorFilters(t.id);

  return (
    <>
      <div className="no-print">
        <PageHead title={`Etiqueta do trator nº ${t.sequential_number}`} back={{ href: `/tratores/${t.id}`, label: 'Ficha do trator' }}>
          <PrintButton label="Imprimir etiqueta" />
        </PageHead>
        <p className="muted">O QR aponta para <strong>{url}</strong>. Para funcionar no celular, abra o sistema pelo endereço da rede (IP do computador) antes de imprimir.</p>
      </div>
      <div className="label-sheet">
        <div className="tag-label">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
          <div>
            <div className="hero-num">{t.sequential_number}</div>
            <div style={{ fontWeight: 700, marginTop: '.3rem' }}>{t.brand} {t.model}</div>
            <div className="muted">{t.owner_name}</div>
            {t.oil_spec && <div style={{ fontSize: '.8rem' }}>Óleo: {t.oil_spec}</div>}
            {filters.slice(0, 4).map((f) => (
              <div key={f.id} style={{ fontSize: '.8rem' }}>{filterTypeLabel(f.filter_type)}: <strong>{f.reference_code}</strong></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
