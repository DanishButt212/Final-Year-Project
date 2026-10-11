import { useId, type SVGProps } from 'react';
import { ArchScalesGlyph } from './ArchScalesIcon';

const PRIMARY = '#01411C';
const GOLD = '#B8962E';
export const SEAL_RING_TEXT = 'DIGITAL ADAALAT · JUDICIAL ERP · PAKISTAN ·';

/** Gold diamonds on the inner ring, at 12, 3, 6 and 9 o'clock. */
const DIAMONDS: [number, number][] = [
  [100, 34],
  [166, 100],
  [100, 166],
  [34, 100],
];

export interface SealLogoProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  /** Accessible name; pass an empty string when a visible wordmark sits next to the seal. */
  title?: string;
}

/**
 * The primary DigitalAdaalat mark: a round seal with ring text and the arch-and-scales glyph.
 * Every instance gets its own text-path id (useId), so several seals can render on one page.
 * Class names (da-seal-ring, da-seal-diamond, da-beam, da-pan) are hooks for the intro animation.
 */
export function SealLogo({ size = 40, title = 'DigitalAdaalat', style, ...rest }: SealLogoProps) {
  const pathId = `seal-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      viewBox="0 0 200 200"
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      <circle cx={100} cy={100} r={96} fill="#FFFFFF" stroke={PRIMARY} strokeWidth={3.5} />
      <circle cx={100} cy={100} r={89} fill="none" stroke={PRIMARY} strokeWidth={1} />
      <circle cx={100} cy={100} r={66} fill="none" stroke={PRIMARY} strokeWidth={1.6} />
      <defs>
        {/* Starts at 6 o'clock and runs clockwise, so the text reads upright over the top. */}
        <path id={pathId} d="M100 177 A77 77 0 1 1 100 23 A77 77 0 1 1 100 177" />
      </defs>
      <g className="da-seal-ring" style={{ transformOrigin: '50% 50%', transformBox: 'fill-box' }}>
        {/* Invisible guide circle: keeps the group's box centred on (100,100) so it rotates in place. */}
        <circle cx={100} cy={100} r={89} fill="none" stroke="none" />
        <text
          fill={PRIMARY}
          fontFamily="'Inter Variable', Inter, system-ui, sans-serif"
          fontWeight={700}
          fontSize={11.5}
          letterSpacing={1}
          direction="ltr"
        >
          <textPath href={`#${pathId}`} textLength={470} lengthAdjust="spacing">
            {SEAL_RING_TEXT}
          </textPath>
        </text>
      </g>
      {DIAMONDS.map(([x, y], i) => (
        <g
          key={i}
          className="da-seal-diamond"
          style={{ transformOrigin: '50% 50%', transformBox: 'fill-box', ['--i' as string]: i }}
        >
          <rect
            x={x - 3.5}
            y={y - 3.5}
            width={7}
            height={7}
            rx={1}
            fill={GOLD}
            transform={`rotate(45 ${x} ${y})`}
          />
        </g>
      ))}
      <g transform="translate(43 40) scale(0.95)">
        <ArchScalesGlyph stroke={PRIMARY} accent={GOLD} />
      </g>
    </svg>
  );
}
