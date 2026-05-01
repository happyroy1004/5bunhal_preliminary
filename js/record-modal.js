// js/record-modal.js

import { classifyImage } from "./classifier.js";
import { saveImageFile } from "./storage.js";

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

    // 대시보드로부터 현재 5분할 모드가 켜져 있는지 확인!
    const is5SplitModeOn = getIs5SplitMode();

    try {
      const savedImages = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 1. 파일 저장
        await saveImageFile(getDirHandle(), getPatient(), dateStr, file);

        // 2. 5분할 모드가 켜져 있을 때만 AI 분류 실행 (꺼져있으면 null)
        let classId = null;
        if (is5SplitModeOn) {
          classId = await classifyImage(file);
        }

        savedImages.push({ original: file.name, edited: null, class_id: classId });
      }

      const patient = getPatient();
      if (!patient.records) patient.records = [];
      
      const existingRecord = patient.records.find(r => r.date === dateStr);
      
      if (existingRecord) {
        existingRecord.images.push(...savedImages);
        if (memoStr.trim() !== "") {
          if (existingRecord.memo) {
            existingRecord.memo += "\n" + memoStr;
          } else {
            existingRecord.memo = memoStr;
          }
        }
      } else {
        patient.records.push({ id: Date.now(), date: dateStr, memo: memoStr, images: savedImages });
      }

      await savePatients();
      _close();
      form.reset();
      onSaved();
      
      if (is5SplitModeOn) {
        showAlert("AI 분류가 완료되었으며 진료 기록이 추가되었습니다.");
      } else {
        showAlert("진료 기록이 빠르게 추가되었습니다. (나중에 5분할 모드를 켜면 AI가 분류합니다)");
      }
      
    } catch (err) {
      showAlert("오류: " + err.message);
    } finally {
      saveBtn.innerText = "기록 저장"; saveBtn.disabled = false;
    }
  };
}