const API_BASE = "https://jiosaavn-api-privatecvc2.vercel.app";
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
loadLibrary();
renderLibrary();

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

function toggleLike(song) {
    const index = library.likedSongs.findIndex(s => s.id === song.id);
    if (index > -1) {
        library.likedSongs.splice(index, 1);
        showToast("Removed from Liked Songs");
    } else {
        // Ensure we save a clean object
        const cleanSong = {
            id: song.id,
            name: song.name || song.title,
            primaryArtists: song.primaryArtists || song.artist || '',
            image: song.image,
            downloadUrl: song.downloadUrl,
            year: song.year,
            duration: song.duration
        };
        library.likedSongs.unshift(cleanSong);
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
    const isLiked = library.likedSongs.some(s => s.id === currentTrack.id);
    playerLikeBtn.innerHTML = isLiked ? '<i class="fas fa-heart text-red-500"></i>' : '<i class="far fa-heart"></i>';
}

function renderLibrary() {
    libraryList.innerHTML = '';

    // Liked Songs Item
    const likedDiv = document.createElement('div');
    likedDiv.className = 'compact-list-item flex items-center gap-2 p-2';
    
    let coverUrl = 'https://via.placeholder.com/40?text=Like';
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
        
        let plCover = 'https://via.placeholder.com/40?text=PL';
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
    
    // Header for playlist view
    const lastUpdated = library.likedSongs.length > 0 ? "Just now" : "Never"; // Simplified for now
    
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
            ${library.likedSongs.map(song => createSongRow(song)).join('')}
        </div>
    `;
    
    if (library.likedSongs.length === 0) {
        html += `<div class="text-center text-gray-500 mt-10">You haven't liked any songs yet.</div>`;
    }

    contentArea.innerHTML = html;
    
    // Attach events
    library.likedSongs.forEach(song => {
        const btn = document.getElementById(`play-${song.id}`);
        const likeBtn = document.getElementById(`like-${song.id}`);
        if (btn) btn.addEventListener('click', () => playSong(song));
        if (likeBtn) likeBtn.addEventListener('click', () => toggleLike(song));
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
            ${pl.songs.map(song => createSongRow(song)).join('')}
        </div>
    `;

    if (pl.songs.length === 0) {
        html += `<div class="text-center text-gray-500 mt-10">This playlist is empty.</div>`;
    }

    contentArea.innerHTML = html;
    
    // Attach events (similar to liked songs)
     pl.songs.forEach(song => {
        const btn = document.getElementById(`play-${song.id}`);
        const likeBtn = document.getElementById(`like-${song.id}`);
        if (btn) btn.addEventListener('click', () => playSong(song));
        if (likeBtn) likeBtn.addEventListener('click', () => toggleLike(song));
    });
}


// Search Logic
async function handleSearch() {
    const query = searchBox.value.trim();
    if (!query) return;
    lastQuery = query;

    contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
    contentArea.className = 'photo-grid'; // Restore grid for search results
    mainHeader.textContent = `Results for "${query}"`;

    try {
        let url = `${API_BASE}/search/${searchType}s?query=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === 'SUCCESS' || data.success || data.data) {
             let results = data.data.results || data.data;
             renderResults(results);
        } else {
            contentArea.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10 w-full">No results found.</div>';
        }
    } catch (e) {
        console.error(e);
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

    results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'photo-thumbnail'; // Using the Photo Grid class
        
        const imgUrl = getImageUrl(item);
        
        const name = item.name || item.title || 'Unknown';
        let subText = '';
        if (searchType === 'song') {
            subText = item.primaryArtists || item.artist || '';
        } else if (searchType === 'album') {
            subText = item.year || item.artist || '';
        } else if (searchType === 'artist') {
             subText = 'Artist';
        }

        card.innerHTML = `
            <img src="${imgUrl}" alt="${name}" loading="lazy">
            <div class="overlay"></div>
            <div class="title-overlay">
                <h3>${name}</h3>
                <p>${subText}</p>
            </div>
        `;

        card.addEventListener('click', () => {
            if (searchType === 'song') {
                playSong(item);
            } else if (searchType === 'artist') {
                loadArtistDetails(item.id, item);
            } else if (searchType === 'album') {
                 loadAlbumDetails(item.id);
            }
        });

        contentArea.appendChild(card);
    });
}

// Artist Details Logic
async function loadArtistDetails(artistId, artistObj) {
    contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
    contentArea.className = ''; // Remove grid
    mainHeader.textContent = "Artist Details";
    
    try {
        const artistRes = await fetch(`${API_BASE}/artists?id=${artistId}`);
        const artistData = await artistRes.json();
        const artist = artistData.data || {};
        
        let songs = artist.topSongs || [];
        
        // Removed the failing call to /artists/{artistId}/songs
        // We will rely only on artist.topSongs

        // Filter songs by artist name (strict check as requested)
        const artistNameLower = artist.name.toLowerCase();
        songs = songs.filter(song => {
            const songPrimaryArtistsLower = (song.primaryArtists || song.artist || '').toLowerCase();
            return songPrimaryArtistsLower.includes(artistNameLower);
        });

        // Advanced Sorting for Relevance:
        // Prioritize: (1) higher playCount, (2) more recent year/releaseDate
        songs.sort((a, b) => {
            const playCountA = parseInt(a.playCount) || 0;
            const playCountB = parseInt(b.playCount) || 0;
            const yearA = parseInt(a.year) || 0;
            const yearB = parseInt(b.year) || 0;

            if (playCountA !== playCountB) {
                return playCountB - playCountA; // Higher playCount first
            }
            return yearB - yearA; // More recent year first
        });


        renderArtistView(artist, songs);

    } catch (e) {
        console.error(e);
        contentArea.innerHTML = `<div class="col-span-full text-center text-red-500 w-full">Failed to load artist details.</div>`;
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

function createSongRow(song) {
    const imgUrl = getImageUrl(song);
    const duration = song.duration ? formatTime(song.duration) : '';
    const safeName = (song.name || '').replace(/"/g, '&quot;');
    const isLiked = library.likedSongs.some(s => s.id === song.id);

    return `
        <div class="song-row">
            <img src="${imgUrl}" loading="lazy">
            <div class="song-row-info">
                <div class="song-row-title">${song.name}</div>
                <div class="song-row-meta">${song.primaryArtists || song.artist || ''} • ${song.year || ''}</div>
            </div>
            <div class="song-row-actions flex items-center gap-4">
                 <div class="song-row-meta">${duration}</div>
                 <button id="like-${song.id}" class="${isLiked ? 'liked' : ''}" title="${isLiked ? 'Unlike' : 'Like'}">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                 </button>
                <button id="play-${song.id}" title="Play"><i class="fas fa-play"></i></button>
            </div>
        </div>
    `;
}

// Album Details
async function loadAlbumDetails(albumId) {
     contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
     contentArea.className = '';
     mainHeader.textContent = "Album Details";
     try {
        const res = await fetch(`${API_BASE}/albums?id=${albumId}`);
        const data = await res.json();
        const album = data.data;
        
        renderArtistView({ 
            name: album.name,
            image: album.image,
            followerCount: null,
            isVerified: false
        }, album.songs);

     } catch(e) {
          contentArea.innerHTML = `<div class="col-span-full text-center text-red-500 w-full">Failed to load album.</div>`;
     }
}

// Player Logic
function playSong(song) {
    currentTrack = song;
    
    const imgUrl = getImageUrl(song);

    let downloadUrl = '';
    if (Array.isArray(song.downloadUrl)) {
        const best = song.downloadUrl.find(d => d.quality === '320kbps') || song.downloadUrl[song.downloadUrl.length - 1];
        downloadUrl = best.link;
    } else {
        downloadUrl = song.downloadUrl;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = song.name;
    const decodedTitle = tempDiv.textContent;

    playerTitle.textContent = decodedTitle;
    playerArtist.textContent = song.primaryArtists || song.artist || '';
    playerImg.src = imgUrl;
    
    audioPlayer.src = downloadUrl;
    audioPlayer.play();
    updatePlayerLikeIcon();
    
    downloadBtn.href = downloadUrl;
    downloadBtn.setAttribute('download', `${decodedTitle}.mp3`);

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
    if (Array.isArray(item.image)) {
        return item.image[item.image.length - 1].link; 
    } else if (typeof item.image === 'string') {
        return item.image;
    } else {
        return 'https://via.placeholder.com/150?text=No+Image';
    }
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
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
