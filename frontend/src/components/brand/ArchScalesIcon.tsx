import type { SVGProps } from 'react';

const PRIMARY = '#01411C';
const GOLD = '#B8962E';

export interface ArchScalesIconProps extends Omit<SVGProps<SVGSVGElement>, 'stroke'> {
  /** Rendered width and height in px (or any CSS length). */
  size?: number | string;
  stroke?: string;
  accent?: string;
  /** Accessible name; without it the icon is decorative. */
  title?: string;
}

/**
 * The court arch with balanced scales. The beam, both pans and the side nodes form one group (pivot 60,44)
 * and each pan is its own sub-group (pivots 38,44 and 82,44), so the intro can sway the beam while the
 * pans keep hanging vertically. Original artwork: not the State Emblem or any court's logo.
 */
export function ArchScalesGlyph({
  stroke = PRIMARY,
  accent = GOLD,
}: {
  stroke?: string;
  accent?: string;
}) {
  // Pivots as percentages of each group's own bounding box (fill-box), which stays correct inside the
  // translated and scaled seal: beam box x 29-91, y 40.5-74.5 -> (60,44); pan boxes 18 wide from y 44.
  const pivot = (origin: string) => ({
    transformOrigin: origin,
    transformBox: 'fill-box' as const,
  });
  return (
    <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 108 V56 C22 34 40 21 60 12 C80 21 98 34 98 56 V108" strokeWidth={5} />
      <path d="M12 108 H108" strokeWidth={5} />
      <path d="M60 42 V98" strokeWidth={5} />
      <path d="M48 98 H72" strokeWidth={5} />
      <g className="da-beam" style={pivot('50% 10.294%')}>
        <path d="M38 44 H82" strokeWidth={4.5} />
        <g className="da-pan da-pan-left" style={pivot('50% 0%')}>
          <path d="M38 44 L31 68 M38 44 L45 68" strokeWidth={2} />
          <path d="M29 68 H47 A9 6.5 0 0 1 29 68 Z" fill={stroke} stroke="none" />
        </g>
        <g className="da-pan da-pan-right" style={pivot('50% 0%')}>
          <path d="M82 44 L75 68 M82 44 L89 68" strokeWidth={2} />
          <path d="M73 68 H91 A9 6.5 0 0 1 73 68 Z" fill={stroke} stroke="none" />
        </g>
        <rect x={34.5} y={40.5} width={7} height={7} rx={1.2} fill={accent} stroke="none" />
        <rect x={78.5} y={40.5} width={7} height={7} rx={1.2} fill={accent} stroke="none" />
      </g>
      <rect
        x={55}
        y={31}
        width={10}
        height={10}
        rx={1.6}
        fill={accent}
        stroke="none"
        transform="rotate(45 60 36)"
      />
    </g>
  );
}

export function ArchScalesIcon({
  size = 24,
  stroke = PRIMARY,
  accent = GOLD,
  title,
  ...rest
}: ArchScalesIconProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      <ArchScalesGlyph stroke={stroke} accent={accent} />
    </svg>
  );
}
