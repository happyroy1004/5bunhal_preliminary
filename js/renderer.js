// js/renderer.js

// 💡 1. classifyImage 를 추가로 import 합니다.
import { CLASS_NAME_KR, CLASS_POSITION_CSS, classifyImage } from "./classifier.js";
import { getDateFolder } from "./storage.js";

const FIVE_SPLIT_ORDER = [1, 2, 3, 4, 5];

export async function renderPhotoViewer({
  record, panelPrefix, is5SplitMode,
  dirHandle, activePatient,
  onDelete, onEdit, onFullscreen, onUpdateRecords // 💡 2. onUpdateRecords 매개변수 추가
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
      await _render5Split(viewer, record, dFolder, onDelete, onEdit, onFullscreen, onUpdateRecords);
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
// 5분할 렌더링 (AI 지연 분류 & Drag&Drop 포함)
// ──────────────────────────────────────────
async function _render5Split(viewer, record, dFolder, onDelete, onEdit, onFullscreen, onUpdateRecords) {
  viewer.className = "five-split-layout";

  // 💡 분류 안 된 사진이 있는지 확인
  const needsAI = record.images.some(img => !img.class_id);
  
  if (needsAI) {
    // 분류 대기 중일 때는 화면에 로딩 메시지를 먼저 띄워줍니다.
    viewer.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--btn-navy);"><b>AI가 사진 위치를 분석 중입니다... ⏳</b></div>`;
  }

  let needSave = false;

  // 💡 1. 지연 분류 (Lazy Classification): class_id가 없는 사진만 AI 돌리기
  for (const img of record.images) {
    if (!img.class_id) {
      try {
        const fh = await dFolder.getFileHandle(img.edited || img.original);
        const file = await fh.getFile();
        
        // AI 모델에 파일 던져서 위치 알아내기
        img.class_id = await classifyImage(file);
        needSave = true;
      } catch (e) {
        console.error("AI 지연 분류 실패:", e);
      }
    }
  }

  // 💡 2. 중복 충돌 방지 (예: AI가 상악이라고 2번 대답한 경우 방지)
  const usedClasses = new Set();
  const unassigned = [];
  
  record.images.forEach(img => {
    // 이미 자리가 차지된 class_id라면 unassigned(미배정)로 뺍니다.
    if (img.class_id && !usedClasses.has(img.class_id)) {
      usedClasses.add(img.class_id);
    } else {
      unassigned.push(img);
    }
  });

  // 미배정된 사진들을 남아있는 빈 슬롯에 욱여넣습니다.
  if (unassigned.length > 0) {
    let availClasses = FIVE_SPLIT_ORDER.filter(c => !usedClasses.has(c));
    unassigned.forEach(img => {
      if (availClasses.length > 0) {
        img.class_id = availClasses.shift();
        needSave = true;
      }
    });
  }

  // 💡 3. 변경 사항이 생겼다면 데이터베이스(json)에 영구 저장!
  if (needSave && typeof onUpdateRecords === 'function') {
    await onUpdateRecords();
  }

  // --- 여기서부터는 기존의 정상적인 HTML 그리기 코드 ---
  let html = "";
  for (const classId of FIVE_SPLIT_ORDER) {
    const posClass = CLASS_POSITION_CSS[classId];
    const label    = CLASS_NAME_KR[classId];
    const imgData  = record.images.find(img => img.class_id === classId);

    if (!imgData) {
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
  _bindDragAndDrop(viewer, record, onUpdateRecords); 
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

function _imageCard({ url, posClass, label, index, showLabel }) {
  const badge = showLabel && label ? `<div style="position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.55); color:white;font-size:11px;padding:2px 8px;border-radius:10px; pointer-events:none;">${label}</div>` : "";
  return `
    <div class="image-wrapper ${posClass}" data-index="${index}">
      <div class="image-overlay"><button class="btn-icon edit">✂️ 편집</button><button class="btn-icon delete">🗑️ 삭제</button></div>
      <img src="${url}" data-url="${url}" alt="임상사진">${badge}
    </div>`;
}

function _bindEvents(viewer, record, onDelete, onEdit, onFullscreen) {
  viewer.querySelectorAll("img").forEach(img => { img.ondblclick = () => onFullscreen(img.dataset.url); });
  viewer.querySelectorAll(".btn-icon.edit").forEach(btn => { btn.onclick = e => { e.stopPropagation(); onEdit(record, parseInt(e.target.closest(".image-wrapper").dataset.index)); }; });
  viewer.querySelectorAll(".btn-icon.delete").forEach(btn => { btn.onclick = e => { e.stopPropagation(); onDelete(record, parseInt(e.target.closest(".image-wrapper").dataset.index)); }; });
}

// ──────────────────────────────────────────
// Drag & Drop 이벤트 바인딩 (위치 변경 시 자동 저장 포함)
// ──────────────────────────────────────────
function _bindDragAndDrop(viewer, record, onUpdateRecords) {
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

    wrapper.addEventListener('drop', async function(e) {
      e.stopPropagation();
      this.style.border = '';
      
      if (draggedEl !== this) {
        const draggedClassId = parseInt(draggedEl.getAttribute('data-class-id'));
        const targetClassId = parseInt(this.getAttribute('data-class-id'));

        const draggedImg = record.images.find(img => img.class_id === draggedClassId);
        const targetImg = record.images.find(img => img.class_id === targetClassId);

        if (draggedImg) draggedImg.class_id = targetClassId;
        if (targetImg) targetImg.class_id = draggedClassId;

        const draggedPosClass = CLASS_POSITION_CSS[draggedClassId];
        const targetPosClass = CLASS_POSITION_CSS[targetClassId];
        
        draggedEl.classList.remove(draggedPosClass);
        draggedEl.classList.add(targetPosClass);
        draggedEl.setAttribute('data-class-id', targetClassId);
        
        this.classList.remove(targetPosClass);
        this.classList.add(draggedPosClass);
        this.setAttribute('data-class-id', draggedClassId);

        // 사용자가 드래그로 순서를 바꾼 것도 즉시 DB에 반영합니다.
        if (typeof onUpdateRecords === 'function') await onUpdateRecords();
      }
      return false;
    });

    wrapper.addEventListener('dragend', function(e) {
      this.style.opacity = '1';
      wrappers.forEach(w => w.style.border = '');
    });
  });
}

// ──────────────────────────────────────────
// 5분할 고화질 다운로드
// ──────────────────────────────────────────
export async function export5SplitImage(record, dirHandle, activePatient) {
  if (!record.images || record.images.length === 0) {
    alert("다운로드할 사진이 없습니다.");
    return;
  }

  const byClass = {};
  record.images.forEach(img => { if (img.class_id) byClass[img.class_id] = img; });

  const dFolder = await getDateFolder(dirHandle, activePatient, record.date);
  const loadedImages = {};

  for (const classId of FIVE_SPLIT_ORDER) {
    const imgData = byClass[classId];
    if (imgData) {
      try {
        const fh = await dFolder.getFileHandle(imgData.edited || imgData.original);
        const url = URL.createObjectURL(await fh.getFile());
        const img = new Image();
        img.src = url;
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        loadedImages[classId] = img;
      } catch (e) { console.warn("파일 로드 실패:", e); }
    }
  }

  if (Object.keys(loadedImages).length === 0) {
    alert("다운로드할 유효한 사진 파일이 없습니다.");
    return;
  }

  let baseW = 1200, baseH = 900;
  if (loadedImages[3]) {
    baseW = loadedImages[3].naturalWidth;
    baseH = loadedImages[3].naturalHeight;
  } else {
    const firstImg = Object.values(loadedImages)[0];
    baseW = firstImg.naturalWidth;
    baseH = firstImg.naturalHeight;
  }

  const gap = 30; 
  const dims = {};

  for (const classId of FIVE_SPLIT_ORDER) {
    if (!loadedImages[classId]) continue;
    const img = loadedImages[classId];
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    if (classId === 1 || classId === 5) {
      const scale = baseW / w;
      dims[classId] = { w: baseW, h: h * scale };
    } else if (classId === 2 || classId === 4) {
      const scale = baseH / h;
      dims[classId] = { w: w * scale, h: baseH };
    } else {
      dims[classId] = { w: baseW, h: baseH }; 
    }
  }

  const h1 = dims[1] ? dims[1].h : 0;
  const h3 = dims[3] ? dims[3].h : baseH;
  const h5 = dims[5] ? dims[5].h : 0;
  const w2 = dims[2] ? dims[2].w : 0;
  const w3 = dims[3] ? dims[3].w : baseW;
  const w4 = dims[4] ? dims[4].w : 0;

  const canvasWidth = (w2 > 0 ? w2 + gap : 0) + w3 + (w4 > 0 ? gap + w4 : 0);
  const canvasHeight = (h1 > 0 ? h1 + gap : 0) + h3 + (h5 > 0 ? gap + h5 : 0);

  const x2 = 0;
  const xCenter = w2 > 0 ? w2 + gap : 0;
  const x4 = xCenter + w3 + gap;
  const y1 = 0;
  const yCenter = h1 > 0 ? h1 + gap : 0;
  const y5 = yCenter + h3 + gap;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  const draw = (id, x, y) => {
    if (loadedImages[id] && dims[id]) {
      ctx.drawImage(loadedImages[id], x, y, dims[id].w, dims[id].h);
    }
  };

  draw(1, xCenter, y1);      
  draw(2, x2, yCenter);      
  draw(3, xCenter, yCenter); 
  draw(4, x4, yCenter);      
  draw(5, xCenter, y5);      

  const dataUrl = canvas.toDataURL("image/png", 1.0);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `[${activePatient.name}]_${record.date}_5분할.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}