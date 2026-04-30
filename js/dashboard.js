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

// 전역 상태 변수
let dirHandle = null;     
let patientsData = [];    
let activePatient = null; 
let activeRecord = null; // 메모 저장을 위해 현재 선택된 증례 추적
let is5SplitMode = false; 
let selectedTagsFilter = new Set(); // 다중 선택된 태그 목록

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
      if (await verifyPermission(savedHandle)) {
        dirHandle = savedHandle; finishFolderSetup();
      }
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
    updateTagDropdown(); // 태그 목록 먼저 구성
    renderPatients();    // 화면 그리기
  } catch (error) { console.error(error); }
}

async function savePatientsData() {
  const fileHandle = await dirHandle.getFileHandle('patients_db.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(patientsData, null, 2));
  await writable.close();
}

// ====== 3. 검색 & 다중 태그 필터 로직 ======
searchPatientInput.addEventListener('input', renderPatients);

function updateTagDropdown() {
  const allTags = new Set();
  patientsData.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));
  
  tagFilterContainer.innerHTML = "";
  allTags.forEach(tag => {
    const btn = document.createElement("button");
    btn.className = "filter-chip";
    btn.innerText = `#${tag}`;
    // 태그 다중 선택 토글 로직
    btn.onclick = () => {
      if(selectedTagsFilter.has(tag)) {
        selectedTagsFilter.delete(tag);
        btn.classList.remove("active");
      } else {
        selectedTagsFilter.add(tag);
        btn.classList.add("active");
      }
      renderPatients(); // 필터 바뀔때마다 즉시 리렌더링
    };
    tagFilterContainer.appendChild(btn);
  });
}

function renderPatients() {
  const searchTerm = searchPatientInput.value.toLowerCase().trim();
  patientList.innerHTML = "";
  
  // 환자 필터링 (검색어 AND 선택된 태그)
  const filtered = patientsData.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm) || p.chartNumber.toLowerCase().includes(searchTerm);
    // 선택된 태그가 있다면, 환자가 그 태그 중 '하나라도' 가지고 있는지(OR 조건) 체크
    let matchTag = true;
    if (selectedTagsFilter.size > 0) {
      matchTag = p.tags && p.tags.some(t => selectedTagsFilter.has(t));
    }
    return matchSearch && matchTag;
  });

  if(filtered.length === 0) {
    patientList.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><h3>조건에 맞는 환자가 없습니다.</h3></div>`;
    return;
  }

  filtered.forEach(p => {
    const tagsHtml = (p.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('');
    const card = document.createElement("div");
    card.className = "patient-card";
    card.innerHTML = `
      <div class="patient-card-header">
        <span class="patient-name">${p.name}</span>
        <span style="color:#64748B; font-size:12px;">${p.chartNumber}</span>
      </div>
      <div style="font-size: 13px; color: #64748B; margin-bottom: 10px;">초진: ${p.initialVisitDate || '미상'}</div>
      <div>${tagsHtml}</div>
    `;
    card.onclick = () => openPatientDetail(p);
    patientList.appendChild(card);
  });
}

// ====== 4. 환자 등록 및 초진일 수정 로직 ======
addPatientBtn.onclick = () => {
  document.getElementById("initialVisitDate").value = new Date().toISOString().split('T')[0];
  patientModal.classList.add("show");
};
document.getElementById("closePatientModalBtn").onclick = () => patientModal.classList.remove("show");
document.getElementById("cancelPatientBtn").onclick = () => patientModal.classList.remove("show");

addPatientForm.onsubmit = async (e) => {
  e.preventDefault();
  const chart = document.getElementById("chartNumber").value.trim();
  const name = document.getElementById("patientName").value.trim();
  const initialVisit = document.getElementById("initialVisitDate").value;
  const tags = document.getElementById("patientTags").value.split(',').map(t => t.trim()).filter(t => t);

  const newPatient = {
    id: Date.now().toString(), chartNumber: chart, name: name, 
    initialVisitDate: initialVisit, tags: tags, records: []
  };

  try {
    await dirHandle.getDirectoryHandle(`[${chart}]_${name}_임상사진`, { create: true });
    patientsData.push(newPatient);
    await savePatientsData();
    patientModal.classList.remove("show"); addPatientForm.reset();
    updateTagDropdown(); renderPatients();
    showNotification(`[${name}] 환자 등록 완료!`);
  } catch (error) { showNotification("폴더 생성 에러."); }
};

// 환자 정보 수정 모달 띄우기
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
  
  await savePatientsData();
  editPatientModal.classList.remove("show");
  updateTagDropdown(); renderPatients(); // 목록 새로고침
  openPatientDetail(activePatient); // 상세뷰 새로고침
  showNotification("환자 정보가 성공적으로 수정되었습니다.");
};

// ====== 5. 임상 사진 상세 & 메모 저장 ======
backToListBtn.onclick = () => {
  sectionDetail.style.display = "none"; sectionList.style.display = "block"; activePatient = null;
};

function openPatientDetail(patient) {
  activePatient = patient;
  sectionList.style.display = "none"; sectionDetail.style.display = "block";

  document.getElementById("detailPatientName").innerText = patient.name;
  document.getElementById("detailChartNo").innerText = `진료번호: ${patient.chartNumber} | 초진일: ${patient.initialVisitDate || '미설정'}`;
  document.getElementById("detailTags").innerHTML = (patient.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('');
  
  renderTimeline();
}

function renderTimeline() {
  const tBar = document.getElementById("timelineBar");
  tBar.innerHTML = "";
  
  if(!activePatient.records || activePatient.records.length === 0) {
    tBar.innerHTML = "<div style='color:#64748B;'>새 증례를 추가해주세요.</div>";
    document.getElementById("photoViewerArea").innerHTML = "";
    document.getElementById("currentRecordDate").innerText = "날짜를 선택하세요";
    document.getElementById("currentRecordMemo").value = "";
    activeRecord = null;
    return;
  }

  activePatient.records.sort((a,b) => new Date(a.date) - new Date(b.date));

  activePatient.records.forEach((record) => {
    const box = document.createElement("div");
    box.className = "timeline-item";
    
    let label = "";
    if (activePatient.initialVisitDate) {
      if (record.date === activePatient.initialVisitDate) label = "초진";
      else label = getElapsedTime(activePatient.initialVisitDate, record.date);
    } else { label = "진료"; }
    
    box.innerHTML = `<div class="timeline-date">${record.date}</div><div class="timeline-label">${label}</div>`;
    box.onclick = () => {
      document.querySelectorAll(".timeline-item").forEach(el => el.classList.remove("active"));
      box.classList.add("active");
      loadPhotosForRecord(record);
    };
    tBar.appendChild(box);
  });
  tBar.lastChild.click(); 
}

function getElapsedTime(startStr, currentStr) {
  const d1 = new Date(startStr); const d2 = new Date(currentStr);
  let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (months === 0) return "초진 당월";
  if (months < 0) return "초진 이전";
  let y = Math.floor(months / 12); let m = months % 12;
  return (y > 0 ? y + "Y " : "") + (m > 0 ? m + "M" : "");
}

async function loadPhotosForRecord(record) {
  activeRecord = record; // 현재 선택된 증례 기록 보관 (메모 저장용)
  document.getElementById("currentRecordDate").innerText = record.date;
  document.getElementById("currentRecordMemo").value = record.memo || "";
  
  const viewer = document.getElementById("photoViewerArea");

  try {
    const folderName = `[${activePatient.chartNumber}]_${activePatient.name}_임상사진`;
    const pFolder = await dirHandle.getDirectoryHandle(folderName);
    const dFolder = await pFolder.getDirectoryHandle(record.date);
    
    let html = "";
    const classes = ["pos-upper", "pos-right", "pos-front", "pos-left", "pos-lower"];
    for (let i = 0; i < record.images.length; i++) {
      const fileHandle = await dFolder.getFileHandle(record.images[i]);
      const file = await fileHandle.getFile();
      const objUrl = URL.createObjectURL(file); 
      const posClass = is5SplitMode && i < 5 ? classes[i] : "";
      html += `<img src="${objUrl}" class="${posClass}" alt="임상사진">`;
    }
    viewer.className = is5SplitMode ? "five-split-layout" : "image-grid";
    viewer.innerHTML = html;
  } catch (err) {
    viewer.innerHTML = "<div style='color:var(--btn-red); grid-column:1/-1;'>사진을 불러올 수 없습니다.</div>";
  }
}

// 💡 직접 작성한 메모 저장 로직
document.getElementById("saveMemoBtn").onclick = async () => {
  if (!activeRecord) {
    showNotification("선택된 증례가 없습니다."); return;
  }
  const newMemo = document.getElementById("currentRecordMemo").value;
  activeRecord.memo = newMemo;
  await savePatientsData();
  showNotification("메모가 안전하게 저장되었습니다.");
};

document.getElementById("toggle5SplitBtn").onclick = (e) => {
  is5SplitMode = !is5SplitMode;
  e.target.innerText = `5분할 모드 ${is5SplitMode ? 'ON' : 'OFF'}`;
  e.target.style.background = is5SplitMode ? "var(--btn-green)" : "var(--btn-navy)";
  if(document.querySelector(".timeline-item.active")) document.querySelector(".timeline-item.active").click();
};

// ====== 6. 새 증례(사진) 기록 ======
addRecordBtn.onclick = () => {
  document.getElementById("recordDate").value = new Date().toISOString().split('T')[0];
  recordModal.classList.add("show");
};
document.getElementById("closeRecordModalBtn").onclick = () => recordModal.classList.remove("show");
document.getElementById("cancelRecordBtn").onclick = () => recordModal.classList.remove("show");

document.getElementById("recordPhotos").addEventListener("change", (e) => {
  const files = e.target.files;
  if (files.length > 0) {
    let oldestTime = files[0].lastModified;
    for(let i = 1; i < files.length; i++) {
      if(files[i].lastModified < oldestTime) oldestTime = files[i].lastModified;
    }
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
  } catch (error) {
    showNotification("저장 오류: " + error.message);
  } finally {
    submitBtn.innerText = "로컬 폴더에 저장"; submitBtn.disabled = false;
  }
};
