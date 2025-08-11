import React, { useRef, useState, useEffect } from "react";

const ASPECT_RATIO = 4 / 3; // Moved outside component for stable reference

function App() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const socketRef = useRef(null);

  const [currentColor, setCurrentColor] = useState("#000000");
  const [drawing, setDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState([]);
  const strokesRef = useRef([]);

  // Resize canvas function: fits container width or window width (mobile),
  // sets actual canvas pixels and CSS pixels to match (accounting for devicePixelRatio)
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas) return;

    const containerWidth = container
      ? container.clientWidth
      : window.innerWidth;

    const newWidth = containerWidth;
    const newHeight = containerWidth / ASPECT_RATIO;

    const dpr = window.devicePixelRatio || 1;

    canvas.width = newWidth * dpr;
    canvas.height = newHeight * dpr;

    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    redrawAll(ctx);
  };

  // Convert mouse/touch event coords to canvas coords, scaled to canvas size
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const drawLine = (ctx, stroke) => {
    if (stroke.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = stroke[0].color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i++) {
      ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  };

  const redrawAll = (ctx) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const stroke of strokesRef.current) {
      drawLine(ctx, stroke);
    }
  };

  const sendMessage = (msg) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  };

  useEffect(() => {
    socketRef.current = new WebSocket("wss://web-production-0f84.up.railway.app/ws");

    socketRef.current.onopen = () => {
      console.log("Connected to WebSocket backend");
    };

    socketRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const ctx = canvasRef.current.getContext("2d");

      switch (msg.type) {
        case "init":
          strokesRef.current = msg.strokes || [];
          redrawAll(ctx);
          break;

        case "start":
          setCurrentStroke([{ x: msg.x, y: msg.y, color: msg.color }]);
          break;

        case "draw":
          setCurrentStroke((prev) => {
            const newStroke = [...prev, { x: msg.x, y: msg.y, color: msg.color }];
            drawLine(ctx, newStroke);
            return newStroke;
          });
          break;

        case "endStroke":
          if (msg.stroke) {
            strokesRef.current.push(msg.stroke);
            redrawAll(ctx);
          }
          setCurrentStroke([]);
          break;

        case "undo":
          strokesRef.current.pop();
          redrawAll(ctx);
          break;

        case "clear":
          strokesRef.current = [];
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          break;

        default:
          break;
      }
    };

    socketRef.current.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return () => {
      socketRef.current.close();
    };
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []); // no need to include ASPECT_RATIO here since it's constant and declared outside

  const handlePointerDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    setDrawing(true);
    const stroke = [{ x: pos.x, y: pos.y, color: currentColor }];
    setCurrentStroke(stroke);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = currentColor;

    sendMessage({ type: "start", x: pos.x, y: pos.y, color: currentColor });
  };

  const handlePointerMove = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);

    setCurrentStroke((prev) => {
      const newStroke = [...prev, { x: pos.x, y: pos.y, color: currentColor }];
      const ctx = canvasRef.current.getContext("2d");
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      sendMessage({ type: "draw", x: pos.x, y: pos.y, color: currentColor });
      return newStroke;
    });
  };

  const endDrawing = (e) => {
    if (!drawing) return;
    e.preventDefault();
    setDrawing(false);
    strokesRef.current.push(currentStroke);
    sendMessage({ type: "endStroke", stroke: currentStroke });
    setCurrentStroke([]);
  };

  const handleUndo = () => {
    strokesRef.current.pop();
    const ctx = canvasRef.current.getContext("2d");
    redrawAll(ctx);
    sendMessage({ type: "undo" });
  };

  const handleClear = () => {
    strokesRef.current = [];
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    sendMessage({ type: "clear" });
  };

  // Styles object omitted here for brevity — use your existing styles

  // For example purposes, here's the minimal render:
  return (
    <div ref={containerRef} style={{ padding: 10 }}>
      <h2>Collaborative Drawing Lap</h2>
      <input
        type="color"
        value={currentColor}
        onChange={(e) => setCurrentColor(e.target.value)}
        title="Select color"
      />
      <button onClick={handleUndo}>Undo</button>
      <button onClick={handleClear}>Clear</button>
      <canvas
        ref={canvasRef}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={endDrawing}
        style={{ border: "1px solid black", borderRadius: 12, display: "block", marginTop: 10 }}
      />
    </div>
  );
}

export default App;
