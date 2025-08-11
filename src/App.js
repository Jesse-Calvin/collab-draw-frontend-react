import React, { useRef, useState, useEffect, useCallback } from "react";

const ASPECT_RATIO = 4 / 3;

function App() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const socketRef = useRef(null);

  const [currentColor, setCurrentColor] = useState("#000000");
  const [lines, setLines] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [undoStack, setUndoStack] = useState([]);

  // Setup WebSocket connection and event handlers
  useEffect(() => {
    socketRef.current = new WebSocket(
      "wss://web-production-0f84.up.railway.app/ws"
    );

    socketRef.current.onopen = () => {
      console.log("WebSocket connected");
    };

    socketRef.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "new_line") {
        setLines((prevLines) => [...prevLines, message.payload]);
      }
    };

    socketRef.current.onclose = () => {
      console.log("WebSocket disconnected");
    };

    return () => {
      socketRef.current.close();
    };
  }, []);

  // Redraw all lines on the canvas
  const redrawAll = useCallback(
    (ctx) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;

      lines.forEach((line) => {
        ctx.strokeStyle = line.color;
        ctx.beginPath();
        line.points.forEach(({ x, y }, i) => {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
    },
    [lines]
  );

  // Resize canvas responsively and set scaling for high DPI screens
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const containerWidth = container.clientWidth;
    const newWidth = containerWidth;
    const newHeight = containerWidth / ASPECT_RATIO;

    const dpr = window.devicePixelRatio || 1;

    canvas.width = newWidth * dpr;
    canvas.height = newHeight * dpr;

    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset any existing transforms
    ctx.scale(dpr, dpr);

    redrawAll(ctx);
  }, [redrawAll, ASPECT_RATIO]);

  // On mount and window resize, resize the canvas
  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // Redraw when lines change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    redrawAll(ctx);
  }, [lines, redrawAll]);

  // Convert event to coordinates relative to canvas top-left
  // FIX: multiply by devicePixelRatio to fix drawing offset
  const getRelativeCoords = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    const dpr = window.devicePixelRatio || 1;

    return {
      x: (clientX - rect.left) * dpr,
      y: (clientY - rect.top) * dpr,
    };
  };

  // Start drawing - add new line and send to WebSocket
  const startDrawing = (event) => {
    const point = getRelativeCoords(event);
    const newLine = { color: currentColor, points: [point] };
    setLines((prev) => [...prev, newLine]);
    setIsDrawing(true);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({ type: "new_line", payload: newLine })
      );
    }
  };

  // Continue drawing - add points to current line and send update to WebSocket
  const draw = (event) => {
    if (!isDrawing) return;
    const point = getRelativeCoords(event);

    setLines((prevLines) => {
      const newLines = [...prevLines];
      const lastLine = newLines[newLines.length - 1];
      lastLine.points = [...lastLine.points, point];

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({ type: "update_line", payload: lastLine })
        );
      }

      return newLines;
    });
  };

  // Stop drawing
  const endDrawing = () => {
    setIsDrawing(false);
  };

  // Undo last line drawn
  const undo = () => {
    setLines((prev) => {
      if (prev.length === 0) return prev;
      const newUndoStack = [...undoStack, prev[prev.length - 1]];
      setUndoStack(newUndoStack);
      return prev.slice(0, -1);
    });
  };

  // Clear all lines
  const clearCanvas = () => {
    setUndoStack([]);
    setLines([]);
  };

  return (
    <div
      id="app"
      ref={containerRef}
      style={{
        maxWidth: "800px",
        margin: "auto",
        userSelect: "none",
        touchAction: "none", // Prevent scrolling on touch devices while drawing
      }}
    >
      <h2>Let's Collab Draw App (React)</h2>

      <div
        id="controls"
        style={{ marginBottom: "10px", display: "flex", gap: "10px" }}
      >
        <input
          type="color"
          value={currentColor}
          onChange={(e) => setCurrentColor(e.target.value)}
          aria-label="Choose drawing color"
        />
        <button onClick={undo} disabled={lines.length === 0}>
          Undo
        </button>
        <button onClick={clearCanvas} disabled={lines.length === 0}>
          Clear
        </button>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          border: "2px solid #000",
          display: "block",
          width: "100%",
          height: "auto",
        }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={(e) => {
          e.preventDefault();
          startDrawing(e);
        }}
        onTouchMove={(e) => {
          e.preventDefault();
          draw(e);
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          endDrawing();
        }}
      />
    </div>
  );
}

export default App;
