// js/classifier.js

// ──────────────────────────────────────────
// 클래스 상수 (파이썬 class_names 순서 반영)
// ['upper', 'left', 'front', 'right', 'lower']
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

// 파이썬 Index(0~4) -> 화면 ID(1~5) 매핑표
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
      // 💡 models 폴더 안의 model.json 파일 로드
      loadedModel = await tf.loadGraphModel('./models/model.json');
      console.log("✅ AI 모델 로드 완료!");
    } catch (e) {
      console.error("❌ AI 모델 로드 실패:", e);
    }
  }
  return loadedModel;
}

// ──────────────────────────────────────────
// AI 분류 함수 (PyTorch 호환 완벽 적용)
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
        // 1. 파이썬 transforms.Resize((224, 224)) 와 동일하게 세팅
        const IMG_SIZE = 224; 

        // 2. 텐서 변환 및 전처리 (tf.tidy로 메모리 누수 방지)
        const tensor = tf.tidy(() => {
          // A. 브라우저 이미지를 텐서로 변환하고 224x224로 리사이즈 
          // 💡 PyTorch 기본 리사이즈 방식인 Bilinear 사용!
          let imgTensor = tf.browser.fromPixels(img)
            .resizeBilinear([IMG_SIZE, IMG_SIZE])
            .toFloat()
            .div(tf.scalar(255.0)); // ToTensor() 의 0~1 정규화

          // B. RGB 채널별 정규화 (파이썬 transforms.Normalize)
          const mean = tf.tensor1d([0.485, 0.456, 0.406]);
          const std = tf.tensor1d([0.229, 0.224, 0.225]);
          imgTensor = imgTensor.sub(mean).div(std);

          // C. ⭐️ 가장 중요한 부분: PyTorch 형식(NCHW)으로 차원 순서 변경!
          // 웹(HWC: 0,1,2) -> 파이썬(CHW: 2,0,1)
          imgTensor = imgTensor.transpose([2, 0, 1]);

          // D. 배치 차원 추가 -> [1, 3, 224, 224] 형태로 최종 완성
          return imgTensor.expandDims(0);
        });

        // 3. AI 모델 예측 실행
        const predictions = await model.predict(tensor);
        const data = await predictions.data(); 

        // 텐서 메모리 해제
        tensor.dispose();
        predictions.dispose();

        // 4. 가장 확률이 높은 클래스 찾기
        let maxProb = -Infinity; // 초기값을 가장 낮게 설정
        let maxIndex = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] > maxProb) {
            maxProb = data[i];
            maxIndex = i;
          }
        }

        // 5. 파이썬 Index(0~4) -> 뷰어 ID(1~5) 변환
        let predictedClass = INDEX_TO_CLASS_ID[maxIndex];
        
        console.log(`💡 AI 분석 완료! | 파이썬 Index: ${maxIndex} | 화면위치: ${predictedClass}번 | 모델 원본 출력값:`, data);
        
        resolve(predictedClass);

      } catch (err) {
        console.error("❌ AI 분류 중 치명적 에러 발생:", err);
        // 에러가 나면 1~5 랜덤 반환
        resolve(Math.floor(Math.random() * 5) + 1); 
      }
    };
    
    // File 객체를 브라우저용 URL로 변환하여 이미지 로드 시작
    img.src = URL.createObjectURL(file);
  });
}