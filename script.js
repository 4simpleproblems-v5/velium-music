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
let searchBox, searchBtn, contentArea, playerBar, audioPlayer, playerImg, playerTitle, playerArtist;
let downloadBtn, playerLikeBtn, lyricsOverlay, closeLyricsBtn, lyricsTitle, lyricsArtist, lyricsText;
let mainHeader, libraryList, createPlaylistBtn, playPauseBtn, seekSlider, currentTimeElem;
let totalDurationElem, volumeSlider;
// New DOM Elements
let editPlaylistNameInput, playlistCoverInput, cropperCanvas;

const GRID_CLASS = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6';

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    try {
        console.log("Initializing Velium Music...");
        
        // Assign DOM Elements
        searchBox = document.getElementById('search-box');
        searchBtn = document.getElementById('search-btn');
        contentArea = document.getElementById('content-area');
        playerBar = document.getElementById('player-bar');
        audioPlayer = document.getElementById('audio-player');
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

        if (audioPlayer) {
            audioPlayer.addEventListener('timeupdate', updateProgress);
            audioPlayer.addEventListener('loadedmetadata', () => {
                if (totalDurationElem) totalDurationElem.textContent = formatTime(audioPlayer.duration);
                if (seekSlider) seekSlider.max = audioPlayer.duration; 
            });
            audioPlayer.addEventListener('ended', () => {
                isPlaying = false;
                updatePlayBtn();
                if (seekSlider) seekSlider.value = 0;
            });
            audioPlayer.addEventListener('play', () => { isPlaying = true; updatePlayBtn(); });
            audioPlayer.addEventListener('pause', () => { isPlaying = false; updatePlayBtn(); });
        }

        if (seekSlider) {
            seekSlider.addEventListener('input', () => { 
                isDraggingSlider = true;
                if (currentTimeElem) currentTimeElem.textContent = formatTime(seekSlider.value);
            });
            seekSlider.addEventListener('change', () => {
                if (audioPlayer) audioPlayer.currentTime = seekSlider.value;
                isDraggingSlider = false;
            });
        }
        
        if (volumeSlider) volumeSlider.addEventListener('input', (e) => { if (audioPlayer) audioPlayer.volume = e.target.value; });

        // Cropper Image Input
        if (playlistCoverInput) {
            playlistCoverInput.addEventListener('change', handleImageUpload);
        }
        
        // Cropper Interaction
        if (cropperCanvas) {
            cropperCanvas.addEventListener('mousedown', e => handleCropStart(e.offsetX, e.offsetY));
            cropperCanvas.addEventListener('mousemove', e => handleCropMove(e.offsetX, e.offsetY));
            cropperCanvas.addEventListener('mouseup', handleCropEnd);
            cropperCanvas.addEventListener('mouseleave', handleCropEnd);
            cropperCanvas.addEventListener('wheel', handleCropScroll);
        }

        // Load Data
        await loadLibrary();
        renderLibrary();
        
        console.log("Initialization complete.");
    } catch (e) {
        console.error("Initialization failed:", e);
    }
}

// --- Library Logic ---
async function loadLibrary() {
    if (window.VeliumDB) {
        try {
            library = await window.VeliumDB.getLibrary();
            if (!library.likedSongs) library.likedSongs = [];
            if (!library.playlists) library.playlists = [];
        } catch (e) {
            console.error("DB Load failed", e);
        }
    } else {
        const stored = localStorage.getItem('velium_library');
        if (stored) library = JSON.parse(stored);
    }
}

async function saveLibrary() {
    if (window.VeliumDB) {
        await window.VeliumDB.saveLibrary(library);
    } else {
        localStorage.setItem('velium_library', JSON.stringify(library));
    }
}

// --- Modals & UI ---
window.openCreatePlaylistModal = function() {
    const modal = document.getElementById('create-playlist-modal');
    const input = document.getElementById('new-playlist-name');
    if (input) input.value = '';
    if (modal) {
        modal.classList.add('active');
        if (input) input.focus();
    }
};

window.confirmCreatePlaylist = async function() {
    const input = document.getElementById('new-playlist-name');
    const name = input ? input.value.trim() : '';
    if (name) {
        const newPlaylist = {
            id: 'pl-' + Date.now(),
            name: name,
            songs: [],
            cover: null, 
            updatedAt: new Date().toISOString()
        };
        library.playlists.push(newPlaylist);
        await saveLibrary();
        renderLibrary();
        closeModals();
        showToast(`Created "${name}"`);
    }
};

window.closeModals = function() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.remove('active'));
    itemToAdd = null;
    currentPlaylistId = null;
};

// --- Playlist Editing ---
window.openEditPlaylistModal = function() {
    if (!currentPlaylistId) return;
    const pl = library.playlists.find(p => p.id === currentPlaylistId);
    if (!pl) return;

    const modal = document.getElementById('edit-playlist-modal');
    if (editPlaylistNameInput) editPlaylistNameInput.value = pl.name;
    
    if (modal) modal.classList.add('active');
};

window.savePlaylistChanges = async function() {
    if (!currentPlaylistId) return;
    const plIndex = library.playlists.findIndex(p => p.id === currentPlaylistId);
    if (plIndex === -1) return;

    const newName = editPlaylistNameInput.value.trim();
    if (newName) {
        library.playlists[plIndex].name = newName;
        library.playlists[plIndex].updatedAt = new Date().toISOString();
        await saveLibrary();
        renderLibrary();
        openPlaylist(currentPlaylistId); 
        closeModals();
        showToast("Playlist updated");
    }
};

window.deletePlaylist = async function() {
    if (!currentPlaylistId) return;
    if (confirm("Are you sure you want to delete this playlist?")) {
        library.playlists = library.playlists.filter(p => p.id !== currentPlaylistId);
        await saveLibrary();
        renderLibrary();
        closeModals();
        showHome();
        showToast("Playlist deleted");
    }
};

window.triggerCoverUpload = function() {
    if (playlistCoverInput) playlistCoverInput.click();
};

// --- Cropper Logic ---
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        alert('File too large (max 2MB).');
        return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
        cropperImage = new Image();
        cropperImage.onload = () => {
            initCropper();
        };
        cropperImage.src = evt.target.result;
    };
    reader.readAsDataURL(file);
}

function initCropper() {
    const modal = document.getElementById('cropper-modal');
    const fixedHeight = 400;
    const scale = fixedHeight / cropperImage.height;
    cropperCanvas.height = fixedHeight;
    cropperCanvas.width = cropperImage.width * scale;
    
    cropState = {
        x: cropperCanvas.width / 2,
        y: cropperCanvas.height / 2,
        radius: Math.min(cropperCanvas.width, cropperCanvas.height) / 3
    };
    
    modal.classList.add('active');
    requestAnimationFrame(drawCropper);
}

window.closeCropper = function() {
    document.getElementById('cropper-modal').classList.remove('active');
    if (playlistCoverInput) playlistCoverInput.value = '';
};

const drawCropper = () => {
    if (!cropperImage) return;
    const ctx = cropperCanvas.getContext('2d');
    const w = cropperCanvas.width;
    const h = cropperCanvas.height;
    ctx.clearRect(0, 0, w, h);
    
    ctx.drawImage(cropperImage, 0, 0, w, h);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cropState.x, cropState.y, cropState.radius, 0, 2 * Math.PI, true);
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cropState.x, cropState.y, cropState.radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
};

const handleCropStart = (x, y) => {
    const dx = x - cropState.x;
    const dy = y - cropState.y;
    if (dx*dx + dy*dy < cropState.radius * cropState.radius) {
        isDraggingCrop = true;
        dragStart = { x, y };
    }
};

const handleCropMove = (x, y) => {
    if (isDraggingCrop) {
        const dx = x - dragStart.x;
        const dy = y - dragStart.y;
        
        let newX = cropState.x + dx;
        let newY = cropState.y + dy;
        
        const r = cropState.radius;
        const w = cropperCanvas.width;
        const h = cropperCanvas.height;
        
        newX = Math.max(r, Math.min(newX, w - r));
        newY = Math.max(r, Math.min(newY, h - r));
        
        cropState.x = newX;
        cropState.y = newY;
        
        dragStart = { x, y };
        requestAnimationFrame(drawCropper);
    }
};

const handleCropEnd = () => { isDraggingCrop = false; };

const handleCropScroll = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5;
    let newRadius = cropState.radius + delta;
    const w = cropperCanvas.width;
    const h = cropperCanvas.height;
    const maxPossibleRadius = Math.min(w, h) / 2;
    newRadius = Math.max(20, Math.min(newRadius, maxPossibleRadius));
    
    cropState.radius = newRadius;
    const r = newRadius;
    cropState.x = Math.max(r, Math.min(cropState.x, w - r));
    cropState.y = Math.max(r, Math.min(cropState.y, h - r));
    
    requestAnimationFrame(drawCropper);
};

window.submitCrop = async function() {
    const tempCanvas = document.createElement('canvas');
    const size = 300; 
    tempCanvas.width = size;
    tempCanvas.height = size;
    const tCtx = tempCanvas.getContext('2d');
    
    const scale = cropperCanvas.height / cropperImage.height;
    const sourceX = (cropState.x - cropState.radius) / scale;
    const sourceY = (cropState.y - cropState.radius) / scale;
    const sourceSize = (cropState.radius * 2) / scale;
    
    tCtx.drawImage(cropperImage, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    const base64 = tempCanvas.toDataURL('image/jpeg', 0.8);
    
    if (currentPlaylistId) {
        const plIndex = library.playlists.findIndex(p => p.id === currentPlaylistId);
        if (plIndex !== -1) {
            library.playlists[plIndex].cover = base64;
            library.playlists[plIndex].updatedAt = new Date().toISOString();
            await saveLibrary();
            renderLibrary();
            openPlaylist(currentPlaylistId);
        }
    }
    
    closeCropper();
};

// --- Navigation ---
window.showHome = function() {
    closeLibraryDrawer();
    currentPlaylistId = null;
    mainHeader.textContent = "Home";
    contentArea.className = GRID_CLASS;
    contentArea.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center text-gray-500 mt-20 opacity-50">
            <i class="fas fa-compact-disc text-6xl mb-4"></i>
            <p class="text-xl">Search to start listening.</p>
        </div>
    `;
};

function closeLibraryDrawer() {
    const drawer = document.getElementById('library-drawer');
    if (drawer) drawer.classList.add('translate-x-full');
}

window.handleSearch = async function() {
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
};

window.openLikedSongs = function() {
    closeLibraryDrawer();
    currentPlaylistId = null;
    mainHeader.textContent = "Liked Songs";
    contentArea.className = ''; 
    
    let html = `
        <div class="artist-header">
            <div class="w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-4xl shadow-lg">
                <i class="fas fa-heart"></i>
            </div>
            <div class="artist-info">
                <h2>Liked Songs</h2>
                <p>${library.likedSongs.length} songs</p>
            </div>
        </div>
        <div class="song-list">
            ${library.likedSongs.map(item => createSongRow(item)).join('')}
        </div>
    `;
    
    if (library.likedSongs.length === 0) {
        html += `<div class="text-center text-gray-500 mt-10">You haven't liked any songs yet.</div>`;
    }

    contentArea.innerHTML = html;
    attachListEvents(library.likedSongs);
};

window.openPlaylist = function(playlistId) {
    closeLibraryDrawer();
    currentPlaylistId = playlistId;
    const pl = library.playlists.find(p => p.id === playlistId);
    if (!pl) return;

    mainHeader.textContent = pl.name;
    contentArea.className = '';

    const lastUpdated = new Date(pl.updatedAt).toLocaleDateString();
    
    // Determine cover
    let coverHtml = '';
    if (pl.cover) {
        coverHtml = `<img src="${pl.cover}" class="w-32 h-32 rounded-lg object-cover shadow-lg border border-[#333]">`;
    } else {
        coverHtml = `
            <div class="w-32 h-32 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center text-white text-4xl shadow-lg">
                <i class="fas fa-music"></i>
            </div>
        `;
    }

    let html = `
        <div class="artist-header relative group">
            ${coverHtml}
            <div class="artist-info">
                <h2>${pl.name}</h2>
                <p>${pl.songs.length} songs • Updated: ${lastUpdated}</p>
                <button onclick="openEditPlaylistModal()" class="btn-toolbar-style mt-4">
                    <i class="fas fa-pen"></i> Edit Playlist
                </button>
            </div>
        </div>
        <div class="song-list">
            ${pl.songs.map(item => createSongRow(item, playlistId)).join('')}
        </div>
    `;

    if (pl.songs.length === 0) {
        html += `<div class="text-center text-gray-500 mt-10">This playlist is empty.</div>`;
    }

    contentArea.innerHTML = html;
    attachListEvents(pl.songs, playlistId);
};

window.openLyrics = async function() {
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
};

window.addCurrentToPlaylist = function() {
    if (currentTrack) addToPlaylist(currentTrack);
};

window.removeFromPlaylist = async function(playlistId, songId, songUrl) {
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
};

// --- Actions ---
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
    
    if (mainHeader.textContent === "Liked Songs") {
        openLikedSongs();
    }
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

function updatePlayerLikeIcon() {
    if (!currentTrack || !playerLikeBtn) return;
    const trackUrl = currentTrack.song?.url || currentTrack.url;
    const isLiked = library.likedSongs.some(s => {
        const sUrl = s.song?.url || s.url;
        const sId = s.id;
        if (currentTrack.id && sId === currentTrack.id) return true;
        if (trackUrl && sUrl === trackUrl) return true;
        return false;
    });
    playerLikeBtn.innerHTML = isLiked ? '<i class="fas fa-heart text-red-500"></i>' : '<i class="far fa-heart"></i>';
}

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

function attachListEvents(items, contextPlaylistId = null) {
    items.forEach(item => {
        const song = item.song || item;
        const author = item.author || { name: item.primaryArtists || '' };
        const trackUrl = song.url || item.url;
        let uniqueId = item.id || trackUrl || (song.name + author.name);
        if (!uniqueId) uniqueId = 'unknown-' + Math.random();
        const domId = btoa(String(uniqueId)).substring(0, 16).replace(/[/+=]/g, '');

        const row = document.getElementById(`row-${domId}`);
        const btn = document.getElementById(`play-${domId}`);
        const likeBtn = document.getElementById(`like-${domId}`);
        
        if (row) row.addEventListener('click', () => playSong(item));
        if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); playSong(item); });
        if (likeBtn) likeBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(item); });

        if (contextPlaylistId) {
            const removeBtn = document.getElementById(`remove-${domId}`);
            if (removeBtn) {
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeFromPlaylist(contextPlaylistId, item.id, trackUrl);
                });
            }
        } else {
            const addBtn = document.getElementById(`add-${domId}`);
            if (addBtn) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addToPlaylist(item);
                });
            }
        }
    });
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
                    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80"></div>
                    
                    <div class="absolute bottom-0 left-0 right-0 p-4">
                        <h3 class="text-white font-bold truncate text-lg drop-shadow-md">${name}</h3>
                        <p class="text-gray-400 text-sm truncate">${subText}</p>
                    </div>

                    <button class="play-overlay-btn absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30 backdrop-blur-sm">
                        <i class="fas fa-play text-4xl text-white drop-shadow-xl hover:scale-110 transition-transform"></i>
                    </button>
                    
                    <button class="absolute top-2 right-2 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 fav-btn" title="Like">
                        <i class="far fa-heart"></i>
                    </button>
                    
                     <button class="absolute top-2 left-2 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 add-btn" title="Add to Playlist">
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

function createSongRow(item, contextPlaylistId = null) {
    const imgUrl = getImageUrl(item);
    const song = item.song || item;
    const author = item.author || { name: item.primaryArtists || '' };
    
    const durationStr = formatTime(song.duration);
    const trackUrl = song.url || item.url; 
    
    const isLiked = library.likedSongs.some(s => {
        const sUrl = s.song?.url || s.url;
        const sId = s.id;
        if (item.id && sId === item.id) return true;
        if (trackUrl && sUrl === trackUrl) return true;
        return false;
    });
    
    let uniqueId = item.id || trackUrl || (song.name + author.name);
    if (!uniqueId) uniqueId = 'unknown-' + Math.random();
    const domId = btoa(String(uniqueId)).substring(0, 16).replace(/[/+=]/g, '');

    let actionBtnHtml = '';
    if (contextPlaylistId) {
        actionBtnHtml = `
            <button id="remove-${domId}" class="w-8 h-8 rounded-full border border-[#333] flex items-center justify-center text-gray-400 hover:text-red-500 hover:border-red-500 transition-all" title="Remove from Playlist">
                <i class="fas fa-minus"></i>
            </button>
        `;
    } else {
        actionBtnHtml = `
            <button id="add-${domId}" class="w-8 h-8 rounded-full border border-[#333] flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-all" title="Add to Playlist">
                <i class="fas fa-plus"></i>
            </button>
        `;
    }

    return `
        <div id="row-${domId}" class="song-row flex items-center p-3 bg-[#111] hover:bg-[#1a1a1a] rounded-xl border border-[#252525] transition-colors gap-4 cursor-pointer">
            <img src="${imgUrl}" loading="lazy" class="w-12 h-12 rounded-lg object-cover">
            <div class="flex-grow overflow-hidden">
                <div class="text-white font-medium truncate">${song.name}</div>
                <div class="text-gray-500 text-xs truncate">${author.name}</div>
            </div>
            <div class="flex items-center gap-3">
                 <div class="text-gray-600 text-xs">${durationStr}</div>
                 ${actionBtnHtml}
                 <button id="like-${domId}" class="w-8 h-8 rounded-full border border-[#333] flex items-center justify-center ${isLiked ? 'text-red-500 border-red-500' : 'text-gray-400 hover:text-white hover:border-white'} transition-all" title="${isLiked ? 'Unlike' : 'Like'}">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                 </button>
                <button id="play-${domId}" class="w-8 h-8 rounded-full border border-[#333] flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-all" title="Play">
                    <i class="fas fa-play"></i>
                </button>
            </div>
        </div>
    `;
}

function playSong(item) {
    currentTrack = item;
    
    const imgUrl = getImageUrl(item);
    const songName = item.song?.name || item.name || 'Unknown';
    const artistName = item.author?.name || item.primaryArtists || '';

    let downloadUrl = '';

    if (item.downloadUrl && Array.isArray(item.downloadUrl)) {
        const best = item.downloadUrl.find(d => d.quality === '320kbps') || item.downloadUrl[item.downloadUrl.length - 1];
        downloadUrl = best.link;
    }
    else if (typeof item.downloadUrl === 'string') {
        downloadUrl = item.downloadUrl;
    }
    else {
        const possibleUrl = item.song?.url || item.url;
        if (possibleUrl) {
             if (typeof possibleUrl === 'string' && (possibleUrl.includes('saavncdn.com') || possibleUrl.match(/\.(mp3|mp4|m4a)$/i))) {
                 downloadUrl = possibleUrl;
             }
             else if (Array.isArray(possibleUrl)) {
                 const best = possibleUrl.find(d => d.quality === '320kbps') || possibleUrl[possibleUrl.length - 1];
                 downloadUrl = best.link;
             }
             else {
                 downloadUrl = `${API_BASE}/api/download?track_url=${encodeURIComponent(possibleUrl)}`;
             }
        }
    }

    console.log(`Playing: ${songName} | URL: ${downloadUrl}`);

    if (playerTitle) playerTitle.textContent = songName;
    if (playerArtist) playerArtist.textContent = artistName;
    if (playerImg) playerImg.src = imgUrl;
    
    updatePlayerLikeIcon();

    if (audioPlayer) {
        audioPlayer.src = downloadUrl;
        const playPromise = audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("Playback interrupted or prevented:", error);
            });
        }
    }
    
    if (downloadBtn) {
        downloadBtn.href = downloadUrl;
        downloadBtn.setAttribute('download', `${songName}.mp3`);
    }

    if (playerBar) {
        playerBar.classList.remove('hidden');
        playerBar.style.display = 'flex'; 
    }
}

function togglePlay() {
    if (audioPlayer && audioPlayer.paused) {
        audioPlayer.play();
    } else if (audioPlayer) {
        audioPlayer.pause();
    }
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
    if (!audioPlayer) return;
    const { currentTime, duration } = audioPlayer;
    if (isNaN(duration)) return;
    
    if (seekSlider && !isDraggingSlider) {
        seekSlider.value = currentTime;
    }
    if (currentTimeElem && !isDraggingSlider) {
        currentTimeElem.textContent = formatTime(currentTime);
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
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
}

function formatTime(val) {
    if (typeof val === 'object' && val !== null) {
        const h = val.hours || 0;
        const m = val.minutes || 0;
        const s = val.seconds || 0;
        const totalSec = h * 3600 + m * 60 + s;
        const displayMin = Math.floor(totalSec / 60);
        const displaySec = totalSec % 60;
        return `${displayMin}:${displaySec < 10 ? '0' : ''}${displaySec}`;
    }
    const min = Math.floor(val / 60) || 0;
    const sec = Math.floor(val % 60) || 0;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num;
}

function showToast(msg) {
    const div = document.createElement('div');
    div.className = 'fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg text-sm z-50 animate-fade-in';
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
}