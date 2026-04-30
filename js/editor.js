import { saveEditedImage } from "./storage.js";

// ──────────────────────────────────────────
// 편집 상태
// ──────────────────────────────────────────
let _cropper      = null;
let _baseRotation = 0;
let _flipY        = 1;
let _target       = { record: null, index: -1, originalName: "" };

// ──────────────────────────────────────────
// 초기화: 버튼 이벤트 등록 (한 번만 호출)
// ──────────────────────────────────────────

/**
 * @param {object} opts
 * @param {FileSystemDirectoryHandle} opts.dirHandle  - getter 함수로 전달 (늦은 바인딩)
 * @param {Function} opts.getPatient   - () => activePatient
 * @param {Function} opts.onSaved      - 저장 완료 후 콜백 ()=>void
 * @param {Function} opts.showAlert    - (msg) => void
 */
export function initEditor({ getDirHandle, getPatient, onSaved, showAlert }) {
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
    _cropper.rotateTo(_baseRotation + parseInt(slider.value));
  };

  flipBtn.onclick = () => {
    if (!_cropper) return;
    _flipY = _flipY === 1 ? -1 : 1;
    _cropper.scaleY(_flipY);
  };

  slider.addEventListener("input", () => {
    sliderValue.innerText = slider.value + "°";
    if (_cropper) _cropper.rotateTo(_baseRotation + parseInt(slider.value));
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
          const editedName = await saveEditedImage(
            getDirHandle(), getPatient(),
            _target.record.date, _target.originalName, blob
          );
          _target.record.images[_target.index].edited = editedName;
          _close();
          onSaved();
          showAlert("크롭/편집본이 고화질로 저장되었습니다.");
        } catch {
          showAlert("저장 중 에러가 발생했습니다.");
        } finally {
          saveBtn.innerText = "크롭/편집본 저장"; saveBtn.disabled = false;
        }
      }, "image/jpeg", 1.0);
    } catch {
      showAlert("저장 중 에러가 발생했습니다.");
      saveBtn.innerText = "크롭/편집본 저장"; saveBtn.disabled = false;
    }
  };
}

// ──────────────────────────────────────────
// 편집 모달 열기
// ──────────────────────────────────────────

/**
 * @param {object} opts
 * @param {object}  opts.record
 * @param {number}  opts.index
 * @param {FileSystemDirectoryHandle} opts.dirHandle
 * @param {object}  opts.patient
 * @param {Function} opts.showAlert
 */
export async function openEditor({ record, index, dirHandle, patient, showAlert }) {
  const imgData = record.images[index];
  _target = { record, index, originalName: imgData.original };

  try {
    const pFolder = await dirHandle.getDirectoryHandle(
      `[${patient.chartNumber}]_${patient.name}_임상사진`
    );
    const dFolder = await pFolder.getDirectoryHandle(record.date);
    const fh      = await dFolder.getFileHandle(_target.originalName);
    const file    = await fh.getFile();

    const preview     = document.getElementById("editImagePreview");
    const slider      = document.getElementById("fineRotateSlider");
    const sliderValue = document.getElementById("fineRotateValue");

    preview.src           = URL.createObjectURL(file);
    slider.value          = 0;
    sliderValue.innerText = "0°";
    _baseRotation = 0;
    _flipY        = 1;

    document.getElementById("imageEditModal").classList.add("show");

    if (_cropper) _cropper.destroy();
    _cropper = new Cropper(preview, {
      initialAspectRatio: 4 / 3,
      viewMode: 1,
      dragMode: "move",
      background: false,
    });
  } catch {
    showAlert("원본 파일을 찾을 수 없어 편집할 수 없습니다.");
  }
}