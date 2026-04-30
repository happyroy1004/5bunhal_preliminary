import { saveEditedImage, savePatients } from "./storage.js";

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
 * @param {Function} opts.getPatients  - (추가됨) 전체 환자 데이터를 불러옴
 */
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
          const dirHandle = getDirHandle();
          
          // 1. 로컬 폴더에 편집된 새 이미지 파일 저장
          const editedName = await saveEditedImage(
            dirHandle, getPatient(),
            _target.record.date, _target.originalName, blob
          );
          
          // 2. 현재 메모리에 있는 환자 데이터 업데이트 (original / edited 매핑 갱신)
          _target.record.images[_target.index].edited = editedName;
          
          // 💡 3. 가장 중요한 부분!! 변경된 메모리 데이터를 patients_db.json 파일로 덮어쓰기 저장!
          if (getPatients) {
            await savePatients(dirHandle, getPatients());
          }
          
          _close();
          onSaved(); // 화면 리렌더링 (renderer.js가 이제 새 edited 파일을 읽어옵니다)
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

// ──────────────────────────────────────────
// 편집 모달 열기
// ──────────────────────────────────────────

export async function openEditor({ record, index, dirHandle, patient, showAlert }) {
  const imgData = record.images[index];
  _target = { record, index, originalName: imgData.original };

  try {
    const pFolder = await dirHandle.getDirectoryHandle(
      `[${patient.chartNumber}]_${patient.name}_임상사진`
    );
    const dFolder = await pFolder.getDirectoryHandle(record.date);
    
    // 💡 편집을 위해 띄우는 원본은 무조건 .original 파일을 가져와야 합니다.
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