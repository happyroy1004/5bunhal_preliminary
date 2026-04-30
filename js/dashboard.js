import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// ====== DOM 요소 설정 ======
const navUserName = document.getElementById("navUserName");
const greetingName = document.getElementById("greetingName");
const logoutBtn = document.getElementById("logoutBtn");

const selectFolderBtn = document.getElementById("selectFolderBtn");
const workspaceStatus = document.getElementById("workspaceStatus");
const mainToolbar = document.getElementById("mainToolbar");
const patientList = document.getElementById("patientList");

const searchPatientInput = document.getElementById("searchPatient");
const tagFilterContainer = document.getElementById("tagFilterContainer");

const sectionList = document.getElementById("patientListSection");
const sectionDetail = document.getElementById("patientDetailSection");
const backToListBtn = document.getElementById("backToListBtn");

// 모달들
const patientModal = document.getElementById("addPatientModal");
const addPatientBtn = document.getElementById("addPatientBtn");
const addPatientForm = document.getElementById("addPatientForm");

const editPatientModal = document.getElementById("editPatientModal");
const editPatientBtn = document.getElementById("editPatientBtn");
const editPatientForm = document.getElementById("editPatientForm");

const recordModal = document.getElementById("addRecordModal");
const addRecordBtn = document.getElementById("addRecordBtn");
const addRecordForm = document.getElementById("addRecordForm");

const customAlertModal = document.getElementById("customAlertModal");
const alertMessage = document.getElementById("alertMessage");
const closeAlertBtn = document.getElementById("closeAlertBtn");

// 비교 모드 관련 DOM
const compareModeBtn = document.getElementById("compareModeBtn");
const viewsContainer = document.getElementById("viewsContainer");
const secondaryViewPanel = document.getElementById("secondaryViewPanel");

// 전역 변수
let dirHandle = null;     
let patientsData = [];    
let activePatient = null; 
let is5SplitMode = false; 
let isCompareMode = false;
let selectedTagsFilter = new Set(); 
let selectedRecords = []; // 단일 모드일 땐 1개, 비교 모드일 땐 2개까지 저장

// ====== 1. 인증 및 공통 알림 ======
onAuthStateChanged(auth, (user) => {
  if (user) {
    const displayName = user.displayName || user.email.split('@')[0];
    navUserName.innerText = displayName; greetingName.innerText = displayName;
  } else window.location.href = "index.html";
});
logoutBtn.onclick = async () => { await signOut(auth); window.location.href = "index.html"; };

function showNotification(msg) {
  alertMessage.innerHTML = msg.replace(/\n/g, '<br>');
  customAlertModal.classList.add("show");
}
closeAlertBtn.onclick = () => customAlertModal.classList.remove("show");

// ====== 2. 폴더 영구 기억 (IndexedDB) ======
function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("DentalCaseDB", 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore("handles");
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}
async function saveDirectoryHandle(handle) {
  const db = await getDB();
  const tx = db.transaction("handles", "readwrite");
  tx.objectStore("handles").put(handle, "workspace");
}
async function loadDirectoryHandle() {
  const db = await getDB();
  return new Promise((resolve) => {
    const tx = db.transaction("handles", "readonly");
    const req = tx.objectStore("handles").get("workspace");
    req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null);
  });
}
async function verifyPermission(fileHandle) {
  const options = { mode: 'readwrite' };
  if ((await fileHandle.queryPermission(options)) === 'granted') return true;
  if ((await fileHandle.requestPermission(options)) === 'granted') return true;
  return false;
}

window.addEventListener('DOMContentLoaded', async () => {
  const savedHandle = await loadDirectoryHandle();
  if (savedHandle) {
    workspaceStatus.innerHTML = `이전에 선택한 <b>'${savedHandle.name}'</b> 폴더를 불러오시겠습니까?`;
    selectFolderBtn.innerText = "폴더 연결 복구하기";
    selectFolderBtn.onclick = async () => {
      if (await verifyPermission(savedHandle)) { dirHandle = savedHandle; finishFolderSetup(); }
    };
  } else {
    selectFolderBtn.onclick = async () => {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        await saveDirectoryHandle(dirHandle); 
        finishFolderSetup();
      } catch (e) {}
    };
  }
});

async function finishFolderSetup() {
  workspaceStatus.innerHTML = `연결된 작업 폴더: <b style="color:var(--btn-green);">${dirHandle.name}</b>`;
  selectFolderBtn.style.display = "none";
  mainToolbar.style.opacity = "1"; mainToolbar.style.pointerEvents = "auto";
  await loadPatientsData();
}

async function loadPatientsData() {
  try {
    const fileHandle = await dirHandle.getFileHandle('patients_db.json', { create: true });
    const file = await fileHandle.getFile();
    const contents = await file.text();
    patientsData = contents ? JSON.parse(contents) : [];
    updateTagDropdown(); renderPatients();    
  } catch (error) { console.error(error); }
}

async function savePatientsData() {
  const fileHandle = await dirHandle.getFileHandle('patients_db.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(patientsData, null, 2));
  await writable.close();
}

// ====== 3. 검색 & 교집합(AND) 태그 필터 로직 ======
searchPatientInput.addEventListener('input', renderPatients);

function updateTagDropdown() {
  const allTags = new Set();
  patientsData.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));
  tagFilterContainer.innerHTML = "";
  allTags.forEach(tag => {
    const btn = document.createElement("button");
    btn.className = "filter-chip"; btn.innerText = `#${tag}`;
    btn.onclick = () => {
      if(selectedTagsFilter.has(tag)) { selectedTagsFilter.delete(tag); btn.classList.remove("active"); } 
      else { selectedTagsFilter.add(tag); btn.classList.add("active"); }
      renderPatients(); 
    };
    tagFilterContainer.appendChild(btn);
  });
}

function renderPatients() {
  const searchTerm = searchPatientInput.value.toLowerCase().trim();
  patientList.innerHTML = "";
  const filtered = patientsData.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm) || p.chartNumber.toLowerCase().includes(searchTerm);
    let matchTag = true;
    if (selectedTagsFilter.size > 0) matchTag = Array.from(selectedTagsFilter).every(t => p.tags && p.tags.includes(t));
    return matchSearch && matchTag;
  });

  if(filtered.length === 0) {
    patientList.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><h3>조건에 맞는 환자가 없습니다.</h3></div>`;
    return;
  }
  filtered.forEach(p => {
    const tagsHtml = (p.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('');
    const card = document.createElement("div"); card.className = "patient-card";
    card.innerHTML = `
      <div class="patient-card-header"><span class="patient-name">${p.name}</span><span style="color:#64748B; font-size:12px;">${p.chartNumber}</span></div>
      <div style="font-size: 13px; color: #64748B; margin-bottom: 10px;">초진: ${p.initialVisitDate || '미상'}</div>
      <div>${tagsHtml}</div>
    `;
    card.onclick = () => openPatientDetail(p);
    patientList.appendChild(card);
  });
}

// ====== 4. 환자 등록 및 수정 ======
addPatientBtn.onclick = () => { document.getElementById("initialVisitDate").value = new Date().toISOString().split('T')[0]; patientModal.classList.add("show"); };
document.getElementById("closePatientModalBtn").onclick = () => patientModal.classList.remove("show");
document.getElementById("cancelPatientBtn").onclick = () => patientModal.classList.remove("show");

addPatientForm.onsubmit = async (e) => {
  e.preventDefault();
  const chart = document.getElementById("chartNumber").value.trim();
  const name = document.getElementById("patientName").value.trim();
  const initialVisit = document.getElementById("initialVisitDate").value;
  const tags = document.getElementById("patientTags").value.split(',').map(t => t.trim()).filter(t => t);

  const newPatient = { id: Date.now().toString(), chartNumber: chart, name: name, initialVisitDate: initialVisit, tags: tags, notes: "", records: [] };

  try {
    await dirHandle.getDirectoryHandle(`[${chart}]_${name}_임상사진`, { create: true });
    patientsData.push(newPatient); await savePatientsData();
    patientModal.classList.remove("show"); addPatientForm.reset(); updateTagDropdown(); renderPatients();
    showNotification(`[${name}] 환자 등록 완료!`);
  } catch (error) { showNotification("폴더 생성 에러."); }
};

editPatientBtn.onclick = () => {
  document.getElementById("editPatientName").value = activePatient.name;
  document.getElementById("editChartNumber").value = activePatient.chartNumber;
  document.getElementById("editInitialVisitDate").value = activePatient.initialVisitDate || "";
  document.getElementById("editPatientTags").value = (activePatient.tags || []).join(", ");
  editPatientModal.classList.add("show");
};
document.getElementById("closeEditPatientBtn").onclick = () => editPatientModal.classList.remove("show");
document.getElementById("cancelEditPatientBtn").onclick = () => editPatientModal.classList.remove("show");

editPatientForm.onsubmit = async (e) => {
  e.preventDefault();
  activePatient.name = document.getElementById("editPatientName").value.trim();
  activePatient.initialVisitDate = document.getElementById("editInitialVisitDate").value;
  activePatient.tags = document.getElementById("editPatientTags").value.split(',').map(t => t.trim()).filter(t => t);
  await savePatientsData(); editPatientModal.classList.remove("show"); updateTagDropdown(); renderPatients(); openPatientDetail(activePatient); 
  showNotification("환자 정보가 수정되었습니다.");
};

// ====== 5. 임상 사진 상세 & 비교 모드 로직 ======
backToListBtn.onclick = () => {
  sectionDetail.style.display = "none"; sectionList.style.display = "block"; activePatient = null;
  selectedRecords = []; isCompareMode = false;
  compareModeBtn.innerText = "비교 모드 (Before/After) OFF"; compareModeBtn.classList.replace("btn-primary", "btn-secondary");
  viewsContainer.className = "single-layout"; secondaryViewPanel.style.display = "none";
};

function openPatientDetail(patient) {
  activePatient = patient;
  sectionList.style.display = "none"; sectionDetail.style.display = "block";
  document.getElementById("detailPatientName").innerText = patient.name;
  document.getElementById("detailChartNo").innerText = `진료번호: ${patient.chartNumber} | 초진일: ${patient.initialVisitDate || '미설정'}`;
  document.getElementById("detailTags").innerHTML = (patient.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('');
  document.getElementById("globalPatientMemo").value = patient.notes || "";
  
  selectedRecords = [];
  renderTimeline();
}

document.getElementById("saveGlobalMemoBtn").onclick = async () => {
  if (!activePatient) return;
  activePatient.notes = document.getElementById("globalPatientMemo").value;
  await savePatientsData();
  showNotification("환자의 전체 특이사항이 안전하게 저장되었습니다.");
};

function getExactInterval(d1Str, d2Str) {
  const date1 = new Date(d1Str); const date2 = new Date(d2Str);
  const diffDays = Math.floor((date2 - date1) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "당일"; if (diffDays < 7) return `${diffDays}D`; if (diffDays < 30) return `${Math.floor(diffDays / 7)}W`;
  let months = (date2.getFullYear() - date1.getFullYear()) * 12 + (date2.getMonth() - date1.getMonth());
  if (date2.getDate() < date1.getDate()) months--; 
  if (months <= 0) return `${Math.floor(diffDays / 7)}W`;
  let y = Math.floor(months / 12); let m = months % 12;
  return (y > 0 ? y + "Y " : "") + (m > 0 ? m + "M" : "");
}

function renderTimeline() {
  const tBar = document.getElementById("timelineBar"); tBar.innerHTML = "";
  
  if(!activePatient.records || activePatient.records.length === 0) {
    tBar.innerHTML = "<div style='color:#64748B;'>새 증례를 추가해주세요.</div>";
    document.getElementById("photoViewerPrimary").innerHTML = ""; document.getElementById("recordDatePrimary").innerText = "날짜를 선택하세요";
    return;
  }

  activePatient.records.sort((a,b) => new Date(a.date) - new Date(b.date));

  let hasInitNode = false;
  if (activePatient.initialVisitDate && activePatient.records[0].date > activePatient.initialVisitDate) {
    const initBox = document.createElement("div"); initBox.className = "timeline-item"; initBox.style.opacity = "0.7"; initBox.style.cursor = "default";
    initBox.innerHTML = `<div class="timeline-date">${activePatient.initialVisitDate}</div><div class="timeline-label">초진 (사진없음)</div>`;
    tBar.appendChild(initBox); hasInitNode = true;
  }

  activePatient.records.forEach((record, index) => {
    if (index > 0 || hasInitNode) {
      const prevDate = (index === 0) ? activePatient.initialVisitDate : activePatient.records[index - 1].date;
      const connector = document.createElement("div"); connector.className = "timeline-connector";
      connector.innerHTML = `<span class="interval-text">${getExactInterval(prevDate, record.date)}</span>`;
      tBar.appendChild(connector);
    }

    const box = document.createElement("div"); box.className = "timeline-item"; box.id = "timeline-node-" + record.id;
    let label = (activePatient.initialVisitDate && record.date === activePatient.initialVisitDate) ? "초진" : "진료";
    box.innerHTML = `<div class="timeline-date">${record.date}</div><div class="timeline-label">${label}</div>`;
    
    // 💡 타임라인 클릭 시 단일/다중 선택 로직
    box.onclick = () => {
      if (!isCompareMode) {
        selectedRecords = [record];
      } else {
        const idx = selectedRecords.findIndex(r => r.id === record.id);
        if (idx > -1) {
          if (selectedRecords.length > 1) selectedRecords.splice(idx, 1); // 2개일 때만 해제 허용
        } else {
          if (selectedRecords.length >= 2) selectedRecords.shift(); // 2개 넘으면 오래된 것 밀어내기 (FIFO)
          selectedRecords.push(record);
        }
        selectedRecords.sort((a,b) => new Date(a.date) - new Date(b.date)); // 항상 과거가 왼쪽으로
      }
      updateTimelineUI(); renderViewPanels();
    };
    tBar.appendChild(box);
  });

  if(selectedRecords.length === 0) selectedRecords = [activePatient.records[activePatient.records.length - 1]];
  updateTimelineUI(); renderViewPanels();
}

function updateTimelineUI() {
  document.querySelectorAll(".timeline-item").forEach(el => { el.classList.remove("active"); el.style.borderColor = "var(--border-light)"; el.style.background = "#F8FAFC"; });
  
  selectedRecords.forEach((record, index) => {
    const el = document.getElementById("timeline-node-" + record.id);
    if (el) {
      el.classList.add("active");
      if (isCompareMode) {
        el.style.borderColor = index === 0 ? "var(--btn-navy)" : "var(--btn-green)";
        el.style.background = index === 0 ? "#EFF6FF" : "#F0FDF4";
      } else {
        el.style.borderColor = "var(--btn-navy)"; el.style.background = "#EFF6FF";
      }
    }
  });
}

async function loadPhotosToPanel(record, panelPrefix) {
  document.getElementById(`recordDate${panelPrefix}`).innerText = record.date;
  document.getElementById(`recordMemoTitle${panelPrefix}`).innerText = record.date;
  document.getElementById(`recordMemo${panelPrefix}`).value = record.memo || "";
  
  const viewer = document.getElementById(`photoViewer${panelPrefix}`);
  try {
    const pFolder = await dirHandle.getDirectoryHandle(`[${activePatient.chartNumber}]_${activePatient.name}_임상사진`);
    const dFolder = await pFolder.getDirectoryHandle(record.date);
    
    let html = ""; const classes = ["pos-upper", "pos-right", "pos-front", "pos-left", "pos-lower"];
    for (let i = 0; i < record.images.length; i++) {
      const fileHandle = await dFolder.getFileHandle(record.images[i]);
      const file = await fileHandle.getFile();
      const objUrl = URL.createObjectURL(file); 
      const posClass = is5SplitMode ? (i < 5 ? classes[i] : "") : "";
      html += `<img src="${objUrl}" class="${posClass}" alt="임상사진">`;
    }
    viewer.className = is5SplitMode ? "five-split-layout" : "image-grid"; viewer.innerHTML = html;
  } catch (err) { viewer.innerHTML = "<div style='color:var(--btn-red); grid-column:1/-1;'>사진을 불러올 수 없습니다.</div>"; }
}

function renderViewPanels() {
  if (selectedRecords.length > 0) loadPhotosToPanel(selectedRecords[0], 'Primary');
  
  if (isCompareMode) {
    if (selectedRecords.length > 1) {
      document.getElementById("photoViewerSecondary").innerHTML = ""; // 초기화
      loadPhotosToPanel(selectedRecords[1], 'Secondary');
    } else {
      document.getElementById("recordDateSecondary").innerText = "비교할 두 번째 날짜를 선택하세요";
      document.getElementById("photoViewerSecondary").innerHTML = "";
      document.getElementById("recordMemoSecondary").value = "";
    }
  }
}

// 💡 비교 모드 토글
compareModeBtn.onclick = () => {
  isCompareMode = !isCompareMode;
  if (isCompareMode) {
    compareModeBtn.innerText = "비교 모드 (Before/After) ON"; compareModeBtn.classList.replace("btn-secondary", "btn-primary");
    compareModeBtn.style.color = "white";
    viewsContainer.className = "compare-layout"; secondaryViewPanel.style.display = "block";
    
    // 자동 두 번째 항목 선택 보조
    if (selectedRecords.length === 1 && activePatient.records.length > 1) {
      const other = activePatient.records.find(r => r.id !== selectedRecords[0].id);
      if (other) { selectedRecords.push(other); selectedRecords.sort((a,b) => new Date(a.date) - new Date(b.date)); }
    }
  } else {
    compareModeBtn.innerText = "비교 모드 (Before/After) OFF"; compareModeBtn.classList.replace("btn-primary", "btn-secondary");
    compareModeBtn.style.color = "var(--btn-navy)";
    viewsContainer.className = "single-layout"; secondaryViewPanel.style.display = "none";
    if (selectedRecords.length > 1) selectedRecords = [selectedRecords[1]]; // 비교모드 끄면 최신날짜 1개만 유지
  }
  updateTimelineUI(); renderViewPanels();
};

document.getElementById("toggle5SplitBtn").onclick = (e) => {
  is5SplitMode = !is5SplitMode;
  e.target.innerText = `5분할 모드 ${is5SplitMode ? 'ON' : 'OFF'}`;
  e.target.style.background = is5SplitMode ? "var(--btn-green)" : "var(--btn-navy)";
  renderViewPanels(); // 양쪽 패널 동시 갱신
};

// 💡 각각의 차트(메모) 저장 버튼
document.getElementById("saveMemoBtnPrimary").onclick = async () => {
  if (!selectedRecords[0]) return;
  selectedRecords[0].memo = document.getElementById("recordMemoPrimary").value;
  await savePatientsData(); showNotification(`${selectedRecords[0].date} 진료 차트가 저장되었습니다.`);
};
document.getElementById("saveMemoBtnSecondary").onclick = async () => {
  if (!selectedRecords[1]) return;
  selectedRecords[1].memo = document.getElementById("recordMemoSecondary").value;
  await savePatientsData(); showNotification(`${selectedRecords[1].date} 진료 차트가 저장되었습니다.`);
};

// ====== 6. 새 증례 기록 ======
addRecordBtn.onclick = () => { document.getElementById("recordDate").value = new Date().toISOString().split('T')[0]; recordModal.classList.add("show"); };
document.getElementById("closeRecordModalBtn").onclick = () => recordModal.classList.remove("show");
document.getElementById("cancelRecordBtn").onclick = () => recordModal.classList.remove("show");

document.getElementById("recordPhotos").addEventListener("change", (e) => {
  const files = e.target.files;
  if (files.length > 0) {
    let oldestTime = files[0].lastModified;
    for(let i = 1; i < files.length; i++) { if(files[i].lastModified < oldestTime) oldestTime = files[i].lastModified; }
    const date = new Date(oldestTime);
    document.getElementById("recordDate").value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
});

addRecordForm.onsubmit = async (e) => {
  e.preventDefault();
  const dateStr = document.getElementById("recordDate").value;
  const memoStr = document.getElementById("recordMemo").value;
  const files = document.getElementById("recordPhotos").files;

  if(files.length === 0) { showNotification("사진을 첨부해주세요."); return; }
  const submitBtn = document.querySelector("#addRecordForm .btn-success");
  submitBtn.innerText = "저장 중..."; submitBtn.disabled = true;

  try {
    const pFolder = await dirHandle.getDirectoryHandle(`[${activePatient.chartNumber}]_${activePatient.name}_임상사진`, { create: true });
    const dFolder = await pFolder.getDirectoryHandle(dateStr, { create: true });
    let savedFileNames = [];
    for (let i = 0; i < files.length; i++) {
      const newFileHandle = await dFolder.getFileHandle(files[i].name, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(files[i]); await writable.close();
      savedFileNames.push(files[i].name);
    }
    if (!activePatient.records) activePatient.records = [];
    activePatient.records.push({ id: Date.now(), date: dateStr, memo: memoStr, images: savedFileNames });
    await savePatientsData();
    recordModal.classList.remove("show"); addRecordForm.reset(); renderTimeline();
    showNotification("사진이 저장되었습니다.");
  } catch (error) { showNotification("저장 오류: " + error.message); } 
  finally { submitBtn.innerText = "로컬 폴더에 저장"; submitBtn.disabled = false; }
};
