// Port of the v8 spark(data,pos) helper → React SVG with identical geometry/classes.
let _uid = 0;
export function Spark({ data, pos }: { data: number[]; pos: boolean }) {
  const w = 300;
  const h = 44;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / rng) * (h - 10) - 5}`).join(" ");
  const col = pos ? "#4ade80" : "#f87171";
  const id = "g" + (_uid++).toString(36);
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity=".28" />
          <stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${id})`} stroke="none" />
      {data.map((v, i) => {
        if (i === 0) return null;
        const x1 = ((i - 1) / (data.length - 1)) * w;
        const y1 = h - ((data[i - 1] - min) / rng) * (h - 10) - 5;
        const x2 = (i / (data.length - 1)) * w;
        const y2 = h - ((v - min) / rng) * (h - 10) - 5;
        return (
          <line
            key={i}
            x1={x1.toFixed(1)}
            y1={y1.toFixed(1)}
            x2={x2.toFixed(1)}
            y2={y2.toFixed(1)}
            stroke={v >= data[i - 1] ? "#4ade80" : "#f87171"}
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
