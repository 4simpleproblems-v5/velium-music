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

const GRID_CLASS = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6';

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
        contentArea.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10 w-full">No results found.</div>';
        return;
    }

    currentResults = results; 
    contentArea.innerHTML = ''; 
    
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

// Artist Details Logic (Simplified for Argon)
async function loadArtistDetails(artistId, artistObj) {
    contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
    contentArea.className = GRID_CLASS; 
    mainHeader.textContent = "Related Songs";
    
    try {
        // Argon doesn't have artist ID lookup, using name from object if available
        const artistName = artistObj.author?.name || artistObj.name;
        const res = await fetch(`${API_BASE}/api/search?query=${encodeURIComponent(artistName)}&limit=20`);
        const data = await res.json();
        renderResults(data.collection);
    } catch (e) {
        console.error(e);
        contentArea.innerHTML = `<div class="col-span-full text-center text-red-500 w-full">Failed to load.</div>`;
    }
}

function renderArtistView(artist, songs) {
    const imgUrl = getImageUrl(artist);

    const html = `
        <div class="artist-header">
            <img src="${imgUrl}" alt="${artist.name}">
            <div class="artist-info">
                <h2>${artist.name}</h2>
                <p>${artist.followerCount ? formatNumber(artist.followerCount) + ' Followers' : ''}</p>
                <p>${artist.isVerified ? '<i class="fas fa-check-circle text-indigo-500"></i> Verified Artist' : ''}</p>
            </div>
        </div>
        <div class="song-list">
            ${songs.map(song => createSongRow(song)).join('')}
        </div>
    `;
    
    contentArea.innerHTML = html;

    songs.forEach(item => {
        const song = item.song || item;
        const author = item.author || { name: item.primaryArtists || '' };
        const trackUrl = song.url || item.url;
        let uniqueId = item.id || trackUrl || (song.name + author.name);
        if (!uniqueId) uniqueId = 'unknown';
        const domId = btoa(String(uniqueId)).substring(0, 16).replace(/[/+=]/g, '');

        const btn = document.getElementById(`play-${domId}`);
        const likeBtn = document.getElementById(`like-${domId}`);
        if (btn) btn.addEventListener('click', () => playSong(item));
        if (likeBtn) likeBtn.addEventListener('click', () => toggleLike(item));
    });
}

function createSongRow(item) {
    const imgUrl = getImageUrl(item);
    const song = item.song || item;
    const author = item.author || { name: item.primaryArtists || '' };
    
    const durationStr = formatTime(song.duration);
    const trackUrl = song.url || item.url; // Kept for logic check
    
    // Check if liked using ID or URL
    const isLiked = library.likedSongs.some(s => {
        const sUrl = s.song?.url || s.url;
        const sId = s.id;
        // Check ID match (Saavn)
        if (item.id && sId === item.id) return true;
        // Check URL match (Argon)
        if (trackUrl && sUrl === trackUrl) return true;
        return false;
    });
    
    // Generate a safe ID for the DOM
    let uniqueId = item.id || trackUrl || (song.name + author.name);
    if (!uniqueId) uniqueId = 'unknown-' + Math.random();
    const domId = btoa(String(uniqueId)).substring(0, 16).replace(/[/+=]/g, '');

    return `
        <div class="song-row">
            <img src="${imgUrl}" loading="lazy">
            <div class="song-row-info">
                <div class="song-row-title">${song.name}</div>
                <div class="song-row-meta">${author.name}</div>
            </div>
            <div class="song-row-actions flex items-center gap-4">
                 <div class="song-row-meta">${durationStr}</div>
                 <button id="like-${domId}" class="${isLiked ? 'liked' : ''}" title="${isLiked ? 'Unlike' : 'Like'}">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                 </button>
                <button id="play-${domId}" title="Play"><i class="fas fa-play"></i></button>
            </div>
        </div>
    `;
}

// Album Details (Simplified for Argon)
async function loadAlbumDetails(albumId) {
     contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
     contentArea.className = GRID_CLASS;
     mainHeader.textContent = "Related Songs";
     try {
        // Argon doesn't have album lookup, using search instead
        const res = await fetch(`${API_BASE}/api/search?query=${encodeURIComponent(albumId)}&limit=10`);
        const data = await res.json();
        renderResults(data.collection);
     } catch(e) {
          contentArea.innerHTML = `<div class="col-span-full text-center text-red-500 w-full">Failed to load.</div>`;
     }
}
