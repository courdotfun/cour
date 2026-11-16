import type { UiToken } from "@/lib/live/map";

// Port of the v8 ava(t) helper — same classes/markup.
export function Ava({ t, size }: { t: Pick<UiToken, "tick" | "hue" | "logo">; size?: number }) {
  const style: React.CSSProperties = size ? { width: size, height: size } : {};
  if (t.logo) {
    return (
      <div className="ava logo" style={{ ...style, backgroundImage: `url(${t.logo})` }}>
        {t.tick[0]}
      </div>
    );
  }
  const g = `linear-gradient(135deg,hsl(${t.hue} 70% 58%),hsl(${(t.hue + 42) % 360} 72% 46%))`;
  return (
    <div className="ava" style={{ ...style, background: g }}>
      {t.tick[0]}
    </div>
  );
}
