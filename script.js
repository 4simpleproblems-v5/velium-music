const API_BASE = "https://argon.global.ssl.fastly.net";
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
const playerLikeBtn = document.getElementById('player-like-btn'); // New

const lyricsOverlay = document.getElementById('lyrics-overlay');
const closeLyricsBtn = document.getElementById('close-lyrics');
const lyricsTitle = document.getElementById('lyrics-title');
const lyricsArtist = document.getElementById('lyrics-artist');
const lyricsText = document.getElementById('lyrics-text');
const mainHeader = document.getElementById('main-header');
const libraryList = document.getElementById('library-list'); // New
const createPlaylistBtn = document.getElementById('create-playlist-btn'); // New

// Custom Player Elements
const playPauseBtn = document.getElementById('play-pause-btn');
const seekSlider = document.getElementById('seek-slider');
const currentTimeElem = document.getElementById('current-time');
const totalDurationElem = document.getElementById('total-duration');
const volumeSlider = document.getElementById('volume-slider');

// Initialization
try {
    console.log("Initializing Velium Music...");
    loadLibrary();
    renderLibrary();
    console.log("Initialization complete.");
} catch (e) {
    console.error("Initialization failed:", e);
}

// Event Listeners
searchBtn.addEventListener('click', () => handleSearch());
searchBox.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

document.querySelectorAll('input[name="search-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        searchType = e.target.value;
        if (lastQuery) handleSearch();
    });
});

// Removed lyrics trigger on playerImg click
closeLyricsBtn.addEventListener('click', () => {
    lyricsOverlay.classList.remove('active');
});

// Create Playlist
createPlaylistBtn.addEventListener('click', () => {
    const name = prompt("Enter playlist name:");
    if (name) {
        const newPlaylist = {
            id: 'pl-' + Date.now(),
            name: name,
            songs: [],
            updatedAt: new Date().toISOString()
        };
        library.playlists.push(newPlaylist);
        saveLibrary();
        renderLibrary();
    }
});

// Custom Player Events
playPauseBtn.addEventListener('click', togglePlay);
playerLikeBtn.addEventListener('click', () => {
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

seekSlider.addEventListener('input', () => {
    audioPlayer.currentTime = seekSlider.value;
});

volumeSlider.addEventListener('input', (e) => {
    audioPlayer.volume = e.target.value;
});


// Library Logic
function loadLibrary() {
    const stored = localStorage.getItem('velium_library');
    if (stored) {
        try {
            library = JSON.parse(stored);
            if (!library.likedSongs) library.likedSongs = [];
            if (!library.playlists) library.playlists = [];
        } catch (e) {
            console.error("Failed to load library", e);
        }
    }
}

function saveLibrary() {
    localStorage.setItem('velium_library', JSON.stringify(library));
}

function toggleLike(item) {
    // Determine unique identifier
    const trackUrl = item.song?.url || item.url;
    const trackId = item.id; 

    // Find index matching either URL or ID
    const index = library.likedSongs.findIndex(s => {
        const sUrl = s.song?.url || s.url;
        const sId = s.id;
        if (trackUrl && sUrl === trackUrl) return true;
        if (trackId && sId === trackId) return true;
        return false;
    });

    if (index > -1) {
        library.likedSongs.splice(index, 1);
        showToast("Removed from Liked Songs");
    } else {
        // Ensure we save a clean object
        let cleanItem;
        if (item.song) {
             // New structure
             cleanItem = {
                song: {
                    name: item.song.name || 'Unknown',
                    url: item.song.url,
                    img: item.song.img,
                    duration: item.song.duration
                },
                author: {
                    name: item.author?.name || ''
                }
            };
        } else {
            // Legacy or flat structure
             cleanItem = {
                id: item.id, // Keep ID for legacy
                song: {
                    name: item.name || item.title || 'Unknown',
                    url: item.url || item.downloadUrl || '', // Try to find a URL
                    img: { small: getImageUrl(item), big: getImageUrl(item) },
                    duration: item.duration
                },
                author: {
                    name: item.primaryArtists || item.artist || ''
                }
            };
        }

        library.likedSongs.unshift(cleanItem);
        showToast("Added to Liked Songs");
    }
    saveLibrary();
    renderLibrary();
    updatePlayerLikeIcon();
    
    // If we are currently viewing the liked playlist, re-render it
    if (mainHeader.textContent === "Liked Songs") {
        openLikedSongs();
    }
}

function updatePlayerLikeIcon() {
    if (!currentTrack) return;
    const trackUrl = currentTrack.song?.url || currentTrack.url;
    const isLiked = library.likedSongs.some(s => (s.song?.url || s.url) === trackUrl);
    playerLikeBtn.innerHTML = isLiked ? '<i class="fas fa-heart text-red-500"></i>' : '<i class="far fa-heart"></i>';
}

function renderLibrary() {
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
    contentArea.className = ''; // Remove grid class
    
    let html = `
        <div class="artist-header">
            <div class="w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-4xl shadow-lg">
                <i class="fas fa-heart"></i>
            </div>
            <div class="artist-info">
                <h2>Liked Songs</h2>
                <p>${library.likedSongs.length} songs • Auto-generated</p>
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
    
    // Attach events
    library.likedSongs.forEach(item => {
        const trackUrl = item.song?.url || item.url;
        const domId = btoa(trackUrl).substring(0, 16).replace(/[/+=]/g, '');
        const btn = document.getElementById(`play-${domId}`);
        const likeBtn = document.getElementById(`like-${domId}`);
        if (btn) btn.addEventListener('click', () => playSong(item));
        if (likeBtn) likeBtn.addEventListener('click', () => toggleLike(item));
    });
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
    
    // Attach events
     pl.songs.forEach(item => {
        const trackUrl = item.song?.url || item.url;
        const domId = btoa(trackUrl).substring(0, 16).replace(/[/+=]/g, '');
        const btn = document.getElementById(`play-${domId}`);
        const likeBtn = document.getElementById(`like-${domId}`);
        if (btn) btn.addEventListener('click', () => playSong(item));
        if (likeBtn) likeBtn.addEventListener('click', () => toggleLike(item));
    });
}

// Search Logic
async function handleSearch() {
    const query = searchBox.value.trim();
    if (!query) return;
    lastQuery = query;

    console.log(`Searching for: ${query} (Type: ${searchType})`);

    contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
    contentArea.className = 'photo-grid'; // Restore grid for search results
    mainHeader.textContent = `Results for "${query}"`;

    try {
        let url = `${API_BASE}/api/search?query=${encodeURIComponent(query)}&limit=20`;
        console.log(`Fetching: ${url}`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        console.log("Search results:", data);
        
        if (data.collection && data.collection.length > 0) {
             renderResults(data.collection);
        } else {
            console.log("No results found in data.collection");
            contentArea.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10 w-full">No results found.</div>';
        }
    } catch (e) {
        console.error("Search failed:", e);
        contentArea.innerHTML = `<div class="col-span-full text-center text-red-500 mt-10 w-full">Error: ${e.message}</div>`;
    }
}

function renderResults(results) {
    console.log(`Rendering ${results.length} results`);
    if (!results || results.length === 0) {
        contentArea.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10 w-full">No results found.</div>';
        return;
    }

    currentResults = results; 
    contentArea.innerHTML = ''; 

    results.forEach((item, idx) => {
        try {
            const card = document.createElement('div');
            card.className = 'photo-thumbnail'; // Using the Photo Grid class
            
            const imgUrl = getImageUrl(item);
            
            const name = item.song?.name || item.name || 'Unknown';
            const subText = item.author?.name || item.primaryArtists || '';

            card.innerHTML = `
                <img src="${imgUrl}" alt="${name}" loading="lazy" onerror="this.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='">
                <div class="overlay"></div>
                <div class="title-overlay">
                    <h3>${name}</h3>
                    <p>${subText}</p>
                </div>
            `;

            card.addEventListener('click', () => {
                playSong(item);
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
    contentArea.className = ''; 
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

    songs.forEach(song => {
        const btn = document.getElementById(`play-${song.id}`);
        const likeBtn = document.getElementById(`like-${song.id}`);
        if (btn) btn.addEventListener('click', () => playSong(song));
        if (likeBtn) likeBtn.addEventListener('click', () => toggleLike(song));
    });
}

function createSongRow(item) {
    const imgUrl = getImageUrl(item);
    const song = item.song || item;
    const author = item.author || { name: item.primaryArtists || '' };
    
    const durationStr = formatTime(song.duration);
    const trackUrl = song.url;
    const isLiked = library.likedSongs.some(s => (s.song?.url || s.url) === trackUrl);
    
    // Generate a safe ID for the DOM
    const domId = btoa(trackUrl).substring(0, 16).replace(/[/+=]/g, '');

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
     contentArea.className = '';
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

// Player Logic
function playSong(item) {
    currentTrack = item;
    
    const imgUrl = getImageUrl(item);
    const songName = item.song?.name || item.name || 'Unknown';
    const artistName = item.author?.name || item.primaryArtists || '';
    const trackUrl = item.song?.url || item.url;

    let downloadUrl = '';
    if (trackUrl) {
        downloadUrl = `${API_BASE}/api/download?track_url=${encodeURIComponent(trackUrl)}`;
    }

    playerTitle.textContent = songName;
    playerArtist.textContent = artistName;
    playerImg.src = imgUrl;
    
    audioPlayer.src = downloadUrl;
    audioPlayer.play();
    updatePlayerLikeIcon();
    
    downloadBtn.href = downloadUrl;
    downloadBtn.setAttribute('download', `${songName}.mp3`);

    playerBar.classList.remove('hidden');
    playerBar.style.display = 'flex'; 
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

// Helper: Get Image URL
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
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num;
}

function showToast(msg) {
    // Simple toast for feedback
    const div = document.createElement('div');
    div.className = 'fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg text-sm z-50';
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 2000);
}

// Lyrics Logic (Triggered by button usually, now only via manual call if implemented elsewhere or restored)
async function openLyrics() {
    if (!currentTrack) return;

    lyricsOverlay.classList.add('active');
    lyricsTitle.textContent = currentTrack.name;
    lyricsArtist.textContent = currentTrack.primaryArtists || currentTrack.artist || '';
    lyricsText.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Loading...';

    const decodeHtml = (html) => {
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    };

    let artistName = currentTrack.primaryArtists || currentTrack.artist || '';
    artistName = decodeHtml(artistName);
    if (artistName.includes(',')) artistName = artistName.split(',')[0].trim();
    
    let trackName = currentTrack.name;
    trackName = decodeHtml(trackName);
    trackName = trackName.replace(/\s*\(.*?(feat|ft|from|cover|remix).*?\)/gi, '');
    trackName = trackName.replace(/\s*\[.*?\]/gi, ''); 
    trackName = trackName.trim();

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
