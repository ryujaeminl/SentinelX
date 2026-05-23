"use client";

import React, { useState, useEffect } from "react";
import FactorySimulator from "./components/FactorySimulator";
import DetailModal from "./components/DetailModal";
import { supabase } from "./lib/supabase";
import {
  ShieldAlert,
  Activity,
  Thermometer,
  Camera,
  Video,
  AlertTriangle,
  Power,
  Clock,
  Wifi,
  Download,
  TrendingUp,
  BarChart2,
  FileText,
  Settings,
  UserCheck,
  ShieldCheck,
  Play,
  RotateCcw,
  Truck,
  User,
  Layout,
  Eye,
  Sliders,
  Bell,
  Cpu,
  Database,
  Menu
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

// Mock Data for Charts
const initialTempData = Array.from({ length: 20 }, (_, i) => ({
  time: `16:${i < 10 ? "0" + i : i}`,
  temp: 24 + Math.random() * 4
}));

const proximityData = [
  { name: "10s", val: 5 },
  { name: "20s", val: 8 },
  { name: "30s", val: 12 },
  { name: "40s", val: 10 },
  { name: "50s", val: 6 },
  { name: "60s", val: 3.5 }
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("command"); // command | scenarios | assets | logs | admin
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [manualEStop, setManualEStop] = useState(false);

  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<{temp: number, condition: string} | null>(null);

  // Fetch real-time weather
  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=37.566&longitude=126.9784&current_weather=true");
        const data = await res.json();
        if (data && data.current_weather) {
          const wcode = data.current_weather.weathercode;
          let condition = "Clear";
          if (wcode >= 1 && wcode <= 3) condition = "Partly Cloudy";
          else if (wcode >= 45 && wcode <= 48) condition = "Foggy";
          else if (wcode >= 51 && wcode <= 67) condition = "Rainy";
          else if (wcode >= 71 && wcode <= 77) condition = "Snowy";
          else if (wcode >= 80 && wcode <= 82) condition = "Showers";
          else if (wcode >= 95) condition = "Thunderstorm";

          setWeatherData({
            temp: data.current_weather.temperature,
            condition: condition
          });
        }
      } catch (e) {
        console.error("Failed to fetch weather", e);
      }
    }
    fetchWeather();
    const timer = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleEStop = () => {
    const newState = !manualEStop;
    setManualEStop(newState);
    if (newState) {
      setEmergency(true);
    }
  };
  const [blink, setBlink] = useState(false);
  const [logs, setLogs] = useState([
    { id: 1, type: "danger", msg: "자동 브레이크 작동 - 지게차 02", time: "16:45:12" },
    { id: 2, type: "danger", msg: "작업자 쓰러짐 감지 (구역 C)", time: "16:45:10" },
    { id: 3, type: "warning", msg: "지게차 접근 위험 반경 생성", time: "16:44:55" },
    { id: 4, type: "warning", msg: "작업자 안전모 미착용 감지", time: "16:42:10" },
    { id: 5, type: "danger", msg: "열화상 이상 온도 감지 (65°C)", time: "16:41:00" },
    { id: 6, type: "safe", msg: "구역 A 점검 완료", time: "16:35:00" }
  ]);
  const [tempData, setTempData] = useState(initialTempData);

  // Admin settings for dynamic danger radius calculation
  const [speedFactor, setSpeedFactor] = useState(1.2);
  const [turningRadius, setTurningRadius] = useState(5);
  const [payloadWeight, setPayloadWeight] = useState(1.5); // Tons

  // Selected AGV index in Asset Health tab
  const [selectedAgv, setSelectedAgv] = useState("AGV-014");

  // Calculated dynamic danger radius (meters) based on admin sliders
  const calculatedRadius = Math.round((5 * speedFactor + turningRadius + payloadWeight * 2) * 10) / 10;

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString("ko-KR", { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Simulating live telemetry updates
  useEffect(() => {
    if (activeTab !== "command" || emergency) return;

    const interval = setInterval(() => {
      setTempData((prev) => {
        const nextTime = new Date();
        const timeStr = nextTime.toLocaleTimeString("ko-KR", { hour12: false }).substring(0, 5);
        const lastTemp = prev[prev.length - 1].temp;
        const change = (Math.random() - 0.45) * 1.5;
        const newTemp = Math.max(20, Math.min(80, lastTemp + change));

        if (newTemp > 35 && Math.random() > 0.8) {
          const logTime = nextTime.toLocaleTimeString("ko-KR", { hour12: false });
          setLogs((l) => [
            { id: Date.now(), type: "warning", msg: `열화상 센서 국소 온도 상승 감지 (${Math.round(newTemp * 10) / 10}°C)`, time: logTime },
            ...l.slice(0, 9)
          ]);
        }

        return [...prev.slice(1), { time: timeStr, temp: newTemp }];
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTab, emergency]);

  // Handle emergency blinks & Speech warnings
  useEffect(() => {
    let blinkTimer: NodeJS.Timeout;
    if (emergency) {
      blinkTimer = setInterval(() => {
        setBlink((prev) => !prev);
      }, 500);

      if (typeof window !== "undefined" && window.speechSynthesis) {
        const speak = () => {
          const utterance = new SpeechSynthesisUtterance("경고! 3단계 자동 제어 개입. 안전 구역 침입으로 지게차 비상 제동이 수행됩니다.");
          utterance.lang = "ko-KR";
          window.speechSynthesis.speak(utterance);
        };
        speak();
      }
    } else {
      setBlink(false);
    }
    return () => clearInterval(blinkTimer);
  }, [emergency]);

  return (
    <div className={`dashboard-container ${emergency ? "emergency-active" : ""}`}>
      <DetailModal
        selectedDetail={selectedDetail}
        onClose={() => setSelectedDetail(null)}
        logs={logs}
        tempData={tempData}
        emergency={emergency}
        weatherData={weatherData}
      />
      {/* SIDEBAR NAVIGATION */}
      <aside className={`sidebar ${isSidebarOpen ? "" : "sidebar-closed"}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Cpu size={24} className="text-cyan-400" />
            <span>SentinelX</span>
          </div>
          <div className="sidebar-status">
            <span className="sidebar-status-dot"></span>
            <span>SYSTEM STATUS ACTIVE (v3.2.0-STABLE)</span>
          </div>
        </div>

        <nav className="sidebar-menu">
          <button
            className={`sidebar-item ${activeTab === "command" ? "active" : ""}`}
            onClick={() => setActiveTab("command")}
          >
            <Layout size={18} />
            <span>Command Center</span>
          </button>
          <button
            className={`sidebar-item ${activeTab === "scenarios" ? "active" : ""}`}
            onClick={() => setActiveTab("scenarios")}
          >
            <Play size={18} />
            <span>Scenarios (Simulator)</span>
          </button>
          <button
            className={`sidebar-item ${activeTab === "assets" ? "active" : ""}`}
            onClick={() => setActiveTab("assets")}
          >
            <Truck size={18} />
            <span>Asset Health</span>
          </button>
          <button
            className={`sidebar-item ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => setActiveTab("logs")}
          >
            <FileText size={18} />
            <span>Safety Logs / Report</span>
          </button>
          <button
            className={`sidebar-item ${activeTab === "admin" ? "active" : ""}`}
            onClick={() => setActiveTab("admin")}
          >
            <Sliders size={18} />
            <span>System Tools</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-btn">
            <User size={14} />
            <span>Operator: Admin_07</span>
          </div>
          
          <button
            className="btn btn-danger w-full justify-center"
            style={{ fontWeight: "bold", gap: "8px", border: "1px solid var(--color-red)" }}
            onClick={toggleEStop}
          >
            <Power size={14} />
            <span>{manualEStop ? "EMERGENCY RESET" : "EMERGENCY SHUTDOWN"}</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="main-content">
        {/* HEADER BAR */}
        <header className="main-header">
          <div className="main-header-title">
            <button className="btn btn-cyan" style={{ padding: "4px 6px", marginRight: "10px" }} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <Menu size={16} />
            </button>
            <span className="text-muted">CONTROL CENTER //</span>
            <span style={{ textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
              {activeTab === "command" && "COMMAND CENTER (Sector 7G)"}
              {activeTab === "scenarios" && "AI Safety Simulation Engine v4.2"}
              {activeTab === "assets" && "AGV Fleet Telemetry & Live Cameras"}
              {activeTab === "logs" && "Daily Analysis & Incident Reports"}
              {activeTab === "admin" && "AI Risk Calculation Weights Config"}
            </span>
          </div>

          <div className="main-header-actions">
            {supabase ? (
              <div className="status-badge status-green" style={{ gap: "6px", boxShadow: "0 0 10px rgba(16,185,129,0.2)" }}>
                <Database size={12} style={{ color: "var(--color-green)" }} />
                <span>DB CONNECTED</span>
              </div>
            ) : (
              <div className="status-badge status-red" style={{ gap: "6px" }}>
                <Database size={12} style={{ color: "var(--color-red)" }} />
                <span>DB OFFLINE</span>
              </div>
            )}

            <div className="status-badge status-green" style={{ gap: "6px" }}>
              <Wifi size={12} />
              <span>CONNECTED</span>
            </div>
            
            <div style={{ display: "flex", gap: "6px", alignItems: "center", fontFamily: "var(--font-orbitron)", color: "var(--color-cyan)", fontSize: "0.9rem" }}>
              <Clock size={14} />
              <span>{currentTime}</span>
            </div>

            <button className="btn" style={{ padding: "6px 8px" }}>
              <Bell size={14} />
            </button>
          </div>
        </header>

        {/* 1. COMMAND CENTER (d_3.png) */}
        {activeTab === "command" && (
          <div className="monitor-grid">
            {/* Left: AI Risk Prediction & Log Alerts */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", minHeight: "600px" }}>
              <div className="panel hover-panel" style={{ flexShrink: 0, cursor: "pointer" }} onClick={() => setSelectedDetail("risk")}>
                <div className="panel-title">
                  <Activity size={14} />
                  <span>AI Risk Prediction</span>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", position: "relative" }}>
                  {/* Neon Ring Gauge */}
                  <svg width="140" height="140" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="6" />
                    <circle 
                      cx="50" 
                      cy="50" 
                      r="40" 
                      fill="none" 
                      stroke={emergency ? "var(--color-red)" : "var(--color-yellow)"} 
                      strokeWidth="6" 
                      strokeDasharray="251.2" 
                      strokeDashoffset={251.2 - (251.2 * (emergency ? 94.8 : 88)) / 100}
                      strokeLinecap="round"
                      style={{
                        transform: "rotate(-90deg)",
                        transformOrigin: "50px 50px",
                        filter: `drop-shadow(0 0 8px ${emergency ? "var(--color-red)" : "var(--color-yellow)"})`,
                        transition: "stroke-dashoffset 0.5s ease"
                      }}
                    />
                    <text 
                      x="50" 
                      y="48" 
                      fill="#fff" 
                      textAnchor="middle" 
                      className="orbitron" 
                      style={{ fontSize: "1.4rem", fontWeight: "bold" }}
                    >
                      {emergency ? "94.8" : "88"}
                    </text>
                    <text 
                      x="50" 
                      y="64" 
                      fill="var(--text-muted)" 
                      textAnchor="middle" 
                      style={{ fontSize: "0.55rem", letterSpacing: "0.15em", textTransform: "uppercase" }}
                    >
                      Risk Index
                    </text>
                  </svg>
                  
                  <div style={{ textAlign: "center", marginTop: "12px" }}>
                    <div style={{ color: emergency ? "var(--color-red)" : "var(--color-yellow)", fontWeight: "bold", fontSize: "0.85rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                      {emergency ? "CRITICAL THREAT SHUTDOWN" : "ELEVATED RISK LEVEL"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel hover-panel" style={{ flex: 1, cursor: "pointer" }} onClick={() => setSelectedDetail("logs")}>
                <div className="panel-title">
                  <ShieldAlert size={14} />
                  <span>Real-Time Logs / Events</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
                  {emergency && (
                    <div className="card-item" style={{ borderColor: "var(--color-red)", background: "rgba(244, 63, 94, 0.05)", borderLeft: "4px solid var(--color-red)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--color-red)", fontWeight: 700, marginBottom: "4px" }}>
                        <span>SYSTEM EMERGENCY SHUTDOWN</span>
                        <span>16:45:12</span>
                      </div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>작업자 쓰러짐 및 지게차 02 비상 차단 작동</div>
                    </div>
                  )}
                  {logs.map((log) => (
                    <div 
                      key={log.id} 
                      className="card-item"
                      style={{ 
                        borderLeft: `3px solid ${log.type === "danger" ? "var(--color-red)" : log.type === "warning" ? "var(--color-yellow)" : "var(--color-green)"}`,
                        opacity: emergency && log.type !== "danger" ? 0.6 : 1
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: log.type === "danger" ? "var(--color-red)" : log.type === "warning" ? "var(--color-yellow)" : "var(--color-green)" }}>
                          {log.type.toUpperCase()}
                        </span>
                        <span>{log.time}</span>
                      </div>
                      <div style={{ fontSize: "0.76rem" }}>{log.msg}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Center: Live Twin Flat/3D Map View (d_3.png center) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="panel hover-panel" style={{ flex: 1, padding: 0, overflow: "hidden", border: `1px solid ${emergency ? "var(--color-red)" : "var(--bg-panel-border)"}`, cursor: "pointer" }} onClick={() => setSelectedDetail("map")}>
                {/* Visual Header */}
                <div style={{ position: "absolute", top: "16px", left: "16px", zIndex: 30, display: "flex", gap: "10px", alignItems: "center" }}>
                  <span className="sidebar-status-dot"></span>
                  <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-orbitron)", letterSpacing: "0.08em", fontWeight: "bold" }}>• LIVE TWIN MAP</span>
                </div>

                <div className="scan-line" />

                {/* Main 3D Twin image from design/t_0.png */}
                <div style={{ flex: 1, width: "100%", minHeight: "450px", position: "relative", overflow: "hidden", background: "#020409" }}>
                  <img 
                    src="/design/t_0.png" 
                    alt="Digital Twin Map" 
                    style={{ 
                      width: "100%", 
                      height: "100%", 
                      objectFit: "cover", 
                      opacity: emergency ? 0.45 : 0.75,
                      filter: emergency ? "hue-rotate(-40deg) saturate(1.5)" : "none",
                      transition: "all 0.5s ease" 
                    }} 
                  />

                  {/* Absolute Overlays to tie image to live states */}
                  {/* Glowing Safe Volume Box overlay */}
                  <div style={{ 
                    position: "absolute", 
                    top: "35%", 
                    left: "25%", 
                    width: "25%", 
                    height: "18%", 
                    border: "2px solid var(--color-cyan)", 
                    boxShadow: "0 0 15px rgba(6,182,212,0.3), inset 0 0 10px rgba(6,182,212,0.2)",
                    background: "rgba(6,182,212,0.05)",
                    transform: "rotate(-10deg) skewX(-15deg)",
                    pointerEvents: "none"
                  }}>
                    <span style={{ position: "absolute", top: "-15px", left: "2px", fontSize: "0.6rem", background: "var(--color-cyan)", color: "#000", padding: "1px 4px", fontWeight: "bold" }}>
                      SEC-A NOMINAL
                    </span>
                  </div>

                  {/* Glowing Incident Hazard Volume Box overlay */}
                  <div style={{ 
                    position: "absolute", 
                    top: "58%", 
                    left: "62%", 
                    width: "24%", 
                    height: "22%", 
                    border: `2px solid ${emergency ? "var(--color-red)" : "var(--color-yellow)"}`, 
                    boxShadow: `0 0 20px ${emergency ? "var(--glow-red)" : "var(--glow-yellow)"}, inset 0 0 15px ${emergency ? "rgba(244,63,94,0.2)" : "rgba(245,158,11,0.15)"}`,
                    background: emergency ? "rgba(244,63,94,0.1)" : "rgba(245,158,11,0.05)",
                    transform: "rotate(-10deg) skewX(-15deg)",
                    pointerEvents: "none",
                    animation: emergency ? "pulse-border 1s infinite" : "none"
                  }}>
                    <span style={{ position: "absolute", top: "-15px", left: "2px", fontSize: "0.6rem", background: emergency ? "var(--color-red)" : "var(--color-yellow)", color: "#fff", padding: "1px 4px", fontWeight: "bold" }}>
                      {emergency ? "CRITICAL BREACH" : "SEC-C DANGER ZONE"}
                    </span>
                  </div>

                  {/* Active AGV moving tracker node */}
                  <div style={{ 
                    position: "absolute", 
                    top: "52%", 
                    left: "40%", 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "8px",
                    transform: "translate(-50%, -50%)"
                  }}>
                    <span className="sidebar-status-dot" style={{ backgroundColor: "var(--color-cyan)", boxShadow: "0 0 10px var(--color-cyan)", width: "10px", height: "10px" }}></span>
                    <span style={{ fontSize: "0.65rem", background: "rgba(0,0,0,0.85)", border: "1px solid var(--color-cyan)", color: "var(--color-cyan)", padding: "2px 6px", borderRadius: "3px", whiteSpace: "nowrap" }}>
                      AGV-014 (1.2m/s)
                    </span>
                  </div>

                  {/* Emergency Alarm Banner inside Live twin */}
                  {emergency && (
                    <div style={{ 
                      position: "absolute", 
                      top: "50%", 
                      left: "50%", 
                      transform: "translate(-50%, -50%)",
                      background: "rgba(0,0,0,0.85)",
                      border: "2.5px solid var(--color-red)",
                      padding: "16px 24px",
                      borderRadius: "8px",
                      textAlign: "center",
                      boxShadow: "0 0 30px rgba(0,0,0,0.8), 0 0 15px var(--glow-red)",
                      zIndex: 40,
                      maxWidth: "85%",
                      animation: "pulse-border 1.5s infinite"
                    }}>
                      <AlertTriangle color="var(--color-red)" size={32} style={{ margin: "0 auto 8px" }} />
                      <div style={{ color: "#fff", fontWeight: "bold", fontSize: "0.95rem", marginBottom: "4px" }}>
                        비상 원격 강제 셧다운 실행됨
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                        C구역 충돌 위험 감지 및 시스템 4단계 자동 정지 프로토콜 작동 완료
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom equipment cards (d_3.png bottom row) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", flexShrink: 0 }}>
                <div className="panel hover-panel" style={{ padding: "12px 16px", cursor: "pointer" }} onClick={() => setSelectedDetail("equipment")}>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>AGV FLEET A</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: "bold" }}>FLEET SEC_A</span>
                    <span className={`status-badge ${emergency ? "status-red" : "status-green"}`}>
                      {emergency ? "HALTED" : "NOMINAL"}
                    </span>
                  </div>
                </div>
                
                <div className="panel hover-panel" style={{ padding: "12px 16px", cursor: "pointer" }} onClick={() => setSelectedDetail("equipment")}>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>ROBOTIC ARM 3</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: "bold" }}>ASSY_ARM_33</span>
                    <span className={`status-badge ${emergency ? "status-red" : "status-green"}`}>
                      {emergency ? "HALTED" : "NOMINAL"}
                    </span>
                  </div>
                </div>

                <div className="panel hover-panel" style={{ padding: "12px 16px", cursor: "pointer" }} onClick={() => setSelectedDetail("equipment")}>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>GANTRY CRANE</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: "bold" }}>LOAD_CRANE_0</span>
                    <span className="status-badge status-red">HALTED</span>
                  </div>
                </div>

                <div className="panel hover-panel" style={{ padding: "12px 16px", cursor: "pointer" }} onClick={() => setSelectedDetail("equipment")}>
                  <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>MAIN CONVEYOR</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: "bold" }}>CONV_MAIN_LN</span>
                    <span className={`status-badge ${emergency ? "status-red" : "status-yellow"}`}>
                      {emergency ? "HALTED" : "WARNING"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: AI Vision Matrix (d_3.png right & t_3.png) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="panel hover-panel" style={{ flex: 1, padding: "14px", cursor: "pointer" }} onClick={() => setSelectedDetail("vision")}>
                <div className="panel-title">
                  <Camera size={14} />
                  <span>AI Vision Matrix</span>
                </div>

                {/* CCTV grid from public/design/t_3.png */}
                <div style={{ 
                  flex: 1, 
                  position: "relative", 
                  borderRadius: "6px", 
                  overflow: "hidden", 
                  border: "1px solid var(--bg-panel-border)",
                  background: "#010102",
                  minHeight: "250px"
                }}>
                  <img 
                    src="/design/t_3.png" 
                    alt="AI Camera Grid Feed" 
                    style={{ 
                      width: "100%", 
                      height: "100%", 
                      objectFit: "cover",
                      opacity: 0.85,
                      filter: emergency ? "hue-rotate(-20deg) contrast(1.2)" : "none"
                    }}
                  />
                  
                  {/* Scanning AI overlay on top of CCTV grid image */}
                  {/* CAM-01 (Top-Left) Bounding box */}
                  <div style={{ 
                    position: "absolute", 
                    top: "12%", 
                    left: "14%", 
                    width: "10%", 
                    height: "22%", 
                    border: "1.5px solid var(--color-green)",
                    boxShadow: "0 0 8px var(--glow-green)"
                  }}>
                    <span style={{ position: "absolute", top: "-12px", left: "-1px", fontSize: "0.45rem", background: "var(--color-green)", color: "#000", padding: "0 2px", fontWeight: "bold" }}>
                      WORKER
                    </span>
                  </div>

                  {/* CAM-02 (Top-Right Thermal) Alert box */}
                  <div style={{ 
                    position: "absolute", 
                    top: "22%", 
                    left: "70%", 
                    width: "12%", 
                    height: "24%", 
                    border: `1.5px solid ${emergency ? "var(--color-red)" : "var(--color-yellow)"}`,
                    boxShadow: `0 0 10px ${emergency ? "var(--glow-red)" : "var(--glow-yellow)"}`,
                    animation: "pulse-border 1.5s infinite"
                  }}>
                    <span style={{ position: "absolute", top: "-12px", left: "-1px", fontSize: "0.45rem", background: emergency ? "var(--color-red)" : "var(--color-yellow)", color: "#fff", padding: "0 2px", fontWeight: "bold" }}>
                      {emergency ? "FIRE DETECTED" : "UNAUTHORIZED"}
                    </span>
                  </div>

                  {/* CAM-03 (Bottom-Left) Alert helmet box */}
                  <div style={{ 
                    position: "absolute", 
                    top: "60%", 
                    left: "30%", 
                    width: "8%", 
                    height: "24%", 
                    border: "1.5px solid var(--color-red)",
                    boxShadow: "0 0 8px var(--glow-red)"
                  }}>
                    <span style={{ position: "absolute", top: "-12px", left: "-1px", fontSize: "0.45rem", background: "var(--color-red)", color: "#fff", padding: "0 2px", fontWeight: "bold" }}>
                      NO HELMET
                    </span>
                  </div>

                  {/* Active Recording blinking dot overlay */}
                  <div style={{ position: "absolute", top: "8px", right: "8px", background: "rgba(0,0,0,0.65)", padding: "3px 8px", borderRadius: "4px", display: "flex", alignItems: "center", gap: "6px", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <span style={{ width: "6px", height: "6px", backgroundColor: "var(--color-red)", borderRadius: "50%", animation: "pulse-border 1s infinite" }}></span>
                    <span style={{ fontSize: "0.55rem", fontWeight: "bold", color: "#fff", letterSpacing: "0.05em" }}>REC</span>
                  </div>
                </div>
              </div>

              {/* Thermal sensor tracker timeline */}
              <div className="panel hover-panel" style={{ height: "180px", flexShrink: 0, cursor: "pointer" }} onClick={() => setSelectedDetail("thermal")}>
                <div className="panel-title">
                  <Thermometer size={14} />
                  <span>Outside Temp & Thermal Trend</span>
                </div>
                <div style={{ position: "absolute", top: "14px", right: "14px", fontSize: "0.85rem", color: "var(--color-cyan)", fontWeight: "bold", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>Outside:</span>
                  <span className="orbitron">{weatherData ? `${weatherData.temp}°C` : "--"}</span>
                </div>
                <div style={{ flex: 1, minHeight: "100px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tempData.slice(-10)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={9} tickLine={false} />
                      <YAxis stroke="var(--text-muted)" fontSize={9} domain={[15, 80]} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "#0b1224", border: "1px solid var(--bg-panel-border)", fontSize: "0.75rem" }} />
                      <Bar dataKey="temp" fill="var(--color-cyan)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. SCENARIOS SIMULATOR (d_1.png / d_2.png) */}
        {activeTab === "scenarios" && (
          <div style={{ flex: 1, minHeight: "100%", overflowY: "visible" }}>
            <FactorySimulator 
              emergency={emergency}
              setEmergency={setEmergency}
              manualEStop={manualEStop}
              logs={logs}
              setLogs={setLogs}
              speedFactor={speedFactor}
              setSpeedFactor={setSpeedFactor}
              turningRadius={turningRadius}
              setTurningRadius={setTurningRadius}
              payloadWeight={payloadWeight}
              setPayloadWeight={setPayloadWeight}
              tempData={tempData}
              setTempData={setTempData}
            />
          </div>
        )}

        {/* 3. ASSET HEALTH (d_0.png) */}
        {activeTab === "assets" && (
          <div className="monitor-grid">
            {/* Left Column: AGV Fleet list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="panel" style={{ flex: 1 }}>
                <div className="panel-title">
                  <Truck size={14} />
                  <span>AGV Fleet</span>
                  <span className="status status-green" style={{ background: "rgba(16,185,129,0.1)", color: "var(--color-green)" }}>12 Active</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto", flex: 1 }}>
                  {[
                    { id: "AGV-014", sec: "SEC: ALPHA", bat: 82, status: "safe", state: "NOMINAL" },
                    { id: "AGV-015", sec: "SEC: BETA", bat: 45, status: "warning", state: "CAUTION" },
                    { id: "AGV-008", sec: "BASE STAT", bat: 10, status: "warning", state: "CHARGING" },
                    { id: "AGV-022", sec: "SEC: GAMMA", bat: 95, status: "danger", state: "MAINT REQ" }
                  ].map((agv) => (
                    <div 
                      key={agv.id}
                      className="card-item"
                      onClick={() => setSelectedAgv(agv.id)}
                      style={{ 
                        cursor: "pointer", 
                        borderColor: selectedAgv === agv.id ? "var(--color-cyan)" : "var(--bg-panel-border)",
                        background: selectedAgv === agv.id ? "rgba(6,182,212,0.05)" : "rgba(255,255,255,0.01)"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: "bold", fontSize: "0.85rem", color: selectedAgv === agv.id ? "var(--color-cyan)" : "#fff" }}>
                          {agv.id}
                        </span>
                        <span className={`status-badge ${
                          agv.status === "safe" ? "status-green" : agv.status === "warning" ? "status-yellow" : "status-red"
                        }`}>
                          {agv.state}
                        </span>
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "8px" }}>
                        <span>{agv.sec}</span>
                        <span>BATT: {agv.bat}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Center Column: On-board Tablet display (t_1.png) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="panel" style={{ flex: 1, padding: "14px" }}>
                <div className="panel-title">
                  <Video size={14} />
                  <span>On-Board Telemetry Cameras</span>
                </div>

                {/* Tablet Frame wrapping t_1.png */}
                <div style={{ 
                  flex: 1, 
                  position: "relative", 
                  borderRadius: "8px", 
                  overflow: "hidden", 
                  border: "4px solid #111827",
                  background: "#080b11"
                }}>
                  <img 
                    src="/design/t_1.png" 
                    alt="AGV On-Board Display Feed" 
                    style={{ 
                      width: "100%", 
                      height: "100%", 
                      objectFit: "cover",
                      opacity: 0.9
                    }}
                  />
                  
                  {/* Bounding bracket overlays for tablet view */}
                  <div style={{ 
                    position: "absolute", 
                    top: "22%", 
                    left: "38%", 
                    width: "8%", 
                    height: "18%", 
                    border: "1.5px solid var(--color-red)",
                    boxShadow: "0 0 10px var(--glow-red)"
                  }}>
                    <span style={{ position: "absolute", top: "-12px", left: "-1px", fontSize: "0.45rem", background: "var(--color-red)", color: "#fff", padding: "0 2px", fontWeight: "bold" }}>
                      OBSTACLE
                    </span>
                  </div>
                </div>

                {/* Telemetry quick stats */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginTop: "14px" }}>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "5px", border: "1px solid var(--bg-panel-border)", textAlign: "center" }}>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase" }}>SPEED</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--color-cyan)", marginTop: "4px", fontFamily: "var(--font-orbitron)" }}>1.2 m/s</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "5px", border: "1px solid var(--bg-panel-border)", textAlign: "center" }}>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase" }}>LOAD</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--color-yellow)", marginTop: "4px", fontFamily: "var(--font-orbitron)" }}>450 kg</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "5px", border: "1px solid var(--bg-panel-border)", textAlign: "center" }}>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase" }}>BATTERY</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--color-green)", marginTop: "4px", fontFamily: "var(--font-orbitron)" }}>82%</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "5px", border: "1px solid var(--bg-panel-border)", textAlign: "center" }}>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase" }}>PROXIMITY</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--color-red)", marginTop: "4px", fontFamily: "var(--font-orbitron)" }}>3.5 m</div>
                  </div>
                </div>
              </div>

              {/* Proximity chart */}
              <div className="panel" style={{ height: "160px", flexShrink: 0 }}>
                <div className="panel-title">
                  <Activity size={14} />
                  <span>Proximity History (60s)</span>
                </div>
                <div style={{ flex: 1, minHeight: "80px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={proximityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={9} tickLine={false} />
                      <YAxis stroke="var(--text-muted)" fontSize={9} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: "#0b1224", border: "1px solid var(--bg-panel-border)" }} />
                      <Bar dataKey="val" fill="var(--color-cyan)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Right Column: Override panel (d_0.png right) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="panel">
                <div className="panel-title">
                  <ShieldAlert size={14} />
                  <span>Restricted Override</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "10px 0" }}>
                  {/* Huge Circular E-STOP Button */}
                  <button 
                    onClick={toggleEStop}
                    style={{ 
                      width: "100%", 
                      height: "70px", 
                      backgroundColor: "rgba(244,63,94,0.15)",
                      border: "2px solid var(--color-red)",
                      color: "var(--color-red)",
                      borderRadius: "6px",
                      fontWeight: "bold",
                      fontSize: "1.2rem",
                      cursor: "pointer",
                      fontFamily: "var(--font-orbitron)",
                      letterSpacing: "0.1em",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      boxShadow: "0 0 15px rgba(244,63,94,0.15)",
                      transition: "all 0.2s"
                    }}
                    className="hover:scale-95 active:scale-90"
                  >
                    <Power size={20} />
                    <span>E-STOP</span>
                  </button>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "4px" }}>
                    <button className="btn hover:border-cyan-500" style={{ justifyContent: "center" }}>
                      RTB (Base)
                    </button>
                    <button className="btn hover:border-cyan-500" style={{ justifyContent: "center" }}>
                      MAN DRV
                    </button>
                  </div>
                </div>
              </div>

              <div className="panel" style={{ flex: 1 }}>
                <div className="panel-title">
                  <Sliders size={14} />
                  <span>Asset Details</span>
                </div>

                <div style={{ overflowX: "auto", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {[
                        { label: "MODEL", val: "OMNI-LIFT V4" },
                        { label: "FW VER", val: "3.1.4-rc2" },
                        { label: "LAST MAINT", val: "2026-04-20" },
                        { label: "UPTIME", val: "14d 08h 22m" },
                        { label: "OPERATOR", val: "AUTO_AI" }
                      ].map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                          <td style={{ padding: "8px 0", fontWeight: 600 }}>{row.label}</td>
                          <td style={{ padding: "8px 0", textAlign: "right", color: "var(--text-main)", fontWeight: "mono" }}>{row.val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. SAFETY LOGS & DAILY REPORT */}
        {activeTab === "logs" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", height: "calc(100vh - 60px)", padding: "16px", gap: "16px" }}>
            {/* Left: Detailed incident report document (PDF preview style) */}
            <div className="panel" style={{ overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "12px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "1.1rem", color: "var(--color-cyan)" }}>🛡️ 일일 안전 관제 분석 리포트</h3>
                  <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>생성 일시: 2026-05-22 | AEGIS 종합 진단 완료</p>
                </div>
                <button className="btn btn-cyan">
                  <Download size={12} />
                  <span>PDF 다운로드</span>
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "0.8rem", lineHeight: "1.5" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                  <div style={{ padding: "12px", background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "4px" }}>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>종합 안전 등급</div>
                    <div className="orbitron" style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--color-green)", marginTop: "4px" }}>A-</div>
                  </div>
                  <div style={{ padding: "12px", background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "4px" }}>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>주요 감지 이벤트</div>
                    <div className="orbitron" style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--color-yellow)", marginTop: "4px" }}>6건</div>
                  </div>
                  <div style={{ padding: "12px", background: "rgba(244,63,94,0.04)", border: "1px solid rgba(244,63,94,0.15)", borderRadius: "4px" }}>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>AI 사고 예방율</div>
                    <div className="orbitron" style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--color-red)", marginTop: "4px" }}>100%</div>
                  </div>
                </div>

                <div>
                  <h4 style={{ color: "var(--color-cyan)", marginBottom: "6px", fontSize: "0.85rem" }}>■ 안전 분석 종합 의견</h4>
                  <p style={{ color: "var(--text-main)" }}>
                    금일 10시 45분경 C구역에서 발생한 작업자 쓰러짐 및 지게차 02의 비상 정지 사태는 대시보드 및 지게차 텔레메트리 연동 시스템에 의해 안전 반경 15m 내에서 단계적으로 대응이 정상 작동했습니다. 1차 화면 점멸, 2차 스피커 음성 사이렌이 송출되었으며, 3차 감속 및 최종 자동 제어(브레이크 작동)를 통해 부딪치기 전 장비를 정지시켜 인명 사고를 미연에 방지하였습니다. 향후 C구역 통행 통제 및 작업자 안전 장비 착용 여부를 더욱 면밀히 상시 모니터링해야 합니다.
                  </p>
                </div>

                <div>
                  <h4 style={{ color: "var(--color-cyan)", marginBottom: "6px", fontSize: "0.85rem" }}>■ 특이 사항 및 조치 사항</h4>
                  <ul style={{ color: "var(--text-muted)", paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "4px", listStyleType: "none" }}>
                    <li>• <strong>10:41</strong> : C구역 열화상 센서의 일시적인 이상 온도 감지 (65°C) → 냉각기 긴급 체크 및 정상 가동 조치.</li>
                    <li>• <strong>10:42</strong> : 안전모 미착용 작업자 AI 카메라 감지 → 대시보드 경보 및 작업장 내 음성 안내로 보완 조치.</li>
                    <li>• <strong>10:45</strong> : 지게차 02 접근 경보 및 비상 제동 제어 개입 완료.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Right: Comprehensive safety log filter list */}
            <div className="panel" style={{ overflowY: "auto" }}>
              <div className="panel-title">
                <ShieldAlert size={14} />
                <span>Archive Safety Logs (Recent 30 Days)</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
                {logs.map((log, idx) => (
                  <div key={idx} className="card-item" style={{ borderLeft: `3px solid ${log.type === "danger" ? "var(--color-red)" : log.type === "warning" ? "var(--color-yellow)" : "var(--color-green)"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "4px" }}>
                      <span style={{ fontWeight: "bold", color: log.type === "danger" ? "var(--color-red)" : "var(--color-yellow)" }}>
                        {log.type.toUpperCase()}
                      </span>
                      <span>2026-05-22 {log.time}</span>
                    </div>
                    <div style={{ fontSize: "0.78rem" }}>{log.msg}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 5. SYSTEM TOOLS (ADMIN SETTINGS) */}
        {activeTab === "admin" && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "calc(100vh - 60px)", padding: "16px" }}>
            <div className="panel" style={{ width: "100%", maxWidth: "600px", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "12px" }}>
                <UserCheck size={18} color="var(--color-cyan)" />
                <h3 style={{ fontSize: "1rem", color: "var(--color-cyan)" }}>AI 위험 반경 계산 엔진 가중치 설정</h3>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.8rem" }}>
                    <span>장비 속도 민감도 계수 (Speed Factor)</span>
                    <span style={{ color: "var(--color-cyan)", fontWeight: "bold" }}>x {speedFactor}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="3.0" 
                    step="0.1" 
                    value={speedFactor} 
                    onChange={(e) => setSpeedFactor(parseFloat(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    장비 속도가 위험지대 크기 계산에 미치는 영향력을 설정합니다. (높을수록 이동 중 위험 반경이 넓게 설정됨)
                  </p>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.8rem" }}>
                    <span>장비 기본 회전 반경 (Turning Radius)</span>
                    <span style={{ color: "var(--color-cyan)", fontWeight: "bold" }}>{turningRadius} m</span>
                  </div>
                  <input 
                    type="range" 
                    min="2" 
                    max="10" 
                    step="0.5" 
                    value={turningRadius} 
                    onChange={(e) => setTurningRadius(parseFloat(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    장비의 물리적인 기본 회전 반경 값입니다.
                  </p>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.8rem" }}>
                    <span>적재물 무게 가중치 (Payload Weight)</span>
                    <span style={{ color: "var(--color-cyan)", fontWeight: "bold" }}>{payloadWeight} Tons</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="5" 
                    step="0.5" 
                    value={payloadWeight} 
                    onChange={(e) => setPayloadWeight(parseFloat(e.target.value))}
                    style={{ width: "100%" }}
                  />
                  <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "4px" }}>
                    적재 중량 증가에 따른 제동거리 가중 계수입니다.
                  </p>
                </div>

                {/* Dynamic preview result */}
                <div style={{ background: "rgba(6, 182, 212, 0.04)", border: "1px solid rgba(6, 182, 212, 0.15)", borderRadius: "6px", padding: "14px", marginTop: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>실시간 자동 계산 위험 반경</div>
                    <div className="orbitron" style={{ fontSize: "1.4rem", fontWeight: "bold", color: "var(--color-cyan)", marginTop: "4px" }}>
                      {calculatedRadius} m
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <ShieldCheck size={16} color="var(--color-green)" />
                    <span style={{ fontSize: "0.75rem", color: "var(--color-green)", fontWeight: "bold" }}>알고리즘 반영 됨</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
