// js/classifier.js

import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };

//[cite: 17] data.yaml 기반 매핑
const INDEX_TO_CLASS_ID = { 0: 3, 1: 2, 2: 5, 3: 4, 4: 1 };

//[cite: 14, 17] 점 순서
const KP_MID = 0; 
const KP_M1  = 1; 
const KP_M2  = 2; 

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
        const feeds = { [sess.inputNames[0]]: tensor };
        const results = await sess.run(feeds);
        const output = results[sess.outputNames[0]].data; 
        const dims = results[sess.outputNames[0]].dims; 

        const num_anchors = dims[2]; 
        const num_classes = 5; 
        const num_keypoints = (dims[1] - 4 - num_classes) / 3;

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

        let cx = output[0 * num_anchors + best_anchor] * scaleX;
        let cy = output[1 * num_anchors + best_anchor] * scaleY;
        let w = output[2 * num_anchors + best_anchor] * scaleX;
        let h = output[3 * num_anchors + best_anchor] * scaleY;

        let kps = [];
        let kp_start = 4 + num_classes;
        for (let k = 0; k < num_keypoints; k++) {
          kps.push({ 
            x: output[(kp_start + k * 3) * num_anchors + best_anchor] * scaleX, 
            y: output[(kp_start + k * 3 + 1) * num_anchors + best_anchor] * scaleY, 
            conf: output[(kp_start + k * 3 + 2) * num_anchors + best_anchor], 
            idx: k 
          });
        }

        // 각도 계산 로직
        let angle_rad = 0, is_flip_y = false;
        let pMid = kps[KP_MID], pM1 = kps[KP_M1], pM2 = kps[KP_M2];

        if ((predictedClass === 1 || predictedClass === 5 || predictedClass === 3) && pM1.conf > 0.1 && pM2.conf > 0.1) {
          let leftM = pM1.x < pM2.x ? pM1 : pM2;
          let rightM = pM1.x < pM2.x ? pM2 : pM1;
          angle_rad = Math.atan2(rightM.y - leftM.y, rightM.x - leftM.x);
          if ((predictedClass === 1 || predictedClass === 5) && pMid.conf > 0.1) {
            let mx = (pM1.x + pM2.x) / 2, my = (pM1.y + pM2.y) / 2;
            let rot_y = (pMid.x - mx) * Math.sin(-angle_rad) + (pMid.y - my) * Math.cos(-angle_rad);
            if (predictedClass === 1 && rot_y > 0) angle_rad += Math.PI;
            else if (predictedClass === 5) { is_flip_y = true; if (rot_y > 0) angle_rad += Math.PI; }
          }
        } else if ((predictedClass === 2 || predictedClass === 4) && pMid.conf > 0.1) {
          let vM = pM1.conf > pM2.conf ? pM1 : pM2;
          if (vM.conf > 0.1) {
            let cur_a = Math.atan2(pMid.y - vM.y, pMid.x - vM.x);
            angle_rad = (predictedClass === 2) ? cur_a : cur_a - Math.PI;
          }
        }

        // 다이나믹 캔버스[cite: 14]
        let nw = Math.abs(w * Math.cos(angle_rad)) + Math.abs(h * Math.sin(angle_rad));
        let nh = Math.abs(w * Math.sin(angle_rad)) + Math.abs(h * Math.cos(angle_rad));
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = nw; cropCanvas.height = nh;
        const cropCtx = cropCanvas.getContext('2d');

        cropCtx.translate(nw / 2, nh / 2);
        if (is_flip_y) cropCtx.scale(1, -1);
        cropCtx.rotate(-angle_rad);
        cropCtx.drawImage(img, -cx, -cy, origW, origH);

        // 🔍 [일시적 디버깅] 점과 정보 표시
        // 반전/회전된 좌표계이므로 다시 원래대로 돌려놓고 그려야 정확합니다.
        cropCtx.setTransform(1, 0, 0, 1, 0, 0); // 좌표계 초기화
        cropCtx.fillStyle = "red";
        cropCtx.font = "bold 20px Arial";
        
        kps.forEach((kp, i) => {
          if (kp.conf > 0.1) {
            // 박스 내 상대 좌표로 대략적인 위치 표시 (디버깅용)
            let drawX = (kp.x - (cx - w/2)); 
            let drawY = (kp.y - (cy - h/2));
            cropCtx.beginPath();
            cropCtx.arc(drawX, drawY, 8, 0, Math.PI * 2);
            cropCtx.fill();
            cropCtx.fillText(`${i}:${kp.conf.toFixed(2)}`, drawX + 10, drawY);
          }
        });
        cropCtx.strokeStyle = "yellow";
        cropCtx.lineWidth = 3;
        cropCtx.strokeRect(0, 0, nw, nh); // 크롭 경계선

        cropCanvas.toBlob(async (blob) => {
          const croppedFileName = await saveEditedImage(dirHandle, patient, dateStr, file.name, blob);
          resolve({ classId: predictedClass, croppedFileName });
        }, "image/jpeg", 1.0);
      } catch (err) {
        console.error("❌ YOLO 에러:", err);
        resolve({ classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null });
      }
    };
    img.src = URL.createObjectURL(file);
  });
}
