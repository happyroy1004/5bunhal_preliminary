import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// ====== DOM 요소 설정 ======
const navUserName = document.getElementById("navUserName"); const greetingName = document.getElementById("greetingName"); const logoutBtn = document.getElementById("logoutBtn");
const selectFolderBtn = document.getElementById("selectFolderBtn"); const workspaceStatus = document.getElementById("workspaceStatus"); const mainToolbar = document.getElementById("mainToolbar"); const patientList = document.getElementById("patientList");
const searchPatientInput = document.getElementById("searchPatient"); const tagFilterContainer = document.getElementById("tagFilterContainer");
const sectionList = document.getElementById("patientListSection"); const sectionDetail = document.getElementById("patientDetailSection"); const backToListBtn = document.getElementById("backToListBtn");

const patientModal = document.getElementById("addPatientModal"); const addPatientBtn = document.getElementById("addPatientBtn"); const addPatientForm = document.getElementById("addPatientForm");
const editPatientModal = document.getElementById("editPatientModal"); const editPatientBtn = document.getElementById("editPatientBtn"); const editPatientForm = document.getElementById("editPatientForm");
const recordModal = document.getElementById("addRecordModal"); const addRecordBtn = document.getElementById("addRecordBtn"); const addRecordForm = document.getElementById("addRecordForm");
const customAlertModal = document.getElementById("customAlertModal"); const alertMessage = document.getElementById("alertMessage"); const closeAlertBtn = document.getElementById("closeAlertBtn");
const compareModeBtn = document.getElementById("compareModeBtn"); const viewsContainer = document.getElementById("viewsContainer"); const secondaryViewPanel = document.getElementById("secondaryViewPanel");

const fullscreenViewer = document.getElementById("fullscreenViewer"); const fullscreenImage = document.getElementById("fullscreenImage"); const closeViewerBtn = document.getElementById("closeViewerBtn");

const imageEditModal = document.getElementById("imageEditModal");
const editImagePreview = document.getElementById("editImagePreview");
let currentCropper = null;
let editTarget = { record: null, index: -1, originalName: "" };

// 💡 편집을 위한 상태 변수
let baseRotation = 0; 
let flipY = 1;

// 전역 변수
let dirHandle = null; let patientsData = []; let activePatient = null; 
let is5SplitMode = false; let isCompareMode = false; let selectedTagsFilter = new Set(); let selectedRecords = []; 

onAuthStateChanged(auth, (user) => { if(user){ navUserName.innerText = user.displayName || user.email.split('@')[0]; greetingName.innerText = navUserName.innerText; } else window.location.href = "index.html"; });
logoutBtn.onclick = async () => { await signOut(auth); window.location.href = "index.html"; };

function showNotification(msg) { alertMessage.innerHTML = msg.replace(/\n/g, '<br>'); customAlertModal.classList.add("show"); }
closeAlertBtn.onclick = () => customAlertModal.classList.remove("show");

function getDB() { return new Promise((res, rej) => { const req = indexedDB.open("DentalCaseDB", 1); req.onupgradeneeded = e => e.target.result.createObjectStore("handles"); req.onsuccess = e => res(e.target.result); req.onerror = e => rej(e.target.error); }); }
async function saveDirectoryHandle(handle) { const db = await getDB(); db.transaction("handles", "readwrite").objectStore("handles").put(handle, "workspace"); }
async function loadDirectoryHandle() { const db = await getDB(); return new Promise(res => { const req = db.transaction("handles", "readonly").objectStore("handles").get("workspace"); req.onsuccess = () => res(req.result); req.onerror = () => res(null); }); }
async function verifyPermission(fh) { const o={mode:'readwrite'}; if(await fh.queryPermission(o)==='granted')return true; if(await fh.requestPermission(o)==='granted')return true; return false; }

window.addEventListener('DOMContentLoaded', async () => {
  const savedHandle = await loadDirectoryHandle(); const bannerActions = document.querySelector(".banner-actions");
  if (savedHandle) {
    workspaceStatus.innerHTML = `이전에 선택한 <b>'${savedHandle.name}'</b> 폴더를 불러오시겠습니까?`;
    bannerActions.innerHTML = `<button id="restoreFolderBtn" class="btn-primary">폴더 연결 복구하기</button> <button id="newFolderBtn" class="btn-secondary" style="border-color: var(--btn-navy); color: var(--btn-navy);">새 폴더 연결하기</button>`;
    document.getElementById("restoreFolderBtn").onclick = async () => { if(await verifyPermission(savedHandle)) { dirHandle = savedHandle; finishFolderSetup(); } };
    document.getElementById("newFolderBtn").onclick = async () => { try { dirHandle = await window.showDirectoryPicker({mode:"readwrite"}); await saveDirectoryHandle(dirHandle); finishFolderSetup(); }catch(e){} };
  } else {
    bannerActions.innerHTML = `<button id="selectFolderBtn" class="btn-primary">작업 폴더 선택 (필수)</button>`;
    document.getElementById("selectFolderBtn").onclick = async () => { try { dirHandle = await window.showDirectoryPicker({mode:"readwrite"}); await saveDirectoryHandle(dirHandle); finishFolderSetup(); }catch(e){} };
  }
});

async function finishFolderSetup() {
  workspaceStatus.innerHTML = `연결된 작업 폴더: <b style="color:var(--btn-green);">${dirHandle.name}</b>`;
  document.querySelector(".banner-actions").style.display = "none"; mainToolbar.style.opacity = "1"; mainToolbar.style.pointerEvents = "auto";
  await loadPatientsData();
}

async function loadPatientsData() { try { const fh = await dirHandle.getFileHandle('patients_db.json', {create:true}); const txt = await (await fh.getFile()).text(); patientsData = txt ? JSON.parse(txt) : []; updateTagDropdown(); renderPatients(); }catch(e){} }
async function savePatientsData() { const fh = await dirHandle.getFileHandle('patients_db.json', {create:true}); const w = await fh.createWritable(); await w.write(JSON.stringify(patientsData, null, 2)); await w.close(); }

searchPatientInput.addEventListener('input', renderPatients);
function updateTagDropdown() {
  const allTags = new Set(); patientsData.forEach(p => (p.tags||[]).forEach(t => allTags.add(t))); tagFilterContainer.innerHTML = "";
  allTags.forEach(tag => {
    const btn = document.createElement("button"); btn.className = "filter-chip"; btn.innerText = `#${tag}`;
    btn.onclick = () => { if(selectedTagsFilter.has(tag)){selectedTagsFilter.delete(tag); btn.classList.remove("active");} else{selectedTagsFilter.add(tag); btn.classList.add("active");} renderPatients(); };
    tagFilterContainer.appendChild(btn);
  });
}

function renderPatients() {
  const sTerm = searchPatientInput.value.toLowerCase().trim(); patientList.innerHTML = "";
  const filtered = patientsData.filter(p => { const ms = p.name.toLowerCase().includes(sTerm) || p.chartNumber.toLowerCase().includes(sTerm); let mt = true; if(selectedTagsFilter.size>0) mt = Array.from(selectedTagsFilter).every(t => p.tags && p.tags.includes(t)); return ms && mt; });
  if(filtered.length === 0){ patientList.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><h3>조건에 맞는 환자가 없습니다.</h3></div>`; return; }
  filtered.forEach(p => {
    const card = document.createElement("div"); card.className = "patient-card";
    card.innerHTML = `<div class="patient-card-header"><span class="patient-name">${p.name}</span><span style="color:#64748B; font-size:12px;">${p.chartNumber}</span></div><div style="font-size: 13px; color: #64748B; margin-bottom: 10px;">초진: ${p.initialVisitDate||'미상'}</div><div>${(p.tags||[]).map(t=>`<span class="tag-badge">#${t}</span>`).join('')}</div>`;
    card.onclick = () => openPatientDetail(p); patientList.appendChild(card);
  });
}

addPatientBtn.onclick = () => { document.getElementById("initialVisitDate").value = new Date().toISOString().split('T')[0]; patientModal.classList.add("show"); };
document.getElementById("closePatientModalBtn").onclick = () => patientModal.classList.remove("show"); document.getElementById("cancelPatientBtn").onclick = () => patientModal.classList.remove("show");
addPatientForm.onsubmit = async (e) => {
  e.preventDefault(); const chart = document.getElementById("chartNumber").value.trim(); const name = document.getElementById("patientName").value.trim();
  const np = { id: Date.now().toString(), chartNumber: chart, name: name, initialVisitDate: document.getElementById("initialVisitDate").value, tags: document.getElementById("patientTags").value.split(',').map(t=>t.trim()).filter(t=>t), notes: "", records: [] };
  try { await dirHandle.getDirectoryHandle(`[${chart}]_${name}_임상사진`, {create:true}); patientsData.push(np); await savePatientsData(); patientModal.classList.remove("show"); addPatientForm.reset(); updateTagDropdown(); renderPatients(); showNotification(`[${name}] 환자 등록 완료!`); }catch(e){showNotification("폴더 생성 에러.");}
};

editPatientBtn.onclick = () => { document.getElementById("editPatientName").value=activePatient.name; document.getElementById("editChartNumber").value=activePatient.chartNumber; document.getElementById("editInitialVisitDate").value=activePatient.initialVisitDate||""; document.getElementById("editPatientTags").value=(activePatient.tags||[]).join(", "); editPatientModal.classList.add("show"); };
document.getElementById("closeEditPatientBtn").onclick = () => editPatientModal.classList.remove("show"); document.getElementById("cancelEditPatientBtn").onclick = () => editPatientModal.classList.remove("show");
editPatientForm.onsubmit = async (e) => { e.preventDefault(); activePatient.name = document.getElementById("editPatientName").value.trim(); activePatient.initialVisitDate = document.getElementById("editInitialVisitDate").value; activePatient.tags = document.getElementById("editPatientTags").value.split(',').map(t=>t.trim()).filter(t=>t); await savePatientsData(); editPatientModal.classList.remove("show"); updateTagDropdown(); renderPatients(); openPatientDetail(activePatient); showNotification("환자 정보 수정 완료."); };

backToListBtn.onclick = () => { sectionDetail.style.display="none"; sectionList.style.display="block"; activePatient=null; selectedRecords=[]; isCompareMode=false; compareModeBtn.innerText="비교 모드 (Before/After) OFF"; compareModeBtn.classList.replace("btn-primary","btn-secondary"); compareModeBtn.style.color="var(--btn-navy)"; viewsContainer.className="single-layout"; secondaryViewPanel.style.display="none"; };

function openPatientDetail(p) {
  activePatient = p; sectionList.style.display = "none"; sectionDetail.style.display = "block";
  document.getElementById("detailPatientName").innerText = p.name; document.getElementById("detailChartNo").innerText = `진료번호: ${p.chartNumber} | 초진일: ${p.initialVisitDate||'미설정'}`;
  document.getElementById("detailTags").innerHTML = (p.tags||[]).map(t=>`<span class="tag-badge">#${t}</span>`).join(''); document.getElementById("globalPatientMemo").value = p.notes||"";
  selectedRecords = []; renderTimeline();
}
document.getElementById("saveGlobalMemoBtn").onclick = async () => { if(!activePatient)return; activePatient.notes = document.getElementById("globalPatientMemo").value; await savePatientsData(); showNotification("전체 특이사항 저장됨."); };

function getExactInterval(d1Str, d2Str) {
  const d1 = new Date(d1Str); const d2 = new Date(d2Str); const diffDays = Math.floor((d2-d1)/(1000*60*60*24));
  if(diffDays<=0) return "당일"; if(diffDays<7) return `${diffDays}D`; if(diffDays<30) return `${Math.floor(diffDays/7)}W`;
  let m = (d2.getFullYear()-d1.getFullYear())*12 + (d2.getMonth()-d1.getMonth()); if(d2.getDate()<d1.getDate()) m--; if(m<=0) return `${Math.floor(diffDays/7)}W`;
  return (Math.floor(m/12)>0 ? Math.floor(m/12)+"Y " : "") + (m%12>0 ? (m%12)+"M" : "");
}

function renderTimeline() {
  const tBar = document.getElementById("timelineBar"); tBar.innerHTML = "";
  if(!activePatient.records||activePatient.records.length===0){ tBar.innerHTML="<div style='color:#64748B;'>새 증례를 추가해주세요.</div>"; document.getElementById("photoViewerPrimary").innerHTML=""; document.getElementById("recordDatePrimary").innerText="날짜를 선택하세요"; return; }
  activePatient.records.sort((a,b)=>new Date(a.date)-new Date(b.date));
  let hasInitNode=false;
  if(activePatient.initialVisitDate && activePatient.records[0].date > activePatient.initialVisitDate){
    const ib = document.createElement("div"); ib.className="timeline-item"; ib.style.opacity="0.7"; ib.style.cursor="default"; ib.innerHTML=`<div class="timeline-date">${activePatient.initialVisitDate}</div><div class="timeline-label">초진 (사진없음)</div>`; tBar.appendChild(ib); hasInitNode=true;
  }
  activePatient.records.forEach((r, idx) => {
    if(idx>0 || hasInitNode){ const pd=(idx===0)?activePatient.initialVisitDate:activePatient.records[idx-1].date; const cn=document.createElement("div"); cn.className="timeline-connector"; cn.innerHTML=`<span class="interval-text">${getExactInterval(pd, r.date)}</span>`; tBar.appendChild(cn); }
    const box = document.createElement("div"); box.className="timeline-item"; box.id="timeline-node-"+r.id;
    let label = (activePatient.initialVisitDate && r.date===activePatient.initialVisitDate) ? "초진" : "진료";
    box.innerHTML = `<div class="timeline-date">${r.date}</div><div class="timeline-label">${label}</div>`;
    box.onclick = () => {
      if(!isCompareMode) selectedRecords=[r];
      else { const i=selectedRecords.findIndex(sr=>sr.id===r.id); if(i>-1){ if(selectedRecords.length>1) selectedRecords.splice(i,1); } else { if(selectedRecords.length>=2) selectedRecords.shift(); selectedRecords.push(r); } selectedRecords.sort((a,b)=>new Date(a.date)-new Date(b.date)); }
      updateTimelineUI(); renderViewPanels();
    }; tBar.appendChild(box);
  });
  if(selectedRecords.length===0) selectedRecords=[activePatient.records[activePatient.records.length-1]];
  updateTimelineUI(); renderViewPanels();
}

function updateTimelineUI() {
  document.querySelectorAll(".timeline-item").forEach(el=>{el.classList.remove("active"); el.style.borderColor="var(--border-light)"; el.style.background="#F8FAFC";});
  selectedRecords.forEach((r, idx)=>{ const el=document.getElementById("timeline-node-"+r.id); if(el){ el.classList.add("active"); if(isCompareMode){el.style.borderColor=idx===0?"var(--btn-navy)":"var(--btn-green)"; el.style.background=idx===0?"#EFF6FF":"#F0FDF4";} else{el.style.borderColor="var(--btn-navy)"; el.style.background="#EFF6FF";} } });
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
      let imgData = record.images[i];
      let originalName = typeof imgData === 'string' ? imgData : imgData.original;
      let editedName = typeof imgData === 'string' ? null : imgData.edited;
      let displayFileName = editedName || originalName;

      const fileHandle = await dFolder.getFileHandle(displayFileName);
      const file = await fileHandle.getFile();
      const objUrl = URL.createObjectURL(file); 
      const posClass = is5SplitMode ? (i < 5 ? classes[i] : "") : "";
      
      html += `
        <div class="image-wrapper ${posClass}" data-index="${i}">
          <div class="image-overlay">
            <button class="btn-icon edit">✂️ 편집</button>
            <button class="btn-icon delete">🗑️ 삭제</button>
          </div>
          <img src="${objUrl}" data-url="${objUrl}" alt="임상사진">
        </div>
      `;
    }
    viewer.className = is5SplitMode ? "five-split-layout" : "image-grid"; 
    viewer.innerHTML = html;

    viewer.querySelectorAll('img').forEach(img => {
      img.ondblclick = () => { fullscreenImage.src = img.getAttribute('data-url'); fullscreenViewer.classList.add('show'); };
    });

    viewer.querySelectorAll('.btn-icon.edit').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); openImageEditModal(record, parseInt(e.target.closest('.image-wrapper').dataset.index), panelPrefix); }
    });
    viewer.querySelectorAll('.btn-icon.delete').forEach(btn => {
      btn.onclick = (e) => { e.stopPropagation(); deleteImage(record, parseInt(e.target.closest('.image-wrapper').dataset.index), panelPrefix); }
    });

  } catch (err) { viewer.innerHTML = "<div style='color:var(--btn-red); grid-column:1/-1;'>사진을 불러올 수 없습니다.</div>"; }
}

closeViewerBtn.onclick = () => fullscreenViewer.classList.remove('show');
fullscreenViewer.onclick = (e) => { if(e.target===fullscreenViewer) fullscreenViewer.classList.remove('show'); };

function renderViewPanels() {
  if(selectedRecords.length>0) loadPhotosToPanel(selectedRecords[0], 'Primary');
  if(isCompareMode){ if(selectedRecords.length>1){ document.getElementById("photoViewerSecondary").innerHTML=""; loadPhotosToPanel(selectedRecords[1], 'Secondary'); }else{ document.getElementById("recordDateSecondary").innerText="두 번째 날짜 선택"; document.getElementById("photoViewerSecondary").innerHTML=""; } }
}

compareModeBtn.onclick = () => {
  isCompareMode = !isCompareMode;
  if(isCompareMode){ compareModeBtn.innerText="비교 모드 (Before/After) ON"; compareModeBtn.classList.replace("btn-secondary","btn-primary"); compareModeBtn.style.color="white"; viewsContainer.className="compare-layout"; secondaryViewPanel.style.display="block"; if(selectedRecords.length===1 && activePatient.records.length>1){ const o=activePatient.records.find(r=>r.id!==selectedRecords[0].id); if(o){selectedRecords.push(o); selectedRecords.sort((a,b)=>new Date(a.date)-new Date(b.date));} } }
  else{ compareModeBtn.innerText="비교 모드 (Before/After) OFF"; compareModeBtn.classList.replace("btn-primary","btn-secondary"); compareModeBtn.style.color="var(--btn-navy)"; viewsContainer.className="single-layout"; secondaryViewPanel.style.display="none"; if(selectedRecords.length>1) selectedRecords=[selectedRecords[1]]; }
  updateTimelineUI(); renderViewPanels();
};

document.getElementById("toggle5SplitBtn").onclick = (e) => { is5SplitMode=!is5SplitMode; e.target.innerText=`5분할 모드 ${is5SplitMode?'ON':'OFF'}`; e.target.style.background=is5SplitMode?"var(--btn-green)":"var(--btn-navy)"; renderViewPanels(); };

document.getElementById("saveMemoBtnPrimary").onclick = async () => { if(!selectedRecords[0])return; selectedRecords[0].memo=document.getElementById("recordMemoPrimary").value; await savePatientsData(); showNotification("차트 저장됨"); };
document.getElementById("saveMemoBtnSecondary").onclick = async () => { if(!selectedRecords[1])return; selectedRecords[1].memo=document.getElementById("recordMemoSecondary").value; await savePatientsData(); showNotification("차트 저장됨"); };

// ====== 6. 사진 추가 ======
addRecordBtn.onclick = () => { document.getElementById("recordDate").value = new Date().toISOString().split('T')[0]; recordModal.classList.add("show"); };
document.getElementById("closeRecordModalBtn").onclick = () => recordModal.classList.remove("show"); document.getElementById("cancelRecordBtn").onclick = () => recordModal.classList.remove("show");
document.getElementById("recordPhotos").addEventListener("change", (e) => { const f=e.target.files; if(f.length>0){ let o=f[0].lastModified; for(let i=1;i<f.length;i++){if(f[i].lastModified<o) o=f[i].lastModified;} const d=new Date(o); document.getElementById("recordDate").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } });

addRecordForm.onsubmit = async (e) => {
  e.preventDefault(); const dateStr = document.getElementById("recordDate").value; const memoStr = document.getElementById("recordMemo").value; const files = document.getElementById("recordPhotos").files;
  if(files.length===0){showNotification("사진을 첨부해주세요."); return;} const sb = document.querySelector("#addRecordForm .btn-success"); sb.innerText="저장 중..."; sb.disabled=true;
  try {
    const pf = await dirHandle.getDirectoryHandle(`[${activePatient.chartNumber}]_${activePatient.name}_임상사진`, {create:true}); const df = await pf.getDirectoryHandle(dateStr, {create:true});
    let sFiles = [];
    for(let i=0; i<files.length; i++) {
      const nf = await df.getFileHandle(files[i].name, {create:true}); const w = await nf.createWritable(); await w.write(files[i]); await w.close();
      sFiles.push({ original: files[i].name, edited: null });
    }
    if(!activePatient.records) activePatient.records=[]; activePatient.records.push({id:Date.now(), date:dateStr, memo:memoStr, images:sFiles}); await savePatientsData();
    recordModal.classList.remove("show"); addRecordForm.reset(); renderTimeline(); showNotification("저장 완료.");
  } catch(err){ showNotification("오류: "+err.message); } finally { sb.innerText="로컬 폴더에 저장"; sb.disabled=false; }
};

// ====== 7. 사진 삭제 ======
async function deleteImage(record, index, panelPrefix) {
  if(!confirm("이 사진을 삭제하시겠습니까?\n(로컬 폴더의 실제 파일은 보존되며, 목록에서만 지워집니다.)")) return;
  record.images.splice(index, 1);
  await savePatientsData();
  loadPhotosToPanel(record, panelPrefix);
  showNotification("사진이 삭제되었습니다.");
}

// ====== 8. 사진 편집 (회전/상하반전/크롭/미세조정) ======
document.getElementById("closeEditImageBtn").onclick = () => imageEditModal.classList.remove("show");
document.getElementById("cancelEditImageBtn").onclick = () => imageEditModal.classList.remove("show");

async function openImageEditModal(record, index, panelPrefix) {
  editTarget.record = record; editTarget.index = index;
  let imgData = record.images[index];
  editTarget.originalName = typeof imgData === 'string' ? imgData : imgData.original;

  try {
    const pFolder = await dirHandle.getDirectoryHandle(`[${activePatient.chartNumber}]_${activePatient.name}_임상사진`);
    const dFolder = await pFolder.getDirectoryHandle(record.date);
    const fileHandle = await dFolder.getFileHandle(editTarget.originalName);
    const file = await fileHandle.getFile();
    
    editImagePreview.src = URL.createObjectURL(file);
    imageEditModal.classList.add("show");

    // 초기화
    baseRotation = 0;
    flipY = 1;
    document.getElementById("fineRotateSlider").value = 0;
    document.getElementById("fineRotateValue").innerText = "0°";

    if (currentCropper) currentCropper.destroy();
    currentCropper = new Cropper(editImagePreview, {
      aspectRatio: 4 / 3, // 💡 가로4 세로3
      viewMode: 1,
      dragMode: 'move',
      background: false
    });
  } catch(e) { showNotification("원본 파일을 찾을 수 없어 편집할 수 없습니다."); }
}

// 💡 슬라이더와 버튼에 의한 종합 회전 적용 함수
function updateCropperTransform() {
  const fineRot = parseInt(document.getElementById("fineRotateSlider").value);
  currentCropper.rotateTo(baseRotation + fineRot);
}

// 좌로 90도 회전
document.getElementById("rotateLeftBtn").onclick = () => { 
  if(currentCropper) { baseRotation -= 90; updateCropperTransform(); } 
};

// 💡 상하 반전 추가
document.getElementById("flipVerticalBtn").onclick = () => { 
  if(currentCropper) { flipY = flipY === 1 ? -1 : 1; currentCropper.scaleY(flipY); } 
};

// 💡 미세 회전 슬라이더 동작
document.getElementById("fineRotateSlider").addEventListener("input", (e) => {
  if(currentCropper) {
    document.getElementById("fineRotateValue").innerText = e.target.value + "°";
    updateCropperTransform();
  }
});

document.getElementById("saveEditImageBtn").onclick = async () => {
  if (!currentCropper) return;
  const btn = document.getElementById("saveEditImageBtn"); btn.innerText = "저장 중..."; btn.disabled = true;

  try {
    const canvas = currentCropper.getCroppedCanvas({ imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });
    
    canvas.toBlob(async (blob) => {
      const pFolder = await dirHandle.getDirectoryHandle(`[${activePatient.chartNumber}]_${activePatient.name}_임상사진`);
      const dFolder = await pFolder.getDirectoryHandle(editTarget.record.date);
      
      const editedName = "edited_" + Date.now() + "_" + editTarget.originalName;
      const newFileHandle = await dFolder.getFileHandle(editedName, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      let imgData = editTarget.record.images[editTarget.index];
      if (typeof imgData === 'string') {
        editTarget.record.images[editTarget.index] = { original: imgData, edited: editedName };
      } else {
        imgData.edited = editedName;
      }
      
      await savePatientsData();
      imageEditModal.classList.remove("show");
      renderViewPanels(); 
      showNotification("크롭/편집본이 고화질로 저장되었습니다.");
      
      btn.innerText = "크롭/편집본 저장"; btn.disabled = false;
    }, 'image/jpeg', 1.0);
  } catch(e) {
    showNotification("저장 중 에러 발생");
    btn.innerText = "크롭/편집본 저장"; btn.disabled = false;
  }
};