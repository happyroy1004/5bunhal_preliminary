// DOM 요소
const selectFolderBtn = document.getElementById("selectFolderBtn");
const workspaceStatus = document.getElementById("workspaceStatus");
const mainToolbar = document.getElementById("mainToolbar");
const patientList = document.getElementById("patientList");
const tagSelect = document.getElementById("tagSelect");

// 모달 요소
const modal = document.getElementById("addPatientModal");
const addPatientBtn = document.getElementById("addPatientBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelBtn = document.getElementById("cancelBtn");
const addPatientForm = document.getElementById("addPatientForm");

// 로컬 데이터 변수
let dirHandle = null;
let patientsData = [];

// 1. 작업 폴더(Workspace) 선택 및 데이터 불러오기
selectFolderBtn.onclick = async () => {
  try {
    // 사용자에게 로컬 폴더 선택창 띄우기
    dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    workspaceStatus.innerText = `선택된 작업 폴더: ${dirHandle.name}`;
    mainToolbar.style.opacity = "1";
    mainToolbar.style.pointerEvents = "auto";
    selectFolderBtn.style.display = "none";

    await loadPatientsData();
  } catch (error) {
    console.error("폴더 선택 취소 또는 에러:", error);
  }
};

// 2. 환자 데이터베이스 (JSON) 불러오기
async function loadPatientsData() {
  try {
    const fileHandle = await dirHandle.getFileHandle('patients_db.json', { create: true });
    const file = await fileHandle.getFile();
    const contents = await file.text();
    
    if (contents) {
      patientsData = JSON.parse(contents);
    } else {
      patientsData = []; // 빈 파일일 경우
    }
    renderPatients();
    updateTagDropdown();
  } catch (error) {
    console.error("데이터 로드 실패:", error);
  }
}

// 3. 환자 데이터베이스 (JSON) 저장하기
async function savePatientsData() {
  const fileHandle = await dirHandle.getFileHandle('patients_db.json', { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(patientsData, null, 2));
  await writable.close();
}

// 4. 새 환자 등록 모달 제어
addPatientBtn.onclick = () => modal.classList.add("show");
closeModalBtn.onclick = () => modal.classList.remove("show");
cancelBtn.onclick = () => modal.classList.remove("show");

// 5. 새 환자 등록 처리 (태그 생성 및 로컬 폴더 생성)
addPatientForm.onsubmit = async (e) => {
  e.preventDefault();

  const name = document.getElementById("patientName").value.trim();
  const chart = document.getElementById("chartNumber").value.trim();
  const gender = document.getElementById("patientGender").value;
  const age = document.getElementById("patientAge").value;
  
  // 태그 파싱 (쉼표로 구분하여 배열로 변환)
  const tagsInput = document.getElementById("patientTags").value;
  const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag !== "");

  // 새 환자 객체 생성
  const newPatient = {
    id: Date.now().toString(),
    chartNumber: chart,
    name: name,
    gender: gender,
    age: age,
    tags: tags,
    registeredAt: new Date().toISOString()
  };

  try {
    // PC에 환자 이름으로 사진 저장용 하위 폴더 생성!
    const folderName = `[${chart}]_${name}_임상사진`;
    await dirHandle.getDirectoryHandle(folderName, { create: true });

    // 데이터 저장 및 화면 갱신
    patientsData.push(newPatient);
    await savePatientsData();
    
    alert(`[${name}] 환자 등록 및 PC 폴더 생성 완료!\n(폴더명: ${folderName})`);
    
    addPatientForm.reset();
    modal.classList.remove("show");
    
    renderPatients();
    updateTagDropdown(); // 생성된 새 태그를 드롭다운에 반영
  } catch (error) {
    alert("환자 등록 또는 폴더 생성 중 오류가 발생했습니다.");
    console.error(error);
  }
};

// 6. 환자 리스트 화면에 그리기
function renderPatients() {
  if (patientsData.length === 0) {
    patientList.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="clipboard-icon">📋</div>
        <h3>등록된 환자가 없습니다.</h3>
        <p>새 환자를 등록해주세요.</p>
      </div>`;
    return;
  }

  patientList.innerHTML = "";
  patientsData.forEach(patient => {
    // 태그 HTML 생성
    const tagsHtml = patient.tags.map(tag => `<span class="tag-badge">#${tag}</span>`).join('');
    const infoText = [patient.gender, patient.age ? `${patient.age}세` : ''].filter(Boolean).join(' / ');

    const card = document.createElement("div");
    card.className = "patient-card";
    card.innerHTML = `
      <div class="patient-card-header">
        <span class="patient-name">${patient.name}</span>
        <span class="patient-chart">${patient.chartNumber}</span>
      </div>
      <div class="patient-info">${infoText || '추가 정보 없음'}</div>
      <div class="patient-tags">${tagsHtml}</div>
    `;
    
    // 클릭 시 해당 환자 상세페이지(임상사진 뷰어)로 이동하는 로직 연결 예정
    card.onclick = () => alert(`${patient.name} 환자의 임상 사진 페이지로 이동합니다. (구현 예정)`);
    
    patientList.appendChild(card);
  });
}

// 7. 동적 태그 드롭다운 업데이트 로직
function updateTagDropdown() {
  const allTags = new Set();
  // 모든 환자의 태그를 수집하여 중복 제거
  patientsData.forEach(patient => {
    patient.tags.forEach(tag => allTags.add(tag));
  });

  // 드롭다운 초기화
  tagSelect.innerHTML = `<option value="all">전체 태그 보기</option>`;
  
  // 수집된 태그들을 옵션으로 추가 (예: 고지혈증 등 새로 만든 태그도 자동 추가됨)
  allTags.forEach(tag => {
    const option = document.createElement("option");
    option.value = tag;
    option.innerText = `#${tag}`;
    tagSelect.appendChild(option);
  });
}
