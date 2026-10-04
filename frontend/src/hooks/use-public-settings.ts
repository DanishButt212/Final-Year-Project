import { useQuery } from '@tanstack/react-query';
import { settingsApi, type PublicSettings } from '@/lib/admin-api';
import { DEFAULT_MAX_MB } from '@/lib/pdf-files';

const FALLBACK: PublicSettings = { maxAttachmentMb: DEFAULT_MAX_MB, caseRegistrationOpen: true };

/** The administrator's policies the interface depends on (GET /settings/public). Falls back to defaults. */
export function usePublicSettings(): PublicSettings & { loaded: boolean } {
  const { data } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: settingsApi.publicSettings,
    staleTime: 60_000,
  });
  return { ...(data ?? FALLBACK), loaded: Boolean(data) };
}
