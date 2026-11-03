import { useId } from "react";

export default function TrafficChart({ data = [], type = 1, label = "" }) {
  const id = useId().replaceAll(":", "");
  const max = Math.max(1, ...data);
  const points = data.map(
    (value, index) =>
      `${(index / Math.max(1, data.length - 1)) * 180},${38 - (value / max) * 30}`,
  );
  return (
    <svg
      viewBox="0 0 180 42"
      className="traffic-chart"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".2" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 39H180" stroke="currentColor" opacity=".12" />
      {type === 3 ? (
        data.map((value, index) => (
          <rect
            key={index}
            x={(index / data.length) * 180}
            y={38 - (value / max) * 30}
            width={180 / Math.max(data.length, 1) - 2}
            height={Math.max(1, (value / max) * 30)}
            fill="currentColor"
            opacity=".65"
            rx="1"
          />
        ))
      ) : (
        <>
          {type === 2 && points.length > 1 && (
            <polygon
              points={`0,42 ${points.join(" ")} 180,42`}
              fill={`url(#${id})`}
            />
          )}
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
