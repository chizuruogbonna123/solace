console.log('Script loaded - starting execution');

const SYSTEM = `You are a warm, empathetic personal journal companion embedded in a private diary app called Solace. Your role is to help users reflect, process their thoughts, and capture their experiences meaningfully.

Core Identity: You are not a chatbot. You are a trusted confidant — patient, perceptive, and always present. You exist solely to serve the writer's inner world.

When a user shares a journal entry or writes about their day:
- Lead with empathy — acknowledge feelings before offering anything else
- Reflect back what you heard so the user feels truly seen
- Ask exactly ONE thoughtful follow-up question to invite deeper exploration
- Never overwhelm with multiple questions or unsolicited advice

When a user asks for writing help:
- Help them find words for feelings they can't quite name
- Offer 2-3 tailored prompts based on their mood or situation
- Suggest, never prescribe — it's their voice, not yours

Tone Rules:
- Warm and unhurried, like a wise friend with unlimited time
- Never clinical, preachy, performatively cheerful, or robotic
- Mirror the user's energy — gentle when they're low, bright when they're excited
- Keep responses to 2-4 sentences max unless they ask for more
- This is their diary. You are a guest in it.

Hard Rules:
- NEVER diagnose, prescribe, or act as a therapist
- NEVER offer unsolicited feedback on the user's choices or values
- If serious distress or self-harm is mentioned, respond with deep care and gently direct them to professional support
- Every entry is sacred — handle each word with the care it deserves`;

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let failCount = 0;
let lockUntil = 0;
let entries = [];
let curId = null;
let curMood = '';
let curTags = [];
let exportFmt = 'txt';
let exportScope = 'current';
let activeMoodFilter = '';
let searchQuery = '';
let calendarMonth = new Date();
let isDarkMode = false;
let promptIndex = 0;
let pendingNewEntryId = null;
let isRecording = false;
let reminderEnabled = false;
let reminderTime = '19:00';
let reminderInterval = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecordingVoiceNote = false;
let isNewEntryMode = false;
let currentPrompt = null;
let habits = [];
let timeCapsules = [];
let writingStreak = 0;
let lastEntryDate = null;

const PROMPTS = [
  "What's something small that made you smile today?",
  "How are you feeling right now, and why?",
  "What challenged you today, and what did you learn?",
  "Who or what are you grateful for today?",
  "Describe a moment of peace or calm from your day.",
  "What would you do if you had no fear?",
  "What's something you want to remember about today?",
  "How did you take care of yourself today?",
  "What's on your mind the most right now?",
  "What brought you joy today, no matter how small?",
  "If today was a color, what would it be and why?",
  "What's something you're proud of lately?",
  "What do you need right now?",
  "Write about a conversation that stayed with you.",
  "What does success look like for you this week?",
  "When did you feel most like yourself today?",
  "What are you dreaming about?",
  "Describe what's in your heart right now.",
  "What would you tell your past self?",
  "What gives you hope?"
];

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
function init() {
  console.log('Init starting...');
  const savedPin = localStorage.getItem('sol_pin');
  const name = localStorage.getItem('sol_name');
  console.log('Saved PIN exists:', !!savedPin);
  console.log('Saved name:', name);
  entries = JSON.parse(localStorage.getItem('sol_entries') || '[]');
  console.log('Entries loaded:', entries.length);
  entries = entries.map(e => {
    if (!e.sections) {
      e.sections = e.body ? [{ id: sid(), ts: e.date, text: e.body }] : [];
      delete e.body;
    }
    if (!e.images) e.images = [];
    if (!e.voiceNotes) e.voiceNotes = [];
    return e;
  });

  // Load theme preference
  isDarkMode = localStorage.getItem('sol_dark_mode') === 'true';
  if (isDarkMode) {
    document.body.classList.add('dark-mode');
    document.getElementById('theme-toggle').textContent = '☀️';
  }

  // Load reminder settings
  reminderEnabled = localStorage.getItem('sol_reminder_enabled') === 'true';
  reminderTime = localStorage.getItem('sol_reminder_time') || '19:00';
  if (reminderEnabled) {
    requestNotificationPermission();
    scheduleReminder();
  }

  if (!savedPin) { 
    console.log('No PIN found - showing setup screen');
    show('setup-screen'); 
  }
  else {
    if (name) document.getElementById('lock-greet').textContent = 'Welcome back, ' + name;
    console.log('PIN found - showing lock screen');
    show('lock-screen');
  }

  document.getElementById('h-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday:'long', month:'long', day:'numeric', year:'numeric'
  });

  // FIX: attach modal overlay listener here after DOM ready, not at bottom of script
  document.getElementById('export-modal').addEventListener('click', function(e) {
    if (e.target === this) closeExportModal();
  });
  const calendarOverlay = document.getElementById('calendar-modal');
  if (calendarOverlay) {
    calendarOverlay.addEventListener('click', function(e) {
      if (e.target === this) closeCalendar();
    });
  }
  document.getElementById('settings-modal').addEventListener('click', function(e) {
    if (e.target === this) closeSettings();
  });
  document.getElementById('prompt-modal').addEventListener('click', function(e) {
    if (e.target === this) closePrompt();
  });
  console.log('Init complete');
}

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.page-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
  const pageEl = document.querySelector('.page-' + page);
  if (pageEl) pageEl.classList.add('active');
  if (page === 'calendar') renderCalendar();
  if (page === 'stats') renderStats();
}

function sid() { return 'sec_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

// ══════════════════════════════════════════
// SETUP
// ══════════════════════════════════════════
function goStep2() {
  console.log('goStep2 called');
  alert('Continue button clicked!');
  const name = document.getElementById('inp-name').value.trim();
  console.log('Name entered:', name);
  if (!name) { 
    document.getElementById('err1').textContent = 'Please enter your name.'; 
    console.log('No name provided');
    return; 
  }
  alert('Name is: ' + name);
  document.getElementById('err1').textContent = '';
  document.getElementById('s1').classList.remove('active');
  document.getElementById('s2').classList.add('active');
  document.getElementById('inp-pin1').focus();
  console.log('Moved to step 2');
}

function finishSetup() {
  const p1 = document.getElementById('inp-pin1').value.trim();
  const p2 = document.getElementById('inp-pin2').value.trim();
  const err = document.getElementById('err2');
  if (!/^\d{4}$/.test(p1)) { err.textContent = 'PIN must be exactly 4 digits.'; return; }
  if (p1 !== p2) { err.textContent = 'PINs do not match. Try again.'; return; }
  err.textContent = '';
  localStorage.setItem('sol_name', document.getElementById('inp-name').value.trim());
  localStorage.setItem('sol_pin', p1);
  openApp();
}

// ══════════════════════════════════════════
// LOCK / PIN
// ══════════════════════════════════════════
let pinBuffer = '';

function nkPress(n) {
  // FIX: hard return during lockout period; show live remaining seconds
  if (Date.now() < lockUntil) {
    const secs = Math.ceil((lockUntil - Date.now()) / 1000);
    document.getElementById('lock-err').textContent = 'Too many attempts. Wait ' + secs + 's.';
    return;
  }
  if (pinBuffer.length >= 4) return;
  pinBuffer += String(n);
  updateDots();
  if (pinBuffer.length === 4) setTimeout(checkPin, 180);
}

function nkDel() {
  pinBuffer = pinBuffer.slice(0, -1);
  updateDots();
  document.getElementById('lock-err').textContent = '';
}

function updateDots() {
  for (let i = 0; i < 4; i++)
    document.getElementById('pd' + i).classList.toggle('on', i < pinBuffer.length);
}

function checkPin() {
  const saved = localStorage.getItem('sol_pin');
  if (pinBuffer === saved) {
    // FIX: reset lockUntil on success
    failCount = 0; lockUntil = 0; pinBuffer = ''; updateDots(); openApp();
  } else {
    failCount++;
    if (failCount >= 5) {
      lockUntil = Date.now() + 30000;
      document.getElementById('lock-err').textContent = 'Too many attempts. Locked for 30s.';
    } else {
      document.getElementById('lock-err').textContent = 'Incorrect PIN. ' + (5 - failCount) + ' attempt' + (5 - failCount === 1 ? '' : 's') + ' left.';
    }
    const dots = document.getElementById('pin-dots');
    dots.style.animation = 'none';
    dots.offsetHeight;
    dots.style.animation = 'shakeX 0.45s ease';
    pinBuffer = '';
    setTimeout(updateDots, 460);
  }
}

function lockApp() {
  pinBuffer = ''; updateDots();
  document.getElementById('lock-err').textContent = '';
  show('lock-screen');
}

function resetAll(e) {
  e.preventDefault();
  if (!confirm('This will permanently delete all your diary entries and reset your PIN. Are you sure?')) return;
  localStorage.clear(); location.reload();
}

// ══════════════════════════════════════════
// APP
// ══════════════════════════════════════════
function openApp() {
  show('app-screen');
  showPage('journal');
  renderList();
  renderStats();
  if (entries.length === 0) showEmpty();
  else loadEntry(entries[0].id);
}

function showEmpty() {
  document.getElementById('ed-empty').style.display = 'flex';
  document.getElementById('ed-content').style.display = 'none';
  // FIX: clear curId so updateWordCount / save guards work correctly
  curId = null;
}

function showEditor() {
  document.getElementById('ed-empty').style.display = 'none';
  document.getElementById('ed-content').style.display = 'flex';
  document.getElementById('ed-content').style.flexDirection = 'column';
}

// ══════════════════════════════════════════
// SEARCH & FILTER
// ══════════════════════════════════════════
function filterEntries() {
  // FIX: flush live DOM text into state before searching so unsaved text is found
  flushSectionsFromDOM();
  searchQuery = document.getElementById('search-in').value.toLowerCase().trim();
  renderList();
}

function setMoodFilter(btn, mood) {
  activeMoodFilter = mood;
  document.querySelectorAll('.mf-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderList();
}

function getFilteredEntries() {
  return entries.filter(e => {
    const matchesMood = !activeMoodFilter || e.mood === activeMoodFilter;
    if (!matchesMood) return false;
    if (!searchQuery) return true;
    const fullText = (e.title || '') + ' ' + (e.sections || []).map(s => s.text).join(' ') + ' ' + (e.tags || []).join(' ');
    return fullText.toLowerCase().includes(searchQuery);
  });
}

// FIX: sync live textarea values into entries state before any read operation
function flushSectionsFromDOM() {
  if (!curId) return;
  document.querySelectorAll('.section-body').forEach(ta => {
    const secId = ta.dataset.secId;
    if (!secId) return;
    const e = entries.find(x => x.id === curId);
    if (!e) return;
    const sec = e.sections.find(s => s.id === secId);
    if (sec) sec.text = ta.value;
  });
}

// ══════════════════════════════════════════
// ENTRIES LIST
// ══════════════════════════════════════════
function renderList() {
  const list = document.getElementById('entries-list');
  list.innerHTML = '';
  const filtered = getFilteredEntries();
  if (filtered.length === 0) {
    list.innerHTML = '<div style="padding:1rem;font-size:0.78rem;color:var(--muted);text-align:center;">' +
      (entries.length === 0 ? 'No entries yet.<br/>Create your first one!' : 'No matches found.') + '</div>';
    return;
  }
  filtered.forEach(e => {
    const div = document.createElement('div');
    div.className = 'entry-row' + (e.id === curId ? ' active' : '');
    div.onclick = () => loadEntry(e.id);
    const snippet = (e.sections && e.sections[0]) ? e.sections[0].text.slice(0, 60) : '';
    // FIX: build innerHTML without template literal interpolation of untrusted id into onclick
    const delBtn = document.createElement('button');
    delBtn.className = 'er-del';
    delBtn.textContent = '✕';
    delBtn.onclick = (ev) => deleteEntry(ev, e.id);

    const title = document.createElement('div');
    title.className = 'er-title';
    title.textContent = e.title || 'Untitled';

    const date = document.createElement('div');
    date.className = 'er-date';
    date.textContent = fmtDate(e.date);

    div.appendChild(delBtn);
    div.appendChild(title);
    div.appendChild(date);

    if (e.mood) {
      const mood = document.createElement('div');
      mood.className = 'er-mood';
      mood.textContent = e.mood;
      div.appendChild(mood);
    }
    if (snippet) {
      const snip = document.createElement('div');
      snip.style.cssText = 'font-size:0.7rem;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      snip.textContent = snippet;
      div.appendChild(snip);
    }
    list.appendChild(div);
  });
}

function newEntry() {
  const id = 'e' + Date.now();
  const now = new Date().toISOString();
  const entry = { id, title:'', sections:[{ id:sid(), ts:now, text:'' }], mood:'', tags:[], date:now, images:[], voiceNotes:[] };
  entries.unshift(entry);
  save();
  
  // Initialize editor immediately so user can save anytime
  curId = id;
  curMood = '';
  curTags = [];
  renderList();
  renderStats();
  showEditor();
  document.getElementById('ed-title').value = '';
  document.getElementById('ed-meta').textContent = fmtDate(now);
  resetMoodBtns();
  renderTags();
  renderSections();
  
  // Show prompt after editor is ready
  pendingNewEntryId = id;
  promptIndex = Math.floor(Math.random() * PROMPTS.length);
  showPrompt();
  enterNewEntryMode();
}

function enterNewEntryMode() {
  isNewEntryMode = true;
  updateNewEntryUI();
}

function exitNewEntryMode() {
  isNewEntryMode = false;
  updateNewEntryUI();
}

function updateNewEntryUI() {
  const journal = document.querySelector('.page-journal');
  if (!journal) return;
  journal.classList.toggle('new-entry-mode', isNewEntryMode);
  const banner = document.getElementById('new-entry-banner');
  if (banner) banner.style.display = isNewEntryMode ? 'flex' : 'none';
  if (isNewEntryMode) renderPromptSuggestion();
}

function renderPromptSuggestion() {
  const promptText = currentPrompt || PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
  currentPrompt = promptText;
  const target = document.getElementById('new-entry-prompt-text');
  if (target) target.textContent = promptText;
}

function cancelNewEntry() {
  if (!confirm('Discard this new entry and return to your journal?')) return;
  if (curId) {
    const entry = entries.find(e => e.id === curId);
    const isBlank = entry && !entry.title && (!entry.sections || entry.sections.every(s => !s.text.trim())) && (!entry.images || entry.images.length === 0) && (!entry.voiceNotes || entry.voiceNotes.length === 0);
    if (isBlank) {
      entries = entries.filter(e => e.id !== curId);
      save();
    }
  }
  curId = null;
  exitNewEntryMode();
  renderList();
  if (entries.length > 0) loadEntry(entries[0].id);
  else showEmpty();
}

function showPrompt() {
  const randomIndex = Math.floor(Math.random() * PROMPTS.length);
  currentPrompt = PROMPTS[randomIndex];
  document.getElementById('prompt-text').textContent = currentPrompt;
  document.getElementById('prompt-modal').classList.add('open');
}

function closePrompt() {
  document.getElementById('prompt-modal').classList.remove('open');
  pendingNewEntryId = null;
}

function skipPrompt() {
  // Show next prompt
  promptIndex = (promptIndex + 1) % PROMPTS.length;
  showPrompt();
}

function usePrompt() {
  if (pendingNewEntryId) {
    document.getElementById('ed-title').value = currentPrompt;
    pendingNewEntryId = null;
    closePrompt();
  }
}

function startBlank() {
  if (pendingNewEntryId) {
    pendingNewEntryId = null;
  }
  closePrompt();
  const titleInput = document.getElementById('ed-title');
  if (titleInput) {
    titleInput.focus();
  }
}

function loadEntry(id) {
  exitNewEntryMode();
  const e = entries.find(x => x.id === id);
  if (!e) return;
  curId = id; curMood = e.mood || ''; curTags = [...(e.tags || [])];
  showEditor();
  document.getElementById('ed-title').value = e.title || '';
  document.getElementById('ed-meta').textContent = fmtDate(e.date);
  document.querySelectorAll('.mbtn').forEach(b => b.classList.toggle('on', b.textContent.trim() === curMood));
  renderTags(); renderSections(); renderList();
  updateWordCount();
}

function saveEntry() {
  if (!curId) return;
  const e = entries.find(x => x.id === curId);
  if (!e) return;
  // FIX: flush live DOM content before saving
  flushSectionsFromDOM();
  e.title = document.getElementById('ed-title').value.trim() || 'Untitled';
  e.mood = curMood;
  e.tags = [...curTags];
  save(); renderList(); renderStats();
  toast('Entry saved ✓');
  if (isNewEntryMode) exitNewEntryMode();
}

// FIX: separate silent auto-save that does NOT force title to 'Untitled' on blank new entries
function autoSave() {
  if (!curId) return;
  const e = entries.find(x => x.id === curId);
  if (!e) return;
  flushSectionsFromDOM();
  const titleVal = document.getElementById('ed-title').value.trim();
  if (titleVal) e.title = titleVal;
  e.mood = curMood;
  e.tags = [...curTags];
  save();
}

function deleteEntry(ev, id) {
  ev.stopPropagation();
  if (!confirm('Are you sure you want to delete this entry?')) return;
  entries = entries.filter(e => e.id !== id);
  if (curId === id) {
    curId = null;
    // FIX: guard empty array — don't call entries[0].id when entries is empty
    if (entries.length > 0) loadEntry(entries[0].id);
    else showEmpty();
  }
  save(); renderList(); renderStats();
  toast('Entry deleted');
}

function deleteEntryPrompt() {
  if (!curId) {
    toast('Select an entry first to delete it.');
    return;
  }
  deleteEntry({ stopPropagation: () => {} }, curId);
}

function save() { localStorage.setItem('sol_entries', JSON.stringify(entries)); }

// ══════════════════════════════════════════
// SECTIONS (timestamped blocks)
// ══════════════════════════════════════════
function renderSections() {
  const e = entries.find(x => x.id === curId);
  const container = document.getElementById('sections-container');
  container.innerHTML = '';
  if (!e) return;

  e.sections.forEach((sec, idx) => {
    container.appendChild(makeSectionBlock(sec, idx, e.sections.length));
    if (idx < e.sections.length - 1) container.appendChild(makeDivider(idx));
  });

  // Render multimedia content
  if ((e.images && e.images.length > 0) || (e.voiceNotes && e.voiceNotes.length > 0)) {
    container.appendChild(makeMultimediaGallery(e));
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'add-section-btn';
  addBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add timestamped section';
  addBtn.onclick = () => addSection();
  container.appendChild(addBtn);

  // FIX: use requestAnimationFrame so textareas are painted before height measurement
  requestAnimationFrame(autoGrowAll);
}

function makeSectionBlock(sec, idx, total) {
  const block = document.createElement('div');
  block.className = 'section-block';
  block.dataset.secId = sec.id;

  const header = document.createElement('div');
  header.className = 'section-header';

  const ts = document.createElement('div');
  ts.className = 'section-timestamp';
  ts.textContent = fmtTimestamp(sec.ts);

  const delBtn = document.createElement('button');
  delBtn.className = 'section-del-btn';
  delBtn.title = 'Delete section';
  delBtn.textContent = '✕';
  delBtn.onclick = () => deleteSection(sec.id);
  if (total === 1) delBtn.style.display = 'none';

  header.appendChild(ts);
  header.appendChild(delBtn);

  const ta = document.createElement('textarea');
  ta.className = 'section-body';
  ta.placeholder = idx === 0 ? 'This space is yours alone. Write freely…' : 'Continue your thought…';
  ta.value = sec.text || '';
  ta.dataset.secId = sec.id;

  // FIX: always look up section from entries by secId to avoid stale closure reference
  ta.oninput = function() {
    const entry = entries.find(x => x.id === curId);
    if (entry) {
      const s = entry.sections.find(s => s.id === this.dataset.secId);
      if (s) s.text = this.value;
    }
    autoGrow(this);
    updateWordCount();
  };

  ta.onkeydown = function(ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 's') {
      ev.preventDefault(); saveEntry();
    }
  };

  block.appendChild(header);
  block.appendChild(ta);
  return block;
}

function makeMultimediaGallery(entry) {
  const gallery = document.createElement('div');
  gallery.className = 'media-gallery';

  // Add images
  if (entry.images && entry.images.length > 0) {
    entry.images.forEach(img => {
      const item = document.createElement('div');
      item.className = 'media-item';

      const imgElement = document.createElement('img');
      imgElement.src = img.data;
      imgElement.alt = img.filename || 'Entry image';
      imgElement.style.cursor = 'pointer';
      imgElement.onclick = () => openImageModal(img.data);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'media-delete';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = () => deleteMediaItem('image', img.id);

      const timestamp = document.createElement('div');
      timestamp.className = 'media-timestamp';
      timestamp.textContent = fmtTimestamp(img.timestamp);

      item.appendChild(imgElement);
      item.appendChild(deleteBtn);
      item.appendChild(timestamp);
      gallery.appendChild(item);
    });
  }

  // Add voice notes
  if (entry.voiceNotes && entry.voiceNotes.length > 0) {
    entry.voiceNotes.forEach(note => {
      const item = document.createElement('div');
      item.className = 'media-item';

      const audio = document.createElement('audio');
      audio.src = note.data;
      audio.controls = true;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'media-delete';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = () => deleteMediaItem('voice', note.id);

      const timestamp = document.createElement('div');
      timestamp.className = 'media-timestamp';
      timestamp.textContent = fmtTimestamp(note.timestamp);

      item.appendChild(audio);
      item.appendChild(deleteBtn);
      item.appendChild(timestamp);
      gallery.appendChild(item);
    });
  }

  return gallery;
}

function makeDivider(afterIdx) {
  const div = document.createElement('div');
  div.className = 'section-divider';
  div.innerHTML = '<span>· · ·</span>';
  div.title = 'Click to insert section here';
  div.onclick = () => addSectionAt(afterIdx + 1);
  return div;
}

function addSection(insertAt) {
  const e = entries.find(x => x.id === curId);
  if (!e) return;
  const newSec = { id: sid(), ts: new Date().toISOString(), text: '' };
  if (insertAt !== undefined) e.sections.splice(insertAt, 0, newSec);
  else e.sections.push(newSec);
  save();
  renderSections();
  setTimeout(() => {
    const ta = document.querySelector('textarea[data-sec-id="' + newSec.id + '"]');
    if (ta) ta.focus();
  }, 60);
}

function addSectionAt(idx) { addSection(idx); }

function deleteSection(secId) {
  const e = entries.find(x => x.id === curId);
  if (!e || e.sections.length <= 1) return;
  if (!confirm('Delete this section?')) return;
  e.sections = e.sections.filter(s => s.id !== secId);
  save(); renderSections(); updateWordCount();
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function autoGrowAll() {
  document.querySelectorAll('.section-body').forEach(autoGrow);
}

function updateWordCount() {
  // FIX: guard when no entry is open to avoid crash
  if (!curId) { document.getElementById('word-count').textContent = ''; return; }
  const e = entries.find(x => x.id === curId);
  if (!e) return;
  const allText = (e.sections || []).map(s => s.text).join(' ');
  const words = allText.trim() ? allText.trim().split(/\s+/).length : 0;
  const chars = allText.length;
  document.getElementById('word-count').textContent =
    words + ' word' + (words !== 1 ? 's' : '') + ' · ' + chars + ' character' + (chars !== 1 ? 's' : '');
}

// ══════════════════════════════════════════
// MULTIMEDIA
// ══════════════════════════════════════════
function addImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageData = {
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            data: event.target.result,
            filename: file.name,
            timestamp: new Date().toISOString()
          };
          addImageToEntry(imageData);
        };
        reader.readAsDataURL(file);
      }
    });
  };
  input.click();
}

function addImageToEntry(imageData) {
  if (!curId) return;
  const e = entries.find(x => x.id === curId);
  if (!e) return;

  if (!e.images) e.images = [];
  e.images.push(imageData);
  save();
  renderSections();
  toast('Image added!');
}

function startVoiceNoteRecording() {
  if (!curId) return;

  if (isRecordingVoiceNote) {
    stopVoiceNoteRecording();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Voice recording not supported in this browser');
    return;
  }

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      recordedChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (event) => {
          const voiceNoteData = {
            id: 'voice_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            data: event.target.result,
            timestamp: new Date().toISOString()
          };
          addVoiceNoteToEntry(voiceNoteData);
        };
        reader.readAsDataURL(audioBlob);

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecordingVoiceNote = true;
      document.querySelector('.media-btn[title="Record voice note"]').classList.add('recording');
      toast('Recording voice note... Click again to stop');
    })
    .catch(err => {
      console.error('Error accessing microphone:', err);
      toast('Could not access microphone');
    });
}

function stopVoiceNoteRecording() {
  if (mediaRecorder && isRecordingVoiceNote) {
    mediaRecorder.stop();
    isRecordingVoiceNote = false;
    document.querySelector('.media-btn[title="Record voice note"]').classList.remove('recording');
  }
}

function addVoiceNoteToEntry(voiceNoteData) {
  if (!curId) return;
  const e = entries.find(x => x.id === curId);
  if (!e) return;

  if (!e.voiceNotes) e.voiceNotes = [];
  e.voiceNotes.push(voiceNoteData);
  save();
  renderSections();
  toast('Voice note added!');
}

function deleteMediaItem(type, id) {
  if (!curId) return;
  const e = entries.find(x => x.id === curId);
  if (!e) return;

  if (type === 'image') {
    e.images = e.images.filter(img => img.id !== id);
  } else if (type === 'voice') {
    e.voiceNotes = e.voiceNotes.filter(note => note.id !== id);
  }

  save();
  renderSections();
  toast('Media item deleted');
}

// ══════════════════════════════════════════
// MOOD & TAGS
// ══════════════════════════════════════════
function pickMood(btn, mood) {
  curMood = mood;
  document.querySelectorAll('.mbtn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

function resetMoodBtns() {
  document.querySelectorAll('.mbtn').forEach(b => b.classList.remove('on'));
  curMood = '';
}

function tagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    // FIX: strip commas, trim whitespace, reject empty strings and duplicates
    const val = document.getElementById('tag-in').value.replace(/,/g, '').trim();
    if (val && !curTags.includes(val)) { curTags.push(val); renderTags(); }
    document.getElementById('tag-in').value = '';
  }
}

function removeTag(tag) { curTags = curTags.filter(t => t !== tag); renderTags(); }

function renderTags() {
  const wrap = document.getElementById('tags-wrap');
  wrap.querySelectorAll('.tag-pill').forEach(p => p.remove());
  const input = document.getElementById('tag-in');
  curTags.forEach(tag => {
    const pill = document.createElement('div');
    pill.className = 'tag-pill';
    // FIX: use DOM creation instead of innerHTML with injected tag strings to prevent XSS
    const span = document.createElement('span');
    span.textContent = tag;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.onclick = () => removeTag(tag);
    pill.appendChild(span);
    pill.appendChild(btn);
    wrap.insertBefore(pill, input);
  });
}

// ══════════════════════════════════════════
// STATS
// ══════════════════════════════════════════
function renderStats() {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const totalEntries = entries.length;
  const totalWords = entries.reduce((sum, e) => {
    const txt = (e.sections || []).map(s => s.text).join(' ').trim();
    return sum + (txt ? txt.split(/\s+/).length : 0);
  }, 0);

  const { moodCounts, monthlyTrends } = getMoodTrends();
  const { dayOfWeek, hourOfDay } = getWritingPatterns();
  const moodOrder = ['🌟 Great','😊 Good','😐 Okay','😔 Low','😤 Frustrated'];
  const maxMood = Math.max(...Object.values(moodCounts), 1);

  // Find most productive day and hour
  const bestDay = Object.keys(dayOfWeek).reduce((a, b) => dayOfWeek[a] > dayOfWeek[b] ? a : b, '');
  const bestHour = Object.keys(hourOfDay).reduce((a, b) => hourOfDay[a] > hourOfDay[b] ? a : b, '');

  grid.innerHTML =
    '<div class="streak-box">' +
      '<div class="streak-flame">🔥</div>' +
      '<div class="streak-info">' +
        '<div class="streak-num">' + writingStreak + ' day' + (writingStreak !== 1 ? 's' : '') + '</div>' +
        '<div class="streak-lbl">Writing streak</div>' +
      '</div>' +
    '</div>' +
    '<div class="stat-box"><div class="stat-num">' + totalEntries + '</div><div class="stat-lbl">Entries</div></div>' +
    '<div class="stat-box"><div class="stat-num">' + fmtNum(totalWords) + '</div><div class="stat-lbl">Words</div></div>' +
    '<div class="stat-box"><div class="stat-num">' + habits.length + '</div><div class="stat-lbl">Habits</div></div>' +
    '<div class="stat-box"><div class="stat-num">' + timeCapsules.length + '</div><div class="stat-lbl">Time Capsules</div></div>' +
    '<div class="insights-box">' +
      '<div class="insights-title">✨ Insights</div>' +
      '<div class="insights-list">' +
        (bestDay ? '<div>• You write most on ' + bestDay + 's</div>' : '') +
        (bestHour ? '<div>• Peak writing time: ' + bestHour + ':00</div>' : '') +
        (writingStreak > 7 ? '<div>• You\'re on fire! ' + writingStreak + ' day streak</div>' : '') +
        (totalWords > 10000 ? '<div>• You\'ve written over 10,000 words!</div>' : '') +
      '</div>' +
    '</div>' +
    '<div class="mood-bar-wrap"><div class="mood-bar-lbl">Mood overview</div><div class="mood-bars">' +
    moodOrder.map(m => {
      const cnt = moodCounts[m] || 0;
      const pct = cnt ? Math.round((cnt / maxMood) * 100) : 0;
      return '<div class="mood-bar-row">' +
        '<span style="width:18px">' + m.split(' ')[0] + '</span>' +
        '<div class="mood-bar-fill-wrap"><div class="mood-bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="mood-bar-count">' + cnt + '</span>' +
        '</div>';
    }).join('') +
    '</div></div>';
}

// FIX: streak handles today-only, yesterday-only (not yet written today), and consecutive days correctly
function calcStreak() {
  if (entries.length === 0) return 0;
  const days = new Set(entries.map(e => e.date.slice(0, 10)));
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = new Date(today);

  // If no entry today, check if streak should start from yesterday
  if (!days.has(d.toISOString().slice(0, 10))) {
    d.setDate(d.getDate() - 1);
    if (!days.has(d.toISOString().slice(0, 10))) return 0;
  }

  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function fmtNum(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n; }

// ══════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════
function openExportModal() { document.getElementById('export-modal').classList.add('open'); }
function closeExportModal() { document.getElementById('export-modal').classList.remove('open'); }

// ══════════════════════════════════════════
// IMAGE MODAL
// ══════════════════════════════════════════
function openImageModal(src) {
  document.getElementById('image-modal-img').src = src;
  document.getElementById('image-modal').classList.add('open');
}
function closeImageModal() {
  document.getElementById('image-modal').classList.remove('open');
}

function selectExportFmt(fmt) {
  exportFmt = fmt;
  ['txt','html','json'].forEach(f => {
    document.getElementById('opt-' + f).classList.toggle('selected', f === fmt);
  });
}

function selectScope(scope) {
  exportScope = scope;
  ['current','all'].forEach(s => {
    document.getElementById('scope-' + s).classList.toggle('selected', s === scope);
  });
}

function doExport() {
  // FIX: flush live DOM content before exporting
  flushSectionsFromDOM();
  const toExport = exportScope === 'all' ? entries : entries.filter(e => e.id === curId);
  if (!toExport.length) { toast('Nothing to export.'); closeExportModal(); return; }

  let content = '', filename = '', mime = '';

  if (exportFmt === 'txt') {
    content = toExport.map(e => {
      const sections = (e.sections || []).map(s =>
        ' [' + fmtTimestamp(s.ts) + ']\n ' + (s.text || '(empty)')
      ).join('\n\n');
      return '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        (e.title || 'Untitled') + '\n' +
        fmtDate(e.date) + (e.mood ? ' | ' + e.mood : '') + (e.tags && e.tags.length ? ' | #' + e.tags.join(' #') : '') + '\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        sections + '\n';
    }).join('\n\n');
    filename = 'solace-diary-' + Date.now() + '.txt';
    mime = 'text/plain';

  } else if (exportFmt === 'json') {
    content = JSON.stringify({ exported: new Date().toISOString(), entries: toExport }, null, 2);
    filename = 'solace-backup-' + Date.now() + '.json';
    mime = 'application/json';

  } else if (exportFmt === 'html') {
    const entriesHTML = toExport.map(e => {
      const sectionsHTML = (e.sections || []).map(s =>
        '<div class="section">' +
        '<div class="sec-ts">' + fmtTimestamp(s.ts) + '</div>' +
        '<p>' + esc(s.text || '').replace(/\n/g,'<br/>') + '</p>' +
        '</div>'
      ).join('');
      return '<article>' +
        '<h2>' + esc(e.title || 'Untitled') + '</h2>' +
        '<div class="meta">' + fmtDate(e.date) + (e.mood ? ' &nbsp;·&nbsp; ' + e.mood : '') + (e.tags && e.tags.length ? ' &nbsp;·&nbsp; #' + e.tags.join(' #') : '') + '</div>' +
        sectionsHTML + '</article>';
    }).join('');

    content = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>' +
      '<title>Solace — My Diary</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet"/>' +
      '<style>body{font-family:\'Lato\',sans-serif;max-width:720px;margin:0 auto;padding:3rem 2rem;background:#f7f4ee;color:#1c1c1c;}' +
      'h1{font-family:\'Playfair Display\',serif;color:#013220;font-size:2.5rem;font-weight:400;letter-spacing:0.1em;margin-bottom:0.2rem;}' +
      '.subtitle{color:#6b7c74;font-size:0.8rem;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:3rem;}' +
      'article{margin-bottom:3rem;padding:2rem;background:white;border-radius:16px;border:1px solid rgba(1,121,111,0.15);}' +
      'h2{font-family:\'Playfair Display\',serif;font-size:1.6rem;color:#013220;font-weight:400;margin-bottom:0.3rem;}' +
      '.meta{font-size:0.75rem;color:#6b7c74;margin-bottom:1.5rem;letter-spacing:0.05em;}' +
      '.section{margin-bottom:1.5rem;}' +
      '.sec-ts{font-size:0.65rem;color:#01796F;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:0.4rem;padding-bottom:0.3rem;border-bottom:1px solid rgba(1,121,111,0.15);}' +
      'p{font-family:\'Playfair Display\',serif;font-size:1.1rem;line-height:1.9;color:#1c1c1c;}</style></head><body>' +
      '<h1>Solace</h1>' +
      '<div class="subtitle">My Private Diary — Exported ' + new Date().toLocaleDateString() + '</div>' +
      entriesHTML + '</body></html>';
    filename = 'solace-diary-' + Date.now() + '.html';
    mime = 'text/html';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  closeExportModal();
  toast('Exported successfully ✓');
}

// ══════════════════════════════════════════
// THEME
// ══════════════════════════════════════════
function toggleTheme() {
  isDarkMode = !isDarkMode;
  if (isDarkMode) {
    document.body.classList.add('dark-mode');
    document.getElementById('theme-toggle').textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    document.getElementById('theme-toggle').textContent = '🌙';
  }
  localStorage.setItem('sol_dark_mode', isDarkMode);
}

// ══════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════
function openCalendar() {
  showPage('calendar');
}

function closeCalendar() {
  // kept for older references, but calendar view now lives in the app pages
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();

  // Set header
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-year').textContent = monthNames[month] + ' ' + year;

  // Get all dates that have entries
  const entryDates = new Set(entries.map(e => e.date.slice(0, 10)));

  // Build calendar
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Day labels
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayLabels.forEach(label => {
    const labelEl = document.createElement('div');
    labelEl.className = 'cal-day-label';
    labelEl.textContent = label;
    grid.appendChild(labelEl);
  });

  // Days
  const currentDate = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 42; i++) {
    const dayBtn = document.createElement('button');
    dayBtn.className = 'cal-day';
    dayBtn.textContent = currentDate.getDate();

    const dateStr = currentDate.toISOString().slice(0, 10);
    if (currentDate.getMonth() !== month) dayBtn.classList.add('other-month');
    if (entryDates.has(dateStr)) dayBtn.classList.add('has-entry');
    if (currentDate.getTime() === today.getTime()) dayBtn.classList.add('today');

    const clickDate = new Date(currentDate);
    dayBtn.onclick = () => {
      const entriesOnDate = entries.filter(e => e.date.slice(0, 10) === clickDate.toISOString().slice(0, 10));
      if (entriesOnDate.length > 0) {
        closeCalendar();
        loadEntry(entriesOnDate[0].id);
      }
    };

    grid.appendChild(dayBtn);
    currentDate.setDate(currentDate.getDate() + 1);
  }
}

function prevMonth() {
  calendarMonth.setMonth(calendarMonth.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  calendarMonth.setMonth(calendarMonth.getMonth() + 1);
  renderCalendar();
}

// ══════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════
function openSettings() {
  document.getElementById('pin-err').textContent = '';
  document.getElementById('old-pin').value = '';
  document.getElementById('new-pin1').value = '';
  document.getElementById('new-pin2').value = '';
  document.getElementById('reminder-enabled').checked = reminderEnabled;
  document.getElementById('reminder-time').value = reminderTime;
  document.getElementById('settings-modal').classList.add('open');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
}

function saveSettings() {
  const oldPin = document.getElementById('old-pin').value.trim();
  const newPin1 = document.getElementById('new-pin1').value.trim();
  const newPin2 = document.getElementById('new-pin2').value.trim();
  const err = document.getElementById('pin-err');

  if (!oldPin) { err.textContent = 'Enter your current PIN.'; return; }
  if (!newPin1) { err.textContent = 'Enter a new PIN.'; return; }
  if (!newPin2) { err.textContent = 'Confirm your new PIN.'; return; }
  if (!/^\d{4}$/.test(newPin1)) { err.textContent = 'PIN must be exactly 4 digits.'; return; }
  if (newPin1 !== newPin2) { err.textContent = 'New PINs do not match.'; return; }

  const savedPin = localStorage.getItem('sol_pin');
  if (oldPin !== savedPin) { err.textContent = 'Current PIN is incorrect.'; return; }

  localStorage.setItem('sol_pin', newPin1);
  err.textContent = '';
  closeSettings();
  toast('PIN updated ✓');
}

function toggleReminder() {
  reminderEnabled = document.getElementById('reminder-enabled').checked;
  localStorage.setItem('sol_reminder_enabled', reminderEnabled);
  if (reminderEnabled) {
    requestNotificationPermission();
    scheduleReminder();
  } else {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

function updateReminderTime() {
  reminderTime = document.getElementById('reminder-time').value;
  localStorage.setItem('sol_reminder_time', reminderTime);
  if (reminderEnabled) {
    scheduleReminder();
  }
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function scheduleReminder() {
  clearInterval(reminderInterval);
  reminderInterval = setInterval(checkReminder, 60000); // Check every minute
}

function checkReminder() {
  if (!reminderEnabled) return;

  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM
  const today = now.toDateString();

  if (currentTime === reminderTime) {
    // Check if we already reminded today
    const lastReminder = localStorage.getItem('sol_last_reminder');
    if (lastReminder !== today) {
      showReminderNotification();
      localStorage.setItem('sol_last_reminder', today);
    }
  }
}

function showReminderNotification() {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification('Solace Diary Reminder', {
      body: 'Time to reflect and write in your diary! 🌿',
      icon: '/favicon.ico', // You might want to add an icon
      tag: 'solace-reminder'
    });

    notification.onclick = function() {
      window.focus();
      notification.close();
    };

    // Auto-close after 10 seconds
    setTimeout(() => notification.close(), 10000);
  } else {
    // Fallback: show a toast
    toast('Time to write in your diary! 🌿');
  }
}

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// FIX: guard against invalid date strings
function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}

function fmtTimestamp(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  return d.toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// FIX: use autoSave() not saveEntry() for background saves to avoid overwriting blank titles
setInterval(() => { if (curId) autoSave(); }, 30000);

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const isOpen = sidebar.classList.contains('show');
  if (isOpen) {
    sidebar.classList.remove('show');
    document.removeEventListener('click', closeSidebarOnClick);
  } else {
    sidebar.classList.add('show');
    setTimeout(() => document.addEventListener('click', closeSidebarOnClick), 10);
  }
}

function closeSidebarOnClick(e) {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar.contains(e.target) && !e.target.closest('.menu-btn')) {
    sidebar.classList.remove('show');
    document.removeEventListener('click', closeSidebarOnClick);
  }
}

init();

// ══════════════════════════════════════════
// NEW FEATURES
// ══════════════════════════════════════════

// HABITS
function addHabit() {
  const name = prompt('Enter habit name:');
  if (!name) return;

  const habit = {
    id: 'habit_' + Date.now(),
    name: name,
    streak: 0,
    lastCompleted: null,
    created: new Date().toISOString()
  };

  habits.push(habit);
  saveHabits();
  renderHabits();
  toast('Habit added!');
}

function toggleHabit(habitId) {
  const habit = habits.find(h => h.id === habitId);
  if (!habit) return;

  const today = new Date().toISOString().slice(0, 10);
  if (habit.lastCompleted === today) {
    // Uncheck - decrease streak
    habit.lastCompleted = null;
    habit.streak = Math.max(0, habit.streak - 1);
  } else {
    // Check - increase streak
    habit.lastCompleted = today;
    habit.streak += 1;
  }

  saveHabits();
  renderHabits();
}

function deleteHabit(habitId) {
  habits = habits.filter(h => h.id !== habitId);
  saveHabits();
  renderHabits();
  toast('Habit deleted');
}

function renderHabits() {
  const container = document.getElementById('habits-list');
  container.innerHTML = '';

  habits.forEach(habit => {
    const item = document.createElement('div');
    item.className = 'habit-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'habit-check';
    checkbox.checked = habit.lastCompleted === new Date().toISOString().slice(0, 10);
    checkbox.onchange = () => toggleHabit(habit.id);

    const name = document.createElement('div');
    name.className = 'habit-name';
    name.textContent = habit.name;

    const streak = document.createElement('div');
    streak.className = 'habit-streak';
    streak.textContent = habit.streak + ' days';

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.onclick = () => deleteHabit(habit.id);
    deleteBtn.style.cssText = 'background:none;border:none;color:#999;cursor:pointer;font-size:1.2rem;margin-left:8px;';

    item.appendChild(checkbox);
    item.appendChild(name);
    item.appendChild(streak);
    item.appendChild(deleteBtn);
    container.appendChild(item);
  });
}

function saveHabits() {
  localStorage.setItem('sol_habits', JSON.stringify(habits));
}

function loadHabits() {
  habits = JSON.parse(localStorage.getItem('sol_habits') || '[]');
}

// MEMORY LANE
function showRandomMemory() {
  if (entries.length === 0) {
    document.getElementById('memory-content').innerHTML = '<p>No entries yet. Start writing to create memories! 🌱</p>';
    return;
  }

  const randomEntry = entries[Math.floor(Math.random() * entries.length)];
  displayMemoryEntry(randomEntry, 'A random memory from your past');
}

function showThisDayLastYear() {
  const today = new Date();
  const lastYear = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const dateStr = lastYear.toISOString().slice(0, 10);

  const entry = entries.find(e => e.date.startsWith(dateStr));
  if (entry) {
    displayMemoryEntry(entry, `This day last year (${fmtDate(entry.date)})`);
  } else {
    document.getElementById('memory-content').innerHTML = '<p>No entry from this day last year. What a perfect time to reflect on how far you\'ve come! 🌟</p>';
  }
}

function showTimeCapsule() {
  const now = new Date();
  const dueCapsules = timeCapsules.filter(tc => new Date(tc.openDate) <= now);

  if (dueCapsules.length === 0) {
    document.getElementById('memory-content').innerHTML = '<p>No time capsules ready to open yet. Create one for your future self! ⏰</p>';
    return;
  }

  const content = dueCapsules.map(tc => `
    <div class="memory-entry">
      <div class="memory-title">Time Capsule: ${tc.title}</div>
      <div class="memory-date">Created: ${fmtDate(tc.created)} | Opens: ${fmtDate(tc.openDate)}</div>
      <div class="memory-text">${tc.message}</div>
    </div>
  `).join('');

  document.getElementById('memory-content').innerHTML = content;
}

function displayMemoryEntry(entry, title) {
  const content = `
    <div class="memory-entry">
      <div class="memory-title">${title}</div>
      <div class="memory-date">${fmtDate(entry.date)}</div>
      <div class="memory-text">
        <strong>${entry.title || 'Untitled'}</strong><br>
        ${entry.sections.map(s => s.text).join('<br><br>')}
      </div>
    </div>
  `;
  document.getElementById('memory-content').innerHTML = content;
}

// TIME CAPSULES
function createTimeCapsule() {
  const title = prompt('Time capsule title:');
  if (!title) return;

  const message = prompt('Message for your future self:');
  if (!message) return;

  const openDate = prompt('When should this open? (YYYY-MM-DD)');
  if (!openDate) return;

  const capsule = {
    id: 'capsule_' + Date.now(),
    title: title,
    message: message,
    created: new Date().toISOString(),
    openDate: openDate
  };

  timeCapsules.push(capsule);
  saveTimeCapsules();
  toast('Time capsule created! ⏰');
}

function saveTimeCapsules() {
  localStorage.setItem('sol_time_capsules', JSON.stringify(timeCapsules));
}

function loadTimeCapsules() {
  timeCapsules = JSON.parse(localStorage.getItem('sol_time_capsules') || '[]');
}

// ENHANCED ANALYTICS
function getMoodTrends() {
  const moodCounts = {};
  const monthlyTrends = {};

  entries.forEach(entry => {
    if (entry.mood) {
      moodCounts[entry.mood] = (moodCounts[entry.mood] || 0) + 1;

      const month = new Date(entry.date).toISOString().slice(0, 7);
      if (!monthlyTrends[month]) monthlyTrends[month] = {};
      monthlyTrends[month][entry.mood] = (monthlyTrends[month][entry.mood] || 0) + 1;
    }
  });

  return { moodCounts, monthlyTrends };
}

function getWritingPatterns() {
  const dayOfWeek = {};
  const hourOfDay = {};

  entries.forEach(entry => {
    const date = new Date(entry.date);
    const day = date.toLocaleDateString('en-US', { weekday: 'long' });
    const hour = date.getHours();

    dayOfWeek[day] = (dayOfWeek[day] || 0) + 1;
    hourOfDay[hour] = (hourOfDay[hour] || 0) + 1;
  });

  return { dayOfWeek, hourOfDay };
}

// WRITING STREAKS
function updateWritingStreak() {
  if (entries.length === 0) {
    writingStreak = 0;
    lastEntryDate = null;
    return;
  }

  // Sort entries by date
  const sortedEntries = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
  const today = new Date().toISOString().slice(0, 10);
  let streak = 0;
  let currentDate = new Date(today);

  for (const entry of sortedEntries) {
    const entryDate = new Date(entry.date).toISOString().slice(0, 10);

    if (entryDate === currentDate.toISOString().slice(0, 10)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (entryDate < currentDate.toISOString().slice(0, 10)) {
      // Gap in streak
      break;
    }
  }

  writingStreak = streak;
  lastEntryDate = sortedEntries[0].date;
  localStorage.setItem('sol_writing_streak', writingStreak);
  localStorage.setItem('sol_last_entry_date', lastEntryDate);
}

function loadWritingStreak() {
  writingStreak = parseInt(localStorage.getItem('sol_writing_streak') || '0');
  lastEntryDate = localStorage.getItem('sol_last_entry_date');
}

// INITIALIZE NEW FEATURES
function initNewFeatures() {
  loadHabits();
  loadTimeCapsules();
  loadWritingStreak();
  updateWritingStreak();
}

// Add to main init
const originalInit = init;
init = function() {
  originalInit();
  initNewFeatures();
};
