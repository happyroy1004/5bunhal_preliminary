// renderer.js

import { CLASS_NAME_KR, CLASS_POSITION_CSS } from "./classifier.js";
import { getDateFolder } from "./storage.js";

const FIVE_SPLIT_ORDER = [1, 2, 3, 4, 5];

/**
 * 진료 기록의 사진을 패널에 렌더링합니다.
 * is5SplitMode에 따라 5분할 그리드 또는 일반 그리드로 표시합니다.
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
// 5분할 렌더링 (Drag & Drop 기능 추가됨)
// ──────────────────────────────────────────

async function _render5Split(viewer, record, dFolder, onDelete, onEdit, onFullscreen) {
  viewer.className = "five-split-layout";

  // 1. 현재 record.images에 class_id가 완벽히 매핑되어 있는지 확인
  // 안 되어있다면 (기존 데이터) 빈 슬롯 순서대로 임의 할당해줌
  let hasMissingClass = false;
  const usedClasses = new Set();
  
  record.images.forEach(img => {
    if (img.class_id) usedClasses.add(img.class_id);
    else hasMissingClass = true;
  });

  if (hasMissingClass) {
    let availClasses = FIVE_SPLIT_ORDER.filter(c => !usedClasses.has(c));
    record.images.forEach(img => {
      if (!img.class_id && availClasses.length > 0) {
        img.class_id = availClasses.shift();
      }
    });
  }

  let html = "";
  for (const classId of FIVE_SPLIT_ORDER) {
    const posClass = CLASS_POSITION_CSS[classId];
    const label    = CLASS_NAME_KR[classId];
    
    // 현재 classId를 가진 이미지를 찾음
    const imgData  = record.images.find(img => img.class_id === classId);

    if (!imgData) {
      // 사진이 없는 빈 슬롯도 드래그 앤 드롭이 가능하게 세팅
      html += `
        <div class="image-wrapper ${posClass}" data-class-id="${classId}" draggable="true"
             style="display:flex;align-items:center;justify-content:center;
                    background:#F1F5F9;min-height:150px; border:2px dashed #CBD5E1;">
          <span style="color:#94A3B8;font-size:13px;text-align:center; pointer-events:none;">
            ${label}<br>사진 없음
          </span>
        </div>`;
      continue;
    }

    const index = record.images.indexOf(imgData);
    try {
      const fh  = await dFolder.getFileHandle(imgData.edited || imgData.original);
      const url = URL.createObjectURL(await fh.getFile());
      
      // 드래그 속성(draggable="true") 및 data-class-id 추가
      html += `
        <div class="image-wrapper ${posClass}" data-index="${index}" data-class-id="${classId}" draggable="true">
          <div class="image-overlay">
            <button class="btn-icon edit">✂️ 편집</button>
            <button class="btn-icon delete">🗑️ 삭제</button>
          </div>
          <img src="${url}" data-url="${url}" alt="임상사진">
          <div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.55);
                      color:white;font-size:11px;padding:2px 8px;border-radius:10px;
                      pointer-events:none;">${label}</div>
        </div>`;
    } catch {
      html += `
        <div class="image-wrapper ${posClass}" data-class-id="${classId}" draggable="true"
             style="display:flex;align-items:center;justify-content:center;
                    background:#FEF2F2;min-height:150px;">
          <span style="color:var(--btn-red);font-size:12px;text-align:center; pointer-events:none;">
            ${label}<br>파일 없음
          </span>
        </div>`;
    }
  }

  viewer.innerHTML = html;
  _bindEvents(viewer, record, onDelete, onEdit, onFullscreen);
  _bindDragAndDrop(viewer, record); // 💡 드래그 앤 드롭 이벤트 바인딩 추가
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

// ──────────────────────────────────────────
// 💡 드래그 앤 드롭 헬퍼 함수
// ──────────────────────────────────────────
function _bindDragAndDrop(viewer, record) {
  let draggedEl = null;

  const wrappers = viewer.querySelectorAll('.image-wrapper');
  
  wrappers.forEach(wrapper => {
    wrapper.addEventListener('dragstart', function(e) {
      draggedEl = this;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', this.innerHTML);
      this.style.opacity = '0.4';
    });

    wrapper.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      return false;
    });

    wrapper.addEventListener('dragenter', function(e) {
      this.style.border = '2px dashed var(--btn-navy)';
    });

    wrapper.addEventListener('dragleave', function(e) {
      this.style.border = '';
    });

    wrapper.addEventListener('drop', function(e) {
      e.stopPropagation();
      this.style.border = '';
      
      if (draggedEl !== this) {
        // HTML 클래스 Swap (그리드 위치 변경)
        const draggedClassId = parseInt(draggedEl.getAttribute('data-class-id'));
        const targetClassId = parseInt(this.getAttribute('data-class-id'));

        // 데이터베이스(record.images) 내의 class_id Swap
        const draggedImg = record.images.find(img => img.class_id === draggedClassId);
        const targetImg = record.images.find(img => img.class_id === targetClassId);

        if (draggedImg) draggedImg.class_id = targetClassId;
        if (targetImg) targetImg.class_id = draggedClassId;

        // UI를 즉시 강제 리렌더링 하기 위해 클래스 이름 스왑
        const draggedPosClass = CLASS_POSITION_CSS[draggedClassId];
        const targetPosClass = CLASS_POSITION_CSS[targetClassId];
        
        draggedEl.classList.remove(draggedPosClass);
        draggedEl.classList.add(targetPosClass);
        draggedEl.setAttribute('data-class-id', targetClassId);
        
        this.classList.remove(targetPosClass);
        this.classList.add(draggedPosClass);
        this.setAttribute('data-class-id', draggedClassId);
      }
      return false;
    });

    wrapper.addEventListener('dragend', function(e) {
      this.style.opacity = '1';
      wrappers.forEach(w => w.style.border = '');
    });
  });
}