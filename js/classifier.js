// js/classifier.js

// ──────────────────────────────────────────
// 클래스 상수
// ──────────────────────────────────────────
export const CLASS_NAME_KR = {
  1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악"
};

export const CLASS_POSITION_CSS = {
  1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower"
};

// 💡 Roboflow의 라벨 순서에 맞춘 매핑표 (0~4 -> 1~5)
const INDEX_TO_CLASS_ID = {
  0: 1, // upper
  1: 2, // left
  2: 3, // front
  3: 4, // right
  4: 5  // lower
};

// ──────────────────────────────────────────
// AI 모델 로드
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
// AI 분류 함수 (객체 탐지 모델 텐서 파싱 완벽 대응)
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
        const IMG_SIZE = 640; 

        // 1. 이미지 전처리 (640x640, 0~1 스케일링)
        const tensor = tf.tidy(() => {
          return tf.browser.fromPixels(img)
            .resizeBilinear([IMG_SIZE, IMG_SIZE])
            .toFloat()
            .div(tf.scalar(255.0))
            .expandDims(0); 
        });

        // 2. 모델 예측
        const predictions = await model.predict(tensor);

        // 💡 3. 핵심: 거대한 배열에서 '확률값'만 정확하게 추출하기!
        const probabilitiesTensor = tf.tidy(() => {
          let preds = predictions;
          
          if (preds.shape.length === 3) {
            // [1, 박스개수, 특징] 형태로 강제 정렬
            if (preds.shape[1] < preds.shape[2]) {
              preds = preds.transpose([0, 2, 1]); 
            }
            // 1차원(배치) 제거
            preds = preds.squeeze([0]); 
            
            // 🔥 여기가 핵심입니다! 🔥
            // YOLOv8의 배열 구조: [x좌표, y좌표, 너비, 높이, 클래스1, 클래스2, 클래스3, 클래스4, 클래스5, 나머지 찌꺼기...]
            // 클래스 확률은 "무조건 4번 인덱스"부터 시작합니다!
            const classStartIdx = 4; 
            const numClasses = 5; 
            
            // 딱 4번 인덱스부터 5개의 값(우리가 학습시킨 상,하,좌,우,정면 확률)만 칼같이 잘라냅니다.
            const classScores = preds.slice([0, classStartIdx], [-1, numClasses]);
            
            // 모든 예측된 박스 중에서 가장 확률이 높은 값 도출
            return classScores.max(0); 
          }
          
          return preds.squeeze(); 
        });

        // 텐서를 자바스크립트 배열로 변환
        const data = await probabilitiesTensor.data(); 

        // 메모리 청소
        tensor.dispose();
        predictions.dispose();
        probabilitiesTensor.dispose();

        // 4. 제일 높은 확률을 가진 클래스의 인덱스 찾기
        let maxProb = -Infinity;
        let maxIndex = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] > maxProb) {
            maxProb = data[i];
            maxIndex = i;
          }
        }

        // 5. 파이썬 Index(0~4) -> 뷰어 ID(1~5) 변환
        let predictedClass = INDEX_TO_CLASS_ID[maxIndex];
        
        // 💡 확률값이 로그 확률(Logits)일 수 있으므로 Sigmoid 처리로 0~100% 깔끔하게 표현
        let finalPercent = maxProb > 1 ? (1 / (1 + Math.exp(-maxProb))) * 100 : maxProb * 100;
        if (finalPercent > 99.9) finalPercent = 99.9; // 최대치 보정

        console.log(`💡 AI 분석 완료! | 분류결과: ${predictedClass}번 위치 (${CLASS_NAME_KR[predictedClass]}) | 확실성: ${finalPercent.toFixed(1)}%`);
        
        resolve(predictedClass);

      } catch (err) {
        console.error("❌ AI 텐서 처리 중 에러 발생:", err);
        resolve(Math.floor(Math.random() * 5) + 1); 
      }
    };
    
    img.src = URL.createObjectURL(file);
  });
}