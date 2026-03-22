const EXPECTED_USER = "sachiko";
const EXPECTED_PASS = "0424";
const AUTH_KEY = "inv_auth";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const err = document.getElementById("login-error");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    err.textContent = "";
    const user = document.getElementById("username").value.trim().toLowerCase();
    const pass = document.getElementById("password").value;

    if (user === EXPECTED_USER && pass === EXPECTED_PASS) {
      sessionStorage.setItem(AUTH_KEY, "1");
      window.location.href = "invite.html";
    } else {
      err.textContent = "用户名或密码不正确。";
    }
  });
});
