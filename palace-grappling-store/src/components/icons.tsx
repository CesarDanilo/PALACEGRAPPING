import type { SVGProps } from 'react';

// Ícones de traço fino (24×24, stroke 1.6), decorativos por padrão.
// Quando um ícone for o único conteúdo de um botão, o botão leva aria-label.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.8-4.8" />
  </Icon>
);
export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" />
  </Icon>
);
export const BagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8h14l-1 13H6L5 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </Icon>
);
export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7h18M3 12h18M9 17h12" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 5 14 14M19 5 5 19" />
  </Icon>
);
export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h17M14 6l6 6-6 6" />
  </Icon>
);
export const ArrowUpRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Icon>
);
export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v17M6 14l6 6 6-6" />
  </Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v16M4 12h16" />
  </Icon>
);
export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12h16" />
  </Icon>
);
export const TruckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" />
    <circle cx="6" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </Icon>
);
export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Icon>
);
export const ChatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </Icon>
);
export const MedalIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="14" r="6" />
    <path d="M8 3h8l-2 5h-4L8 3Z" />
  </Icon>
);
export const FabricIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4h16v16H4z" />
    <path d="M4 9h16M4 14h16M9 4v16M14 4v16" />
  </Icon>
);
export const StitchIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20 20 4" />
    <path d="m6 14 4 4M10 10l4 4M14 6l4 4" />
  </Icon>
);
export const RulerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 16 16 3l5 5L8 21l-5-5Z" />
    <path d="m7 12 2 2M10 9l2 2M13 6l2 2" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 12 5 5L20 6" />
  </Icon>
);
export const FilterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18M6 12h12M10 18h4" />
  </Icon>
);
export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
  </Icon>
);
export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Icon>
);
export const StarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
  </Icon>
);
