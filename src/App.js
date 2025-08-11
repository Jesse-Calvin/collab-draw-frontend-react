import React, { useEffect, useRef, useState } from "react";
import "./App.css";

function App() {
  const canvasRef = useRef(null);
  const [ctx, setCtx] = useState(null);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [drawing, setDrawing] = useState(false);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(0);

  // Scale canvas to fit device screen
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    const width = Math.min(window.innerWidth * 0.95, 800);
    const height = Math.min(window.innerHeight * 0.7, 600);

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    setCtx(context);
  };

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  // WebSocket setup
  useEffect(() => {
    const ws = new WebSocket("wss://web-production-0f84.up.railway.app"); // change to Railway backend ws URL
    setSocket(ws);

    ws.onopen = () => {
      console.log("Connected to WebSocket");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "draw") {
        const { x, y, color } = msg;
        if (ctx) {
          ctx.strokeStyle = color;
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }

      if (msg.type === "userCount") {
        setUserCount(msg.count);
      }
    };

    ws.onclose = () => {
      console.log("Disconnected from WebSocket");
      setIsConnected(false);
    };

    return () => ws.close();
  }, [ctx]);

  const startDrawing = (e) => {
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(
      e.nativeEvent.offsetX || e.touches?.[0]?.clientX - e.target.offsetLeft,
      e.nativeEvent.offsetY || e.touches?.[0]?.clientY - e.target.offsetTop
    );
    setDrawing(true);
  };

  const draw = (e) => {
    if (!drawing || !ctx) return;

    const x =
      e.nativeEvent.offsetX || e.touches?.[0]?.clientX - e.target.offsetLeft;
    const y =
      e.nativeEvent.offsetY || e.touches?.[0]?.clientY - e.target.offsetTop;

    ctx.lineTo(x, y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "draw",
          x,
          y,
          color: currentColor,
        })
      );
    }
  };

  const stopDrawing = () => {
    setDrawing(false);
    if (ctx) ctx.closePath();
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Collaborative Drawing Lab</h2>
      <div style={{ marginBottom: "10px" }}>
        <input
          type="color"
          value={currentColor}
          onChange={(e) => setCurrentColor(e.target.value)}
        />
        <span style={{ marginLeft: "15px" }}>
          {isConnected
            ? `Connected | Users online: ${userCount}`
            : " Connecting..."}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          border: "1px solid black",
          maxWidth: "100%",
          height: "auto",
          background: "#fff",
        }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      ></canvas>
    </div>
  );
}

export default App;