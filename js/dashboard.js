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
const tagSelect = document.getElementById("tagSelect");

// 화면 전환용
const sectionList = document.getElementById("patientListSection");
const sectionDetail = document.getElementById("patientDetailSection");
const backToListBtn = document.getElementById("backToListBtn");

// 모달들
const patientModal = document.getElementById("addPatientModal");
const addPatientBtn = document.getElementById("addPatientBtn");
const addPatientForm = document.getElementById("addPatientForm");

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
let is5SplitMode = false; 

// ====== 1. Firebase 인증 확인 (이름 출력 및 로그아웃) ======
onAuthStateChanged(auth, (user) => {
  if (user) {
    const displayName = user.displayName || user.email.split('@')[0];
    navUserName.innerText = displayName;
    greetingName.innerText = displayName;
  } else {
    window.location.href = "index.html"; // 미로그인 시 차단
  }
});

logoutBtn.onclick = async () => {
  try {
    await signOut(auth);
    window.location.href = "index.html";
  } catch (error) {
    showNotification("로그아웃 실패: " + error.message);
  }
};

// ====== 커스텀 알림창 ======
function showNotification(msg) {
  alertMessage.innerHTML = msg.replace(/\n/g, '<br>');
  customAlertModal.classList.add("show");
}
closeAlertBtn.onclick = () => customAlertModal.classList.remove("show");

// ====== 2. 폴더 영구 기억 시스템 (IndexedDB 활용) ======
// 브라우저 DB에 폴더 핸들을 저장하여 새로고침 시에도 유지합니다.
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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function verifyPermission(fileHandle) {
  const options = { mode: 'readwrite' };
  if ((await fileHandle.queryPermission(options)) === 'granted') return true;
  if ((await fileHandle.requestPermission(options)) === 'granted') return true;
  return false;
}

// 자동 로드 실행
window.addEventListener('DOMContentLoaded', async () => {
  const savedHandle = await loadDirectoryHandle();
  if (savedHandle) {
    workspaceStatus.innerHTML = `이전에 선택한 <b>'${savedHandle.name}'</b> 폴더를 불러오시겠습니까?`;
    selectFolderBtn.innerText = "폴더 연결 복구하기";
    selectFolderBtn.onclick = async () => {
      if (await verifyPermission(savedHandle)) {
        dirHandle = savedHandle;
        finishFolderSetup();
      }
    };
  } else {
    // 최초 접속 시 일반 버튼 동작
    selectFolderBtn.onclick = async () => {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        await saveDirectoryHandle(dirHandle); // DB에 저장
        finishFolderSetup();
      } catch (error) {
        console.error("폴더 선택 취소:", error);
      }
    };
  }
});

async function finishFolderSetup() {
  workspaceStatus.innerHTML = `연결된 작업 폴더: <b style="color:var(--btn-green);">${dirHandle.name}</b>`;
  selectFolderBtn.style.display = "none";
  mainToolbar.style.opacity = "1";
  mainToolbar.style.pointerEvents = "auto";
  await loadPatientsData();
}

async function loadPatientsData() {
  try {
    const fileHandle = await dirHandle.getFileHandle('patients_db.json', { create: true });
    const file = await fileHandle.getFile();
    const contents = await file.text();
    patientsData = contents ? JSON.parse(contents) : [];
    renderPatients();
    updateTagDropdown();
  } catch (error) {
    console.error("데이터 로드 실패:", error);
  }
}

async function savePatientsData() {
  const fileHandle = await dirHandle.getFileHandle('patients_db.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(patientsData, null, 2));
  await writable.close();
}

// ====== 3. 환자 목록 및 태그 화면 렌더링 ======
function renderPatients() {
  patientList.innerHTML = "";
  if(patientsData.length === 0) {
    patientList.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><h3>등록된 환자가 없습니다.</h3></div>`;
    return;
  }

  patientsData.forEach(p => {
    const tagsHtml = (p.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('');
    const infoText = [p.gender, p.age ? `${p.age}세` : ''].filter(Boolean).join(' / ');
    
    const card = document.createElement("div");
    card.className = "patient-card";
    card.innerHTML = `
      <div class="patient-card-header">
        <span class="patient-name">${p.name}</span>
        <span style="color:#64748B; font-size:12px;">${p.chartNumber}</span>
      </div>
      <div style="font-size: 13px; color: #64748B; margin-bottom: 10px;">${infoText || '추가 정보 없음'}</div>
      <div>${tagsHtml}</div>
    `;
    card.onclick = () => openPatientDetail(p);
    patientList.appendChild(card);
  });
}

function updateTagDropdown() {
  const allTags = new Set();
  patientsData.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));
  tagSelect.innerHTML = `<option value="all">전체 태그 보기</option>`;
  allTags.forEach(tag => {
    tagSelect.innerHTML += `<option value="${tag}">#${tag}</option>`;
  });
}

// ====== 4. 새 환자 등록 ======
addPatientBtn.onclick = () => patientModal.classList.add("show");
document.getElementById("closePatientModalBtn").onclick = () => patientModal.classList.remove("show");
document.getElementById("cancelPatientBtn").onclick = () => patientModal.classList.remove("show");

addPatientForm.onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById("patientName").value.trim();
  const chart = document.getElementById("chartNumber").value.trim();
  const gender = document.getElementById("patientGender").value;
  const age = document.getElementById("patientAge").value;
  const tags = document.getElementById("patientTags").value.split(',').map(t => t.trim()).filter(t => t);

  const newPatient = {
    id: Date.now().toString(), chartNumber: chart, name: name,
    gender: gender, age: age, tags: tags, records: []
  };

  try {
    const folderName = `[${chart}]_${name}_임상사진`;
    await dirHandle.getDirectoryHandle(folderName, { create: true });
    
    patientsData.push(newPatient);
    await savePatientsData();
    
    patientModal.classList.remove("show");
    addPatientForm.reset();
    renderPatients();
    updateTagDropdown();

    showNotification(`[${name}] 환자 등록 완료!\nPC에 '${folderName}' 폴더가 생성되었습니다.`);
  } catch (error) {
    showNotification("폴더 생성 에러. 브라우저 권한을 확인해주세요.");
  }
};

// ====== 5. 임상 사진 상세 페이지 ======
backToListBtn.onclick = () => {
  sectionDetail.style.display = "none";
  sectionList.style.display = "block";
  activePatient = null;
};

function openPatientDetail(patient) {
  activePatient = patient;
  sectionList.style.display = "none";
  sectionDetail.style.display = "block";

  document.getElementById("detailPatientName").innerText = patient.name;
  document.getElementById("detailChartNo").innerText = `진료번호: ${patient.chartNumber}`;
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
    document.getElementById("currentRecordMemo").innerText = "메모 없음";
    return;
  }

  activePatient.records.sort((a,b) => new Date(a.date) - new Date(b.date));

  activePatient.records.forEach((record, index) => {
    const box = document.createElement("div");
    box.className = "timeline-item";
    
    let label = index === 0 ? "초진" : getElapsedTime(activePatient.records[0].date, record.date);
    
    box.innerHTML = `
      <div class="timeline-date">${record.date}</div>
      <div class="timeline-label">${label}</div>
    `;
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
  if(months === 0) return "당일";
  let y = Math.floor(months / 12); let m = months % 12;
  return (y > 0 ? y + "Y" : "") + (m > 0 ? m + "M" : "");
}

async function loadPhotosForRecord(record) {
  document.getElementById("currentRecordDate").innerText = record.date;
  document.getElementById("currentRecordMemo").innerText = record.memo || "메모 없음";
  const viewer = document.getElementById("photoViewerArea");

  try {
    const folderName = `[${activePatient.chartNumber}]_${activePatient.name}_임상사진`;
    const pFolder = await dirHandle.getDirectoryHandle(folderName);
    const dFolder = await pFolder.getDirectoryHandle(record.date);
    
    let html = "";
    const classes = ["pos-upper", "pos-right", "pos-front", "pos-left", "pos-lower"];
    
    for (let i = 0; i < record.images.length; i++) {
      const fileName = record.images[i];
      const fileHandle = await dFolder.getFileHandle(fileName);
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

document.getElementById("toggle5SplitBtn").onclick = (e) => {
  is5SplitMode = !is5SplitMode;
  e.target.innerText = `5분할 모드 ${is5SplitMode ? 'ON' : 'OFF'}`;
  e.target.style.background = is5SplitMode ? "var(--btn-green)" : "var(--btn-navy)";
  
  if(document.querySelector(".timeline-item.active")) {
    document.querySelector(".timeline-item.active").click();
  }
};


// ====== 6. 새 증례(사진) 기록 및 에러 방지 저장 로직 ======
addRecordBtn.onclick = () => {
  document.getElementById("recordDate").value = new Date().toISOString().split('T')[0];
  recordModal.classList.add("show");
};
document.getElementById("closeRecordModalBtn").onclick = () => recordModal.classList.remove("show");
document.getElementById("cancelRecordBtn").onclick = () => recordModal.classList.remove("show");

addRecordForm.onsubmit = async (e) => {
  e.preventDefault();
  const dateStr = document.getElementById("recordDate").value;
  const memoStr = document.getElementById("recordMemo").value;
  const files = document.getElementById("recordPhotos").files;

  if(files.length === 0) { showNotification("사진을 첨부해주세요."); return; }

  const submitBtn = document.querySelector("#addRecordForm .btn-success");
  submitBtn.innerText = "로컬 폴더에 저장 중..."; submitBtn.disabled = true;

  try {
    const folderName = `[${activePatient.chartNumber}]_${activePatient.name}_임상사진`;
    const pFolder = await dirHandle.getDirectoryHandle(folderName, { create: true });
    const dFolder = await pFolder.getDirectoryHandle(dateStr, { create: true });
    
    let savedFileNames = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const newFileHandle = await dFolder.getFileHandle(file.name, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      savedFileNames.push(file.name);
    }

    // 💡 [핵심 해결 부분] 과거 데이터에 바구니가 없을 경우를 대비한 안전장치
    if (!activePatient.records) {
      activePatient.records = [];
    }

    activePatient.records.push({ id: Date.now(), date: dateStr, memo: memoStr, images: savedFileNames });
    await savePatientsData();

    recordModal.classList.remove("show");
    addRecordForm.reset();
    renderTimeline();
    
    showNotification("해당 날짜 폴더에 사진이 성공적으로 저장되었습니다.");
  } catch (error) {
    console.error("사진 저장 에러 상세:", error);
    showNotification("사진 저장 중 오류가 발생했습니다.\n" + error.message);
  } finally {
    submitBtn.innerText = "로컬 폴더에 사진 저장"; submitBtn.disabled = false;
  }
};



