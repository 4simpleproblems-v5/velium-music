const API_BASE = "https://jiosaavn-api-privatecvc2.vercel.app";
const LYRICS_API_BASE = "https://lyrics.lewdhutao.my.eu.org/v2/musixmatch/lyrics";

// State
let currentTrack = null;
let currentResults = [];
let searchType = 'song';
let lastQuery = '';

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
             // The API structure varies a bit sometimes, but usually data.data.results
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
        const img = document.createElement('img');
        // Handle different image structures (sometimes array, sometimes string)
        let imgUrl = '';
        if (Array.isArray(item.image)) {
            imgUrl = item.image[item.image.length - 1].link; // Highest quality
        } else if (typeof item.image === 'string') {
             imgUrl = item.image;
        } else {
            imgUrl = 'https://via.placeholder.com/150?text=No+Image';
        }
        img.src = imgUrl;
        
        // Title
        const title = document.createElement('h3');
        title.innerHTML = item.name || item.title; // Using innerHTML to decode entities if any

        // Subtitle (Artist or Description)
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
                 // For now, if album click, maybe try to play or just show generic alert
                 // But better: load Album details. 
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
        const res = await fetch(`${API_BASE}/artists?id=${artistId}`);
        const data = await res.json();
        
        const artistData = data.data || {};
        const songs = artistData.topSongs || [];

        // Sort by year/release date (descending)
        songs.sort((a, b) => {
            const dateA = new Date(a.releaseDate || a.year);
            const dateB = new Date(b.releaseDate || b.year);
            return dateB - dateA;
        });

        renderArtistView(artistData, songs);

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

    // Re-attach event listeners for play buttons in the string HTML
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
        imgUrl = song.image[0].link; // Low qual for list
    } else {
        imgUrl = song.image;
    }
    
    // Duration formatting
    const duration = song.duration ? new Date(song.duration * 1000).toISOString().substr(14, 5) : '';

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

// Album Details (Basic implementation to support click)
async function loadAlbumDetails(albumId) {
     contentArea.innerHTML = '<div class="loader"><i class="fa-solid fa-spinner fa-spin fa-3x"></i></div>';
     try {
        const res = await fetch(`${API_BASE}/albums?id=${albumId}`);
        const data = await res.json();
        const album = data.data;
        
        renderArtistView({ // Reuse artist view structure
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
        // Find 320kbps or highest
        const best = song.downloadUrl.find(d => d.quality === '320kbps') || song.downloadUrl[song.downloadUrl.length - 1];
        downloadUrl = best.link;
    } else {
        downloadUrl = song.downloadUrl;
    }

    // Decode HTML entities in name
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

// Lyrics Logic
async function openLyrics() {
    if (!currentTrack) return;

    lyricsOverlay.classList.add('active');
    lyricsTitle.textContent = currentTrack.name;
    lyricsArtist.textContent = currentTrack.primaryArtists || currentTrack.artist || '';
    lyricsText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

    // Construct URL
    // Extract first artist if multiple
    let artistName = currentTrack.primaryArtists || currentTrack.artist || '';
    if (artistName.includes(',')) artistName = artistName.split(',')[0].trim();
    
    // Clean title (remove (feat. ...), etc if needed, but API might handle it)
    let trackName = currentTrack.name;
    // Basic cleanup: remove text inside () if it contains "feat" or "ft"
    trackName = trackName.replace(/\s*\(.*?(feat|ft).*?\)/gi, '');


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
