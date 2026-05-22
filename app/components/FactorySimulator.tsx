"use client";

import React, { useEffect, useRef, useState } from "react";
import { logToSupabase } from "../lib/supabase";
import { 
  Camera, 
  Database, 
  ShieldAlert, 
  HeartOff, 
  Truck, 
  User, 
  Flame, 
  Activity, 
  Sliders, 
  Cpu, 
  RotateCcw, 
  Play, 
  Pause,
  AlertTriangle,
  Settings,
  Battery,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Volume2,
  VolumeX,
  Menu
} from "lucide-react";

// --- Types ---
type ControlMode = "forklift" | "worker";
type FireType = "none" | "general" | "chemical";
type Department = "ASSEMBLY" | "PRESS" | "LOGISTICS" | "MAINTENANCE";

interface TimelineEvent {
  id: string;
  timeSec: number;
  type: "safe" | "warning" | "danger";
  label: string;
  triggered: boolean;
  isUserInduced?: boolean;
}

interface SimWorker {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hasHelmet: boolean;
  isFallen: boolean;
  isPlayer: boolean;
  department: Department;
  targetX?: number;
  targetY?: number;
  waitTimer?: number;
  unsafeBehaviorTimer?: number;
  hazardTimer?: number;
  needsToDodgeForklift?: boolean;
  isHidden?: boolean;
  stuckFrames?: number;
}

interface Forklift {
  x: number;
  y: number;
  angle: number; 
  speed: number; 
  maxSpeed: number;
  isAutoBraking: boolean;
  brakeLevel: number; 
  frontSensorActive?: boolean;
  backSensorActive?: boolean;
  sideSensorActive?: boolean;
  targetWaypointIdx?: number;
  waitTimer?: number;
}

interface AGV {
  id: string;
  x: number;
  y: number;
  targetIdx: number;
  speed: number;
  waitTimer: number;
  hasPayload: boolean;
}

const AGV_TRACK = [
  { x: 320, y: 25 },
  { x: 580, y: 25 },
  { x: 580, y: 85 },
  { x: 320, y: 85 }
];

const FORKLIFT_WAYPOINTS = [
  { x: 450, y: 150 },
  { x: 720, y: 150 },
  { x: 450, y: 150 },
  { x: 450, y: 260 },
  { x: 450, y: 150 },
  { x: 180, y: 150 }
];

const WORKER_STATIONS = [
  { x: 250, y: 100 }, { x: 450, y: 100 }, { x: 650, y: 100 },
  { x: 250, y: 200 }, { x: 650, y: 200 },
  { x: 250, y: 310 }, { x: 450, y: 390 }, { x: 650, y: 310 }
];

const DEPT_STATIONS: Record<Department, {x: number, y: number}[]> = {
  ASSEMBLY: [ { x: 250, y: 100 }, { x: 450, y: 100 }, { x: 650, y: 100 } ],
  PRESS: [ { x: 250, y: 310 }, { x: 450, y: 390 }, { x: 650, y: 310 } ],
  LOGISTICS: [ { x: 650, y: 100 }, { x: 650, y: 200 }, { x: 650, y: 310 } ],
  MAINTENANCE: [ { x: 250, y: 100 }, { x: 250, y: 200 }, { x: 250, y: 310 } ]
};

interface AccidentLog {
  id: string;
  time: string;
  type: string;
  description: string;
  details: string;
  isLearned: boolean;
  prevWeight: number;
  newWeight: number;
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label: string;
  isHazard?: boolean;
}

interface Pillar {
  x: number;
  y: number;
  r: number;
}

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 440;

interface HazardZone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label: string;
}

const HAZARD_ZONES: HazardZone[] = [
  {
    id: "zone-a",
    name: "유압 프레스 위험 구역",
    x: 340,
    y: 270,
    w: 220,
    h: 90,
    color: "rgba(244, 63, 94, 0.08)",
    label: "🚨 ZONE A: DANGER PRESS AREA"
  },
  {
    id: "zone-b",
    name: "화학 원자재 & AGV 주행 구역",
    x: 70,
    y: 230,
    w: 160,
    h: 65,
    color: "rgba(168, 85, 247, 0.06)",
    label: "💨 ZONE B: CHEMICAL GAS AREA"
  }
];

const isInsideHazardZone = (px: number, py: number, zone: HazardZone) => {
  return px >= zone.x && px <= zone.x + zone.w && py >= zone.y && py <= zone.y + zone.h;
};


interface FactorySimulatorProps {
  emergency: boolean;
  setEmergency: (e: boolean) => void;
  manualEStop?: boolean;
  logs: any[];
  setLogs: React.Dispatch<React.SetStateAction<any[]>>;
  speedFactor: number;
  setSpeedFactor: (sf: number) => void;
  turningRadius: number;
  setTurningRadius: (tr: number) => void;
  payloadWeight: number;
  setPayloadWeight: (pw: number) => void;
  tempData: any[];
  setTempData: React.Dispatch<React.SetStateAction<any[]>>;
}

// Web Audio API Global References (instantiated inside component on user interaction)
let audioCtx: AudioContext | null = null;
let sirenOsc: OscillatorNode | null = null;
let sirenGain: GainNode | null = null;
let sirenLfo: OscillatorNode | null = null;

export default function FactorySimulator({
  emergency,
  setEmergency,
  manualEStop = false,
  logs,
  setLogs,
  speedFactor,
  setSpeedFactor,
  turningRadius,
  setTurningRadius,
  payloadWeight,
  setPayloadWeight,
  tempData,
  setTempData
}: FactorySimulatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [mode, setMode] = useState<ControlMode>("forklift");
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("p1");
  const [isLeftPanelExpanded, setIsLeftPanelExpanded] = useState<boolean>(true);
  const [isRightPanelExpanded, setIsRightPanelExpanded] = useState<boolean>(true);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [simulatorLogs, setSimulatorLogs] = useState<AccidentLog[]>([]);
  const [aiStatus, setAiStatus] = useState<string>("정상 AI 모니터링 중");
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isAiActive, setIsAiActive] = useState<boolean>(true); // Toggle to show "system applied vs system disabled"
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showAccidentManual, setShowAccidentManual] = useState<boolean>(false);
  const [accidentDetails, setAccidentDetails] = useState<{ title: string; type: string; instructions: string[] } | null>(null);

  const [selectedObstacle, setSelectedObstacle] = useState<Obstacle | null>(null);
  const [obsClickPos, setObsClickPos] = useState({ x: 0, y: 0 });

  const [dashOffset, setDashOffset] = useState({ x: 0, y: 0 });
  const [isDraggingDash, setIsDraggingDash] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initOffsetX: 0, initOffsetY: 0 });

  // Hardhat & Fallen states for the player worker
  const [playerHelmet, setPlayerHelmet] = useState(true);
  const [playerFallen, setPlayerFallen] = useState(false);
  const playerHelmetRef = useRef(playerHelmet);
  useEffect(() => { playerHelmetRef.current = playerHelmet; }, [playerHelmet]);
  const playerFallenRef = useRef(playerFallen);
  useEffect(() => { playerFallenRef.current = playerFallen; }, [playerFallen]);
  
  // Fire simulation state
  const [fireType, setFireType] = useState<FireType>("none");
  const [firePos, setFirePos] = useState({ x: 450, y: 320 });
  const [gasLeakProgress, setGasLeakProgress] = useState(0);
  const [fireCallStep, setFireCallStep] = useState(0);

  // Time simulation state
  const [simTime, setSimTime] = useState<string>("00:01:24.500");
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  // Local state for dynamic self-learning
  const [safetyBuffer, setSafetyBuffer] = useState<number>(30); // pixels
  const [learningNotification, setLearningNotification] = useState<string | null>(null);

  // Refs for physics loop synchronization
  const manualEStopRef = useRef(manualEStop);
  useEffect(() => { manualEStopRef.current = manualEStop; }, [manualEStop]);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  const isAiActiveRef = useRef(isAiActive);
  useEffect(() => { isAiActiveRef.current = isAiActive; }, [isAiActive]);
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  const speedFactorRef = useRef(speedFactor);
  useEffect(() => { speedFactorRef.current = speedFactor; }, [speedFactor]);
  const payloadWeightRef = useRef(payloadWeight);
  useEffect(() => { payloadWeightRef.current = payloadWeight; }, [payloadWeight]);
  const safetyBufferRef = useRef(safetyBuffer);
  useEffect(() => { safetyBufferRef.current = safetyBuffer; }, [safetyBuffer]);
  const fireTypeRef = useRef(fireType);
  useEffect(() => { fireTypeRef.current = fireType; }, [fireType]);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const emergencyRef = useRef(emergency);
  useEffect(() => { emergencyRef.current = emergency; }, [emergency]);

  // Supabase logging helper that updates React state and sends to DB
  const addLog = async (type: "danger" | "warning" | "safe", msg: string) => {
    const timeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    const newLog = { id: Date.now(), type, msg, time: timeStr };
    setLogs(prev => [newLog, ...prev.slice(0, 15)]);
    
    // Save to Supabase asynchronously
    logToSupabase(newLog);
  };

  // Gemini state definitions
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [geminiResult, setGeminiResult] = useState<any>(null);
  const [customApiKey, setCustomApiKey] = useState("");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [activeReport, setActiveReport] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTargetLog, setReportTargetLog] = useState<AccidentLog | null>(null);

  // Conveyor Belt item state
  const conveyorItems = useRef<{ x: number; size: number }[]>([
    { x: 360, size: 14 },
    { x: 420, size: 16 },
    { x: 480, size: 12 },
  ]);

  // Audio synthesis helper functions
  const playWarningBeep = (pitch = 800, duration = 0.08, volume = 0.04) => {
    if (!soundEnabledRef.current) return;
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(pitch, audioCtx.currentTime);
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  };

  const startSirenAudio = () => {
    if (!soundEnabledRef.current) return;
    try {
      if (!audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      if (sirenOsc) return;

      sirenOsc = audioCtx.createOscillator();
      sirenGain = audioCtx.createGain();
      sirenLfo = audioCtx.createOscillator();
      
      const lfoGain = audioCtx.createGain();

      sirenOsc.type = "sawtooth";
      sirenOsc.frequency.setValueAtTime(550, audioCtx.currentTime);
      
      sirenLfo.frequency.setValueAtTime(2.5, audioCtx.currentTime); // 2.5Hz modulation
      lfoGain.gain.setValueAtTime(250, audioCtx.currentTime); // sweep frequency by 250Hz

      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);

      sirenOsc.connect(sirenGain);
      sirenGain.connect(audioCtx.destination);
      
      sirenGain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      
      sirenOsc.start();
      sirenLfo.start();
    } catch (err) {
      console.error("Audio Context Failed", err);
    }
  };

  const stopSirenAudio = () => {
    try {
      if (sirenOsc) {
        sirenOsc.stop();
        sirenOsc.disconnect();
        sirenOsc = null;
      }
      if (sirenLfo) {
        sirenLfo.stop();
        sirenLfo.disconnect();
        sirenLfo = null;
      }
      if (sirenGain) {
        sirenGain.disconnect();
        sirenGain = null;
      }
    } catch (e) {}
  };

  // Mutable Game State
  const gameState = useRef({
    selectedWorkerId: "npc1",
    timelineEvents: [] as TimelineEvent[],
    keys: { w: false, a: false, s: false, d: false, arrowup: false, arrowdown: false, arrowleft: false, arrowright: false },
    forklift: { x: 300, y: 150, angle: 0, speed: 0, maxSpeed: 4.5, isAutoBraking: false, brakeLevel: 0, targetWaypointIdx: 1 } as Forklift,
    workers: [
      { id: "npc1", name: "작업자A", x: 250, y: 100, vx: 0, vy: 0, hasHelmet: true, isFallen: false, isPlayer: false, targetX: 250, targetY: 100, waitTimer: 200, department: "MAINTENANCE" },
      { id: "npc2", name: "작업자B", x: 450, y: 100, vx: 0, vy: 0, hasHelmet: true, isFallen: false, isPlayer: false, targetX: 450, targetY: 100, waitTimer: 300, department: "ASSEMBLY" },
      { id: "npc3", name: "작업자C", x: 650, y: 100, vx: 0, vy: 0, hasHelmet: true, isFallen: false, isPlayer: false, targetX: 650, targetY: 100, waitTimer: 150, department: "LOGISTICS" },
      { id: "npc4", name: "작업자D", x: 250, y: 310, vx: 0, vy: 0, hasHelmet: true, isFallen: false, isPlayer: false, targetX: 250, targetY: 310, waitTimer: 400, department: "PRESS" },
      { id: "npc5", name: "작업자E", x: 650, y: 310, vx: 0, vy: 0, hasHelmet: true, isFallen: false, isPlayer: false, targetX: 650, targetY: 310, waitTimer: 100, department: "PRESS" },
      { id: "npc6", name: "작업자F", x: 250, y: 200, vx: 0, vy: 0, hasHelmet: true, isFallen: false, isPlayer: false, targetX: 250, targetY: 200, waitTimer: 500, department: "MAINTENANCE" },
      { id: "npc7", name: "작업자G", x: 450, y: 390, vx: 0, vy: 0, hasHelmet: true, isFallen: false, isPlayer: false, targetX: 450, targetY: 390, waitTimer: 250, department: "PRESS" },
      { id: "npc8", name: "작업자H", x: 650, y: 200, vx: 0, vy: 0, hasHelmet: true, isFallen: false, isPlayer: false, targetX: 650, targetY: 200, waitTimer: 350, department: "LOGISTICS" },
    ] as SimWorker[],
    waypoints: [
      { x: 250, y: 110 }, { x: 650, y: 110 }, { x: 650, y: 400 }, { x: 250, y: 400 }
    ],
    obstacles: [
      // Detailed racks
      { x: 80, y: 40, w: 140, h: 45, color: "#1e293b", label: "전자부품 보관랙 (A)" }, 
      { x: 80, y: 240, w: 140, h: 45, color: "#1e293b", label: "화학 원자재랙 (B)" },
      { x: 80, y: 340, w: 140, h: 45, color: "#1e293b", label: "정비 스페어 부품랙" },
      { x: 680, y: 40, w: 140, h: 45, color: "#1e293b", label: "조립 완제품랙 (C)" },
      { x: 680, y: 240, w: 140, h: 45, color: "#1e293b", label: "포장 자재랙 (D)" },
      { x: 680, y: 340, w: 140, h: 45, color: "#1e293b", label: "물류 대기 적재소" },
      // Conveyor
      { x: 350, y: 40, w: 200, h: 30, color: "#0f172a", label: "컨베이어 라인" },
      // Press Machine (Hazard Area)
      { x: 350, y: 280, w: 200, h: 70, color: "#0c1322", label: "고전압 유압 프레스", isHazard: true },
      // Static pallets
      { x: 260, y: 40, w: 30, h: 30, color: "#78350f", label: "자재" },
      { x: 610, y: 40, w: 30, h: 30, color: "#78350f", label: "자재" },
    ] as Obstacle[],
    pillars: [
      { x: 280, y: 110, r: 10 },
      { x: 280, y: 260, r: 10 },
      { x: 610, y: 110, r: 10 },
      { x: 610, y: 260, r: 10 },
    ] as Pillar[],
    agvs: [
      { id: "agv1", x: 320, y: 25, targetIdx: 1, speed: 0, waitTimer: 0, hasPayload: true },
      { id: "agv2", x: 580, y: 85, targetIdx: 3, speed: 0, waitTimer: 0, hasPayload: false }
    ],
    conveyorSpeed: 1.0,
    productionCount: 0,
    uph: 360,
    lastAccidentTime: 0,
    accidentCooldown: false,
  });

  // Calculate dynamic threat level for dashboard
  const getInjuryLikelihood = () => {
    if (emergency) return 98;
    
    // Check distance between player worker and forklift
    const player = gameState.current.workers.find(w => w.isPlayer);
    const forklift = gameState.current.forklift;
    let threat = 5;

    if (player && forklift) {
      const dx = player.x - forklift.x;
      const dy = player.y - forklift.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist < 40) threat = Math.max(threat, 95);
      else if (dist < 90) threat = Math.max(threat, 70);
      else if (dist < 150) threat = Math.max(threat, 35);
    }

    // NPC threats
    gameState.current.workers.forEach(w => {
      if (!w.isPlayer) {
        const dx = w.x - forklift.x;
        const dy = w.y - forklift.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 45 && forklift.speed > 0.5) {
          threat = Math.max(threat, 85);
        }
      }
    });
    
    if (!playerHelmet) threat = Math.max(threat, 65);
    if (playerFallen) threat = Math.max(threat, 88);
    if (fireType !== "none") threat = Math.max(threat, 95);
    
    return Math.min(99, threat);
  };

  // Trigger Zone Intrusion Event (Forces NPC to walk out of paths)
  const triggerZoneIntrusion = () => {
    const forklift = gameState.current.forklift;
    // Spawn worker 4 directly in front of the forklift to test emergency stopping
    const angle = forklift.angle;
    const spawnDist = 90; 
    const frontX = forklift.x + Math.cos(angle) * spawnDist;
    const frontY = forklift.y + Math.sin(angle) * spawnDist;
    
    // Find worker 4
    const worker4 = gameState.current.workers.find(w => w.id === "npc4");
    if (worker4) {
      worker4.x = Math.max(30, Math.min(CANVAS_WIDTH - 30, frontX));
      worker4.y = Math.max(30, Math.min(CANVAS_HEIGHT - 30, frontY));
      worker4.vx = 0;
      worker4.vy = 0;
      worker4.isFallen = false;
      
      // Post log
      addLog("warning", "🚨 [위험 구역 침입] 작업자 E가 안전 구역 이외 장비 주행선에 침입했습니다.");
      playWarningBeep(900, 0.15, 0.08);
    }
  };

  // Sound switch toggle
  const toggleSound = () => {
    if (soundEnabled) {
      stopSirenAudio();
    } else {
      if (emergency) {
        startSirenAudio();
      }
    }
    setSoundEnabled(!soundEnabled);
  };

  // Canvas Click Handler to Dynamically Switch Controls
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    
    const state = gameState.current;
    
    // 1. Check if clicked near forklift (radius 25)
    const dx = clickX - state.forklift.x;
    const dy = clickY - state.forklift.y;
    const distForklift = Math.sqrt(dx*dx + dy*dy);
    
    if (distForklift < 30) {
      setMode("forklift");
      playWarningBeep(650, 0.05, 0.03);
      addLog("safe", `📡 [제어 장치 전환] 마우스 선택으로 지게차(AGV) 조작 모드가 가동되었습니다.`);
      return;
    }
    
    // 2. Check if clicked near any worker
    let closestWorker: any = null;
    let minDist = Infinity;
    
    state.workers.forEach(worker => {
      const wdx = clickX - worker.x;
      const wdy = clickY - worker.y;
      const dist = Math.sqrt(wdx*wdx + wdy*wdy);
      if (dist < minDist) {
        minDist = dist;
        closestWorker = worker;
      }
    });
    
    if (closestWorker && minDist < 24) {
      setMode("worker");
      setSelectedWorkerId(closestWorker.id);
      playWarningBeep(850, 0.05, 0.03);
      addLog("safe", `📡 [제어 장치 전환] 마우스 선택으로 ${closestWorker.name} 조작 모드가 가동되었습니다.`);
      return;
    }

    // 3. Check if clicked an obstacle
    let clickedObs: any = null;
    state.obstacles.forEach(obs => {
       if (clickX >= obs.x && clickX <= obs.x + obs.w && clickY >= obs.y && clickY <= obs.y + obs.h) {
          clickedObs = obs;
       }
    });
    
    if (clickedObs && (clickedObs.label.includes("랙") || clickedObs.label.includes("컨베이어") || clickedObs.label.includes("적재소"))) {
       setSelectedObstacle(clickedObs);
       setObsClickPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
       playWarningBeep(1200, 0.05, 0.02);
       return;
    } else {
       setSelectedObstacle(null);
    }
  };

  // Keyboard Event Bindings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (gameState.current.keys.hasOwnProperty(key)) {
        e.preventDefault(); // Prevent standard browser scroll when controlling keys
        gameState.current.keys[key as keyof typeof gameState.current.keys] = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (gameState.current.keys.hasOwnProperty(key)) {
        e.preventDefault();
        gameState.current.keys[key as keyof typeof gameState.current.keys] = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Sync selectedWorkerId with gameState ref and fetch its helmet/fallen state
  useEffect(() => {
    const worker = gameState.current.workers.find(w => w.id === selectedWorkerId);
    if (worker) {
      setPlayerHelmet(worker.hasHelmet);
      setPlayerFallen(worker.isFallen);
    }
    gameState.current.selectedWorkerId = selectedWorkerId;
  }, [selectedWorkerId]);

  // Update Selected Worker states from controls
  useEffect(() => {
    const wIndex = gameState.current.workers.findIndex(w => w.id === selectedWorkerId);
    if (wIndex !== -1) {
      gameState.current.workers[wIndex].hasHelmet = playerHelmet;
      gameState.current.workers[wIndex].isFallen = playerFallen;
    }
  }, [playerHelmet, playerFallen, selectedWorkerId]);

  // Handle Alarm / Siren Sound state
  useEffect(() => {
    if (emergency && soundEnabled) {
      startSirenAudio();
    } else {
      stopSirenAudio();
    }
    return () => stopSirenAudio();
  }, [emergency, soundEnabled]);

  // AABB & Circle-Rect Collision Checks
  const checkCircleRectCollision = (cx: number, cy: number, cr: number, rx: number, ry: number, rw: number, rh: number) => {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (cr * cr);
  };

  const checkCircleCircleCollision = (c1x: number, c1y: number, c1r: number, c2x: number, c2y: number, c2r: number) => {
    const dx = c1x - c2x;
    const dy = c1y - c2y;
    return (dx * dx + dy * dy) < (c1r + c2r) * (c1r + c2r);
  };

  // Main Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let frames = 0;

    const updatePhysics = () => {
      const currentIsPlaying = isPlayingRef.current;
      const currentFireType = fireTypeRef.current;
      const currentIsAiActive = isAiActiveRef.current;
      const currentSpeedFactor = speedFactorRef.current;
      const currentPayloadWeight = payloadWeightRef.current;
      const currentSafetyBuffer = safetyBufferRef.current;
      const currentMode = modeRef.current;
      const currentManualEStop = manualEStopRef.current;
      
      if (!currentIsPlaying) return;
      
      const state = gameState.current;
      const { keys, forklift, workers, obstacles, pillars } = state;
      let currentEmergency = emergencyRef.current;

      // Update simulation time
      frames++;
      (window as any).simFrames = frames;
      const elapsedSec = Math.floor(frames / 60);
      setElapsedSec(elapsedSec);
      const totalSec = elapsedSec + 84; 
      const ms = Math.floor((frames % 60) * (1000 / 60));
      const minStr = Math.floor(totalSec / 60).toString().padStart(2, "0");
      const secStr = (totalSec % 60).toString().padStart(2, "0");
      const msStr = ms.toString().padStart(3, "0");
      setSimTime(`${minStr}:${secStr}.${msStr}`);

      // Handle Dynamic Sequence Auto Triggering (Time-based events) - Removed for manual control

      // Conveyor belt animation
      conveyorItems.current.forEach(item => {
        item.x += 0.5;
        if (item.x > 540) {
          item.x = 360;
        }
      });

      // Handle Fire & Chemical simulation updates
      if (currentFireType === "chemical") {
        setGasLeakProgress(p => Math.min(100, p + 0.2));
        setTempData(prev => {
          const lastTemp = prev[prev.length - 1].temp;
          const nextTemp = Math.min(85, lastTemp + 0.15); // Heat up
          return [...prev.slice(1), { time: prev[prev.length - 1].time, temp: nextTemp }];
        });
      } else if (currentFireType === "general") {
        setTempData(prev => {
          const lastTemp = prev[prev.length - 1].temp;
          const nextTemp = Math.min(79, lastTemp + 0.25); // Faster heat up
          return [...prev.slice(1), { time: prev[prev.length - 1].time, temp: nextTemp }];
        });
      } else {
        // Cool down towards base room temp (24°C)
        setTempData(prev => {
          const lastTemp = prev[prev.length - 1].temp;
          const nextTemp = Math.max(24, lastTemp - 0.05);
          return [...prev.slice(1), { time: prev[prev.length - 1].time, temp: nextTemp }];
        });
      }

      // Check System-wide Warnings (Fallen down, Helmet missing, Fire active)
      let warningDetected = false;
      let warningReason = "";

      if (currentFireType !== "none") {
        warningDetected = true;
        warningReason = currentFireType === "general" 
          ? "🚨 [화재 경보] 고전압 프레스기 구역 화재 발생 감지!" 
          : "🚨 [화학가스 경보] 화학 원자재랙 구역 이상 연기 및 열화상 감지!";
          
        const fireEvtId = `fire-${currentFireType}`;
        const exists = state.timelineEvents.some(e => e.id === fireEvtId);
        if (!exists) {
          state.timelineEvents.push({
            id: fireEvtId,
            timeSec: elapsedSec,
            type: "danger",
            label: currentFireType === "general" ? "🔥 프레스기 구역 화재" : "💨 화학가스 누출",
            triggered: true,
            isUserInduced: true
          });
          setTimelineEvents([...state.timelineEvents]);
        }
      }

      workers.forEach(w => {
        // Check if worker is inside any hazard zones
        const currentIntrudedZone = HAZARD_ZONES.find(zone => isInsideHazardZone(w.x, w.y, zone));

        if (currentIntrudedZone) {
          if (w.hazardTimer === undefined) w.hazardTimer = 0;
          w.hazardTimer++;
          
          if (w.hazardTimer % 30 === 0) {
            playWarningBeep(900, 0.1, 0.05);
          }
          
          if (w.hazardTimer === 1) {
            const safeStations = WORKER_STATIONS.filter(s => !HAZARD_ZONES.some(z => isInsideHazardZone(s.x, s.y, z)));
            const target = safeStations[Math.floor(Math.random() * safeStations.length)] || { x: 450, y: 150 };
            w.targetX = target.x;
            w.targetY = target.y;
            w.waitTimer = 0;
          }

          if (w.hazardTimer > 120) {
            warningDetected = true;
            warningReason = `🚨 [위험구역 대피 실패] ${w.name}이(가) ${currentIntrudedZone.name}에서 대피하지 못했습니다!`;
            
            const zoneEvtId = `zone-violation-${w.id}`;
            const exists = state.timelineEvents.some(e => e.id === zoneEvtId);
            if (!exists) {
              state.timelineEvents.push({
                id: zoneEvtId,
                timeSec: elapsedSec,
                type: "danger",
                label: `🚨 대피 지연: ${w.name}`,
                triggered: true,
                isUserInduced: true
              });
              setTimelineEvents([...state.timelineEvents]);
              addLog("danger", `🚨 [비상 정지] ${w.name}이(가) 2초 내에 위험 구역(${currentIntrudedZone.name})을 벗어나지 않아 안전 시스템이 가동되었습니다!`);
            }
          }
        } else {
          if (w.hazardTimer && w.hazardTimer > 0) {
            const safeStations = WORKER_STATIONS.filter(s => !HAZARD_ZONES.some(z => isInsideHazardZone(s.x, s.y, z)));
            const target = safeStations[Math.floor(Math.random() * safeStations.length)] || { x: 450, y: 150 };
            w.targetX = target.x;
            w.targetY = target.y;
            w.waitTimer = 0;
          }
          w.hazardTimer = 0;
        }

        if (w.isFallen) {
          warningDetected = true;
          warningReason = `🚨 [경고] ${w.name} 쓰러짐 감지!`;
          
          const fallEvtId = `fall-${w.id}`;
          const exists = state.timelineEvents.some(e => e.id === fallEvtId);
          if (!exists) {
            state.timelineEvents.push({
              id: fallEvtId,
              timeSec: elapsedSec,
              type: "danger",
              label: `🚨 쓰러짐: ${w.name}`,
              triggered: true,
              isUserInduced: true
            });
            setTimelineEvents([...state.timelineEvents]);
          }
        } else if (!w.hasHelmet) {
          warningDetected = true;
          warningReason = `🚨 [위반] ${w.name} 안전모 미착용!`;
          
          const helmetEvtId = `helmet-${w.id}`;
          const exists = state.timelineEvents.some(e => e.id === helmetEvtId);
          if (!exists) {
            state.timelineEvents.push({
              id: helmetEvtId,
              timeSec: elapsedSec,
              type: "warning",
              label: `👷 헬멧 미착용: ${w.name}`,
              triggered: true,
              isUserInduced: true
            });
            setTimelineEvents([...state.timelineEvents]);
          }
        }
      });

      // Automatically resolve emergency if all warning factors are cleared
      if (!warningDetected && currentFireType === "none" && currentEmergency && !currentManualEStop) {
        setEmergency(false);
        emergencyRef.current = false;
        currentEmergency = false;
        addLog("safe", "📡 [자동 복구] 모든 위험 요인(쓰러짐, 안전모 위반, 화재)이 제거되어 긴급 차단(E-Stop)이 자동으로 해제되었습니다.");
      }

      // Automatically trigger emergency if warning factors are detected
      if ((warningDetected || currentFireType !== "none" || currentManualEStop) && !currentEmergency) {
        setEmergency(true);
        emergencyRef.current = true;
        currentEmergency = true;
        if (!currentManualEStop) {
          addLog("danger", `🚨 [비상 경보] ${warningReason || "안전 규정 위반 및 화재 요인 감지!"} - 원격 안전 조치 프로토콜이 가동되었습니다.`);
        }
      }

      // 1. Forklift Physics (Auto-pilot)
      if (!currentEmergency) {
         let inHazardZone = false;
         for (const zone of HAZARD_ZONES) {
            if (zone.id === "zone-a") continue; // EXEMPT hydraulic press zone for forklift docking
            if (forklift.x > zone.x && forklift.x < zone.x + zone.w && forklift.y > zone.y && forklift.y < zone.y + zone.h) {
               inHazardZone = true;
               break;
            }
         }

         if (inHazardZone) {
            // Actively reverse out of hazard zone
            forklift.speed -= 0.15;
            if (forklift.speed < -2.5) forklift.speed = -2.5;
            // Steering is locked while reversing to exit cleanly
         } else {
            if (forklift.waitTimer !== undefined && forklift.waitTimer > 0) {
               forklift.waitTimer--;
               forklift.speed *= 0.8; // decelerate smoothly
               if (forklift.waitTimer === 0) {
                  forklift.targetWaypointIdx = ((forklift.targetWaypointIdx || 0) + 1) % FORKLIFT_WAYPOINTS.length;
               }
            } else {
               if (forklift.targetWaypointIdx === undefined || forklift.targetWaypointIdx >= FORKLIFT_WAYPOINTS.length) {
                   forklift.targetWaypointIdx = 0;
               }
               const targetWp = FORKLIFT_WAYPOINTS[forklift.targetWaypointIdx];
               
               const dx = targetWp.x - forklift.x;
               const dy = targetWp.y - forklift.y;
               const dist = Math.sqrt(dx*dx + dy*dy);
               
               if (dist < 40) {
                 // Arrived at waypoint, start loading/unloading
                 forklift.waitTimer = 120; // about 2 seconds
               } else {
                 const targetAngle = Math.atan2(dy, dx);
                 let angleDiff = targetAngle - forklift.angle;
                 
                 while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                 while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                 
                 const steerSpeed = 0.035 * currentSpeedFactor;
                 if (Math.abs(angleDiff) > steerSpeed) {
                   forklift.angle += Math.sign(angleDiff) * steerSpeed;
                 } else {
                   forklift.angle = targetAngle;
                 }
                 
                 if (Math.abs(angleDiff) < Math.PI / 4) {
                   forklift.speed += 0.08;
                 } else {
                   forklift.speed *= 0.88;
                 }
               }
            }
         }
         const maxForwardSpeed = forklift.maxSpeed * currentSpeedFactor;
         forklift.speed = Math.min(maxForwardSpeed, forklift.speed);
      } else {
        // Rapid Emergency Deceleration
        forklift.speed *= 0.4;
        if (Math.abs(forklift.speed) < 0.05) forklift.speed = 0;
      }

      // 1.5 AGV Physics & Production Optimization
      if (!currentEmergency) {
         state.agvs.forEach(agv => {
            if (agv.waitTimer > 0) {
               agv.waitTimer--;
               agv.speed *= 0.8;
               if (agv.waitTimer === 0) {
                  agv.targetIdx = (agv.targetIdx + 1) % AGV_TRACK.length;
                  if (agv.targetIdx === 0 || agv.targetIdx === 2) {
                     agv.hasPayload = !agv.hasPayload; // toggle payload
                  }
               }
            } else {
               const target = AGV_TRACK[agv.targetIdx];
               const dx = target.x - agv.x;
               const dy = target.y - agv.y;
               const dist = Math.sqrt(dx*dx + dy*dy);
               if (dist < 5) {
                  agv.waitTimer = 60; // wait 1 second
               } else {
                  agv.speed = Math.min(2.0, agv.speed + 0.1);
                  agv.x += (dx/dist) * agv.speed * currentSpeedFactor;
                  agv.y += (dy/dist) * agv.speed * currentSpeedFactor;
               }
            }
         });
      } else {
         state.agvs.forEach(agv => {
            agv.speed *= 0.4;
            if (Math.abs(agv.speed) < 0.05) agv.speed = 0;
         });
      }
      
      if (isAiActiveRef.current && !currentEmergency) {
         const workingWorkers = state.workers.filter(w => !w.waitTimer || w.waitTimer <= 0).length;
         const targetSpeed = 1.0 + (workingWorkers / state.workers.length) * 1.5;
         state.conveyorSpeed += (targetSpeed - state.conveyorSpeed) * 0.05;
      } else {
         state.conveyorSpeed += ((currentEmergency ? 0 : 1.0) - state.conveyorSpeed) * 0.1;
      }
      if (!currentEmergency) {
         state.productionCount += state.conveyorSpeed * currentSpeedFactor * 0.05;
         state.uph = Math.floor(state.conveyorSpeed * 360);
      } else {
         state.uph = 0;
      }

      // 2. AI Safety System Calculations & Multi-stage Intervention
      let currentBrakeLevel = 0;
      let newAiStatus = currentEmergency 
        ? (aiStatus.startsWith("💥") || aiStatus.startsWith("🛑") ? aiStatus : "🚨 긴급 정지 (SHUTDOWN) 가동 중") 
        : "정상 AI 모니터링 중";
      
      if (!currentEmergency && warningDetected) {
        newAiStatus = warningReason;
        if (frames % 25 === 0) playWarningBeep(580, 0.12, 0.04);
      }

      
      // Safety threshold distance based on forklift speed and weights
      const dynamicMultiplier = currentSpeedFactor * 1.2 + currentPayloadWeight * 0.5;
      const lookAheadDist = 110 + Math.abs(forklift.speed) * 22 * dynamicMultiplier + currentSafetyBuffer;
      const warningDist = 70 + Math.abs(forklift.speed) * 10 * dynamicMultiplier + currentSafetyBuffer * 0.6;
      const stopDist = 40 + Math.abs(forklift.speed) * 5 * dynamicMultiplier + currentSafetyBuffer * 0.4;
      const hitDist = 24; // Physical overlap boundary

      forklift.isAutoBraking = false;
      let collisionDetected = false;
      let collidedWorker: SimWorker | null = null;

      forklift.frontSensorActive = false;
      forklift.backSensorActive = false;
      forklift.sideSensorActive = false;

      // Check collision/intervention against workers
      for (const worker of workers) {
        worker.needsToDodgeForklift = false;
        if (worker.isHidden) continue;
        
        const dx = worker.x - forklift.x;
        const dy = worker.y - forklift.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Check if worker is in the forward movement direction sector of the forklift
        const angleToWorker = Math.atan2(dy, dx);
        let angleDiff = angleToWorker - forklift.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const inFront = Math.abs(angleDiff) < Math.PI / 3.0; // Front cone
        const inBack = Math.abs(angleDiff) > Math.PI - Math.PI / 3.0; // Back cone
        const inSide = !inFront && !inBack; // Side sectors

        if (dist < hitDist) {
          collisionDetected = true;
          collidedWorker = worker;
        } else if (currentIsAiActive && !currentEmergency) {
          // Front Sensor (Active when forward moving or stopped)
          if (inFront && forklift.speed >= -0.05) {
            if (dist < stopDist) {
              currentBrakeLevel = Math.max(currentBrakeLevel, 3);
              forklift.frontSensorActive = true;
              worker.needsToDodgeForklift = true;
            } else if (dist < warningDist) {
              currentBrakeLevel = Math.max(currentBrakeLevel, 2);
              forklift.frontSensorActive = true;
              worker.needsToDodgeForklift = true;
            } else if (dist < lookAheadDist) {
              currentBrakeLevel = Math.max(currentBrakeLevel, 1);
              forklift.frontSensorActive = true;
              worker.needsToDodgeForklift = true;
            }
          }
          // Back Sensor (Active when reversing)
          else if (inBack && forklift.speed < -0.05) {
            const stopDistBack = stopDist * 0.9;
            const warningDistBack = warningDist * 0.9;
            const lookAheadDistBack = lookAheadDist * 0.9;

            if (dist < stopDistBack) {
              currentBrakeLevel = Math.max(currentBrakeLevel, 3);
              forklift.backSensorActive = true;
              worker.needsToDodgeForklift = true;
            } else if (dist < warningDistBack) {
              currentBrakeLevel = Math.max(currentBrakeLevel, 2);
              forklift.backSensorActive = true;
              worker.needsToDodgeForklift = true;
            } else if (dist < lookAheadDistBack) {
              currentBrakeLevel = Math.max(currentBrakeLevel, 1);
              forklift.backSensorActive = true;
              worker.needsToDodgeForklift = true;
            }
          }
          // Side Sensor (Protect against lateral swipe)
          else if (inSide) {
            const sideDangerDist = stopDist * 0.72;
            const sideCautionDist = warningDist * 0.65;

            if (dist < sideDangerDist) {
              currentBrakeLevel = Math.max(currentBrakeLevel, 3);
              forklift.sideSensorActive = true;
              worker.needsToDodgeForklift = true;
            } else if (dist < sideCautionDist) {
              currentBrakeLevel = Math.max(currentBrakeLevel, 2);
              forklift.sideSensorActive = true;
              worker.needsToDodgeForklift = true;
            }
          }
        }
      }

      forklift.brakeLevel = currentBrakeLevel;

      // Handle AI Interventions
      if (currentIsAiActive && !currentEmergency) {
        if (currentBrakeLevel === 3) {
          forklift.isAutoBraking = true;
          // Apply automatic brakes (Rapid deceleration)
          forklift.speed *= 0.32;
          if (Math.abs(forklift.speed) < 0.3) forklift.speed = 0;
          newAiStatus = "🛑 [AI 3단계 개입] 자동 비상 제동 작동 (충돌 방지)";
          if (frames % 6 === 0) playWarningBeep(980, 0.12, 0.12);
        } else if (currentBrakeLevel === 2) {
          forklift.isAutoBraking = true;
          // Forced deceleration
          forklift.speed *= 0.76;
          newAiStatus = "⚠️ [AI 2단계 개입] 위험 구역 접근으로 인한 자동 감속";
          if (frames % 12 === 0) playWarningBeep(880, 0.08, 0.08);
        } else if (currentBrakeLevel === 1) {
          newAiStatus = "🔔 [AI 1단계 개입] 주의 접근 알림 및 지게차 경보";
          if (frames % 24 === 0) playWarningBeep(780, 0.06, 0.04);
        }
      }

      // 3. Accident Occurrence (Collision)
      if (collisionDetected && collidedWorker && !state.accidentCooldown) {
        state.accidentCooldown = true;
        
        const nowTimeStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        const typeStr = currentIsAiActive ? "AI 안전 제동 한계 이탈" : "수동 운행 (AI 안전 시스템 해제)";
        
        const currentSpeedKmh = Math.round(Math.abs(forklift.speed) * 3.6 * 10) / 10;
        
        const newLog: AccidentLog = {
          id: Date.now().toString(),
          time: nowTimeStr,
          type: typeStr,
          description: `💥 지게차 - ${collidedWorker.name} 물리적 충돌 사고 발생`,
          details: `충돌시 장비속도: ${currentSpeedKmh}km/h | 안전모 착용: ${collidedWorker.hasHelmet ? "착용" : "미착용"} | AI 시스템: ${currentIsAiActive ? "ON" : "OFF (수동)"}`,
          isLearned: false,
          prevWeight: currentSpeedFactor,
          newWeight: Math.round((currentSpeedFactor + 0.45) * 100) / 100
        };

        // Update local logs
        setSimulatorLogs(prev => [newLog, ...prev]);
        
        // Update dashboard logs
        addLog("danger", `💥 [사고 기록] ${newLog.description} (${currentSpeedKmh}km/h)`);

        newAiStatus = "💥 [치명적 사고 감지] 시스템 긴급 차단 및 블랙박스 보존";
        setEmergency(true);
        emergencyRef.current = true;
        forklift.speed = 0;

        setAccidentDetails({
          title: newLog.description,
          type: "crash",
          instructions: [
            "1. 부상자 발생 여부 확인 및 119 즉시 신고",
            "2. 2차 사고 방지를 위해 지게차 시동 완전 차단",
            "3. 주변 작업자 전원 안전 지대로 대피",
            "4. 현장 보존 및 관리자에게 상황 전파"
          ]
        });
        setShowAccidentManual(true);

        // Dynamic Incident Timeline Marking
        const collisionEvtId = `collision-${collidedWorker.id}-${Date.now()}`;
        state.timelineEvents.push({
          id: collisionEvtId,
          timeSec: elapsedSec,
          type: "danger",
          label: `💥 충돌 사고: ${collidedWorker.name}`,
          triggered: true,
          isUserInduced: true
        });
        setTimelineEvents([...state.timelineEvents]);

        setTimeout(() => { state.accidentCooldown = false; }, 3000);
      }

      if (frames % 8 === 0) {
        setAiStatus(newAiStatus);
      }

      // 4. Smooth Collision Resolution (Obstacles & Walls)
      // Forklift Movement Resolution
      let nextFx = forklift.x + Math.cos(forklift.angle) * forklift.speed;
      let nextFy = forklift.y + Math.sin(forklift.angle) * forklift.speed;
      const fRadius = 15; // Treat forklift as circle of 15px radius for simple smooth slide

      // Wall boundaries check
      if (nextFx - fRadius < 20) { nextFx = 20 + fRadius; forklift.speed *= -0.2; }
      if (nextFx + fRadius > 880) { nextFx = 880 - fRadius; forklift.speed *= -0.2; }
      if (nextFy - fRadius < 20) { nextFy = 20 + fRadius; forklift.speed *= -0.2; }
      if (nextFy + fRadius > 420) { nextFy = 420 - fRadius; forklift.speed *= -0.2; }

      // Check Obstacles
      let forkliftCollisionX = false;
      for (const obs of obstacles) {
        if (forklift.x > obs.x && forklift.x < obs.x + obs.w && forklift.y > obs.y && forklift.y < obs.y + obs.h) continue;
        if (checkCircleRectCollision(nextFx, forklift.y, fRadius, obs.x, obs.y, obs.w, obs.h)) {
          forkliftCollisionX = true; break;
        }
      }
      for (const pil of pillars) {
        if (checkCircleCircleCollision(nextFx, forklift.y, fRadius, pil.x, pil.y, pil.r)) {
          forkliftCollisionX = true; break;
        }
      }
      if (!forkliftCollisionX) forklift.x = nextFx;
      else forklift.speed *= -0.3; // Bounce back slightly

      let forkliftCollisionY = false;
      for (const obs of obstacles) {
        if (forklift.x > obs.x && forklift.x < obs.x + obs.w && forklift.y > obs.y && forklift.y < obs.y + obs.h) continue;
        if (checkCircleRectCollision(forklift.x, nextFy, fRadius, obs.x, obs.y, obs.w, obs.h)) {
          forkliftCollisionY = true; break;
        }
      }
      for (const pil of pillars) {
        if (checkCircleCircleCollision(forklift.x, nextFy, fRadius, pil.x, pil.y, pil.r)) {
          forkliftCollisionY = true; break;
        }
      }
      if (!forkliftCollisionY) forklift.y = nextFy;
      else forklift.speed *= -0.3;

      // 5. Worker Physics & Pathfinding for NPCs
      const isEvacuating = currentFireType !== "none";
      const evacTargetX = 850;
      const evacTargetY = 410;

      workers.forEach((worker) => {

        if (worker.isHidden) {
           if (!isEvacuating) {
              worker.isHidden = false;
              worker.x = evacTargetX;
              worker.y = evacTargetY;
              const station = WORKER_STATIONS[Math.floor(Math.random() * WORKER_STATIONS.length)];
              worker.targetX = station.x;
              worker.targetY = station.y;
           }
           return;
        }

        // NPC Intelligent path wandering (applied to all workers)
        if (worker.isFallen) {
          worker.vx = 0; worker.vy = 0;
          return;
        }

        // Target movement
        if (isEvacuating) {
          // Spread workers slightly around the exit
          const idNum = parseInt(worker.id.replace(/\D/g, '')) || 0;
          worker.targetX = evacTargetX;
          worker.targetY = evacTargetY + (idNum % 4) * 8 - 12;
          const dx = worker.targetX - worker.x;
          const dy = worker.targetY - worker.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          
          if (len < 40) {
            worker.isHidden = true;
            worker.vx = 0;
            worker.vy = 0;
          } else {
            worker.isHidden = false;
            worker.vx = len > 5 ? (dx / len) * 2.0 : 0;
            worker.vy = len > 5 ? (dy / len) * 2.0 : 0;
          }
          
          // Basic collision repulsion while evacuating
          workers.forEach(w2 => {
            if (w2 !== worker && !w2.isHidden) {
              const wdx = worker.x - w2.x;
              const wdy = worker.y - w2.y;
              const wdist = Math.sqrt(wdx*wdx + wdy*wdy);
              if (wdist < 15 && wdist > 0) {
                worker.vx += (wdx/wdist) * 0.5;
                worker.vy += (wdy/wdist) * 0.5;
              }
            }
          });
        } else if (worker.targetX === evacTargetX || !worker.targetX || !worker.targetY || (Math.abs(worker.x - worker.targetX) < 10 && Math.abs(worker.y - worker.targetY) < 10)) {
          worker.isHidden = false;
          if (worker.waitTimer && worker.waitTimer > 0) {
            worker.waitTimer--;
            worker.vx = 0; worker.vy = 0;
          } else {
            // Select new waypoints in factory
            const deptStations = DEPT_STATIONS[worker.department] || WORKER_STATIONS;
            const station = deptStations[Math.floor(Math.random() * deptStations.length)];
            worker.targetX = station.x + (Math.random() - 0.5) * 10;
            worker.targetY = station.y + (Math.random() - 0.5) * 10;
            worker.waitTimer = 150 + Math.random() * 300; // Wait 2.5s ~ 7.5s
          }
        } else {
          const dx = worker.targetX - worker.x;
          const dy = worker.targetY - worker.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const isEscapingHazard = worker.hazardTimer && worker.hazardTimer > 0;
          const moveSpeed = isEscapingHazard ? 2.5 : 0.9;
          worker.vx = len > 0 ? (dx / len) * moveSpeed : 0;
          worker.vy = len > 0 ? (dy / len) * moveSpeed : 0;
        }

          let avoidX = 0;
          let avoidY = 0;
          
          if (worker.needsToDodgeForklift && !currentEmergency) {
            const fdx = worker.x - forklift.x;
            const fdy = worker.y - forklift.y;
            const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
            
            if (fdist > 0) {
              // Side-step perpendicularly to get out of the way actively
              const perpX = -fdy / fdist;
              const perpY = fdx / fdist;
              worker.vx += perpX * 3.5;
              worker.vy += perpY * 3.5;
              worker.waitTimer = 0; // stop waiting and run!
            }
            
            // Visual jogging speed indicator
            const speed = Math.sqrt(worker.vx * worker.vx + worker.vy * worker.vy);
            const maxJogSpeed = 2.4;
            if (speed > maxJogSpeed) {
              worker.vx = (worker.vx / speed) * maxJogSpeed;
              worker.vy = (worker.vy / speed) * maxJogSpeed;
            }
          } else if (!currentEmergency) {
             // General avoidance so they don't walk into the forklift voluntarily
             const fdx = worker.x - forklift.x;
             const fdy = worker.y - forklift.y;
             const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
             const generalAvoidanceRadius = 80;
             if (fdist < generalAvoidanceRadius && fdist > 0) {
                worker.waitTimer = 0; // Stop waiting and dodge
                const force = (generalAvoidanceRadius - fdist) / generalAvoidanceRadius;
                const perpX = -fdy / fdist;
                const perpY = fdx / fdist;
                const dot = worker.vx * perpX + worker.vy * perpY;
                const swirlX = dot >= 0 ? perpX : -perpX;
                const swirlY = dot >= 0 ? perpY : -perpY;
                
                avoidX += (fdx / fdist) * force * 2.0 + swirlX * force * 4.0;
                avoidY += (fdy / fdist) * force * 2.0 + swirlY * force * 4.0;
             }
          }

          // Obstacle avoidance steering
          const lookAheadRadius = 12;
          const lookAheadX = worker.x + worker.vx * 8;
          const lookAheadY = worker.y + worker.vy * 8;

          for (const obs of obstacles) {
             if (checkCircleRectCollision(lookAheadX, lookAheadY, lookAheadRadius, obs.x, obs.y, obs.w, obs.h)) {
                const cx = obs.x + obs.w / 2;
                const cy = obs.y + obs.h / 2;
                const rx = worker.x - cx;
                const ry = worker.y - cy;
                const dist = Math.sqrt(rx*rx + ry*ry);
                if (dist > 0) {
                   let steerX = -ry / dist;
                   let steerY = rx / dist;
                   if (steerX * worker.vx + steerY * worker.vy < 0) { steerX = -steerX; steerY = -steerY; }
                   avoidX += (rx / dist) * 0.5 + steerX * 2.0;
                   avoidY += (ry / dist) * 0.5 + steerY * 2.0;
                }
             }
          }

          for (const pil of pillars) {
             if (checkCircleCircleCollision(lookAheadX, lookAheadY, lookAheadRadius, pil.x, pil.y, pil.r)) {
                const rx = worker.x - pil.x;
                const ry = worker.y - pil.y;
                const dist = Math.sqrt(rx*rx + ry*ry);
                if (dist > 0) {
                   let steerX = -ry / dist;
                   let steerY = rx / dist;
                   if (steerX * worker.vx + steerY * worker.vy < 0) { steerX = -steerX; steerY = -steerY; }
                   avoidX += (rx / dist) * 0.5 + steerX * 2.0;
                   avoidY += (ry / dist) * 0.5 + steerY * 2.0;
                }
             }
          }
          
          if (!isEvacuating) {
             for (const zone of HAZARD_ZONES) {
                if (checkCircleRectCollision(lookAheadX, lookAheadY, lookAheadRadius, zone.x, zone.y, zone.w, zone.h)) {
                   const cx = zone.x + zone.w / 2;
                   const cy = zone.y + zone.h / 2;
                   const rx = worker.x - cx;
                   const ry = worker.y - cy;
                   const dist = Math.sqrt(rx*rx + ry*ry);
                   if (dist > 0) {
                      let steerX = -ry / dist;
                      let steerY = rx / dist;
                      if (steerX * worker.vx + steerY * worker.vy < 0) { steerX = -steerX; steerY = -steerY; }
                      avoidX += (rx / dist) * 0.5 + steerX * 2.5;
                      avoidY += (ry / dist) * 0.5 + steerY * 2.5;
                   }
                }
             }
          }

          if (avoidX !== 0 || avoidY !== 0) {
             worker.vx += avoidX;
             worker.vy += avoidY;
             const speed = Math.sqrt(worker.vx * worker.vx + worker.vy * worker.vy);
             const targetSpeed = (worker.hazardTimer && worker.hazardTimer > 0) ? 2.5 : (isEvacuating ? 2.0 : 0.9);
             if (speed > 0) {
                worker.vx = (worker.vx / speed) * targetSpeed;
                worker.vy = (worker.vy / speed) * targetSpeed;
             }
          }

        // Slide Collision Resolution for workers
        const wRadius = 7;
        let nextWx = worker.x + worker.vx;
        let nextWy = worker.y + worker.vy;

        // Boundaries
        if (nextWx - wRadius < 20) { nextWx = 20 + wRadius; worker.vx = 0; }
        if (nextWx + wRadius > 880) { nextWx = 880 - wRadius; worker.vx = 0; }
        if (nextWy - wRadius < 20) { nextWy = 20 + wRadius; worker.vy = 0; }
        if (nextWy + wRadius > 420) { nextWy = 420 - wRadius; worker.vy = 0; }

        // Obstacles check (Robust AABB sliding logic)
        let workerColX = false;
        for (const obs of obstacles) {
          if (worker.y > obs.y - wRadius + 1 && worker.y < obs.y + obs.h + wRadius - 1) {
            if (nextWx + wRadius > obs.x && nextWx - wRadius < obs.x + obs.w) {
              workerColX = true; break;
            }
          }
        }
        for (const pil of pillars) {
          if (worker.y > pil.y - pil.r - wRadius + 1 && worker.y < pil.y + pil.r + wRadius - 1) {
            if (nextWx + wRadius > pil.x - pil.r && nextWx - wRadius < pil.x + pil.r) {
              workerColX = true; break;
            }
          }
        }
        if (!workerColX) worker.x = nextWx;
        else worker.vx = 0;

        let workerColY = false;
        for (const obs of obstacles) {
          if (worker.x > obs.x - wRadius + 1 && worker.x < obs.x + obs.w + wRadius - 1) {
            if (nextWy + wRadius > obs.y && nextWy - wRadius < obs.y + obs.h) {
              workerColY = true; break;
            }
          }
        }
        for (const pil of pillars) {
          if (worker.x > pil.x - pil.r - wRadius + 1 && worker.x < pil.x + pil.r + wRadius - 1) {
            if (nextWy + wRadius > pil.y - pil.r && nextWy - wRadius < pil.y + pil.r) {
              workerColY = true; break;
            }
          }
        }
        if (!workerColY) worker.y = nextWy;
        else worker.vy = 0;

        // Anti-stuck ultimate logic: if actual speed is near 0 and not waiting, pick a new target
        const actualSpeed = Math.sqrt(worker.vx * worker.vx + worker.vy * worker.vy);
        if (actualSpeed < 0.1 && (!worker.waitTimer || worker.waitTimer <= 0) && !worker.isFallen && !isEvacuating) {
           worker.stuckFrames = (worker.stuckFrames || 0) + 1;
           if (worker.stuckFrames > 30) {
              const deptStations = DEPT_STATIONS[worker.department] || WORKER_STATIONS;
              const station = deptStations[Math.floor(Math.random() * deptStations.length)];
              worker.targetX = station.x + (Math.random() - 0.5) * 10;
              worker.targetY = station.y + (Math.random() - 0.5) * 10;
              worker.stuckFrames = 0;
           }
        } else {
           worker.stuckFrames = 0;
        }
      });
    };

    const draw = () => {
      const state = gameState.current;
      const { forklift, workers, obstacles, pillars } = state;

      // 1. Draw Factory Floor Base
      ctx.fillStyle = "#030712"; 
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Floor grid (Futuristic neon scan lines)
      ctx.strokeStyle = "rgba(6, 182, 212, 0.02)";
      ctx.lineWidth = 1;
      for (let i = 0; i < CANVAS_WIDTH; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke();
      }
      for (let i = 0; i < CANVAS_HEIGHT; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); ctx.stroke();
      }

      // Outer boundary wall
      ctx.strokeStyle = "rgba(30, 41, 59, 0.8)";
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, CANVAS_WIDTH - 40, CANVAS_HEIGHT - 40);

      // 2. Draw Walkways (Safe zone paths)
      ctx.fillStyle = "rgba(16, 185, 129, 0.06)";
      // Horizontal walkway
      ctx.fillRect(20, 135, CANVAS_WIDTH - 40, 30);
      // Vertical walkway
      ctx.fillRect(435, 20, 30, CANVAS_HEIGHT - 40);

      // Walkway borders (Green dotted lines)
      ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 8]);
      ctx.strokeRect(20, 135, CANVAS_WIDTH - 40, 30);
      ctx.strokeRect(435, 20, 30, CANVAS_HEIGHT - 40);
      ctx.setLineDash([]);

      // 3. Draw Forklift charging bay
      ctx.fillStyle = "rgba(245, 158, 11, 0.04)";
      ctx.fillRect(25, 25, 50, 50);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(25, 25, 50, 50);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(245, 158, 11, 0.6)";
      ctx.font = "8px sans-serif";
      ctx.fillText("⚡ AGV BAT", 28, 52);

      // Draw EXIT door for evacuation
      ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
      ctx.fillRect(800, 350, 100, 60);
      ctx.strokeStyle = "var(--color-green)";
      ctx.lineWidth = 2;
      ctx.strokeRect(800, 350, 100, 60);
      ctx.fillStyle = "var(--color-green)";
      ctx.font = "bold 14px var(--font-orbitron), sans-serif";
      ctx.fillText("EXIT", 830, 385);

      // 3-1. Draw Hazard Zones (Warning stripes & Neon borders)
      HAZARD_ZONES.forEach(zone => {
        // Reddish/purple transparent aura fill
        ctx.fillStyle = zone.color;
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);

        // Neon outline
        ctx.strokeStyle = zone.id === "zone-a" ? "rgba(244, 63, 94, 0.4)" : "rgba(168, 85, 247, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);

        // Warning striped border (Top border pattern)
        ctx.save();
        ctx.beginPath();
        ctx.rect(zone.x, zone.y, zone.w, 12);
        ctx.clip();
        ctx.strokeStyle = zone.id === "zone-a" ? "#ef4444" : "#a855f7";
        ctx.lineWidth = 3;
        for (let offset = -15; offset < zone.w; offset += 12) {
          ctx.beginPath();
          ctx.moveTo(zone.x + offset, zone.y);
          ctx.lineTo(zone.x + offset + 12, zone.y + 12);
          ctx.stroke();
        }
        ctx.restore();

        // Zone label text
        ctx.fillStyle = zone.id === "zone-a" ? "rgba(244, 63, 94, 0.8)" : "rgba(168, 85, 247, 0.8)";
        ctx.font = "bold 8px sans-serif";
        ctx.fillText(zone.label, zone.x + 8, zone.y + 22);
      });

      // 4. Draw Obstacles (Racks/Shelves with realistic cargo drawings)
      obstacles.forEach(obs => {
        // Shelf base shadow
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.fillRect(obs.x + 3, obs.y + 3, obs.w, obs.h);

        // Rack frame (Dark steel grey)
        ctx.fillStyle = obs.color;
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        
        ctx.strokeStyle = obs.isHazard ? "rgba(244, 63, 94, 0.6)" : "rgba(51, 65, 85, 0.7)";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        // Draw multiple boxes/crates inside shelves
        if (obs.w > 60 && !obs.isHazard && obs.label !== "컨베이어 라인") {
          const numCompartments = 4;
          const compWidth = obs.w / numCompartments;
          for (let i = 0; i < numCompartments; i++) {
            // Draw box shapes inside compartments
            ctx.fillStyle = i % 2 === 0 ? "#78350f" : "#b45309"; // brown wood colors
            if (i === 1) ctx.fillStyle = "#1e3a8a"; // blue container
            if (i === 2 && obs.label.includes("화학")) ctx.fillStyle = "#831843"; // magenta chemical
            
            // Draw container boxes
            ctx.fillRect(obs.x + i * compWidth + 4, obs.y + 6, compWidth - 8, obs.h - 12);
            ctx.strokeStyle = "rgba(255,255,255,0.08)";
            ctx.lineWidth = 1;
            ctx.strokeRect(obs.x + i * compWidth + 4, obs.y + 6, compWidth - 8, obs.h - 12);
          }
        }

        // Draw Conveyor belt details
        if (obs.label === "컨베이어 라인") {
          ctx.fillStyle = "#334155";
          // Draw conveyor roller circles
          for (let rx = obs.x + 8; rx < obs.x + obs.w; rx += 14) {
            ctx.beginPath(); ctx.arc(rx, obs.y + obs.h/2, 5, 0, Math.PI*2);
            ctx.strokeStyle = "#475569"; ctx.stroke();
          }

          // Draw moving boxes
          conveyorItems.current.forEach(item => {
            ctx.fillStyle = "#78350f";
            ctx.fillRect(item.x - item.size/2, obs.y + 6, item.size, obs.h - 12);
            ctx.strokeStyle = "#92400e"; ctx.strokeRect(item.x - item.size/2, obs.y + 6, item.size, obs.h - 12);
          });
          
          // AI Conveyor Optimization Visuals
          if (isAiActive) {
             ctx.fillStyle = "rgba(6, 182, 212, 0.15)";
             ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
             const scanLineX = obs.x + (Date.now() / 5) % obs.w;
             ctx.fillStyle = "rgba(6, 182, 212, 0.8)";
             ctx.fillRect(scanLineX, obs.y, 2, obs.h);
             ctx.font = "8px sans-serif";
             ctx.fillStyle = "var(--color-cyan)";
             ctx.fillText(`AI SYNC: ${state.conveyorSpeed.toFixed(1)}x`, obs.x + 5, obs.y + obs.h - 5);
          }
        }

        // Draw Press Machine details
        if (obs.isHazard) {
          // Yellow and black warning stripes
          ctx.save();
          ctx.beginPath();
          ctx.rect(obs.x, obs.y, obs.w, obs.h);
          ctx.clip();
          
          ctx.strokeStyle = "#eab308";
          ctx.lineWidth = 4;
          for (let offset = -obs.h; offset < obs.w; offset += 16) {
            ctx.beginPath();
            ctx.moveTo(obs.x + offset, obs.y);
            ctx.lineTo(obs.x + offset + obs.h, obs.y + obs.h);
            ctx.stroke();
          }
          ctx.restore();

          // Press core (hydraulic piston)
          const pressPistonHeight = 12 + Math.sin(Date.now() / 200) * 8;
          ctx.fillStyle = "#64748b";
          ctx.fillRect(obs.x + 30, obs.y + 5, obs.w - 60, pressPistonHeight);
          ctx.strokeStyle = "#475569";
          ctx.strokeRect(obs.x + 30, obs.y + 5, obs.w - 60, pressPistonHeight);

          // Danger boundary line
          ctx.strokeStyle = "rgba(244, 63, 94, 0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.strokeRect(obs.x - 12, obs.y - 12, obs.w + 24, obs.h + 24);
          ctx.setLineDash([]);
        }

        // Labels
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "8px sans-serif";
        ctx.fillText(obs.label, obs.x + 4, obs.y - 4);
      });

      // 5. Draw Architectural Pillars
      pillars.forEach(p => {
        // Shadow
        ctx.beginPath(); ctx.arc(p.x + 2, p.y + 2, p.r, 0, Math.PI*2);
        ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill();

        // Pillar body
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = "#334155"; ctx.fill();
        ctx.strokeStyle = "#64748b"; ctx.lineWidth = 1.5; ctx.stroke();

        // Warning stripes on pillar
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 2, 0, Math.PI*2);
        ctx.strokeStyle = "#eab308"; ctx.lineWidth = 1.5; ctx.stroke();
      });

      // 6. Draw Fire / Chemical smoke
      if (fireType !== "none") {
        ctx.save();
        const f_x = firePos.x;
        const f_y = firePos.y;
        
        // Heat dissipation radius gradient
        const radius = fireType === "general" ? 130 : 160;
        const grad = ctx.createRadialGradient(f_x, f_y, 10, f_x, f_y, radius);
        
        if (fireType === "general") {
          // Normal fire: red/orange heat
          grad.addColorStop(0, "rgba(239, 68, 68, 0.45)");
          grad.addColorStop(0.5, "rgba(249, 115, 22, 0.15)");
          grad.addColorStop(1, "transparent");
        } else {
          // Chemical gas fire: blue/purple heat and gas haze
          grad.addColorStop(0, "rgba(168, 85, 247, 0.28)");
          grad.addColorStop(0.4, "rgba(59, 130, 246, 0.12)");
          grad.addColorStop(0.8, `rgba(16, 185, 129, ${gasLeakProgress * 0.001})`);
          grad.addColorStop(1, "transparent");
        }
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(f_x, f_y, radius, 0, Math.PI*2); ctx.fill();

        // Draw smoke particles (semi-transparent grey floating puffs)
        ctx.fillStyle = "rgba(100, 116, 139, 0.22)";
        for (let i = 0; i < 8; i++) {
          const sx = f_x + Math.sin(Date.now() / 150 + i) * 35;
          const sy = f_y - 20 - (i * 8) - (Date.now() / 25 % 30);
          ctx.beginPath();
          ctx.arc(sx, sy, 14 + i * 2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (fireType === "general") {
          // Renders physical fire flame shapes on canvas
          for (let i = 0; i < 5; i++) {
            const flameH = 22 + Math.sin(Date.now() / 80 + i) * 10;
            const fxOffset = (i - 2) * 12;
            ctx.fillStyle = i % 2 === 0 ? "#ef4444" : "#f97316";
            ctx.beginPath();
            ctx.moveTo(f_x + fxOffset - 8, f_y);
            ctx.quadraticCurveTo(f_x + fxOffset, f_y - flameH, f_x + fxOffset + 8, f_y);
            ctx.closePath();
            ctx.fill();
          }
          // White hot center core
          ctx.fillStyle = "#fef08a";
          ctx.beginPath(); ctx.arc(f_x, f_y, 8, 0, Math.PI*2); ctx.fill();
        } else {
          // Chemical / Gas leak waves (almost transparent cyan/purple waves)
          ctx.strokeStyle = "rgba(192, 132, 252, 0.4)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 6]);
          const pulseR = 30 + (Date.now() / 10 % 70);
          ctx.beginPath(); ctx.arc(f_x, f_y, pulseR, 0, Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();
      }

      // 7. Draw AI Dynamic Risk Zones and Rays around Forklift
      if (!emergency && isAiActive) {
        ctx.save();
        ctx.translate(forklift.x, forklift.y);
        ctx.rotate(forklift.angle);
        
        const dynamicMultiplier = speedFactor * 1.2 + payloadWeight * 0.5;
        const lookAheadDist = 110 + Math.abs(forklift.speed) * 22 * dynamicMultiplier + safetyBuffer;
        const warningDist = 70 + Math.abs(forklift.speed) * 10 * dynamicMultiplier + safetyBuffer * 0.6;
        const stopDist = 40 + Math.abs(forklift.speed) * 5 * dynamicMultiplier + safetyBuffer * 0.4;

        // 1. Draw Front Sensor Cone (Active when stopped or forward moving)
        if (forklift.speed >= -0.05) {
          const sweepAngle = Math.PI / 3.0;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, lookAheadDist, -sweepAngle/2, sweepAngle/2);
          ctx.closePath();
          ctx.fillStyle = forklift.frontSensorActive ? "rgba(244, 63, 94, 0.12)" : "rgba(6, 182, 212, 0.04)";
          ctx.fill();
          ctx.strokeStyle = forklift.frontSensorActive ? "var(--color-red)" : "rgba(6, 182, 212, 0.15)";
          ctx.lineWidth = forklift.frontSensorActive ? 1.5 : 1;
          ctx.stroke();
          
          // Front Ray line
          ctx.strokeStyle = forklift.frontSensorActive ? "var(--color-red)" : "rgba(6, 182, 212, 0.4)";
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(lookAheadDist, 0); ctx.stroke();
          ctx.setLineDash([]);
          
          if (forklift.frontSensorActive) {
            ctx.fillStyle = "var(--color-red)";
            ctx.font = "bold 7px sans-serif";
            ctx.fillText("FRONT SENSOR ALERT", lookAheadDist - 85, -5);
          }
        }

        // 2. Draw Back Sensor Cone (Active when reversing)
        if (forklift.speed < -0.05) {
          const sweepAngle = Math.PI / 3.0;
          const lookAheadBack = lookAheadDist * 0.9;
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, lookAheadBack, Math.PI - sweepAngle/2, Math.PI + sweepAngle/2);
          ctx.closePath();
          ctx.fillStyle = forklift.backSensorActive ? "rgba(244, 63, 94, 0.12)" : "rgba(59, 130, 246, 0.04)";
          ctx.fill();
          ctx.strokeStyle = forklift.backSensorActive ? "var(--color-red)" : "rgba(59, 130, 246, 0.15)";
          ctx.lineWidth = forklift.backSensorActive ? 1.5 : 1;
          ctx.stroke();

          // Back Ray line
          ctx.strokeStyle = forklift.backSensorActive ? "var(--color-red)" : "rgba(59, 130, 246, 0.4)";
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-lookAheadBack, 0); ctx.stroke();
          ctx.setLineDash([]);

          if (forklift.backSensorActive) {
            ctx.fillStyle = "var(--color-red)";
            ctx.font = "bold 7px sans-serif";
            ctx.fillText("BACK SENSOR ALERT", -lookAheadBack + 10, -5);
          }
        }

        // 3. Draw Side Sensor Lines (Always Active)
        const sideDist = stopDist * 0.72;
        // Left side ray
        ctx.strokeStyle = forklift.sideSensorActive ? "var(--color-red)" : "rgba(245, 158, 11, 0.25)";
        ctx.lineWidth = forklift.sideSensorActive ? 1.5 : 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -sideDist); ctx.stroke();
        // Right side ray
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, sideDist); ctx.stroke();
        ctx.setLineDash([]);

        if (forklift.sideSensorActive) {
          ctx.fillStyle = "var(--color-red)";
          ctx.font = "bold 7px sans-serif";
          ctx.fillText("SIDE SENSOR ALERT", -38, sideDist - 3);
          ctx.fillText("SIDE SENSOR ALERT", -38, -sideDist + 8);
        }

        ctx.restore();
      }

      // 7.5 Draw AGV Tracks and AGVs
      ctx.strokeStyle = "rgba(234, 179, 8, 0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(AGV_TRACK[0].x, AGV_TRACK[0].y);
      for(let i=1; i<AGV_TRACK.length; i++) ctx.lineTo(AGV_TRACK[i].x, AGV_TRACK[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      state.agvs.forEach(agv => {
         ctx.save();
         ctx.translate(agv.x, agv.y);
         const target = AGV_TRACK[agv.targetIdx];
         const dx = target.x - agv.x;
         const dy = target.y - agv.y;
         const angle = Math.atan2(dy, dx);
         ctx.rotate(angle);
         
         // AGV Body
         ctx.fillStyle = "#eab308"; // Yellow AGV
         ctx.fillRect(-8, -6, 16, 12);
         ctx.fillStyle = "#334155";
         ctx.fillRect(-6, -4, 12, 8); // inner deck
         
         // Payload
         if (agv.hasPayload) {
            ctx.fillStyle = "#b45309";
            ctx.fillRect(-4, -3, 8, 6);
            ctx.strokeStyle = "#fef08a";
            ctx.strokeRect(-4, -3, 8, 6);
         }
         
         // Lights
         ctx.fillStyle = "rgba(16, 185, 129, 0.8)";
         ctx.beginPath(); ctx.arc(6, -4, 1.5, 0, Math.PI*2); ctx.fill();
         ctx.beginPath(); ctx.arc(6, 4, 1.5, 0, Math.PI*2); ctx.fill();

         ctx.restore();
      });

      // 8. Draw Forklift
      ctx.save();
      ctx.translate(forklift.x, forklift.y);
      ctx.rotate(forklift.angle);
      
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(-15, -10, 30, 20);

      // Forklift Base Body (Yellow neon industrial styling)
      ctx.fillStyle = "var(--color-yellow)";
      ctx.fillRect(-16, -11, 32, 22);

      // Cabin (Sci-fi cockpit styling)
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(-5, -8, 14, 16);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-5, -8, 14, 16);

      // Wheels
      ctx.fillStyle = "#020617";
      ctx.fillRect(-12, -13, 8, 3);
      ctx.fillRect(-12, 10, 8, 3);
      ctx.fillRect(4, -13, 6, 3);
      ctx.fillRect(4, 10, 6, 3);

      // Forks (Grey steel prongs)
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(16, -8, 22, 3);
      ctx.fillRect(16, 5, 22, 3);

      // Headlights glow
      if (!emergency && forklift.speed > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.beginPath();
        ctx.moveTo(16, -9);
        ctx.lineTo(60, -20);
        ctx.lineTo(60, 20);
        ctx.lineTo(16, 9);
        ctx.closePath();
        ctx.fill();
      }

      // Braking warning light
      if (forklift.brakeLevel > 0 || forklift.speed < 0 || emergency) {
        ctx.fillStyle = "var(--color-red)";
        ctx.shadowColor = "var(--color-red)";
        ctx.shadowBlur = 8;
        ctx.fillRect(-16, -9, 3, 5);
        ctx.fillRect(-16, 4, 3, 5);
      }
      
      ctx.restore();

      // 9. Draw Workers
      workers.forEach((worker) => {
        if (worker.isHidden) return;
        ctx.save();
        ctx.translate(worker.x, worker.y);
        
        if (worker.isFallen) {
          // Draw fallen person (lying flat on ground)
          ctx.fillStyle = "var(--color-red)";
          // Body
          ctx.fillRect(-10, -4, 18, 8);
          // Head circle separate
          ctx.beginPath(); ctx.arc(10, 0, 4, 0, Math.PI*2); ctx.fill();
        } else {
          // Draw normal top-view worker (Circle representing shoulders, smaller circle for head/helmet)
          // Shoulders
          ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fillStyle = worker.isPlayer ? "var(--color-cyan)" : "#64748b"; 
          ctx.fill();
          ctx.strokeStyle = "#475569";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Hardhat (if worn)
          if (worker.hasHelmet) {
            ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = "var(--color-yellow)"; 
            ctx.fill();
            
            // Helmet visor lines
            ctx.strokeStyle = "#d97706";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
          } else {
            // Hair (no helmet)
            ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = "#3e2723"; 
            ctx.fill();
          }
        }
        ctx.restore();

        // 10. AI Camera Analytics Bounding Box & HUD
        ctx.save();
        const boxSize = 24;
        let boxColor = "var(--color-green)"; 
        let label = "SAFE (WORKER)";
        
        // Hazard detection status
        if (worker.isFallen) {
          boxColor = "var(--color-red)"; label = "🚨 WARNING: 쓰러짐 감지 (FALLEN)";
        } else if (!worker.hasHelmet) {
          boxColor = "var(--color-red)"; label = "🚨 DANGER: 안전모 미착용 (NO HELMET)";
        } else {
          // Distance checks for dynamic box colors
          const dx = worker.x - forklift.x;
          const dy = worker.y - forklift.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (!emergency) {
            if (dist < 45) {
              boxColor = "var(--color-red)"; label = "위험 반경 진입 (DANGER)";
            } else if (dist < 100) {
              boxColor = "var(--color-yellow)"; label = "주의 접근 (CAUTION)";
            }
          }
        }

        // Render AI Corner bracket bounds
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        // Top Left
        ctx.moveTo(worker.x - boxSize/2, worker.y - boxSize/2 + 5);
        ctx.lineTo(worker.x - boxSize/2, worker.y - boxSize/2);
        ctx.lineTo(worker.x - boxSize/2 + 5, worker.y - boxSize/2);
        // Top Right
        ctx.moveTo(worker.x + boxSize/2 - 5, worker.y - boxSize/2);
        ctx.lineTo(worker.x + boxSize/2, worker.y - boxSize/2);
        ctx.lineTo(worker.x + boxSize/2, worker.y - boxSize/2 + 5);
        // Bottom Left
        ctx.moveTo(worker.x - boxSize/2, worker.y + boxSize/2 - 5);
        ctx.lineTo(worker.x - boxSize/2, worker.y + boxSize/2);
        ctx.lineTo(worker.x - boxSize/2 + 5, worker.y + boxSize/2);
        // Bottom Right
        ctx.moveTo(worker.x + boxSize/2 - 5, worker.y + boxSize/2);
        ctx.lineTo(worker.x + boxSize/2, worker.y + boxSize/2);
        ctx.lineTo(worker.x + boxSize/2, worker.y + boxSize/2 - 5);
        ctx.stroke();
        
        // Bounding tag background
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        const labelWidth = label.length * 5;
        ctx.fillRect(worker.x - boxSize/2, worker.y - boxSize/2 - 13, labelWidth + 8, 11);
        
        // Text
        ctx.fillStyle = boxColor;
        ctx.font = "bold 8px sans-serif";
        ctx.fillText(label, worker.x - boxSize/2 + 4, worker.y - boxSize/2 - 4);

        if (mode === "worker" && worker.id === selectedWorkerId) {
          ctx.fillStyle = "var(--color-cyan)";
          ctx.shadowColor = "var(--color-cyan)";
          ctx.shadowBlur = 6;
          ctx.font = "bold 9px sans-serif";
          ctx.fillText(`▼ 직접 조작 대상: ${worker.name}`, worker.x - 40, worker.y - boxSize/2 - 16);
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      });

      // 11. Screen flashing overlays for emergencies
      if (emergency) {
        ctx.fillStyle = `rgba(244, 63, 94, ${0.07 + Math.sin(Date.now() / 150) * 0.05})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Massive HUD Alert box
        ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
        ctx.strokeStyle = "var(--color-red)";
        ctx.lineWidth = 2;
        ctx.fillRect(CANVAS_WIDTH/2 - 250, CANVAS_HEIGHT/2 - 60, 500, 110);
        ctx.strokeRect(CANVAS_WIDTH/2 - 250, CANVAS_HEIGHT/2 - 60, 500, 110);

        ctx.fillStyle = "var(--color-red)";
        ctx.font = "bold 17px var(--font-orbitron), sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🚨 EMER-STOP SHUTDOWN IN EFFECT", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 - 25);
        
        ctx.font = "11px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText("스마트 안전망 감지기 프로토콜에 의해 모든 장비 동력이 강제 차단되었습니다.", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 5);
        ctx.fillStyle = "var(--text-muted)";
        ctx.font = "9px sans-serif";
        ctx.fillText("사고 요인 제거 및 '원격 비상 복구' 버튼을 눌러 리셋 해 주십시오.", CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 25);
      }
    };

    const loop = () => {
      updatePhysics();
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => cancelAnimationFrame(animationFrameId);
  }, []);



  // Trigger fire simulation trigger
  const handleFireTrigger = (type: FireType) => {
    if (fireType === type) {
      setFireType("none");
      setGasLeakProgress(0);
      setAiStatus("정상 AI 모니터링 중");
    } else {
      setFireType(type);
      setGasLeakProgress(0);
      
      const fireLoc = type === "general" ? { x: 450, y: 310 } : { x: 150, y: 260 };
      setFirePos(fireLoc);

      const msg = type === "general" 
        ? "🚨 [화재 긴급] 고전압 프레스기 구역에 불꽃 및 화재 연기가 감지되었습니다!"
        : "🚨 [화학 이상] 화학 원자재랙 구역에 무색 가스 누출 및 이상 열 발생이 감지되었습니다!";
        
      addLog("danger", msg);
    }
  };

  // AI Self-learning implementation
  const handleLearnLog = (id: string) => {
    const log = simulatorLogs.find(l => l.id === id);
    if (!log) return;

    // Apply adjustments
    const speedAdjustment = Math.max(0.6, speedFactor - 0.2); // Limit speed limit
    const newBuffer = safetyBuffer + 25; // Increase safety alert buffer

    setSpeedFactor(Math.round(speedAdjustment * 10) / 10);
    setSafetyBuffer(newBuffer);
    
    // Set learned status locally
    setSimulatorLogs(prev => prev.map(l => l.id === id ? { ...l, isLearned: true } : l));

    // Post learn log to dashboard logs
    addLog("safe", `💡 [AI 자가 학습] 충돌 사고 분석 피드백 적용 완료! 속도 계수 감량 (${speedFactor}x -> ${Math.round(speedAdjustment * 10) / 10}x), 안전 마진 (+25px) 확대!`);

    setLearningNotification(
      `사고 시뮬레이션 데이터를 AI 모델에 반영하였습니다.\n\n` +
      `- 장비 속도 가중치: ${speedFactor}x → ${Math.round(speedAdjustment * 10) / 10}x (속도 감축)\n` +
      `- 센서 제동 안전 마진: ${safetyBuffer}px → ${newBuffer}px (+25px 늘어남)\n\n` +
      `[결과] 지게차가 이전 주행 경로보다 더욱 일찍 제동을 가동하게 되어 사고를 미리 방지합니다.`
    );
  };

  const runGeminiAnalysis = async () => {
    setIsAnalyzing(true);
    setGeminiResult(null);
    try {
      // Calculate current speed as a fraction
      const forkliftObj = (window as any).simForklift || { speed: 0 };
      const currentSpeed = Math.round(Math.abs(forkliftObj.speed || 0) * 3.6 * 10) / 10;
      
      const payload = {
        action: "predict",
        telemetry: {
          speed: currentSpeed,
          mode: mode,
          isAiActive: isAiActive,
          workerCount: 8,
          playerHelmet: playerHelmet,
          playerFallen: playerFallen,
          fireType: fireType,
          temperature: fireType === "general" ? 425 : fireType === "chemical" ? 180 : 35
        },
        customApiKey: customApiKey
      };

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setGeminiResult(data.data);
        addLog(
          data.data.riskLevel === "CRITICAL" || data.data.riskLevel === "HIGH" ? "danger" : "safe",
          `🧠 [Gemini AI 실시간 진단] 위협 수준: ${data.data.riskLevel} (${data.data.riskIndex}%) - ${data.data.summary}`
        );
        
        // Auto-prevention trigger: if threat level is critical/high and AI is active, shut down!
        if (isAiActive && (data.data.riskLevel === "CRITICAL" || data.data.riskLevel === "HIGH" || data.data.autoShutdown)) {
          setEmergency(true);
          setAiStatus("🛑 [Gemini AI 원격 개입] 고위험 상황 감지로 인한 비상 정지 기동");
          addLog("danger", "🛑 [Gemini AI 자동 예방 제동] 지게차 원격 감속 및 안전 강제 셧다운 실행 완료!");
        }
      } else {
        alert(data.error || "AI 분석에 실패했습니다.");
      }
    } catch (err: any) {
      console.error(err);
      alert("API 호출 실패: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runIncidentReport = async (log: AccidentLog) => {
    setGeneratingReport(true);
    setReportTargetLog(log);
    try {
      const payload = {
        action: "report",
        incident: {
          type: log.type,
          time: log.time,
          description: log.description,
          details: log.details,
          speedFactor: speedFactor,
          safetyBuffer: safetyBuffer
        },
        customApiKey: customApiKey
      };

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setActiveReport(data.report);
        setShowReportModal(true);
        addLog("safe", `📄 [Gemini AI 경위서] ${log.time} 충돌사고에 대한 정부 제출용 사고조사 보고서 작성을 완료했습니다.`);
      } else {
        alert(data.error || "보고서 생성에 실패했습니다.");
      }
    } catch (err: any) {
      console.error(err);
      alert("보고서 생성 중 오류 발생: " + err.message);
    } finally {
      setGeneratingReport(false);
    }
  };

  const downloadReportFile = () => {
    if (!activeReport) return;
    const blob = new Blob([activeReport], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Industrial_Incident_Report_${reportTargetLog?.time.replace(/:/g, "-") || "log"}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedWorker = gameState.current.workers.find(w => w.id === selectedWorkerId);
  const selectedWorkerName = selectedWorker ? selectedWorker.name.replace(" (조작)", "") : "선택 작업자";

  // Real-time Violators Dashboard calculation
  const violators = gameState.current.workers.filter(w => !w.hasHelmet || w.isFallen || HAZARD_ZONES.some(zone => isInsideHazardZone(w.x, w.y, zone)));

  return (
    <div style={{ 
      display: "grid", 
      gridTemplateColumns: isLeftPanelExpanded && isRightPanelExpanded ? "260px 1fr 300px" : isLeftPanelExpanded ? "260px 1fr" : isRightPanelExpanded ? "1fr 300px" : "1fr", 
      gap: "16px", 
      padding: "16px", 
      minHeight: "100%", 
      overflowY: "visible" 
    }}>
      {/* 1. Left Panel: Fleet / Event controls */}
      {isLeftPanelExpanded && (
        <div className="panel" style={{ 
          position: "sticky",
          top: "16px",
          maxHeight: "calc(100vh - 32px)",
          display: "flex", 
          flexDirection: "column", 
          overflowY: "auto",
          scrollbarWidth: "thin"
        }}>
        


        {/* WORKER SELECT DROPDOWN */}
        <div style={{ marginBottom: "18px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontWeight: "bold" }}>직접 조작 대상 선택</span>
            <select
              value={selectedWorkerId}
              onChange={(e) => {
                setSelectedWorkerId(e.target.value);
                setMode("worker");
                playWarningBeep(850, 0.05, 0.03);
              }}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1.5px solid var(--bg-panel-border)",
                borderColor: mode === "worker" ? "var(--color-cyan)" : "var(--bg-panel-border)",
                borderRadius: "6px",
                color: mode === "worker" ? "var(--color-cyan)" : "var(--text-normal)",
                fontSize: "0.76rem",
                fontWeight: "bold",
                outline: "none",
                cursor: "pointer",
                boxShadow: mode === "worker" ? "0 0 8px rgba(6, 182, 212, 0.15)" : "none",
                transition: "all 0.2s"
              }}
            >
              {gameState.current.workers.map(w => (
                <option key={w.id} value={w.id} style={{ background: "#0f172a", color: "#f8fafc" }}>
                  {w.name} {w.id === "p1" ? "(기본 플레이어)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* AI SYSTEM SWITCH */}
        <div className="panel-title">
          <Cpu size={14} />
          <span>AI 안전 감지 예방 모드</span>
        </div>

        <div style={{ marginBottom: "18px" }}>
          <button
            onClick={() => setIsAiActive(!isAiActive)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "6px",
              background: isAiActive ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
              border: `1.5px solid ${isAiActive ? "var(--color-green)" : "var(--color-red)"}`,
              color: isAiActive ? "var(--color-green)" : "var(--color-red)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: "0.76rem"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ShieldCheck size={16} />
              <span>{isAiActive ? "AI 안전 방지 시스템 ON" : "AI 방지 시스템 OFF (수동)"}</span>
            </div>
            {isAiActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          </button>
          <p style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: "4px", padding: "0 2px", lineHeight: "1.4" }}>
            {isAiActive 
              ? "1단계 경고 → 2단계 감속 → 3단계 자동 비상 제동이 가동됩니다." 
              : "AI 자동 제어 장치가 해제되어 장애물/작업자와 충돌 사고가 발생할 수 있습니다."}
          </p>
        </div>

        {/* GEMINI REALTIME SAFETY ANALYST PANEL */}
        <div className="panel-title" style={{ marginTop: "6px" }}>
          <Sparkles size={14} className="animate-pulse" style={{ color: "var(--color-cyan)" }} />
          <span style={{ color: "var(--color-cyan)" }}>Gemini 3.5 Flash 위험 진단</span>
        </div>

        <div style={{ 
          background: "rgba(6, 182, 212, 0.03)", 
          border: "1px solid rgba(6, 182, 212, 0.15)", 
          padding: "10px", 
          borderRadius: "6px", 
          marginBottom: "18px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          {/* Custom API Key entry if not in .env */}
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ fontSize: "0.58rem", color: "var(--text-muted)", fontWeight: "bold" }}>MANUAL GEMINI API KEY (선택)</span>
            <input 
              type="password" 
              placeholder="API Key 입력 시 env 설정을 대체합니다" 
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
              style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(6, 182, 212, 0.3)",
                borderRadius: "4px",
                padding: "4px 6px",
                fontSize: "0.62rem",
                color: "#fff",
                outline: "none"
              }}
            />
          </div>

          <button
            onClick={runGeminiAnalysis}
            disabled={isAnalyzing}
            style={{
              width: "100%",
              padding: "8px",
              background: isAnalyzing ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg, rgba(6, 182, 212, 0.25) 0%, rgba(59, 130, 246, 0.25) 100%)",
              border: `1px solid ${isAnalyzing ? "rgba(255,255,255,0.1)" : "var(--color-cyan)"}`,
              borderRadius: "4px",
              color: isAnalyzing ? "var(--text-muted)" : "#fff",
              fontWeight: "bold",
              fontSize: "0.68rem",
              cursor: isAnalyzing ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              boxShadow: "0 0 10px rgba(6,182,212,0.15)",
              transition: "all 0.2s"
            }}
            className="hover:scale-[1.02] active:scale-[0.98]"
          >
            <Sparkles size={12} className={isAnalyzing ? "animate-spin" : ""} />
            <span>{isAnalyzing ? "실시간 AI 위험 분석 중..." : "Gemini AI 사고 예측 진단"}</span>
          </button>

          {/* Diagnosis Results */}
          {geminiResult ? (
            <div style={{ 
              background: "rgba(0,0,0,0.4)", 
              border: `1px solid ${
                geminiResult.riskLevel === "CRITICAL" || geminiResult.riskLevel === "HIGH" 
                  ? "rgba(244,63,94,0.4)" 
                  : geminiResult.riskLevel === "MEDIUM" 
                    ? "rgba(234,179,8,0.4)" 
                    : "rgba(16,185,129,0.4)"
              }`, 
              padding: "8px", 
              borderRadius: "4px",
              fontSize: "0.65rem",
              display: "flex",
              flexDirection: "column",
              gap: "5px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "bold" }}>위험 위협 수준:</span>
                <span style={{ 
                  color: 
                    geminiResult.riskLevel === "CRITICAL" || geminiResult.riskLevel === "HIGH" 
                      ? "var(--color-red)" 
                      : geminiResult.riskLevel === "MEDIUM" 
                        ? "var(--color-yellow)" 
                        : "var(--color-green)",
                  fontWeight: "bold",
                  fontSize: "0.7rem"
                }}>
                  {geminiResult.riskLevel} ({geminiResult.riskIndex}%)
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ width: "100%", height: "4px", background: "rgba(255,255,255,0.08)", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ 
                  width: `${geminiResult.riskIndex}%`, 
                  height: "100%", 
                  background: 
                    geminiResult.riskLevel === "CRITICAL" || geminiResult.riskLevel === "HIGH" 
                      ? "var(--color-red)" 
                      : geminiResult.riskLevel === "MEDIUM" 
                        ? "var(--color-yellow)" 
                        : "var(--color-green)"
                }} />
              </div>

              <div style={{ color: "#fff", fontWeight: "bold", borderBottom: "1px dashed rgba(255,255,255,0.1)", paddingBottom: "3px", marginTop: "2px" }}>
                {geminiResult.summary}
              </div>

              <div style={{ color: "var(--text-muted)", fontSize: "0.6rem", lineHeight: "1.3" }}>
                {geminiResult.details}
              </div>

              {geminiResult.actions && geminiResult.actions.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "2px" }}>
                  <span style={{ fontSize: "0.58rem", color: "var(--color-cyan)", fontWeight: "bold" }}>[긴급 조치 수칙]</span>
                  {geminiResult.actions.map((act: string, idx: number) => (
                    <div key={idx} style={{ color: "#fff", fontSize: "0.58rem", display: "flex", gap: "3px" }}>
                      <span>•</span>
                      <span>{act}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: "0.58rem", color: "var(--text-muted)", padding: "0 2px", lineHeight: "1.4", textAlign: "center" }}>
              실시간 속도, 헬멧 유무, 센서 값을 통해 Gemini가 사고 시나리오를 예측하고 자동 셧다운을 차단합니다.
            </p>
          )}
        </div>

        {/* SIMULATOR TRIGGER PANEL */}
        <div className="panel-title">
          <ShieldAlert size={14} />
          <span>안전 위반 / 위험 상황 발령</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
          {/* Helmet toggle */}
          <button
            onClick={() => setPlayerHelmet(!playerHelmet)}
            className="btn"
            style={{ 
              justifyContent: "flex-start",
              borderLeft: `3px solid ${playerHelmet ? "var(--color-green)" : "var(--color-red)"}`,
              color: playerHelmet ? "var(--text-main)" : "var(--color-red)",
              background: playerHelmet ? "rgba(255,255,255,0.02)" : "rgba(244,63,94,0.06)",
              padding: "7px 10px"
            }}
          >
            <ShieldAlert size={13} />
            <span style={{ fontSize: "0.72rem" }}>
              {playerHelmet ? `안전모 벗기 (${selectedWorkerName})` : `안전모 착용 (${selectedWorkerName})`}
            </span>
          </button>

          {/* Fall toggle */}
          <button
            onClick={() => setPlayerFallen(!playerFallen)}
            className="btn"
            style={{ 
              justifyContent: "flex-start",
              borderLeft: `3px solid ${!playerFallen ? "var(--color-green)" : "var(--color-red)"}`,
              color: !playerFallen ? "var(--text-main)" : "var(--color-red)",
              background: !playerFallen ? "rgba(255,255,255,0.02)" : "rgba(244,63,94,0.06)",
              padding: "7px 10px"
            }}
          >
            <HeartOff size={13} />
            <span style={{ fontSize: "0.72rem" }}>
              {playerFallen ? `${selectedWorkerName} 기립` : `${selectedWorkerName} 쓰러짐 유발`}
            </span>
          </button>

          {/* Normal Fire */}
          <button
            onClick={() => handleFireTrigger("general")}
            className="btn"
            style={{ 
              justifyContent: "flex-start",
              borderLeft: `3px solid ${fireType === "general" ? "var(--color-red)" : "var(--bg-panel-border)"}`,
              color: fireType === "general" ? "var(--color-red)" : "var(--text-main)",
              background: fireType === "general" ? "rgba(244,63,94,0.06)" : "rgba(255,255,255,0.02)",
              padding: "7px 10px"
            }}
          >
            <Flame size={13} />
            <span style={{ fontSize: "0.72rem" }}>일반 화재 발생 (프레스기 구역)</span>
          </button>

          {/* Chemical/Gas Fire */}
          <button
            onClick={() => handleFireTrigger("chemical")}
            className="btn"
            style={{ 
              justifyContent: "flex-start",
              borderLeft: `3px solid ${fireType === "chemical" ? "var(--color-red)" : "var(--bg-panel-border)"}`,
              color: fireType === "chemical" ? "var(--color-red)" : "var(--text-main)",
              background: fireType === "chemical" ? "rgba(244,63,94,0.06)" : "rgba(255,255,255,0.02)",
              padding: "7px 10px"
            }}
          >
            <Flame size={13} />
            <span style={{ fontSize: "0.72rem" }}>화학 가스 누출 화재 (열화상 전용)</span>
          </button>
          
          {/* Fire 119 Call Simulation & Extinguish */}
          {fireType !== "none" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px", background: "rgba(244,63,94,0.1)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(244,63,94,0.3)" }}>
              {fireCallStep === 0 && (
                <button
                  onClick={() => {
                     setFireCallStep(1);
                     addLog("warning", "📞 119 상황실에 화재 신고를 연결 중입니다...");
                     setTimeout(() => {
                        setFireCallStep(2);
                        addLog("warning", "👨‍🚒 소방서: '네, 119입니다. 공장에 화재가 발생했습니까?'");
                        setTimeout(() => {
                           setFireCallStep(3);
                           addLog("danger", "🤖 스마트 관제 AI: '스마트 공장 A구역에 화재 발생! 즉각적인 소방 지원이 필요합니다!'");
                           setTimeout(() => {
                              setFireCallStep(4);
                              addLog("safe", "👨‍🚒 소방서: '상황 접수되었습니다. 즉시 소방차 출동합니다!'");
                           }, 2000);
                        }, 2000);
                     }, 1500);
                  }}
                  className="btn hover:border-red-500 hover:scale-[1.02]"
                  style={{ 
                    justifyContent: "center", padding: "10px", 
                    background: "rgba(244, 63, 94, 0.2)", border: "2px solid var(--color-red)", color: "white", fontWeight: "bold",
                    animation: "pulse-border 1.5s infinite"
                  }}
                >
                  <span style={{ fontSize: "0.85rem" }}>📞 119 긴급 화재 신고 접수</span>
                </button>
              )}
              {fireCallStep === 1 && (
                <div style={{ color: "var(--color-yellow)", fontSize: "0.8rem", textAlign: "center", padding: "8px" }}>📞 119 연결 중...</div>
              )}
              {fireCallStep === 2 && (
                <div style={{ color: "var(--color-yellow)", fontSize: "0.8rem", textAlign: "center", padding: "8px" }}>👨‍🚒 소방서 상황실 통화 중...</div>
              )}
              {fireCallStep === 3 && (
                <div style={{ color: "var(--color-red)", fontSize: "0.8rem", textAlign: "center", padding: "8px" }}>🤖 AI 관제소 자동 상황 보고 중...</div>
              )}
              {fireCallStep === 4 && (
                <button
                  onClick={() => {
                    setFireType("none");
                    setGasLeakProgress(0);
                    setFireCallStep(0);
                    addLog("safe", "🧯 [소방대 도착] 소화 설비 가동 및 화재 진압 성공. 작업자들이 복귀합니다.");
                    playWarningBeep(500, 0.3, 0.05);
                  }}
                  className="btn hover:border-green-500 hover:scale-[1.02]"
                  style={{ 
                    justifyContent: "center", padding: "10px", 
                    background: "rgba(16, 185, 129, 0.15)", border: "2px solid var(--color-green)", color: "var(--color-green)", fontWeight: "bold"
                  }}
                >
                  <span style={{ fontSize: "0.85rem" }}>🧯 화재 진압 및 대피 해제</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )}

      {/* 2. Center Panel: Canvas & Timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
        
        {/* Canvas panel */}
        <div className="panel" style={{ height: "620px", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", border: `1px solid ${emergency ? "var(--color-red)" : "var(--bg-panel-border)"}` }}>
          
          {/* Live HUD Header */}
          <div style={{ position: "absolute", top: "12px", left: "12px", right: "12px", zIndex: 20, display: "flex", justifyContent: "space-between", pointerEvents: "none" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setIsLeftPanelExpanded(!isLeftPanelExpanded)}
                style={{
                  background: "rgba(3, 7, 18, 0.95)",
                  border: "1.5px solid var(--color-cyan)",
                  borderRadius: "6px",
                  color: "var(--color-cyan)",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  pointerEvents: "auto",
                  boxShadow: "0 0 14px rgba(6, 182, 212, 0.3)",
                  transition: "all 0.2s"
                }}
                className="hover:scale-[1.08] active:scale-[0.92]"
                title={isLeftPanelExpanded ? "좌측 패널 접기" : "좌측 패널 펼치기"}
              >
                <Menu size={18} style={{ transform: isLeftPanelExpanded ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.3s" }} />
              </button>

              {/* Added Global Status */}
              <div style={{ 
                background: "rgba(3, 7, 18, 0.9)", 
                border: `2px solid ${emergency ? "var(--color-red)" : fireType !== "none" ? "var(--color-yellow)" : "var(--color-green)"}`, 
                padding: "6px 20px", 
                borderRadius: "4px", 
                display: "flex", 
                alignItems: "center", 
                gap: "10px",
                boxShadow: `0 0 15px ${emergency ? "rgba(244,63,94,0.4)" : fireType !== "none" ? "rgba(234,179,8,0.4)" : "rgba(16,185,129,0.3)"}`,
              }}>
                <ShieldAlert size={16} color={emergency ? "var(--color-red)" : fireType !== "none" ? "var(--color-yellow)" : "var(--color-green)"} />
                <span style={{ fontSize: "0.85rem", fontWeight: "bold", color: emergency ? "var(--color-red)" : fireType !== "none" ? "var(--color-yellow)" : "var(--color-green)" }}>
                  FACTORY STATUS: {emergency ? "EMERGENCY SHUTDOWN" : fireType !== "none" ? "EVACUATING" : "NOMINAL"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              {/* Right Panel Toggle */}
              <button
                onClick={() => setIsRightPanelExpanded(!isRightPanelExpanded)}
                style={{
                  background: "rgba(3, 7, 18, 0.95)",
                  border: "1.5px solid var(--color-cyan)",
                  borderRadius: "6px",
                  color: "var(--color-cyan)",
                  width: "36px",
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  pointerEvents: "auto",
                  boxShadow: "0 0 14px rgba(6, 182, 212, 0.3)",
                  transition: "all 0.2s"
                }}
                className="hover:scale-[1.08] active:scale-[0.92]"
                title={isRightPanelExpanded ? "우측 패널 접기" : "우측 패널 펼치기"}
              >
                <Sliders size={18} />
              </button>
            </div>
          </div>

          {/* Violators Dashboard Window */}
          {violators.length > 0 && (
            <div style={{
              position: "absolute",
              top: "60px",
              right: "12px",
              zIndex: 19,
              width: "250px",
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid var(--color-red)",
              borderRadius: "8px",
              boxShadow: "0 0 20px rgba(244, 63, 94, 0.3)",
              backdropFilter: "blur(10px)",
              display: "flex",
              flexDirection: "column",
              pointerEvents: "auto"
            }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(244, 63, 94, 0.3)", display: "flex", alignItems: "center", gap: "6px", background: "rgba(244, 63, 94, 0.15)", borderTopLeftRadius: "8px", borderTopRightRadius: "8px" }}>
                <ShieldAlert size={14} color="var(--color-red)" />
                <span style={{ color: "var(--color-red)", fontSize: "0.75rem", fontWeight: "bold" }}>현재 위반자 현황 ({violators.length}명)</span>
              </div>
<div style={{ display: "flex", flexDirection: "column", padding: "8px", gap: "6px", maxHeight: "200px", overflowY: "auto" }}>
                {violators.map(v => {
                  let reason = "";
                  if (v.isFallen) reason = "쓰러짐 감지";
                  else if (!v.hasHelmet) reason = "안전모 미착용";
                  else reason = "위험구역 무단진입";
                  
                  return (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.4)", padding: "6px 8px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontSize: "0.65rem", color: "#fff", fontWeight: "bold" }}>{v.name}</span>
                        <span style={{ fontSize: "0.6rem", color: "var(--color-yellow)" }}>{reason}</span>
                      </div>
                      <button 
                        onClick={() => setSelectedWorkerId(v.id)}
                        className="btn" 
                        style={{ padding: "4px 8px", fontSize: "0.6rem", background: "var(--color-cyan)", color: "#000", fontWeight: "bold" }}
                      >
                        선택
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Production UPH Dashboard */}
          <div 
            onPointerDown={(e) => {
               if ((e.target as HTMLElement).closest('.dash-header')) {
                  setIsDraggingDash(true);
                  dragStartRef.current = {
                     x: e.clientX,
                     y: e.clientY,
                     initOffsetX: dashOffset.x,
                     initOffsetY: dashOffset.y
                  };
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
               }
            }}
            onPointerMove={(e) => {
               if (isDraggingDash) {
                  setDashOffset({
                     x: dragStartRef.current.initOffsetX + (e.clientX - dragStartRef.current.x),
                     y: dragStartRef.current.initOffsetY + (e.clientY - dragStartRef.current.y)
                  });
               }
            }}
            onPointerUp={(e) => {
               setIsDraggingDash(false);
               (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            }}
            style={{
            position: "absolute",
            top: violators.length > 0 ? "280px" : "60px",
            right: "12px",
            transform: `translate(${dashOffset.x}px, ${dashOffset.y}px)`,
            zIndex: 18,
            width: "250px",
            background: "rgba(15, 23, 42, 0.85)",
            border: "1px solid var(--color-cyan)",
            borderRadius: "8px",
            boxShadow: "0 0 20px rgba(6, 182, 212, 0.15)",
            backdropFilter: "blur(10px)",
            display: "flex",
            flexDirection: "column",
            pointerEvents: "auto",
            userSelect: "none"
          }}>
             <div className="dash-header" style={{ padding: "8px 12px", borderBottom: "1px solid rgba(6, 182, 212, 0.3)", display: "flex", alignItems: "center", gap: "6px", background: "rgba(6, 182, 212, 0.15)", borderTopLeftRadius: "8px", borderTopRightRadius: "8px", cursor: isDraggingDash ? "grabbing" : "grab" }}>
               <Database size={14} color="var(--color-cyan)" />
               <span style={{ color: "var(--color-cyan)", fontSize: "0.75rem", fontWeight: "bold" }}>실시간 AI 생산 대시보드</span>
             </div>
             <div style={{ display: "flex", flexDirection: "column", padding: "12px", gap: "10px" }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                 <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>일일 누적 생산량 (TOTAL)</span>
                 <span style={{ fontSize: "0.9rem", color: "#fff", fontWeight: "bold", fontFamily: "var(--font-orbitron)" }}>{Math.floor(gameState.current.productionCount).toLocaleString()} EA</span>
               </div>
               <div style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                 <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>시간당 생산량 (UPH)</span>
                 <span style={{ fontSize: "0.9rem", color: "var(--color-green)", fontWeight: "bold", fontFamily: "var(--font-orbitron)" }}>{gameState.current.uph.toLocaleString()} EA/H</span>
               </div>
               <div style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                 <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>AI 컨베이어 동기화율</span>
                 <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                   {isAiActive && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-cyan)", animation: "pulse-border 1s infinite" }} />}
                   <span style={{ fontSize: "0.85rem", color: isAiActive ? "var(--color-cyan)" : "var(--color-yellow)", fontWeight: "bold", fontFamily: "var(--font-orbitron)" }}>
                     {isAiActive ? `${(gameState.current.conveyorSpeed * 100).toFixed(1)}%` : "MANUAL"}
                   </span>
                 </div>
               </div>
             </div>
          </div>

          <div className="scan-line" />

          {/* Obstacle Info Popover */}
          {selectedObstacle && (
            <div style={{
              position: "absolute",
              left: Math.min(obsClickPos.x + 15, 600) + "px",
              top: Math.min(obsClickPos.y + 15, 300) + "px",
              zIndex: 30,
              width: "280px",
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid var(--color-cyan)",
              borderRadius: "8px",
              boxShadow: "0 0 20px rgba(6, 182, 212, 0.3)",
              backdropFilter: "blur(10px)",
              display: "flex",
              flexDirection: "column",
              pointerEvents: "auto"
            }}>
               <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(6, 182, 212, 0.3)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(6, 182, 212, 0.15)", borderTopLeftRadius: "8px", borderTopRightRadius: "8px" }}>
                 <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                   <Database size={14} color="var(--color-cyan)" />
                   <span style={{ color: "var(--color-cyan)", fontSize: "0.85rem", fontWeight: "bold" }}>{selectedObstacle.label}</span>
                 </div>
                 <button onClick={() => setSelectedObstacle(null)} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: "1rem" }}>&times;</button>
               </div>
               
               <div style={{ display: "flex", flexDirection: "column", padding: "12px", gap: "10px" }}>
                 {selectedObstacle.label === "컨베이어 라인" ? (
                   <>
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                       <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>현재 작동 모드</span>
                       <span style={{ fontSize: "0.85rem", color: isAiActive ? "var(--color-cyan)" : "var(--color-yellow)", fontWeight: "bold" }}>
                         {isAiActive ? "AI 동기화 최적화" : "수동 모드"}
                       </span>
                     </div>
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                       <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>실시간 구동 속도</span>
                       <span style={{ fontSize: "0.9rem", color: "#fff", fontWeight: "bold", fontFamily: "var(--font-orbitron)" }}>
                         {(gameState.current.conveyorSpeed * 100).toFixed(1)}%
                       </span>
                     </div>
                     <div style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                       <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>예상 시간당 생산량(UPH)</span>
                       <span style={{ fontSize: "0.9rem", color: "var(--color-green)", fontWeight: "bold", fontFamily: "var(--font-orbitron)" }}>
                         {gameState.current.uph.toLocaleString()} EA/H
                       </span>
                     </div>
                   </>
                 ) : (
                   <>
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                       <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>적재 공간 가동률</span>
                       <span style={{ fontSize: "0.85rem", color: "var(--color-cyan)", fontWeight: "bold" }}>
                         {selectedObstacle.label.includes("전자부품") ? "84%" : 
                          selectedObstacle.label.includes("조립 완제품") ? "92%" : 
                          selectedObstacle.label.includes("화학") ? "41%" : "68%"}
                       </span>
                     </div>
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                       <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>현재 재고 수량</span>
                       <span style={{ fontSize: "0.9rem", color: "#fff", fontWeight: "bold", fontFamily: "var(--font-orbitron)" }}>
                         {selectedObstacle.label.includes("전자부품") ? "8,420 EA" : 
                          selectedObstacle.label.includes("조립 완제품") ? `${(2000 + Math.floor(gameState.current.productionCount)).toLocaleString()} EA` : 
                          selectedObstacle.label.includes("화학") ? "410 L" : "6,800 EA"}
                       </span>
                     </div>
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                       <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>최대 수용 가능량</span>
                       <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: "bold", fontFamily: "var(--font-orbitron)" }}>
                         {selectedObstacle.label.includes("화학") ? "1,000 L" : "10,000 EA"}
                       </span>
                     </div>
                     <div style={{ height: "1px", background: "rgba(255,255,255,0.05)" }} />
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                       <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>상태</span>
                       <span style={{ fontSize: "0.8rem", color: "var(--color-green)", fontWeight: "bold" }}>정상 (입/출고 가능)</span>
                     </div>
                   </>
                 )}
               </div>
            </div>
          )}

          {/* Simulator Canvas Frame */}
          <div style={{ width: "100%", height: "calc(100% - 46px)", display: "flex", alignItems: "center", justifyContent: "center", background: "#010204", overflow: "hidden" }}>
            <canvas 
              ref={canvasRef} 
              width={CANVAS_WIDTH} 
              height={CANVAS_HEIGHT}
              style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "pointer" }}
              onClick={handleCanvasClick}
            />
          </div>

          {/* Media Playback bar */}
          <div style={{ 
            height: "46px", 
            borderTop: "1px solid var(--bg-panel-border)", 
            background: "rgba(7, 11, 22, 0.95)",
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            padding: "0 16px" 
          }}>
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-orbitron)" }}>
              {simTime} <span style={{ color: "rgba(255,255,255,0.1)" }}>/</span> 05:00.000
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button 
                className="btn" 
                style={{ padding: "4px 8px" }}
                onClick={() => {
                  // Reset state
                  const state = gameState.current;
                  state.forklift.x = 450;
                  state.forklift.y = 200;
                  state.forklift.speed = 0;
                  state.forklift.angle = -Math.PI / 2;
                  
                  // Reset workers
                  state.workers.forEach(w => {
                    w.isFallen = false;
                    w.hasHelmet = true;
                    w.targetX = undefined;
                    w.targetY = undefined;
                  });

                  setFireType("none");
                  setGasLeakProgress(0);
                  setFireCallStep(0);
                  setPlayerFallen(false);
                  setPlayerHelmet(true);
                  setEmergency(false);
                  setAiStatus("정상 AI 모니터링 중");
                  setElapsedSec(0);
                }}
                title="시뮬레이터 상태 전체 초기화"
              >
                <RotateCcw size={12} />
                <span style={{ fontSize: "0.65rem" }}>초기화</span>
              </button>

              <button 
                className="btn btn-cyan" 
                style={{ padding: "6px 12px", borderRadius: "50%", width: "28px", height: "28px", justifyContent: "center" }}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
              </button>

              <button
                onClick={toggleSound}
                className="btn"
                style={{ padding: "4px 8px", borderColor: soundEnabled ? "var(--bg-panel-border)" : "var(--color-red)" }}
                title="사이렌/경고음 온오프"
              >
                {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} className="text-red-500" />}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.03)", padding: "2px 6px", borderRadius: "3px" }}>1.0x SPD</span>
              
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "5px", height: "5px", backgroundColor: "var(--color-red)", borderRadius: "50%", animation: "pulse-border 1s infinite" }}></span>
                <span style={{ fontSize: "0.58rem", color: "var(--color-red)", fontWeight: "bold" }}>SIMULATIVE DETECTOR</span>
              </div>
            </div>
          </div>
        </div>

        {/* Accident Response Modal */}
        {showAccidentManual && accidentDetails && (
          <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)"
          }}>
            <div style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--color-red)",
              borderRadius: "8px",
              padding: "24px",
              width: "500px",
              boxShadow: "0 0 40px rgba(244, 63, 94, 0.4)",
              display: "flex",
              flexDirection: "column",
              gap: "16px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--bg-panel-border)", paddingBottom: "12px" }}>
                <AlertTriangle size={32} color="var(--color-red)" />
                <h2 style={{ color: "var(--color-red)", margin: 0, fontSize: "1.4rem" }}>긴급 사고 발생 (E-Stop 가동)</h2>
              </div>
              
              <div style={{ color: "#fff", fontSize: "1.1rem", fontWeight: "bold" }}>
                {accidentDetails.title}
              </div>
              
              <div style={{ background: "rgba(244, 63, 94, 0.1)", padding: "16px", borderRadius: "6px", border: "1px solid rgba(244, 63, 94, 0.2)" }}>
                <h3 style={{ color: "var(--color-red)", marginTop: 0, fontSize: "0.9rem", marginBottom: "8px" }}>사고 대응 매뉴얼 가이드라인</h3>
                <ul style={{ margin: 0, paddingLeft: "20px", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.85rem" }}>
                  {accidentDetails.instructions.map((inst, idx) => (
                    <li key={idx}>{inst}</li>
                  ))}
                </ul>
              </div>
              
              <button
                className="btn btn-cyan"
                style={{ marginTop: "10px", padding: "12px", fontSize: "1rem", fontWeight: "bold", background: "var(--color-red)", color: "#fff", border: "none" }}
                onClick={() => {
                  setShowAccidentManual(false);
                  setEmergency(false);
                  gameState.current.workers.forEach(w => w.isFallen = false);
                  setPlayerFallen(false);
                }}
              >
                사고 조치 완료 및 시스템 재가동
              </button>
            </div>
          </div>
        )}

        {/* Timeline Event Sequencer */}
        <div className="panel" style={{ height: "180px", flexShrink: 0 }}>
          <div className="panel-title">
            <Activity size={14} />
            <span>AI 관제 시나리오 타임라인</span>
            <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "var(--text-muted)" }}>T+ {simTime}</span>
          </div>

          <div style={{ 
            flex: 1, 
            background: "rgba(0,0,0,0.3)", 
            borderRadius: "6px", 
            border: "1px solid rgba(255,255,255,0.02)",
            position: "relative",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center"
          }}>
            {/* Timeline ticks */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", fontSize: "0.55rem", color: "rgba(255,255,255,0.15)" }}>
              <span>0s</span><span>10s</span><span>20s</span><span>30s</span><span>40s</span><span>50s</span><span>60s</span><span>70s</span><span>80s</span>
            </div>

            {/* Dynamic React timeline event mapper */}
            <div style={{ flex: 1, position: "relative", padding: "8px" }}>
              {/* Timeline Track Line */}
              <div style={{ 
                position: "absolute", 
                left: "8px", 
                right: "8px", 
                top: "50%", 
                height: "2px", 
                background: "rgba(255,255,255,0.08)", 
                transform: "translateY(-50%)" 
              }} />
              
              {/* Timeline Progress Line */}
              <div style={{ 
                position: "absolute", 
                left: "8px", 
                width: `calc(${Math.min(100, (elapsedSec / 80) * 100)}% - 16px)`, 
                top: "50%", 
                height: "2.5px", 
                background: "linear-gradient(90deg, var(--color-cyan) 0%, rgba(6, 182, 212, 0.4) 100%)", 
                boxShadow: "0 0 6px var(--color-cyan)",
                transform: "translateY(-50%)" 
              }} />

              {/* Render dynamic markers and tooltip cards */}
              {timelineEvents.map((evt, idx) => {
                const leftPos = `${Math.min(95, Math.max(3, (evt.timeSec / 80) * 100))}%`;
                const isTriggered = evt.triggered || elapsedSec >= evt.timeSec;
                
                let color = "var(--color-cyan)";
                let glowColor = "rgba(6, 182, 212, 0.4)";
                if (evt.type === "danger") {
                  color = "var(--color-red)";
                  glowColor = "rgba(244, 63, 94, 0.5)";
                } else if (evt.type === "warning") {
                  color = "var(--color-yellow)";
                  glowColor = "rgba(245, 158, 11, 0.5)";
                }
                
                const isTop = idx % 2 === 0;
                
                return (
                  <div key={evt.id} style={{ position: "absolute", left: leftPos, top: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
                    
                    {/* Dashed guide line */}
                    <div style={{ 
                      position: "absolute",
                      top: isTop ? "4px" : "50%",
                      height: "calc(50% - 4px)",
                      width: "1px",
                      borderLeft: `1px dashed ${isTriggered ? color : "rgba(255,255,255,0.08)"}`,
                      opacity: isTriggered ? 0.7 : 0.25
                    }} />

                    {/* Circular marker on timeline track */}
                    <div style={{ 
                      position: "absolute", 
                      top: "50%", 
                      transform: "translateY(-50%)", 
                      width: evt.isUserInduced ? "9px" : "7px", 
                      height: evt.isUserInduced ? "9px" : "7px", 
                      borderRadius: "50%", 
                      backgroundColor: isTriggered ? color : "#1e293b", 
                      border: `1px solid ${isTriggered ? "#fff" : "rgba(255,255,255,0.15)"}`,
                      boxShadow: isTriggered ? `0 0 6px ${color}` : "none",
                      zIndex: 10
                    }} />

                    {/* Floating Info card */}
                    <div style={{ 
                      position: "absolute", 
                      top: isTop ? "3px" : "calc(50% + 8px)", 
                      background: isTriggered ? "rgba(15, 23, 42, 0.9)" : "rgba(15, 23, 42, 0.55)", 
                      border: `1px solid ${isTriggered ? color : "rgba(255,255,255,0.05)"}`,
                      boxShadow: isTriggered ? `0 0 4px ${glowColor}` : "none",
                      borderRadius: "4px",
                      padding: "1px 5px",
                      fontSize: "0.55rem",
                      whiteSpace: "nowrap",
                      color: isTriggered ? "#fff" : "var(--text-muted)",
                      fontWeight: isTriggered ? "bold" : "normal",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.5px",
                      zIndex: 5
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                        {evt.isUserInduced && <span style={{ color: "var(--color-red)", fontWeight: "900", fontSize: "0.52rem" }}>[USER]</span>}
                        <span>{evt.label}</span>
                      </div>
                      <span style={{ fontSize: "0.5rem", opacity: 0.65 }}>T+{evt.timeSec}s</span>
                    </div>

                  </div>
                );
              })}

              {/* Playhead vertical bar */}
              <div style={{ 
                position: "absolute", 
                left: `${Math.min(100, (elapsedSec / 80) * 100)}%`, 
                top: 0, 
                bottom: 0, 
                width: "1.5px", 
                backgroundColor: "var(--color-cyan)", 
                boxShadow: "0 0 8px var(--color-cyan)",
                zIndex: 12,
                pointerEvents: "none"
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Right Panel: Dynamic Risk Analysis & Blackbox learning */}
      {isRightPanelExpanded && (
        <div style={{ 
          display: "flex", 
          flexDirection: "column", 
          gap: "16px", 
          position: "sticky",
          top: "16px",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto", 
          scrollbarWidth: "thin",
          minWidth: "300px"
        }}>
        
        {/* DYNAMIC RISK ANALYSIS */}
        <div className="panel" style={{ flexShrink: 0 }}>
          <div className="panel-title">
            <Sliders size={14} />
            <span>AI 동적 위협도 모니터링</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.74rem" }}>
                <span style={{ color: "var(--text-muted)" }}>사고 부상 확률 (AI 예측)</span>
                <span className="orbitron" style={{ color: getInjuryLikelihood() > 60 ? "var(--color-red)" : "var(--color-green)", fontWeight: "bold" }}>
                  {getInjuryLikelihood()}%
                </span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ 
                  width: `${getInjuryLikelihood()}%`, 
                  height: "100%", 
                  background: getInjuryLikelihood() > 60 ? "var(--color-red)" : "var(--color-green)",
                  transition: "all 0.4s ease" 
                }} />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.74rem" }}>
                <span style={{ color: "var(--text-muted)" }}>위험 반경 안전 계수</span>
                <span className="orbitron" style={{ color: "var(--color-cyan)", fontWeight: "bold" }}>
                  {Math.round((speedFactor * 5 + safetyBuffer / 10) * 10) / 10} m
                </span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ 
                  width: `${Math.min(100, (speedFactor * 5 + safetyBuffer / 10) * 10)}%`, 
                  height: "100%", 
                  background: "var(--color-cyan)",
                  transition: "all 0.4s ease" 
                }} />
              </div>
            </div>
            
            {/* Status indicators */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "rgba(255,255,255,0.015)", padding: "10px", borderRadius: "5px", border: "1px solid var(--bg-panel-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
                <span>지게차 물리적 충돌 마진:</span>
                <span style={{ color: "#fff", fontWeight: "bold" }}>+{safetyBuffer}px</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
                <span>차선 이탈 방지 오프셋:</span>
                <span style={{ color: "#fff", fontWeight: "bold" }}>15m</span>
              </div>
            </div>

          </div>
        </div>

        {/* LOGIC GRAPH FLOW */}
        <div className="panel" style={{ flex: 1, minHeight: "180px" }}>
          <div className="panel-title">
            <Cpu size={14} />
            <span>AI 영상 분석 디바이스 진단</span>
          </div>

          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "10px", 
            justifyContent: "center",
            flex: 1
          }}>
            <div style={{ padding: "8px 12px", border: "1px solid var(--bg-panel-border)", background: "rgba(255,255,255,0.01)", borderRadius: "4px", fontSize: "0.7rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>천장 탑뷰 AI 렌즈 (CAM_01)</span>
              <span className="status-badge status-green" style={{ padding: "1px 4px", fontSize: "0.55rem" }}>NOMINAL</span>
            </div>
            
            <div style={{ padding: "8px 12px", border: `1px solid ${emergency ? "var(--color-red)" : "var(--bg-panel-border)"}`, background: "rgba(255,255,255,0.01)", borderRadius: "4px", fontSize: "0.7rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>안전장비 센서 평가 (CAM_02)</span>
              <span className={`status-badge ${emergency ? "status-red" : "status-green"}`} style={{ padding: "1px 4px", fontSize: "0.55rem" }}>
                {emergency ? "ALERT" : "NOMINAL"}
              </span>
            </div>

            <div style={{ padding: "8px 12px", border: `1px solid ${fireType !== "none" ? "var(--color-red)" : "var(--bg-panel-border)"}`, background: "rgba(255,255,255,0.01)", borderRadius: "4px", fontSize: "0.7rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>열화상 가스 센서 평가 (TEMP_01)</span>
              <span className={`status-badge ${fireType !== "none" ? "status-red" : "status-green"}`} style={{ padding: "1px 4px", fontSize: "0.55rem" }}>
                {fireType !== "none" ? "ALERT" : "NOMINAL"}
              </span>
            </div>
          </div>
        </div>

        {/* WORKER SAFETY ACTIONS PANEL */}
        <div className="panel" style={{ flexShrink: 0 }}>
          <div className="panel-title">
            <User size={14} />
            <span>👷 선택 작업자 안전 조치</span>
          </div>

          {selectedWorker ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Worker status info */}
              <div style={{ 
                background: "rgba(255,255,255,0.015)", 
                padding: "10px", 
                borderRadius: "5px", 
                border: "1px solid var(--bg-panel-border)",
                fontSize: "0.7rem",
                display: "flex",
                flexDirection: "column",
                gap: "4px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>대상 작업자:</span>
                  <span style={{ color: "#fff", fontWeight: "bold" }}>{selectedWorkerName}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>안전모 상태:</span>
                  <span style={{ 
                    color: selectedWorker.hasHelmet ? "var(--color-green)" : "var(--color-red)", 
                    fontWeight: "bold" 
                  }}>
                    {selectedWorker.hasHelmet ? "착용 중" : "미착용 위반"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>신체 이상 상태:</span>
                  <span style={{ 
                    color: selectedWorker.isFallen ? "var(--color-red)" : "var(--color-green)", 
                    fontWeight: "bold" 
                  }}>
                    {selectedWorker.isFallen ? "쓰러짐 감지" : "정상"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>현재 위치 구역:</span>
                  <span style={{ 
                    color: HAZARD_ZONES.some(zone => isInsideHazardZone(selectedWorker.x, selectedWorker.y, zone)) ? "var(--color-yellow)" : "var(--color-green)", 
                    fontWeight: "bold" 
                  }}>
                    {HAZARD_ZONES.find(zone => isInsideHazardZone(selectedWorker.x, selectedWorker.y, zone))?.name || "보행자 안전 통로"}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {/* 1. 치료하기 */}
                <button
                  onClick={() => {
                    setPlayerFallen(false);
                    const wIdx = gameState.current.workers.findIndex(w => w.id === selectedWorkerId);
                    if (wIdx !== -1) gameState.current.workers[wIdx].isFallen = false;
                    addLog("safe", `📡 [원격 안전 조치] ${selectedWorkerName} 작업자를 치료 조치하여 현장에 복귀시켰습니다.`);
                    playWarningBeep(600, 0.2, 0.05);
                  }}
                  disabled={!selectedWorker.isFallen}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: selectedWorker.isFallen ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${selectedWorker.isFallen ? "var(--color-green)" : "var(--bg-panel-border)"}`,
                    color: selectedWorker.isFallen ? "var(--color-green)" : "var(--text-muted)",
                    borderRadius: "6px",
                    fontSize: "0.72rem",
                    fontWeight: "bold",
                    cursor: selectedWorker.isFallen ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.2s"
                  }}
                >
                  <Activity size={13} />
                  <span>응급 치료하기</span>
                </button>

                {/* 2. 안전모 지급 */}
                <button
                  onClick={() => {
                    setPlayerHelmet(true);
                    const wIdx = gameState.current.workers.findIndex(w => w.id === selectedWorkerId);
                    if (wIdx !== -1) gameState.current.workers[wIdx].hasHelmet = true;
                    addLog("safe", `📡 [원격 안전 조치] ${selectedWorkerName} 작업자에게 안전모를 지급하였습니다.`);
                    playWarningBeep(600, 0.2, 0.05);
                  }}
                  disabled={selectedWorker.hasHelmet}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: !selectedWorker.hasHelmet ? "rgba(245, 158, 11, 0.15)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${!selectedWorker.hasHelmet ? "var(--color-yellow)" : "var(--bg-panel-border)"}`,
                    color: !selectedWorker.hasHelmet ? "var(--color-yellow)" : "var(--text-muted)",
                    borderRadius: "6px",
                    fontSize: "0.72rem",
                    fontWeight: "bold",
                    cursor: !selectedWorker.hasHelmet ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    transition: "all 0.2s"
                  }}
                >
                  <ShieldCheck size={13} />
                  <span>안전모 원격 지급</span>
                </button>

                {/* 3. 안전 구역 대피 */}
                {(() => {
                  const isInHazard = HAZARD_ZONES.some(zone => isInsideHazardZone(selectedWorker.x, selectedWorker.y, zone));
                  return (
                    <button
                      onClick={() => {
                        const wIdx = gameState.current.workers.findIndex(w => w.id === selectedWorkerId);
                        if (wIdx !== -1) {
                          gameState.current.workers[wIdx].x = 450;
                          gameState.current.workers[wIdx].y = 150;
                        }
                        addLog("safe", `📡 [원격 안전 조치] ${selectedWorkerName} 작업자를 안전 구역으로 강제 대피시켰습니다.`);
                        playWarningBeep(600, 0.2, 0.05);
                      }}
                      disabled={!isInHazard}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: isInHazard ? "rgba(6, 182, 212, 0.15)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${isInHazard ? "var(--color-cyan)" : "var(--bg-panel-border)"}`,
                        color: isInHazard ? "var(--color-cyan)" : "var(--text-muted)",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        fontWeight: "bold",
                        cursor: isInHazard ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        transition: "all 0.2s"
                      }}
                    >
                      <Truck size={13} />
                      <span>안전 구역 강제 대피</span>
                    </button>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", textAlign: "center", padding: "10px" }}>
              선택된 작업자가 없습니다.
            </div>
          )}
        </div>

        {/* BLACKBOX LEARNING AND INTERACTIVE COEFFICIENT CORRECTION */}
        <div className="panel" style={{ height: "200px", flexShrink: 0 }}>
          <div className="panel-title">
            <Database size={14} />
            <span>Blackbox DB (자가 학습)</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
            {simulatorLogs.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100px", color: "var(--text-muted)", opacity: 0.5, textAlign: "center", fontSize: "0.68rem" }}>
                <ShieldAlert size={20} style={{ margin: "0 auto 6px" }} />
                <span>시뮬레이션 중 사고가 발생하면<br/>여기에 블랙박스 로그가 쌓입니다.</span>
              </div>
            ) : (
              simulatorLogs.map((log) => (
                <div 
                  key={log.id} 
                  style={{ 
                    padding: "8px", 
                    borderRadius: "4px", 
                    border: `1px solid ${log.isLearned ? "rgba(6,182,212,0.3)" : "rgba(244,63,94,0.3)"}`, 
                    background: "rgba(255,255,255,0.02)" 
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem", marginBottom: "4px" }}>
                    <span style={{ color: log.isLearned ? "var(--color-green)" : "var(--color-red)", fontWeight: "bold" }}>
                      {log.isLearned ? "MODEL LEARNED" : "UNLEARNED INCIDENT"}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>{log.time}</span>
                  </div>
                  <div style={{ fontSize: "0.72rem", fontWeight: "bold", color: "#fff", marginBottom: "2px" }}>{log.description}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "6px" }}>{log.details}</div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {!log.isLearned ? (
                      <button 
                        onClick={() => handleLearnLog(log.id)}
                        style={{ 
                          width: "100%", 
                          padding: "5px 0", 
                          background: "rgba(244,63,94,0.12)",
                          border: "1px solid var(--color-red)",
                          color: "var(--color-red)",
                          fontSize: "0.64rem",
                          fontWeight: "bold",
                          borderRadius: "3px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px"
                        }}
                        className="hover:bg-red-500 hover:text-white"
                      >
                        <Sparkles size={11} />
                        <span>AI 자가 피드백 모델 가중치 반영</span>
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--color-green)", fontSize: "0.65rem", fontWeight: "bold", marginBottom: "2px" }}>
                        <ShieldCheck size={12} />
                        <span>피드백 반영 완료: 가중치 조정 됨</span>
                      </div>
                    )}

                    <button 
                      onClick={() => runIncidentReport(log)}
                      disabled={generatingReport}
                      style={{ 
                        width: "100%", 
                        padding: "5px 0", 
                        background: "rgba(6,182,212,0.12)",
                        border: "1px solid var(--color-cyan)",
                        color: "var(--color-cyan)",
                        fontSize: "0.64rem",
                        fontWeight: "bold",
                        borderRadius: "3px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px"
                      }}
                      className="hover:bg-cyan-500 hover:text-white"
                    >
                      <Database size={11} className={generatingReport && reportTargetLog?.id === log.id ? "animate-spin" : ""} />
                      <span>
                        {generatingReport && reportTargetLog?.id === log.id 
                          ? "보고서 작성 중..." 
                          : "Gemini AI 사고 보고서 작성"}
                      </span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
      )}

      {/* Learning Completion Toast/Modal overlay */}
      {learningNotification && (
        <div style={{
          position: "fixed",
          top: "0",
          left: "0",
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div className="panel" style={{ width: "90%", maxWidth: "420px", padding: "24px", border: "1.5px solid var(--color-cyan)", background: "var(--bg-panel)", boxShadow: "0 0 25px rgba(6,182,212,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "10px" }}>
              <Sparkles size={18} color="var(--color-cyan)" />
              <h3 style={{ fontSize: "1rem", color: "var(--color-cyan)" }}>AI 강화 학습 피드백 성공</h3>
            </div>
            
            <p style={{ fontSize: "0.78rem", color: "var(--text-main)", whiteSpace: "pre-wrap", lineHeight: "1.5", marginBottom: "18px" }}>
              {learningNotification}
            </p>

            <button 
              className="btn btn-cyan w-full justify-center"
              onClick={() => setLearningNotification(null)}
            >
              확인 및 시뮬레이션 재진행
            </button>
          </div>
        </div>
      )}

      {/* Gemini AI Incident Report Modal overlay */}
      {showReportModal && (
        <div style={{
          position: "fixed",
          top: "0",
          left: "0",
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1050
        }}>
          <div className="panel" style={{ 
            width: "90%", 
            maxWidth: "680px", 
            height: "80vh",
            maxHeight: "700px",
            padding: "24px", 
            border: "1.5px solid var(--color-cyan)", 
            background: "var(--bg-panel)", 
            boxShadow: "0 0 35px rgba(6,182,212,0.25)",
            display: "flex",
            flexDirection: "column"
          }}>
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between", 
              marginBottom: "14px", 
              borderBottom: "1px solid rgba(255,255,255,0.08)", 
              paddingBottom: "10px" 
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Database size={18} color="var(--color-cyan)" />
                <h3 style={{ fontSize: "1.05rem", color: "var(--color-cyan)", fontWeight: "bold" }}>
                  Gemini AI 산업재해 조사보고서 초안
                </h3>
              </div>
              <span className="orbitron" style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
                ID: {reportTargetLog?.id || "N/A"}
              </span>
            </div>
            
            {/* Scrollable Report Content */}
            <div style={{ 
              flex: 1, 
              overflowY: "auto", 
              background: "rgba(0, 0, 0, 0.4)", 
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: "6px",
              padding: "16px",
              fontSize: "0.78rem",
              lineHeight: "1.6",
              color: "#e2e8f0",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              marginBottom: "18px"
            }}>
              {activeReport}
            </div>

            {/* Modal Controls */}
            <div style={{ display: "flex", gap: "12px" }}>
              <button 
                className="btn btn-cyan"
                style={{ flex: 1, justifyContent: "center", padding: "10px 0", fontWeight: "bold" }}
                onClick={downloadReportFile}
              >
                다운로드 (.md 파일 저장)
              </button>
              <button 
                className="btn"
                style={{ 
                  flex: 1, 
                  justifyContent: "center", 
                  padding: "10px 0", 
                  background: "rgba(255,255,255,0.03)", 
                  border: "1px solid var(--bg-panel-border)", 
                  color: "#fff",
                  fontWeight: "bold" 
                }}
                onClick={() => setShowReportModal(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
