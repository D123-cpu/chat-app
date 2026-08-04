const API_BASE = "/api/auth";

// Apply saved dark/light theme preference (kept consistent with chat.html)
document.documentElement.setAttribute(
  "data-theme",
  localStorage.getItem("theme") || "light"
);

// Redirect to chat if already logged in
if (localStorage.getItem("token")) {
  window.location.href = "chat.html";
}

const errorEl = document.getElementById("error-msg");

const showError = (message) => {
  errorEl.textContent = message;
};

// Saves auth data and redirects to the chat page
const handleAuthSuccess = (data) => {
  localStorage.setItem("token", data.token);
  localStorage.setItem("userId", data._id);
  localStorage.setItem("username", data.username);
  window.location.href = "chat.html";
};

// ---------- Login form ----------
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.message || "Login failed");
        return;
      }

      handleAuthSuccess(data);
    } catch (error) {
      showError("Could not reach the server. Please try again.");
    }
  });
}

// ---------- Register form ----------
const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.message || "Registration failed");
        return;
      }

      handleAuthSuccess(data);
    } catch (error) {
      showError("Could not reach the server. Please try again.");
    }
  });
}