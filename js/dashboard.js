import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const logoutBtn = document.getElementById("logoutBtn");
const navUserName = document.getElementById("navUserName");
const greetingName = document.getElementById("greetingName");

// 모달 관련 DOM
const modal = document.getElementById("addPatientModal");
const openModalBtn = document.getElementById("openModalBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelBtn = document.getElementById("cancelBtn");
const addPatientForm = document.getElementById("addPatientForm");

// 1. 로그인 상태 확인 (이름 띄우기)
onAuthStateChanged(auth, (user) => {
  if (user) {
    // 가입할 때 입력한 이름이 있으면 쓰고, 없으면 이메일 앞부분 사용
    const displayName = user.displayName || user.email.split('@')[0];
    navUserName.innerText = displayName;
    greetingName.innerText = displayName;
  } else {
    window.location.href = "index.html";
  }
});

// 2. 로그아웃
logoutBtn.onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};

// 3. 모달창 열고 닫기 (prompt 대체)
openModalBtn.onclick = () => modal.classList.add("show");
closeModalBtn.onclick = () => modal.classList.remove("show");
cancelBtn.onclick = () => modal.classList.remove("show");

// 4. 새 환자 등록 제출
addPatientForm.onsubmit = (e) => {
  e.preventDefault(); // 페이지 새로고침 방지
  const name = document.getElementById("patientName").value;
  const chart = document.getElementById("chartNumber").value;
  
  alert(`[${name}] 환자가 성공적으로 등록되었습니다!\n(진료번호: ${chart})`);
  modal.classList.remove("show");
  addPatientForm.reset(); // 입력 폼 초기화
  
  // TODO: 이후 환자 카드를 화면에 추가하는 로직 작성
};
