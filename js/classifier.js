// js/classifier.js

// ──────────────────────────────────────────
// 클래스 상수 (학습 시 데이터셋 폴더 순서 반영!)
// 파이썬: ['upper', 'left', 'front', 'right', 'lower'] -> Index 0~4
// 화면 UI (CLASS_NAME_KR): 1=상악, 2=좌측, 3=정면, 4=우측, 5=하악
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

// 파이썬의 Index(0~4)를 우리가 쓰는 화면 ID(1~5)로 변환해주는 매핑표
// ['upper'(0)->1, 'left'(1)->2, 'front'(2)->3, 'right'(3)->4, 'lower'(4)->5]
const INDEX_TO_CLASS_ID = {
  0: 1, // upper -> 상악
  1: 2, // left  -> 좌측
  2: 3, // front -> 정면
  3: 4, // right -> 우측
  4: 5  // lower -> 하악
};

// ──────────────────────────────────────────
// AI 모델 로드 및 유지
// ──────────────────────────────────────────
let loadedModel = null;

async function loadModel() {
  if (!loadedModel) {
    try {
      // 💡 models 폴더 안의 model.json 파일을 불러옵니다.
      loadedModel = await tf.loadGraphModel('./models/model.json');
      console.log("✅ AI 모델 로드 완료!");
    } catch (e) {
      console.error("❌ AI 모델 로드 실패:", e);
    }
  }
  return loadedModel;
}

// ──────────────────────────────────────────
// AI 분류 함수 (진짜 추론 로직 + 파이썬과 동일한 정규화)
// ──────────────────────────────────────────
export async function classifyImage(file) {
  const model = await loadModel();
  
  if (!model) {
    console.warn("모델을 사용할 수 없어 랜덤 분류를 실행합니다.");
    return Math.floor(Math.random() * 5) + 1;
  }

  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = async () => {
      try {
        // 1. 입력 이미지 사이즈 설정 (파이썬의 transforms.Resize((224, 224)))
        const IMG_SIZE = 224; 

        // 2. 파이썬과 완전히 동일한 정규화 적용 
        // transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        const tensor = tf.tidy(() => {
          // 이미지를 0~255에서 0~1로 스케일링
          let imgTensor = tf.browser.fromPixels(img)
            .resizeNearestNeighbor([IMG_SIZE, IMG_SIZE])
            .toFloat()
            .div(tf.scalar(255.0));

          // RGB 채널별 Mean과 Std 적용
          const mean = tf.tensor1d([0.485, 0.456, 0.406]);
          const std = tf.tensor1d([0.229, 0.224, 0.225]);
          
          // (imgTensor - mean) / std 연산
          imgTensor = imgTensor.sub(mean).div(std);

          // 배치 차원 추가: shape를 [1, 224, 224, 3]으로 만듦
          return imgTensor.expandDims(0);
        });

        // 3. AI 모델 예측 실행
        const predictions = await model.predict(tensor);
        const data = await predictions.data(); // 예측 확률 배열 반환

        // 메모리 해제
        tensor.dispose();
        predictions.dispose();

        // 4. 가장 확률이 높은 클래스의 Index(0~4) 찾기
        let maxProb = 0;
        let maxIndex = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] > maxProb) {
            maxProb = data[i];
            maxIndex = i;
          }
        }

        // 5. 파이썬 Index(0~4)를 화면의 Class ID(1~5)로 변환
        let predictedClass = INDEX_TO_CLASS_ID[maxIndex];
        
        console.log(`AI 분석 결과: 파이썬Index[${maxIndex}] -> 매핑결과[${predictedClass}] (확률: ${(maxProb * 100).toFixed(1)}%)`);
        
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