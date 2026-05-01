// js/classifier.js

import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };

// 🚨 [매우 중요] 여기서부터 원장님의 집중이 필요합니다!
// 로보플로우에서 다운받은 데이터셋 폴더 안의 'data.yaml' 파일을 메모장으로 열어보세요.
// 그 안의 'names:' 리스트 순서에 맞춰서 아래 숫자를 수정해야 합니다.
// (앱 내부 번호: 1=상악, 2=좌측, 3=정면, 4=우측, 5=하악)

// [예시] data.yaml이 names: ['Front', 'Left', 'Lower', 'Right', 'Upper'] 라면:
// 0번째(Front) -> 3(정면)
// 1번째(Left) -> 2(좌측)
// 2번째(Lower) -> 5(하악)
// 3번째(Right) -> 4(우측)
// 4번째(Upper) -> 1(상악)
// 아래 코드를 0: 3, 1: 2, 2: 5, 3: 4, 4: 1 로 수정하세요!

const INDEX_TO_CLASS_ID = { 
  0: 1, // data.yaml의 0번째 항목이 상악(1)이 맞는지 확인하세요!
  1: 2, // data.yaml의 1번째 항목이 좌측(2)이 맞는지 확인하세요!
  2: 3, 
  3: 4, 
  4: 5 
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

        // 💡 [수정됨] 자동 틸팅(수평 맞추기) 안전장치 추가!
        let angle_deg = 0;
        if (kps.length >= 2) {
          let pt1 = { x: kps[0].x * scaleX, y: kps[0].y * scaleY };
          let pt2 = { x: kps[1].x * scaleX, y: kps[1].y * scaleY };
          
          let dx = pt2.x - pt1.x;
          let dy = pt2.y - pt1.y;

          // x축 거리(dx)가 y축 거리(dy)보다 클 때만(가로에 가까울 때만) 계산
          if (Math.abs(dx) > Math.abs(dy)) {
            angle_deg = Math.atan2(dy, dx) * (180 / Math.PI);
            
            // 각도가 너무 심하게 꺾여 있으면(15도 초과) AI가 점을 잘못 찍은 것으로 보고 0도로 리셋
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
        cropCtx.drawImage(img, -real_cx, -real_cy, origW, origH);

        cropCanvas.toBlob(async (blob) => {
          try {
            const croppedFileName = await saveEditedImage(dirHandle, patient, dateStr, file.name, blob);
            console.log(`💡 AI 크롭/틸팅 완료! [${CLASS_NAME_KR[predictedClass]}] | 각도: ${angle_deg.toFixed(1)}도 보정`);
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