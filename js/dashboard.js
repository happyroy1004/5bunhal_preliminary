import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
// 추후 데이터베이스(Firestore) 사용을 위해 db도 미리 import 해둡니다.

const logoutBtn = document.getElementById("logoutBtn");
const addPatientBtn = document.getElementById("addPatientBtn");
const userTitle = document.getElementById("userTitle");

// 1. 로그인 상태 확인 및 보호 (보안)
onAuthStateChanged(auth, (user) => {
  if (user) {
    // 정상적으로 로그인된 경우, 상단 제목을 유저 이메일로 변경
    userTitle.innerText = `${user.email} 님의 증례 목록`;
    
    // TODO: 여기에 Firestore(db)에서 환자 목록을 불러와 화면에 뿌려주는 코드가 들어갈 예정입니다.
  } else {
    // 로그인되지 않은 상태로 주소를 쳐서 들어온 경우 쫓아내기
    alert("로그인이 필요한 서비스입니다.");
    window.location.href = "index.html"; // 로그인 화면으로 돌려보냄
  }
});

// 2. 로그아웃 기능 구현
logoutBtn.onclick = async () => {
  try {
    await signOut(auth);
    localStorage.removeItem("uid"); // 로컬에 저장해둔 찌꺼기 데이터 삭제
    window.location.href = "index.html"; // 로그아웃 성공 시 첫 화면으로 이동
  } catch (error) {
    alert("로그아웃 처리 중 에러가 발생했습니다: " + error.message);
  }
};

// 3. 새 환자 등록 버튼 (UI 테스트용 임시 로직)
addPatientBtn.onclick = () => {
  const patientName = prompt("새로 등록할 환자의 이름 또는 차트 번호를 입력하세요:");
  if (patientName) {
    alert(`[${patientName}] 환자 등록 로직이 실행됩니다.\n(추후 Firebase DB 연동 및 patient.html 이동 구현 예정)`);
    // TODO: 환자 정보를 DB의 특정 노드에 저장하고, 해당 환자의 증례 페이지(patient.html)로 넘어가는 로직을 연결해야 합니다.
  }
};