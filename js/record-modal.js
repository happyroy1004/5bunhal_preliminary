// js/record-modal.js

// 💡 1. 여기서 옛날 이름(classifyImage)을 새 이름(classifyAndCropImage)으로 바꿉니다!
import { classifyAndCropImage } from "./classifier.js"; 
import { saveImageFile } from "./storage.js";

/**
 * 진료 기록 추가 모달을 초기화합니다.
 */
// 💡 2. 매개변수에 getIs5SplitMode 를 추가로 받습니다.
export function initRecordModal({ getDirHandle, getPatient, savePatients, onSaved, showAlert, getIs5SplitMode }) {
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

    // 💡 3. 화면 글자를 읽는 대신, 전달받은 안전한 함수로 상태를 확인합니다.
    const is5SplitModeOn = getIs5SplitMode();

    try {
      const savedImages = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        await saveImageFile(getDirHandle(), getPatient(), dateStr, file);

        let classId = null;
        let croppedFileName = null;

        // 5분할 모드가 ON일 때만 AI 분류 및 자동 크롭 실행
        if (is5SplitModeOn) {
          const aiResult = await classifyAndCropImage(file, getDirHandle(), getPatient(), dateStr);
          classId = aiResult.classId;
          croppedFileName = aiResult.croppedFileName; 
        }

        savedImages.push({ 
          original: file.name, 
          edited: croppedFileName, 
          class_id: classId 
        });
      }

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