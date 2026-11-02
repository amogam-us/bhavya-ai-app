import { useEffect, useRef, useState } from 'react';

/** The child app's screen size, in CSS pixels, before scaling to fit. */
const SCREEN_W = 390;
const SCREEN_H = 844;
const BEZEL = 12;

/** The real child app in a phone frame, scaled to fit the space it is given. */
export function PhoneFrame({ src }: { src: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const byHeight = (box.clientHeight - 4) / (SCREEN_H + BEZEL * 2);
      const byWidth = (box.clientWidth - 4) / (SCREEN_W + BEZEL * 2);
      setScale(Math.max(0.4, Math.min(1, byHeight, byWidth)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const outerW = (SCREEN_W + BEZEL * 2) * scale;
  const outerH = (SCREEN_H + BEZEL * 2) * scale;
  return (
    <div className="sim3d-phone-box" ref={boxRef}>
      <div className="sim3d-phone" style={{ width: outerW, height: outerH }}>
        <div
          className="sim3d-phone-body"
          style={{
            width: SCREEN_W + BEZEL * 2,
            height: SCREEN_H + BEZEL * 2,
            padding: BEZEL,
            transform: `scale(${scale})`,
          }}
        >
          <iframe
            src={src}
            title="Companion app"
            allow="microphone; camera; autoplay"
            style={{ width: SCREEN_W, height: SCREEN_H }}
          />
        </div>
      </div>
    </div>
  );
}
