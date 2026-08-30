export function LicenseeBadge({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="factory-verified-badge" role="img" aria-label="老贾已建联">
      <path d="M12 1.8l8.1 3v5.9c0 5.1-3.5 8.6-8.1 11.7-4.6-3.1-8.1-6.6-8.1-11.7v-5.9z" fill="#e8b43c" stroke="#a9741a" strokeWidth="1.5" />
      <path d="M7.5 12l3 3 6-6.2" fill="none" stroke="#fff" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
