// js/classifier.js

import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };

// 💡 클래스 맵핑
const INDEX_TO_CLASS_ID = { 0: 3, 1: 2, 2: 5, 3: 4, 4: 1 };

// 🚨 [매우 중요] Roboflow data.yaml 파일의 'keypoints' 순서를 확인하고 숫자를 맞춰주세요!
// 예시: 0번째가 midline, 1번째가 molar1(또는 left), 2번째가 molar2(또는 right) 일 경우
const KP_MID = 0; // midline의 인덱스 번호
const KP_M1  = 1; // molar1 (또는 left)의 인덱스 번호
const KP_M2  = 2; // molar2 (또는 right)의 인덱스 번호

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
          let kconf = output[(kp_start + k * 3 + 2) * num_anchors + best_anchor]; 
          kps.push({ x: kx * (origW / IMG_SIZE), y: ky * (origH / IMG_SIZE), conf: kconf, idx: k });
        }

        const real_cx = cx * (origW / IMG_SIZE);
        const real_cy = cy * (origH / IMG_SIZE);
        const real_w = w * (origW / IMG_SIZE);
        const real_h = h * (origH / IMG_SIZE);

        // 🔥 [원장님 라벨링 이름 기반] 점 할당
        let pMid = kps[KP_MID];
        let pM1  = kps[KP_M1];
        let pM2  = kps[KP_M2];

        let angle_rad = 0;
        let is_flip_y = false; 

        // 1. 상악/정면/하악 로직 (molar1, molar2로 수평 맞추기)
        if (predictedClass === 1 || predictedClass === 5 || predictedClass === 3) {
          if (pM1.conf > 0.1 && pM2.conf > 0.1) {
            // 무조건 시각적으로 왼쪽에 있는 점을 기준으로 잡음 (180도 뒤집힘 방지)
            let leftMolar  = pM1.x < pM2.x ? pM1 : pM2;
            let rightMolar = pM1.x < pM2.x ? pM2 : pM1;

            angle_rad = Math.atan2(rightMolar.y - leftMolar.y, rightMolar.x - leftMolar.x);

            // 상악/하악은 midline으로 회전 방향 결정
            if ((predictedClass === 1 || predictedClass === 5) && pMid.conf > 0.1) {
              let mx = (leftMolar.x + rightMolar.x) / 2;
              let my = (leftMolar.y + rightMolar.y) / 2;
              
              // 회전 후 midline의 상대적 Y 위치 계산
              let rot_y = (pMid.x - mx) * Math.sin(-angle_rad) + (pMid.y - my) * Math.cos(-angle_rad);

              if (predictedClass === 1) { 
                // 상악: midline이 위(-Y)에 있어야 함
                if (rot_y > 0) angle_rad += Math.PI; 
              } else if (predictedClass === 5) { 
                // 하악: 거울상 반전 적용 + midline이 아래(+Y)에 있어야 함
                is_flip_y = true;
                if (rot_y > 0) angle_rad += Math.PI; 
              }
            }
          }
        } 
        // 2. 좌측/우측 로직 (midline과 하나의 molar로 수평 맞추기)
        else if (predictedClass === 2 || predictedClass === 4) {
          // molar1과 molar2 중 살아있는(AI가 찾은) 어금니 하나를 픽업
          let validMolar = (pM1.conf > pM2.conf) ? pM1 : pM2;

          if (pMid.conf > 0.1 && validMolar.conf > 0.1) {
            // 어금니에서 midline을 바라보는 벡터의 각도
            let current_angle = Math.atan2(pMid.y - validMolar.y, pMid.x - validMolar.x); 

            if (predictedClass === 2) { 
              // 좌측: midline이 오른쪽(0도 방향)을 향해야 함
              angle_rad = current_angle; 
            } else if (predictedClass === 4) { 
              // 우측: midline이 왼쪽(180도 방향)을 향해야 함
              angle_rad = current_angle - Math.PI;
            }
          }
        }

        // 캔버스 크기 자동 조절 (사진 잘림 방지)
        let new_w = Math.abs(real_w * Math.cos(angle_rad)) + Math.abs(real_h * Math.sin(angle_rad));
        let new_h = Math.abs(real_w * Math.sin(angle_rad)) + Math.abs(real_h * Math.cos(angle_rad));

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = new_w;
        cropCanvas.height = new_h;
        const cropCtx = cropCanvas.getContext('2d');

        cropCtx.translate(new_w / 2, new_h / 2);
        if (is_flip_y) cropCtx.scale(1, -1); // 하악 거울상 반전
        cropCtx.rotate(-angle_rad);
        cropCtx.drawImage(img, -real_cx, -real_cy, origW, origH);

        cropCanvas.toBlob(async (blob) => {
          try {
            const croppedFileName = await saveEditedImage(dirHandle, patient, dateStr, file.name, blob);
            let degree = (angle_rad * 180 / Math.PI).toFixed(1);
            console.log(`💡 AI 명칭기반 보정! [${CLASS_NAME_KR[predictedClass]}] | 각도: ${degree}도 ${is_flip_y ? '| 상하반전됨' : ''}`);
            resolve({ classId: predictedClass, croppedFileName: croppedFileName });
          } catch (error) {
            resolve({ classId: predictedClass, croppedFileName: null });
          }
        }, "image/jpeg", 1.0);

      } catch (err) {
        console.error("❌ YOLO-Pose 에러:", err);
        resolve({ classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null }); 
      }
    };
    img.src = URL.createObjectURL(file);
  });
}
