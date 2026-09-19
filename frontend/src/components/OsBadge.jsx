import React from 'react';

/**
 * Enterprise OS Logo Badge component
 * Renders authentic, high-density SVG vectors for common enterprise Linux distributions:
 * Ubuntu, AlmaLinux, Debian, CentOS, RHEL, Rocky Linux, Fedora, Alpine, Arch, Generic Linux.
 */
export default function OsBadge({ osId, osName, className = 'w-4 h-4' }) {
  const normalized = (osId || osName || 'linux').toLowerCase();

  if (normalized.includes('ubuntu')) {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="Ubuntu">
        <circle cx="50" cy="50" r="48" fill="#E95420" />
        <circle cx="50" cy="50" r="28" stroke="white" strokeWidth="8.5" fill="none" />
        <circle cx="21" cy="50" r="7.5" fill="#E95420" stroke="white" strokeWidth="3" />
        <circle cx="64.5" cy="25" r="7.5" fill="#E95420" stroke="white" strokeWidth="3" />
        <circle cx="64.5" cy="75" r="7.5" fill="#E95420" stroke="white" strokeWidth="3" />
      </svg>
    );
  }

  if (normalized.includes('almalinux') || normalized.includes('alma')) {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="AlmaLinux">
        <circle cx="50" cy="50" r="48" fill="#0F1F38" />
        {/* AlmaLinux distinct 4-color petals / ribbon */}
        <path d="M30 40 C30 25, 45 25, 50 35 C55 25, 70 25, 70 40 C70 55, 50 75, 50 75 C50 75, 30 55, 30 40 Z" fill="#FFC72C" opacity="0.9" />
        <circle cx="42" cy="45" r="10" fill="#0077C8" />
        <circle cx="58" cy="45" r="10" fill="#00A859" />
        <circle cx="50" cy="58" r="8" fill="#E03C31" />
      </svg>
    );
  }

  if (normalized.includes('debian')) {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="Debian">
        <circle cx="50" cy="50" r="48" fill="#A80030" />
        <path
          d="M52 24 C38 24, 27 34, 27 48 C27 60, 36 71, 48 73 C58 75, 68 70, 71 60 C74 50, 68 40, 58 38 C50 36, 43 41, 42 49 C41 55, 45 61, 51 61 C55 61, 58 57, 57 53 C56 49, 52 48, 50 50"
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }

  if (normalized.includes('centos')) {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="CentOS">
        <circle cx="50" cy="50" r="48" fill="#262525" />
        {/* CentOS 4-color cross segments */}
        <path d="M48 24 L52 24 L52 48 L48 48 Z" fill="#93227F" />
        <path d="M52 24 L76 48 L73 51 L49 27 Z" fill="#EFA724" />
        <path d="M52 52 L76 76 L73 79 L49 55 Z" fill="#90C434" />
        <path d="M48 52 L52 52 L52 76 L48 76 Z" fill="#2259A6" />
        <path d="M24 52 L48 76 L45 79 L21 55 Z" fill="#EFA724" />
        <path d="M24 48 L48 24 L51 27 L27 51 Z" fill="#90C434" />
      </svg>
    );
  }

  if (normalized.includes('rhel') || normalized.includes('redhat') || normalized.includes('red hat')) {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="Red Hat Enterprise Linux">
        <circle cx="50" cy="50" r="48" fill="#EE0000" />
        {/* Fedora / Red Hat silhouette */}
        <path d="M25 62 C35 58, 65 58, 75 62 C80 64, 82 68, 75 70 C60 74, 40 74, 25 70 C18 68, 20 64, 25 62 Z" fill="#111111" />
        <path d="M35 60 C33 46, 42 34, 52 32 C62 30, 68 40, 65 60 Z" fill="#FFFFFF" />
        <path d="M35 60 C38 58, 62 58, 65 60 L64 64 L36 64 Z" fill="#EE0000" />
      </svg>
    );
  }

  if (normalized.includes('rocky')) {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="Rocky Linux">
        <circle cx="50" cy="50" r="48" fill="#10B981" />
        <path d="M30 65 L50 30 L65 55 L58 55 L50 42 L38 65 Z" fill="#09090B" />
        <circle cx="68" cy="65" r="5" fill="#09090B" />
      </svg>
    );
  }

  if (normalized.includes('fedora')) {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="Fedora">
        <circle cx="50" cy="50" r="48" fill="#294172" />
        <path d="M40 30 C30 30, 26 38, 26 48 C26 58, 32 66, 42 66 C48 66, 54 62, 56 56 L48 56 C45 58, 42 59, 40 59 C34 59, 32 54, 32 48 L60 48 L60 42 C60 35, 52 30, 40 30 Z M40 36 C46 36, 52 39, 52 43 L32 43 C33 39, 36 36, 40 36 Z" fill="#3C6EB4" />
        <path d="M56 46 L74 46 L74 52 L56 52 Z" fill="#FFFFFF" />
      </svg>
    );
  }

  if (normalized.includes('alpine')) {
    return (
      <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="Alpine Linux">
        <circle cx="50" cy="50" r="48" fill="#0D597F" />
        <path d="M22 68 L48 32 L60 50 L52 50 L48 42 L30 68 Z" fill="#FFFFFF" />
        <path d="M48 68 L64 45 L78 68 Z" fill="#A0C4DF" />
      </svg>
    );
  }

  // Generic Linux Tux / Chip
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" title="Linux">
      <circle cx="50" cy="50" r="48" fill="#F59E0B" />
      <path d="M50 22 C42 22, 38 28, 38 38 C38 48, 40 52, 34 60 C28 68, 30 74, 40 76 C48 78, 52 78, 60 76 C70 74, 72 68, 66 60 C60 52, 62 48, 62 38 C62 28, 58 22, 50 22 Z" fill="#18181B" />
      <ellipse cx="46" cy="35" rx="2" ry="3" fill="#FFFFFF" />
      <ellipse cx="54" cy="35" rx="2" ry="3" fill="#FFFFFF" />
      <polygon points="50,38 46,42 54,42" fill="#F59E0B" />
      <ellipse cx="50" cy="55" rx="10" ry="12" fill="#FFFFFF" />
    </svg>
  );
}
