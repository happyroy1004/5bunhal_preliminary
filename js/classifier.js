// js/classifier.js

import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };

// data.yaml 기반 매핑
const INDEX_TO_CLASS_ID = { 0: 3, 1: 2, 2: 5, 3: 4, 4: 1 };

// 점 순서 (원장님 data.yaml 설정)
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

        // 🔥 원장님의 완벽한 룰 기반 각도 계산 로직
        let angle_rad = 0;
        let is_flip_x = false; // 좌우반전 플래그

        let pMid = kps[KP_MID];
        let pM1  = kps[KP_M1]; // 정면의 경우 Left
        let pM2  = kps[KP_M2]; // 정면의 경우 Right

        // 1. 상악(1) / 하악(5)
        if (predictedClass === 1 || predictedClass === 5) {
          if (pM1.conf > 0.1 && pM2.conf > 0.1) {
            // 화면상 무조건 왼쪽, 오른쪽을 나눠서 1차 수평을 잡음
            let leftMolar  = pM1.x < pM2.x ? pM1 : pM2;
            let rightMolar = pM1.x < pM2.x ? pM2 : pM1;
            angle_rad = Math.atan2(rightMolar.y - leftMolar.y, rightMolar.x - leftMolar.x);

            if (pMid.conf > 0.1) {
              let mx = (leftMolar.x + rightMolar.x) / 2;
              let my = (leftMolar.y + rightMolar.y) / 2;
              // 회전 시켰다고 가정했을 때 midline의 상대적 Y위치 확인
              let rot_y = (pMid.x - mx) * Math.sin(-angle_rad) + (pMid.y - my) * Math.cos(-angle_rad);

              if (predictedClass === 1) {
                // 상악: midline이 위(-Y)로 가야 함
                if (rot_y > 0) angle_rad += Math.PI; 
              } else if (predictedClass === 5) {
                // 하악: midline이 아래(+Y)로 가야 함
                if (rot_y < 0) angle_rad += Math.PI;
              }
            }
          }
          if (predictedClass === 5) {
            is_flip_x = true; // 하악은 모든 각도 계산이 끝난 후 좌우반전!
          }
        } 
        // 2. 정면(3)
        else if (predictedClass === 3) {
          if (pM1.conf > 0.1 && pM2.conf > 0.1) {
            // 정면은 pM1(Left)가 왼쪽, pM2(Right)가 오른쪽으로 오도록 강제 수평 배열
            angle_rad = Math.atan2(pM2.y - pM1.y, pM2.x - pM1.x);
          }
        }
        // 3. 좌측(2) / 우측(4)
        else if (predictedClass === 2 || predictedClass === 4) {
          let validMolar = (pM1.conf > pM2.conf) ? pM1 : pM2;

          // 🔥 원장님 요청: 포인트가 2개 이상일 때만 틸팅 진행
          if (pMid.conf > 0.1 && validMolar.conf > 0.1) {
            let current_angle = Math.atan2(pMid.y - validMolar.y, pMid.x - validMolar.x);

            if (predictedClass === 2) {
              // 좌측: midline이 오른쪽(0도 방향)
              angle_rad = current_angle;
            } else if (predictedClass === 4) {
              // 우측: midline이 왼쪽(180도 방향)
              angle_rad = current_angle - Math.PI;
            }
          } else {
            // 포인트 2개 미만이면 무리하게 돌리지 않고 0도(원본) 유지
            angle_rad = 0; 
          }
        }

        // 다이나믹 캔버스 크기 계산
        let nw = Math.abs(w * Math.cos(angle_rad)) + Math.abs(h * Math.sin(angle_rad));
        let nh = Math.abs(w * Math.sin(angle_rad)) + Math.abs(h * Math.cos(angle_rad));
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = nw; cropCanvas.height = nh;
        const cropCtx = cropCanvas.getContext('2d');

        // 🔥 변환 순서가 매우 중요합니다: 중심이동 -> 회전 -> (필요시)좌우반전 -> 그리기
        cropCtx.translate(nw / 2, nh / 2);
        cropCtx.rotate(-angle_rad);
        if (is_flip_x) {
          cropCtx.scale(-1, 1); // 하악 거울상 '좌우' 반전!
        }
        cropCtx.drawImage(img, -cx, -cy, origW, origH);

        // 🔍 [일시적 디버깅] 점과 정보 표시
        cropCtx.setTransform(1, 0, 0, 1, 0, 0); 
        cropCtx.fillStyle = "red";
        cropCtx.font = "bold 20px Arial";
        
        kps.forEach((kp, i) => {
          if (kp.conf > 0.1) {
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
