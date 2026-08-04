const token = localStorage.getItem("token");
const currentUserId = localStorage.getItem("userId");
const currentUsername = localStorage.getItem("username");

// Redirect to login if not authenticated
if (!token || !currentUserId) {
  window.location.href = "login.html";
}

// ---------- Elements ----------
const userListEl = document.getElementById("user-list");
const chatHeaderEl = document.getElementById("chat-header");
const messageAreaEl = document.getElementById("message-area");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const logoutBtn = document.getElementById("logout-btn");
const myAvatarEl = document.getElementById("my-avatar");
const currentUsernameEl = document.getElementById("current-username");
const searchInput = document.getElementById("search-input");
const themeToggleBtn = document.getElementById("theme-toggle");
const themeIconDark = document.getElementById("theme-icon-dark");
const themeIconLight = document.getElementById("theme-icon-light");

// ---------- State ----------
let allUsers = []; // Full list of other users, with lastSeen kept in sync
let onlineUserIds = new Set();
let unreadCounts = {}; // { userId: count }
let activeUser = null; // { _id, username, ... } currently open conversation
let searchQuery = "";
let lastRenderedDateKey = null;
let myTypingTimeout = null;
let otherTypingTimeout = null;

// ---------- Theme (dark mode) ----------
const applyTheme = (theme) => {
  document.documentElement.setAttribute("data-theme", theme);
  themeIconDark.style.display = theme === "dark" ? "none" : "block";
  themeIconLight.style.display = theme === "dark" ? "block" : "none";
};

applyTheme(localStorage.getItem("theme") || "light");

themeToggleBtn.addEventListener("click", () => {
  const next =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "light"
      : "dark";
  localStorage.setItem("theme", next);
  applyTheme(next);
});

// ---------- Avatar helpers ----------
const AVATAR_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

const colorForUser = (id) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const initialsFor = (name) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const buildAvatar = (id, name, sizeClass = "") => {
  const el = document.createElement("div");
  el.className = `avatar ${sizeClass}`.trim();
  el.style.backgroundColor = colorForUser(id);
  el.textContent = initialsFor(name);
  return el;
};

myAvatarEl.style.backgroundColor = colorForUser(currentUserId);
myAvatarEl.textContent = initialsFor(currentUsername);
currentUsernameEl.textContent = currentUsername;

// ---------- Logout ----------
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("userId");
  localStorage.removeItem("username");
  window.location.href = "login.html";
});

// ---------- Search ----------
searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  renderUserList();
});

// ---------- Socket.io connection ----------
const socket = io({ auth: { token } });

socket.on("connect_error", (err) => {
  console.error("Socket connection failed:", err.message);
});

// Initial snapshot of who's online, sent right after connecting
socket.on("onlineUsers", (ids) => {
  onlineUserIds = new Set(ids);
  renderUserList();
  updateHeaderStatus();
});

socket.on("userOnline", (userId) => {
  onlineUserIds.add(userId);
  renderUserList();
  updateHeaderStatus();
});

socket.on("userOffline", ({ userId, lastSeen }) => {
  onlineUserIds.delete(userId);
  const user = allUsers.find((u) => u._id === userId);
  if (user) user.lastSeen = lastSeen;
  renderUserList();
  updateHeaderStatus();
});

// Receive a real-time message (from either side of the conversation)
socket.on("receiveMessage", (message) => {
  const belongsToOpenChat =
    activeUser &&
    ((message.sender._id === activeUser._id &&
      message.receiver === currentUserId) ||
      (message.sender._id === currentUserId &&
        message.receiver === activeUser._id));

  if (belongsToOpenChat) {
    renderMessage(message);
    scrollToBottom();

    // If the incoming message is from the person we're actively viewing,
    // mark it seen immediately since the chat window is open.
    if (message.sender._id === activeUser._id) {
      socket.emit("markAsSeen", { senderId: activeUser._id });
      hideTypingIndicator();
    }
  } else if (message.receiver === currentUserId) {
    // A message arrived for a conversation that isn't open - bump its badge
    unreadCounts[message.sender._id] = (unreadCounts[message.sender._id] || 0) + 1;
    renderUserList();
  }
});

// The other user has read our messages - flip our ticks to "seen"
socket.on("messagesSeen", ({ by }) => {
  if (activeUser && by === activeUser._id) {
    document.querySelectorAll(".message-bubble.sent .tick").forEach((tick) => {
      tick.classList.add("seen");
      tick.innerHTML = doubleTickSvg();
    });
  }
});

// The other user has come online and received our queued messages
socket.on("messagesDelivered", ({ by }) => {
  if (activeUser && by === activeUser._id) {
    document.querySelectorAll(".message-bubble.sent .tick:not(.seen)").forEach((tick) => {
      tick.innerHTML = doubleTickSvg();
    });
  }
});

// ---------- Typing indicator ----------
socket.on("typing", ({ from }) => {
  if (activeUser && from === activeUser._id) {
    showTypingIndicator();
    clearTimeout(otherTypingTimeout);
    otherTypingTimeout = setTimeout(hideTypingIndicator, 3000);
  }
});

socket.on("stopTyping", ({ from }) => {
  if (activeUser && from === activeUser._id) hideTypingIndicator();
});

messageInput.addEventListener("input", () => {
  if (!activeUser) return;
  socket.emit("typing", { receiverId: activeUser._id });
  clearTimeout(myTypingTimeout);
  myTypingTimeout = setTimeout(() => {
    socket.emit("stopTyping", { receiverId: activeUser._id });
  }, 1500);
});

const showTypingIndicator = () => {
  if (document.getElementById("typing-row")) return;
  const row = document.createElement("div");
  row.className = "message-row received";
  row.id = "typing-row";
  row.innerHTML = `
    <div class="message-bubble received typing-bubble">
      <span></span><span></span><span></span>
    </div>
  `;
  messageAreaEl.appendChild(row);
  scrollToBottom();
};

const hideTypingIndicator = () => {
  document.getElementById("typing-row")?.remove();
};

// ---------- Load user list + unread counts ----------
const loadUsers = async () => {
  try {
    const res = await fetch("/api/chat/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to load users");
    allUsers = await res.json();
    renderUserList();
  } catch (error) {
    userListEl.innerHTML = `<li class="sidebar-empty">Could not load users</li>`;
  }
};

const loadUnreadCounts = async () => {
  try {
    const res = await fetch("/api/chat/unread-counts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    unreadCounts = await res.json();
    renderUserList();
  } catch (error) {
    // Non-critical
  }
};

const formatLastSeen = (dateStr) => {
  if (!dateStr) return "Offline";
  const date = new Date(dateStr);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `Last seen ${time}` : `Last seen ${date.toLocaleDateString()}`;
};

// ---------- Render sidebar user list ----------
const renderUserList = () => {
  userListEl.innerHTML = "";

  const filtered = allUsers.filter((u) =>
    u.username.toLowerCase().includes(searchQuery)
  );

  if (allUsers.length === 0) {
    userListEl.innerHTML = `<li class="sidebar-empty">No other users yet</li>`;
    return;
  }

  if (filtered.length === 0) {
    userListEl.innerHTML = `<li class="sidebar-empty">No matches found</li>`;
    return;
  }

  filtered.forEach((user) => {
    const isOnline = onlineUserIds.has(user._id);
    const unread = unreadCounts[user._id] || 0;

    const li = document.createElement("li");
    li.dataset.userId = user._id;
    if (activeUser && activeUser._id === user._id) li.classList.add("active");

    const avatarWrap = buildAvatar(user._id, user.username, "sm");
    const dot = document.createElement("span");
    dot.className = `status-dot ${isOnline ? "online" : ""}`;
    avatarWrap.appendChild(dot);

    const info = document.createElement("div");
    info.className = "user-info";

    const textWrap = document.createElement("div");
    textWrap.className = "user-text";
    textWrap.innerHTML = `
      <div class="user-name"></div>
      <div class="user-substatus ${isOnline ? "online-text" : ""}"></div>
    `;
    textWrap.querySelector(".user-name").textContent = user.username;
    textWrap.querySelector(".user-substatus").textContent = isOnline
      ? "Online"
      : formatLastSeen(user.lastSeen);

    info.appendChild(textWrap);

    if (unread > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = unread > 99 ? "99+" : unread;
      info.appendChild(badge);
    }

    li.appendChild(avatarWrap);
    li.appendChild(info);
    li.addEventListener("click", () => selectUser(user, li));
    userListEl.appendChild(li);
  });
};

// ---------- Header status for the active conversation ----------
const updateHeaderStatus = () => {
  if (!activeUser) return;
  const isOnline = onlineUserIds.has(activeUser._id);
  const statusEl = chatHeaderEl.querySelector(".header-status");
  if (!statusEl) return;

  statusEl.textContent = isOnline ? "Online" : formatLastSeen(activeUser.lastSeen);
  statusEl.classList.toggle("online-text", isOnline);
  chatHeaderEl.querySelector(".status-dot")?.classList.toggle("online", isOnline);
};

// ---------- Select a user to chat with ----------
const selectUser = async (user, listItemEl) => {
  activeUser = user;
  hideTypingIndicator();
  clearTimeout(otherTypingTimeout);

  document
    .querySelectorAll(".user-list li")
    .forEach((li) => li.classList.remove("active"));
  listItemEl.classList.add("active");

  // Clear unread badge for this user immediately
  unreadCounts[user._id] = 0;
  renderUserList();
  // Re-apply the active highlight after re-render
  document
    .querySelector(`.user-list li[data-user-id="${user._id}"]`)
    ?.classList.add("active");

  const isOnline = onlineUserIds.has(user._id);
  const avatar = buildAvatar(user._id, user.username, "lg");
  const dot = document.createElement("span");
  dot.className = `status-dot ${isOnline ? "online" : ""}`;
  avatar.appendChild(dot);

  chatHeaderEl.innerHTML = "";
  chatHeaderEl.appendChild(avatar);

  const textWrap = document.createElement("div");
  textWrap.className = "header-text";
  textWrap.innerHTML = `
    <div class="header-name"></div>
    <div class="header-status ${isOnline ? "online-text" : ""}"></div>
  `;
  textWrap.querySelector(".header-name").textContent = user.username;
  textWrap.querySelector(".header-status").textContent = isOnline
    ? "Online"
    : formatLastSeen(user.lastSeen);
  chatHeaderEl.appendChild(textWrap);

  messageInput.disabled = false;
  sendBtn.disabled = false;

  await loadHistory(user._id);

  // Mark any unseen messages from this user as read now that we're viewing them
  socket.emit("markAsSeen", { senderId: user._id });
};

// ---------- Date divider helpers ----------
const dateKeyFor = (dateStr) => new Date(dateStr).toDateString();

const formatDateDivider = (dateStr) => {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
};

const insertDateDividerIfNeeded = (dateStr) => {
  const key = dateKeyFor(dateStr);
  if (key === lastRenderedDateKey) return;
  lastRenderedDateKey = key;

  const divider = document.createElement("div");
  divider.className = "date-divider";
  divider.innerHTML = `<span>${formatDateDivider(dateStr)}</span>`;
  messageAreaEl.appendChild(divider);
};

// ---------- Load chat history ----------
const loadHistory = async (receiverId) => {
  lastRenderedDateKey = null;
  messageAreaEl.innerHTML = `<div class="empty-state-wrap"><p>Loading messages...</p></div>`;

  try {
    const res = await fetch(`/api/chat/history/${receiverId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to load history");

    const messages = await res.json();
    messageAreaEl.innerHTML = "";

    if (messages.length === 0) {
      messageAreaEl.innerHTML = `<div class="empty-state-wrap"><p>No messages yet. Say hello!</p></div>`;
      return;
    }

    messages.forEach(renderMessage);
    scrollToBottom();
  } catch (error) {
    messageAreaEl.innerHTML = `<div class="empty-state-wrap"><p>Could not load messages</p></div>`;
  }
};

// ---------- Tick icons (sent / delivered / seen) ----------
const singleTickSvg = () =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const doubleTickSvg = () =>
  `<svg width="16" height="14" viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 12 6 17 15 6"></polyline><polyline points="10 12 15 17 27 4"></polyline></svg>`;

// ---------- Render a single message bubble ----------
const renderMessage = (message) => {
  const placeholder = messageAreaEl.querySelector(".empty-state-wrap");
  if (placeholder) placeholder.remove();

  insertDateDividerIfNeeded(message.createdAt);

  const isSentByMe = message.sender._id === currentUserId;

  const row = document.createElement("div");
  row.className = `message-row ${isSentByMe ? "sent" : "received"}`;

  const bubble = document.createElement("div");
  bubble.className = `message-bubble ${isSentByMe ? "sent" : "received"}`;

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const textNode = document.createElement("div");
  textNode.textContent = message.content;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const timeSpan = document.createElement("span");
  timeSpan.textContent = time;
  meta.appendChild(timeSpan);

  if (isSentByMe) {
    const tick = document.createElement("span");
    tick.className = `tick ${message.seen ? "seen" : ""}`;
    tick.innerHTML =
      message.seen || message.delivered ? doubleTickSvg() : singleTickSvg();
    meta.appendChild(tick);
  }

  bubble.appendChild(textNode);
  bubble.appendChild(meta);
  row.appendChild(bubble);
  messageAreaEl.appendChild(row);
};

const scrollToBottom = () => {
  messageAreaEl.scrollTop = messageAreaEl.scrollHeight;
};

// ---------- Send a message ----------
messageForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const content = messageInput.value.trim();
  if (!content || !activeUser) return;

  socket.emit("sendMessage", {
    receiverId: activeUser._id,
    content,
  });

  clearTimeout(myTypingTimeout);
  socket.emit("stopTyping", { receiverId: activeUser._id });

  messageInput.value = "";
});

// ---------- Init ----------
loadUsers();
loadUnreadCounts();