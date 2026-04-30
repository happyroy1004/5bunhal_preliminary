import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } 
from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const loginBtn = document.querySelector("#loginBtn");
const signUpLink = document.querySelector("#signUpLink");

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

signUpLink.onclick = async () => {
  const email = prompt("이메일을 입력하세요:");
  const pw = prompt("비밀번호를 입력하세요:");
  if (!email || !pw) return;
  try {
    await createUserWithEmailAndPassword(auth, email, pw);
    alert("회원가입 완료. 로그인 해주세요.");
  } catch (err) {
    alert(err.message);
  }
};

onAuthStateChanged(auth, (user) => {
  if (user) localStorage.setItem("uid", user.uid);
});
