const API_BASE = "https://argon.global.ssl.fastly.net";
const API_SAAVN = "https://jiosaavn-api-privatecvc2.vercel.app";
const LYRICS_API_BASE = "https://lyrics.lewdhutao.my.eu.org/v2/musixmatch/lyrics";

// State
let currentTrack = null;
let currentResults = [];
let searchType = 'song';
let lastQuery = '';
let isPlaying = false;
let itemToAdd = null;
let currentPlaylistId = null; // For editing
let isDraggingSlider = false; // For smooth seeking

// Queue & Playback State
let playQueue = [];
let queueIndex = -1;
let crossfadeConfig = { enabled: false, duration: 6 };
let activePlayerId = 'audio-player'; // 'audio-player' or 'audio-player-2'
let isCrossfading = false;
let crossfadeInterval = null;

// Cropper State
let cropperImage = null;
let cropState = { x: 0, y: 0, radius: 100 };
let isDraggingCrop = false;
let dragStart = { x: 0, y: 0 };

// Library State
let library = {
    likedSongs: [],
    playlists: []
};

// DOM Elements
let searchBox, searchBtn, contentArea, playerBar, audioPlayer, audioPlayer2, playerImg, playerTitle, playerArtist;
let downloadBtn, playerLikeBtn, lyricsOverlay, closeLyricsBtn, lyricsTitle, lyricsArtist, lyricsText;
let mainHeader, libraryList, createPlaylistBtn, playPauseBtn, seekSlider, currentTimeElem;
let totalDurationElem, volumeSlider;
// New DOM Elements
let editPlaylistNameInput, playlistCoverInput, cropperCanvas;
let settingsDropdown, transitionSelect, crossfadeSliderContainer, crossfadeSlider, crossfadeValue;

const GRID_CLASS = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6';

let lastVolume = 1;

// --- Helper Functions (Defined Top-Level) ---

function getActivePlayer() {
    return document.getElementById(activePlayerId);
}

function getInactivePlayer() {
    return document.getElementById(activePlayerId === 'audio-player' ? 'audio-player-2' : 'audio-player');
}

function getDownloadUrl(item) {
    let url = '';
    
    if (item.downloadUrl) {
        if (Array.isArray(item.downloadUrl)) {
            const best = item.downloadUrl.find(d => d.quality === '320kbps') || item.downloadUrl[item.downloadUrl.length - 1];
            url = best.link;
        } else {
            url = item.downloadUrl;
        }
    } else {
        const possibleUrl = item.song?.url || item.url;
        if (possibleUrl) {
            if (typeof possibleUrl === 'string' && (possibleUrl.includes('saavncdn.com') || possibleUrl.match(/\.(mp3|mp4|m4a)$/i))) {
                url = possibleUrl;
            }
            else if (Array.isArray(possibleUrl)) {
                const best = possibleUrl.find(d => d.quality === '320kbps') || possibleUrl[possibleUrl.length - 1];
                url = best.link;
            }
            else {
                url = `${API_BASE}/api/download?track_url=${encodeURIComponent(possibleUrl)}`;
            }
        }
    }

    if (url) {
        // Use CORS Proxy to bypass restriction
        return 'https://corsproxy.io/?' + encodeURIComponent(url);
    }
    return '';
}

function updatePlayerLikeIcon() {
    if (!currentTrack) return;
    const btn = document.getElementById('player-like-btn'); // Fetch fresh
    if (!btn) return;

    const trackUrl = currentTrack.song?.url || currentTrack.url;
    const isLiked = library.likedSongs.some(s => {
        const sUrl = s.song?.url || s.url;
        const sId = s.id;
        if (currentTrack.id && sId === currentTrack.id) return true;
        if (trackUrl && sUrl === trackUrl) return true;
        return false;
    });
    btn.innerHTML = isLiked ? '<i class="fas fa-heart text-red-500"></i>' : '<i class="far fa-heart"></i>';
}

function updateVolumeIcon() {
    const icon = document.getElementById('volume-icon');
    const player = getActivePlayer();
    if (!icon || !player) return;
    
    icon.className = 'fas cursor-pointer w-5 text-center';
    if (player.volume === 0) {
        icon.classList.add('fa-volume-xmark');
    } else if (player.volume < 0.5) {
        icon.classList.add('fa-volume-low');
    } else {
        icon.classList.add('fa-volume-high');
    }
}

// --- Main Actions (Defined Top-Level) ---

async function toggleLike(item) {
    const trackUrl = item.song?.url || item.url;
    const trackId = item.id; 

    const index = library.likedSongs.findIndex(s => {
        const sUrl = s.song?.url || s.url;
        const sId = s.id;
        if (trackId && sId === trackId) return true;
        if (trackUrl && sUrl === trackUrl) return true;
        return false;
    });

    if (index > -1) {
        library.likedSongs.splice(index, 1);
        showToast("Removed from Liked Songs");
    } else {
        let cleanItem = { ...item }; 
        if (!cleanItem.downloadUrl && !cleanItem.url && cleanItem.song?.url) {
            cleanItem.url = cleanItem.song.url;
        }
        library.likedSongs.unshift(cleanItem);
        showToast("Added to Liked Songs");
    }
    await saveLibrary();
    renderLibrary();
    updatePlayerLikeIcon();
    
    if (mainHeader && mainHeader.textContent === "Liked Songs") {
        openLikedSongs();
    }
}

function toggleMute() {
    const player = getActivePlayer();
    if (!player) return;
    
    if (lastVolume > 0 && player.volume > 0) {
        lastVolume = player.volume;
        setMasterVolume(0);
    } else {
        setMasterVolume(lastVolume || 1);
    }
    updateVolumeIcon();
}

function setMasterVolume(val) {
    const v = Math.max(0, Math.min(1, val));
    if (audioPlayer) audioPlayer.volume = v;
    if (audioPlayer2) audioPlayer2.volume = v;
    if (volumeSlider) volumeSlider.value = v;
}

function addToPlaylist(item) {
    if (library.playlists.length === 0) {
        openCreatePlaylistModal();
        return;
    }
    
    itemToAdd = item;
    const modal = document.getElementById('add-to-playlist-modal');
    const list = document.getElementById('modal-playlist-list');
    if (list) {
        list.innerHTML = '';
        library.playlists.forEach(pl => {
            const btn = document.createElement('div');
            btn.className = 'p-3 bg-[#222] hover:bg-[#333] rounded-lg cursor-pointer flex justify-between items-center transition-colors';
            btn.innerHTML = `<span class="text-white font-medium">${pl.name}</span><span class="text-xs text-gray-500">${pl.songs.length} songs</span>`;
            btn.onclick = () => confirmAddToPlaylist(pl);
            list.appendChild(btn);
        });
    }
    if (modal) modal.classList.add('active');
}

function addCurrentToPlaylist() {
    if (currentTrack) addToPlaylist(currentTrack);
}

async function confirmAddToPlaylist(playlist) {
    if (!itemToAdd) return;
    const exists = playlist.songs.some(s => s.id === itemToAdd.id || (s.url && s.url === itemToAdd.url));
    if (exists) {
        showToast("Song already in playlist");
    } else {
        playlist.songs.push(itemToAdd);
        playlist.updatedAt = new Date().toISOString();
        await saveLibrary();
        showToast(`Added to ${playlist.name}`);
        renderLibrary();
        if (currentPlaylistId === playlist.id) {
            openPlaylist(playlist.id);
        }
    }
    closeModals();
}

async function removeFromPlaylist(playlistId, songId, songUrl) {
    if (!playlistId) return;
    const plIndex = library.playlists.findIndex(p => p.id === playlistId);
    if (plIndex === -1) return;

    const pl = library.playlists[plIndex];
    const initialLength = pl.songs.length;
    
    pl.songs = pl.songs.filter(s => {
        const sId = s.id;
        const sUrl = s.song?.url || s.url;
        if (songId && sId === songId) return false;
        if (songUrl && sUrl === songUrl) return false;
        return true;
    });

    if (pl.songs.length < initialLength) {
        pl.updatedAt = new Date().toISOString();
        await saveLibrary();
        renderLibrary();
        openPlaylist(playlistId); 
        showToast("Removed from playlist");
    }
}

// --- Player Logic ---

function playSong(item, index = -1, queue = []) {
    const active = getActivePlayer();
    const inactive = getInactivePlayer();
    
    if (crossfadeInterval) clearInterval(crossfadeInterval);
    isCrossfading = false;
    
    if (inactive) {
        inactive.pause();
        inactive.currentTime = 0;
    }

    currentTrack = item;
    
    if (index > -1 && queue.length > 0) {
        playQueue = queue;
        queueIndex = index;
    } else {
        playQueue = [item];
        queueIndex = 0;
    }

    const imgUrl = getImageUrl(item);
    const songName = item.song?.name || item.name || 'Unknown';
    const artistName = item.author?.name || item.primaryArtists || '';
    const downloadUrl = getDownloadUrl(item);

    console.log(`Playing: ${songName} on ${activePlayerId}`);

    if (playerTitle) playerTitle.textContent = songName;
    if (playerArtist) playerArtist.textContent = artistName;
    if (playerImg) playerImg.src = imgUrl;
    
    updatePlayerLikeIcon();

    if (downloadBtn) {
        downloadBtn.onclick = (e) => {
            e.preventDefault();
            showToast(`Downloading "${songName}"...`);
            downloadResource(downloadUrl, `${songName}.mp3`);
        };
    }

    active.src = downloadUrl;
    active.volume = (volumeSlider ? volumeSlider.value : 1);
    const playPromise = active.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => console.log("Play interrupted:", error));
    }

    if (playerBar) {
        playerBar.classList.remove('hidden');
        playerBar.style.display = 'flex'; 
    }
}

function togglePlay() {
    const p = getActivePlayer();
    if (p && p.paused) p.play();
    else if (p) p.pause();
}

function updatePlayBtn() {
    if (playPauseBtn) {
        if (isPlaying) {
            playPauseBtn.innerHTML = '<i class="fas fa-pause-circle"></i>';
        } else {
            playPauseBtn.innerHTML = '<i class="fas fa-play-circle"></i>';
        }
    }
}

function updateProgress() {
    const active = getActivePlayer();
    if (!active) return;
    
    const { currentTime, duration } = active;
    if (isNaN(duration)) return;
    
    if (seekSlider && !isDraggingSlider) seekSlider.value = currentTime;
    if (currentTimeElem && !isDraggingSlider) currentTimeElem.textContent = formatTime(currentTime);

    if (crossfadeConfig.enabled && !isCrossfading && queueIndex < playQueue.length - 1) {
        const remaining = duration - currentTime;
        if (remaining <= crossfadeConfig.duration && remaining > 0.5) {
            startCrossfade();
        }
    }
}

function startCrossfade() {
    const nextItem = playQueue[queueIndex + 1];
    if (!nextItem) return;

    console.log("Starting Crossfade...");
    isCrossfading = true;
    
    const outgoing = getActivePlayer();
    activePlayerId = activePlayerId === 'audio-player' ? 'audio-player-2' : 'audio-player';
    const incoming = getActivePlayer();

    const downloadUrl = getDownloadUrl(nextItem);
    incoming.src = downloadUrl;
    incoming.volume = 0; 
    incoming.play().catch(e => console.error("Crossfade play error", e));

    currentTrack = nextItem;
    queueIndex++;
    
    const imgUrl = getImageUrl(nextItem);
    const songName = nextItem.song?.name || nextItem.name || 'Unknown';
    const artistName = nextItem.author?.name || nextItem.primaryArtists || '';
    
    if (playerTitle) playerTitle.textContent = songName;
    if (playerArtist) playerArtist.textContent = artistName;
    if (playerImg) playerImg.src = imgUrl;
    updatePlayerLikeIcon();

    const stepTime = 100;
    const steps = (crossfadeConfig.duration * 1000) / stepTime;
    const volStep = (lastVolume || 1) / steps; 
    let stepCount = 0;

    crossfadeInterval = setInterval(() => {
        stepCount++;
        
        if (outgoing.volume > volStep) outgoing.volume -= volStep;
        else outgoing.volume = 0;

        const targetVol = lastVolume || 1;
        if (incoming.volume < targetVol - volStep) incoming.volume += volStep;
        else incoming.volume = targetVol;

        if (stepCount >= steps) {
            clearInterval(crossfadeInterval);
            isCrossfading = false;
            outgoing.pause();
            outgoing.currentTime = 0;
            outgoing.volume = targetVol; 
            incoming.volume = targetVol;
            console.log("Crossfade Complete");
        }
    }, stepTime);
}

function handleSongEnd(player) {
    if (player.id !== activePlayerId) return;
    
    if (!isCrossfading) {
        isPlaying = false;
        updatePlayBtn();
        if (seekSlider) seekSlider.value = 0;
        playNextSong();
    }
}

function playNextSong() {
    if (queueIndex > -1 && queueIndex < playQueue.length - 1) {
        playSong(playQueue[queueIndex + 1], queueIndex + 1, playQueue);
    } else {
        console.log("End of playlist.");
    }
}

// --- Data & Rendering ---

async function handleSearch() {
    closeLibraryDrawer();
    currentPlaylistId = null;
    const query = searchBox ? searchBox.value.trim() : '';
    if (!query) return;
    lastQuery = query;

    console.log(`Searching for: ${query} (Type: ${searchType})`);

    contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
    contentArea.className = GRID_CLASS; 
    mainHeader.textContent = `Results for "${query}"`;

    try {
        let argonQuery = query;
        if (searchType !== 'song') {
            argonQuery += ` ${searchType}`;
        }
        const argonUrl = `${API_BASE}/api/search?query=${encodeURIComponent(argonQuery)}&limit=20`;
        const argonPromise = fetch(argonUrl)
            .then(res => res.ok ? res.json() : { collection: [] })
            .catch(e => {
                console.error("Argon search failed", e);
                return { collection: [] };
            });

        const saavnUrl = `${API_SAAVN}/search/${searchType}s?query=${encodeURIComponent(query)}`;
        const saavnPromise = fetch(saavnUrl)
            .then(res => res.ok ? res.json() : { data: [] })
            .catch(e => {
                console.error("Saavn search failed", e);
                return { data: [] };
            });

        const [argonRes, saavnRes] = await Promise.all([argonPromise, saavnPromise]);

        let combinedResults = [];

        if (argonRes.collection && Array.isArray(argonRes.collection)) {
            combinedResults.push(...argonRes.collection);
        }

        if (saavnRes.data) {
             const saavnItems = saavnRes.data.results || saavnRes.data;
             if (Array.isArray(saavnItems)) {
                 combinedResults.push(...saavnItems);
             }
        }
        
        if (combinedResults.length > 0) {
             renderResults(combinedResults);
        } else {
            contentArea.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10 w-full">No results found.</div>';
        }
    } catch (e) {
        console.error("Search failed:", e);
        contentArea.innerHTML = `<div class="col-span-full text-center text-red-500 mt-10 w-full">Error: ${e.message}</div>`;
    }
}

function renderResults(results) {
    if (!results || results.length === 0) {
        if (contentArea) contentArea.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10 w-full">No results found.</div>';
        return;
    }

    currentResults = results; 
    if (contentArea) contentArea.innerHTML = ''; 
    
    results.forEach((item, idx) => {
        try {
            const card = document.createElement('div');
            card.className = 'zone-item bg-[#111] rounded-2xl border border-[#252525] overflow-hidden relative group cursor-pointer';
            
            const imgUrl = getImageUrl(item);
            const name = item.song?.name || item.name || 'Unknown';
            const subText = item.author?.name || item.primaryArtists || '';
            
            card.innerHTML = `
                <div class="relative w-full aspect-square">
                    <img src="${imgUrl}" alt="${name}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                    
                    <button class="play-overlay-btn absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30 backdrop-blur-sm">
                        <i class="fas fa-play text-4xl text-white drop-shadow-xl hover:scale-110 transition-transform"></i>
                    </button>

                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 pointer-events-none"></div>
                    
                    <div class="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
                        <h3 class="text-white font-bold truncate text-lg drop-shadow-md">${name}</h3>
                        <p class="text-gray-400 text-sm truncate">${subText}</p>
                    </div>
                    
                    <button class="absolute top-2 right-2 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 fav-btn" title="Like">
                        <i class="far fa-heart"></i>
                    </button>
                    
                     <button class="absolute top-2 left-2 w-10 h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 add-btn" title="Add to Playlist">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            `;

            card.addEventListener('click', () => playSong(item));
            
            const favBtn = card.querySelector('.fav-btn');
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleLike(item);
                const icon = favBtn.querySelector('i');
                if (icon.classList.contains('far')) {
                    icon.classList.replace('far', 'fas');
                    icon.classList.add('text-red-500');
                } else {
                    icon.classList.replace('fas', 'far');
                    icon.classList.remove('text-red-500');
                }
            });

             const addBtn = card.querySelector('.add-btn');
             addBtn.addEventListener('click', (e) => {
                 e.stopPropagation();
                 addToPlaylist(item);
             });

            if (contentArea) contentArea.appendChild(card);
        } catch (err) {
            console.error(`Error rendering item ${idx}:`, item, err);
        }
    });
}

function createSongRow(item, contextPlaylistId = null, index) {
    const imgUrl = getImageUrl(item);
    const song = item.song || item;
    const author = item.author || { name: item.primaryArtists || '' };
    
    const durationStr = formatTime(song.duration);
    const trackUrl = song.url || item.url; 
    
    const isLiked = library.likedSongs.some(s => { const sUrl = s.song?.url || s.url; const sId = s.id; if (item.id && sId === item.id) return true; if (trackUrl && sUrl === trackUrl) return true; return false; });
    let uniqueId = item.id || trackUrl || (song.name + author.name);
    if (!uniqueId) uniqueId = 'unknown';
    const domId = btoa(String(uniqueId)).substring(0, 16).replace(/[/+=]/g, '');

    let actionBtnHtml = contextPlaylistId ? 
        `<button id="remove-${domId}" class="w-8 h-8 rounded-full border border-[#333] flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-500 transition-all" title="Remove"><i class="fas fa-minus"></i></button>` : 
        `<button id="add-${domId}" class="w-8 h-8 rounded-full border border-[#333] flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-all" title="Add"><i class="fas fa-plus"></i></button>`;

    return `<div id="row-${domId}" class="song-row flex items-center p-3 bg-[#111] hover:bg-[#1a1a1a] rounded-xl border border-[#252525] transition-colors gap-4 cursor-pointer"><img src="${imgUrl}" loading="lazy" class="w-12 h-12 rounded-lg object-cover"><div class="flex-grow overflow-hidden"><div class="text-white font-medium truncate">${song.name}</div><div class="text-gray-500 text-xs truncate">${author.name}</div></div><div class="flex items-center gap-3"><div class="text-gray-600 text-xs">${durationStr}</div>${actionBtnHtml}<button id="like-${domId}" class="w-8 h-8 rounded-full border border-[#333] flex items-center justify-center ${isLiked?'text-red-500 border-red-500':'text-gray-400 hover:text-white hover:border-white'} transition-all" title="${isLiked?'Unlike':'Like'}"><i class="${isLiked?'fas':'far'} fa-heart"></i></button><button id="play-${domId}" class="w-8 h-8 rounded-full border border-[#333] flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-all" title="Play"><i class="fas fa-play"></i></button></div></div>`;
}

// --- Other Helpers ---
async function downloadResource(url, filename) {
    // Add CORS proxy to the download fetch as well
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Network response was not ok");
        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        showToast("Download started!");
    } catch (error) {
        console.error("Download failed:", error);
        showToast("Download failed. Opening in new tab.");
        window.open(url, '_blank');
    }
}

function getImageUrl(item) {
    if (item.song && item.song.img) {
        let img = item.song.img.big || item.song.img.small;
        if (img.startsWith('/api/')) {
            return API_BASE + img;
        }
        return img;
    }
    if (item.image) {
        if (Array.isArray(item.image)) {
            return item.image[item.image.length - 1].link; 
        } else if (typeof item.image === 'string') {
            return item.image;
        }
    }
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQACAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
}

function formatTime(v) { if(typeof v==='object'&&v!==null){const s=v.hours*3600+v.minutes*60+v.seconds;return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;} const m=Math.floor(v/60)||0,s=Math.floor(v%60)||0; return `${m}:${s<10?'0':''}${s}`; }
function formatNumber(n) { if(n>=1e6)return(n/1e6).toFixed(1)+'M'; if(n>=1e3)return(n/1e3).toFixed(1)+'K'; return n; }
function showToast(m) { const d=document.createElement('div'); d.className='fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg text-sm z-50 animate-fade-in'; d.textContent=m; document.body.appendChild(d); setTimeout(()=>d.remove(),2000); }

async function openLyrics() {
    if (!currentTrack) return;

    lyricsOverlay.classList.add('active');
    lyricsTitle.textContent = currentTrack.name || currentTrack.song?.name || '';
    
    let artistName = currentTrack.primaryArtists || currentTrack.author?.name || '';
    let trackName = currentTrack.name || currentTrack.song?.name || '';

    const decodeHtml = (html) => { const txt = document.createElement("textarea"); txt.innerHTML = html; return txt.value; };
    artistName = decodeHtml(artistName);
    if (artistName.includes(',')) artistName = artistName.split(',')[0].trim();
    trackName = decodeHtml(trackName);
    trackName = trackName.replace(/\s*\(.*? (feat|ft|from|cover|remix).*?\)/gi, '');
    trackName = trackName.replace(/\s*\[.*?\]/gi, ''); 
    trackName = trackName.trim();

    lyricsArtist.textContent = artistName;
    lyricsText.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Loading...';

    const url = `${LYRICS_API_BASE}?title=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artistName)}`;

    try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.data && json.data.lyrics) {
            lyricsText.textContent = json.data.lyrics;
        } else {
            lyricsText.textContent = "Lyrics not found.";
        }
    } catch (e) {
        console.error(e);
        lyricsText.textContent = "Failed to load lyrics.";
    }
}

// Global Assignments
window.handleSearch = handleSearch;
window.showHome = showHome;
window.openLikedSongs = openLikedSongs;
window.openPlaylist = openPlaylist;
window.openLyrics = openLyrics;
window.addCurrentToPlaylist = addCurrentToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.toggleLike = toggleLike;
window.addToPlaylist = addToPlaylist; // Missing in previous turn
window.toggleMute = toggleMute;
window.toggleSettingsMenu = toggleSettingsMenu;
window.handleTransitionChange = handleTransitionChange;
window.triggerCoverUpload = triggerCoverUpload;
window.closeCropper = closeCropper;
window.submitCrop = submitCrop;
window.openCreatePlaylistModal = openCreatePlaylistModal;
window.confirmCreatePlaylist = confirmCreatePlaylist;
window.closeModals = closeModals;
window.openEditPlaylistModal = openEditPlaylistModal;
window.savePlaylistChanges = savePlaylistChanges;
window.deletePlaylist = deletePlaylist;
window.downloadResource = downloadResource;