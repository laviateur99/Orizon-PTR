"use client";

import { useEffect, useRef } from "react";

export function SignaturePad({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !value) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = value;
  }, [value]);

  function coords(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const point = coords(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = ref.current?.getContext("2d");
    if (!context) return;
    const point = coords(event);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.strokeStyle = "#071b34";
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function end() {
    drawing.current = false;
    const canvas = ref.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <label className="signature-pad">
      <strong>{label}</strong>
      <canvas ref={ref} width={700} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      <button type="button" className="button secondary small" onClick={clear}>Effacer</button>
    </label>
  );
}
