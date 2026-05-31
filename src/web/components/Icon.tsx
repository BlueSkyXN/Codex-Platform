import type { SVGProps } from 'react';

export type IconName =
  | 'agent'
  | 'automation'
  | 'branch'
  | 'chat'
  | 'check'
  | 'chevronDown'
  | 'clock'
  | 'close'
  | 'copy'
  | 'dot'
  | 'file'
  | 'folder'
  | 'inbox'
  | 'menu'
  | 'panel'
  | 'paperclip'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'send'
  | 'settings'
  | 'sidebarLeft'
  | 'sidebarRight'
  | 'sliders'
  | 'spark'
  | 'stop'
  | 'terminal'
  | 'tool'
  | 'user';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: IconName;
  size?: number;
};

export function Icon({ name, size = 16, className, ...props }: IconProps) {
  return (
    <svg
      className={className ? `codex-icon ${className}` : 'codex-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: IconName) {
  switch (name) {
    case 'agent':
      return (
        <>
          <rect x="5" y="6" width="14" height="12" rx="3" />
          <path d="M9 11h.01" />
          <path d="M15 11h.01" />
          <path d="M9.5 15h5" />
          <path d="M12 3.5V6" />
        </>
      );
    case 'automation':
      return (
        <>
          <path d="M7 7.5A6.5 6.5 0 0 1 18.4 11" />
          <path d="M17 7.5h1.8V5.7" />
          <path d="M17 16.5A6.5 6.5 0 0 1 5.6 13" />
          <path d="M7 16.5H5.2v1.8" />
          <path d="M12 8.5v3.8l2.4 1.4" />
        </>
      );
    case 'branch':
      return (
        <>
          <circle cx="7" cy="6" r="2" />
          <circle cx="17" cy="18" r="2" />
          <circle cx="7" cy="18" r="2" />
          <path d="M7 8v8" />
          <path d="M9 6h3.5A4.5 4.5 0 0 1 17 10.5V16" />
        </>
      );
    case 'chat':
      return (
        <>
          <path d="M5.5 6.5h13v8.5a3 3 0 0 1-3 3H10l-4.5 3v-3a3 3 0 0 1-3-3V9.5a3 3 0 0 1 3-3Z" />
          <path d="M8 11h8" />
          <path d="M8 14h5" />
        </>
      );
    case 'check':
      return <path d="m5 12.5 4.3 4.2L19 7" />;
    case 'chevronDown':
      return <path d="m7 10 5 5 5-5" />;
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4.5l3 1.8" />
        </>
      );
    case 'close':
      return (
        <>
          <path d="M7 7l10 10" />
          <path d="M17 7 7 17" />
        </>
      );
    case 'copy':
      return (
        <>
          <rect x="8" y="8" width="10" height="10" rx="2" />
          <path d="M6 15.5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2v1" />
        </>
      );
    case 'dot':
      return <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />;
    case 'file':
      return (
        <>
          <path d="M7 3.5h6l4 4V20H7z" />
          <path d="M13 3.5v4h4" />
          <path d="M9.5 13h5" />
          <path d="M9.5 16h4" />
        </>
      );
    case 'folder':
      return <path d="M3.5 7.5h6l2 2h9v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />;
    case 'inbox':
      return (
        <>
          <path d="M4.5 5.5h15l-1.7 8.2a3 3 0 0 1-2.9 2.4H9.1a3 3 0 0 1-2.9-2.4z" />
          <path d="M8.5 16.1v1.4a1.5 1.5 0 0 0 1.5 1.5h4a1.5 1.5 0 0 0 1.5-1.5v-1.4" />
          <path d="M9 10.5h6" />
        </>
      );
    case 'menu':
      return (
        <>
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h14" />
        </>
      );
    case 'panel':
      return (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M14 5v14" />
        </>
      );
    case 'paperclip':
      return <path d="M8 12.5 14.5 6a4 4 0 1 1 5.7 5.7l-8.1 8.1a5 5 0 0 1-7.1-7.1l8.1-8.1" />;
    case 'plus':
      return (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      );
    case 'refresh':
      return (
        <>
          <path d="M19 6v5h-5" />
          <path d="M5 18v-5h5" />
          <path d="M17.5 9A6.5 6.5 0 0 0 6 8" />
          <path d="M6.5 15A6.5 6.5 0 0 0 18 16" />
        </>
      );
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </>
      );
    case 'send':
      return (
        <>
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2" />
          <path d="M12 18.5v2" />
          <path d="M4.6 7.8 6.3 8.8" />
          <path d="m17.7 15.2 1.7 1" />
          <path d="m4.6 16.2 1.7-1" />
          <path d="m17.7 8.8 1.7-1" />
        </>
      );
    case 'sidebarLeft':
      return (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M9 5v14" />
        </>
      );
    case 'sidebarRight':
      return (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M15 5v14" />
        </>
      );
    case 'sliders':
      return (
        <>
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h14" />
          <circle cx="9" cy="7" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="11" cy="17" r="1.6" fill="currentColor" stroke="none" />
        </>
      );
    case 'spark':
      return <path d="m12 3.5 1.9 5.4 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.8-5.6-1.9 5.6-1.9z" />;
    case 'stop':
      return <rect x="7" y="7" width="10" height="10" rx="1.8" fill="currentColor" stroke="none" />;
    case 'terminal':
      return (
        <>
          <path d="m5 8 4 4-4 4" />
          <path d="M11 17h8" />
        </>
      );
    case 'tool':
      return (
        <>
          <path d="M14.5 5.5a4 4 0 0 0 4 4L9 19l-4-4 9.5-9.5Z" />
          <path d="m7 17 2 2" />
        </>
      );
    case 'user':
      return (
        <>
          <circle cx="12" cy="8" r="3" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </>
      );
    default:
      return null;
  }
}
