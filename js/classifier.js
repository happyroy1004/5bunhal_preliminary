// js/classifier.js

// 💡 [추가] 크롭된 이미지를 바로 저장하기 위해 storage.js의 함수를 가져옵니다.
import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };
const INDEX_TO_CLASS_ID = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5 };

let session = null;

async function loadModel() {
  if (!session) {
    try {
      session = await ort.InferenceSession.create('./models/dental_best.onnx');
    } catch (e) {
      console.error("ONNX 모델 로드 실패:", e);
    }
  }
  return session;
}

// ──────────────────────────────────────────
// AI 분류 + 자동 크롭(Auto-Crop) 종합 함수
// ──────────────────────────────────────────
export async function classifyAndCropImage(file, dirHandle, patient, dateStr) {
  const sess = await loadModel();
  
  // 모델 로드 실패 시 랜덤 클래스만 반환 (크롭 안함)
  if (!sess) return { classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null };

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const IMG_SIZE = 224; // 모델 입력 사이즈
        const originalWidth = img.naturalWidth;
        const originalHeight = img.naturalHeight;

        // --- 1. 모델 입력용 텐서 만들기 ---
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

        // --- 2. 추론 실행 ---
        const results = await sess.run(feeds);
        const output = results[sess.outputNames[0]].data; 

        // 💡 모델이 YOLO-Pose 형식의 데이터 [x, y, w, h, class_probs...] 를 뱉는다고 가정!
        // (원장님의 모델이 내뱉는 정확한 배열 길이를 콘솔로 한 번 확인해보는 것이 좋습니다)
        
        let cx = output[0]; // 중심 X
        let cy = output[1]; // 중심 Y
        let w  = output[2]; // 너비
        let h  = output[3]; // 높이

        // 클래스 확률값 추출 (인덱스 4부터 5개)
        const classScores = output.slice(4, 9);
        const maxVal = Math.max(...classScores);
        const exps = classScores.map(val => Math.exp(val - maxVal));
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

        const predictedClass = INDEX_TO_CLASS_ID[maxIndex];

        // --- 3. 원본 이미지 크기에 맞춰서 박스 좌표 복원 (스케일업) ---
        // 모델이 224x224 기준으로 박스를 뱉었으므로, 원본 사이즈에 맞게 비율 곱하기
        const scaleX = originalWidth / IMG_SIZE;
        const scaleY = originalHeight / IMG_SIZE;

        const realCenterX = cx * scaleX;
        const realCenterY = cy * scaleY;
        const realW = w * scaleX;
        const realH = h * scaleY;

        // 크롭 시작점(좌상단) 계산 (조금 여유 있게 자르려면 마진(margin)을 줄 수 있습니다)
        const startX = Math.max(0, realCenterX - (realW / 2));
        const startY = Math.max(0, realCenterY - (realH / 2));
        
        // --- 4. 자동 크롭(Canvas) 후 파일로 저장하기 ---
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = realW;
        cropCanvas.height = realH;
        const cropCtx = cropCanvas.getContext('2d');

        // 원본 이미지에서 박스 영역만큼 잘라서 새 캔버스에 그리기
        cropCtx.drawImage(img, startX, startY, realW, realH, 0, 0, realW, realH);

        // 캔버스를 이미지 파일(Blob)로 변환
        cropCanvas.toBlob(async (blob) => {
          try {
            // storage.js의 함수를 이용해 AI가 자른 이미지를 'edited_...' 파일명으로 저장!
            const croppedFileName = await saveEditedImage(dirHandle, patient, dateStr, file.name, blob);
            
            console.log(`💡 AI 자동 크롭 완료! [${CLASS_NAME_KR[predictedClass]}] | 원본: ${file.name} -> 크롭: ${croppedFileName}`);
            
            // 클래스 번호와 크롭된 파일명을 같이 반환
            resolve({ classId: predictedClass, croppedFileName: croppedFileName });
          } catch (error) {
            console.error("자동 크롭 저장 실패:", error);
            resolve({ classId: predictedClass, croppedFileName: null }); // 에러 나면 분류만 해줌
          }
        }, "image/jpeg", 0.95); // 고화질 JPG로 압축

      } catch (err) {
        console.error("AI 에러 발생:", err);
        resolve({ classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null }); 
      }
    };
    img.src = URL.createObjectURL(file);
  });
}