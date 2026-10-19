/** Shared brand artwork. Keep the original wordmark lettering separate from the UI font. */
export function SlabMark({ size = 40 }: { size?: number }) {
  return <svg className="slab-mark" width={size * .75} height={size} viewBox="0 0 30 40" fill="none" aria-hidden="true">
    <rect x="3" y="1" width="24" height="38" rx="3.5" stroke="currentColor" strokeWidth="1.7" />
    <rect x="6.5" y="4.5" width="17" height="5" rx=".8" fill="currentColor" />
    <rect x="6.5" y="13" width="17" height="22.5" rx=".8" stroke="currentColor" strokeWidth="1.3" />
  </svg>;
}

export function Wordmark() {
  return <span className="wordmark">slab<span className="brand-light">trak</span><span className="brand-dot">.</span></span>;
}

export default function Brand() {
  return <a className="brand" href="/" aria-label="SlabTrak home"><SlabMark /><Wordmark /></a>;
}
