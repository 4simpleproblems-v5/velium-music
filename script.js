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

// --- Helper: Get Active Player ---
function getActivePlayer() {
    return document.getElementById(activePlayerId);
}

function getInactivePlayer() {
    return document.getElementById(activePlayerId === 'audio-player' ? 'audio-player-2' : 'audio-player');
}

function updatePlayerLikeIcon() {
    if (!currentTrack) return;
    // playerLikeBtn might not be assigned if initApp hasn't run fully, but this fn is called by playSong
    // So we fetch it fresh if needed or rely on initApp
    const btn = playerLikeBtn || document.getElementById('player-like-btn');
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

window.toggleMute = function() {
    const player = getActivePlayer();
    if (!player) return;
    
    // We affect state, but apply to BOTH players to be safe/consistent
    if (lastVolume > 0 && player.volume > 0) {
        lastVolume = player.volume; // Save current
        setMasterVolume(0);
    } else {
        setMasterVolume(lastVolume || 1);
    }
    updateVolumeIcon();
};

function setMasterVolume(val) {
    const v = Math.max(0, Math.min(1, val));
    if (audioPlayer) audioPlayer.volume = v;
    if (audioPlayer2) audioPlayer2.volume = v;
    if (volumeSlider) volumeSlider.value = v;
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

// --- Actions (Removed duplicates) ---
// Functions moved to top level for scope visibility

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initApp);

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
    } else if (e.code === 'ArrowRight') {
        const p = getActivePlayer();
        if (p) p.currentTime += 10;
        showToast('Forward 10s');
    } else if (e.code === 'ArrowLeft') {
        const p = getActivePlayer();
        if (p) p.currentTime -= 10;
        showToast('Back 10s');
    } else if (e.key.toLowerCase() === 'f') {
        if (currentTrack) toggleLike(currentTrack);
    } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
    }
});

async function initApp() {
    try {
        console.log("Initializing Velium Music...");
        
        searchBox = document.getElementById('search-box');
        searchBtn = document.getElementById('search-btn');
        contentArea = document.getElementById('content-area');
        playerBar = document.getElementById('player-bar');
        audioPlayer = document.getElementById('audio-player');
        audioPlayer2 = document.getElementById('audio-player-2');
        playerImg = document.getElementById('player-img');
        playerTitle = document.getElementById('player-title');
        playerArtist = document.getElementById('player-artist');
        downloadBtn = document.getElementById('download-btn');
        playerLikeBtn = document.getElementById('player-like-btn');
        lyricsOverlay = document.getElementById('lyrics-overlay');
        closeLyricsBtn = document.getElementById('close-lyrics');
        lyricsTitle = document.getElementById('lyrics-title');
        lyricsArtist = document.getElementById('lyrics-artist');
        lyricsText = document.getElementById('lyrics-text');
        mainHeader = document.getElementById('main-header');
        libraryList = document.getElementById('library-list');
        createPlaylistBtn = document.getElementById('create-playlist-btn');
        playPauseBtn = document.getElementById('play-pause-btn');
        seekSlider = document.getElementById('seek-slider');
        currentTimeElem = document.getElementById('current-time');
        totalDurationElem = document.getElementById('total-duration');
        volumeSlider = document.getElementById('volume-slider');
        
        editPlaylistNameInput = document.getElementById('edit-playlist-name');
        playlistCoverInput = document.getElementById('playlist-cover-input');
        cropperCanvas = document.getElementById('cropperCanvas');

        // Settings Elements
        settingsDropdown = document.getElementById('settings-dropdown');
        transitionSelect = document.getElementById('transition-select');
        crossfadeSliderContainer = document.getElementById('crossfade-slider-container');
        crossfadeSlider = document.getElementById('crossfade-slider');
        crossfadeValue = document.getElementById('crossfade-value');

        // Restore Settings
        const savedCrossfade = localStorage.getItem('crossfadeConfig');
        if (savedCrossfade) {
            crossfadeConfig = JSON.parse(savedCrossfade);
            if (transitionSelect) transitionSelect.value = crossfadeConfig.enabled ? 'crossfade' : 'none';
            if (crossfadeSlider) crossfadeSlider.value = crossfadeConfig.duration;
            if (crossfadeValue) crossfadeValue.textContent = crossfadeConfig.duration + 's';
            if (crossfadeConfig.enabled && crossfadeSliderContainer) crossfadeSliderContainer.classList.remove('hidden');
            if (crossfadeConfig.enabled && crossfadeSliderContainer) crossfadeSliderContainer.style.display = 'flex';
        }

        // Event Listeners
        if (searchBtn) searchBtn.addEventListener('click', handleSearch);
        if (searchBox) searchBox.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(); });
        
        document.querySelectorAll('input[name="search-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                searchType = e.target.value;
                if (lastQuery) handleSearch();
            });
        });

        if (closeLyricsBtn) closeLyricsBtn.addEventListener('click', () => lyricsOverlay.classList.remove('active'));
        if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlay);
        if (playerLikeBtn) playerLikeBtn.addEventListener('click', () => { if (currentTrack) toggleLike(currentTrack); });

        // Setup Audio Listeners for BOTH players
        [audioPlayer, audioPlayer2].forEach(p => {
            if (!p) return;
            p.addEventListener('timeupdate', () => {
                if (p.id === activePlayerId) updateProgress();
            });
            p.addEventListener('loadedmetadata', () => {
                if (p.id === activePlayerId) {
                    if (totalDurationElem) totalDurationElem.textContent = formatTime(p.duration);
                    if (seekSlider) seekSlider.max = p.duration;
                }
            });
            p.addEventListener('ended', () => handleSongEnd(p));
            p.addEventListener('play', () => { if (p.id === activePlayerId) { isPlaying = true; updatePlayBtn(); } });
            p.addEventListener('pause', () => { 
                // Only mark as paused if it's the active player and we aren't crossfading
                if (p.id === activePlayerId && !isCrossfading) { isPlaying = false; updatePlayBtn(); } 
            });
        });

        if (seekSlider) {
            seekSlider.addEventListener('input', () => { 
                isDraggingSlider = true;
                if (currentTimeElem) currentTimeElem.textContent = formatTime(seekSlider.value);
            });
            seekSlider.addEventListener('change', () => {
                const p = getActivePlayer();
                if (p) p.currentTime = seekSlider.value;
                isDraggingSlider = false;
            });
        }
        
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => setMasterVolume(e.target.value));
        }

        if (playlistCoverInput) playlistCoverInput.addEventListener('change', handleImageUpload);
        
        if (cropperCanvas) {
            cropperCanvas.addEventListener('mousedown', e => handleCropStart(e.offsetX, e.offsetY));
            cropperCanvas.addEventListener('mousemove', e => handleCropMove(e.offsetX, e.offsetY));
            cropperCanvas.addEventListener('mouseup', handleCropEnd);
            cropperCanvas.addEventListener('mouseleave', handleCropEnd);
            cropperCanvas.addEventListener('wheel', handleCropScroll);
        }
        
        // Settings Listeners
        if (crossfadeSlider) {
            crossfadeSlider.addEventListener('input', (e) => {
                const val = e.target.value;
                crossfadeValue.textContent = val + 's';
                crossfadeConfig.duration = parseInt(val);
                saveSettings();
            });
        }

        await loadLibrary();
        renderLibrary();
        console.log("Initialization complete.");
    } catch (e) {
        console.error("Initialization failed:", e);
    }
}

function handleSongEnd(player) {
    if (player.id !== activePlayerId) return; // Ignore standby player ending
    
    // If not crossfading (normal end), play next
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
        // End of playlist
        console.log("End of playlist.");
    }
}

// --- Settings Logic ---
function toggleSettingsMenu() {
    if (settingsDropdown) settingsDropdown.classList.toggle('hidden');
};

function handleTransitionChange() {
    const val = transitionSelect.value;
    if (val === 'crossfade') {
        crossfadeConfig.enabled = true;
        crossfadeSliderContainer.classList.remove('hidden');
        crossfadeSliderContainer.style.display = 'flex';
    } else {
        crossfadeConfig.enabled = false;
        crossfadeSliderContainer.classList.add('hidden');
        crossfadeSliderContainer.style.display = 'none';
    }
    saveSettings();
};

function saveSettings() {
    localStorage.setItem('crossfadeConfig', JSON.stringify(crossfadeConfig));
}

// Close dropdown on click outside
document.addEventListener('click', (e) => {
    if (settingsDropdown && !settingsDropdown.classList.contains('hidden')) {
        const btn = document.getElementById('settings-btn');
        if (btn && !btn.contains(e.target) && !settingsDropdown.contains(e.target)) {
            settingsDropdown.classList.add('hidden');
        }
    }
});

// --- Library Logic ---
async function loadLibrary() { if (window.VeliumDB) { try { library = await window.VeliumDB.getLibrary(); if (!library.likedSongs) library.likedSongs = []; if (!library.playlists) library.playlists = []; } catch (e) { console.error("DB Load failed", e); } } else { const stored = localStorage.getItem('velium_library'); if (stored) library = JSON.parse(stored); } }
async function saveLibrary() { if (window.VeliumDB) { await window.VeliumDB.saveLibrary(library); } else { localStorage.setItem('velium_library', JSON.stringify(library)); } }

// --- Modals & UI ---
function openCreatePlaylistModal() { const m = document.getElementById('create-playlist-modal'); const i = document.getElementById('new-playlist-name'); if(i)i.value=''; if(m){m.classList.add('active');if(i)i.focus();} };
async function confirmCreatePlaylist() { const i = document.getElementById('new-playlist-name'); const n = i?i.value.trim():''; if(n){ library.playlists.push({id:'pl-'+Date.now(),name:n,songs:[],cover:null,updatedAt:new Date().toISOString()}); await saveLibrary(); renderLibrary(); closeModals(); showToast(`Created "${n}"`); } };
function closeModals() { document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active')); itemToAdd = null; currentPlaylistId = null; };
function openEditPlaylistModal() { if(!currentPlaylistId)return; const p=library.playlists.find(x=>x.id===currentPlaylistId); if(!p)return; const m=document.getElementById('edit-playlist-modal'); if(editPlaylistNameInput)editPlaylistNameInput.value=p.name; if(m)m.classList.add('active'); };
async function savePlaylistChanges() { if(!currentPlaylistId)return; const i=library.playlists.findIndex(p=>p.id===currentPlaylistId); if(i===-1)return; const n=editPlaylistNameInput.value.trim(); if(n){ library.playlists[i].name=n; library.playlists[i].updatedAt=new Date().toISOString(); await saveLibrary(); renderLibrary(); openPlaylist(currentPlaylistId); closeModals(); showToast("Playlist updated"); } };
async function deletePlaylist() { if(!currentPlaylistId)return; if(confirm("Delete playlist?")){ library.playlists=library.playlists.filter(p=>p.id!==currentPlaylistId); await saveLibrary(); renderLibrary(); closeModals(); showHome(); showToast("Deleted"); } };
function triggerCoverUpload() { if(playlistCoverInput) playlistCoverInput.click(); };

// --- Cropper Logic ---
function handleImageUpload(e) { const f=e.target.files[0]; if(!f)return; if(f.size>2e6){alert('File too large');return;} const r=new FileReader(); r.onload=v=>{cropperImage=new Image();cropperImage.onload=initCropper;cropperImage.src=v.target.result;}; r.readAsDataURL(f); }
function initCropper() { const m=document.getElementById('cropper-modal'); const s=400/cropperImage.height; cropperCanvas.height=400; cropperCanvas.width=cropperImage.width*s; cropState={x:cropperCanvas.width/2,y:cropperCanvas.height/2,radius:Math.min(cropperCanvas.width,cropperCanvas.height)/3}; m.classList.add('active'); requestAnimationFrame(drawCropper); }
function closeCropper() { document.getElementById('cropper-modal').classList.remove('active'); if(playlistCoverInput)playlistCoverInput.value=''; };
const drawCropper=()=>{if(!cropperImage)return;const c=cropperCanvas.getContext('2d'),w=cropperCanvas.width,h=cropperCanvas.height;c.clearRect(0,0,w,h);c.drawImage(cropperImage,0,0,w,h);c.fillStyle='rgba(0,0,0,0.7)';c.beginPath();c.rect(0,0,w,h);c.arc(cropState.x,cropState.y,cropState.radius,0,2*Math.PI,true);c.fill();c.strokeStyle='#fff';c.lineWidth=2;c.setLineDash([6,4]);c.beginPath();c.arc(cropState.x,cropState.y,cropState.radius,0,2*Math.PI);c.stroke();c.setLineDash([]);};
const handleCropStart=(x,y)=>{if((x-cropState.x)**2+(y-cropState.y)**2<cropState.radius**2){isDraggingCrop=true;dragStart={x,y};}};
const handleCropMove=(x,y)=>{if(isDraggingCrop){let nx=cropState.x+(x-dragStart.x),ny=cropState.y+(y-dragStart.y),r=cropState.radius,w=cropperCanvas.width,h=cropperCanvas.height;cropState.x=Math.max(r,Math.min(nx,w-r));cropState.y=Math.max(r,Math.min(ny,h-r));dragStart={x,y};requestAnimationFrame(drawCropper);}};
const handleCropEnd=()=>{isDraggingCrop=false;};
const handleCropScroll=(e)=>{e.preventDefault();let nr=cropState.radius+(e.deltaY>0?-5:5),w=cropperCanvas.width,h=cropperCanvas.height;cropState.radius=Math.max(20,Math.min(nr,Math.min(w,h)/2));requestAnimationFrame(drawCropper);};
async function submitCrop() { const c=document.createElement('canvas'),s=300;c.width=s;c.height=s;const t=c.getContext('2d'),sc=cropperCanvas.height/cropperImage.height;t.drawImage(cropperImage,(cropState.x-cropState.radius)/sc,(cropState.y-cropState.radius)/sc,(cropState.radius*2)/sc,(cropState.radius*2)/sc,0,0,s,s);const b=c.toDataURL('image/jpeg',0.8); if(currentPlaylistId){const i=library.playlists.findIndex(p=>p.id===currentPlaylistId);if(i!==-1){library.playlists[i].cover=b;library.playlists[i].updatedAt=new Date().toISOString();await saveLibrary();renderLibrary();openPlaylist(currentPlaylistId);}} closeCropper(); };

// --- Navigation ---
function showHome() { closeLibraryDrawer(); currentPlaylistId = null; mainHeader.textContent="Home"; contentArea.className=GRID_CLASS; contentArea.innerHTML=`<div class="col-span-full flex flex-col items-center justify-center text-gray-500 mt-20 opacity-50"><i class="fas fa-compact-disc text-6xl mb-4"></i><p class="text-xl">Search to start listening.</p></div>`; };
function closeLibraryDrawer() { const d=document.getElementById('library-drawer'); if(d)d.classList.add('translate-x-full'); }

// --- Core Logic Refactor ---

function getDownloadUrl(item) {
    if (item.downloadUrl) {
        if (Array.isArray(item.downloadUrl)) {
            const best = item.downloadUrl.find(d => d.quality === '320kbps') || item.downloadUrl[item.downloadUrl.length - 1];
            return best.link;
        } else return item.downloadUrl;
    }
    const possibleUrl = item.song?.url || item.url;
    if (possibleUrl) {
        if (typeof possibleUrl === 'string' && (possibleUrl.includes('saavncdn.com') || possibleUrl.match(/\.(mp3|mp4|m4a)$/i))) return possibleUrl;
        if (Array.isArray(possibleUrl)) {
            const best = possibleUrl.find(d => d.quality === '320kbps') || possibleUrl[possibleUrl.length - 1];
            return best.link;
        }
        return `${API_BASE}/api/download?track_url=${encodeURIComponent(possibleUrl)}`;
    }
    return '';
}

function playSong(item, index = -1, queue = []) {
    const active = getActivePlayer();
    const inactive = getInactivePlayer();
    
    // Stop any existing crossfade interval
    if (crossfadeInterval) clearInterval(crossfadeInterval);
    isCrossfading = false;
    
    // Immediate stop of previous fade artifacts
    if (inactive) {
        inactive.pause();
        inactive.currentTime = 0;
    }

    currentTrack = item;
    
    // Setup Queue
    if (index > -1 && queue.length > 0) {
        playQueue = queue;
        queueIndex = index;
    } else {
        // Playing single song clears queue context usually, but let's keep it robust
        playQueue = [item];
        queueIndex = 0;
    }

    const imgUrl = getImageUrl(item);
    const songName = item.song?.name || item.name || 'Unknown';
    const artistName = item.author?.name || item.primaryArtists || '';
    const downloadUrl = getDownloadUrl(item);

    console.log(`Playing: ${songName} on ${activePlayerId}`);

    // Update UI
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

    // Play
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

// --- Crossfade Logic ---
function updateProgress() {
    const active = getActivePlayer();
    if (!active) return;
    
    const { currentTime, duration } = active;
    if (isNaN(duration)) return;
    
    if (seekSlider && !isDraggingSlider) seekSlider.value = currentTime;
    if (currentTimeElem && !isDraggingSlider) currentTimeElem.textContent = formatTime(currentTime);

    // Crossfade Trigger
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
    // Swap IDs for logical active player
    activePlayerId = activePlayerId === 'audio-player' ? 'audio-player-2' : 'audio-player';
    const incoming = getActivePlayer();

    // Prepare Incoming
    const downloadUrl = getDownloadUrl(nextItem);
    incoming.src = downloadUrl;
    incoming.volume = 0; // Start silent
    incoming.play().catch(e => console.error("Crossfade play error", e));

    // UI Update for Next Song (Metadata switches immediately for better UX)
    currentTrack = nextItem;
    queueIndex++;
    
    const imgUrl = getImageUrl(nextItem);
    const songName = nextItem.song?.name || nextItem.name || 'Unknown';
    const artistName = nextItem.author?.name || nextItem.primaryArtists || '';
    
    if (playerTitle) playerTitle.textContent = songName;
    if (playerArtist) playerArtist.textContent = artistName;
    if (playerImg) playerImg.src = imgUrl;
    updatePlayerLikeIcon();

    // Fade Loop
    const stepTime = 100; // ms
    const steps = (crossfadeConfig.duration * 1000) / stepTime;
    const volStep = (lastVolume || 1) / steps; 
    let stepCount = 0;

    crossfadeInterval = setInterval(() => {
        stepCount++;
        
        // Fade Out
        if (outgoing.volume > volStep) outgoing.volume -= volStep;
        else outgoing.volume = 0;

        // Fade In
        const targetVol = lastVolume || 1;
        if (incoming.volume < targetVol - volStep) incoming.volume += volStep;
        else incoming.volume = targetVol;

        if (stepCount >= steps) {
            clearInterval(crossfadeInterval);
            isCrossfading = false;
            outgoing.pause();
            outgoing.currentTime = 0;
            outgoing.volume = targetVol; // Reset for reuse
            incoming.volume = targetVol;
            console.log("Crossfade Complete");
        }
    }, stepTime);
}

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

// --- List UI ---
function openLikedSongs() {
    closeLibraryDrawer();
    currentPlaylistId = null;
    mainHeader.textContent = "Liked Songs";
    contentArea.className = ''; 
    let html = `<div class="artist-header"><div class="w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-4xl shadow-lg"><i class="fas fa-heart"></i></div><div class="artist-info"><p>${library.likedSongs.length} song${library.likedSongs.length!==1?'s':''}</p></div></div><div class="song-list mt-8">${library.likedSongs.map((item, idx) => createSongRow(item, null, idx)).join('')}</div>`;
    if (library.likedSongs.length === 0) html += `<div class="text-center text-gray-500 mt-10">You haven't liked any songs yet.</div>`;
    contentArea.innerHTML = html;
    attachListEvents(library.likedSongs, null, library.likedSongs);
};

function openPlaylist(playlistId) {
    closeLibraryDrawer();
    currentPlaylistId = playlistId;
    const pl = library.playlists.find(p => p.id === playlistId);
    if (!pl) return;
    mainHeader.textContent = pl.name;
    contentArea.className = '';
    const lastUpdated = new Date(pl.updatedAt).toLocaleDateString();
    let coverHtml = pl.cover ? `<img src="${pl.cover}" class="w-32 h-32 rounded-lg object-cover shadow-lg border border-[#333]">` : `<div class="w-32 h-32 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center text-white text-4xl shadow-lg"><i class="fas fa-music"></i></div>`;
    let html = `<div class="artist-header relative group">${coverHtml}<div class="artist-info"><h2>${pl.name}</h2><p>${pl.songs.length} song${pl.songs.length!==1?'s':''} • Updated: ${lastUpdated}</p><button onclick="openEditPlaylistModal()" class="btn-toolbar-style mt-4"><i class="fas fa-pen"></i> Edit Playlist</button></div></div><div class="song-list mt-8">${pl.songs.map((item, idx) => createSongRow(item, playlistId, idx)).join('')}</div>`;
    if (pl.songs.length === 0) html += `<div class="text-center text-gray-500 mt-10">This playlist is empty.</div>`;
    contentArea.innerHTML = html;
    attachListEvents(pl.songs, playlistId, pl.songs);
};

function renderLibrary() {
    if (!libraryList) return;
    libraryList.innerHTML = '';

    // Liked Songs Item
    const likedDiv = document.createElement('div');
    likedDiv.className = 'compact-list-item flex items-center gap-2 p-2';
    
    let coverUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    if (library.likedSongs.length > 0) {
        const first = library.likedSongs[0];
        coverUrl = getImageUrl(first);
    }
    
    likedDiv.innerHTML = `
        <img src="${coverUrl}" class="w-10 h-10 rounded object-cover">
        <div class="flex-grow overflow-hidden">
            <div class="text-sm text-white truncate">Liked Songs</div>
            <div class="text-xs text-gray-500">${library.likedSongs.length} songs</div>
        </div>
    `;
    likedDiv.onclick = () => {
        openLikedSongs();
        closeLibraryDrawer();
    };
    libraryList.appendChild(likedDiv);

    // Playlists
    library.playlists.forEach(pl => {
        const div = document.createElement('div');
        div.className = 'compact-list-item flex items-center gap-2 p-2';
        
        let plCover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQACAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        if (pl.cover) {
            plCover = pl.cover;
        } else if (pl.songs.length > 0) {
             plCover = getImageUrl(pl.songs[0]);
        }

        div.innerHTML = `
            <img src="${plCover}" class="w-10 h-10 rounded object-cover">
            <div class="flex-grow overflow-hidden">
                <div class="text-sm text-white truncate">${pl.name}</div>
                <div class="text-xs text-gray-500">${pl.songs.length} songs</div>
            </div>
        `;
        div.onclick = () => {
            openPlaylist(pl.id);
            closeLibraryDrawer();
        };
        libraryList.appendChild(div);
    });
}

function attachListEvents(items, contextPlaylistId = null, listContext = []) {
    items.forEach((item, index) => {
        const song = item.song || item;
        const author = item.author || { name: item.primaryArtists || '' };
        const trackUrl = song.url || item.url;
        let uniqueId = item.id || trackUrl || (song.name + author.name);
        if (!uniqueId) uniqueId = 'unknown';
        const domId = btoa(String(uniqueId)).substring(0, 16).replace(/[/+=]/g, '');

        const row = document.getElementById(`row-${domId}`);
        const btn = document.getElementById(`play-${domId}`);
        const likeBtn = document.getElementById(`like-${domId}`);
        
        const playHandler = () => playSong(item, index, listContext);

        if (row) row.addEventListener('click', playHandler);
        if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); playHandler(); });
        if (likeBtn) likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(item); });

        if (contextPlaylistId) {
            const removeBtn = document.getElementById(`remove-${domId}`);
            if (removeBtn) removeBtn.addEventListener('click', (e) => { e.stopPropagation(); removeFromPlaylist(contextPlaylistId, item.id, trackUrl); });
        } else {
            const addBtn = document.getElementById(`add-${domId}`);
            if (addBtn) addBtn.addEventListener('click', (e) => { e.stopPropagation(); addToPlaylist(item); });
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

// Helpers
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

function togglePlay() { const p = getActivePlayer(); if(p && p.paused) p.play(); else if(p) p.pause(); }
function updatePlayBtn() { if(playPauseBtn) playPauseBtn.innerHTML = isPlaying ? '<i class="fas fa-pause-circle"></i>' : '<i class="fas fa-play-circle"></i>'; }
function getImageUrl(item) { if(item.song&&item.song.img){let i=item.song.img.big||item.song.img.small;return i.startsWith('/api/')?API_BASE+i:i;} if(item.image){if(Array.isArray(item.image))return item.image[item.image.length-1].link;else if(typeof item.image==='string')return item.image;} return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQACAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; }
function formatTime(v) { if(typeof v==='object'&&v!==null){const s=v.hours*3600+v.minutes*60+v.seconds;return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;} const m=Math.floor(v/60)||0,s=Math.floor(v%60)||0; return `${m}:${s<10?'0':''}${s}`; }
function formatNumber(n) { if(n>=1e6)return(n/1e6).toFixed(1)+'M'; if(n>=1e3)return(n/1e3).toFixed(1)+'K'; return n; }
function showToast(m) { const d=document.createElement('div'); d.className='fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg text-sm z-50 animate-fade-in'; d.textContent=m; document.body.appendChild(d); setTimeout(()=>d.remove(),2000); }
window.downloadResource = downloadResource; 
async function downloadResource(url, filename) { try { const r=await fetch(url); if(!r.ok)throw new Error("Network"); const b=await r.blob(); const l=document.createElement("a"); l.href=URL.createObjectURL(b); l.download=filename; document.body.appendChild(l); l.click(); document.body.removeChild(l); URL.revokeObjectURL(l.href); showToast("Download started!"); } catch(e) { console.error(e); showToast("Opening in new tab"); window.open(url, '_blank'); } }

// Expose Globals for HTML onclick attributes
window.handleSearch = handleSearch;
window.showHome = showHome;
window.openLikedSongs = openLikedSongs;
window.openPlaylist = openPlaylist;
window.openLyrics = openLyrics;
window.addCurrentToPlaylist = addCurrentToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.toggleLike = toggleLike;
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
