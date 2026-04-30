import { auth } from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const loginBox = document.getElementById('loginBox');
const signUpBox = document.getElementById('signUpBox');
const showSignUpBtn = document.getElementById('showSignUpBtn');
const showLoginBtn = document.getElementById('showLoginBtn');

// 화면 전환
showSignUpBtn.onclick = (e) => { e.preventDefault(); loginBox.style.display = 'none'; signUpBox.style.display = 'block'; };
showLoginBtn.onclick = (e) => { e.preventDefault(); signUpBox.style.display = 'none'; loginBox.style.display = 'block'; };

// 로그인 처리
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPw').value;
  try {
    document.getElementById('loginBtn').textContent = '로그인 중...';
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch (err) {
    alert('로그인 실패: 이메일과 비밀번호를 확인해주세요.');
    document.getElementById('loginBtn').textContent = '로그인';
  }
});

// 회원가입 처리 (이름 저장 포함)
document.getElementById('signUpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signUpName').value.trim();
  const email = document.getElementById('signUpEmail').value.trim();
  const password = document.getElementById('signUpPw').value;

  try {
    document.getElementById('submitSignUpBtn').textContent = '가입 중...';
    // 1. 계정 생성
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // 2. 생성된 계정에 '이름' 정보 업데이트
    await updateProfile(userCredential.user, { displayName: name });
    
    alert('회원가입이 완료되었습니다! 대시보드로 이동합니다.');
    window.location.href = "dashboard.html";
  } catch (err) {
    alert('회원가입 실패: ' + err.message);
    document.getElementById('submitSignUpBtn').textContent = '가입하기';
  }
});

// 인증 상태 모니터링
onAuthStateChanged(auth, (user) => {
  if (user) {
    localStorage.setItem("uid", user.uid);
  }
});
