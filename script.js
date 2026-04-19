const STORAGE_KEY = "yt_playlist_tracker_state_v8";
const EXPORT_VERSION = "0.7.0";
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
    isPlayerLarge: false,
    isPlayerDocked: false,
    playbackSpeed: 1,
    bufferMinutes: 0,
    startTime: ""
};

let state = { ...DEFAULT_STATE };
let etaTimerId = null;
let currentPlayerVideoId = null;
let dragVideoId = null;
let mergeResolver = null;
let clearResolver = null;
let exportResolver = null;

const refs = {
    playlistIdInput: document.getElementById("playlistId"),
    apiKeyInput: document.getElementById("apiKey"),
    fetchBtn: document.getElementById("fetchBtn"),
    importBtnTop: document.getElementById("importBtnTop"),
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
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFileInput: document.getElementById("importFileInput"),
    yetTabBtn: document.getElementById("yetTabBtn"),
    watchedTabBtn: document.getElementById("watchedTabBtn"),
    yetCount: document.getElementById("yetCount"),
    watchedCount: document.getElementById("watchedCount"),
    videoList: document.getElementById("video-list"),
    playerDock: document.getElementById("playerDock"),
    emptyStateTemplate: document.getElementById("emptyStateTemplate"),
    playerModal: document.getElementById("playerModal"),
    playerBackdrop: document.getElementById("playerBackdrop"),
    playerCard: document.querySelector("#playerModal .player-card"),
    closePlayerBtn: document.getElementById("closePlayerBtn"),
    prevVideoBtn: document.getElementById("prevVideoBtn"),
    nextVideoBtn: document.getElementById("nextVideoBtn"),
    markDoneBtn: document.getElementById("markDoneBtn"),
    largeScreenBtn: document.getElementById("largeScreenBtn"),
    popModeBtn: document.getElementById("popModeBtn"),
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
    mergeTopBtn: document.getElementById("mergeTopBtn"),
    clearConfirmModal: document.getElementById("clearConfirmModal"),
    clearConfirmBackdrop: document.getElementById("clearConfirmBackdrop"),
    closeClearConfirmBtn: document.getElementById("closeClearConfirmBtn"),
    confirmClearBtn: document.getElementById("confirmClearBtn"),
    cancelClearBtn: document.getElementById("cancelClearBtn"),
    exportModal: document.getElementById("exportModal"),
    exportBackdrop: document.getElementById("exportBackdrop"),
    closeExportBtn: document.getElementById("closeExportBtn"),
    exportIncludeApiKey: document.getElementById("exportIncludeApiKey"),
    confirmExportBtn: document.getElementById("confirmExportBtn"),
    cancelExportBtn: document.getElementById("cancelExportBtn")
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
    refs.importBtnTop.addEventListener("click", () => refs.importFileInput.click());
    refs.clearBtn.addEventListener("click", clearAllFlow);
    refs.clearStartTimeBtn.addEventListener("click", clearStartTime);
    refs.apiHelpBtn.addEventListener("click", openHelpModal);

    refs.playlistIdInput.addEventListener("input", persistState);
    refs.apiKeyInput.addEventListener("input", persistState);

    refs.exportBtn.addEventListener("click", openExportModal);
    refs.importBtn.addEventListener("click", () => refs.importFileInput.click());
    refs.importFileInput.addEventListener("change", importDataFromFile);

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
    refs.largeScreenBtn.addEventListener("click", toggleLargeScreen);
    refs.popModeBtn.addEventListener("click", togglePopMode);

    refs.helpBackdrop.addEventListener("click", closeHelpModal);
    refs.closeHelpBtn.addEventListener("click", closeHelpModal);

    refs.completeBackdrop.addEventListener("click", closeCompletionModal);
    refs.closeCompleteBtn.addEventListener("click", closeCompletionModal);

    refs.mergeBackdrop.addEventListener("click", () => closeMergeModal(null));
    refs.closeMergeBtn.addEventListener("click", () => closeMergeModal(null));

    refs.clearConfirmBackdrop.addEventListener("click", () => closeClearConfirmModal(false));
    refs.closeClearConfirmBtn.addEventListener("click", () => closeClearConfirmModal(false));
    refs.cancelClearBtn.addEventListener("click", () => closeClearConfirmModal(false));
    refs.confirmClearBtn.addEventListener("click", () => closeClearConfirmModal(true));

    refs.exportBackdrop.addEventListener("click", () => closeExportModal(false));
    refs.closeExportBtn.addEventListener("click", () => closeExportModal(false));
    refs.cancelExportBtn.addEventListener("click", () => closeExportModal(false));
    refs.confirmExportBtn.addEventListener("click", () => closeExportModal(true));

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        if (!refs.completeModal.classList.contains("hidden")) {
            closeCompletionModal();
            return;
        }

        if (!refs.helpModal.classList.contains("hidden")) {
            closeHelpModal();
            return;
        }

        if (!refs.mergeModal.classList.contains("hidden")) {
            closeMergeModal(null);
            return;
        }

        if (!refs.clearConfirmModal.classList.contains("hidden")) {
            closeClearConfirmModal(false);
            return;
        }

        if (!refs.exportModal.classList.contains("hidden")) {
            closeExportModal(false);
            return;
        }

        if (state.isPlayerOpen && !state.isPlayerDocked) {
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

async function clearAllFlow() {
    const confirmed = await openClearConfirmModal();
    if (!confirmed) {
        return;
    }

    state = { ...DEFAULT_STATE };
    persistState();
    hydrateInputs();
    closePlayer();
    refs.playlistIdInput.value = "";
    refs.importFileInput.value = "";
    setStatus("Cleared saved data.");
    render();
}

function openClearConfirmModal() {
    refs.clearConfirmModal.classList.remove("hidden");
    refs.clearConfirmModal.setAttribute("aria-hidden", "false");

    return new Promise((resolve) => {
        clearResolver = resolve;
    });
}

function closeClearConfirmModal(result) {
    refs.clearConfirmModal.classList.add("hidden");
    refs.clearConfirmModal.setAttribute("aria-hidden", "true");

    if (clearResolver) {
        const resolve = clearResolver;
        clearResolver = null;
        resolve(Boolean(result));
    }
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
            setStatus("Fetch canceled.");
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
            const detailMap = await fetchVideoDetails(playlistVideoIds, apiKey);
            incomingVideos.push(...uniquePlaylistItems.map((item, index) => createVideoModel(item, detailMap, index)));
        }

        if (mixed.videoIds.length > 0) {
            const detailMap = await fetchVideoDetails(mixed.videoIds, apiKey);
            incomingVideos.push(
                ...mixed.videoIds
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
                            baseOrder: index + 1,
                            manualOrder: index + 1,
                            uploadedAt: details.uploadedAt || "",
                            thumbnailUrl: details.thumbnailUrl || "",
                            link: `https://www.youtube.com/watch?v=${id}`
                        };
                    })
                    .filter(Boolean)
            );
        }

        const uniqueIncoming = dedupeVideosById(incomingVideos);
        if (uniqueIncoming.length === 0) {
            throw new Error("No valid videos found from input.");
        }

        mergeVideos(uniqueIncoming, mergeMode);

        state.apiKey = apiKey;
        state.playlistInput = "";
        refs.playlistIdInput.value = "";
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
        baseOrder: index + 1,
        manualOrder: index + 1,
        uploadedAt: details.uploadedAt || item.snippet?.publishedAt || "",
        thumbnailUrl: details.thumbnailUrl || playlistThumb,
        link: `https://www.youtube.com/watch?v=${videoId}`
    };
}

function mergeVideos(incomingVideos, mode) {
    // Always preserve manualOrder from incoming if present, never overwrite it
    const incoming = incomingVideos.map((video, index) => ({
        ...video,
        baseOrder: Number(video.baseOrder || index + 1),
        manualOrder: Number(video.manualOrder || index + 1)
    }));

    if (mode === "replace") {
        // Use incoming manualOrder as-is
        state.videos = incoming.map((video) => ({ ...video }));
        state.activeVideoId = null;
        return;
    }

    const incomingUnique = dedupeVideosById(incoming);

    if (mode === "top") {
        const incomingSet = new Set(incomingUnique.map((video) => video.id));
        const existingFiltered = state.videos.filter((video) => !incomingSet.has(video.id));

        // For baseOrder, stack incoming on top, then existing
        const baseOrdered = [...incomingUnique, ...existingFiltered.slice().sort((a, b) => (a.baseOrder || 0) - (b.baseOrder || 0))];
        // For manualOrder, stack incoming on top, then existing, but preserve manualOrder from both
        const manualOrdered = [...incomingUnique, ...existingFiltered];
        // Re-index baseOrder and manualOrder to be contiguous
        state.videos = manualOrdered.map((video, idx) => {
            const baseIdx = baseOrdered.findIndex(v => v.id === video.id);
            return {
                ...video,
                baseOrder: baseIdx >= 0 ? baseIdx + 1 : idx + 1,
                manualOrder: idx + 1
            };
        });
    } else {
        // Add new incoming videos to the end, preserving their manualOrder
        const existingMap = new Map(state.videos.map((video) => [video.id, video]));
        for (const video of incomingUnique) {
            if (!existingMap.has(video.id)) {
                state.videos.push({ ...video });
            }
        }
        // Re-index baseOrder and manualOrder to be contiguous, but preserve manualOrder relative order
        const baseOrdered = state.videos.slice().sort((a, b) => (a.baseOrder || 0) - (b.baseOrder || 0));
        const manualOrdered = state.videos.slice().sort((a, b) => (a.manualOrder || 0) - (b.manualOrder || 0));
        state.videos = manualOrdered.map((video, idx) => {
            const baseIdx = baseOrdered.findIndex(v => v.id === video.id);
            return {
                ...video,
                baseOrder: baseIdx >= 0 ? baseIdx + 1 : idx + 1,
                manualOrder: idx + 1
            };
        });
    }
}

function openMergeModal() {
    refs.mergeModal.classList.remove("hidden");
    refs.mergeModal.setAttribute("aria-hidden", "false");

    return new Promise((resolve) => {
        mergeResolver = (value) => {
            cleanup();
            resolve(value);
        };

        const choose = (value) => closeMergeModal(value);
        const onReplace = () => choose("replace");
        const onBottom = () => choose("bottom");
        const onTop = () => choose("top");

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

async function importDataFromFile(event) {
    const file = event.target.files?.[0];
    refs.importFileInput.value = "";
    if (!file) {
        return;
    }

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        await applyImportedData(parsed);
    } catch {
        setStatus("Invalid import file format.");
    }
}

async function applyImportedData(data) {
    if (!data || !Array.isArray(data.videos)) {
        setStatus("Import failed: missing video data.");
        return;
    }

    const importedVideos = data.videos
        .map((video, index) => ({
            id: video.id,
            title: video.title || "Untitled video",
            duration: Number(video.duration || 0),
            completed: Boolean(video.completed),
            baseOrder: Number(video.baseOrder || video.order || index + 1),
            manualOrder: Number(video.manualOrder || video.baseOrder || video.order || index + 1),
            uploadedAt: video.uploadedAt || "",
            thumbnailUrl: video.thumbnailUrl || "",
            link: video.link || `https://www.youtube.com/watch?v=${video.id}`
        }))
        .filter((video) => Boolean(video.id));

    if (importedVideos.length === 0) {
        setStatus("Import failed: no valid videos in file.");
        return;
    }

    let mode = "replace";
    const existingHasPlaylist = state.videos.length > 0;
    if (existingHasPlaylist) {
        mode = await openMergeModal();
        if (!mode) {
            setStatus("Import canceled.");
            return;
        }
    }

    mergeVideos(importedVideos, mode);

    if (!refs.apiKeyInput.value.trim() && data.apiKey) {
        state.apiKey = String(data.apiKey);
        refs.apiKeyInput.value = state.apiKey;
    }

    if (!existingHasPlaylist) {
        const importedSpeed = Number(data.playbackSpeed || 1);
        state.playbackSpeed = ALLOWED_SPEEDS.includes(importedSpeed) ? importedSpeed : 1;
        state.bufferMinutes = Math.max(0, Number(data.bufferMinutes || 0));
        state.startTime = data.startTime || "";
        state.isPlayerDocked = Boolean(data.isPlayerDocked);
    }

    state.activeVideoId = data.activeVideoId || state.activeVideoId;
    state.isPlayerOpen = Boolean(data.isPlayerOpen) && state.videos.length > 0;
    state.isPlayerLarge = false;
    state.sortOrder = ["normal", "reverse", "manual"].includes(data.sortOrder) ? data.sortOrder : state.sortOrder;
    state.currentTab = "yet-to-watch";
    state.motivation = "Import completed successfully.";

    persistState();
    hydrateInputs();
    render();
    setStatus(`Imported ${importedVideos.length} video(s).`);
}

function openExportModal() {
    refs.exportIncludeApiKey.checked = true;
    refs.exportModal.classList.remove("hidden");
    refs.exportModal.setAttribute("aria-hidden", "false");

    return new Promise((resolve) => {
        exportResolver = resolve;
    });
}

function closeExportModal(confirmed) {
    refs.exportModal.classList.add("hidden");
    refs.exportModal.setAttribute("aria-hidden", "true");

    if (exportResolver) {
        const resolve = exportResolver;
        exportResolver = null;
        resolve(Boolean(confirmed));
    }

    if (confirmed) {
        exportData(refs.exportIncludeApiKey.checked);
    }
}

function exportData(includeApiKey) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const fileName = `YTPlaylists_${day}_${month}_${year}.json`;

    const payload = {
        exportVersion: EXPORT_VERSION,
        exportedAt: now.toISOString(),
        apiKey: includeApiKey ? refs.apiKeyInput.value.trim() : "",
        sortOrder: state.sortOrder,
        videos: state.videos.map((video) => ({
            id: video.id,
            title: video.title,
            duration: Number(video.duration || 0),
            completed: Boolean(video.completed),
            baseOrder: Number(video.baseOrder || 0),
            manualOrder: Number(video.manualOrder || video.baseOrder || 0),
            uploadedAt: video.uploadedAt || "",
            thumbnailUrl: video.thumbnailUrl || "",
            link: video.link || `https://www.youtube.com/watch?v=${video.id}`
        })),
        playbackSpeed: state.playbackSpeed,
        bufferMinutes: state.bufferMinutes,
        startTime: state.startTime,
        isPlayerDocked: state.isPlayerDocked,
        isPlayerOpen: state.isPlayerOpen,
        activeVideoId: state.activeVideoId
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    setStatus("Export complete.");
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

                const liveMatch = url.pathname.match(/^\/live\/([A-Za-z0-9_-]{6,})/i);
                if (liveMatch) {
                    videoIds.push(liveMatch[1]);
                    continue;
                }

                const watchId = url.searchParams.get("v");
                if (watchId) {
                    videoIds.push(watchId);
                    continue;
                }

                const pathFallback = url.pathname.split("/").filter(Boolean).pop();
                if (pathFallback && /^[A-Za-z0-9_-]{11}$/.test(pathFallback)) {
                    videoIds.push(pathFallback);
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

    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
    return { finishByText: formatClockTime(finishDate) };
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
    if (sortOrder === "manual") {
        return state.videos.slice().sort((a, b) => (a.manualOrder || a.baseOrder || 0) - (b.manualOrder || b.baseOrder || 0));
    }

    const normal = state.videos.slice().sort((a, b) => (a.baseOrder || 0) - (b.baseOrder || 0));
    return sortOrder === "reverse" ? normal.reverse() : normal;
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
        video.manualOrder = index + 1;
    });

    persistState();
    render();
}

function render() {
    const hasVideos = state.videos.length > 0;
    refs.dashboard.classList.toggle("hidden", !hasVideos);
    refs.importBtnTop.classList.toggle("hidden", hasVideos);

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

        if (manualMode) {
            item.classList.add("drag-ready");
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

        const dragHandle = document.createElement("span");
        dragHandle.className = "drag-handle";
        dragHandle.title = "Drag to reorder (manual mode)";
        dragHandle.textContent = "|||";

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

        item.appendChild(dragHandle);
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
    state.isPlayerLarge = false;
    currentPlayerVideoId = null;
    refs.playerFrame.src = "";
    refs.playerModal.classList.add("hidden");
    refs.playerDock.classList.add("hidden");
    refs.playerCard.classList.remove("large", "docked");
    if (refs.playerCard.parentElement !== refs.playerModal) {
        refs.playerModal.appendChild(refs.playerCard);
    }
    refs.playerModal.setAttribute("aria-hidden", "true");
    persistState();
}

function toggleLargeScreen() {
    if (!state.isPlayerOpen || state.isPlayerDocked) {
        return;
    }

    state.isPlayerLarge = !state.isPlayerLarge;
    persistState();
    renderPlayer();
}

function togglePopMode() {
    if (!state.isPlayerOpen) {
        return;
    }

    state.isPlayerDocked = !state.isPlayerDocked;
    if (state.isPlayerDocked) {
        state.isPlayerLarge = false;
    }

    persistState();
    renderPlayer();
}

function renderPlayer() {
    if (!state.isPlayerOpen) {
        refs.playerModal.classList.add("hidden");
        refs.playerDock.classList.add("hidden");
        refs.playerCard.classList.remove("large", "docked");
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

    if (state.isPlayerDocked) {
        refs.playerModal.classList.add("hidden");
        refs.playerModal.setAttribute("aria-hidden", "true");
        refs.playerDock.classList.remove("hidden");
        refs.playerCard.classList.add("docked");
        refs.playerCard.classList.remove("large");
        if (refs.playerCard.parentElement !== refs.playerDock) {
            refs.playerDock.appendChild(refs.playerCard);
        }
    } else {
        refs.playerDock.classList.add("hidden");
        refs.playerModal.classList.remove("hidden");
        refs.playerModal.setAttribute("aria-hidden", "false");
        refs.playerCard.classList.remove("docked");
        refs.playerCard.classList.toggle("large", state.isPlayerLarge);
        if (refs.playerCard.parentElement !== refs.playerModal) {
            refs.playerModal.appendChild(refs.playerCard);
        }
    }

    refs.playerTitle.textContent = video.title;

    if (currentPlayerVideoId !== video.id) {
        refs.playerFrame.src = `https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`;
        currentPlayerVideoId = video.id;
    }

    refs.largeScreenBtn.style.display = state.isPlayerDocked ? "none" : "inline-flex";
    refs.largeScreenBtn.textContent = state.isPlayerLarge ? "Mini Screen" : "Large Screen";
    refs.popModeBtn.textContent = state.isPlayerDocked ? "Pop-out" : "Pop-into UI";

    renderEtaOnly();

    refs.markDoneBtn.textContent = video.completed ? "Mark as Not Completed" : "Mark as Completed";
    refs.prevVideoBtn.disabled = activeIndex <= 0;
    refs.nextVideoBtn.disabled = activeIndex < 0 || activeIndex >= selectedTabSequence.length - 1;
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
                        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
            playbackSpeed: ALLOWED_SPEEDS.includes(Number(parsed.playbackSpeed)) ? Number(parsed.playbackSpeed) : 1,
            bufferMinutes: Math.max(0, Number(parsed.bufferMinutes || 0)),
            startTime: parsed.startTime || "",
            isPlayerDocked: Boolean(parsed.isPlayerDocked),
            isPlayerLarge: Boolean(parsed.isPlayerLarge),
                        sortOrder: ["normal", "reverse", "manual"].includes(parsed.sortOrder) ? parsed.sortOrder : "normal",
            videos: Array.isArray(parsed.videos)
                ? parsed.videos.map((video, index) => ({
                      id: video.id,
                      title: video.title || "Untitled video",
                      duration: Number(video.duration || 0),
                      completed: Boolean(video.completed),
                                            baseOrder: Number(video.baseOrder || video.order || index + 1),
                                            manualOrder: Number(video.manualOrder || video.baseOrder || video.order || index + 1),
                      uploadedAt: video.uploadedAt || "",
                                            thumbnailUrl: video.thumbnailUrl || "",
                                            link: video.link || `https://www.youtube.com/watch?v=${video.id}`
                  }))
                : []
        };

        state.activeVideoId = parsed.activeVideoId || null;
        state.isPlayerOpen = false;
    } catch {
        state = { ...DEFAULT_STATE };
    }
}
