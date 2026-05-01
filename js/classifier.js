// js/classifier.js

import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };

// 💡 원장님이 찾아내신 완벽한 클래스 맵핑
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

        // 💡 좌표점과 신뢰도(Confidence) 추출
        let kps = [];
        let kp_start = 4 + num_classes;
        for (let k = 0; k < num_keypoints; k++) {
          let kx = output[(kp_start + k * 3) * num_anchors + best_anchor];
          let ky = output[(kp_start + k * 3 + 1) * num_anchors + best_anchor];
          let kconf = output[(kp_start + k * 3 + 2) * num_anchors + best_anchor]; 
          kps.push({ x: kx, y: ky, conf: kconf });
        }

        const scaleX = origW / IMG_SIZE;
        const scaleY = origH / IMG_SIZE;
        const real_cx = cx * scaleX;
        const real_cy = cy * scaleY;
        const real_w = w * scaleX;
        const real_h = h * scaleY;

        // 🔥 [핵심 로직] 원장님의 완벽한 틸팅 & 회전 규칙 적용
        // 가정: kps[0]=좌측점, kps[1]=정중선(Midline), kps[2]=우측점
        let pL = kps[0];
        let pM = kps[1]; // 정중선은 항상 1번 인덱스라고 가정
        let pR = kps[2];
        let angle_rad = 0;

        // 1. 상악(1), 정면(3), 하악(5): 포인트 3개 기준
        if (predictedClass === 1 || predictedClass === 5 || predictedClass === 3) {
          // 양쪽 어금니(Molar)를 이어 완벽한 수평(Tilting)을 잡습니다.
          if (pL && pR && pL.conf > 0.1 && pR.conf > 0.1) {
            let dx = (pR.x - pL.x) * scaleX;
            let dy = (pR.y - pL.y) * scaleY;
            angle_rad = Math.atan2(dy, dx);
          }

          // 상악, 하악은 정중선의 위치를 파악하여 필요시 180도 회전(위아래 뒤집기)을 수행합니다.
          if ((predictedClass === 1 || predictedClass === 5) && pM && pM.conf > 0.1 && pL && pR) {
            let mx = (pL.x + pR.x) / 2 * scaleX;
            let my = (pL.y + pR.y) / 2 * scaleY;
            let mx_mid = pM.x * scaleX;
            let my_mid = pM.y * scaleY;

            // 이미 수평을 맞췄다고 가정했을 때, 정중선이 향하는 Y방향 계산 (Canvas는 아래가 +Y)
            let vec_x = mx_mid - mx;
            let vec_y = my_mid - my;
            let rotated_y = vec_x * Math.sin(-angle_rad) + vec_y * Math.cos(-angle_rad);

            if (predictedClass === 1) { 
              // 상악: 정중선이 무조건 제일 위(-Y)에 있어야 함
              if (rotated_y > 0) angle_rad += Math.PI; 
            } else if (predictedClass === 5) { 
              // 하악: 정중선이 무조건 제일 아래(+Y)에 있어야 함
              if (rotated_y < 0) angle_rad += Math.PI; 
            }
          }
        } 
        // 2. 좌측(2), 우측(4): 포인트 2개 (정중선 + 살아남은 어금니 1개) 기준
        else if (predictedClass === 2 || predictedClass === 4) {
          if (pM && pM.conf > 0.1) {
            // 좌우측 사진에서는 AI가 확신하는 어금니 점 하나를 찾습니다.
            let pOther = (pL && pR) ? (pL.conf > pR.conf ? pL : pR) : (pL || pR);

            if (pOther && pOther.conf > 0.1) {
              // 어금니에서 정중선을 바라보는 벡터(선) 계산
              let dx = (pM.x - pOther.x) * scaleX;
              let dy = (pM.y - pOther.y) * scaleY;
              let current_angle = Math.atan2(dy, dx); 

              if (predictedClass === 2) {
                // 좌측: 정중선이 사진의 오른쪽(0도 방향)으로 오게끔 회전 및 수평
                angle_rad = current_angle; 
              } else if (predictedClass === 4) {
                // 우측: 정중선이 사진의 왼쪽(180도 방향)으로 오게끔 회전 및 수평
                angle_rad = current_angle - Math.PI;
              }
            }
          }
        }

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = real_w;
        cropCanvas.height = real_h;
        const cropCtx = cropCanvas.getContext('2d');

        // 계산된 완벽한 각도 적용 (크롭 박스의 중심 기준)
        cropCtx.translate(real_w / 2, real_h / 2);
        cropCtx.rotate(-angle_rad);

        cropCtx.drawImage(img, -real_cx, -real_cy, origW, origH);

        cropCanvas.toBlob(async (blob) => {
          try {
            const croppedFileName = await saveEditedImage(dirHandle, patient, dateStr, file.name, blob);
            let degree = (angle_rad * 180 / Math.PI).toFixed(1);
            console.log(`💡 AI 크롭/틸팅 완료! [${CLASS_NAME_KR[predictedClass]}] | 회전 및 보정각: ${degree}도`);
            resolve({ classId: predictedClass, croppedFileName: croppedFileName });
          } catch (error) {
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
