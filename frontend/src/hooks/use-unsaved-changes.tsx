import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Warns before the user throws away unsaved work:
 *  - closing or reloading the tab (browser prompt), and
 *  - clicking any in-app link (a confirmation dialog; the click is held until the user decides).
 * Returns the dialog element, which the page must render.
 */
export function useUnsavedChangesGuard(dirty: boolean): ReactElement {
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    // Capture phase: runs before React Router handles the click.
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href || !href.startsWith('/') || anchor.getAttribute('target') === '_blank') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setPending(href);
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave this page?</DialogTitle>
          <DialogDescription>
            Your case details have not been submitted. If you leave now, everything you entered will
            be lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setPending(null)}>
            Stay on this page
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const to = pending;
              setPending(null);
              if (to) navigate(to);
            }}
          >
            Leave and discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
