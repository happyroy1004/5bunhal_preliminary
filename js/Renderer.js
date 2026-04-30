import { CLASS_NAME_KR, CLASS_POSITION_CSS } from "./classifier.js";
import { getDateFolder } from "./storage.js";

const FIVE_SPLIT_ORDER = [1, 2, 3, 4, 5];

/**
 * 진료 기록의 사진을 패널에 렌더링합니다.
 * is5SplitMode에 따라 5분할 그리드 또는 일반 그리드로 표시합니다.
 *
 * @param {object} opts
 * @param {object}  opts.record
 * @param {string}  opts.panelPrefix       "Primary" | "Secondary"
 * @param {boolean} opts.is5SplitMode
 * @param {FileSystemDirectoryHandle} opts.dirHandle
 * @param {object}  opts.activePatient
 * @param {Function} opts.onDelete         (record, index) => void
 * @param {Function} opts.onEdit           (record, index) => void
 * @param {Function} opts.onFullscreen     (objectUrl) => void
 */
export async function renderPhotoViewer({
  record, panelPrefix, is5SplitMode,
  dirHandle, activePatient,
  onDelete, onEdit, onFullscreen,
}) {
  const viewer = document.getElementById(`photoViewer${panelPrefix}`);

  if (!record.images || record.images.length === 0) {
    viewer.className = "image-grid";
    viewer.innerHTML = `
      <div style="color:#64748B;text-align:center;padding:30px;
                  grid-column:1/-1;background:#F8FAFC;border-radius:8px;">
        첨부된 사진이 없습니다. 차트 내용만 존재합니다.
      </div>`;
    return;
  }

  try {
    const dFolder = await getDateFolder(dirHandle, activePatient, record.date);
    if (is5SplitMode) {
      await _render5Split(viewer, record, dFolder, onDelete, onEdit, onFullscreen);
    } else {
      await _renderGrid(viewer, record, dFolder, onDelete, onEdit, onFullscreen);
    }
  } catch {
    viewer.innerHTML = `
      <div style="color:var(--btn-red);grid-column:1/-1;">
        사진 파일이 손상되었거나 폴더가 이동되었습니다.
      </div>`;
  }
}

// ──────────────────────────────────────────
// 5분할 렌더링
// ──────────────────────────────────────────

async function _render5Split(viewer, record, dFolder, onDelete, onEdit, onFullscreen) {
  viewer.className = "five-split-layout";

  // class_id → imgData 매핑
  const byClass = {};
  for (const imgData of record.images) {
    if (imgData.class_id && !byClass[imgData.class_id]) {
      byClass[imgData.class_id] = imgData;
    }
  }

  // class_id 없는 이미지(구 데이터)는 빈 슬롯에 순서대로 채움
  const unclassified = record.images.filter(img => !img.class_id);
  let ui = 0;
  for (const classId of FIVE_SPLIT_ORDER) {
    if (!byClass[classId] && ui < unclassified.length) {
      byClass[classId] = unclassified[ui++];
    }
  }

  let html = "";
  for (const classId of FIVE_SPLIT_ORDER) {
    const posClass = CLASS_POSITION_CSS[classId];
    const label    = CLASS_NAME_KR[classId];
    const imgData  = byClass[classId];

    if (!imgData) {
      html += `
        <div class="image-wrapper ${posClass}"
             style="display:flex;align-items:center;justify-content:center;
                    background:#F1F5F9;min-height:150px;">
          <span style="color:#94A3B8;font-size:13px;text-align:center;">
            ${label}<br>사진 없음
          </span>
        </div>`;
      continue;
    }

    const index = record.images.indexOf(imgData);
    try {
      const fh  = await dFolder.getFileHandle(imgData.edited || imgData.original);
      const url = URL.createObjectURL(await fh.getFile());
      html += _imageCard({ url, posClass, label, index, showLabel: true });
    } catch {
      html += `
        <div class="image-wrapper ${posClass}"
             style="display:flex;align-items:center;justify-content:center;
                    background:#FEF2F2;min-height:150px;">
          <span style="color:var(--btn-red);font-size:12px;text-align:center;">
            ${label}<br>파일 없음
          </span>
        </div>`;
    }
  }

  viewer.innerHTML = html;
  _bindEvents(viewer, record, onDelete, onEdit, onFullscreen);
}

// ──────────────────────────────────────────
// 일반 그리드 렌더링
// ──────────────────────────────────────────

async function _renderGrid(viewer, record, dFolder, onDelete, onEdit, onFullscreen) {
  viewer.className = "image-grid";
  let html = "";

  for (let i = 0; i < record.images.length; i++) {
    const imgData = record.images[i];
    const label   = imgData.class_id ? CLASS_NAME_KR[imgData.class_id] : null;
    try {
      const fh  = await dFolder.getFileHandle(imgData.edited || imgData.original);
      const url = URL.createObjectURL(await fh.getFile());
      html += _imageCard({ url, posClass: "", label, index: i, showLabel: !!label });
    } catch {
      html += `
        <div class="image-wrapper">
          <div style="height:200px;display:flex;align-items:center;justify-content:center;
                      background:#FEF2F2;border-radius:8px;">
            <span style="color:var(--btn-red);font-size:12px;">파일 없음</span>
          </div>
        </div>`;
    }
  }

  viewer.innerHTML = html;
  _bindEvents(viewer, record, onDelete, onEdit, onFullscreen);
}

// ──────────────────────────────────────────
// 공통 헬퍼
// ──────────────────────────────────────────

function _imageCard({ url, posClass, label, index, showLabel }) {
  const badge = showLabel && label
    ? `<div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.55);
                   color:white;font-size:11px;padding:2px 8px;border-radius:10px;
                   pointer-events:none;">${label}</div>`
    : "";
  return `
    <div class="image-wrapper ${posClass}" data-index="${index}">
      <div class="image-overlay">
        <button class="btn-icon edit">✂️ 편집</button>
        <button class="btn-icon delete">🗑️ 삭제</button>
      </div>
      <img src="${url}" data-url="${url}" alt="임상사진">
      ${badge}
    </div>`;
}

function _bindEvents(viewer, record, onDelete, onEdit, onFullscreen) {
  viewer.querySelectorAll("img").forEach(img => {
    img.ondblclick = () => onFullscreen(img.dataset.url);
  });
  viewer.querySelectorAll(".btn-icon.edit").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      onEdit(record, parseInt(e.target.closest(".image-wrapper").dataset.index));
    };
  });
  viewer.querySelectorAll(".btn-icon.delete").forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      onDelete(record, parseInt(e.target.closest(".image-wrapper").dataset.index));
    };
  });
}