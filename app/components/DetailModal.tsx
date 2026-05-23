"use client";

import React from "react";
import {
  X,
  Activity,
  ShieldAlert,
  Map,
  Camera,
  Thermometer,
  Truck,
  AlertTriangle
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";

interface DetailModalProps {
  selectedDetail: string | null;
  onClose: () => void;
  logs: any[];
  tempData: any[];
  emergency: boolean;
  weatherData: { temp: number; condition: string } | null;
  threatLevel: number;
}

export default function DetailModal({
  selectedDetail,
  onClose,
  logs,
  tempData,
  emergency,
  weatherData,
  threatLevel
}: DetailModalProps) {
  if (!selectedDetail) return null;

  return (
    <div 
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px"
      }}
      onClick={onClose}
    >
      <div 
        className="panel"
        style={{
          width: "90%",
          maxWidth: "1000px",
          height: "85vh",
          maxHeight: "800px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 0 40px rgba(0,0,0,0.8)",
          border: `1px solid ${emergency ? "var(--color-red)" : "var(--color-cyan)"}`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "16px", borderBottom: "1px solid var(--bg-panel-border)", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "var(--color-cyan)", fontSize: "1.2rem", fontWeight: "bold" }}>
            {selectedDetail === "risk" && <><Activity /><span>AI Risk Prediction Analysis</span></>}
            {selectedDetail === "logs" && <><ShieldAlert /><span>Full Event Logs</span></>}
            {selectedDetail === "map" && <><Map /><span>Digital Twin Sector View</span></>}
            {selectedDetail === "equipment" && <><Truck /><span>Asset Status Overview</span></>}
            {selectedDetail === "vision" && <><Camera /><span>AI Vision Matrix & Surveillance</span></>}
            {selectedDetail === "thermal" && <><Thermometer /><span>Thermal & Environment Data</span></>}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={24} className="hover:text-white transition-colors" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingRight: "8px" }}>
          {selectedDetail === "risk" && (
            <div style={{ display: "flex", gap: "24px" }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ color: "var(--text-main)", marginBottom: "12px" }}>Current Risk Factors</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div className="card-item">
                    <div style={{ display: "flex", justifyContent: "space-between", color: threatLevel > 80 ? "var(--color-red)" : "var(--color-yellow)" }}>
                      <span>Collision Threat</span>
                      <span>{threatLevel > 80 ? "High" : "Elevated"} ({threatLevel}%)</span>
                    </div>
                    <div style={{ width: "100%", background: "rgba(255,255,255,0.1)", height: "6px", marginTop: "8px", borderRadius: "3px" }}>
                      <div style={{ width: `${threatLevel}%`, background: threatLevel > 80 ? "var(--color-red)" : "var(--color-yellow)", height: "100%", borderRadius: "3px" }}></div>
                    </div>
                  </div>
                  <div className="card-item">
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-yellow)" }}>
                      <span>Thermal Anomaly</span>
                      <span>{emergency ? "Elevated (65%)" : "Nominal (25%)"}</span>
                    </div>
                    <div style={{ width: "100%", background: "rgba(255,255,255,0.1)", height: "6px", marginTop: "8px", borderRadius: "3px" }}>
                      <div style={{ width: emergency ? "65%" : "25%", background: "var(--color-yellow)", height: "100%", borderRadius: "3px" }}></div>
                    </div>
                  </div>
                  <div className="card-item">
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-green)" }}>
                      <span>Equipment Fatigue</span>
                      <span>Nominal (12%)</span>
                    </div>
                    <div style={{ width: "100%", background: "rgba(255,255,255,0.1)", height: "6px", marginTop: "8px", borderRadius: "3px" }}>
                      <div style={{ width: "12%", background: "var(--color-green)", height: "100%", borderRadius: "3px" }}></div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "16px", border: "1px solid var(--bg-panel-border)" }}>
                <h3 style={{ color: "var(--text-main)", marginBottom: "12px" }}>Risk Trend (Last 24h)</h3>
                <div style={{ height: "200px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tempData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} />
                      <YAxis stroke="var(--text-muted)" fontSize={10} />
                      <Tooltip contentStyle={{ background: "#0b1224", border: "1px solid var(--bg-panel-border)" }} />
                      <Line type="monotone" dataKey="temp" stroke="var(--color-cyan)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {selectedDetail === "logs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {logs.map((log) => (
                <div key={log.id} className="card-item" style={{ borderLeft: `4px solid ${log.type === "danger" ? "var(--color-red)" : log.type === "warning" ? "var(--color-yellow)" : "var(--color-green)"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "bold", fontSize: "0.9rem", color: log.type === "danger" ? "var(--color-red)" : log.type === "warning" ? "var(--color-yellow)" : "var(--color-green)" }}>
                      [{log.type.toUpperCase()}] {log.msg}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{log.time}</span>
                  </div>
                  <div style={{ marginTop: "8px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    Detected by AI monitoring grid. System action applied according to safety protocols.
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedDetail === "map" && (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, position: "relative", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--bg-panel-border)" }}>
                <img src="/design/t_0.png" alt="Map" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
                {emergency && (
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "rgba(244,63,94,0.9)", padding: "20px 40px", borderRadius: "8px", textAlign: "center", border: "2px solid #fff", boxShadow: "0 0 50px var(--color-red)", zIndex: 10 }}>
                    <AlertTriangle size={48} color="#fff" style={{ margin: "0 auto 10px" }} />
                    <h2 style={{ color: "#fff", margin: 0 }}>EMERGENCY HALT ACTIVE</h2>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedDetail === "equipment" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              {["AGV FLEET A", "ROBOTIC ARM 3", "GANTRY CRANE", "MAIN CONVEYOR"].map((eq) => (
                <div key={eq} className="panel" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <h4 style={{ color: "var(--color-cyan)", marginBottom: "12px" }}>{eq}</h4>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, color: "var(--text-muted)", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <li style={{ display: "flex", justifyContent: "space-between" }}><span>Status:</span> <strong style={{ color: emergency ? "var(--color-red)" : "var(--color-green)" }}>{emergency ? "HALTED" : "NOMINAL"}</strong></li>
                    <li style={{ display: "flex", justifyContent: "space-between" }}><span>Uptime:</span> <span>342 hrs</span></li>
                    <li style={{ display: "flex", justifyContent: "space-between" }}><span>Maint. Req:</span> <span>False</span></li>
                    <li style={{ display: "flex", justifyContent: "space-between" }}><span>Power:</span> <span>Active</span></li>
                  </ul>
                </div>
              ))}
            </div>
          )}

          {selectedDetail === "vision" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", height: "100%" }}>
              <div style={{ position: "relative", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--bg-panel-border)" }}>
                <img src="/design/t_3.png" alt="Vision 1" style={{ width: "100%", height: "100%", objectFit: "cover", filter: emergency ? "hue-rotate(-20deg) contrast(1.2)" : "none" }} />
              </div>
              <div style={{ position: "relative", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--bg-panel-border)" }}>
                <img src="/design/t_1.png" alt="Vision 2" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            </div>
          )}

          {selectedDetail === "thermal" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", height: "100%" }}>
              <div style={{ display: "flex", gap: "16px" }}>
                <div className="panel" style={{ flex: 1, display: "flex", alignItems: "center", gap: "20px", background: "rgba(6,182,212,0.05)" }}>
                  <Thermometer size={48} color="var(--color-cyan)" />
                  <div>
                    <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Current Outside Weather</div>
                    <div className="orbitron" style={{ fontSize: "2rem", color: "var(--text-main)", fontWeight: "bold" }}>
                      {weatherData ? `${weatherData.temp}°C` : "Loading..."}
                    </div>
                    <div style={{ color: "var(--color-cyan)", fontSize: "0.9rem" }}>
                      {weatherData ? weatherData.condition : ""}
                    </div>
                  </div>
                </div>
                
                <div className="panel" style={{ flex: 1, display: "flex", alignItems: "center", gap: "20px", background: "rgba(244,63,94,0.05)" }}>
                  <Activity size={48} color="var(--color-red)" />
                  <div>
                    <div style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Internal Zone-C Peak</div>
                    <div className="orbitron" style={{ fontSize: "2rem", color: "var(--color-red)", fontWeight: "bold" }}>
                      {tempData[tempData.length - 1]?.temp.toFixed(1)}°C
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                      Anomaly Detected
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel" style={{ flex: 1 }}>
                <h3 style={{ marginBottom: "16px", color: "var(--text-muted)" }}>Temperature Timeline Comparison</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tempData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="time" stroke="var(--text-muted)" />
                    <YAxis domain={[-10, 80]} stroke="var(--text-muted)" />
                    <Tooltip contentStyle={{ background: "#0b1224", border: "1px solid var(--bg-panel-border)" }} />
                    <Line type="monotone" dataKey="temp" name="Internal Zone-C" stroke="var(--color-red)" strokeWidth={3} />
                    {weatherData && (
                      <Line type="monotone" dataKey={() => weatherData.temp} name="Outside Temp" stroke="var(--color-cyan)" strokeWidth={2} strokeDasharray="5 5" />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
