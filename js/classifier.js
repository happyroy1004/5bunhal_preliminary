// js/classifier.js

import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };

// 💡 data.yaml 기반 매핑 (0:Front(3), 1:Left(2), 2:Lower(5), 3:Right(4), 4:Upper(1))
const INDEX_TO_CLASS_ID = { 0: 3, 1: 2, 2: 5, 3: 4, 4: 1 };

let session = null;

async function loadModel() {
  if (!session) {
    try {
      session = await ort.InferenceSession.create('./models/dental_best_single.onnx');
      console.log("✅ YOLOv8-Pose 모델 로드 완료!");
    } catch (e) {
      console.error("❌ ONNX 모델 로드 실패:", e);
    }
  }
  return session;
}

export async function classifyAndCropImage(file, dirHandle, patient, dateStr) {
  const sess = await loadModel();
  if (!sess) return { classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null };

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const IMG_SIZE = 640; 
        const origW = img.naturalWidth;
        const origH = img.naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width = IMG_SIZE; canvas.height = IMG_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
        const imgData = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;

        const floatData = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
        for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
          floatData[i] = imgData[i * 4] / 255.0; 
          floatData[IMG_SIZE * IMG_SIZE + i] = imgData[i * 4 + 1] / 255.0; 
          floatData[2 * IMG_SIZE * IMG_SIZE + i] = imgData[i * 4 + 2] / 255.0; 
        }

        const tensor = new ort.Tensor('float32', floatData, [1, 3, IMG_SIZE, IMG_SIZE]);
        const results = await sess.run({ [sess.inputNames[0]]: tensor });
        const output = results[sess.outputNames[0]].data; 
        const dims = results[sess.outputNames[0]].dims; 

        const num_anchors = dims[2]; 
        const num_classes = 5; 

        // 1. 가장 신뢰도가 높은 클래스와 바운딩 박스 찾기
        let best_prob = 0, best_anchor = -1, best_class = -1;
        for (let i = 0; i < num_anchors; i++) {
          for (let c = 0; c < num_classes; c++) {
            let prob = output[(4 + c) * num_anchors + i];
            if (prob > best_prob) { best_prob = prob; best_anchor = i; best_class = c; }
          }
        }

        if (best_prob < 0.3) return resolve({ classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null });

        const predictedClass = INDEX_TO_CLASS_ID[best_class];
        const scaleX = origW / IMG_SIZE, scaleY = origH / IMG_SIZE;

        // 2. 크롭 영역 크기 및 중심점 계산 (원본 이미지 기준)
        let cx = output[0 * num_anchors + best_anchor] * scaleX;
        let cy = output[1 * num_anchors + best_anchor] * scaleY;
        let w = output[2 * num_anchors + best_anchor] * scaleX;
        let h = output[3 * num_anchors + best_anchor] * scaleY;

        // 3. 틸팅(회전) 없이 정방향으로 바운딩 박스 크롭 진행
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = w; 
        cropCanvas.height = h;
        const cropCtx = cropCanvas.getContext('2d');

        // 중심 이동 후 원본 이미지를 잘라내기
        cropCtx.translate(w / 2, h / 2);
        cropCtx.drawImage(img, -cx, -cy, origW, origH);

        // 4. 잘라낸 이미지 저장
        cropCanvas.toBlob(async (blob) => {
          try {
            const croppedFileName = await saveEditedImage(dirHandle, patient, dateStr, file.name, blob);
            console.log(`💡 AI 크롭 완료! (수평보정 제외) [${CLASS_NAME_KR[predictedClass]}]`);
            resolve({ classId: predictedClass, croppedFileName });
          } catch (error) {
            resolve({ classId: predictedClass, croppedFileName: null });
          }
        }, "image/jpeg", 1.0);
      } catch (err) {
        console.error("❌ YOLO 에러:", err);
        resolve({ classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null });
      }
    };
    img.src = URL.createObjectURL(file);
  });
}
