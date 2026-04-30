import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } 
from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const loginBtn = document.querySelector("#loginBtn");
const signUpLink = document.querySelector("#signUpLink");

// 새로 추가된 HTML 요소들 선택
const signupForm = document.querySelector("#signupForm");
const submitSignUpBtn = document.querySelector("#submitSignUpBtn");

// 로그인 버튼 클릭 시
loginBtn.onclick = async () => {
  const email = document.querySelector("#loginEmail").value;
  const pw = document.querySelector("#loginPw").value;
  try {
    await signInWithEmailAndPassword(auth, email, pw);
    window.location.href = "dashboard.html";
  } catch (err) {
    alert("로그인 실패: " + err.message);
  }
};

// '회원가입' 글자 클릭 시 -> 아래에 회원가입 폼 보여주기
signUpLink.onclick = (e) => {
  e.preventDefault(); // 링크 클릭 시 화면 맨 위로 튕기는 현상 방지
  signupForm.style.display = "block"; // 숨겨진 폼 나타나게 하기
};

// 회원가입 폼 안의 '가입하기' 버튼 클릭 시
submitSignUpBtn.onclick = async () => {
  // 회원가입 폼에 입력된 값 가져오기
  const email = document.querySelector("#signUpEmail").value;
  const pw = document.querySelector("#signUpPw").value;

  if (!email || !pw) {
    alert("이메일과 비밀번호를 모두 입력해주세요.");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, pw);
    alert("회원가입이 완료되었습니다! 이제 위의 로그인 칸을 이용해 로그인 해주세요.");
    signupForm.style.display = "none"; // 가입 성공 후 다시 폼 숨기기
    
    // 가입 완료 후 로그인 칸에 이메일 자동 입력 (편의성)
    document.querySelector("#loginEmail").value = email; 
  } catch (err) {
    alert("회원가입 에러: " + err.message);
  }
};

onAuthStateChanged(auth, (user) => {
  if (user) localStorage.setItem("uid", user.uid);
});
