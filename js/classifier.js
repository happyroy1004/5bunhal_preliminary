// js/classifier.js

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

export const CLASS_POSITION_CSS = {
  1: "pos-upper",
  2: "pos-right",
  3: "pos-front",
  4: "pos-left",
  5: "pos-lower",
};

// 예측된 Index(0~4)를 화면 ID(1~5)로 매핑
const INDEX_TO_CLASS_ID = {
  0: 1, // upper
  1: 2, // left
  2: 3, // front
  3: 4, // right
  4: 5  // lower
};

// ──────────────────────────────────────────
// AI 모델 로드 및 유지
// ──────────────────────────────────────────
let loadedModel = null;

async function loadModel() {
  if (!loadedModel) {
    try {
      loadedModel = await tf.loadGraphModel('./models/model.json');
      console.log("✅ AI 모델 로드 완료!");
    } catch (e) {
      console.error("❌ AI 모델 로드 실패:", e);
    }
  }
  return loadedModel;
}

// ──────────────────────────────────────────
// AI 분류 함수 (Roboflow tfjs 모델 전용)
// ──────────────────────────────────────────
export async function classifyImage(file) {
  const model = await loadModel();
  
  if (!model) {
    console.warn("모델 로드 실패 - 랜덤 분류 실행");
    return Math.floor(Math.random() * 5) + 1;
  }

  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        // 💡 1. 에러의 원인 해결: 사이즈를 640으로 변경!
        const IMG_SIZE = 640; 

        // 2. 텐서 변환 및 전처리 (tf.tidy로 메모리 관리)
        const tensor = tf.tidy(() => {
          // 💡 2. 에러의 원인 해결: 차원 변경(transpose) 제거, 오직 0~1 스케일링만 적용
          // 결과 형태: [1, 640, 640, 3] 이 되어 모델이 원하는 스펙과 정확히 일치함!
          let imgTensor = tf.browser.fromPixels(img)
            .resizeBilinear([IMG_SIZE, IMG_SIZE])
            .toFloat()
            .div(tf.scalar(255.0))
            .expandDims(0); 

          return imgTensor;
        });

        // 3. AI 모델 예측 실행
        const predictions = await model.predict(tensor);
        const data = await predictions.data(); 
        
        console.log("🔍 모델 출력 Shape:", predictions.shape);
        console.log("🔍 모델 첫 20개 데이터:", (await predictions.data()).slice(0, 20));

        // 메모리 해제
        tensor.dispose();
        predictions.dispose();

        // 4. 가장 확률이 높은 클래스 찾기
        let maxProb = -Infinity;
        let maxIndex = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] > maxProb) {
            maxProb = data[i];
            maxIndex = i;
          }
        }

        // 5. Index(0~4) -> 뷰어 ID(1~5) 변환
        let predictedClass = INDEX_TO_CLASS_ID[maxIndex];
        
        console.log(`💡 AI 분석 완료! | 분류결과: ${predictedClass}번 위치 (${CLASS_NAME_KR[predictedClass]}) | 확률: ${(maxProb * 100).toFixed(1)}%`);
        
        resolve(predictedClass);

      } catch (err) {
        console.error("❌ AI 분류 중 치명적 에러 발생:", err);
        resolve(Math.floor(Math.random() * 5) + 1); 
      }
    };
    
    // File 객체를 브라우저용 URL로 변환하여 이미지 로드 시작
    img.src = URL.createObjectURL(file);
  });
}