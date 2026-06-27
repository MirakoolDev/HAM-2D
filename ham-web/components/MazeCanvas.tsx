'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  generateMaze,
  getTodaySeed,
  getWallSegments,
  hitTestWalls,
  getGoalCell,
  pathToSVG,
  type Cell,
  type Point,
  type WallSegment,
} from '@/lib/maze';

// ─── Constants ────────────────────────────────────────────────────

const MAZE_SIZE = parseInt(process.env.NEXT_PUBLIC_MAZE_SIZE ?? '15');
const WALL_THICKNESS = 3;   // px
const PATH_WIDTH = 5;        // px player path
const TOLERANCE = 4;         // wall collision tolerance in px default 4

// ─── Types ────────────────────────────────────────────────────────

export type GameState = 'idle' | 'playing' | 'failed' | 'success';

interface MazeCanvasProps {
  mazeId: number;
  isViewOnly?: boolean;
  onSuccess: (timeMs: number, pathSvg: string, snapshot: string) => void;
}

// ─── Component ────────────────────────────────────────────────────

export default function MazeCanvas({ mazeId, isViewOnly, onSuccess }: MazeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mazeRef = useRef<Cell[][] | null>(null);
  const wallsRef = useRef<WallSegment[]>([]);
  const pathRef = useRef<Point[]>([]);
  const stateRef = useRef<GameState>('idle');
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cellPxRef = useRef<number>(40);
  const offsetRef = useRef({ x: 0, y: 0 });
  const goalPixelRef = useRef({ x: 0, y: 0, size: 0 });

  const [gameState, setGameState] = useState<GameState>('idle');
  const [elapsed, setElapsed] = useState(0);

  // ── Drawing ─────────────────────────────────────────────────────

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const maze = mazeRef.current;
    if (!canvas || !maze) return;
    const ctx = canvas.getContext('2d')!;
    const cellPx = cellPxRef.current;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const bg = isLight ? '#f4f4f5' : '#0a0a0a';
    const wallColor = isLight ? '#a1a1aa' : '#333333';
    const fgColor = isLight ? '#18181b' : '#ffffff';
    const fogBg = isLight ? '#e4e4e7' : '#000000';
    const failColor = isLight ? '#dc2626' : '#ff0000';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Goal cell highlight
    const g = goalPixelRef.current;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    const gx = Math.floor(maze.length / 2) * cellPx;
    const gz = Math.floor(maze[0].length / 2) * cellPx;
    ctx.fillRect(gx, gz, cellPx, cellPx);

    // Walls
    ctx.strokeStyle = wallColor;
    ctx.lineWidth = WALL_THICKNESS;
    ctx.lineCap = 'square';
    for (const w of wallsRef.current) {
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }

    // Start strip — top opening of [0,0] inside walls
    const pad = WALL_THICKNESS;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(pad, 0, cellPx - pad * 2, 5);
    ctx.fillStyle = '#000000';
    const stripeW = (cellPx - pad * 2) / 4;
    for (let i = 0; i < 4; i++) {
      if (i % 2 === 0) ctx.fillRect(pad + i * stripeW, 0, stripeW, 5);
    }

    // Goal star
    ctx.fillStyle = fgColor;
    ctx.font = `${cellPx * 0.45}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', g.x, g.y);

    // Player path
    if (pathRef.current.length > 1) {
      ctx.lineWidth = PATH_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stateRef.current === 'playing') {
        // Fading trail while playing
        const trailPoints = 40; // Length of the comet tail
        const startIdx = Math.max(0, pathRef.current.length - trailPoints);
        const totalTrail = pathRef.current.length - 1 - startIdx;

        for (let i = startIdx; i < pathRef.current.length - 1; i++) {
          const p1 = pathRef.current[i];
          const p2 = pathRef.current[i + 1];
          const alpha = totalTrail > 0 ? (i - startIdx) / totalTrail : 1;

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = isLight ? `rgba(24, 24, 27, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
          ctx.shadowColor = isLight ? `rgba(24, 24, 27, ${alpha * 0.5})` : `rgba(255, 255, 255, ${alpha * 0.5})`;
          ctx.shadowBlur = 8;
          ctx.stroke();
        }
      } else {
        // Full solid path on success/fail
        ctx.strokeStyle = stateRef.current === 'failed' ? failColor : fgColor;
        ctx.shadowColor = stateRef.current === 'failed' ? failColor : (isLight ? 'rgba(24,24,27,0.5)' : 'rgba(255,255,255,0.5)');
        ctx.shadowBlur = 8;
        ctx.beginPath();
        pathRef.current.forEach((p, i) =>
          i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
        );
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // Fog of War
    if (stateRef.current === 'playing' || stateRef.current === 'idle') {
      const fCanvas = fogCanvasRef.current;
      if (fCanvas) {
        const fCtx = fCanvas.getContext('2d')!;
        fCtx.globalCompositeOperation = 'source-over';
        fCtx.fillStyle = fogBg; // Dynamic fog color
        fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height);

        let lightX = cellPx / 2;
        let lightY = cellPx / 2;
        if (stateRef.current === 'playing' && pathRef.current.length > 0) {
          const last = pathRef.current[pathRef.current.length - 1];
          lightX = last.x;
          lightY = last.y;
        }

        const radius = cellPx * 2.8; // Visibility radius
        fCtx.globalCompositeOperation = 'destination-out';
        const grad = fCtx.createRadialGradient(lightX, lightY, radius * 0.1, lightX, lightY, radius);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        fCtx.fillStyle = grad;
        fCtx.beginPath();
        fCtx.arc(lightX, lightY, radius, 0, Math.PI * 2);
        fCtx.fill();

        ctx.drawImage(fCanvas, 0, 0);
      }
    }
  }, []);


  // ── Derive canvas size from container ───────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const container = canvas.parentElement!;
      const maxW = Math.min(container.clientWidth - 8, 600);
      const maxH = Math.min(container.clientHeight - 8, 600);
      const cellPx = Math.floor(Math.min(maxW, maxH) / MAZE_SIZE);
      const totalPx = cellPx * MAZE_SIZE;

      canvas.width = totalPx;
      canvas.height = totalPx;

      if (!fogCanvasRef.current) {
        fogCanvasRef.current = document.createElement('canvas');
      }
      fogCanvasRef.current.width = totalPx;
      fogCanvasRef.current.height = totalPx;

      cellPxRef.current = cellPx;
      offsetRef.current = { x: 0, y: 0 };

      if (mazeRef.current) {
        wallsRef.current = getWallSegments(mazeRef.current, cellPx);
        const goal = getGoalCell(mazeRef.current);
        goalPixelRef.current = {
          x: goal.x * cellPx + cellPx / 2,
          y: goal.z * cellPx + cellPx / 2,
          size: cellPx * 0.35,
        };
        drawAll();
      }
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);
    return () => ro.disconnect();
  }, []);

  // ── Generate maze once ──────────────────────────────────────────
  useEffect(() => {
    const maze = generateMaze(MAZE_SIZE, MAZE_SIZE, mazeId);
    mazeRef.current = maze;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const cellPx = cellPxRef.current;
    wallsRef.current = getWallSegments(maze, cellPx);

    const goal = getGoalCell(maze);
    goalPixelRef.current = {
      x: goal.x * cellPx + cellPx / 2,
      y: goal.z * cellPx + cellPx / 2,
      size: cellPx * 0.35,
    };

    drawAll();
  }, [mazeId, drawAll]);


  // ── Timer ───────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    startTimeRef.current = performance.now();
    timerRef.current = setInterval(() => {
      setElapsed(performance.now() - startTimeRef.current);
    }, 50);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ── Reset ───────────────────────────────────────────────────────

  const resetRun = useCallback(() => {
    pathRef.current = [];
    stopTimer();
    setElapsed(0);
    stateRef.current = 'idle';
    setGameState('idle');
    drawAll();
  }, [drawAll, stopTimer]);

  // ── Goal check ──────────────────────────────────────────────────

  const checkGoal = useCallback((px: number, py: number): boolean => {
    const g = goalPixelRef.current;
    const dist = Math.sqrt((px - g.x) ** 2 + (py - g.y) ** 2);
    return dist < g.size;
  }, []);

  // ── Pointer events ──────────────────────────────────────────────

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isViewOnly) return;
      if (stateRef.current === 'success') return;

      const pos = getCanvasPos(e);

      // Start playing only when entering the start cell (top-left)
      if (stateRef.current === 'idle') {
        const cellPx = cellPxRef.current;
        if (pos.x >= 0 && pos.x <= cellPx && pos.y >= 0 && pos.y <= cellPx * 0.5) {
          stateRef.current = 'playing';
          setGameState('playing');
          startTimer();
          pathRef.current = []; // Ensure path starts clean
        } else {
          return; // Ignore moves until entering start area
        }
      }

      if (stateRef.current !== 'playing') return;

      // Wall collision check
      if (hitTestWalls(pos.x, pos.y, wallsRef.current, TOLERANCE)) {
        stateRef.current = 'failed';
        setGameState('failed');
        stopTimer();
        drawAll();
        setTimeout(resetRun, 400);
        return;
      }

      pathRef.current.push(pos);

      // Goal check
      if (checkGoal(pos.x, pos.y)) {
        stateRef.current = 'success';
        setGameState('success');
        stopTimer();
        const timeMs = Math.round(performance.now() - startTimeRef.current);
        const canvas = canvasRef.current!;
        drawAll();
        const snapshot = canvas.toDataURL('image/png');
        const svg = pathToSVG(pathRef.current, canvas.width, canvas.height);
        onSuccess(timeMs, svg, snapshot);
        return;
      }

      drawAll();
    },
    [checkGoal, drawAll, isViewOnly, onSuccess, resetRun, startTimer, stopTimer]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      canvasRef.current?.setPointerCapture(e.pointerId);
    },
    []
  );

  // ── Format time ─────────────────────────────────────────────────

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const centis = Math.floor((ms % 1000) / 10);
    return `${s}.${centis.toString().padStart(2, '0')}s`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%' }}>
      <div
        className={`timer-display ${gameState === 'playing' ? 'running' : gameState === 'success' ? 'done' : ''
          }`}
      >
        {formatTime(elapsed)}
      </div>

      <div
        className={`canvas-wrap state-${gameState}`}
        style={{ width: '100%', maxWidth: '600px', maxHeight: 'calc(100vh - 220px)', aspectRatio: '1 / 1' }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
        />
      </div>

      <div className="status-bar">
        <span className="live-dot" />
        {gameState === 'idle' && (isViewOnly ? 'Viewing past maze' : 'Move cursor to start')}
        {gameState === 'playing' && 'Find the ★'}
        {gameState === 'failed' && '💥 Hit a wall — resetting…'}
        {gameState === 'success' && '★ Solved!'}
        <span style={{ marginLeft: 'auto', fontSize: 11 }}>
          Maze #{mazeId}
        </span>
      </div>
    </div>
  );
}
