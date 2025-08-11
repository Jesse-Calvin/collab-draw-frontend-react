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
  }, [redrawAll]); // <-- ASPECT_RATIO removed here

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

  // Setup WebSocket connection and event handlers
  useEffect(() => {
    socketRef.current = new WebSocket(
      "wss://web-production-0f84.up.railway.app/ws"
    );

    socketRef.current.onopen = () => {
      console.log("WebSocket connected");
    };

    socketRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "DRAW") {
          setLines((prev) => [...prev, message.payload]);
        } else if (message.type === "UNDO") {
          setLines((prev) => prev.slice(0, -1));
        } else if (message.type === "CLEAR") {
          setLines([]);
          setUndoStack([]);
        }
      } catch (err) {
        console.error("Error parsing WebSocket message", err);
      }
    };

    socketRef.current.onclose = () => {
      console.log("WebSocket disconnected");
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  // Send draw data to WebSocket server
  const sendDrawData = (line) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({ type: "DRAW", payload: line })
      );
    }
  };

  // Convert event to coordinates relative to canvas top-left (fixes touch offset)
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

    // Calculate scaled coordinates based on actual canvas resolution vs CSS size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Start drawing - add new line and send to WS
  const startDrawing = (event) => {
    const point = getRelativeCoords(event);
    const newLine = { color: currentColor, points: [point] };
    setLines((prev) => [...prev, newLine]);
    sendDrawData(newLine);
    setIsDrawing(true);
  };

  // Continue drawing - add points to current line and send updated line
  const draw = (event) => {
    if (!isDrawing) return;
    const point = getRelativeCoords(event);

    setLines((prevLines) => {
      const newLines = [...prevLines];
      const lastLine = newLines[newLines.length - 1];
      lastLine.points = [...lastLine.points, point];
      sendDrawData(lastLine);
      return newLines;
    });
  };

  // Stop drawing
  const endDrawing = () => {
    setIsDrawing(false);
  };

  // Undo last line drawn and notify WS
  const undo = () => {
    setLines((prev) => {
      if (prev.length === 0) return prev;
      const newUndoStack = [...undoStack, prev[prev.length - 1]];
      setUndoStack(newUndoStack);

      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        socketRef.current.send(JSON.stringify({ type: "UNDO" }));
      }
      return prev.slice(0, -1);
    });
  };

  // Clear all lines and notify WS
  const clearCanvas = () => {
    setUndoStack([]);
    setLines([]);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "CLEAR" }));
    }
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
