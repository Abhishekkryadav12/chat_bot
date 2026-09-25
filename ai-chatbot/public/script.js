/* ============================================
   Astra AI — Frontend Logic
   ============================================ */

(function () {
  "use strict";

  // ---------- State ----------
  let conversations = [];
  let currentConvId = null;
  let isGenerating = false;
  let abortController = null;
  let lastUserMessage = "";

  const MAX_CHARS = 4000;
  const STORAGE_KEY = "astra_ai_conversations";
  const THEME_KEY = "astra_ai_theme";
  const SIDEBAR_KEY = "astra_ai_sidebar";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const app = $("app");
  const sidebar = $("sidebar");
  const sidebarOverlay = $("sidebarOverlay");
  const sidebarClose = $("sidebarClose");
  const menuToggle = $("menuToggle");
  const newChatBtn = $("newChatBtn");
  const headerNewChat = $("headerNewChat");
  const searchInput = $("searchInput");
  const conversationList = $("conversationList");
  const settingsBtn = $("settingsBtn");
  const clearChatsBtn = $("clearChatsBtn");
  const themeToggle = $("themeToggle");
  const messagesArea = $("messagesArea");
  const welcomeScreen = $("welcomeScreen");
  const messagesList = $("messagesList");
  const messageInput = $("messageInput");
  const sendBtn = $("sendBtn");
  const charCounter = $("charCounter");
  const settingsModal = $("settingsModal");
  const closeSettings = $("closeSettings");
  const themeSelect = $("themeSelect");
  const modalClearBtn = $("modalClearBtn");
  const toastContainer = $("toastContainer");

  // ---------- Marked config ----------
  if (typeof marked !== "undefined") {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  // ---------- Utils ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function generateTitle(firstMsg) {
    if (!firstMsg) return "New Chat";
    let title = firstMsg.trim().replace(/\s+/g, " ");
    if (title.length > 40) title = title.slice(0, 40) + "...";
    // Capitalize first letter of each significant word
    return title
      .split(" ")
      .slice(0, 6)
      .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
  }

  function toast(message, type) {
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.textContent = message;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.classList.add("fadeout");
      setTimeout(() => t.remove(), 300);
    }, 4000);
  }

  // ---------- Storage ----------
  function saveConversations() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (e) {
      console.error("Failed to save conversations", e);
    }
  }

  function loadConversations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) conversations = JSON.parse(raw);
    } catch (e) {
      conversations = [];
    }
  }

  function saveTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
  }

  function loadTheme() {
    return localStorage.getItem(THEME_KEY) || "dark";
  }

  // ---------- Theme ----------
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    saveTheme(theme);
    themeSelect.value = theme;
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
  }

  // ---------- Sidebar ----------
  function openSidebar() {
    sidebar.classList.add("open");
    sidebarOverlay.classList.add("active");
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarOverlay.classList.remove("active");
  }

  // ---------- Conversations ----------
  function createConversation() {
    const conv = {
      id: uid(),
      title: "New Chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    conversations.unshift(conv);
    currentConvId = conv.id;
    saveConversations();
    renderConversationList();
    renderMessages();
    closeSidebar();
    messageInput.focus();
  }

  function getCurrentConv() {
    return conversations.find((c) => c.id === currentConvId);
  }

  function switchConversation(id) {
    currentConvId = id;
    saveConversations();
    renderConversationList();
    renderMessages();
    closeSidebar();
  }

  function deleteConversation(id, ev) {
    if (ev) ev.stopPropagation();
    conversations = conversations.filter((c) => c.id !== id);
    if (currentConvId === id) {
      currentConvId = conversations.length > 0 ? conversations[0].id : null;
    }
    saveConversations();
    renderConversationList();
    renderMessages();
    toast("Conversation deleted", "success");
  }

  function clearAllConversations() {
    conversations = [];
    currentConvId = null;
    saveConversations();
    renderConversationList();
    renderMessages();
    toast("All conversations cleared", "success");
  }

  // ---------- Render Conversation List ----------
  function renderConversationList() {
    const query = searchInput.value.trim().toLowerCase();

    let filtered = conversations;
    if (query) {
      filtered = conversations.filter((c) =>
        c.title.toLowerCase().includes(query) ||
        c.messages.some((m) => m.content.toLowerCase().includes(query))
      );
    }

    conversationList.innerHTML = "";

    if (filtered.length === 0) {
      conversationList.innerHTML =
        '<div class="empty-conv-list">' +
        (query ? "No conversations found" : "No conversations yet") +
        "</div>";
      return;
    }

    // Group by date
    const groups = {};
    filtered.forEach((c) => {
      const label = formatDate(c.updatedAt || c.createdAt);
      if (!groups[label]) groups[label] = [];
      groups[label].push(c);
    });

    const order = ["Today", "Yesterday"];
    const labels = Object.keys(groups);
    labels.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });

    labels.forEach((label) => {
      const groupEl = document.createElement("div");
      groupEl.className = "conv-group";
      groupEl.innerHTML = '<div class="conv-group-label">' + escapeHtml(label) + "</div>";

      groups[label].forEach((conv) => {
        const item = document.createElement("div");
        item.className = "conv-item" + (conv.id === currentConvId ? " active" : "");
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.innerHTML =
          '<span class="conv-icon">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
          "</span>" +
          '<span class="conv-title">' + escapeHtml(conv.title) + "</span>" +
          '<button class="conv-delete" aria-label="Delete conversation">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          "</button>";

        item.addEventListener("click", () => switchConversation(conv.id));
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            switchConversation(conv.id);
          }
        });
        item.querySelector(".conv-delete").addEventListener("click", (e) =>
          deleteConversation(conv.id, e)
        );

        groupEl.appendChild(item);
      });

      conversationList.appendChild(groupEl);
    });
  }

  // ---------- Render Messages ----------
  function renderMessages() {
    const conv = getCurrentConv();

    if (!conv || conv.messages.length === 0) {
      welcomeScreen.style.display = "flex";
      messagesList.style.display = "none";
      messagesList.innerHTML = "";
      return;
    }

    welcomeScreen.style.display = "none";
    messagesList.style.display = "flex";
    messagesList.innerHTML = "";

    conv.messages.forEach((msg) => {
      appendMessageEl(msg.role, msg.content, msg.timestamp, msg.id, msg.feedback);
    });

    scrollToBottom(false);
  }

  function appendMessageEl(role, content, timestamp, msgId, feedback) {
    const msgEl = document.createElement("div");
    msgEl.className = "message " + role;
    if (msgId) msgEl.dataset.msgId = msgId;

    const avatarSvg =
      role === "user"
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" /></svg>';

    let bodyHtml;
    if (role === "assistant") {
      bodyHtml = renderMarkdown(content);
    } else {
      bodyHtml = escapeHtml(content);
    }

    const actionsHtml =
      role === "assistant"
        ? '<div class="message-actions">' +
          '<button class="msg-action-btn copy-btn" title="Copy" aria-label="Copy message">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          "</button>" +
          '<button class="msg-action-btn regen-btn" title="Regenerate" aria-label="Regenerate response">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
          "</button>" +
          '<button class="msg-action-btn like-btn' + (feedback === "like" ? " liked" : "") + '" title="Like" aria-label="Like response">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>' +
          "</button>" +
          '<button class="msg-action-btn dislike-btn' + (feedback === "dislike" ? " disliked" : "") + '" title="Dislike" aria-label="Dislike response">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>' +
          "</button>" +
          "</div>"
        : '<div class="message-actions">' +
          '<button class="msg-action-btn copy-btn" title="Copy" aria-label="Copy message">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
          "</button>" +
          "</div>";

    msgEl.innerHTML =
      '<div class="message-avatar">' + avatarSvg + "</div>" +
      '<div class="message-content">' +
      '<div class="message-header">' +
      '<span class="message-author">' + (role === "user" ? "You" : "Astra AI") + "</span>" +
      '<span class="message-time">' + (timestamp ? formatTime(timestamp) : "") + "</span>" +
      "</div>" +
      '<div class="message-body">' + bodyHtml + "</div>" +
      actionsHtml +
      "</div>";

    messagesList.appendChild(msgEl);

    // Wire actions
    msgEl.querySelector(".copy-btn")?.addEventListener("click", () => {
      copyText(content, msgEl.querySelector(".copy-btn"));
    });

    if (role === "assistant") {
      msgEl.querySelector(".regen-btn")?.addEventListener("click", () => {
        regenerateResponse(msgId);
      });
      msgEl.querySelector(".like-btn")?.addEventListener("click", (e) => {
        setFeedback(msgId, "like", e.currentTarget);
      });
      msgEl.querySelector(".dislike-btn")?.addEventListener("click", (e) => {
        setFeedback(msgId, "dislike", e.currentTarget);
      });
    }

    // Wire code copy buttons
    msgEl.querySelectorAll(".code-copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const code = btn.closest("pre").querySelector("code").textContent;
        copyText(code, btn);
      });
    });

    return msgEl;
  }

  // ---------- Markdown ----------
  function renderMarkdown(text) {
    if (!text) return "";
    let html;
    if (typeof marked !== "undefined") {
      html = marked.parse(text);
    } else {
      html = "<p>" + escapeHtml(text).replace(/\n/g, "<br>") + "</p>";
    }

    // Add copy buttons to code blocks
    const temp = document.createElement("div");
    temp.innerHTML = html;
    temp.querySelectorAll("pre").forEach((pre) => {
      const code = pre.querySelector("code");
      const lang = code ? (code.className.match(/language-(\w+)/) || [])[1] || "code" : "code";

      const wrapper = document.createElement("div");
      const header = document.createElement("div");
      header.className = "code-header";
      header.innerHTML =
        '<span>' + escapeHtml(lang) + "</span>" +
        '<button class="code-copy-btn">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
        " Copy</button>";

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });

    return temp.innerHTML;
  }

  // ---------- Copy ----------
  function copyText(text, btn) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (btn) {
          btn.classList.add("copied");
          setTimeout(() => btn.classList.remove("copied"), 2000);
        }
        toast("Copied to clipboard", "success");
      })
      .catch(() => toast("Failed to copy", "error"));
  }

  // ---------- Feedback ----------
  function setFeedback(msgId, type, btn) {
    const conv = getCurrentConv();
    if (!conv) return;
    const msg = conv.messages.find((m) => m.id === msgId);
    if (!msg) return;

    msg.feedback = msg.feedback === type ? null : type;
    saveConversations();

    // Update UI
    const likeBtn = btn.parentElement.querySelector(".like-btn");
    const dislikeBtn = btn.parentElement.querySelector(".dislike-btn");
    likeBtn.classList.remove("liked");
    dislikeBtn.classList.remove("disliked");
    if (msg.feedback === "like") likeBtn.classList.add("liked");
    if (msg.feedback === "dislike") dislikeBtn.classList.add("disliked");
  }

  // ---------- Typing Indicator ----------
  let typingEl = null;
  function showTyping() {
    typingEl = document.createElement("div");
    typingEl.className = "typing-indicator";
    typingEl.innerHTML =
      '<div class="message-avatar" style="background:linear-gradient(135deg,var(--accent-400),var(--accent-600));color:#fff">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" /></svg>' +
      "</div>" +
      '<div class="typing-bubble">' +
      '<div class="typing-dot"></div>' +
      '<div class="typing-dot"></div>' +
      '<div class="typing-dot"></div>' +
      "</div>";
    messagesList.appendChild(typingEl);
    scrollToBottom();
  }

  function hideTyping() {
    if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  // ---------- Scroll ----------
  function scrollToBottom(smooth) {
    if (smooth === undefined) smooth = true;
    requestAnimationFrame(() => {
      messagesArea.scrollTo({
        top: messagesArea.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    });
  }

  // ---------- Send Message ----------
  async function sendMessage(forceText) {
    const text = (typeof forceText === "string" ? forceText : messageInput.value).trim();
    if (!text || isGenerating) return;

    if (text.length > MAX_CHARS) {
      toast("Message exceeds " + MAX_CHARS + " characters", "warning");
      return;
    }

    // Ensure there's a conversation
    if (!getCurrentConv()) {
      createConversation();
    }

    const conv = getCurrentConv();
    lastUserMessage = text;

    // Add user message
    const userMsg = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    conv.messages.push(userMsg);

    // Auto title
    if (conv.title === "New Chat" && conv.messages.length === 1) {
      conv.title = generateTitle(text);
    }

    conv.updatedAt = Date.now();
    saveConversations();

    // Clear input
    if (typeof forceText !== "string") {
      messageInput.value = "";
      updateCharCounter();
      autoGrow();
    }

    renderMessages();
    renderConversationList();
    setGenerating(true);
    showTyping();

    // Build messages payload
    const payload = conv.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    abortController = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
        signal: abortController.signal,
      });

      hideTyping();

      const data = await res.json();

      if (!res.ok) {
        const errMsg = data.error || "Something went wrong. Please try again.";
        const type = res.status === 429 ? "warning" : "error";
        toast(errMsg, type);
        appendErrorMessage(errMsg);
        setGenerating(false);
        return;
      }

      if (!data.reply) {
        toast("The AI returned an empty response", "warning");
        appendErrorMessage("Empty response received. Please try again.");
        setGenerating(false);
        return;
      }

      // Add assistant message
      const aiMsg = {
        id: uid(),
        role: "assistant",
        content: data.reply,
        timestamp: Date.now(),
      };
      conv.messages.push(aiMsg);
      conv.updatedAt = Date.now();
      saveConversations();

      appendMessageEl("assistant", data.reply, aiMsg.timestamp, aiMsg.id);
      renderConversationList();
      scrollToBottom();
    } catch (err) {
      hideTyping();
      if (err.name === "AbortError") {
        // User stopped generation
        toast("Generation stopped", "warning");
      } else {
        toast("Network error. Please check your connection.", "error");
        appendErrorMessage("Network error. Please check your connection and try again.");
      }
    } finally {
      setGenerating(false);
      abortController = null;
    }
  }

  function appendErrorMessage(msg) {
    const conv = getCurrentConv();
    if (!conv) return;
    const aiMsg = {
      id: uid(),
      role: "assistant",
      content: "*Error: " + msg + "*",
      timestamp: Date.now(),
      isError: true,
    };
    conv.messages.push(aiMsg);
    saveConversations();
    appendMessageEl("assistant", aiMsg.content, aiMsg.timestamp, aiMsg.id);
    scrollToBottom();
  }

  function stopGeneration() {
    if (abortController) {
      abortController.abort();
    }
  }

  function regenerateResponse(msgId) {
    if (isGenerating) return;
    const conv = getCurrentConv();
    if (!conv) return;

    // Find the assistant message
    const idx = conv.messages.findIndex((m) => m.id === msgId && m.role === "assistant");
    if (idx === -1) return;

    // Find the preceding user message
    let userIdx = idx - 1;
    while (userIdx >= 0 && conv.messages[userIdx].role !== "user") userIdx--;
    if (userIdx < 0) return;

    const userMsg = conv.messages[userIdx];

    // Remove the assistant message
    conv.messages.splice(idx, 1);
    saveConversations();
    renderMessages();

    // Re-send from the user message
    sendMessage(userMsg.content);
  }

  // ---------- Generating State ----------
  function setGenerating(val) {
    isGenerating = val;
    if (val) {
      sendBtn.classList.add("generating");
      sendBtn.disabled = false;
    } else {
      sendBtn.classList.remove("generating");
      sendBtn.disabled = messageInput.value.trim().length === 0;
    }
  }

  // ---------- Composer ----------
  function autoGrow() {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + "px";
  }

  function updateCharCounter() {
    const len = messageInput.value.length;
    charCounter.textContent = len + " / " + MAX_CHARS;
    charCounter.classList.toggle("warning", len > MAX_CHARS * 0.8 && len <= MAX_CHARS);
    charCounter.classList.toggle("limit", len > MAX_CHARS);
    sendBtn.disabled = !isGenerating && len === 0;
  }

  // ---------- Settings Modal ----------
  function openSettings() {
    settingsModal.classList.add("active");
  }
  function closeSettingsModal() {
    settingsModal.classList.remove("active");
  }

  // ---------- Events ----------
  newChatBtn.addEventListener("click", () => {
    if (isGenerating) stopGeneration();
    createConversation();
  });

  headerNewChat.addEventListener("click", () => {
    if (isGenerating) stopGeneration();
    createConversation();
  });

  themeToggle.addEventListener("click", toggleTheme);

  menuToggle.addEventListener("click", openSidebar);
  sidebarClose.addEventListener("click", closeSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);

  searchInput.addEventListener("input", renderConversationList);

  settingsBtn.addEventListener("click", openSettings);
  closeSettings.addEventListener("click", closeSettingsModal);
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  themeSelect.addEventListener("change", (e) => setTheme(e.target.value));

  clearChatsBtn.addEventListener("click", () => {
    if (conversations.length === 0) {
      toast("No conversations to clear", "warning");
      return;
    }
    if (confirm("Delete all conversations? This cannot be undone.")) {
      clearAllConversations();
      closeSidebar();
    }
  });

  modalClearBtn.addEventListener("click", () => {
    if (conversations.length === 0) {
      toast("No conversations to clear", "warning");
      return;
    }
    if (confirm("Delete all conversations? This cannot be undone.")) {
      clearAllConversations();
      closeSettingsModal();
    }
  });

  // Composer
  messageInput.addEventListener("input", () => {
    autoGrow();
    updateCharCounter();
  });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isGenerating) return;
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", () => {
    if (isGenerating) {
      stopGeneration();
    } else {
      sendMessage();
    }
  });

  // Suggestion cards
  document.querySelectorAll(".suggestion-card").forEach((card) => {
    card.addEventListener("click", () => {
      const prompt = card.dataset.prompt;
      if (!isGenerating) sendMessage(prompt);
    });
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    // Ctrl+K — search
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    // Ctrl+N — new chat
    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      if (isGenerating) stopGeneration();
      createConversation();
    }
    // Escape — close modals/sidebar
    if (e.key === "Escape") {
      closeSidebar();
      closeSettingsModal();
    }
  });

  // ---------- Init ----------
  function init() {
    // Theme
    setTheme(loadTheme());

    // Load conversations
    loadConversations();

    // Restore or create conversation
    if (conversations.length > 0) {
      currentConvId = conversations[0].id;
    } else {
      createConversation();
    }

    renderConversationList();
    renderMessages();
    updateCharCounter();
    messageInput.focus();
  }

  init();
})();
