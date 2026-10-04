import { Eraser } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export interface SignatureHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
}

/** Full-width touch signature pad. Pointer events with touch-action none, so drawing never scrolls the page. */
export const SignatureCanvas = forwardRef<
  SignatureHandle,
  { onChange?: (hasInk: boolean) => void }
>(function SignatureCanvas({ onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const ink = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const setup = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a1a';
  }, []);

  useEffect(() => {
    setup();
  }, [setup]);

  const point = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const clear = useCallback(() => {
    ink.current = false;
    setHasInk(false);
    onChange?.(false);
    setup();
  }, [onChange, setup]);

  useImperativeHandle(
    ref,
    () => ({
      clear,
      isEmpty: () => !ink.current,
      toBlob: () =>
        new Promise<Blob | null>((resolve) => canvas.current?.toBlob(resolve, 'image/png')),
    }),
    [clear],
  );

  return (
    <div className="space-y-2">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Signature pad. Draw the recipient signature with a finger or stylus."
        className="h-48 w-full cursor-crosshair rounded-md border-2 border-dashed border-primary bg-white"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = canvas.current?.getContext('2d');
          const p = point(e);
          ctx?.beginPath();
          ctx?.moveTo(p.x, p.y);
          ctx?.lineTo(p.x + 0.01, p.y + 0.01);
          ctx?.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvas.current?.getContext('2d');
          const p = point(e);
          ctx?.lineTo(p.x, p.y);
          ctx?.stroke();
          if (!ink.current) {
            ink.current = true;
            setHasInk(true);
            onChange?.(true);
          }
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <Button
        type="button"
        variant="secondary"
        className="min-h-12"
        onClick={clear}
        disabled={!hasInk}
      >
        <Eraser aria-hidden="true" /> Clear
      </Button>
    </div>
  );
});
