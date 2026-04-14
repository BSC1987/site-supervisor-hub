import { ExternalLink } from 'lucide-react';
import { DetailField, formatCurrency, formatDateTime, statusBadge } from './utils';

export function renderSignOffDetail(record: any, submittedBy: string) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Task type" value={record.task_type} />
      <DetailField label="Manager" value={record.manager_name} />
      <DetailField label="Manager email" value={record.manager_email} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {record.notes && (
        <div className="col-span-2">
          <DetailField label="Notes" value={record.notes} />
        </div>
      )}
      {record.manager_signature && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Manager Signature</dt>
          <dd className="mt-1">
            <img src={record.manager_signature} alt="Manager signature" className="h-20 rounded border border-border bg-white p-1" />
          </dd>
        </div>
      )}
    </dl>
  );
}

export function renderHourlyAgreementDetail(record: any, submittedBy: string) {
  const descriptions = record.descriptions as string[] | null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Hours" value={record.hours} />
      <DetailField label="Rate" value={formatCurrency(record.rate)} />
      <DetailField label="Total" value={record.hours && record.rate ? formatCurrency(record.hours * record.rate) : '—'} />
      <DetailField label="Invoiced" value={record.invoiced ? 'Yes' : 'No'} />
      <DetailField label="Manager email" value={record.manager_email} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {descriptions && descriptions.length > 0 && (
        <div className="col-span-2">
          <DetailField label="Descriptions" value={
            <ul className="list-disc list-inside space-y-0.5">
              {descriptions.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          } />
        </div>
      )}
      {record.other_description && (
        <div className="col-span-2">
          <DetailField label="Other description" value={record.other_description} />
        </div>
      )}
      {record.photo_urls && record.photo_urls.length > 0 && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Photos</dt>
          <dd className="flex gap-2 mt-1 flex-wrap">
            {(record.photo_urls as string[]).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover rounded border border-border" />
              </a>
            ))}
          </dd>
        </div>
      )}
      {record.signature_data && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Signature</dt>
          <dd className="mt-1">
            <img src={record.signature_data} alt="Signature" className="h-20 rounded border border-border bg-white p-1" />
          </dd>
        </div>
      )}
    </dl>
  );
}

export function renderIssueReportDetail(record: any, submittedBy: string) {
  const issues = record.issues as string[] | null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Task" value={record.task_name} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {issues && issues.length > 0 && (
        <div className="col-span-2">
          <DetailField label="Issues" value={
            <ul className="list-disc list-inside space-y-0.5">
              {issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          } />
        </div>
      )}
      {record.photo_urls && record.photo_urls.length > 0 && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Photos</dt>
          <dd className="flex gap-2 mt-1 flex-wrap">
            {(record.photo_urls as string[]).map((url: string, i: number) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover rounded border border-border" />
              </a>
            ))}
          </dd>
        </div>
      )}
    </dl>
  );
}

export function renderQualityReportDetail(record: any, submittedBy: string) {
  const photos = record.photos as any[] | null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {photos && photos.length > 0 && (
        <div className="col-span-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wide">Photos</dt>
          <dd className="flex gap-2 mt-1 flex-wrap">
            {photos.map((photo: any, i: number) => {
              const url = typeof photo === 'string' ? photo : photo?.url || photo?.path;
              if (!url) return null;
              return (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover rounded border border-border" />
                </a>
              );
            })}
          </dd>
        </div>
      )}
    </dl>
  );
}

export function renderInvoiceDetail(record: any, submittedBy: string) {
  const plotItems = (record.plot_items || []) as any[];
  const hourlyItems = (record.hourly_items || []) as any[];
  const miscItems = (record.misc_items || []) as any[];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <DetailField label="Reference" value={record.reference_number} />
        <DetailField label="Invoice #" value={record.invoice_number} />
        <DetailField label="Submitted by" value={submittedBy} />
        <DetailField label="Status" value={statusBadge(record.status)} />
        <DetailField label="Total amount" value={formatCurrency(record.total_amount)} />
        <DetailField label="Submitted at" value={formatDateTime(record.submitted_at)} />
        <DetailField label="Created" value={formatDateTime(record.created_at)} />
        {record.notes && (
          <div className="col-span-2">
            <DetailField label="Notes" value={record.notes} />
          </div>
        )}
      </dl>

      {plotItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Plot Items</h4>
          <div className="border rounded text-sm divide-y divide-border">
            {plotItems.map((item: any, i: number) => (
              <div key={i} className="px-3 py-2 grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <span className="font-medium">{item.site_name}</span>
                  <span className="text-muted-foreground"> / Plot {item.plot_name}</span>
                  <span className="text-muted-foreground"> / {item.task_type}</span>
                  {item.price_type && <span className="text-muted-foreground"> ({item.price_type})</span>}
                  {item.note && <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>}
                </div>
                <div className="text-right whitespace-nowrap">
                  {item.percentage != null && item.percentage < 100 && (
                    <span className="text-muted-foreground text-xs mr-1">{item.percentage}% of {formatCurrency(item.full_price)}</span>
                  )}
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hourlyItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Hourly Agreements</h4>
          <div className="border rounded text-sm divide-y divide-border">
            {hourlyItems.map((item: any, i: number) => {
              const ha = item.hourly_agreement;
              return (
                <div key={i} className="px-3 py-2 grid grid-cols-[1fr_auto] gap-2">
                  <div>
                    <span className="font-medium">{ha?.site_name || '—'}</span>
                    <span className="text-muted-foreground"> / Plot {ha?.plot_name || '—'}</span>
                    <span className="text-muted-foreground"> / {ha?.hours}h @ {formatCurrency(ha?.rate)}</span>
                  </div>
                  <div className="text-right font-medium">
                    {ha?.hours && ha?.rate ? formatCurrency(ha.hours * ha.rate) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {miscItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Misc Items</h4>
          <div className="border rounded text-sm divide-y divide-border">
            {miscItems.map((item: any, i: number) => (
              <div key={i} className="px-3 py-2 grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <span className="font-medium">{item.description || 'Misc item'}</span>
                  {item.hours && <span className="text-muted-foreground"> / {item.hours}h @ {formatCurrency(item.rate)}</span>}
                  {item.note && <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>}
                </div>
                <div className="text-right font-medium">{formatCurrency(item.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {record.document_urls && record.document_urls.length > 0 && (
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Documents</dt>
          <dd className="flex flex-col gap-1">
            {(record.document_urls as string[]).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:underline inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                Document {i + 1}
              </a>
            ))}
          </dd>
        </div>
      )}
    </div>
  );
}

export function renderGenericDetail(record: any, submittedBy: string) {
  // Fallback for issue_reports / quality_reports when those tables exist
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <DetailField label="Reference" value={record.reference_number} />
      <DetailField label="Submitted by" value={submittedBy} />
      <DetailField label="Site" value={record.site_name} />
      <DetailField label="Plot" value={record.plot_name} />
      <DetailField label="Status" value={statusBadge(record.status)} />
      <DetailField label="Date" value={formatDateTime(record.created_at)} />
      {record.notes && (
        <div className="col-span-2">
          <DetailField label="Notes" value={record.notes} />
        </div>
      )}
      {record.description && (
        <div className="col-span-2">
          <DetailField label="Description" value={record.description} />
        </div>
      )}
    </dl>
  );
}
