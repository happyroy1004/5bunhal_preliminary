// ──────────────────────────────────────────
// 클래스 상수
// ──────────────────────────────────────────

export const CLASS_NAME_KR = {
  1: "상악",
  2: "좌측",
  3: "정면",
  4: "우측",
  5: "하악",
};

// five-split-layout CSS 그리드 클래스 (dashboard.html / style.css 기준)
export const CLASS_POSITION_CSS = {
  1: "pos-upper",
  2: "pos-right",
  3: "pos-front",
  4: "pos-left",
  5: "pos-lower",
};

// ──────────────────────────────────────────
// AI 분류 함수
// ──────────────────────────────────────────

/**
 * 이미지 File 객체를 받아 1~5 클래스 번호를 반환합니다.
 *
 * TODO: 실제 모델 연동 시 이 함수만 교체하세요.
 * 예시 (FastAPI 백엔드):
 *   const form = new FormData();
 *   form.append("file", file);
 *   const res = await fetch("/api/classify", { method: "POST", body: form });
 *   const { class_id } = await res.json();
 *   return class_id;
 *
 * @param {File} file
 * @returns {Promise<number>} 1~5
 */
export async function classifyImage(file) {
  await new Promise(r => setTimeout(r, 20)); // 비동기 흐름 유지용
  return Math.floor(Math.random() * 5) + 1;
}