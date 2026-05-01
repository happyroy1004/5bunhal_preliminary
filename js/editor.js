// js/editor.js

import { saveEditedImage, savePatients } from "./storage.js";

let _cropper      = null;
let _baseRotation = 0;
let _flipY        = 1;
let _target       = { record: null, index: -1, originalName: "" };

export function initEditor({ getDirHandle, getPatient, onSaved, showAlert, getPatients }) {
  const modal        = document.getElementById("imageEditModal");
  const preview      = document.getElementById("editImagePreview");
  const slider       = document.getElementById("fineRotateSlider");
  const sliderValue  = document.getElementById("fineRotateValue");
  const rotateBtn    = document.getElementById("rotateLeftBtn");
  const flipBtn      = document.getElementById("flipVerticalBtn");
  const saveBtn      = document.getElementById("saveEditImageBtn");
  const cancelBtn    = document.getElementById("cancelEditImageBtn");
  const closeBtn     = document.getElementById("closeEditImageBtn");

  const _close = () => modal.classList.remove("show");
  closeBtn.onclick  = _close;
  cancelBtn.onclick = _close;

  rotateBtn.onclick = () => {
    if (!_cropper) return;
    _baseRotation -= 90;
    // 💡 부드러운 감도를 위해 정수(parseInt) 대신 소수점(parseFloat) 사용
    _cropper.rotateTo(_baseRotation + parseFloat(slider.value));
  };

  flipBtn.onclick = () => {
    if (!_cropper) return;
    _flipY = _flipY === 1 ? -1 : 1;
    _cropper.scaleY(_flipY);
  };

  // 💡 슬라이더를 마우스로 드래그할 때
  slider.addEventListener("input", () => {
    sliderValue.innerText = parseFloat(slider.value).toFixed(1) + "°";
    if (_cropper) _cropper.rotateTo(_baseRotation + parseFloat(slider.value));
  });

  // ✨ [핵심 추가] 마우스 휠로 회전 조절하기
  const previewContainer = preview.parentElement; // 사진이 담긴 박스
  previewContainer.addEventListener("wheel", (e) => {
    if (!_cropper) return;
    e.preventDefault(); // 휠을 굴릴 때 웹페이지 전체가 위아래로 흔들리는 것 방지

    let currentValue = parseFloat(slider.value);
    const step = 1.0; // 휠 한 칸 굴릴 때 돌아가는 각도 감도 (취향껏 조절 가능)

    // 스크롤 방향에 따라 각도 더하기/빼기
    if (e.deltaY > 0) {
      currentValue -= step; // 휠을 내리면 왼쪽으로 미세 회전
    } else {
      currentValue += step; // 휠을 올리면 오른쪽으로 미세 회전
    }

    // -45도 ~ 45도 제한 구역 설정
    if (currentValue < -45) currentValue = -45;
    if (currentValue > 45) currentValue = 45;

    // 변경된 값을 슬라이더와 화면에 즉시 동기화
    slider.value = currentValue;
    sliderValue.innerText = currentValue.toFixed(1) + "°";
    _cropper.rotateTo(_baseRotation + currentValue);
  });

  saveBtn.onclick = async () => {
    if (!_cropper) return;
    saveBtn.innerText = "저장 중..."; saveBtn.disabled = true;
    try {
      const canvas = _cropper.getCroppedCanvas({
        imageSmoothingEnabled: true, imageSmoothingQuality: "high",
      });
      canvas.toBlob(async blob => {
        try {
          const dirHandle = getDirHandle();
          const editedName = await saveEditedImage(dirHandle, getPatient(), _target.record.date, _target.originalName, blob);
          _target.record.images[_target.index].edited = editedName;
          
          if (getPatients) await savePatients(dirHandle, getPatients());
          
          _close();
          onSaved(); 
          showAlert("크롭/편집본이 고화질로 저장되었습니다.");
        } catch (error) {
          showAlert("저장 중 에러가 발생했습니다: " + error.message);
        } finally {
          saveBtn.innerText = "크롭/편집본 저장"; saveBtn.disabled = false;
        }
      }, "image/jpeg", 1.0);
    } catch {
      showAlert("저장 전 캔버스 생성 중 에러가 발생했습니다.");
      saveBtn.innerText = "크롭/편집본 저장"; saveBtn.disabled = false;
    }
  };
}

export async function openEditor({ record, index, dirHandle, patient, showAlert }) {
  const imgData = record.images[index];
  _target = { record, index, originalName: imgData.original };

  try {
    const pFolder = await dirHandle.getDirectoryHandle(`[${patient.chartNumber}]_${patient.name}_임상사진`);
    const dFolder = await pFolder.getDirectoryHandle(record.date);
    const fh      = await dFolder.getFileHandle(_target.originalName);
    const file    = await fh.getFile();

    const preview     = document.getElementById("editImagePreview");
    const slider      = document.getElementById("fineRotateSlider");
    const sliderValue = document.getElementById("fineRotateValue");

    preview.src           = URL.createObjectURL(file);
    slider.value          = 0;
    sliderValue.innerText = "0.0°";
    _baseRotation = 0;
    _flipY        = 1;

    document.getElementById("imageEditModal").classList.add("show");

    if (_cropper) _cropper.destroy();
    _cropper = new Cropper(preview, {
      initialAspectRatio: 4 / 3,
      viewMode: 1,
      dragMode: "move",
      background: false,
      zoomOnWheel: false, // 💡 마우스 휠 기능(확대/축소)을 끄고 회전용으로 양보!
    });
  } catch {
    showAlert("원본 파일을 찾을 수 없어 편집할 수 없습니다.");
  }
}
