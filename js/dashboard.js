import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const logoutBtn = document.getElementById("logoutBtn");
const navUserName = document.getElementById("navUserName");
const greetingName = document.getElementById("greetingName");

// 모달 및 버튼 DOM
const addPatientBtn = document.getElementById("addPatientBtn");
const modal = document.getElementById("addPatientModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelBtn = document.getElementById("cancelBtn");
const addPatientForm = document.getElementById("addPatientForm");

// 1. 로그인 상태 확인 및 이름 표시
onAuthStateChanged(auth, (user) => {
  if (user) {
    const displayName = user.displayName || user.email.split('@')[0];
    navUserName.innerText = displayName;
    greetingName.innerText = displayName;
  } else {
    window.location.href = "index.html";
  }
});

// 2. 로그아웃
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.href = "index.html";
  };
}

// 3. 팝업(prompt) 대신 모달창 띄우기
if (addPatientBtn) {
  addPatientBtn.onclick = () => {
    modal.classList.add("show");
  };
}

// 모달 닫기 버튼들
if (closeModalBtn) closeModalBtn.onclick = () => modal.classList.remove("show");
if (cancelBtn) cancelBtn.onclick = () => modal.classList.remove("show");

// 4. 모달에서 환자 등록 '제출' 눌렀을 때
if (addPatientForm) {
  addPatientForm.onsubmit = (e) => {
    e.preventDefault(); 
    const name = document.getElementById("patientName").value;
    const chart = document.getElementById("chartNumber").value;
    
    alert(`[${name}] 환자가 성공적으로 등록되었습니다!\n(진료번호: ${chart})`);
    modal.classList.remove("show");
    addPatientForm.reset(); 
    
    // 차후 Firebase DB에 저장하는 코드 추가 예정
  };
}
