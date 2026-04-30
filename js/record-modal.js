// js/record-modal.js

import { classifyAndCropImage } from "./classifier.js";
import { saveImageFile } from "./storage.js";

/**
 * 진료 기록 추가 모달을 초기화합니다.
 * "기록 저장" 버튼 클릭 시 5분할 모드 여부에 따라 이미지를 분류/크롭하고 저장합니다.
 *
 * @param {object} opts
 * @param {Function} opts.getDirHandle   - () => dirHandle
 * @param {Function} opts.getPatient     - () => activePatient
 * @param {Function} opts.savePatients   - () => Promise<void>
 * @param {Function} opts.onSaved        - 저장 완료 후 콜백 ()=>void
 * @param {Function} opts.showAlert      - (msg) => void
 * @param {Function} opts.getIs5SplitMode- () => boolean (5분할 모드 상태 반환)
 */
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

    // 💡 화면 UI(DOM) 대신, dashboard에서 전달받은 안전한 상태값을 읽어옵니다.
    const is5SplitModeOn = getIs5SplitMode();

    try {
      const savedImages = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 1. 원본 파일 저장 (공통)
        await saveImageFile(getDirHandle(), getPatient(), dateStr, file);

        let classId = null;
        let croppedFileName = null;

        // 2. 5분할 모드가 ON일 때만 AI 분류 및 자동 크롭 실행!
        if (is5SplitModeOn) {
          const aiResult = await classifyAndCropImage(file, getDirHandle(), getPatient(), dateStr);
          classId = aiResult.classId;
          croppedFileName = aiResult.croppedFileName; 
        }

        // 3. 기록에 추가 (크롭된 파일이 있으면 edited 속성에 바로 넣어줍니다)
        savedImages.push({ 
          original: file.name, 
          edited: croppedFileName, 
          class_id: classId 
        });
      }

      // 4. 환자 기록 배열 업데이트 (같은 날짜면 병합, 아니면 새로 추가)
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

      // 5. DB 저장 및 모달 닫기
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