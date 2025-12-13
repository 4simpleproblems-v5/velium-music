const API_BASE = "https://jiosaavn-api-privatecvc2.vercel.app";
const LYRICS_API_BASE = "https://lyrics.lewdhutao.my.eu.org/v2/musixmatch/lyrics";

// State
let currentTrack = null;
let currentResults = [];
let searchType = 'song';
let lastQuery = '';
let isPlaying = false;
let searchHistory = [];

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
const lyricsOverlay = document.getElementById('lyrics-overlay');
const closeLyricsBtn = document.getElementById('close-lyrics');
const lyricsTitle = document.getElementById('lyrics-title');
const lyricsArtist = document.getElementById('lyrics-artist');
const lyricsText = document.getElementById('lyrics-text');
const mainHeader = document.getElementById('main-header');
const historyList = document.getElementById('history-list');

// Custom Player Elements
const playPauseBtn = document.getElementById('play-pause-btn');
const seekSlider = document.getElementById('seek-slider');
const currentTimeElem = document.getElementById('current-time');
const totalDurationElem = document.getElementById('total-duration');
const volumeSlider = document.getElementById('volume-slider');

// Event Listeners
searchBtn.addEventListener('click', () => handleSearch());
searchBox.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});

document.querySelectorAll('input[name="search-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        searchType = e.target.value;
        // Update styling for active state (Tailwind peer-checked handles this visually)
        if (lastQuery) handleSearch();
    });
});

playerImg.addEventListener('click', openLyrics);
closeLyricsBtn.addEventListener('click', () => {
    lyricsOverlay.classList.remove('active');
});

// Custom Player Events
playPauseBtn.addEventListener('click', togglePlay);

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


// Search Logic
async function handleSearch() {
    const query = searchBox.value.trim();
    if (!query) return;
    lastQuery = query;

    addToHistory(query);

    contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
    mainHeader.textContent = `Results for "${query}"`;

    try {
        let url = `${API_BASE}/search/${searchType}s?query=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === 'SUCCESS' || data.success || data.data) {
             let results = data.data.results || data.data;
             renderResults(results);
        } else {
            contentArea.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10">No results found.</div>';
        }
    } catch (e) {
        console.error(e);
        contentArea.innerHTML = `<div class="col-span-full text-center text-red-500 mt-10">Error: ${e.message}</div>`;
    }
}

function addToHistory(query) {
    if (!searchHistory.includes(query)) {
        searchHistory.unshift(query);
        if (searchHistory.length > 10) searchHistory.pop();
        renderHistory();
    }
}

function renderHistory() {
    const container = document.querySelector('#history-list .compact-list-items');
    if (searchHistory.length === 0) return;
    
    container.innerHTML = '';
    searchHistory.forEach(q => {
        const div = document.createElement('div');
        div.className = 'compact-list-item text-sm text-gray-400 truncate';
        div.textContent = q;
        div.onclick = () => {
            searchBox.value = q;
            handleSearch();
        };
        container.appendChild(div);
    });
}

function renderResults(results) {
    if (!results || results.length === 0) {
        contentArea.innerHTML = '<div class="col-span-full text-center text-gray-500 mt-10">No results found.</div>';
        return;
    }

    currentResults = results; // Store for reference
    contentArea.innerHTML = ''; // Clear grid

    results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'photo-thumbnail'; // Using the Photo Grid class
        
        // Image logic
        let imgUrl = '';
        if (Array.isArray(item.image)) {
            imgUrl = item.image[item.image.length - 1].link; 
        } else if (typeof item.image === 'string') {
             imgUrl = item.image;
        } else {
            imgUrl = 'https://via.placeholder.com/150?text=No+Image';
        }
        
        // Metadata
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

        // Click Action
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
    mainHeader.textContent = "Artist Details";
    
    try {
        const artistRes = await fetch(`${API_BASE}/artists?id=${artistId}`);
        const artistData = await artistRes.json();
        const artist = artistData.data || {};
        
        let songs = artist.topSongs || [];
        
        // Try fetching more songs
        try {
             const songsRes = await fetch(`${API_BASE}/artists/${artistId}/songs?page=1&limit=50`);
             const songsData = await songsRes.json();
             if (songsData.data && songsData.data.results) {
                 songs = songsData.data.results;
             }
        } catch (err) { console.log("Extra songs fetch failed", err); }

        songs.sort((a, b) => {
            const dateA = new Date(a.releaseDate || a.year);
            const dateB = new Date(b.releaseDate || b.year);
            return dateB - dateA;
        });

        renderArtistView(artist, songs);

    } catch (e) {
        console.error(e);
        contentArea.innerHTML = `<div class="col-span-full text-center text-red-500">Failed to load artist details.</div>`;
    }
}

function renderArtistView(artist, songs) {
    // Reset layout from Grid to List-like view by injecting HTML directly
    // Note: contentArea is a Grid (.photo-grid). We need to override or wrap.
    // Simplest: Replace contentArea content with a full-width container.
    
    // We remove the grid class temporarily or just use col-span-full
    contentArea.className = ''; // Remove grid class for this view
    
    let imgUrl = '';
     if (Array.isArray(artist.image)) {
            imgUrl = artist.image[artist.image.length - 1].link;
    } else {
        imgUrl = artist.image;
    }

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
        if (btn) {
            btn.addEventListener('click', () => playSong(song));
        }
    });
}

function createSongRow(song) {
    let imgUrl = '';
    if (Array.isArray(song.image)) {
        imgUrl = song.image[0].link; 
    } else {
        imgUrl = song.image;
    }
    
    const duration = song.duration ? formatTime(song.duration) : '';
    // Escape quotes in name for attribute
    const safeName = (song.name || '').replace(/"/g, '&quot;');

    return `
        <div class="song-row">
            <img src="${imgUrl}" loading="lazy">
            <div class="song-row-info">
                <div class="song-row-title">${song.name}</div>
                <div class="song-row-meta">${song.primaryArtists || song.artist || ''} • ${song.year || ''}</div>
            </div>
            <div class="song-row-actions flex items-center gap-4">
                 <div class="song-row-meta">${duration}</div>
                <button id="play-${song.id}" title="Play"><i class="fas fa-play"></i></button>
            </div>
        </div>
    `;
}

// Album Details
async function loadAlbumDetails(albumId) {
     contentArea.innerHTML = '<div class="loader"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';
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
          contentArea.innerHTML = `<div class="col-span-full text-center text-red-500">Failed to load album.</div>`;
     }
}

// Player Logic
function playSong(song) {
    currentTrack = song;
    
    let imgUrl = '';
    if (Array.isArray(song.image)) {
        imgUrl = song.image[song.image.length - 1].link;
    } else {
        imgUrl = song.image;
    }

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
    
    downloadBtn.href = downloadUrl;
    downloadBtn.setAttribute('download', `${decodedTitle}.mp3`);

    playerBar.classList.remove('hidden');
    playerBar.style.display = 'flex'; // Ensure flex display overrides hidden
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

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// Lyrics Logic
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
    console.log("Fetching lyrics from:", url);

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

// Utility
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num;
}
