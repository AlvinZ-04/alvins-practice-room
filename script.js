const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#search-input');
const searchButton = document.querySelector('#search-button');
const searchStatus = document.querySelector('#search-status');
const results = document.querySelector('#search-results');
const savedSongs = document.querySelector('#saved-songs');
const storageStatus = document.querySelector('#storage-status');
const preview = document.querySelector('#preview-audio');
const tempo = document.querySelector('#tempo');
const meter = document.querySelector('#meter');
const metronomeButton = document.querySelector('#metronome-button');
const metronomeStatus = document.querySelector('#metronome-status');
const journalStatus = document.querySelector('#journal-status');
const note = document.querySelector('#practice-note');
const storageKey = 'alvin-practice-room-v1';

let selectedSong = null;
let searchSongs = [];
let favorites = [];
let entries = [];
let audioContext;
let running = false;
let starting = false;
let scheduler;
let nextBeatTime = 0;
let beat = 0;
let clicks = [];
let beatTimers = [];
let searching = false;

function makeElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function makeButton(label, action) {
  const button = makeElement('button', label);
  button.type = 'button';
  button.addEventListener('click', action);
  return button;
}

function isSong(song) {
  return song && Number.isFinite(song.id) && typeof song.title === 'string'
    && typeof song.artist === 'string';
}

function isEntry(entry) {
  return entry && typeof entry.id === 'string' && typeof entry.text === 'string'
    && typeof entry.date === 'string' && Number.isFinite(Date.parse(entry.date))
    && Number.isInteger(entry.bpm) && entry.bpm >= 40 && entry.bpm <= 200
    && (entry.song === null || isSong(entry.song));
}

function readSavedData() {
  try {
    const raw = localStorage.getItem(storageKey);
    let data = { favorites: [], entries: [] };
    if (raw !== null) data = JSON.parse(raw);
    if (!data || !Array.isArray(data.favorites) || !Array.isArray(data.entries)
        || !data.favorites.every(isSong) || !data.entries.every(isEntry)) {
      throw new Error('Invalid saved data');
    }
    favorites = data.favorites;
    entries = data.entries;
    storageStatus.textContent = 'Your saved songs and journal stay in this browser.';
    return true;
  } catch (error) {
    storageStatus.textContent = 'Saved data could not be opened. Allow browser storage or try another browser. Existing data has been left untouched.';
    return false;
  }
}

function writeSavedData(nextFavorites, nextEntries) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ favorites: nextFavorites, entries: nextEntries }));
    favorites = nextFavorites;
    entries = nextEntries;
    renderSaved();
    renderResults();
    return true;
  } catch (error) {
    storageStatus.textContent = 'Could not save. Browser storage may be full or blocked. Keep this page open and copy your note before leaving.';
    return false;
  }
}

function isFavorite(song) {
  return favorites.some(favorite => favorite.id === song.id);
}

function toggleFavorite(song) {
  if (!readSavedData()) return;
  let updated = favorites.filter(favorite => favorite.id !== song.id);
  if (!isFavorite(song)) updated.push(song);
  writeSavedData(updated, entries);
}

function selectSong(song) {
  selectedSong = song;
  updatePracticeText();
  renderResults();
  renderSaved();
}

function updatePracticeText() {
  let title = 'Free practice';
  if (selectedSong) title = selectedSong.title + ' — ' + selectedSong.artist;
  document.querySelector('#selected-song').textContent = title;
  document.querySelector('#journal-context').textContent = 'Recording ' + title + ' at ' + tempo.value + ' BPM.';
  document.querySelector('#tempo-output').textContent = tempo.value;
}

function safeLink(value) {
  // Saved records and remote responses can both contain unexpected values.
  return typeof value === 'string' && value.startsWith('https://');
}

function showPreview(song) {
  stopMetronome();
  const section = document.querySelector('#preview-section');
  section.hidden = false;
  document.querySelector('#preview-title').textContent = song.title + ' — ' + song.artist;
  document.querySelector('#preview-status').textContent = 'Preview provided by Apple. Open the store link for the full recording.';
  const link = document.querySelector('#preview-link');
  link.hidden = !safeLink(song.link);
  if (safeLink(song.link)) link.href = song.link;
  preview.src = song.preview;
  section.scrollIntoView();
  preview.play().catch(() => {
    document.querySelector('#preview-status').textContent = 'Playback could not start. Try the audio play button or open the recording on Apple Music.';
  });
}

function songRow(song) {
  const row = makeElement('div', '', 'song-row');
  if (safeLink(song.artwork)) {
    const image = document.createElement('img');
    image.src = song.artwork;
    image.alt = 'Album artwork for ' + song.title;
    image.width = 80;
    image.height = 80;
    image.addEventListener('error', () => { image.hidden = true; });
    row.appendChild(image);
  }
  const copy = makeElement('div', '', 'song-copy');
  copy.appendChild(makeElement('p', song.title + ' — ' + song.artist));
  const actions = makeElement('div', '', 'song-actions');
  const choose = makeButton('Practice this song', () => {
    selectSong(song);
    document.querySelector('#practice-heading').scrollIntoView();
  });
  if (selectedSong && selectedSong.id === song.id) choose.textContent = 'Selected for practice';
  choose.setAttribute('aria-pressed', String(selectedSong !== null && selectedSong.id === song.id));
  actions.appendChild(choose);
  let saveLabel = 'Save song';
  if (isFavorite(song)) saveLabel = 'Remove saved song';
  const save = makeButton(saveLabel, () => toggleFavorite(song));
  save.setAttribute('aria-pressed', String(isFavorite(song)));
  actions.appendChild(save);
  if (safeLink(song.preview)) actions.appendChild(makeButton('Listen to preview', () => showPreview(song)));
  if (safeLink(song.link)) {
    const link = makeElement('a', 'Listen on Apple Music');
    link.href = song.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    actions.appendChild(link);
  }
  copy.appendChild(actions);
  row.appendChild(copy);
  return row;
}

function renderResults() {
  results.textContent = '';
  for (const song of searchSongs) results.appendChild(songRow(song));
}

function renderSaved() {
  savedSongs.textContent = '';
  if (favorites.length === 0) savedSongs.appendChild(makeElement('p', 'Songs you save will appear here.'));
  for (const song of favorites) savedSongs.appendChild(songRow(song));
  const journal = document.querySelector('#journal-entries');
  journal.textContent = '';
  if (entries.length === 0) journal.appendChild(makeElement('p', 'Your first practice note will appear here.'));
  for (const entry of entries) {
    const article = makeElement('article', '', 'journal-entry');
    let title = 'Free practice';
    if (entry.song) title = entry.song.title + ' — ' + entry.song.artist;
    article.appendChild(makeElement('p', title + ' · ' + entry.bpm + ' BPM'));
    article.appendChild(makeElement('p', new Date(entry.date).toLocaleString()));
    article.appendChild(makeElement('p', entry.text, 'entry-note'));
    const actions = makeElement('div', '', 'entry-actions');
    actions.appendChild(makeButton('Practice again', () => {
      tempo.value = entry.bpm;
      selectSong(entry.song);
      restartMetronome();
      document.querySelector('#practice-heading').scrollIntoView();
    }));
    actions.appendChild(makeButton('Delete note', () => {
      if (!readSavedData()) return;
      const remaining = entries.filter(saved => saved.id !== entry.id);
      if (writeSavedData(favorites, remaining)) journalStatus.textContent = 'Practice note deleted.';
    }));
    article.appendChild(actions);
    journal.appendChild(article);
  }
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (searching) return;
  const query = searchInput.value.trim();
  if (!query) {
    searchStatus.textContent = 'Enter a song title or artist.';
    return;
  }
  searching = true;
  searchButton.disabled = true;
  searchStatus.textContent = 'Searching for ' + query + '…';
  searchSongs = [];
  renderResults();
  try {
    const response = await fetch('https://itunes.apple.com/search?term=' + encodeURIComponent(query) + '&entity=song&limit=8&country=us');
    if (!response.ok) throw new Error('Search failed');
    const data = await response.json();
    if (!Array.isArray(data.results)) throw new Error('Unexpected response');
    for (const result of data.results) {
      const song = {
        id: result.trackId,
        title: result.trackName,
        artist: result.artistName,
        artwork: result.artworkUrl100,
        preview: result.previewUrl,
        link: result.trackViewUrl
      };
      if (isSong(song)) searchSongs.push(song);
    }
    renderResults();
    searchStatus.textContent = searchSongs.length + ' recordings found. Choose one to practice.';
    if (searchSongs.length === 0) searchStatus.textContent = 'No recordings found. Try another song title or artist.';
  } catch (error) {
    searchStatus.textContent = 'Search is unavailable right now. Check your connection and try again shortly. You can still use saved songs and the metronome.';
  } finally {
    searching = false;
    searchButton.disabled = false;
  }
});

document.querySelector('#journal-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = note.value.trim();
  if (!text) {
    journalStatus.textContent = 'Write a little about your practice before saving.';
    return;
  }
  if (!readSavedData()) {
    journalStatus.textContent = 'Your note has not been saved. Check the storage message above.';
    return;
  }
  const entry = {
    id: Date.now() + '-' + Math.random(),
    date: new Date().toISOString(),
    song: selectedSong,
    bpm: Number(tempo.value),
    text: text
  };
  if (writeSavedData(favorites, [entry, ...entries])) {
    note.value = '';
    journalStatus.textContent = 'Practice note saved.';
  } else {
    journalStatus.textContent = 'Your note has not been saved. Your text is still here.';
  }
});

function drawBeats() {
  const display = document.querySelector('#beats');
  display.textContent = '';
  for (let number = 1; number <= Number(meter.value); number++) {
    display.appendChild(makeElement('span', String(number)));
  }
}

function scheduleBeats() {
  // The audio clock schedules clicks ahead of the less precise browser timer.
  while (nextBeatTime < audioContext.currentTime + 0.1) {
    const oscillator = audioContext.createOscillator();
    oscillator.frequency.value = 700;
    if (beat === 0) oscillator.frequency.value = 1000;
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.15, nextBeatTime);
    gain.gain.exponentialRampToValueAtTime(0.001, nextBeatTime + 0.04);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(nextBeatTime);
    oscillator.stop(nextBeatTime + 0.045);
    clicks.push(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      clicks = clicks.filter(click => click !== oscillator);
    };
    const currentBeat = beat;
    const timer = setTimeout(() => {
      const indicators = document.querySelectorAll('#beats span');
      for (let index = 0; index < indicators.length; index++) {
        indicators[index].classList.toggle('active', index === currentBeat);
      }
      beatTimers = beatTimers.filter(value => value !== timer);
    }, Math.max(0, (nextBeatTime - audioContext.currentTime) * 1000));
    beatTimers.push(timer);
    nextBeatTime += 60 / Number(tempo.value);
    beat = (beat + 1) % Number(meter.value);
  }
}

function stopMetronome() {
  running = false;
  clearInterval(scheduler);
  for (const timer of beatTimers) clearTimeout(timer);
  beatTimers = [];
  for (const click of clicks) click.stop();
  clicks = [];
  drawBeats();
  metronomeButton.textContent = 'Start metronome';
  metronomeButton.setAttribute('aria-pressed', 'false');
  metronomeStatus.textContent = 'Metronome stopped.';
}

async function startMetronome() {
  if (starting) return;
  starting = true;
  metronomeButton.disabled = true;
  preview.pause();
  try {
    if (!window.AudioContext) throw new Error('Audio unavailable');
    if (!audioContext) audioContext = new AudioContext();
    await audioContext.resume();
    if (audioContext.state !== 'running' || document.hidden) throw new Error('Audio unavailable');
    running = true;
    beat = 0;
    nextBeatTime = audioContext.currentTime + 0.05;
    scheduleBeats();
    scheduler = setInterval(scheduleBeats, 25);
    metronomeButton.textContent = 'Stop metronome';
    metronomeButton.setAttribute('aria-pressed', 'true');
    metronomeStatus.textContent = 'Playing at ' + tempo.value + ' BPM. The first beat is accented.';
  } catch (error) {
    stopMetronome();
    metronomeStatus.textContent = 'Audio could not start. Allow sound for this page and try again, or use another browser.';
  } finally {
    starting = false;
    metronomeButton.disabled = false;
  }
}

function restartMetronome() {
  updatePracticeText();
  if (running) {
    stopMetronome();
    startMetronome();
  }
}

metronomeButton.addEventListener('click', () => {
  if (running) stopMetronome();
  else startMetronome();
});
tempo.addEventListener('input', restartMetronome);
meter.addEventListener('change', () => {
  drawBeats();
  restartMetronome();
});
document.querySelector('#slower').addEventListener('click', () => {
  tempo.value = Math.max(40, Number(tempo.value) - 5);
  restartMetronome();
});
document.querySelector('#faster').addEventListener('click', () => {
  tempo.value = Math.min(200, Number(tempo.value) + 5);
  restartMetronome();
});
document.querySelector('#free-practice').addEventListener('click', () => selectSong(null));
preview.addEventListener('play', stopMetronome);
preview.addEventListener('error', () => {
  document.querySelector('#preview-status').textContent = 'This preview is unavailable. Try another recording or open it on Apple Music.';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopMetronome();
    preview.pause();
    metronomeStatus.textContent = 'Paused while you were away. Press Start to continue.';
  }
});
window.addEventListener('pagehide', stopMetronome);
window.addEventListener('storage', (event) => {
  if (event.key === storageKey || event.key === null) {
    if (readSavedData()) {
      renderSaved();
      renderResults();
    }
  }
});

readSavedData();
renderSaved();
drawBeats();
updatePracticeText();
