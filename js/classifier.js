// js/classifier.js

import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };

const INDEX_TO_CLASS_ID = { 0: 3, 1: 2, 2: 5, 3: 4, 4: 1 };
const KP_MID = 0; // AI가 뱉는 Midline 번호 (좌/우측용)

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

        let valid_kps = kps.filter(kp => kp.conf > 0.1);
        let angle_rad = 0;
        let is_flip_x = false;

        // 🔥 1. 상악/하악/정면 (3개 점) - 좁은 악궁(V-shape) 완벽 대응!
        if ((predictedClass === 1 || predictedClass === 5 || predictedClass === 3) && valid_kps.length >= 3) {
          let pts = valid_kps.slice(0, 3);
          let min_diff = Infinity;
          let mid_idx = -1;

          // '이등변 삼각형 원리': 나머지 두 점과의 거리 차이가 가장 작은 점이 정중선(Midline)이다!
          for (let i = 0; i < 3; i++) {
            let p_candidate = pts[i];
            let others = pts.filter((_, idx) => idx !== i);
            let d1 = Math.hypot(p_candidate.x - others[0].x, p_candidate.y - others[0].y);
            let d2 = Math.hypot(p_candidate.x - others[1].x, p_candidate.y - others[1].y);
            let diff = Math.abs(d1 - d2);

            if (diff < min_diff) {
              min_diff = diff;
              mid_idx = i;
            }
          }

          let pMid = pts[mid_idx]; // 확정된 정중선
          let molars = pts.filter((_, idx) => idx !== mid_idx);
          let leftMolar  = molars[0].x < molars[1].x ? molars[0] : molars[1];
          let rightMolar = molars[0].x < molars[1].x ? molars[1] : molars[0];
          
          angle_rad = Math.atan2(rightMolar.y - leftMolar.y, rightMolar.x - leftMolar.x);

          if (predictedClass === 1 || predictedClass === 5) {
            let mx = (leftMolar.x + rightMolar.x) / 2;
            let my = (leftMolar.y + rightMolar.y) / 2;
            let rot_y = (pMid.x - mx) * Math.sin(-angle_rad) + (pMid.y - my) * Math.cos(-angle_rad);

            if (predictedClass === 1 && rot_y > 0) { 
              angle_rad += Math.PI; // 상악: Midline이 위(-Y)
            } else if (predictedClass === 5) {
              is_flip_x = true; // 하악: 좌우반전
              if (rot_y < 0) angle_rad += Math.PI; // 하악: Midline이 아래(+Y)
            }
          }
        } 
        // 🔥 2. 좌측/우측 (포인트 2개일 때만 작동, 이전 코드 오타 수정!)
        else if (predictedClass === 2 || predictedClass === 4) {
          if (valid_kps.length >= 2) {
            let pMid = valid_kps.find(k => k.idx === KP_MID);
            let pMolar = valid_kps.find(k => k.idx !== KP_MID);

            if (pMid && pMolar) {
              let current_angle = Math.atan2(pMid.y - pMolar.y, pMid.x - pMolar.x);
              
              if (predictedClass === 2) {
                // 좌측: 정중선이 무조건 화면 '오른쪽(0도)'을 향해야 함 (오타 수정!)
                angle_rad = current_angle; 
              } else if (predictedClass === 4) {
                // 우측: 정중선이 무조건 화면 '왼쪽(180도)'을 향해야 함
                angle_rad = current_angle - Math.PI;
              }
            }
          }
        }

        let nw = Math.abs(w * Math.cos(angle_rad)) + Math.abs(h * Math.sin(angle_rad));
        let nh = Math.abs(w * Math.sin(angle_rad)) + Math.abs(h * Math.cos(angle_rad));
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = nw; cropCanvas.height = nh;
        const cropCtx = cropCanvas.getContext('2d');

        cropCtx.translate(nw / 2, nh / 2);
        cropCtx.rotate(-angle_rad);
        if (is_flip_x) cropCtx.scale(-1, 1); 
        cropCtx.drawImage(img, -cx, -cy, origW, origH);

        // 🔍 [디버깅] 사진 캔버스 위에 점과 번호 그리기
        cropCtx.setTransform(1, 0, 0, 1, 0, 0); 
        cropCtx.fillStyle = "red";
        cropCtx.font = "bold 24px Arial";
        kps.forEach((kp) => {
          if (kp.conf > 0.1) {
            cropCtx.beginPath();
            cropCtx.arc(kp.x - cx + nw/2, kp.y - cy + nh/2, 6, 0, Math.PI * 2);
            cropCtx.fill();
            cropCtx.fillStyle = "yellow";
            cropCtx.fillText(`${kp.idx}`, kp.x - cx + nw/2 + 10, kp.y - cy + nh/2);
            cropCtx.fillStyle = "red";
          }
        });
        cropCtx.strokeStyle = "rgba(255, 255, 0, 0.5)";
        cropCtx.lineWidth = 3;
        cropCtx.strokeRect(0, 0, nw, nh);

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
