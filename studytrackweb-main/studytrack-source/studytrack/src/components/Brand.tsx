import markLight from '../logo.png';
import markDark from '../brand/mark-dark.png';
import lockupLight from '../brand/lockup-light.png';
import lockupDark from '../brand/lockup-dark.png';

/** StudyTrack mark (book + rising arrow). Swaps to a light-on-dark version in dark theme. */
export function BrandMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <>
      <img
        src={markLight}
        alt=""
        width={size}
        height={size}
        className={`only-light ${className}`}
        draggable={false}
      />
      <img
        src={markDark}
        alt=""
        width={size}
        height={size}
        className={`only-dark ${className}`}
        draggable={false}
      />
    </>
  );
}

/** Full logo: mark + wordmark + tagline. */
export function BrandLockup({ width = 240, className = '' }: { width?: number; className?: string }) {
  const h = Math.round((width * 303) / 1293);
  return (
    <>
      <img
        src={lockupLight}
        alt="StudyTrack"
        width={width}
        height={h}
        className={`only-light ${className}`}
        draggable={false}
      />
      <img
        src={lockupDark}
        alt="StudyTrack"
        width={width}
        height={h}
        className={`only-dark ${className}`}
        draggable={false}
      />
    </>
  );
}
