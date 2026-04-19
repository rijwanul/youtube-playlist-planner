const STORAGE_KEY = "yt_playlist_tracker_state_v4";
const ALLOWED_SPEEDS = [1, 1.25, 1.5, 1.75, 2];

const DEFAULT_STATE = {
    apiKey: "",
    playlistInput: "",
    videos: [],
    sortOrder: "normal",
    currentTab: "yet-to-watch",
    motivation: "Start strong. One completed video at a time.",
    activeVideoId: null,
    isPlayerOpen: false,
    playbackSpeed: 1,
    bufferMinutes: 0,
    startTime: ""
};

let state = { ...DEFAULT_STATE };
let etaTimerId = null;
let currentPlayerVideoId = null;
let dragVideoId = null;
let mergeResolver = null;

const refs = {
    playlistIdInput: document.getElementById("playlistId"),
    apiKeyInput: document.getElementById("apiKey"),
    fetchBtn: document.getElementById("fetchBtn"),
    apiHelpBtn: document.getElementById("apiHelpBtn"),
    clearBtn: document.getElementById("clearBtn"),
    clearStartTimeBtn: document.getElementById("clearStartTimeBtn"),
    statusText: document.getElementById("statusText"),
    dashboard: document.getElementById("dashboard"),
    totalTime: document.getElementById("total-time"),
    remainingTime: document.getElementById("remaining-time"),
    watchedTime: document.getElementById("watched-time"),
    finishByTime: document.getElementById("finish-by-time"),
    motivation: document.getElementById("motivation-msg"),
    sortOrder: document.getElementById("sortOrder"),
    speedOption: document.getElementById("speedOption"),
    bufferMinutes: document.getElementById("bufferMinutes"),
    startTime: document.getElementById("startTime"),
    yetTabBtn: document.getElementById("yetTabBtn"),
    watchedTabBtn: document.getElementById("watchedTabBtn"),
    yetCount: document.getElementById("yetCount"),
    watchedCount: document.getElementById("watchedCount"),
    videoList: document.getElementById("video-list"),
    emptyStateTemplate: document.getElementById("emptyStateTemplate"),
    playerModal: document.getElementById("playerModal"),
    playerBackdrop: document.getElementById("playerBackdrop"),
    closePlayerBtn: document.getElementById("closePlayerBtn"),
    prevVideoBtn: document.getElementById("prevVideoBtn"),
    nextVideoBtn: document.getElementById("nextVideoBtn"),
    markDoneBtn: document.getElementById("markDoneBtn"),
    fullscreenBtn: document.getElementById("fullscreenBtn"),
    playerFrame: document.getElementById("playerFrame"),
    playerTitle: document.getElementById("playerTitle"),
    playerRemainingTiny: document.getElementById("playerRemainingTiny"),
    playerFinishTiny: document.getElementById("playerFinishTiny"),
    helpModal: document.getElementById("helpModal"),
    helpBackdrop: document.getElementById("helpBackdrop"),
    closeHelpBtn: document.getElementById("closeHelpBtn"),
    completeModal: document.getElementById("completeModal"),
    completeBackdrop: document.getElementById("completeBackdrop"),
    closeCompleteBtn: document.getElementById("closeCompleteBtn"),
    completeText: document.getElementById("completeText"),
    mergeModal: document.getElementById("mergeModal"),
    mergeBackdrop: document.getElementById("mergeBackdrop"),
    closeMergeBtn: document.getElementById("closeMergeBtn"),
    mergeReplaceBtn: document.getElementById("mergeReplaceBtn"),
    mergeBottomBtn: document.getElementById("mergeBottomBtn"),
    mergeTopBtn: document.getElementById("mergeTopBtn")
};

init();

async function init() {
    loadState();
    bindEvents();
    hydrateInputs();
    render();
    startRealtimeEtaTicker();
    await prefillAndPrefetchFromQuery();
}

function bindEvents() {
    refs.fetchBtn.addEventListener("click", () => fetchVideosFlow());
    refs.clearBtn.addEventListener("click", clearAll);
    refs.apiHelpBtn.addEventListener("click", openHelpModal);
    refs.clearStartTimeBtn.addEventListener("click", clearStartTime);

    refs.sortOrder.addEventListener("change", (event) => {
        state.sortOrder = event.target.value;
        persistState();
        render();
    });

    refs.speedOption.addEventListener("change", (event) => {
        const speed = Number(event.target.value || 1);
        state.playbackSpeed = ALLOWED_SPEEDS.includes(speed) ? speed : 1;
        persistState();
        renderEtaOnly();
    });

    refs.bufferMinutes.addEventListener("input", (event) => {
        const minutes = Number(event.target.value || 0);
        state.bufferMinutes = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
        persistState();
        renderEtaOnly();
    });

    refs.startTime.addEventListener("change", (event) => {
        state.startTime = event.target.value || "";
        persistState();
        renderEtaOnly();
    });

    refs.yetTabBtn.addEventListener("click", () => setTab("yet-to-watch"));
    refs.watchedTabBtn.addEventListener("click", () => setTab("watched"));

    refs.playerBackdrop.addEventListener("click", closePlayer);
    refs.closePlayerBtn.addEventListener("click", closePlayer);
    refs.prevVideoBtn.addEventListener("click", () => playAdjacentVideo(-1));
    refs.nextVideoBtn.addEventListener("click", () => playAdjacentVideo(1));
    refs.markDoneBtn.addEventListener("click", markActiveAsCompleted);
    refs.fullscreenBtn.addEventListener("click", makePlayerFullscreen);

    refs.helpBackdrop.addEventListener("click", closeHelpModal);
    refs.closeHelpBtn.addEventListener("click", closeHelpModal);

    refs.completeBackdrop.addEventListener("click", closeCompletionModal);
    refs.closeCompleteBtn.addEventListener("click", closeCompletionModal);

    refs.mergeBackdrop.addEventListener("click", () => closeMergeModal(null));
    refs.closeMergeBtn.addEventListener("click", () => closeMergeModal(null));

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            if (!refs.completeModal.classList.contains("hidden")) {
                closeCompletionModal();
            } else if (!refs.helpModal.classList.contains("hidden")) {
                closeHelpModal();
            } else if (!refs.mergeModal.classList.contains("hidden")) {
                closeMergeModal(null);
            } else if (state.isPlayerOpen) {
                closePlayer();
            }
        }
    });
}

function hydrateInputs() {
    refs.playlistIdInput.value = state.playlistInput;
    refs.apiKeyInput.value = state.apiKey;
    refs.sortOrder.value = state.sortOrder;
    refs.speedOption.value = String(state.playbackSpeed);
    refs.bufferMinutes.value = String(state.bufferMinutes);
    refs.startTime.value = state.startTime;
}

function clearStartTime() {
    state.startTime = "";
    refs.startTime.value = "";
    persistState();
    renderEtaOnly();
}

function setTab(tab) {
    state.currentTab = tab;
    persistState();
    render();
}

function clearAll() {
    state = { ...DEFAULT_STATE };
    persistState();
    hydrateInputs();
    closePlayer();
    setStatus("Cleared saved data.");
    render();
}

async function prefillAndPrefetchFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const linksParam = params.get("links") || params.get("link") || "";
    const apiKeyParam = params.get("apiKey") || params.get("key") || "";

    if (!linksParam) {
        return;
    }

    const decoded = decodeURIComponent(linksParam);
    refs.playlistIdInput.value = decoded;
    state.playlistInput = decoded;

    if (apiKeyParam) {
        refs.apiKeyInput.value = apiKeyParam;
        state.apiKey = apiKeyParam;
    }

    persistState();

    if (!refs.apiKeyInput.value.trim()) {
        setStatus("Query links loaded. Please add API key to auto-fetch.");
        return;
    }

    setStatus("Query links detected. Auto-fetching videos...");
    await fetchVideosFlow({ forceMode: "replace", silentPrompt: true });
}

async function fetchVideosFlow(options = {}) {
    const rawInput = refs.playlistIdInput.value.trim();
    const apiKey = refs.apiKeyInput.value.trim();
    const mixed = extractMixedInputs(rawInput);

    if (mixed.playlistIds.length === 0 && mixed.videoIds.length === 0) {
        setStatus("Please enter playlist/video links or IDs.");
        return;
    }

    if (!apiKey) {
        setStatus("Please provide a YouTube Data API key.");
        return;
    }

    let mergeMode = options.forceMode || "replace";
    if (state.videos.length > 0 && !options.silentPrompt && !options.forceMode) {
        mergeMode = await openMergeModal();
        if (!mergeMode) {
            setStatus("Import canceled.");
            return;
        }
    }

    toggleBusy(true);
    setStatus("Fetching videos...");

    try {
        const incomingVideos = [];

        if (mixed.playlistIds.length > 0) {
            const mergedPlaylistItems = [];
            for (const playlistId of mixed.playlistIds) {
                const items = await fetchAllPlaylistItems(playlistId, apiKey);
                mergedPlaylistItems.push(...items);
            }

            const uniquePlaylistItems = dedupeByVideoId(mergedPlaylistItems);
            const playlistVideoIds = uniquePlaylistItems.map((item) => item.contentDetails.videoId);
            const playlistDetailMap = await fetchVideoDetails(playlistVideoIds, apiKey);

            incomingVideos.push(...uniquePlaylistItems.map((item, index) => createVideoModel(item, playlistDetailMap, index)));
        }

        if (mixed.videoIds.length > 0) {
            const detailMap = await fetchVideoDetails(mixed.videoIds, apiKey);
            const directVideos = mixed.videoIds
                .map((id, index) => {
                    const details = detailMap.get(id);
                    if (!details) {
                        return null;
                    }

                    return {
                        id,
                        title: details.title || "Untitled video",
                        duration: parseISO8601Duration(details.durationISO || "PT0S"),
                        completed: false,
                        order: index + 1,
                        uploadedAt: details.uploadedAt || "",
                        thumbnailUrl: details.thumbnailUrl || ""
                    };
                })
                .filter(Boolean);

            incomingVideos.push(...directVideos);
        }

        const uniqueIncoming = dedupeVideosById(incomingVideos);
        if (uniqueIncoming.length === 0) {
            throw new Error("No valid videos found from input.");
        }

        mergeVideos(uniqueIncoming, mergeMode);

        state.apiKey = apiKey;
        state.playlistInput = rawInput;
        state.currentTab = "yet-to-watch";
        state.isPlayerOpen = false;
        state.motivation = "Video list updated. Keep the momentum.";

        persistState();
        setStatus(`Loaded ${uniqueIncoming.length} video(s).`);
        render();
    } catch (error) {
        setStatus(`Error: ${error.message}`);
    } finally {
        toggleBusy(false);
    }
}

function createVideoModel(item, detailMap, index) {
    const videoId = item.contentDetails.videoId;
    const details = detailMap.get(videoId) || {};
    const playlistThumb = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "";

    return {
        id: videoId,
        title: details.title || item.snippet?.title || "Untitled video",
        duration: parseISO8601Duration(details.durationISO || "PT0S"),
        completed: false,
        order: index + 1,
        uploadedAt: details.uploadedAt || item.snippet?.publishedAt || "",
        thumbnailUrl: details.thumbnailUrl || playlistThumb
    };
}

function mergeVideos(incomingVideos, mode) {
    if (mode === "replace") {
        state.videos = incomingVideos.map((video, index) => ({ ...video, order: index + 1 }));
        state.activeVideoId = null;
        return;
    }

    const incomingUnique = dedupeVideosById(incomingVideos);

    if (mode === "top") {
        const incomingSet = new Set(incomingUnique.map((video) => video.id));
        const existingFiltered = state.videos.filter((video) => !incomingSet.has(video.id));
        state.videos = [...incomingUnique.map((v) => ({ ...v })), ...existingFiltered];
    } else {
        const existingMap = new Map(state.videos.map((video) => [video.id, video]));
        for (const video of incomingUnique) {
            if (!existingMap.has(video.id)) {
                state.videos.push({ ...video });
            }
        }
    }

    state.videos.forEach((video, index) => {
        video.order = index + 1;
    });
}

function openMergeModal() {
    refs.mergeModal.classList.remove("hidden");
    refs.mergeModal.setAttribute("aria-hidden", "false");

    return new Promise((resolve) => {
        mergeResolver = (value) => {
            cleanup();
            resolve(value);
        };

        const resolveOnce = (value) => closeMergeModal(value);

        const onReplace = () => resolveOnce("replace");
        const onBottom = () => resolveOnce("bottom");
        const onTop = () => resolveOnce("top");

        function cleanup() {
            refs.mergeReplaceBtn.removeEventListener("click", onReplace);
            refs.mergeBottomBtn.removeEventListener("click", onBottom);
            refs.mergeTopBtn.removeEventListener("click", onTop);
        }

        refs.mergeReplaceBtn.addEventListener("click", onReplace);
        refs.mergeBottomBtn.addEventListener("click", onBottom);
        refs.mergeTopBtn.addEventListener("click", onTop);
    });
}

function closeMergeModal(value) {
    refs.mergeModal.classList.add("hidden");
    refs.mergeModal.setAttribute("aria-hidden", "true");

    if (mergeResolver) {
        const resolve = mergeResolver;
        mergeResolver = null;
        resolve(value);
    }
}

function dedupeByVideoId(items) {
    const seen = new Set();
    const result = [];

    for (const item of items) {
        const id = item?.contentDetails?.videoId;
        if (!id || seen.has(id)) {
            continue;
        }
        seen.add(id);
        result.push(item);
    }

    return result;
}

function dedupeVideosById(videos) {
    const seen = new Set();
    const result = [];

    for (const video of videos) {
        if (!video || !video.id || seen.has(video.id)) {
            continue;
        }
        seen.add(video.id);
        result.push(video);
    }

    return result;
}

async function fetchAllPlaylistItems(playlistId, apiKey) {
    const items = [];
    let pageToken = "";

    do {
        const query = new URLSearchParams({
            part: "snippet,contentDetails",
            maxResults: "50",
            playlistId,
            key: apiKey
        });

        if (pageToken) {
            query.set("pageToken", pageToken);
        }

        const url = `https://www.googleapis.com/youtube/v3/playlistItems?${query.toString()}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error?.message || "Failed to fetch playlist items.");
        }

        items.push(...(data.items || []));
        pageToken = data.nextPageToken || "";
    } while (pageToken);

    return items.filter((item) => item?.contentDetails?.videoId);
}

async function fetchVideoDetails(videoIds, apiKey) {
    const detailMap = new Map();
    const uniqueIds = [...new Set(videoIds)];
    const chunkSize = 50;

    for (let index = 0; index < uniqueIds.length; index += chunkSize) {
        const chunk = uniqueIds.slice(index, index + chunkSize);
        const query = new URLSearchParams({
            part: "contentDetails,snippet",
            id: chunk.join(","),
            key: apiKey
        });

        const url = `https://www.googleapis.com/youtube/v3/videos?${query.toString()}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error?.message || "Failed to fetch video details.");
        }

        (data.items || []).forEach((video) => {
            detailMap.set(video.id, {
                title: video.snippet?.title || "",
                durationISO: video.contentDetails?.duration || "PT0S",
                uploadedAt: video.snippet?.publishedAt || "",
                thumbnailUrl: video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || ""
            });
        });
    }

    return detailMap;
}

function extractMixedInputs(input) {
    if (!input) {
        return { playlistIds: [], videoIds: [] };
    }

    const rawEntries = input.split(",").map((entry) => entry.trim()).filter(Boolean);
    const playlistIds = [];
    const videoIds = [];

    for (const entry of rawEntries) {
        if (entry.includes("http")) {
            try {
                const url = new URL(entry);
                const list = url.searchParams.get("list");

                if (list) {
                    playlistIds.push(list);
                    continue;
                }

                if (url.hostname.includes("youtu.be")) {
                    const shortId = url.pathname.replace("/", "").trim();
                    if (shortId) {
                        videoIds.push(shortId);
                    }
                    continue;
                }

                const id = url.searchParams.get("v");
                if (id) {
                    videoIds.push(id);
                }
            } catch {
                // Ignore malformed URLs.
            }
        } else {
            const looksLikeVideoId = /^[A-Za-z0-9_-]{11}$/.test(entry);
            if (looksLikeVideoId) {
                videoIds.push(entry);
            } else {
                playlistIds.push(entry);
            }
        }
    }

    return {
        playlistIds: [...new Set(playlistIds)],
        videoIds: [...new Set(videoIds)]
    };
}

function parseISO8601Duration(duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) {
        return 0;
    }

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);

    return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(seconds) {
    if (!seconds || seconds < 0) {
        return "0m";
    }

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
        return `${h}h ${m}m`;
    }

    if (m > 0) {
        return `${m}m ${s}s`;
    }

    return `${s}s`;
}

function formatDurationCompact(seconds) {
    const safe = Number(seconds || 0);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;

    const hh = h > 0 ? `${h}:` : "";
    const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
    const ss = String(s).padStart(2, "0");

    return `${hh}${mm}:${ss}`;
}

function formatUploadDate(iso) {
    if (!iso) {
        return "Unknown";
    }

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return "Unknown";
    }

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function formatClockTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getStartBaseDate() {
    const now = new Date();
    if (!state.startTime) {
        return now;
    }

    const [h, m] = state.startTime.split(":").map((x) => Number(x || 0));
    const base = new Date(now);
    base.setHours(h, m, 0, 0);
    return base;
}

function computeFinishEta(remainingSeconds, speed, bufferMinutes) {
    const safeSpeed = speed > 0 ? speed : 1;
    const adjustedSeconds = Math.ceil(remainingSeconds / safeSpeed) + Math.max(0, bufferMinutes) * 60;
    const finishDate = new Date(getStartBaseDate().getTime() + adjustedSeconds * 1000);

    return {
        adjustedSeconds,
        finishDate,
        finishByText: formatClockTime(finishDate)
    };
}

function getRemainingSeconds() {
    return state.videos.filter((item) => !item.completed).reduce((sum, item) => sum + item.duration, 0);
}

function getMotivationMessage(markedAsComplete) {
    const remaining = state.videos.filter((item) => !item.completed);
    const watched = state.videos.filter((item) => item.completed);
    const watchedMinutes = Math.round(watched.reduce((sum, item) => sum + item.duration, 0) / 60);
    const remainingCount = remaining.length;

    if (!markedAsComplete) {
        return "Progress updated. Keep your next watch session focused.";
    }

    if (remainingCount === 0) {
        return "Excellent run. You completed every video in this playlist.";
    }

    if (remainingCount <= 2) {
        return `Well done! Only ${remainingCount} more video${remainingCount === 1 ? "" : "s"} to watch.`;
    }

    if (watchedMinutes >= 40 && remainingCount >= 5) {
        return `Wow, you already watched ${watchedMinutes} minutes of content. ${remainingCount} videos remain. Focus on the next two and keep moving.`;
    }

    return `Great momentum. ${remainingCount} videos left and ${watchedMinutes} minutes already completed.`;
}

function toggleComplete(videoId) {
    const video = state.videos.find((entry) => entry.id === videoId);
    if (!video) {
        return;
    }

    video.completed = !video.completed;
    state.motivation = getMotivationMessage(video.completed);

    if (video.completed) {
        openCompletionModal(video.title);
    }

    persistState();
    render();
}

function getSortedVideos(sortOrder = state.sortOrder) {
    const sorted = state.videos.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    return sortOrder === "reverse" ? sorted.reverse() : sorted;
}

function getCurrentTabVideos() {
    const sorted = getSortedVideos();
    const showWatched = state.currentTab === "watched";
    return sorted.filter((item) => (showWatched ? item.completed : !item.completed));
}

function reorderManualByIds(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) {
        return;
    }

    const ordered = getSortedVideos("manual");
    const fromIndex = ordered.findIndex((video) => video.id === draggedId);
    const toIndex = ordered.findIndex((video) => video.id === targetId);

    if (fromIndex < 0 || toIndex < 0) {
        return;
    }

    const [moved] = ordered.splice(fromIndex, 1);
    const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex;
    ordered.splice(adjustedTo, 0, moved);

    ordered.forEach((video, index) => {
        video.order = index + 1;
    });

    persistState();
    render();
}

function render() {
    const hasVideos = state.videos.length > 0;
    refs.dashboard.classList.toggle("hidden", !hasVideos);

    refs.yetTabBtn.classList.toggle("active", state.currentTab === "yet-to-watch");
    refs.watchedTabBtn.classList.toggle("active", state.currentTab === "watched");
    refs.sortOrder.value = state.sortOrder;
    refs.speedOption.value = String(state.playbackSpeed);
    refs.bufferMinutes.value = String(state.bufferMinutes);
    refs.startTime.value = state.startTime;
    refs.motivation.textContent = state.motivation;

    if (!hasVideos) {
        refs.videoList.innerHTML = "";
        refs.finishByTime.textContent = "--:--";
        renderPlayer();
        return;
    }

    const watched = state.videos.filter((item) => item.completed);
    const remaining = state.videos.filter((item) => !item.completed);
    refs.totalTime.textContent = formatDuration(state.videos.reduce((sum, item) => sum + item.duration, 0));
    refs.remainingTime.textContent = formatDuration(remaining.reduce((sum, item) => sum + item.duration, 0));
    refs.watchedTime.textContent = formatDuration(watched.reduce((sum, item) => sum + item.duration, 0));
    refs.yetCount.textContent = String(remaining.length);
    refs.watchedCount.textContent = String(watched.length);

    renderEtaOnly();
    renderVideoList();
    renderPlayer();
}

function renderEtaOnly() {
    const remainingSeconds = getRemainingSeconds();
    const eta = computeFinishEta(remainingSeconds, state.playbackSpeed, state.bufferMinutes);

    refs.finishByTime.textContent = state.videos.length ? eta.finishByText : "--:--";

    if (state.isPlayerOpen) {
        refs.playerRemainingTiny.textContent = `Yet to watch: ${formatDuration(remainingSeconds)}`;
        refs.playerFinishTiny.textContent = `Finish by: ${eta.finishByText} (${state.playbackSpeed}x + ${state.bufferMinutes}m buffer)`;
    }
}

function startRealtimeEtaTicker() {
    if (etaTimerId) {
        clearInterval(etaTimerId);
    }

    etaTimerId = window.setInterval(() => {
        renderEtaOnly();
    }, 1000);
}

function renderVideoList() {
    const list = getCurrentTabVideos();
    refs.videoList.innerHTML = "";

    if (list.length === 0) {
        refs.videoList.appendChild(refs.emptyStateTemplate.content.cloneNode(true));
        return;
    }

    const frag = document.createDocumentFragment();
    const manualMode = state.sortOrder === "manual";

    list.forEach((video) => {
        const item = document.createElement("article");
        item.className = `video-item ${video.completed ? "completed" : ""}`;
        item.dataset.videoId = video.id;

        if (manualMode) {
            item.draggable = true;
            item.addEventListener("dragstart", () => {
                dragVideoId = video.id;
                item.classList.add("dragging");
            });
            item.addEventListener("dragend", () => {
                dragVideoId = null;
                item.classList.remove("dragging");
                item.classList.remove("drag-over");
            });
            item.addEventListener("dragover", (event) => {
                event.preventDefault();
                item.classList.add("drag-over");
            });
            item.addEventListener("dragleave", () => {
                item.classList.remove("drag-over");
            });
            item.addEventListener("drop", (event) => {
                event.preventDefault();
                item.classList.remove("drag-over");
                reorderManualByIds(dragVideoId, video.id);
            });
        }

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "video-check";
        checkbox.checked = video.completed;
        checkbox.addEventListener("change", () => toggleComplete(video.id));

        const thumb = document.createElement("img");
        thumb.className = "video-thumb";
        thumb.src = video.thumbnailUrl || "https://i.ytimg.com/vi/default/mqdefault.jpg";
        thumb.alt = `Thumbnail for ${video.title}`;
        thumb.loading = "lazy";
        thumb.addEventListener("click", () => openPlayer(video.id));

        const meta = document.createElement("div");
        meta.className = "video-meta";

        const title = document.createElement("p");
        title.className = "video-title";
        title.textContent = video.title;

        const link = document.createElement("p");
        link.className = "video-link";
        link.textContent = `youtube.com/watch?v=${video.id}`;

        const upload = document.createElement("p");
        upload.className = "video-upload";
        upload.textContent = `Uploaded: ${formatUploadDate(video.uploadedAt)}`;

        meta.appendChild(title);
        meta.appendChild(link);
        meta.appendChild(upload);

        const side = document.createElement("div");
        side.className = "video-side";

        const watchBtn = document.createElement("button");
        watchBtn.type = "button";
        watchBtn.className = "watch-btn";
        watchBtn.textContent = "Watch";
        watchBtn.addEventListener("click", () => openPlayer(video.id));

        const duration = document.createElement("span");
        duration.className = "duration";
        duration.textContent = formatDurationCompact(video.duration);

        side.appendChild(watchBtn);
        side.appendChild(duration);

        item.appendChild(checkbox);
        item.appendChild(thumb);
        item.appendChild(meta);
        item.appendChild(side);
        frag.appendChild(item);
    });

    refs.videoList.appendChild(frag);
}

function openPlayer(videoId) {
    const video = state.videos.find((item) => item.id === videoId);
    if (!video) {
        return;
    }

    state.activeVideoId = videoId;
    state.isPlayerOpen = true;
    persistState();
    renderPlayer();
}

function closePlayer() {
    state.isPlayerOpen = false;
    currentPlayerVideoId = null;
    refs.playerFrame.src = "";
    refs.playerModal.classList.add("hidden");
    refs.playerModal.setAttribute("aria-hidden", "true");
    persistState();
}

function renderPlayer() {
    if (!state.isPlayerOpen) {
        refs.playerModal.classList.add("hidden");
        refs.playerModal.setAttribute("aria-hidden", "true");
        return;
    }

    const selectedTabSequence = getCurrentTabVideos();
    let activeIndex = selectedTabSequence.findIndex((item) => item.id === state.activeVideoId);

    if (activeIndex < 0 && selectedTabSequence.length > 0) {
        state.activeVideoId = selectedTabSequence[0].id;
        activeIndex = 0;
        persistState();
    }

    const video = state.videos.find((item) => item.id === state.activeVideoId);
    if (!video) {
        closePlayer();
        return;
    }

    refs.playerModal.classList.remove("hidden");
    refs.playerModal.setAttribute("aria-hidden", "false");
    refs.playerTitle.textContent = video.title;

    if (currentPlayerVideoId !== video.id) {
        refs.playerFrame.src = `https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`;
        currentPlayerVideoId = video.id;
    }

    renderEtaOnly();

    refs.markDoneBtn.textContent = video.completed ? "Mark as Not Completed" : "Mark as Completed";
    refs.prevVideoBtn.disabled = activeIndex <= 0;
    refs.nextVideoBtn.disabled = activeIndex < 0 || activeIndex >= selectedTabSequence.length - 1;
}

async function makePlayerFullscreen() {
    try {
        if (refs.playerFrame.requestFullscreen) {
            await refs.playerFrame.requestFullscreen();
            return;
        }

        if (refs.playerModal.requestFullscreen) {
            await refs.playerModal.requestFullscreen();
        }
    } catch {
        setStatus("Fullscreen is blocked by browser policy for this frame.");
    }
}

function playAdjacentVideo(direction) {
    const selectedTabSequence = getCurrentTabVideos();
    const currentIndex = selectedTabSequence.findIndex((item) => item.id === state.activeVideoId);
    if (currentIndex < 0) {
        return;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= selectedTabSequence.length) {
        return;
    }

    state.activeVideoId = selectedTabSequence[nextIndex].id;
    persistState();
    renderPlayer();
}

function markActiveAsCompleted() {
    const current = state.videos.find((item) => item.id === state.activeVideoId);
    if (!current) {
        return;
    }

    current.completed = !current.completed;
    state.motivation = getMotivationMessage(current.completed);

    if (current.completed) {
        openCompletionModal(current.title);
    }

    persistState();
    render();
}

function openHelpModal() {
    refs.helpModal.classList.remove("hidden");
    refs.helpModal.setAttribute("aria-hidden", "false");
}

function closeHelpModal() {
    refs.helpModal.classList.add("hidden");
    refs.helpModal.setAttribute("aria-hidden", "true");
}

function openCompletionModal(videoTitle) {
    refs.completeText.textContent = `"${videoTitle}" marked as completed.`;
    refs.completeModal.classList.remove("hidden");
    refs.completeModal.setAttribute("aria-hidden", "false");
}

function closeCompletionModal() {
    refs.completeModal.classList.add("hidden");
    refs.completeModal.setAttribute("aria-hidden", "true");
}

function setStatus(message) {
    refs.statusText.textContent = message;
}

function toggleBusy(isBusy) {
    refs.fetchBtn.disabled = isBusy;
    refs.fetchBtn.textContent = isBusy ? "Fetching..." : "Fetch Video(s)";
}

function persistState() {
    state.playlistInput = refs.playlistIdInput.value.trim();
    state.apiKey = refs.apiKeyInput.value.trim();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        state = {
            ...DEFAULT_STATE,
            ...parsed,
            playbackSpeed: ALLOWED_SPEEDS.includes(Number(parsed.playbackSpeed)) ? Number(parsed.playbackSpeed) : 1,
            bufferMinutes: Math.max(0, Number(parsed.bufferMinutes || 0)),
            startTime: parsed.startTime || "",
            videos: Array.isArray(parsed.videos)
                ? parsed.videos.map((video, index) => ({
                      id: video.id,
                      title: video.title || "Untitled video",
                      duration: Number(video.duration || 0),
                      completed: Boolean(video.completed),
                      order: Number(video.order || index + 1),
                      uploadedAt: video.uploadedAt || "",
                      thumbnailUrl: video.thumbnailUrl || ""
                  }))
                : []
        };

        state.activeVideoId = parsed.activeVideoId || null;
        state.isPlayerOpen = false;
    } catch {
        state = { ...DEFAULT_STATE };
    }
}
