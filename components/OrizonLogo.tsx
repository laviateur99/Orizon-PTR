export function OrizonLogo() {
  return (
    <div className="orizon-fd-logo" aria-label="Orizon FD">
      <svg viewBox="0 0 120 120" role="img">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="1" stopColor="#1d8cff" />
          </linearGradient>
        </defs>
        <path d="M17 57c17-25 44-36 73-29" fill="none" stroke="url(#g)" strokeWidth="7" strokeLinecap="round" />
        <path d="M24 89c22-9 48-11 75-4" fill="none" stroke="url(#g)" strokeWidth="6" strokeLinecap="round" />
        <path d="M76 32l25-12 4 5-19 18 12 19-5 4-17-15-19 11-4-5 15-18-12-14 5-4 15 11z" fill="#7dd3fc" />
        <text x="25" y="69" fill="white" fontSize="24" fontWeight="900" fontFamily="Arial, sans-serif">ORIZON</text>
        <text x="39" y="92" fill="#38bdf8" fontSize="27" fontWeight="900" fontFamily="Arial, sans-serif">FD</text>
      </svg>
    </div>
  );
}
