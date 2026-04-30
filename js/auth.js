import { auth } from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// DOM 요소
const loginForm = document.querySelector("#loginForm");
const loginEmail = document.querySelector("#loginEmail");
const loginPw = document.querySelector("#loginPw");
const rememberMe = document.querySelector("#rememberMe");
const signUpLink = document.querySelector("#signUpLink");

// 페이지 로드 시 저장된 이메일 불러오기
window.addEventListener('DOMContentLoaded', () => {
  const savedEmail = localStorage.getItem('savedEmail');
  if (savedEmail) {
    loginEmail.value = savedEmail;
    rememberMe.checked = true;
  }
});

// 로그인 처리
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = loginEmail.value.trim();
  const password = loginPw.value;

  if (!email || !password) {
    alert('이메일과 비밀번호를 모두 입력해주세요.');
    return;
  }

  try {
    // 로그인 중 표시
    const loginBtn = document.querySelector('#loginBtn');
    loginBtn.textContent = '로그인 중...';
    loginBtn.disabled = true;

    await signInWithEmailAndPassword(auth, email, password);
    
    // 아이디 저장 체크박스 확인
    if (rememberMe.checked) {
      localStorage.setItem('savedEmail', email);
    } else {
      localStorage.removeItem('savedEmail');
    }
    
    // 대시보드로 이동
    window.location.href = "dashboard.html";
  } catch (err) {
    console.error('Login error:', err);
    
    let errorMessage = '로그인에 실패했습니다.';
    
    switch (err.code) {
      case 'auth/invalid-email':
        errorMessage = '올바른 이메일 형식이 아닙니다.';
        break;
      case 'auth/user-disabled':
        errorMessage = '비활성화된 계정입니다.';
        break;
      case 'auth/user-not-found':
        errorMessage = '존재하지 않는 계정입니다.';
        break;
      case 'auth/wrong-password':
        errorMessage = '비밀번호가 올바르지 않습니다.';
        break;
      case 'auth/invalid-credential':
        errorMessage = '이메일 또는 비밀번호가 올바르지 않습니다.';
        break;
    }
    
    alert(errorMessage);
    
    // 버튼 복구
    const loginBtn = document.querySelector('#loginBtn');
    loginBtn.textContent = '로그인';
    loginBtn.disabled = false;
  }
});

// 회원가입 링크
signUpLink.addEventListener('click', async (e) => {
  e.preventDefault();
  
  const email = prompt("회원가입할 이메일을 입력하세요:");
  if (!email) return;
  
  const password = prompt("비밀번호를 입력하세요 (최소 6자):");
  if (!password) return;
  
  if (password.length < 6) {
    alert('비밀번호는 최소 6자 이상이어야 합니다.');
    return;
  }
  
  const confirmPassword = prompt("비밀번호를 다시 입력하세요:");
  if (password !== confirmPassword) {
    alert('비밀번호가 일치하지 않습니다.');
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    alert('회원가입이 완료되었습니다! 로그인 해주세요.');
    loginEmail.value = email;
  } catch (err) {
    console.error('Signup error:', err);
    
    let errorMessage = '회원가입에 실패했습니다.';
    
    switch (err.code) {
      case 'auth/email-already-in-use':
        errorMessage = '이미 사용 중인 이메일입니다.';
        break;
      case 'auth/invalid-email':
        errorMessage = '올바른 이메일 형식이 아닙니다.';
        break;
      case 'auth/weak-password':
        errorMessage = '비밀번호가 너무 약합니다. 최소 6자 이상 입력해주세요.';
        break;
    }
    
    alert(errorMessage);
  }
});

// 인증 상태 모니터링
onAuthStateChanged(auth, (user) => {
  if (user) {
    localStorage.setItem("uid", user.uid);
  }
});
