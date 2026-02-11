const API_URL = "/api";
const SESSION_STORAGE_KEY = "sanad.admin.session";
const LEGACY_TOKEN_KEY = "adminToken";
const REQUEST_TIMEOUT_MS = 12000;

const state = {
    messages: [],
    filteredMessages: [],
    pagedMessages: [],
    query: "",
    service: "all",
    read: "all",
    sortBy: "newest",
    isLoading: false,
    currentPage: 1,
    pageSize: 10,
    totalPages: 1
};

function getSession() {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
        try {
            return JSON.parse(raw);
        } catch (error) {
            console.error("Invalid session payload", error);
            localStorage.removeItem(SESSION_STORAGE_KEY);
        }
    }

    const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacyToken) {
        return { token: legacyToken };
    }

    return null;
}

function getToken() {
    const session = getSession();
    return session && typeof session.token === "string" ? session.token : "";
}

function setSession(token, username) {
    const payload = {
        token,
        username: username || "",
        loginAt: new Date().toISOString()
    };

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
}

function clearSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
}

function redirectToLogin() {
    window.location.href = "index.html";
}

function checkAuth() {
    const token = getToken();
    const currentPage = window.location.pathname.toLowerCase();
    const onDashboard = currentPage.endsWith("dashboard.html");

    if (onDashboard && !token) {
        redirectToLogin();
        return false;
    }

    return true;
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

async function apiRequest(path, options = {}, requireAuth = false) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (requireAuth) {
        const token = getToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers,
            signal: controller.signal
        });

        const text = await response.text();
        const data = safeJsonParse(text) || {};

        if (!response.ok) {
            const message = data.error || data.message || `Request failed (${response.status})`;
            const error = new Error(message);
            error.status = response.status;
            throw error;
        }

        return data;
    } finally {
        clearTimeout(timer);
    }
}

function setButtonBusy(button, busy, busyLabel) {
    if (!button) {
        return;
    }

    if (!button.dataset.defaultLabel) {
        button.dataset.defaultLabel = button.textContent;
    }

    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
}

function showLoginError(message) {
    const box = document.getElementById("loginError");
    if (!box) {
        return;
    }

    if (!message) {
        box.style.display = "none";
        box.textContent = "";
        return;
    }

    box.style.display = "block";
    box.textContent = message;
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const submitButton = document.getElementById("loginSubmit");

    const username = usernameInput ? usernameInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!username || !password) {
        showLoginError("Please enter username and password.");
        return;
    }

    showLoginError("");
    setButtonBusy(submitButton, true, "Signing in...");

    try {
        const data = await apiRequest("/login", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });

        if (!data.token) {
            throw new Error("Login response did not include a token.");
        }

        setSession(data.token, username);
        window.location.href = "dashboard.html";
    } catch (error) {
        console.error(error);

        if (error.name === "AbortError") {
            showLoginError("Login timed out. Please try again.");
            return;
        }

        showLoginError(error.message || "Login failed.");
    } finally {
        setButtonBusy(submitButton, false, "Signing in...");
    }
}

function showStatus(message, type = "info") {
    const banner = document.getElementById("statusBanner");
    if (!banner) {
        return;
    }

    if (!message) {
        banner.style.display = "none";
        banner.className = "status-banner";
        banner.textContent = "";
        return;
    }

    banner.style.display = "block";
    banner.className = `status-banner ${type}`;
    banner.textContent = message;
}

function formatDate(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString();
}

function toComparableDate(value) {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function clearNode(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function createTextCell(text, className = "") {
    const cell = document.createElement("td");
    cell.textContent = text == null ? "-" : String(text);

    if (className) {
        cell.className = className;
    }

    return cell;
}

function createStatusPill(isRead) {
    const span = document.createElement("span");
    span.className = `status-pill ${isRead ? "read" : "unread"}`;
    span.textContent = isRead ? "Read" : "Unread";
    return span;
}

function createActionButton(label, action, id, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-btn ${className}`.trim();
    button.dataset.action = action;
    button.dataset.id = String(id);
    button.textContent = label;
    return button;
}

function buildMessageRow(message) {
    const row = document.createElement("tr");
    row.dataset.id = String(message.id);

    if (!message.isRead) {
        row.classList.add("unread");
    }

    row.appendChild(createTextCell(message.id));
    row.appendChild(createTextCell(message.name || "Unknown"));

    const emailCell = document.createElement("td");
    const email = message.email || "";
    if (email) {
        const link = document.createElement("a");
        link.className = "email-link";
        link.href = `mailto:${email}`;
        link.textContent = email;
        emailCell.appendChild(link);
    } else {
        emailCell.textContent = "-";
    }
    row.appendChild(emailCell);

    row.appendChild(createTextCell(message.service || "General"));

    const messageCell = createTextCell(message.message || "", "message-cell");
    if ((message.message || "").length > 140) {
        messageCell.textContent = `${message.message.slice(0, 140)}...`;
    }
    row.appendChild(messageCell);

    const statusCell = document.createElement("td");
    statusCell.appendChild(createStatusPill(Boolean(message.isRead)));
    row.appendChild(statusCell);

    row.appendChild(createTextCell(formatDate(message.timestamp)));

    const actionsCell = document.createElement("td");
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "row-actions";
    actionsWrap.appendChild(createActionButton("View", "view", message.id));
    actionsWrap.appendChild(createActionButton(message.isRead ? "Mark Unread" : "Mark Read", "toggle-read", message.id));
    actionsWrap.appendChild(createActionButton("Delete", "delete", message.id, "danger"));
    actionsCell.appendChild(actionsWrap);
    row.appendChild(actionsCell);

    return row;
}

function renderTable() {
    const tbody = document.querySelector("#messagesTable tbody");
    if (!tbody) {
        return;
    }

    clearNode(tbody);

    if (!state.pagedMessages.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 8;
        cell.style.textAlign = "center";
        cell.textContent = state.isLoading ? "Loading messages..." : "No messages found for current filters.";
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const message of state.pagedMessages) {
        fragment.appendChild(buildMessageRow(message));
    }

    tbody.appendChild(fragment);
}

function renderStats() {
    const totalCount = document.getElementById("totalCount");
    const unreadCount = document.getElementById("unreadCount");
    const lastSync = document.getElementById("lastSync");

    if (totalCount) {
        totalCount.textContent = String(state.messages.length);
    }

    if (unreadCount) {
        const unread = state.messages.filter((item) => !item.isRead).length;
        unreadCount.textContent = String(unread);
    }

    if (lastSync) {
        lastSync.textContent = state.messages.length ? new Date().toLocaleTimeString() : "Never";
    }
}

function renderPagination() {
    const prevBtn = document.getElementById("prevPageBtn");
    const nextBtn = document.getElementById("nextPageBtn");
    const pageMeta = document.getElementById("pageMeta");

    if (prevBtn) {
        prevBtn.disabled = state.currentPage <= 1;
    }

    if (nextBtn) {
        nextBtn.disabled = state.currentPage >= state.totalPages;
    }

    if (pageMeta) {
        const total = state.filteredMessages.length;
        const start = total === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
        const end = Math.min(state.currentPage * state.pageSize, total);
        pageMeta.textContent = `Page ${state.currentPage} of ${state.totalPages} (showing ${start}-${end} of ${total})`;
    }
}

function getServiceValue(message) {
    return (message.service || "general").toString().toLowerCase();
}

function applyFiltersAndSort(resetPage = false) {
    const normalizedQuery = state.query.trim().toLowerCase();

    const filtered = state.messages.filter((message) => {
        const servicePass = state.service === "all" || getServiceValue(message) === state.service;
        if (!servicePass) {
            return false;
        }

        const readPass = state.read === "all"
            || (state.read === "read" && message.isRead)
            || (state.read === "unread" && !message.isRead);

        if (!readPass) {
            return false;
        }

        if (!normalizedQuery) {
            return true;
        }

        const searchable = [
            message.name,
            message.email,
            message.service,
            message.message,
            String(message.id || "")
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return searchable.includes(normalizedQuery);
    });

    filtered.sort((a, b) => {
        if (state.sortBy === "oldest") {
            return toComparableDate(a.timestamp) - toComparableDate(b.timestamp);
        }

        if (state.sortBy === "name") {
            return String(a.name || "").localeCompare(String(b.name || ""));
        }

        return toComparableDate(b.timestamp) - toComparableDate(a.timestamp);
    });

    state.filteredMessages = filtered;

    if (resetPage) {
        state.currentPage = 1;
    }

    state.totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));

    if (state.currentPage > state.totalPages) {
        state.currentPage = state.totalPages;
    }

    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    state.pagedMessages = filtered.slice(start, end);

    renderTable();
    renderStats();
    renderPagination();
}

function populateServiceFilter(messages) {
    const serviceFilter = document.getElementById("serviceFilter");
    if (!serviceFilter) {
        return;
    }

    const current = serviceFilter.value || "all";
    serviceFilter.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "all";
    defaultOption.textContent = "All Services";
    serviceFilter.appendChild(defaultOption);

    const uniqueServices = [...new Set(messages.map(getServiceValue))].filter(Boolean).sort();

    for (const service of uniqueServices) {
        const option = document.createElement("option");
        option.value = service;
        option.textContent = service.charAt(0).toUpperCase() + service.slice(1);
        serviceFilter.appendChild(option);
    }

    serviceFilter.value = uniqueServices.includes(current) || current === "all" ? current : "all";
    state.service = serviceFilter.value;
}

function escapeCsv(value) {
    const normalized = value == null ? "" : String(value);
    if (normalized.includes('"') || normalized.includes(",") || normalized.includes("\n")) {
        return `"${normalized.replace(/"/g, '""')}"`;
    }
    return normalized;
}

function exportVisibleToCsv() {
    if (!state.filteredMessages.length) {
        showStatus("There are no visible messages to export.", "error");
        return;
    }

    const rows = [
        ["ID", "Name", "Email", "Service", "Message", "Status", "Date"],
        ...state.filteredMessages.map((item) => [
            item.id,
            item.name,
            item.email,
            item.service,
            item.message,
            item.isRead ? "Read" : "Unread",
            formatDate(item.timestamp)
        ])
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `sanad-messages-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    showStatus("CSV export completed.", "info");
}

function debounce(fn, wait) {
    let timeoutId = null;

    return (...args) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => fn(...args), wait);
    };
}

function setLoadingState(loading) {
    state.isLoading = loading;

    const refreshButton = document.getElementById("refreshBtn");
    setButtonBusy(refreshButton, loading, "Refreshing...");

    if (loading) {
        showStatus("Loading messages...", "info");
    }
}

function getMessageById(id) {
    return state.messages.find((item) => item.id === id);
}

function normalizeMessageFromApi(item) {
    return {
        ...item,
        isRead: Boolean(item.isRead)
    };
}

async function loadMessages() {
    if (!checkAuth()) {
        return;
    }

    setLoadingState(true);

    try {
        const aggregated = [];
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            const data = await apiRequest(`/messages?page=${page}&limit=200`, {}, true);
            const pageItems = Array.isArray(data.messages) ? data.messages.map(normalizeMessageFromApi) : [];
            aggregated.push(...pageItems);
            totalPages = data.pagination?.totalPages || 1;
            page += 1;
        }

        state.messages = aggregated;
        populateServiceFilter(aggregated);
        applyFiltersAndSort(true);

        showStatus(`Loaded ${aggregated.length} message(s).`, "info");
    } catch (error) {
        console.error(error);

        if (error.status === 401 || error.status === 403) {
            clearSession();
            showStatus("Session expired. Please login again.", "error");
            setTimeout(redirectToLogin, 900);
            return;
        }

        if (error.name === "AbortError") {
            showStatus("Request timed out while loading messages.", "error");
            return;
        }

        showStatus(error.message || "Failed to load messages.", "error");
        state.messages = [];
        applyFiltersAndSort(true);
    } finally {
        setLoadingState(false);
    }
}

function setModalOpen(open) {
    const modal = document.getElementById("messageModal");
    if (!modal) {
        return;
    }

    if (open) {
        modal.classList.add("open");
    } else {
        modal.classList.remove("open");
    }
}

function openMessageModal(message) {
    const modalName = document.getElementById("modalName");
    const modalEmail = document.getElementById("modalEmail");
    const modalService = document.getElementById("modalService");
    const modalDate = document.getElementById("modalDate");
    const modalMessage = document.getElementById("modalMessage");

    if (modalName) {
        modalName.textContent = message.name || "-";
    }

    if (modalEmail) {
        modalEmail.textContent = message.email || "-";
    }

    if (modalService) {
        modalService.textContent = message.service || "-";
    }

    if (modalDate) {
        modalDate.textContent = formatDate(message.timestamp);
    }

    if (modalMessage) {
        modalMessage.textContent = message.message || "-";
    }

    setModalOpen(true);
}

async function toggleMessageRead(id) {
    const item = getMessageById(id);
    if (!item) {
        showStatus("Message not found.", "error");
        return;
    }

    const nextState = !item.isRead;

    try {
        await apiRequest(`/messages/${id}/read`, {
            method: "PATCH",
            body: JSON.stringify({ isRead: nextState })
        }, true);

        item.isRead = nextState;
        applyFiltersAndSort(false);
        showStatus(`Message ${nextState ? "marked as read" : "marked as unread"}.`, "info");
    } catch (error) {
        console.error(error);
        showStatus(error.message || "Failed to update message status.", "error");
    }
}

async function deleteMessage(id) {
    const item = getMessageById(id);
    if (!item) {
        showStatus("Message not found.", "error");
        return;
    }

    const approved = window.confirm(`Delete message #${id} from ${item.name || "Unknown"}?`);
    if (!approved) {
        return;
    }

    try {
        await apiRequest(`/messages/${id}`, { method: "DELETE" }, true);
        state.messages = state.messages.filter((msg) => msg.id !== id);
        applyFiltersAndSort(false);
        showStatus(`Message #${id} deleted.`, "info");
    } catch (error) {
        console.error(error);
        showStatus(error.message || "Failed to delete message.", "error");
    }
}

function handleTableActionClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
        return;
    }

    const id = parseInt(button.dataset.id, 10);
    if (!Number.isInteger(id)) {
        return;
    }

    const action = button.dataset.action;
    const item = getMessageById(id);

    if (action === "view") {
        if (item) {
            openMessageModal(item);
        }
        return;
    }

    if (action === "toggle-read") {
        toggleMessageRead(id);
        return;
    }

    if (action === "delete") {
        deleteMessage(id);
    }
}

function resetFilters() {
    const searchInput = document.getElementById("searchInput");
    const serviceFilter = document.getElementById("serviceFilter");
    const readFilter = document.getElementById("readFilter");
    const sortBy = document.getElementById("sortBy");

    state.query = "";
    state.service = "all";
    state.read = "all";
    state.sortBy = "newest";

    if (searchInput) {
        searchInput.value = "";
    }

    if (serviceFilter) {
        serviceFilter.value = "all";
    }

    if (readFilter) {
        readFilter.value = "all";
    }

    if (sortBy) {
        sortBy.value = "newest";
    }

    applyFiltersAndSort(true);
}

function initLoginPage() {
    const loginForm = document.getElementById("loginForm");
    if (!loginForm) {
        return;
    }

    loginForm.addEventListener("submit", handleLoginSubmit);

    if (getToken()) {
        window.location.href = "dashboard.html";
    }
}

function initDashboardPage() {
    const messagesTable = document.getElementById("messagesTable");
    if (!messagesTable) {
        return;
    }

    if (!checkAuth()) {
        return;
    }

    const logoutBtn = document.getElementById("logoutBtn");
    const searchInput = document.getElementById("searchInput");
    const serviceFilter = document.getElementById("serviceFilter");
    const readFilter = document.getElementById("readFilter");
    const sortBy = document.getElementById("sortBy");
    const refreshBtn = document.getElementById("refreshBtn");
    const clearFiltersBtn = document.getElementById("clearFiltersBtn");
    const exportCsvBtn = document.getElementById("exportCsvBtn");
    const prevPageBtn = document.getElementById("prevPageBtn");
    const nextPageBtn = document.getElementById("nextPageBtn");
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const modal = document.getElementById("messageModal");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await apiRequest("/logout", { method: "POST" }, true);
            } catch (error) {
                console.warn("Logout endpoint call failed:", error);
            }
            clearSession();
            redirectToLogin();
        });
    }

    if (searchInput) {
        const debouncedSearch = debounce((value) => {
            state.query = value;
            applyFiltersAndSort(true);
        }, 180);

        searchInput.addEventListener("input", (event) => {
            debouncedSearch(event.target.value || "");
        });
    }

    if (serviceFilter) {
        serviceFilter.addEventListener("change", (event) => {
            state.service = event.target.value;
            applyFiltersAndSort(true);
        });
    }

    if (readFilter) {
        readFilter.addEventListener("change", (event) => {
            state.read = event.target.value;
            applyFiltersAndSort(true);
        });
    }

    if (sortBy) {
        sortBy.addEventListener("change", (event) => {
            state.sortBy = event.target.value;
            applyFiltersAndSort(true);
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener("click", loadMessages);
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener("click", resetFilters);
    }

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener("click", exportVisibleToCsv);
    }

    if (prevPageBtn) {
        prevPageBtn.addEventListener("click", () => {
            if (state.currentPage > 1) {
                state.currentPage -= 1;
                applyFiltersAndSort(false);
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener("click", () => {
            if (state.currentPage < state.totalPages) {
                state.currentPage += 1;
                applyFiltersAndSort(false);
            }
        });
    }

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (event) => {
            const size = parseInt(event.target.value, 10);
            state.pageSize = Number.isInteger(size) && size > 0 ? size : 10;
            applyFiltersAndSort(true);
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", () => setModalOpen(false));
    }

    if (modal) {
        modal.addEventListener("click", (event) => {
            if (event.target === modal) {
                setModalOpen(false);
            }
        });
    }

    messagesTable.addEventListener("click", handleTableActionClick);
    loadMessages();
}

document.addEventListener("DOMContentLoaded", () => {
    initLoginPage();
    initDashboardPage();
});
