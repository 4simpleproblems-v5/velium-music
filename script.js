const API_BASE = "https://jiosaavn-api-privatecvc2.vercel.app";
const LYRICS_API_BASE = "https://lyrics.lewdhutao.my.eu.org/v2/musixmatch/lyrics";

// State
let currentTrack = null;
let currentResults = [];
let searchType = 'song';
let lastQuery = '';
let isPlaying = false;

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

    contentArea.innerHTML = '<div class="loader"><i class="fa-solid fa-spinner fa-spin fa-3x"></i></div>';

    try {
        let url = `${API_BASE}/search/${searchType}s?query=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === 'SUCCESS' || data.success || data.data) {
             let results = data.data.results || data.data;
             renderResults(results);
        } else {
            contentArea.innerHTML = '<div class="loader">No results found.</div>';
        }
    } catch (e) {
        console.error(e);
        contentArea.innerHTML = `<div class="loader">Error: ${e.message}</div>`;
    }
}

function renderResults(results) {
    if (!results || results.length === 0) {
        contentArea.innerHTML = '<div class="loader">No results found.</div>';
        return;
    }

    currentResults = results; // Store for reference
    const grid = document.createElement('div');
    grid.className = 'results-grid';

    results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        
        // Image
        let imgUrl = '';
        if (Array.isArray(item.image)) {
            imgUrl = item.image[item.image.length - 1].link; 
        } else if (typeof item.image === 'string') {
             imgUrl = item.image;
        } else {
            imgUrl = 'https://via.placeholder.com/150?text=No+Image';
        }
        
        const img = document.createElement('img');
        img.src = imgUrl;
        
        // Title
        const title = document.createElement('h3');
        title.innerHTML = item.name || item.title; 

        // Subtitle
        const sub = document.createElement('p');
        if (searchType === 'song') {
            sub.textContent = item.primaryArtists || item.artist || '';
        } else if (searchType === 'album') {
            sub.textContent = item.year || item.artist || '';
        } else if (searchType === 'artist') {
             sub.textContent = 'Artist';
        }

        card.appendChild(img);
        card.appendChild(title);
        card.appendChild(sub);

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

        grid.appendChild(card);
    });

    contentArea.innerHTML = '';
    contentArea.appendChild(grid);
}

// Artist Details Logic
async function loadArtistDetails(artistId, artistObj) {
    contentArea.innerHTML = '<div class="loader"><i class="fa-solid fa-spinner fa-spin fa-3x"></i></div>';
    
    try {
        // Fetch artist details
        const artistRes = await fetch(`${API_BASE}/artists?id=${artistId}`);
        const artistData = await artistRes.json();
        
        const artist = artistData.data || {};
        
        // Try to fetch artist songs specifically if possible, otherwise rely on topSongs
        // The previous implementation used topSongs from the artist details. 
        // Let's see if we can get more. 
        // Some JioSaavn APIs support /artists/{id}/songs?page=1&count=50
        // We will try to fetch more songs if available, but for now fallback to topSongs
        
        let songs = artist.topSongs || [];
        
        // Try fetching more songs (pagination attempt)
        try {
             const songsRes = await fetch(`${API_BASE}/artists/${artistId}/songs?page=1&limit=50`);
             const songsData = await songsRes.json();
             if (songsData.data && songsData.data.results) {
                 songs = songsData.data.results;
             }
        } catch (err) {
            console.log("Could not fetch extra songs, using top songs.", err);
        }

        // Sort by year/release date (descending)
        songs.sort((a, b) => {
            const dateA = new Date(a.releaseDate || a.year);
            const dateB = new Date(b.releaseDate || b.year);
            return dateB - dateA;
        });

        renderArtistView(artist, songs);

    } catch (e) {
        console.error(e);
        contentArea.innerHTML = `<div class="loader">Failed to load artist details.</div>`;
    }
}

function renderArtistView(artist, songs) {
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
                <p>${artist.isVerified ? '<i class="fa-solid fa-circle-check" style="color:var(--accent)"></i> Verified Artist' : ''}</p>
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

    return `
        <div class="song-row">
            <img src="${imgUrl}" loading="lazy">
            <div class="song-row-info">
                <div class="song-row-title">${song.name}</div>
                <div class="song-row-meta">${song.primaryArtists || song.artist || ''} • ${song.year || ''}</div>
            </div>
            <div class="song-row-actions">
                 <div class="song-row-meta" style="margin-right:15px; align-self:center;">${duration}</div>
                <button id="play-${song.id}" class="btn-icon"><i class="fa-solid fa-play"></i></button>
            </div>
        </div>
    `;
}

// Album Details
async function loadAlbumDetails(albumId) {
     contentArea.innerHTML = '<div class="loader"><i class="fa-solid fa-spinner fa-spin fa-3x"></i></div>';
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
          contentArea.innerHTML = `<div class="loader">Failed to load album.</div>`;
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
        playPauseBtn.innerHTML = '<i class="fa-solid fa-circle-pause"></i>';
    } else {
        playPauseBtn.innerHTML = '<i class="fa-solid fa-circle-play"></i>';
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
    lyricsText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

    // Helper to decode entities like &amp;
    const decodeHtml = (html) => {
        const txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    };

    // Extract first artist if multiple
    let artistName = currentTrack.primaryArtists || currentTrack.artist || '';
    // Handle html entities in artist name too
    artistName = decodeHtml(artistName);
    
    if (artistName.includes(',')) artistName = artistName.split(',')[0].trim();
    
    let trackName = currentTrack.name;
    trackName = decodeHtml(trackName);
    
    // Aggressive cleaning for better matching
    // Remove (feat. ...), (From ...), [remix], etc.
    trackName = trackName.replace(/\s*\(.*?(feat|ft|from|cover|remix).*?\)/gi, '');
    trackName = trackName.replace(/\s*\[.*?\]/gi, ''); // Remove anything in brackets
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