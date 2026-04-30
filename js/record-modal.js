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

    try {
      const savedImages = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // 1. 파일 저장
        await saveImageFile(getDirHandle(), getPatient(), dateStr, file);

        // 2. AI 분류 (저장 시점에 실행)
        const classId = await classifyImage(file);

        savedImages.push({ original: file.name, edited: null, class_id: classId });
      }

      const patient = getPatient();
      if (!patient.records) patient.records = [];
      
      // 💡 [수정된 핵심 로직] 같은 날짜(dateStr)의 기록이 이미 존재하는지 검사!
      const existingRecord = patient.records.find(r => r.date === dateStr);
      
      if (existingRecord) {
        // 이미 같은 날짜의 기록이 있다면 사진을 기존 배열에 병합(Merge)
        existingRecord.images.push(...savedImages);
        
        // 메모 내용도 비어있지 않다면 기존 메모 아래에 줄바꿈으로 추가
        if (memoStr.trim() !== "") {
          if (existingRecord.memo) {
            existingRecord.memo += "\n" + memoStr;
          } else {
            existingRecord.memo = memoStr;
          }
        }
      } else {
        // 같은 날짜의 기록이 없다면 기존처럼 새 노드로 추가
        patient.records.push({ id: Date.now(), date: dateStr, memo: memoStr, images: savedImages });
      }

      await savePatients();
      _close();
      form.reset();
      onSaved();
      showAlert("진료 기록이 성공적으로 추가되었습니다.");
    } catch (err) {
      showAlert("오류: " + err.message);
    } finally {
      saveBtn.innerText = "기록 저장"; saveBtn.disabled = false;
    }
  };
}