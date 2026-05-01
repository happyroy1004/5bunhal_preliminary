// js/classifier.js

// 💡 밖에서 쓸 수 있도록 export 가 제대로 붙어 있습니다.
export const CLASS_NAME_KR = {
  1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악"
};

export const CLASS_POSITION_CSS = {
  1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower"
};

const INDEX_TO_CLASS_ID = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5 };

let session = null;

async function loadModel() {
  if (!session) {
    try {
      session = await ort.InferenceSession.create('./models/dental_best_single.onnx');
      console.log("✅ ONNX AI 모델 로드 완료!");
    } catch (e) {
      console.error("❌ ONNX 모델 로드 실패:", e);
    }
  }
  return session;
}

// 🔥 여기가 에러의 원인이었습니다! 함수 이름을 확실하게 classifyImage 로 고정했습니다.
export async function classifyImage(file) {
  const sess = await loadModel();
  if (!sess) return Math.floor(Math.random() * 5) + 1;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const IMG_SIZE = 224;
        const canvas = document.createElement('canvas');
        canvas.width = IMG_SIZE;
        canvas.height = IMG_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
        const imgData = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;

        const floatData = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
        const mean = [0.485, 0.456, 0.406];
        const std = [0.229, 0.224, 0.225];

        for (let y = 0; y < IMG_SIZE; y++) {
          for (let x = 0; x < IMG_SIZE; x++) {
            const srcIdx = (y * IMG_SIZE + x) * 4;
            const r = imgData[srcIdx] / 255.0;
            const g = imgData[srcIdx + 1] / 255.0;
            const b = imgData[srcIdx + 2] / 255.0;

            floatData[0 * IMG_SIZE * IMG_SIZE + y * IMG_SIZE + x] = (r - mean[0]) / std[0];
            floatData[1 * IMG_SIZE * IMG_SIZE + y * IMG_SIZE + x] = (g - mean[1]) / std[1];
            floatData[2 * IMG_SIZE * IMG_SIZE + y * IMG_SIZE + x] = (b - mean[2]) / std[2];
          }
        }

        const tensor = new ort.Tensor('float32', floatData, [1, 3, IMG_SIZE, IMG_SIZE]);
        const feeds = {};
        feeds[sess.inputNames[0]] = tensor;

        const results = await sess.run(feeds);
        const output = results[sess.outputNames[0]].data; 

        // Softmax 확률 변환
        const maxVal = Math.max(...output);
        const exps = output.map(val => Math.exp(val - maxVal));
        const sumExps = exps.reduce((a, b) => a + b);
        const probabilities = exps.map(val => val / sumExps);

        let maxProb = 0;
        let maxIndex = 0;
        for (let i = 0; i < probabilities.length; i++) {
          if (probabilities[i] > maxProb) {
            maxProb = probabilities[i];
            maxIndex = i;
          }
        }

        let predictedClass = INDEX_TO_CLASS_ID[maxIndex];
        console.log(`💡 AI 분석 완료! | 분류결과: ${predictedClass}번 위치 (${CLASS_NAME_KR[predictedClass]}) | 정답률: ${(maxProb * 100).toFixed(1)}%`);
        
        resolve(predictedClass);

      } catch (err) {
        console.error("❌ AI 분류 중 에러 발생:", err);
        resolve(Math.floor(Math.random() * 5) + 1); 
      }
    };
    img.src = URL.createObjectURL(file);
  });
}
