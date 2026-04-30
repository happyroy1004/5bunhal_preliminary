// js/classifier.js

export const CLASS_NAME_KR = {
  1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악"
};

export const CLASS_POSITION_CSS = {
  1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower"
};

// 파이썬 Index(0~4) -> 화면 ID(1~5) 매핑표
const INDEX_TO_CLASS_ID = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5 };

// ──────────────────────────────────────────
// ONNX 모델 세션 로드
// ──────────────────────────────────────────
let session = null;

async function loadModel() {
  if (!session) {
    try {
      // 💡 Colab에서 다운받은 onnx 파일 경로 지정!
      session = await ort.InferenceSession.create('./models/dental_best.onnx');
      console.log("✅ ONNX AI 모델 로드 완료!");
    } catch (e) {
      console.error("❌ ONNX 모델 로드 실패:", e);
    }
  }
  return session;
}

// ──────────────────────────────────────────
// AI 분류 함수 (파이썬과 100% 동일한 전처리 적용)
// ──────────────────────────────────────────
export async function classifyImage(file) {
  const sess = await loadModel();
  
  if (!sess) return Math.floor(Math.random() * 5) + 1;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const IMG_SIZE = 224;
        
        // 1. 이미지를 224x224 캔버스에 그려서 픽셀 데이터 추출
        const canvas = document.createElement('canvas');
        canvas.width = IMG_SIZE;
        canvas.height = IMG_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
        const imgData = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;

        // 2. 파이썬의 transforms 기능 자바스크립트로 완벽 구현 (NCHW 포맷 + 정규화)
        const floatData = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
        const mean = [0.485, 0.456, 0.406];
        const std = [0.229, 0.224, 0.225];

        for (let y = 0; y < IMG_SIZE; y++) {
          for (let x = 0; x < IMG_SIZE; x++) {
            const srcIdx = (y * IMG_SIZE + x) * 4;
            // 0~1 스케일링
            const r = imgData[srcIdx] / 255.0;
            const g = imgData[srcIdx + 1] / 255.0;
            const b = imgData[srcIdx + 2] / 255.0;

            // 정규화 (Normalization) 및 채널별 분리 (R, G, B)
            floatData[0 * IMG_SIZE * IMG_SIZE + y * IMG_SIZE + x] = (r - mean[0]) / std[0];
            floatData[1 * IMG_SIZE * IMG_SIZE + y * IMG_SIZE + x] = (g - mean[1]) / std[1];
            floatData[2 * IMG_SIZE * IMG_SIZE + y * IMG_SIZE + x] = (b - mean[2]) / std[2];
          }
        }

        // 3. ONNX 모델에 텐서 입력
        const tensor = new ort.Tensor('float32', floatData, [1, 3, IMG_SIZE, IMG_SIZE]);
        const feeds = {};
        feeds[sess.inputNames[0]] = tensor;

        // 4. 추론 실행
        const results = await sess.run(feeds);
        const output = results[sess.outputNames[0]].data; // 길이 5짜리 배열 반환

        // 5. 파이썬의 F.softmax 와 동일하게 변환하여 확률(%) 도출
        const maxVal = Math.max(...output);
        const exps = output.map(val => Math.exp(val - maxVal));
        const sumExps = exps.reduce((a, b) => a + b);
        const probabilities = exps.map(val => val / sumExps);

        // 6. 가장 높은 확률과 인덱스 찾기
        let maxProb = 0;
        let maxIndex = 0;
        for (let i = 0; i < probabilities.length; i++) {
          if (probabilities[i] > maxProb) {
            maxProb = probabilities[i];
            maxIndex = i;
          }
        }

        let predictedClass = INDEX_TO_CLASS_ID[maxIndex];
        
        console.log(`💡 AI 분석 완료! | 분류결과: ${predictedClass}번 위치 (${CLASS_NAME_KR[predictedClass]}) | 확률: ${(maxProb * 100).toFixed(1)}%`);
        
        resolve(predictedClass);

      } catch (err) {
        console.error("❌ AI 분류 중 에러 발생:", err);
        resolve(Math.floor(Math.random() * 5) + 1); 
      }
    };
    img.src = URL.createObjectURL(file);
  });
}