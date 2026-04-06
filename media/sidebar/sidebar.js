(() => {
    const vscode = acquireVsCodeApi();

    // ── Helpers ──
    const $ = (id) => document.getElementById(id);
    const $$ = (sel) => document.querySelectorAll(sel);

    const isMac = navigator.platform.includes("Mac");
    const modKey = isMac ? "\u2318" : "Ctrl";

    function escapeHtml(t) {
        const d = document.createElement("div");
        d.textContent = String(t ?? "");
        return d.innerHTML;
    }

    function escapeAttr(t) {
        return String(t ?? "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;");
    }

    function getInitials(name) {
        if (!name) return "?";
        return name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    }

    function planLabel(plan) {
        const labels = { free: "Free", pro: "Pro", ultra: "Ultra", business: "Business", business_plus: "Business+" };
        return labels[plan] || plan;
    }

    function fillModifier(pct) {
        if (pct >= 90) return " danger";
        if (pct >= 70) return " warn";
        return "";
    }

    // ── Default shortcut labels ──
    const defaultShortcuts = {
        shortcutCopy: `${modKey}+Shift+C`,
        shortcutPanelCopy: `${modKey}+Enter`,
        shortcutSelectAll: `${modKey}+A / ${modKey}+Shift+A`,
        shortcutUndo: `${modKey}+Z`,
    };

    // ── Restore saved shortcuts from state ──
    const savedState = vscode.getState() || {};
    const customShortcuts = savedState.customShortcuts || {};

    function getShortcutDisplay(id) {
        return customShortcuts[id] || defaultShortcuts[id] || "";
    }

    function updateShortcutLabels() {
        Object.keys(defaultShortcuts).forEach((id) => {
            var el = $(id);
            if (el && !el.classList.contains("recording")) {
                el.textContent = getShortcutDisplay(id);
            }
        });
        var footer = $("footerShortcut");
        if (footer) footer.textContent = getShortcutDisplay("shortcutCopy");
    }
    updateShortcutLabels();

    // ── Shortcut recording ──
    var recordingTarget = null;
    var recordingOriginal = "";

    // Ignored bare keys (without modifiers)
    var ignoredBareKeys = [
        "Escape",
        "Enter",
        "Tab",
        "CapsLock",
        "NumLock",
        "ScrollLock",
        "ContextMenu",
        "PrintScreen",
        "Pause",
    ];

    function keyDisplayName(key) {
        var map = {
            " ": "Space",
            ArrowUp: "Up",
            ArrowDown: "Down",
            ArrowLeft: "Left",
            ArrowRight: "Right",
            Backspace: "Backspace",
            Delete: "Del",
        };
        if (map[key]) return map[key];
        if (key.startsWith("F") && key.length <= 3) return key; // F1-F12
        if (key.length === 1) return key.toUpperCase();
        return key;
    }

    function buildShortcutString(e) {
        var parts = [];
        if (e.ctrlKey || e.metaKey) parts.push(modKey);
        if (e.shiftKey) parts.push("Shift");
        if (e.altKey) parts.push("Alt");
        parts.push(keyDisplayName(e.key));
        return parts.join("+");
    }

    function buildVSCodeShortcut(e) {
        var parts = [];
        if (e.ctrlKey && !isMac) parts.push("ctrl");
        if (e.metaKey && isMac) parts.push("cmd");
        if (e.shiftKey) parts.push("shift");
        if (e.altKey) parts.push("alt");
        var keyName =
            e.key.length === 1 ? e.key.toLowerCase() : e.code.replace("Key", "").replace("Digit", "").toLowerCase();
        parts.push(keyName);
        return parts.join("+");
    }

    function startRecording(kbdEl) {
        // Cancel any existing recording
        if (recordingTarget) cancelRecording();

        recordingTarget = kbdEl;
        recordingOriginal = kbdEl.textContent;
        kbdEl.textContent = "Press shortcut\u2026";
        kbdEl.classList.add("recording");
    }

    function cancelRecording() {
        if (!recordingTarget) return;
        recordingTarget.textContent = recordingOriginal;
        recordingTarget.classList.remove("recording");
        recordingTarget = null;
        recordingOriginal = "";
    }

    function finishRecording(displayStr, vscodeStr) {
        if (!recordingTarget) return;
        var id = recordingTarget.id;
        recordingTarget.textContent = displayStr;
        recordingTarget.classList.remove("recording");
        recordingTarget.classList.add("recorded");
        setTimeout(() => {
            recordingTarget?.classList.remove("recorded");
        }, 600);

        // Save
        customShortcuts[id] = displayStr;
        var state = vscode.getState() || {};
        state.customShortcuts = customShortcuts;
        vscode.setState(state);

        // Notify extension host
        vscode.postMessage({
            type: "setShortcut",
            payload: { id: id, display: displayStr, vscode: vscodeStr },
        });

        // Update footer if main shortcut changed
        if (id === "shortcutCopy") {
            var footer = $("footerShortcut");
            if (footer) footer.textContent = displayStr;
        }

        recordingTarget = null;
        recordingOriginal = "";
    }

    // Make shortcut keys clickable
    $$(".s-shortcut-key[id]").forEach((kbd) => {
        kbd.classList.add("clickable");
        kbd.title = "Click to change shortcut";
        kbd.addEventListener("click", (e) => {
            e.stopPropagation();
            startRecording(kbd);
        });
    });

    // Global key listener for recording
    window.addEventListener(
        "keydown",
        (e) => {
            if (!recordingTarget) return;

            // Escape cancels recording
            if (e.key === "Escape") {
                e.preventDefault();
                cancelRecording();
                return;
            }

            // Ignore lone modifier keys (waiting for the actual key)
            if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

            // Ignore bare special keys (no modifier pressed)
            var hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
            if (!hasModifier && ignoredBareKeys.includes(e.key)) return;

            // Ignore bare letter/number keys (require at least one modifier)
            if (!hasModifier && e.key.length === 1) return;

            e.preventDefault();
            e.stopPropagation();

            var displayStr = buildShortcutString(e);
            var vscodeStr = buildVSCodeShortcut(e);
            finishRecording(displayStr, vscodeStr);
        },
        true,
    );

    // Click anywhere else cancels recording + closes dropdowns
    document.addEventListener("click", () => {
        if (recordingTarget) cancelRecording();
        closeTeamDropdown();
        closeProjectDropdown();
    });

    // ── Tab system ──
    var _currentTab = "account";

    $$(".s-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            switchTab(tab.dataset.tab);
        });
    });

    function switchTab(name) {
        _currentTab = name;
        $$(".s-tab").forEach((t) => {
            t.classList.toggle("active", t.dataset.tab === name);
        });
        $$(".s-tab-content").forEach((c) => {
            c.classList.toggle("hidden", c.dataset.content !== name);
        });
    }

    // ── Auth actions ──
    $("loginBtn").addEventListener("click", () => {
        $("loginPrompt").classList.remove("visible");
        vscode.postMessage({ type: "login" });
    });

    $("logoutBtn").addEventListener("click", () => {
        vscode.postMessage({ type: "logout" });
    });

    var upgradeBtn = $("upgradeBtn");
    if (upgradeBtn) {
        upgradeBtn.addEventListener("click", () => {
            vscode.postMessage({ type: "upgrade" });
        });
    }

    // ── Settings actions ──
    var docsBtn = $("docsBtn");
    if (docsBtn) {
        docsBtn.addEventListener("click", () => {
            vscode.postMessage({ type: "openDocs" });
        });
    }

    var issueBtn = $("issueBtn");
    if (issueBtn) {
        issueBtn.addEventListener("click", () => {
            vscode.postMessage({ type: "reportIssue" });
        });
    }

    var resetBtn = $("resetShortcutsBtn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            // Clear custom shortcuts
            Object.keys(customShortcuts).forEach((k) => {
                delete customShortcuts[k];
            });
            var state = vscode.getState() || {};
            state.customShortcuts = {};
            vscode.setState(state);
            updateShortcutLabels();
            vscode.postMessage({ type: "resetShortcuts" });
        });
    }

    // ── Workspace pickers ──
    var _teamDropOpen = false;
    var _projDropOpen = false;
    var _teams = [];
    var _projects = [];
    var _selectedTeam = null;
    var _selectedProject = null;

    function toggleTeamDropdown() {
        _teamDropOpen = !_teamDropOpen;
        var dd = $("teamDropdown");
        var btn = $("teamPicker");
        dd.classList.toggle("open", _teamDropOpen);
        dd.classList.toggle("hidden", !_teamDropOpen);
        btn.classList.toggle("active", _teamDropOpen);
        if (_teamDropOpen) closeProjectDropdown();
    }

    function closeTeamDropdown() {
        _teamDropOpen = false;
        var dd = $("teamDropdown");
        var btn = $("teamPicker");
        dd.classList.remove("open");
        dd.classList.add("hidden");
        btn.classList.remove("active");
    }

    function toggleProjectDropdown() {
        if ($("projectPicker").disabled) return;
        _projDropOpen = !_projDropOpen;
        var dd = $("projectDropdown");
        var btn = $("projectPicker");
        dd.classList.toggle("open", _projDropOpen);
        dd.classList.toggle("hidden", !_projDropOpen);
        btn.classList.toggle("active", _projDropOpen);
        if (_projDropOpen) closeTeamDropdown();
    }

    function closeProjectDropdown() {
        _projDropOpen = false;
        var dd = $("projectDropdown");
        var btn = $("projectPicker");
        dd.classList.remove("open");
        dd.classList.add("hidden");
        btn.classList.remove("active");
    }

    function renderTeamList() {
        var list = $("teamList");
        list.innerHTML = "";
        _teams.forEach((t) => {
            var item = document.createElement("div");
            item.className = `ws-item${t.slug === _selectedTeam ? " selected" : ""}`;
            item.innerHTML =
                '<span class="ws-item-check">' +
                (t.slug === _selectedTeam ? "&#x2713;" : "") +
                "</span>" +
                '<span class="ws-item-name">' +
                escapeHtml(t.name) +
                "</span>" +
                '<span class="ws-item-badge ' +
                escapeAttr(t.plan) +
                '">' +
                planLabel(t.plan) +
                "</span>" +
                '<span class="ws-item-meta">' +
                t.memberCount +
                "&#x1F464;</span>";
            item.addEventListener("click", () => {
                selectTeam(t);
            });
            list.appendChild(item);
        });
    }

    function renderProjectList() {
        var list = $("projectList");
        list.innerHTML = "";
        _projects.forEach((p) => {
            var item = document.createElement("div");
            item.className = `ws-item${p.slug === _selectedProject ? " selected" : ""}`;
            item.innerHTML =
                '<span class="ws-item-check">' +
                (p.slug === _selectedProject ? "&#x2713;" : "") +
                "</span>" +
                '<span class="ws-item-name">' +
                escapeHtml(p.name) +
                "</span>";
            item.addEventListener("click", () => {
                selectProject(p);
            });
            list.appendChild(item);
        });
    }

    function selectTeam(team) {
        _selectedTeam = team.slug;
        _selectedProject = null;
        $("teamPickerText").textContent = team.name;
        var badge = $("teamPickerBadge");
        badge.textContent = planLabel(team.plan);
        badge.className = `ws-picker-badge ${team.plan}`;
        badge.classList.remove("hidden");
        $("projectPickerText").textContent = "Select project...";
        $("projectPicker").disabled = false;
        $("projectPicker").classList.remove("disabled");
        closeTeamDropdown();
        renderTeamList();
        vscode.postMessage({ type: "selectTeam", payload: { slug: team.slug } });
    }

    function selectProject(project) {
        _selectedProject = project.slug;
        $("projectPickerText").textContent = project.name;
        closeProjectDropdown();
        renderProjectList();
        vscode.postMessage({ type: "selectProject", payload: { slug: project.slug } });
    }

    $("teamPicker").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleTeamDropdown();
    });
    $("projectPicker").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleProjectDropdown();
    });

    // Prevent dropdown clicks from closing
    $("teamDropdown").addEventListener("click", (e) => {
        e.stopPropagation();
    });
    $("projectDropdown").addEventListener("click", (e) => {
        e.stopPropagation();
    });

    // ── Message handler ──
    window.addEventListener("message", (event) => {
        var msg = event.data;
        switch (msg.type) {
            case "authState":
                handleAuthState(msg.payload);
                break;
            case "updateQuota":
                if (msg.payload) renderQuota(msg.payload);
                break;
            case "updateHistory":
                renderHistory(msg.payload.entries);
                break;
            case "showLoginPrompt":
                showLoginPrompt();
                break;
            case "updateProjects": {
                _projects = msg.payload.projects || [];
                renderProjectList();
                if (_selectedProject) {
                    var proj = _projects.find((p) => p.slug === _selectedProject);
                    if (proj) {
                        $("projectPickerText").textContent = proj.name;
                    }
                }
                break;
            }
        }
    });

    function handleAuthState(payload) {
        var authenticated = payload.authenticated;
        var quota = payload.quota;
        var user = payload.user;
        if (authenticated) {
            $("viewLoggedOut").classList.add("hidden");
            $("viewLoggedIn").classList.remove("hidden");
            $("loginPrompt").classList.remove("visible");
            if (user) renderUser(user);
            if (quota) renderQuota(quota);
            if (payload.teams) {
                _teams = payload.teams;
                _selectedTeam = payload.selectedTeam || null;
                _selectedProject = payload.selectedProject || null;
                renderTeamList();
                if (_selectedTeam) {
                    var team = _teams.find((t) => t.slug === _selectedTeam);
                    if (team) {
                        $("teamPickerText").textContent = team.name;
                        var badge = $("teamPickerBadge");
                        badge.textContent = planLabel(team.plan);
                        badge.className = `ws-picker-badge ${team.plan}`;
                        badge.classList.remove("hidden");
                        $("projectPicker").disabled = false;
                        $("projectPicker").classList.remove("disabled");
                    }
                }
            }
        } else {
            $("viewLoggedOut").classList.remove("hidden");
            $("viewLoggedIn").classList.add("hidden");
            renderHistory([]);
        }
    }

    function renderUser(user) {
        var avatarEl = $("avatarEl");
        var initials = getInitials(user.name);

        if (user.avatarUrl) {
            var img = document.createElement("img");
            img.alt = escapeAttr(user.name || "");
            img.src = user.avatarUrl;
            img.onerror = () => {
                avatarEl.textContent = initials;
            };
            avatarEl.innerHTML = "";
            avatarEl.appendChild(img);
        } else {
            avatarEl.textContent = initials;
        }

        $("userName").textContent = user.name || user.email || "User" | "TEST";
    }

    function renderQuota(q) {
        var plan = q.plan || "free";

        // Daily bar
        var dUsed = q.daily.used;
        var dLim = q.daily.limit;
        var dPct = dLim ? Math.min((dUsed / dLim) * 100, 100) : 0;
        $("dailyText").textContent = `${dUsed} / ${dLim !== null ? dLim : "\u221E"}`;
        var dBar = $("dailyBar");
        dBar.style.width = `${dPct}%`;
        dBar.className = `s-credit-fill daily${fillModifier(dPct)}`;

        // Weekly bar
        var wUsed = q.weekly.used;
        var wLim = q.weekly.limit;
        var wPct = wLim ? Math.min((wUsed / wLim) * 100, 100) : 0;
        $("weeklyText").textContent = `${wUsed} / ${wLim !== null ? wLim : "\u221E"}`;
        var wBar = $("weeklyBar");
        wBar.style.width = `${wPct}%`;
        wBar.className = `s-credit-fill weekly${fillModifier(wPct)}`;

        // Monthly bar
        if (q.monthly) {
            var mUsed = q.monthly.used;
            var mLim = q.monthly.limit;
            var mPct = mLim ? Math.min((mUsed / mLim) * 100, 100) : 0;
            $("monthlyText").textContent = `${mUsed} / ${mLim !== null ? mLim : "\u221E"}`;
            var mBar = $("monthlyBar");
            mBar.style.width = `${mPct}%`;
            mBar.className = `s-credit-fill monthly${fillModifier(mPct)}`;
        }

        // Upgrade card — show only for free plan
        var upgradeCard = $("upgradeCard");
        if (upgradeCard) {
            upgradeCard.style.display = plan === "free" ? "block" : "none";
        }
    }

    function renderHistory(entries) {
        var list = $("historyList");

        if (!entries || entries.length === 0) {
            list.innerHTML =
                "<li>" +
                '<div class="s-empty">' +
                '<span class="s-empty-icon">\uD83D\uDCCB</span>' +
                '<div class="s-empty-title">No copies yet</div>' +
                '<div class="s-empty-text">Select code and press <strong>' +
                modKey +
                "+Shift+C</strong></div>" +
                "</div>" +
                "</li>";
            return;
        }

        list.innerHTML = "";
        entries.forEach((entry) => {
            var li = document.createElement("li");
            li.className = "s-history-item";

            var date = new Date(entry.timestamp);
            var timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            li.innerHTML =
                '<div class="s-history-item-header">' +
                '<span class="s-history-fn-icon">\u0192</span>' +
                '<span class="s-history-fn-name">' +
                escapeHtml(entry.functionName) +
                "</span>" +
                '<span class="s-history-badge">~' +
                escapeHtml(entry.estimatedCredits) +
                " cr</span>" +
                "</div>" +
                '<div class="s-history-meta">' +
                '<span class="s-history-path">' +
                escapeHtml(entry.filePath) +
                "</span>" +
                '<span class="s-history-time">' +
                timeStr +
                "</span>" +
                "</div>";

            li.addEventListener("click", () => {
                vscode.postMessage({ type: "openHistory", payload: { id: entry.id } });
            });

            list.appendChild(li);
        });
    }

    function showLoginPrompt() {
        var p = $("loginPrompt");
        p.classList.add("visible");
        setTimeout(() => {
            p.classList.remove("visible");
        }, 6000);
    }

    // ── Ready ──
    vscode.postMessage({ type: "ready" });
})();
