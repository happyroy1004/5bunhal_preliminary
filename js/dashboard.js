// ====== DOM 요소 설정 ======
const selectFolderBtn = document.getElementById("selectFolderBtn");
const workspaceBanner = document.getElementById("workspaceBanner");
const mainToolbar = document.getElementById("mainToolbar");
const patientList = document.getElementById("patientList");

// 화면 전환용
const sectionList = document.getElementById("patientListSection");
const sectionDetail = document.getElementById("patientDetailSection");
const backToListBtn = document.getElementById("backToListBtn");

// 환자 모달
const patientModal = document.getElementById("addPatientModal");
const addPatientBtn = document.getElementById("addPatientBtn");
const addPatientForm = document.getElementById("addPatientForm");

// 증례 기록 모달
const recordModal = document.getElementById("addRecordModal");
const addRecordBtn = document.getElementById("addRecordBtn");
const addRecordForm = document.getElementById("addRecordForm");

// 전역 상태 변수
let dirHandle = null;     // 최상위 작업 폴더 핸들
let patientsData = [];    // 환자 DB (JSON)
let activePatient = null; // 현재 보고 있는 환자
let is5SplitMode = false; // 5분할 모드 상태

// ====== 1. 폴더 선택 및 DB 로드 ======
selectFolderBtn.onclick = async () => {
  try {
    dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    workspaceBanner.innerHTML = `<div style="color:#5B8C65;">📁 연결된 작업 폴더: <b>${dirHandle.name}</b></div>`;
    mainToolbar.style.opacity = "1";
    mainToolbar.style.pointerEvents = "auto";
    await loadPatientsData();
  } catch (error) {
    console.error("폴더 선택 에러:", error);
  }
};

async function loadPatientsData() {
  try {
    const fileHandle = await dirHandle.getFileHandle('patients_db.json', { create: true });
    const file = await fileHandle.getFile();
    const contents = await file.text();
    patientsData = contents ? JSON.parse(contents) : [];
    renderPatients();
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

// ====== 2. 화면 렌더링 (목록) ======
function renderPatients() {
  patientList.innerHTML = "";
  if(patientsData.length === 0) {
    patientList.innerHTML = `<div style="text-align:center; grid-column:1/-1; padding:50px;">등록된 환자가 없습니다.</div>`;
    return;
  }

  patientsData.forEach(p => {
    const tagsHtml = (p.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('');
    const card = document.createElement("div");
    card.className = "patient-card";
    card.innerHTML = `
      <div class="patient-card-header">
        <span class="patient-name">${p.name}</span>
        <span style="color:#64748B; font-size:12px;">${p.chartNumber}</span>
      </div>
      <div>${tagsHtml}</div>
    `;
    // 카드 클릭 시 상세 페이지로 이동
    card.onclick = () => openPatientDetail(p);
    patientList.appendChild(card);
  });
}

// ====== 3. 환자 등록 로직 ======
addPatientBtn.onclick = () => patientModal.classList.add("show");
document.getElementById("closePatientModalBtn").onclick = () => patientModal.classList.remove("show");
document.getElementById("cancelPatientBtn").onclick = () => patientModal.classList.remove("show");

addPatientForm.onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById("patientName").value.trim();
  const chart = document.getElementById("chartNumber").value.trim();
  const tags = document.getElementById("patientTags").value.split(',').map(t => t.trim()).filter(t => t);

  const newPatient = {
    id: Date.now().toString(),
    chartNumber: chart,
    name: name,
    tags: tags,
    records: [] // 임상 사진 기록 배열
  };

  try {
    // 1. 환자별 실제 폴더 생성
    const folderName = `[${chart}]_${name}`;
    await dirHandle.getDirectoryHandle(folderName, { create: true });
    
    // 2. DB 업데이트
    patientsData.push(newPatient);
    await savePatientsData();
    
    patientModal.classList.remove("show");
    addPatientForm.reset();
    renderPatients();
  } catch (error) {
    alert("폴더 생성 에러. 권한을 확인해주세요.");
  }
};

// ====== 4. 환자 상세 페이지 (임상 사진 뷰) ======
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

// ====== 5. 타임라인 및 사진 렌더링 ======
function renderTimeline() {
  const tBar = document.getElementById("timelineBar");
  tBar.innerHTML = "";
  
  if(!activePatient.records || activePatient.records.length === 0) {
    tBar.innerHTML = "<div style='color:#64748B;'>기록된 증례가 없습니다.</div>";
    document.getElementById("photoViewerArea").innerHTML = "";
    document.getElementById("currentRecordDate").innerText = "날짜를 선택하세요";
    return;
  }

  // 날짜 오름차순 정렬
  activePatient.records.sort((a,b) => new Date(a.date) - new Date(b.date));

  activePatient.records.forEach((record, index) => {
    const box = document.createElement("div");
    box.className = "timeline-item";
    
    // 첫 날짜 기준 경과 시간 계산 (1Y1M 등)
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

  // 기본적으로 최신(마지막) 기록 자동 클릭
  tBar.lastChild.click();
}

function getElapsedTime(startStr, currentStr) {
  const d1 = new Date(startStr);
  const d2 = new Date(currentStr);
  let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if(months === 0) return "당일";
  let y = Math.floor(months / 12);
  let m = months % 12;
  return (y > 0 ? y + "Y" : "") + (m > 0 ? m + "M" : "");
}

// ====== 6. 사진 실제 로컬에서 불러오기 ======
async function loadPhotosForRecord(record) {
  document.getElementById("currentRecordDate").innerText = record.date;
  document.getElementById("currentRecordMemo").innerText = record.memo || "메모가 없습니다.";
  
  const viewer = document.getElementById("photoViewerArea");
  viewer.innerHTML = "사진을 불러오는 중...";

  try {
    // 로컬 폴더 접근: 환자폴더 -> 날짜폴더
    const pFolder = await dirHandle.getDirectoryHandle(`[${activePatient.chartNumber}]_${activePatient.name}`);
    const dFolder = await pFolder.getDirectoryHandle(record.date);
    
    let html = "";
    const classes = ["pos-upper", "pos-right", "pos-front", "pos-left", "pos-lower"];
    
    for (let i = 0; i < record.images.length; i++) {
      const fileName = record.images[i];
      const fileHandle = await dFolder.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const objUrl = URL.createObjectURL(file); // 브라우저 메모리에 이미지 띄우기
      
      // 5분할 모드면 클래스를 붙여서 위치 지정, 아니면 일반 나열
      const posClass = is5SplitMode && i < 5 ? classes[i] : "";
      html += `<img src="${objUrl}" class="${posClass}" alt="임상사진">`;
    }
    
    viewer.className = is5SplitMode ? "five-split-layout" : "image-grid";
    viewer.innerHTML = html;
  } catch (err) {
    viewer.innerHTML = "<div style='color:red;'>사진 파일을 찾을 수 없습니다. (폴더가 이동/삭제되었을 수 있음)</div>";
  }
}

// 5분할 토글
document.getElementById("toggle5SplitBtn").onclick = (e) => {
  is5SplitMode = !is5SplitMode;
  e.target.innerText = `5분할 모드 ${is5SplitMode ? 'ON' : 'OFF'}`;
  if(document.querySelector(".timeline-item.active")) {
    document.querySelector(".timeline-item.active").click(); // 현재 사진 다시 렌더링
  }
};

// ====== 7. 새 사진 기록 추가 (로컬 파일 복사) ======
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
  const fileInput = document.getElementById("recordPhotos");
  const files = fileInput.files;

  if(files.length === 0) { alert("사진을 1장 이상 첨부해주세요."); return; }

  const submitBtn = document.querySelector("#addRecordForm .btn-success");
  submitBtn.innerText = "로컬 폴더에 저장 중...";
  submitBtn.disabled = true;

  try {
    // 1. 환자 폴더 안에 날짜 폴더 생성 (예: 2026-12-05)
    const pFolder = await dirHandle.getDirectoryHandle(`[${activePatient.chartNumber}]_${activePatient.name}`);
    const dFolder = await pFolder.getDirectoryHandle(dateStr, { create: true });
    
    let savedFileNames = [];
    
    // 2. 사용자가 선택한 파일을 해당 폴더로 물리적 복사(쓰기)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const newFileHandle = await dFolder.getFileHandle(file.name, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      savedFileNames.push(file.name);
    }

    // 3. JSON DB에 기록 추가
    const newRecord = { id: Date.now(), date: dateStr, memo: memoStr, images: savedFileNames };
    activePatient.records.push(newRecord);
    await savePatientsData();

    alert("PC 폴더에 사진이 안전하게 저장되었습니다!");
    recordModal.classList.remove("show");
    addRecordForm.reset();
    renderTimeline(); // 화면 갱신
  } catch (error) {
    alert("파일 저장 중 오류 발생. 권한을 확인해주세요.");
    console.error(error);
  } finally {
    submitBtn.innerText = "로컬 폴더에 사진 저장";
    submitBtn.disabled = false;
  }
};
