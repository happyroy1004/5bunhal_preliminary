import { classifyImage } from "./classifier.js";
import { saveImageFile } from "./storage.js";

/**
 * 진료 기록 추가 모달을 초기화합니다.
 * "기록 저장" 버튼 클릭 시 각 이미지를 분류하고 class_id를 함께 저장합니다.
 *
 * @param {object} opts
 * @param {Function} opts.getDirHandle   - () => dirHandle
 * @param {Function} opts.getPatient     - () => activePatient
 * @param {Function} opts.savePatients   - () => Promise<void>
 * @param {Function} opts.onSaved        - 저장 완료 후 콜백 ()=>void
 * @param {Function} opts.showAlert      - (msg) => void
 */
export function initRecordModal({ getDirHandle, getPatient, savePatients, onSaved, showAlert }) {
  const modal     = document.getElementById("addRecordModal");
  const form      = document.getElementById("addRecordForm");
  const openBtn   = document.getElementById("addRecordBtn");
  const closeBtn  = document.getElementById("closeRecordModalBtn");
  const cancelBtn = document.getElementById("cancelRecordBtn");
  const photosInput = document.getElementById("recordPhotos");

  const _close = () => modal.classList.remove("show");
  closeBtn.onclick  = _close;
  cancelBtn.onclick = _close;

  openBtn.onclick = () => {
    document.getElementById("recordDate").value = new Date().toISOString().split("T")[0];
    modal.classList.add("show");
  };

  // 파일 선택 시 가장 오래된 파일의 날짜를 자동 입력
  photosInput.addEventListener("change", e => {
    const files = e.target.files;
    if (!files.length) return;
    let oldest = files[0].lastModified;
    for (let i = 1; i < files.length; i++) {
      if (files[i].lastModified < oldest) oldest = files[i].lastModified;
    }
    const d = new Date(oldest);
    document.getElementById("recordDate").value =
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  form.onsubmit = async e => {
    e.preventDefault();
    const dateStr = document.getElementById("recordDate").value;
    const memoStr = document.getElementById("recordMemo").value;
    const files   = photosInput.files;
    const saveBtn = form.querySelector(".btn-success");
    saveBtn.innerText = "저장 중..."; saveBtn.disabled = true;

    // 💡 [추가] 글로벌 변수 is5SplitMode 상태를 가져올 수 있도록
    // dashboard.js 에서 이 값을 받아올 수 있는 getter 함수(opts.getIs5SplitMode)가 필요합니다.
    // 임시로 true/false를 어떻게 판단할지, dashboard의 UI 상태를 보고 판단합니다.
    const is5SplitModeOn = document.getElementById("toggle5SplitBtn").innerText.includes("ON");

    try {
      const savedImages = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 1. 파일 저장 (이건 공통)
        await saveImageFile(getDirHandle(), getPatient(), dateStr, file);

        let classId = null;
        let croppedFileName = null;

        // 💡 2. 5분할 모드가 ON일 때만 AI 분류 및 자동 크롭 실행!
        if (is5SplitModeOn) {
          // AI 분류 함수 호출 (이제 이 함수가 크롭된 파일까지 만들어줍니다!)
          const aiResult = await classifyAndCropImage(file, getDirHandle(), getPatient(), dateStr);
          classId = aiResult.classId;
          croppedFileName = aiResult.croppedFileName; 
        }

        // 3. 기록에 추가 (크롭된 파일이 있으면 edited 속성에 바로 넣어줍니다)
        savedImages.push({ 
          original: file.name, 
          edited: croppedFileName, // AI가 크롭해줬으면 그 파일명, 아니면 null
          class_id: classId 
        });
      }

      // ... 기존의 existingRecord 병합 및 저장 로직은 그대로 유지 ...
      const patient = getPatient();
      if (!patient.records) patient.records = [];
      
      const existingRecord = patient.records.find(r => r.date === dateStr);
      if (existingRecord) {
        existingRecord.images.push(...savedImages);
        if (memoStr.trim() !== "") {
          existingRecord.memo = existingRecord.memo ? existingRecord.memo + "\n" + memoStr : memoStr;
        }
      } else {
        patient.records.push({ id: Date.now(), date: dateStr, memo: memoStr, images: savedImages });
      }

      await savePatients();
      _close();
      form.reset();
      onSaved();
      showAlert(is5SplitModeOn ? "AI가 자동으로 분류 및 크롭하여 저장했습니다." : "진료 기록이 추가되었습니다.");
    } catch (err) {
      showAlert("오류: " + err.message);
    } finally {
      saveBtn.innerText = "기록 저장"; saveBtn.disabled = false;
    }
  };
}