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

// ──────────────────────────────────────────
// AI 모델 로드 및 유지
// ──────────────────────────────────────────
let loadedModel = null;

async function loadModel() {
  if (!loadedModel) {
    try {
      // 💡 models 폴더 안의 model.json 파일을 불러옵니다.
      // github에 올리신 models 폴더 경로와 일치해야 합니다.
      loadedModel = await tf.loadGraphModel('./models/model.json');
      console.log("✅ AI 모델 로드 완료!");
    } catch (e) {
      console.error("❌ AI 모델 로드 실패:", e);
    }
  }
  return loadedModel;
}

// ──────────────────────────────────────────
// AI 분류 함수 (진짜 추론 로직)
// ──────────────────────────────────────────
export async function classifyImage(file) {
  const model = await loadModel();
  
  // 모델 로드에 실패하면 기존처럼 랜덤 반환 (앱 멈춤 방지)
  if (!model) {
    console.warn("모델을 사용할 수 없어 랜덤 분류를 실행합니다.");
    return Math.floor(Math.random() * 5) + 1;
  }

  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        // 1. 입력 이미지 사이즈 설정 
        // ⚠️ 주의: Roboflow 학습 시 설정한 사이즈로 맞춰야 합니다 (일반적으로 224, 416, 640 중 하나)
        const IMG_SIZE = 224; 

        // 2. 이미지를 텐서(Tensor) 배열로 변환 및 전처리 (정규화)
        const tensor = tf.browser.fromPixels(img)
          .resizeNearestNeighbor([IMG_SIZE, IMG_SIZE])
          .toFloat()
          .expandDims(0)
          .div(255.0); // 0~1 값으로 스케일링

        // 3. AI 모델 예측 실행
        const predictions = await model.predict(tensor);
        const data = await predictions.data(); // 예측 확률 배열 반환

        // 메모리 해제 (웹 브라우저가 느려지는 것을 방지)
        tensor.dispose();
        predictions.dispose();

        // 4. 가장 확률이 높은 클래스(분류) 찾기
        let maxProb = 0;
        let maxIndex = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] > maxProb) {
            maxProb = data[i];
            maxIndex = i;
          }
        }

        // 5. Roboflow 결과값(Index)을 1~5 번호로 매핑
        // 모델이 0번부터 라벨을 매기므로 기본적으로 +1을 해줍니다.
        // ⚠️ 실제 모델의 라벨 순서가 (1:상악, 2:좌측, 3:정면...)과 다르면 여기서 순서를 바꿔주어야 합니다.
        let predictedClass = maxIndex + 1;
        if (predictedClass > 5) predictedClass = 5; 

        console.log(`AI 분석 결과: ${predictedClass}번 위치 (확률: ${(maxProb * 100).toFixed(1)}%)`);
        
        // 최종 결과 반환
        resolve(predictedClass);

      } catch (err) {
        console.error("AI 분류 중 에러 발생:", err);
        resolve(Math.floor(Math.random() * 5) + 1); // 에러 시 랜덤 반환
      }
    };
    
    // File 객체를 브라우저용 이미지 URL로 변환하여 img.onload 실행
    img.src = URL.createObjectURL(file);
  });
}