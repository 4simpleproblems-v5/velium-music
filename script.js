const API_BASE = "https://argon.global.ssl.fastly.net";
const API_SAAVN = "https://jiosaavn-api-privatecvc2.vercel.app";
const LYRICS_API_BASE = "https://lyrics.lewdhutao.my.eu.org/v2/musixmatch/lyrics";

// State
let currentTrack = null;
let currentResults = [];
let searchType = 'song';
let lastQuery = '';
let isPlaying = false;

// Library State
let library = {
    likedSongs: [],
    playlists: []
};

// DOM Elements
const searchBox = document.getElementById('search-box');
const searchBtn = document.getElementById('search-btn');
const contentArea = document.getElementById('content-area');
const playerBar = document.getElementById('player-bar');
const audioPlayer = document.getElementById('audio-player');
const playerImg = document.getElementById('player-img');
const playerTitle = document.getElementById('player-title');
const playerArtist = document.getElementById('player-artist');
const downloadBtn = document.getElementById('download-btn');
const playerLikeBtn = document.getElementById('player-like-btn'); 

const lyricsOverlay = document.getElementById('lyrics-overlay');
const closeLyricsBtn = document.getElementById('close-lyrics');
const lyricsTitle = document.getElementById('lyrics-title');
const lyricsArtist = document.getElementById('lyrics-artist');
const lyricsText = document.getElementById('lyrics-text');
const mainHeader = document.getElementById('main-header');
const libraryList = document.getElementById('library-list'); 
const createPlaylistBtn = document.getElementById('create-playlist-btn'); 

// Custom Player Elements
const playPauseBtn = document.getElementById('play-pause-btn');
const seekSlider = document.getElementById('seek-slider');
const currentTimeElem = document.getElementById('current-time');
const totalDurationElem = document.getElementById('total-duration');
const volumeSlider = document.getElementById('volume-slider');

// Initialization
(async function init() {
    try {
        console.log("Initializing Velium Music...");
        await loadLibrary();
        renderLibrary();
        console.log("Initialization complete.");
    } catch (e) {
        console.error("Initialization failed:", e);
    }
})();

// Event Listeners
if(searchBtn) searchBtn.addEventListener('click', () => handleSearch());
if(searchBox) searchBox.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

document.querySelectorAll('input[name="search-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        searchType = e.target.value;
        if (lastQuery) handleSearch();
    });
});

if(closeLyricsBtn) closeLyricsBtn.addEventListener('click', () => {
    lyricsOverlay.classList.remove('active');
});

// Create Playlist
if(createPlaylistBtn) createPlaylistBtn.addEventListener('click', async () => {
    const name = prompt("Enter playlist name:");
    if (name) {
        const newPlaylist = {
            id: 'pl-' + Date.now(),
            name: name,
            songs: [],
            updatedAt: new Date().toISOString()
        };
        library.playlists.push(newPlaylist);
        await saveLibrary();
        renderLibrary();
    }
});

// Custom Player Events
if(playPauseBtn) playPauseBtn.addEventListener('click', togglePlay);
if(playerLikeBtn) playerLikeBtn.addEventListener('click', () => {
    if (currentTrack) toggleLike(currentTrack);
});

audioPlayer.addEventListener('timeupdate', updateProgress);
audioPlayer.addEventListener('loadedmetadata', () => {
    totalDurationElem.textContent = formatTime(audioPlayer.duration);
    seekSlider.max = Math.floor(audioPlayer.duration);
});
audioPlayer.addEventListener('ended', () => {
    isPlaying = false;
    updatePlayBtn();
    seekSlider.value = 0;
});
audioPlayer.addEventListener('play', () => {
    isPlaying = true;
    updatePlayBtn();
});
audioPlayer.addEventListener('pause', () => {
    isPlaying = false;
    updatePlayBtn();
});

if(seekSlider) seekSlider.addEventListener('input', () => {
    audioPlayer.currentTime = seekSlider.value;
});

if(volumeSlider) volumeSlider.addEventListener('input', (e) => {
    audioPlayer.volume = e.target.value;
});


// Library Logic (IndexedDB)
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
        // Fallback or Initial state
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
        // Fix for persistence: Ensure we save enough data to play it back later
        let cleanItem = { ...item }; // Copy everything first
        
        // Ensure critical fields exist
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

async function addToPlaylist(item) {
    if (library.playlists.length === 0) {
        alert("Create a playlist first!");
        return;
    }
    // Simple prompt for now, but UI will handle this better in test.html
    const names = library.playlists.map((pl, i) => `${i + 1}. ${pl.name}`).join('\n');
    const choice = prompt(`Add to which playlist?\n${names}`);
    const idx = parseInt(choice) - 1;
    
    if (idx >= 0 && idx < library.playlists.length) {
        const pl = library.playlists[idx];
        // Check duplicates
        const exists = pl.songs.some(s => s.id === item.id || (s.url && s.url === item.url));
        if (exists) {
            showToast("Song already in playlist");
        } else {
            pl.songs.push(item);
            pl.updatedAt = new Date().toISOString();
            await saveLibrary();
            showToast(`Added to ${pl.name}`);
            renderLibrary(); // Update counts
        }
    }
}

function updatePlayerLikeIcon() {
    if (!currentTrack) return;
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
    likedDiv.onclick = openLikedSongs;
    libraryList.appendChild(likedDiv);

    // Custom Playlists
    library.playlists.forEach(pl => {
        const div = document.createElement('div');
        div.className = 'compact-list-item flex items-center gap-2 p-2';
        
        let plCover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        if (pl.songs.length > 0) {
             plCover = getImageUrl(pl.songs[0]);
        }

        div.innerHTML = `
            <img src="${plCover}" class="w-10 h-10 rounded object-cover">
            <div class="flex-grow overflow-hidden">
                <div class="text-sm text-white truncate">${pl.name}</div>
                <div class="text-xs text-gray-500">${pl.songs.length} songs</div>
            </div>
        `;
        div.onclick = () => openPlaylist(pl.id);
        libraryList.appendChild(div);
    });
}

function openLikedSongs() {
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
}

function openPlaylist(playlistId) {
    const pl = library.playlists.find(p => p.id === playlistId);
    if (!pl) return;

    mainHeader.textContent = pl.name;
    contentArea.className = '';

    const lastUpdated = new Date(pl.updatedAt).toLocaleDateString();

    let html = `
        <div class="artist-header">
            <div class="w-32 h-32 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center text-white text-4xl shadow-lg">
                <i class="fas fa-music"></i>
            </div>
            <div class="artist-info">
                <h2>${pl.name}</h2>
                <p>${pl.songs.length} songs • Updated: ${lastUpdated}</p>
            </div>
        </div>
        <div class="song-list">
            ${pl.songs.map(item => createSongRow(item)).join('')}
        </div>
    `;

    if (pl.songs.length === 0) {
        html += `<div class="text-center text-gray-500 mt-10">This playlist is empty.</div>`;
    }

    contentArea.innerHTML = html;
    attachListEvents(pl.songs);
}

function attachListEvents(items) {
    items.forEach(item => {
        const song = item.song || item;
        const author = item.author || { name: item.primaryArtists || '' };
        const trackUrl = song.url || item.url;
        let uniqueId = item.id || trackUrl || (song.name + author.name);
        if (!uniqueId) uniqueId = 'unknown';
        const domId = btoa(String(uniqueId)).substring(0, 16).replace(/[/+=]/g, '');

        const btn = document.getElementById(`play-${domId}`);
        const likeBtn = document.getElementById(`like-${domId}`);
        const addBtn = document.getElementById(`add-${domId}`);
        
        if (btn) btn.addEventListener('click', () => playSong(item));
        if (likeBtn) likeBtn.addEventListener('click', () => toggleLike(item));
        if (addBtn) addBtn.addEventListener('click', () => addToPlaylist(item));
    });
}

// Search Logic
async function handleSearch() {
    const query = searchBox.value.trim();
    if (!query) return;
    lastQuery = query;

    console.log(`Searching for: ${query} (Type: ${searchType})`);

    contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
    contentArea.className = 'photo-grid'; 
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
        contentArea.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10 w-full">No results found.</div>';
        return;
    }

    currentResults = results; 
    contentArea.innerHTML = ''; 
    // We will render cards using the new design in test.html, 
    // but here we generate the HTML string structure expected by the redesign.
    // However, since script.js is shared, I must output HTML that matches the CSS in test.html.
    
    // Grid container is already set by contentArea.className = 'photo-grid' in handleSearch.
    // In the NEW design (games.html style), the container is a grid of cards.
    
    results.forEach((item, idx) => {
        try {
            const card = document.createElement('div');
            // Matching 'zone-item' style from games.html roughly
            card.className = 'zone-item bg-[#111] rounded-2xl border border-[#252525] overflow-hidden relative group cursor-pointer';
            
            const imgUrl = getImageUrl(item);
            const name = item.song?.name || item.name || 'Unknown';
            const subText = item.author?.name || item.primaryArtists || '';
            
            // Using the card structure from games.html but square for music
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

            // Click on card -> Play
            card.addEventListener('click', () => playSong(item));
            
            // Buttons
            const favBtn = card.querySelector('.fav-btn');
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleLike(item);
                // Update icon immediately for feedback
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

            contentArea.appendChild(card);
        } catch (err) {
            console.error(`Error rendering item ${idx}:`, item, err);
        }
    });
}

function createSongRow(item) {
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

    return `
        <div class="song-row flex items-center p-3 bg-[#111] hover:bg-[#1a1a1a] rounded-xl border border-[#252525] transition-colors gap-4">
            <img src="${imgUrl}" loading="lazy" class="w-12 h-12 rounded-lg object-cover">
            <div class="flex-grow overflow-hidden">
                <div class="text-white font-medium truncate">${song.name}</div>
                <div class="text-gray-500 text-xs truncate">${author.name}</div>
            </div>
            <div class="flex items-center gap-3">
                 <div class="text-gray-600 text-xs">${durationStr}</div>
                 <button id="add-${domId}" class="w-8 h-8 rounded-full border border-[#333] flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-all" title="Add to Playlist">
                    <i class="fas fa-plus"></i>
                 </button>
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

// Player Logic
function playSong(item) {
    currentTrack = item;
    
    const imgUrl = getImageUrl(item);
    const songName = item.song?.name || item.name || 'Unknown';
    const artistName = item.author?.name || item.primaryArtists || '';

    let downloadUrl = '';

    // 1. Explicit Download URL (Saavn fresh result)
    if (item.downloadUrl && Array.isArray(item.downloadUrl)) {
        const best = item.downloadUrl.find(d => d.quality === '320kbps') || item.downloadUrl[item.downloadUrl.length - 1];
        downloadUrl = best.link;
    }
    // 2. Explicit Download URL (Saavn string legacy/fallback)
    else if (typeof item.downloadUrl === 'string') {
        downloadUrl = item.downloadUrl;
    }
    else {
        // Check potential URL fields
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
    
    if (audioPlayer) {
        audioPlayer.src = downloadUrl;
        const playPromise = audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("Playback interrupted or prevented:", error);
            });
        }
    }
    updatePlayerLikeIcon();
    
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
    if (audioPlayer.paused) {
        audioPlayer.play();
    } else {
        audioPlayer.pause();
    }
}

function updatePlayBtn() {
    if (isPlaying) {
        playPauseBtn.innerHTML = '<i class="fas fa-pause-circle"></i>';
    } else {
        playPauseBtn.innerHTML = '<i class="fas fa-play-circle"></i>';
    }
}

function updateProgress() {
    const { currentTime, duration } = audioPlayer;
    if (isNaN(duration)) return;
    
    const progressPercent = (currentTime / duration) * 100;
    seekSlider.value = currentTime;
    currentTimeElem.textContent = formatTime(currentTime);
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