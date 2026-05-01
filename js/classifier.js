// js/classifier.js

import { saveEditedImage } from "./storage.js";

export const CLASS_NAME_KR = { 1: "상악", 2: "좌측", 3: "정면", 4: "우측", 5: "하악" };
export const CLASS_POSITION_CSS = { 1: "pos-upper", 2: "pos-right", 3: "pos-front", 4: "pos-left", 5: "pos-lower" };

// 💡 로보플로우에서 학습된 0~4번 클래스가 앱의 1~5번 위치와 어떻게 매칭되는지 설정합니다.
// (만약 사진이 엉뚱한 곳에 들어간다면 이 순서를 바꿔주시면 됩니다!)
const INDEX_TO_CLASS_ID = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5 };

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

// 🔥 궁극의 3종 세트: 분류(Classify) + 크롭(Crop) + 틸팅(Tilt)
export async function classifyAndCropImage(file, dirHandle, patient, dateStr) {
  const sess = await loadModel();
  if (!sess) return { classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null };

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const IMG_SIZE = 640; // YOLOv8 표준 사이즈
        const origW = img.naturalWidth;
        const origH = img.naturalHeight;

        // 1. 이미지를 640x640 캔버스에 그리기
        const canvas = document.createElement('canvas');
        canvas.width = IMG_SIZE;
        canvas.height = IMG_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
        const imgData = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;

        // 2. YOLO 전용 데이터 변환 (0~1 사이 값으로 정규화만 함)
        const floatData = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
        for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
          floatData[i] = imgData[i * 4] / 255.0; // R
          floatData[IMG_SIZE * IMG_SIZE + i] = imgData[i * 4 + 1] / 255.0; // G
          floatData[2 * IMG_SIZE * IMG_SIZE + i] = imgData[i * 4 + 2] / 255.0; // B
        }

        const tensor = new ort.Tensor('float32', floatData, [1, 3, IMG_SIZE, IMG_SIZE]);
        const feeds = {};
        feeds[sess.inputNames[0]] = tensor;

        // 3. AI 추론 실행!
        const results = await sess.run(feeds);
        const output = results[sess.outputNames[0]].data; 
        const dims = results[sess.outputNames[0]].dims; // [1, 24, 8400] 예상

        const num_features = dims[1];
        const num_anchors = dims[2]; // 보통 8400
        const num_classes = 5; 
        const num_keypoints = (num_features - 4 - num_classes) / 3;

        // 4. 8400개의 박스 중 가장 정답률이 높은(Best) 박스 찾기 (유사 NMS 처리)
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

        // AI가 아무것도 못 찾았거나 확신이 30% 미만이면 원본 반환
        if (best_prob < 0.3) {
          console.warn("AI가 치아를 명확히 찾지 못했습니다.");
          return resolve({ classId: Math.floor(Math.random() * 5) + 1, croppedFileName: null });
        }

        const predictedClass = INDEX_TO_CLASS_ID[best_class];

        // 5. Best 박스의 좌표 및 크기 추출
        let cx = output[0 * num_anchors + best_anchor];
        let cy = output[1 * num_anchors + best_anchor];
        let w = output[2 * num_anchors + best_anchor];
        let h = output[3 * num_anchors + best_anchor];

        // 6. 좌표점(Keypoints) 추출
        let kps = [];
        let kp_start = 4 + num_classes;
        for (let k = 0; k < num_keypoints; k++) {
          let kx = output[(kp_start + k * 3) * num_anchors + best_anchor];
          let ky = output[(kp_start + k * 3 + 1) * num_anchors + best_anchor];
          kps.push({ x: kx, y: ky });
        }

        // 원본 사진 크기에 맞게 스케일업
        const scaleX = origW / IMG_SIZE;
        const scaleY = origH / IMG_SIZE;

        const real_cx = cx * scaleX;
        const real_cy = cy * scaleY;
        const real_w = w * scaleX;
        const real_h = h * scaleY;

        // 7. 🔥 자동 틸팅(수평 맞추기) 삼각함수 계산
        let angle_deg = 0;
        // 💡 0번 점과 1번 점이 양쪽 끝(가로) 기준점이라고 가정합니다.
        if (kps.length >= 2) {
          let pt1 = { x: kps[0].x * scaleX, y: kps[0].y * scaleY };
          let pt2 = { x: kps[1].x * scaleX, y: kps[1].y * scaleY };
          
          let dx = pt2.x - pt1.x;
          let dy = pt2.y - pt1.y;
          angle_deg = Math.atan2(dy, dx) * (180 / Math.PI);
          
          // 각도가 너무 심하게 꺾이면(45도 이상) 오작동으로 간주하고 제한
          if (angle_deg > 45) angle_deg = 45;
          if (angle_deg < -45) angle_deg = -45;
        }

        // 8. 캔버스를 만들고, 기울기를 반대로 돌린 뒤 크롭 영역 복사
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = real_w;
        cropCanvas.height = real_h;
        const cropCtx = cropCanvas.getContext('2d');

        // 핵심 마법: 캔버스 중심점을 기준으로 반대로(수평으로) 돌려버립니다.
        cropCtx.translate(real_w / 2, real_h / 2);
        cropCtx.rotate(-angle_deg * Math.PI / 180);
        // 원본 이미지를 박스 중심에 맞춰서 그립니다.
        cropCtx.drawImage(img, -real_cx, -real_cy, origW, origH);

        // 9. 결과물을 고화질 파일로 저장
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