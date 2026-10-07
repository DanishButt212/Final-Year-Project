import { useQuery } from '@tanstack/react-query';
import { Lock, Video } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { virtualApi } from '@/lib/virtual-api';

/** Small "Virtual" marker for hearing rows and cards. */
export function VirtualBadge() {
  return (
    <Badge variant="accent" className="gap-1">
      Virtual
    </Badge>
  );
}

/**
 * UC-3.3 Access Virtual Courtroom Link: "Join Remote Hearing Video Room", greyed out with the lobby message while
 * the Admin Bench has not opened the session or the hearing is not yet within 15 minutes.
 */
export function JoinRoomButton({ hearingId }: { hearingId: string }) {
  const { data, isPending } = useQuery({
    queryKey: ['virtual-status', hearingId],
    queryFn: () => virtualApi.status(hearingId),
    refetchInterval: 30_000,
  });
  if (isPending || !data) {
    return (
      <Button size="sm" variant="secondary" disabled>
        <Video aria-hidden="true" /> Join Remote Hearing Video Room
      </Button>
    );
  }
  if (data.state === 'CLOSED') {
    return <p className="text-sm text-text-muted">{data.message}</p>;
  }
  if (data.state !== 'OPEN') {
    const id = `room-msg-${hearingId}`;
    return (
      <div className="max-w-64 space-y-1">
        <Button size="sm" variant="secondary" disabled aria-describedby={id}>
          <Lock aria-hidden="true" /> Join Remote Hearing Video Room
        </Button>
        <p id={id} className="whitespace-normal text-xs text-text-muted">
          {data.message}
        </p>
      </div>
    );
  }
  return (
    <Button size="sm" asChild>
      <Link to={`/courtroom/${hearingId}`}>
        <Video aria-hidden="true" /> Join Remote Hearing Video Room
      </Link>
    </Button>
  );
}
