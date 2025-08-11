import React, { useRef, useState, useEffect } from "react";

function App() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const socketRef = useRef(null);

  const [currentColor, setCurrentColor] = useState("#000000");
  const [drawing, setDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState([]);
  const strokesRef = useRef([]);

  // Aspect ratio 4:3 (width / height)
  const ASPECT_RATIO = 4 / 3;

  // Resize canvas function: fits container width or window width (mobile),
  // sets actual canvas pixels and CSS pixels to match (accounting for devicePixelRatio)
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas) return;

    // Use container width if available; fallback to window width for mobiles
    const containerWidth = container
      ? container.clientWidth
      : window.innerWidth;

    // Calculate height keeping aspect ratio
    const newWidth = containerWidth;
    const newHeight = containerWidth / ASPECT_RATIO;

    // Get devicePixelRatio for sharpness on retina screens
    const dpr = window.devicePixelRatio || 1;

    // Set canvas pixel size (actual drawing buffer)
    canvas.width = newWidth * dpr;
    canvas.height = newHeight * dpr;

    // Set CSS size (what user sees)
    canvas.style.width = `${newWidth}px`;
    canvas.style.height = `${newHeight}px` ;

    // Scale the drawing context to account for devicePixelRatio
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset any transforms
    ctx.scale(dpr, dpr);

    // Redraw all strokes scaled properly
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

    // Scale to canvas drawing buffer size
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  // Draw a stroke (array of points) on canvas context
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

  // Redraw all strokes
  const redrawAll = (ctx) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const stroke of strokesRef.current) {
      drawLine(ctx, stroke);
    }
  };

  // Send message via WebSocket if open
  const sendMessage = (msg) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg));
    }
  };

  // Setup WebSocket connection and event handlers
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

  // Resize canvas on mount and on window resize
  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  // Handle drawing start
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

  // Handle drawing move
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

  // Handle drawing end
  const endDrawing = (e) => {
    if (!drawing) return;
    e.preventDefault();
    setDrawing(false);
    strokesRef.current.push(currentStroke);
    sendMessage({ type: "endStroke", stroke: currentStroke });
    setCurrentStroke([]);
  };

  // Undo last stroke
  const handleUndo = () => {
    strokesRef.current.pop();
    const ctx = canvasRef.current.getContext("2d");
    redrawAll(ctx);
    sendMessage({ type: "undo" });
  };

  // Clear all strokes
  const handleClear = () => {
    strokesRef.current = [];
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    sendMessage({ type: "clear" });
  };

  // Styles
  const styles = {
    container: {
      minHeight: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      color: "#fff",
      padding: "10px",
      boxSizing: "border-box",
    },
    card: {
      backgroundColor: "#2c2f4a",
      borderRadius: "12px",
      boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
      padding: "15px",
      width: "100%",
      maxWidth: "850px",
      boxSizing: "border-box",
    },
    heading: {
      marginBottom: "15px",
      textAlign: "center",
      fontWeight: "700",
      fontSize: "1.8rem",
      letterSpacing: "1.5px",
      textShadow: "0 2px 5px rgba(0,0,0,0.4)",
    },
    controls: {
      display: "flex",
      justifyContent: "center",
      marginBottom: "15px",
      gap: "12px",
      flexWrap: "wrap",
    },
    colorInput: {
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      border: "3px solid white",
      backgroundColor: "#fff",
      cursor: "pointer",
      boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
      padding: 0,
      appearance: "none",
      outline: "none",
      boxSizing: "border-box",
    },
    button: {
      padding: "10px 20px",
      borderRadius: "8px",
      border: "none",
      cursor: "pointer",
      backgroundColor: "#764ba2",
      color: "#fff",
      fontWeight: "600",
      fontSize: "1rem",
      boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
      transition: "background-color 0.3s ease",
      userSelect: "none",
    },
    buttonHover: {
      backgroundColor: "#667eea",
    },
    canvas: {
      borderRadius: "12px",
      boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
      display: "block",
      margin: "0 auto",
      backgroundColor: "#fff",
      touchAction: "none",
      // width and height set dynamically in JS, no fixed sizes here
    },
  };

  const [hoveredButton, setHoveredButton] = useState(null);

  return (
    <div style={styles.container} ref={containerRef}>
      <div style={styles.card}>
        <h2 style={styles.heading}>Collaborative Drawing Lap</h2>
        <div style={styles.controls}>
          <input
            type="color"
            value={currentColor}
            onChange={(e) => setCurrentColor(e.target.value)}
            style={styles.colorInput}
            title="Select color"
          />
          <button
            style={{
              ...styles.button,
              ...(hoveredButton === "undo" ? styles.buttonHover : {}),
            }}
            onMouseEnter={() => setHoveredButton("undo")}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={handleUndo}
          >
            Undo
          </button>
          <button
            style={{
              ...styles.button,
              ...(hoveredButton === "clear" ? styles.buttonHover : {}),
            }}
            onMouseEnter={() => setHoveredButton("clear")}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
        <canvas
          ref={canvasRef}
          style={styles.canvas}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={endDrawing}
        />
      </div>
    </div>
  );
}

export default App;