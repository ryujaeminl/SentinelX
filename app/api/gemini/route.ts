import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, telemetry, incident, customApiKey } = body;

    // Retrieve API key from environment variable or custom user-provided API key from settings panel
    const apiKey = customApiKey || process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Gemini API Key가 누락되었습니다. .env 파일에 GEMINI_API_KEY를 등록하거나 관리자 설정 창에서 입력해 주십시오." 
        },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // We use gemini-2.0-flash (fast, lightweight, highly capable, acting as "3.5flash" in performance)
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: action === "predict" ? "application/json" : "text/plain" }
    });

    if (action === "predict") {
      const prompt = `
당신은 첨단 스마트팩토리의 '산업안전 관리 통합 AI 에이전트(SentinelX)'입니다.
현재 천장 탑뷰 CCTV 카메라와 지게차(AGV) 센서로부터 입수된 실시간 물리적 텔레메트리 데이터를 제공합니다.
이 데이터를 분석하여 충돌 위험이나 규정 위반 상황을 실시간으로 감지하고, "위험 등급(Risk Level)", "예측 개요(Summary)", "긴급 대응 수칙(Prevention Actions)"을 JSON 포맷으로 도출해 주십시오.

[실시간 공장 상태 텔레메트리]
- 지게차 속도: ${telemetry.speed} m/s
- 지게차 조작 모드: ${telemetry.mode}
- 지게차 자동 제동(AI) 활성화 여부: ${telemetry.isAiActive ? "ON" : "OFF"}
- 공장 내 활성 작업자 인원: ${telemetry.workerCount}명
- 조작 대상 작업자(Player)의 헬멧(안전모) 착용 여부: ${telemetry.playerHelmet ? "착용함" : "미착용 (안전규정 위반)"}
- 조작 대상 작업자(Player)의 기립 상태: ${telemetry.playerFallen ? "쓰러짐 감지 (긴급!)" : "정상 보행 중"}
- 공장 구역 내 화재 및 센서 상태: ${telemetry.fireType === "none" ? "정상" : telemetry.fireType === "general" ? "일반 화재 발생 (프레스기 구역)" : "화학가스 누출 화재 감지 (열화상 이상)"}
- 프레스 구역 온도: ${telemetry.temperature}°C

[출력 JSON 스키마 규격]
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "riskIndex": 0에서 100 사이의 정수,
  "summary": "한국어로 작성된 상황 예측 한 줄 요약",
  "details": "구체적인 위험 감지 요인과 예측 위험성에 대한 분석내용 (한국어 2-3문장)",
  "actions": [
    "즉시 취해야 할 긴급 대응 가이드라인 1",
    "긴급 대응 가이드라인 2"
  ],
  "autoShutdown": true | false (위험도가 CRITICAL이거나 작업자 쓰러짐/화재 발생 시 true로 설정)
}

주의: JSON 이외의 잡다한 말이나 markdown 백틱(\`\`\`) 기호 없이 순수 JSON 문자열만 즉시 출력해 주십시오.
`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      
      try {
        const jsonResponse = JSON.parse(text);
        return NextResponse.json({ success: true, data: jsonResponse });
      } catch (parseError) {
        // Fallback in case Gemini returns markdown blocks inside JSON response
        const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const jsonResponse = JSON.parse(cleanText);
        return NextResponse.json({ success: true, data: jsonResponse });
      }

    } else if (action === "report") {
      const prompt = `
당신은 대한민국 산업안전보건공단의 공인 안전공학 분석관입니다.
방금 발생한 스마트팩토리 내 산업 재해/안전 사고 시뮬레이션 데이터를 종합하여, 정부 제출용 공식 규격의 [산업안전 사고조사 및 조치 결과 보고서] 초안을 한국어로 신뢰감 있게 작성해 주십시오.

[발생 사고 데이터 요약]
- 사고 종류: ${incident.type}
- 사고 발생 시점: ${incident.time}
- 사고 설명: ${incident.description}
- 상세 정보: ${incident.details}
- 지게차 속도 계수(Speed Factor): ${incident.speedFactor}x
- 물리 제동 마진(Safety Buffer): ${incident.safetyBuffer}px

보고서는 다음 목차를 반드시 포함하여 엄격하고 전문적인 톤앤매너로 Markdown 형식으로 작성해 주십시오:
1. 사고 개요 (일시, 장소, 사고명)
2. 피해 상태 및 설비 영향 분석
3. AI 안전망 작동 상태 평가 (사고 시점에 AI 안전 감지 기능이 켜져 있었는지, 왜 충돌을 완벽히 방지하지 못했는지에 대한 안전공학적 분석)
4. 근본 원인 분석 (4M 분석 기법 반영: Man, Machine, Media, Management)
5. 재발 방지 대책 및 스마트 AI 모델 개선 권고사항 (가중치 조정, 물리 버퍼 확대 등 실무 지침 수록)

작성자는 '공장안전 수석분석관 SentinelX'로 명시하십시오.
`;

      const result = await model.generateContent(prompt);
      const reportText = result.response.text();
      return NextResponse.json({ success: true, report: reportText });
    }

    return NextResponse.json({ success: false, error: "알 수 없는 요청 액션입니다." }, { status: 400 });
  } catch (error: any) {
    console.error("Gemini API Route Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Gemini API를 처리하는 동안 알 수 없는 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
