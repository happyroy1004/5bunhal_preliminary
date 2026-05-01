// js/dashboard.js

import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

import { saveDirectoryHandle, loadDirectoryHandle, verifyPermission, loadPatients, savePatients } from "./storage.js";
import { renderPhotoViewer, export5SplitImage } from "./renderer.js"; 
import { renderTimeline, updateTimelineUI } from "./timeline.js";
import { initEditor, openEditor } from "./editor.js";
import { initAddPatientModal, initEditPatientModal } from "./patient-modal.js";
import { initRecordModal } from "./record-modal.js";

let dirHandle     = null;
let patientsData  = [];
let activePatient = null;
let is5SplitMode  = false;
let isCompareMode = false;
let selectedTagsFilter = new Set();
let selectedRecords    = [];   

const getDirHandle  = () => dirHandle;
const getPatient    = () => activePatient;
const getPatients   = () => patientsData;
const _savePatients = () => savePatients(dirHandle, patientsData);

onAuthStateChanged(auth, user => {
  if (user) {
    const name = user.displayName || user.email.split("@")[0];
    document.getElementById("navUserName").innerText  = name;
    document.getElementById("greetingName").innerText = name;
  } else {
    window.location.href = "index.html";
  }
});

document.getElementById("logoutBtn").onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};

function showAlert(msg) {
  document.getElementById("alertMessage").innerHTML = msg.replace(/\n/g, "<br>");
  document.getElementById("customAlertModal").classList.add("show");
}
document.getElementById("closeAlertBtn").onclick = () => document.getElementById("customAlertModal").classList.remove("show");

window.addEventListener("DOMContentLoaded", async () => {
  const saved       = await loadDirectoryHandle();
  const bannerActions = document.querySelector(".banner-actions");

  if (saved) {
    document.getElementById("workspaceStatus").innerHTML = `이전에 선택한 <b>'${saved.name}'</b> 폴더를 불러오시겠습니까?`;
    bannerActions.innerHTML = `
      <button id="restoreFolderBtn" class="btn-primary">폴더 연결 복구하기</button>
      <button id="newFolderBtn" class="btn-secondary" style="border-color:var(--btn-navy);color:var(--btn-navy);">새 폴더 연결하기</button>`;

    document.getElementById("restoreFolderBtn").onclick = async () => {
      if (await verifyPermission(saved)) { dirHandle = saved; _finishFolderSetup(); }
    };
    document.getElementById("newFolderBtn").onclick = async () => {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        await saveDirectoryHandle(dirHandle);
        _finishFolderSetup();
      } catch {}
    };
  } else {
    bannerActions.innerHTML = `<button id="selectFolderBtn" class="btn-primary">작업 폴더 선택 (필수)</button>`;
    document.getElementById("selectFolderBtn").onclick = async () => {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        await saveDirectoryHandle(dirHandle);
        _finishFolderSetup();
      } catch {}
    };
  }
  _initModules();
});

async function _finishFolderSetup() {
  document.getElementById("workspaceStatus").innerHTML = `연결된 작업 폴더: <b style="color:var(--btn-green);">${dirHandle.name}</b>`;
  document.querySelector(".banner-actions").style.display = "none";
  const toolbar = document.getElementById("mainToolbar");
  toolbar.style.opacity      = "1";
  toolbar.style.pointerEvents = "auto";

  patientsData = await loadPatients(dirHandle);
  _updateTagDropdown();
  _renderPatients();
}

function _initModules() {
  initAddPatientModal({ getDirHandle, getPatients, savePatients: _savePatients, onSaved: () => { _updateTagDropdown(); _renderPatients(); }, showAlert });
  initEditPatientModal({ getPatient, savePatients: _savePatients, onSaved: () => { _updateTagDropdown(); _renderPatients(); _openPatientDetail(activePatient); }, showAlert });
  initRecordModal({ 
    getDirHandle, 
    getPatient, 
    savePatients: _savePatients, 
    onSaved: () => _renderTimeline(), 
    showAlert,
    getIs5SplitMode: () => is5SplitMode 
  });
  initEditor({ getDirHandle, getPatient, getPatients, onSaved: () => _renderViewPanels(), showAlert });
}

document.getElementById("searchPatient").addEventListener("input", _renderPatients);

function _updateTagDropdown() {
  const allTags = new Set();
  patientsData.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));
  const container = document.getElementById("tagFilterContainer");
  container.innerHTML = "";
  allTags.forEach(tag => {
    const btn = document.createElement("button");
    btn.className = "filter-chip";
    btn.innerText = `#${tag}`;
    btn.onclick = () => {
      if (selectedTagsFilter.has(tag)) { selectedTagsFilter.delete(tag); btn.classList.remove("active"); }
      else                             { selectedTagsFilter.add(tag);    btn.classList.add("active");    }
      _renderPatients();
    };
    container.appendChild(btn);
  });
}

function _renderPatients() {
  const term = document.getElementById("searchPatient").value.toLowerCase().trim();
  const list = document.getElementById("patientList");
  list.innerHTML = "";

  const filtered = patientsData.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(term) || p.chartNumber.toLowerCase().includes(term);
    const matchTags   = selectedTagsFilter.size === 0 || Array.from(selectedTagsFilter).every(t => p.tags?.includes(t));
    return matchSearch && matchTags;
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h3>조건에 맞는 환자가 없습니다.</h3></div>`; return;
  }

  filtered.forEach(p => {
    const card = document.createElement("div"); card.className = "patient-card";
    card.innerHTML = `
      <div class="patient-card-header"><span class="patient-name">${p.name}</span><span style="color:#64748B;font-size:12px;">${p.chartNumber}</span></div>
      <div style="font-size:13px;color:#64748B;margin-bottom:10px;">초진: ${p.initialVisitDate || "미상"}</div>
      <div>${(p.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join("")}</div>`;
    card.onclick = () => _openPatientDetail(p);
    list.appendChild(card);
  });
}

document.getElementById("backToListBtn").onclick = () => {
  document.getElementById("patientDetailSection").style.display = "none"; document.getElementById("patientListSection").style.display   = "block";
  activePatient = null; selectedRecords = []; isCompareMode = false; _resetCompareUI();
};

function _openPatientDetail(patient) {
  activePatient = patient;
  document.getElementById("patientListSection").style.display   = "none"; document.getElementById("patientDetailSection").style.display = "block";
  document.getElementById("detailPatientName").innerText =  patient.name;
  document.getElementById("detailChartNo").innerText = `진료번호: ${patient.chartNumber} | 초진일: ${patient.initialVisitDate || "미설정"}`;
  document.getElementById("detailTags").innerHTML = (patient.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join("");
  document.getElementById("globalPatientMemo").value = patient.notes || "";
  selectedRecords = []; _renderTimeline();
}

document.getElementById("saveGlobalMemoBtn").onclick = async () => {
  if (!activePatient) return;
  activePatient.notes = document.getElementById("globalPatientMemo").value;
  await _savePatients(); showAlert("전체 특이사항 저장됨.");
};

document.getElementById("toggle5SplitBtn").onclick = () => {
  is5SplitMode = !is5SplitMode;
  const btn = document.getElementById("toggle5SplitBtn");
  btn.innerText        = `5분할 모드 ${is5SplitMode ? "ON" : "OFF"}`;
  btn.style.background = is5SplitMode ? "var(--btn-green)" : "var(--btn-navy)";
  _renderViewPanels();
};

document.getElementById("compareModeBtn").onclick = () => {
  isCompareMode = !isCompareMode;
  const btn = document.getElementById("compareModeBtn");

  if (isCompareMode) {
    btn.innerText = "비교 모드 (Before/After) ON"; btn.classList.replace("btn-secondary", "btn-primary"); btn.style.color = "white";
    document.getElementById("viewsContainer").className = "compare-layout"; document.getElementById("secondaryViewPanel").style.display = "block";
    if (selectedRecords.length === 1 && activePatient.records.length > 1) {
      const other = activePatient.records.find(r => r.id !== selectedRecords[0].id);
      if (other) { selectedRecords.push(other); selectedRecords.sort((a, b) => new Date(a.date) - new Date(b.date)); }
    }
  } else {
    _resetCompareUI();
    if (selectedRecords.length > 1) selectedRecords = [selectedRecords[1]];
  }
  updateTimelineUI(selectedRecords, isCompareMode); _renderViewPanels();
};

function _resetCompareUI() {
  const btn = document.getElementById("compareModeBtn");
  btn.innerText = "비교 모드 (Before/After) OFF"; btn.classList.replace("btn-primary", "btn-secondary"); btn.style.color = "var(--btn-navy)";
  document.getElementById("viewsContainer").className = "single-layout"; document.getElementById("secondaryViewPanel").style.display = "none";
}

function _renderTimeline() {
  if (!activePatient.records?.length) {
    document.getElementById("timelineBar").innerHTML = "<div style='color:#64748B;'>새 기록을 추가해주세요.</div>";
    document.getElementById("photoViewerPrimary").innerHTML = ""; document.getElementById("recordDatePrimary").innerHTML  = "날짜를 선택하세요";
    return;
  }
  renderTimeline({
    patient: activePatient, selectedRecords, isCompareMode,
    onSelect: () => { updateTimelineUI(selectedRecords, isCompareMode); _renderViewPanels(); },
  });
  if (!selectedRecords.length) { selectedRecords.push(activePatient.records[activePatient.records.length - 1]); }
  updateTimelineUI(selectedRecords, isCompareMode); _renderViewPanels();
}

function _renderViewPanels() {
  if (selectedRecords[0]) _loadPanel(selectedRecords[0], "Primary");
  if (isCompareMode) {
    if (selectedRecords[1]) _loadPanel(selectedRecords[1], "Secondary");
    else { document.getElementById("recordDateSecondary").innerHTML = "비교할 날짜 선택"; document.getElementById("photoViewerSecondary").innerHTML = ""; }
  }
}

async function _loadPanel(record, prefix) {
  const showDownload = is5SplitMode && record.images && record.images.length > 0;

  document.getElementById(`recordDate${prefix}`).innerHTML = `
    ${record.date}
    <button id="download5SplitBtn${prefix}"
            style="font-size:12px;margin-left:15px;padding:4px 8px;border-radius:4px;
                   border:1px solid var(--btn-navy);background:white;
                   color:var(--btn-navy);cursor:pointer; display:${showDownload ? 'inline-block' : 'none'};">
      ⬇️ 5분할 다운로드
    </button>
    <button id="deleteRecordBtn${prefix}"
            style="font-size:12px;margin-left:5px;padding:4px 8px;border-radius:4px;
                   border:1px solid var(--btn-red);background:white;
                   color:var(--btn-red);cursor:pointer;">
      🗑️ 이 기록 삭제
    </button>`;

  document.getElementById(`deleteRecordBtn${prefix}`).onclick = () => _deleteRecord(record);
  
  document.getElementById(`download5SplitBtn${prefix}`).onclick = () => export5SplitImage(record, dirHandle, activePatient);

  document.getElementById(`recordMemoTitle${prefix}`).innerText = record.date;
  document.getElementById(`recordMemo${prefix}`).value          = record.memo || "";

  await renderPhotoViewer({
    record, panelPrefix: prefix, is5SplitMode, dirHandle, activePatient,
    onDelete: (rec, idx) => _deleteImage(rec, idx, prefix),
    onEdit:   (rec, idx) => openEditor({ record: rec, index: idx, dirHandle, patient: activePatient, showAlert, getPatients }),
    onFullscreen: url => { document.getElementById("fullscreenImage").src = url; document.getElementById("fullscreenViewer").classList.add("show"); },
    onUpdateRecords: _savePatients
  });
}

async function _deleteRecord(record) {
  if (!confirm(`${record.date} 진료 기록을 완전히 삭제하시겠습니까?\n(로컬 폴더의 실제 사진 파일은 보존되며, 시스템 목록에서만 지워집니다.)`)) return;
  activePatient.records = activePatient.records.filter(r => r.id !== record.id);
  selectedRecords       = selectedRecords.filter(r => r.id !== record.id);
  if (!selectedRecords.length && activePatient.records.length) selectedRecords.push(activePatient.records[activePatient.records.length - 1]);
  await _savePatients(); _renderTimeline(); showAlert("진료 기록이 삭제되었습니다.");
}

async function _deleteImage(record, index, prefix) {
  if (!confirm("이 사진을 삭제하시겠습니까?\n(로컬 폴더의 실제 파일은 보존되며, 목록에서만 지워집니다.)")) return;
  record.images.splice(index, 1);
  await _savePatients(); _loadPanel(record, prefix); showAlert("사진이 삭제되었습니다.");
}

document.getElementById("saveMemoBtnPrimary").onclick = async () => {
  if (!selectedRecords[0]) return; selectedRecords[0].memo = document.getElementById("recordMemoPrimary").value; await _savePatients(); showAlert("차트 저장됨");
};
document.getElementById("saveMemoBtnSecondary").onclick = async () => {
  if (!selectedRecords[1]) return; selectedRecords[1].memo = document.getElementById("recordMemoSecondary").value; await _savePatients(); showAlert("차트 저장됨");
};

document.getElementById("closeViewerBtn").onclick = () => document.getElementById("fullscreenViewer").classList.remove("show");
document.getElementById("fullscreenViewer").onclick = e => { if (e.target === document.getElementById("fullscreenViewer")) document.getElementById("fullscreenViewer").classList.remove("show"); };