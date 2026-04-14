import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, ChevronDown, Plus, ExternalLink, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SUPABASE_URL } from './types';

/**
 * Top-of-page editable site info panel for the admin layout. Loads the site row,
 * lets the supervisor edit name / address / grid reference inline (save on blur)
 * and manage one or more site-plan files. Existing single-URL data is parsed as
 * a one-element list, and the column is round-tripped as newline-separated URLs
 * so we don't need a schema change to support multiple files.
 */
export function SiteInfoPanel({
  siteId,
  initialName,
  onNameSaved,
}: {
  siteId: string;
  initialName: string;
  onNameSaved: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState('');
  const [gridRef, setGridRef] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [plans, setPlans] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('sites')
        .select('name, address, grid_reference, latitude, longitude, site_plans')
        .eq('id', siteId)
        .single();
      if (cancelled) return;
      if (error) {
        toast.error('Failed to load site: ' + error.message);
        setLoading(false);
        return;
      }
      setName(data?.name ?? '');
      setAddress(data?.address ?? '');
      setGridRef(data?.grid_reference ?? '');
      setLatitude(data?.latitude != null ? String(data.latitude) : '');
      setLongitude(data?.longitude != null ? String(data.longitude) : '');
      const raw: string = data?.site_plans ?? '';
      setPlans(raw ? raw.split('\n').filter(Boolean) : []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const saveField = async (column: string, value: string) => {
    const { error } = await supabase.from('sites').update({ [column]: value }).eq('id', siteId);
    if (error) {
      toast.error('Save failed: ' + error.message);
      return false;
    }
    return true;
  };

  const handleNameBlur = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === initialName) return;
    if (await saveField('name', trimmed)) {
      onNameSaved(trimmed);
      toast.success('Site name updated');
    }
  };

  const handleAddressBlur = () => saveField('address', address.trim());
  const handleGridRefBlur = () => saveField('grid_reference', gridRef.trim());

  const handleLatBlur = async () => {
    const val = latitude.trim();
    const num = val === '' ? null : parseFloat(val);
    if (val !== '' && (num === null || isNaN(num))) return;
    const { error } = await supabase.from('sites').update({ latitude: num }).eq('id', siteId);
    if (error) toast.error('Save failed: ' + error.message);
  };

  const handleLngBlur = async () => {
    const val = longitude.trim();
    const num = val === '' ? null : parseFloat(val);
    if (val !== '' && (num === null || isNaN(num))) return;
    const { error } = await supabase.from('sites').update({ longitude: num }).eq('id', siteId);
    if (error) toast.error('Save failed: ' + error.message);
  };

  const persistPlans = async (next: string[]) => {
    setPlans(next);
    await saveField('site_plans', next.join('\n'));
  };

  const triggerFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => handleUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
    input.click();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const uploaded: string[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `sites/${siteId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('site-plans').upload(path, file, { upsert: true });
      if (error) {
        toast.error(`Upload failed for ${file.name}: ${error.message}`);
        continue;
      }
      uploaded.push(`${SUPABASE_URL}/storage/v1/object/public/site-plans/${path}`);
    }
    if (uploaded.length > 0) {
      await persistPlans([...plans, ...uploaded]);
      toast.success(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} uploaded`);
    }
    e.target.value = '';
  };

  const handleRemovePlan = async (url: string) => {
    await persistPlans(plans.filter(p => p !== url));
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm">Loading site…</div>;
  }

  return (
    <div className="border rounded-lg bg-card divide-y divide-border">
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="px-4 py-3 space-y-1">
          <Label htmlFor="site-name" className="text-xs text-muted-foreground">Site Name</Label>
          <Input
            id="site-name"
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={handleNameBlur}
            className="h-8 px-2 text-sm border-0 bg-transparent p-0 focus-visible:ring-0 font-medium"
          />
        </div>
        <div className="px-4 py-3 space-y-1">
          <Label htmlFor="site-address" className="text-xs text-muted-foreground">Address</Label>
          <Input
            id="site-address"
            value={address}
            onChange={e => setAddress(e.target.value)}
            onBlur={handleAddressBlur}
            className="h-8 px-2 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="px-4 py-3 space-y-1">
          <Label htmlFor="site-grid-ref" className="text-xs text-muted-foreground">Grid Reference</Label>
          <Input
            id="site-grid-ref"
            value={gridRef}
            onChange={e => setGridRef(e.target.value)}
            onBlur={handleGridRefBlur}
            className="h-8 px-2 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
          />
        </div>
        <div className="px-4 py-3 space-y-1">
          <Label htmlFor="site-lat" className="text-xs text-muted-foreground">Latitude</Label>
          <Input
            id="site-lat"
            value={latitude}
            onChange={e => setLatitude(e.target.value)}
            onBlur={handleLatBlur}
            placeholder="e.g. 50.2631"
            className="h-8 px-2 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
          />
        </div>
        <div className="px-4 py-3 space-y-1">
          <Label htmlFor="site-lng" className="text-xs text-muted-foreground">Longitude</Label>
          <Input
            id="site-lng"
            value={longitude}
            onChange={e => setLongitude(e.target.value)}
            onBlur={handleLngBlur}
            placeholder="e.g. -5.0512"
            className="h-8 px-2 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
          />
        </div>
        <div className="px-4 py-3 space-y-1">
          <Label className="text-xs text-muted-foreground">Site Plans</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-8 w-full px-2 text-sm flex items-center gap-2 rounded
                           text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate flex-1 text-left">
                  {plans.length > 0
                    ? `${plans.length} file${plans.length === 1 ? '' : 's'}`
                    : 'No files'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {plans.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No site plans uploaded
                </div>
              ) : (
                plans.map(url => {
                  const fileName = url.split('/').pop() ?? url;
                  return (
                    <DropdownMenuItem
                      key={url}
                      onSelect={(e) => e.preventDefault()}
                      className="flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{fileName}</span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1 hover:bg-accent"
                        aria-label={`View ${fileName}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemovePlan(url)}
                        className="rounded p-1 hover:bg-destructive hover:text-destructive-foreground"
                        aria-label={`Remove ${fileName}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuItem>
                  );
                })
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => triggerFilePicker()}>
                <Plus className="h-4 w-4 mr-2" />
                Add new
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
