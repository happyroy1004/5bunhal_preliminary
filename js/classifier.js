// js/classifier.js

import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };

// 💡 원장님이 찾아내신 완벽한 패턴을 적용했습니다!
// (0: Front/정면, 1: Left/좌측, 2: Lower/하악, 3: Right/우측, 4: Upper/상악)
const INDEX_TO_CLASS_ID = { 
  0: 3, // 원래 상악 자리(0) -> '정면'으로 수정
  1: 2, // 좌측은 그대로
  2: 5, // 원래 정면 자리(2) -> '하악'으로 수정
  3: 4, // 우측은 그대로
  4: 1  // 원래 하악 자리(4) -> '상악'으로 수정
};

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
        canvas.width = IMG_SIZE;
        canvas.height = IMG_SIZE;
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
        const feeds = {};
        feeds[sess.inputNames[0]] = tensor;

        const results = await sess.run(feeds);
        const output = results[sess.outputNames[0]].data; 
        const dims = results[sess.outputNames[0]].dims; 

        const num_features = dims[1];
        const num_anchors = dims[2]; 
        const num_classes = 5; 
        const num_keypoints = (num_features - 4 - num_classes) / 3;

        let best_prob = 0;
        let best_anchor = -1;
        let best_class = -1;

        for (let i = 0; i < num_anchors; i++) {
          let max_c_prob = 0;
          let max_c_idx = -1;
          for (let c = 0; c < num_classes; c++) {
            let prob = output[(4 + c) * num_anchors + i];
            if (prob > max_c_prob) { max_c_prob = prob; max_c_idx = c; }
          }
          if (max_c_prob > best_prob) {
            best_prob = max_c_prob;
            best_anchor = i;
            best_class = max_c_idx;
          }
        }

        if (best_prob < 0.3) {
          return resolve({ classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null });
        }

        const predictedClass = INDEX_TO_CLASS_ID[best_class];

        let cx = output[0 * num_anchors + best_anchor];
        let cy = output[1 * num_anchors + best_anchor];
        let w = output[2 * num_anchors + best_anchor];
        let h = output[3 * num_anchors + best_anchor];

        let kps = [];
        let kp_start = 4 + num_classes;
        for (let k = 0; k < num_keypoints; k++) {
          let kx = output[(kp_start + k * 3) * num_anchors + best_anchor];
          let ky = output[(kp_start + k * 3 + 1) * num_anchors + best_anchor];
          kps.push({ x: kx, y: ky });
        }

        const scaleX = origW / IMG_SIZE;
        const scaleY = origH / IMG_SIZE;

        const real_cx = cx * scaleX;
        const real_cy = cy * scaleY;
        const real_w = w * scaleX;
        const real_h = h * scaleY;

        // 자동 틸팅(수평 맞추기) 안전장치
        let angle_deg = 0;
        if (kps.length >= 2) {
          let pt1 = { x: kps[0].x * scaleX, y: kps[0].y * scaleY };
          let pt2 = { x: kps[1].x * scaleX, y: kps[1].y * scaleY };
          
          let dx = pt2.x - pt1.x;
          let dy = pt2.y - pt1.y;

          if (Math.abs(dx) > Math.abs(dy)) {
            angle_deg = Math.atan2(dy, dx) * (180 / Math.PI);
            
            if (angle_deg > 15 || angle_deg < -15) {
              angle_deg = 0;
            }
          }
        }

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = real_w;
        cropCanvas.height = real_h;
        const cropCtx = cropCanvas.getContext('2d');

        cropCtx.translate(real_w / 2, real_h / 2);
        cropCtx.rotate(-angle_deg * Math.PI / 180);

        // ✨ [핵심 추가] AI가 찾은 부위가 '하악(5)'일 경우 상하 반전(Flip Vertical)을 시켜줍니다!
        if (predictedClass === 5) {
          cropCtx.scale(1, -1); 
        }

        cropCtx.drawImage(img, -real_cx, -real_cy, origW, origH);

        cropCanvas.toBlob(async (blob) => {
          try {
            const croppedFileName = await saveEditedImage(dirHandle, patient, dateStr, file.name, blob);
            console.log(`💡 AI 크롭/틸팅 완료! [${CLASS_NAME_KR[predictedClass]}] | 각도: ${angle_deg.toFixed(1)}도 보정 ${predictedClass === 5 ? '| 상하반전됨' : ''}`);
            resolve({ classId: predictedClass, croppedFileName: croppedFileName });
          } catch (error) {
            console.error("자동 크롭 저장 실패:", error);
            resolve({ classId: predictedClass, croppedFileName: null });
          }
        }, "image/jpeg", 1.0);

      } catch (err) {
        console.error("❌ YOLO-Pose 파싱 에러:", err);
        resolve({ classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null }); 
      }
    };
    img.src = URL.createObjectURL(file);
  });
}
