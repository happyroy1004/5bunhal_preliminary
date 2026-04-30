import { loadModel } from "./roboflow.js";
import { pickFolder, saveJSON } from "./storage.js";

let fiveSplit = false;
let aiModel = null;

// 로컬 모델 로드
window.onload = async () => {
  aiModel = await loadModel("models/best_pose.pt");
};

document.getElementById("fiveSplitBtn").onclick = () => {
  fiveSplit = !fiveSplit;
  document.getElementById("fiveSplitBtn").innerText = 
    fiveSplit ? "5분할 모드 ON" : "5분할 모드 OFF";
};

// 사진 분류 및 위치 배치
export async function classifyImages(images) {
  if (!aiModel) {
    alert("모델이 아직 로드되지 않았습니다.");
    return;
  }

  const classified = {};
  for (let img of images) {
    const prediction = await aiModel.detect(img);
    classified[prediction.label] = img;
  }

  renderFiveSplit(classified);
}

function renderFiveSplit(classified) {
  const container = document.getElementById("recordView");
  container.innerHTML = `
    <div class="five-grid">
      <div class="pos">상악 교합면<img src="${classified.upper || ''}"></div>
      <div class="pos">좌측<img src="${classified.left || ''}"></div>
      <div class="pos">정면<img src="${classified.front || ''}"></div>
      <div class="pos">우측<img src="${classified.right || ''}"></div>
      <div class="pos">하악 교합면<img src="${classified.lower || ''}"></div>
    </div>
  `;
}
