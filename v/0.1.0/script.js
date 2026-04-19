const STORAGE_KEY = "yt_playlist_tracker_state_v2";
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
    bufferMinutes: 0
};

let state = { ...DEFAULT_STATE };

const refs = {
    playlistIdInput: document.getElementById("playlistId"),
    apiKeyInput: document.getElementById("apiKey"),
    fetchBtn: document.getElementById("fetchBtn"),
    clearBtn: document.getElementById("clearBtn"),
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
    playerFrame: document.getElementById("playerFrame"),
    playerTitle: document.getElementById("playerTitle"),
    playerRemainingTiny: document.getElementById("playerRemainingTiny"),
    playerFinishTiny: document.getElementById("playerFinishTiny")
};

init();

function init() {
    loadState();
    bindEvents();
    hydrateInputs();
    render();
}

function bindEvents() {
    refs.fetchBtn.addEventListener("click", fetchPlaylist);
    refs.clearBtn.addEventListener("click", clearAll);

    refs.sortOrder.addEventListener("change", (event) => {
        state.sortOrder = event.target.value;
        persistState();
        render();
    });

    refs.speedOption.addEventListener("change", (event) => {
        const speed = Number(event.target.value || 1);
        state.playbackSpeed = ALLOWED_SPEEDS.includes(speed) ? speed : 1;
        persistState();
        render();
    });

    refs.bufferMinutes.addEventListener("input", (event) => {
        const minutes = Number(event.target.value || 0);
        state.bufferMinutes = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
        persistState();
        render();
    });

    refs.yetTabBtn.addEventListener("click", () => setTab("yet-to-watch"));
    refs.watchedTabBtn.addEventListener("click", () => setTab("watched"));

    refs.playerBackdrop.addEventListener("click", closePlayer);
    refs.closePlayerBtn.addEventListener("click", closePlayer);
    refs.prevVideoBtn.addEventListener("click", () => playAdjacentVideo(-1));
    refs.nextVideoBtn.addEventListener("click", () => playAdjacentVideo(1));
    refs.markDoneBtn.addEventListener("click", markActiveAsCompleted);

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && state.isPlayerOpen) {
            closePlayer();
        }
    });
}

function hydrateInputs() {
    refs.playlistIdInput.value = state.playlistInput;
    refs.apiKeyInput.value = state.apiKey;
    refs.sortOrder.value = state.sortOrder;
    refs.speedOption.value = String(state.playbackSpeed);
    refs.bufferMinutes.value = String(state.bufferMinutes);
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

async function fetchPlaylist() {
    const rawInput = refs.playlistIdInput.value.trim();
    const apiKey = refs.apiKeyInput.value.trim();
    const playlistId = extractPlaylistId(rawInput);

    if (!playlistId) {
        setStatus("Please enter a valid YouTube playlist URL or playlist ID.");
        return;
    }

    if (!apiKey) {
        setStatus("Please provide a YouTube Data API key to fetch the full playlist.");
        return;
    }

    toggleBusy(true);
    setStatus("Fetching playlist videos...");

    try {
        const playlistItems = await fetchAllPlaylistItems(playlistId, apiKey);

        if (playlistItems.length === 0) {
            throw new Error("No videos found in this playlist.");
        }

        setStatus("Fetching video details...");
        const videoIds = playlistItems.map((item) => item.contentDetails.videoId).filter(Boolean);
        const detailMap = await fetchVideoDetails(videoIds, apiKey);

        state.videos = playlistItems.map((item, index) => {
            const videoId = item.contentDetails.videoId;
            const details = detailMap.get(videoId) || {};
            const isoDuration = details.durationISO || "PT0S";
            const playlistThumb = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || "";

            return {
                id: videoId,
                title: item.snippet.title || "Untitled video",
                duration: parseISO8601Duration(isoDuration),
                completed: false,
                order: index + 1,
                uploadedAt: details.uploadedAt || item.snippet?.publishedAt || "",
                thumbnailUrl: details.thumbnailUrl || playlistThumb
            };
        });

        state.apiKey = apiKey;
        state.playlistInput = rawInput;
        state.currentTab = "yet-to-watch";
        state.activeVideoId = null;
        state.isPlayerOpen = false;
        state.motivation = "Playlist loaded. Pick the first video and start now.";

        persistState();
        setStatus(`Loaded ${state.videos.length} videos.`);
        render();
    } catch (error) {
        setStatus(`Error: ${error.message}`);
    } finally {
        toggleBusy(false);
    }
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

    return items.filter((item) => item.contentDetails && item.contentDetails.videoId);
}

async function fetchVideoDetails(videoIds, apiKey) {
    const detailMap = new Map();
    const chunkSize = 50;

    for (let index = 0; index < videoIds.length; index += chunkSize) {
        const chunk = videoIds.slice(index, index + chunkSize);
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
                durationISO: video.contentDetails?.duration || "PT0S",
                uploadedAt: video.snippet?.publishedAt || "",
                thumbnailUrl: video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || ""
            });
        });
    }

    return detailMap;
}

function extractPlaylistId(input) {
    if (!input) {
        return "";
    }

    if (!input.includes("http")) {
        return input;
    }

    try {
        const url = new URL(input);
        return url.searchParams.get("list") || "";
    } catch {
        return "";
    }
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
    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function computeFinishEta(remainingSeconds, speed, bufferMinutes) {
    const safeSpeed = speed > 0 ? speed : 1;
    const adjustedSeconds = Math.ceil(remainingSeconds / safeSpeed) + Math.max(0, bufferMinutes) * 60;
    const finishDate = new Date(Date.now() + adjustedSeconds * 1000);

    return {
        adjustedSeconds,
        finishDate,
        finishByText: formatClockTime(finishDate)
    };
}

function getRemainingSeconds() {
    return state.videos
        .filter((item) => !item.completed)
        .reduce((sum, item) => sum + item.duration, 0);
}

function toggleComplete(videoId) {
    const video = state.videos.find((entry) => entry.id === videoId);
    if (!video) {
        return;
    }

    video.completed = !video.completed;
    state.motivation = getMotivationMessage(video.completed);

    if (video.completed) {
        throwConfetti();
    }

    persistState();
    render();
}

function moveManual(videoId, direction) {
    const ordered = getSortedVideos("manual");
    const fromIndex = ordered.findIndex((item) => item.id === videoId);

    if (fromIndex < 0) {
        return;
    }

    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= ordered.length) {
        return;
    }

    const fromVideo = ordered[fromIndex];
    const toVideo = ordered[toIndex];
    const temp = fromVideo.order;
    fromVideo.order = toVideo.order;
    toVideo.order = temp;

    persistState();
    render();
}

function getMotivationMessage(markedAsComplete) {
    const remaining = state.videos.filter((item) => !item.completed);
    const watched = state.videos.filter((item) => item.completed);

    const watchedSeconds = watched.reduce((sum, item) => sum + item.duration, 0);
    const watchedMinutes = Math.round(watchedSeconds / 60);
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

function getSortedVideos(sortOrder = state.sortOrder) {
    const sorted = state.videos.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

    if (sortOrder === "reverse") {
        return sorted.reverse();
    }

    return sorted;
}

function getCurrentTabVideos() {
    const sorted = getSortedVideos();
    const showWatched = state.currentTab === "watched";
    return sorted.filter((item) => (showWatched ? item.completed : !item.completed));
}

function render() {
    const hasVideos = state.videos.length > 0;
    refs.dashboard.classList.toggle("hidden", !hasVideos);

    refs.yetTabBtn.classList.toggle("active", state.currentTab === "yet-to-watch");
    refs.watchedTabBtn.classList.toggle("active", state.currentTab === "watched");
    refs.sortOrder.value = state.sortOrder;
    refs.speedOption.value = String(state.playbackSpeed);
    refs.bufferMinutes.value = String(state.bufferMinutes);
    refs.motivation.textContent = state.motivation;

    if (!hasVideos) {
        refs.videoList.innerHTML = "";
        refs.finishByTime.textContent = "--:--";
        renderPlayer();
        return;
    }

    const watched = state.videos.filter((item) => item.completed);
    const remaining = state.videos.filter((item) => !item.completed);
    const totalSeconds = state.videos.reduce((sum, item) => sum + item.duration, 0);
    const watchedSeconds = watched.reduce((sum, item) => sum + item.duration, 0);
    const remainingSeconds = remaining.reduce((sum, item) => sum + item.duration, 0);
    const eta = computeFinishEta(remainingSeconds, state.playbackSpeed, state.bufferMinutes);

    refs.totalTime.textContent = formatDuration(totalSeconds);
    refs.remainingTime.textContent = formatDuration(remainingSeconds);
    refs.watchedTime.textContent = formatDuration(watchedSeconds);
    refs.finishByTime.textContent = eta.finishByText;
    refs.yetCount.textContent = String(remaining.length);
    refs.watchedCount.textContent = String(watched.length);

    renderVideoList();
    renderPlayer();
}

function renderVideoList() {
    const list = getCurrentTabVideos();
    refs.videoList.innerHTML = "";

    if (list.length === 0) {
        refs.videoList.appendChild(refs.emptyStateTemplate.content.cloneNode(true));
        return;
    }

    list.forEach((video) => {
        const item = document.createElement("article");
        item.className = `video-item ${video.completed ? "completed" : ""}`;

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

        if (state.sortOrder === "manual") {
            const controls = document.createElement("div");
            controls.className = "manual-actions";

            const up = document.createElement("button");
            up.type = "button";
            up.className = "mini-btn";
            up.textContent = "↑";
            up.title = "Move up";
            up.addEventListener("click", () => moveManual(video.id, -1));

            const down = document.createElement("button");
            down.type = "button";
            down.className = "mini-btn";
            down.textContent = "↓";
            down.title = "Move down";
            down.addEventListener("click", () => moveManual(video.id, 1));

            controls.appendChild(up);
            controls.appendChild(down);
            side.appendChild(controls);
        }

        item.appendChild(checkbox);
        item.appendChild(thumb);
        item.appendChild(meta);
        item.appendChild(side);

        refs.videoList.appendChild(item);
    });
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
    refs.playerFrame.src = "";
    refs.playerModal.classList.add("hidden");
    refs.playerModal.setAttribute("aria-hidden", "true");
    persistState();
}

function renderPlayer() {
    if (!state.isPlayerOpen) {
        refs.playerModal.classList.add("hidden");
        refs.playerModal.setAttribute("aria-hidden", "true");
        refs.playerFrame.src = "";
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

    const remainingSeconds = getRemainingSeconds();
    const eta = computeFinishEta(remainingSeconds, state.playbackSpeed, state.bufferMinutes);

    refs.playerModal.classList.remove("hidden");
    refs.playerModal.setAttribute("aria-hidden", "false");
    refs.playerTitle.textContent = video.title;
    refs.playerRemainingTiny.textContent = `Yet to watch: ${formatDuration(remainingSeconds)}`;
    refs.playerFinishTiny.textContent = `Finish by: ${eta.finishByText} (${state.playbackSpeed}x + ${state.bufferMinutes}m buffer)`;

    const expectedSrc = `https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`;
    if (refs.playerFrame.src !== expectedSrc) {
        refs.playerFrame.src = expectedSrc;
    }

    refs.markDoneBtn.textContent = video.completed ? "Mark as Not Completed" : "Mark as Completed";

    if (activeIndex < 0 || selectedTabSequence.length === 0) {
        refs.prevVideoBtn.disabled = true;
        refs.nextVideoBtn.disabled = true;
    } else {
        refs.prevVideoBtn.disabled = activeIndex <= 0;
        refs.nextVideoBtn.disabled = activeIndex >= selectedTabSequence.length - 1;
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
        throwConfetti();
    }

    persistState();
    render();
}

function throwConfetti() {
    const colors = ["#0a7f62", "#0c9170", "#f5b189", "#ffd166", "#ff7f50", "#6fcbb0"];
    const total = 90;

    for (let i = 0; i < total; i += 1) {
        const piece = document.createElement("span");
        const size = 5 + Math.random() * 7;
        const left = Math.random() * 100;
        const duration = 1400 + Math.random() * 1400;
        const sway = -70 + Math.random() * 140;
        const rotate = -240 + Math.random() * 480;

        piece.style.position = "fixed";
        piece.style.left = `${left}vw`;
        piece.style.top = "-20px";
        piece.style.width = `${size}px`;
        piece.style.height = `${size * 0.7}px`;
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.opacity = "0.95";
        piece.style.borderRadius = "2px";
        piece.style.pointerEvents = "none";
        piece.style.zIndex = "40";

        piece.animate(
            [
                { transform: "translate3d(0,0,0) rotate(0deg)", opacity: 1 },
                { transform: `translate3d(${sway}px, 110vh, 0) rotate(${rotate}deg)`, opacity: 0.05 }
            ],
            {
                duration,
                easing: "cubic-bezier(0.2, 0.85, 0.25, 1)",
                fill: "forwards"
            }
        );

        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), duration + 120);
    }
}

function setStatus(message) {
    refs.statusText.textContent = message;
}

function toggleBusy(isBusy) {
    refs.fetchBtn.disabled = isBusy;
    refs.fetchBtn.textContent = isBusy ? "Fetching..." : "Fetch Playlist";
}

function persistState() {
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
            playbackSpeed: ALLOWED_SPEEDS.includes(Number(parsed.playbackSpeed))
                ? Number(parsed.playbackSpeed)
                : 1,
            bufferMinutes: Math.max(0, Number(parsed.bufferMinutes || 0)),
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
