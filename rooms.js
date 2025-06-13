/*  OI APPARO – Synced Music-Room module (fixed)  */
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL  = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI";
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ───────── helpers ───────── */
const $ = id => document.getElementById(id);
const rand = (set, n) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
const genCode     = () => rand('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
const genPassword = () => rand('abcdefghijkmnpqrstuvwxyz23456789', 8);
const ytId = url   => { const m = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; };

/* ───────── state ───────── */
let roomCode  = null;     // 6-char code
let isOwner   = false;
let pollTimer = null;
const userName = `apparo${Math.floor(Math.random() * 1000)}`;
let currentVideoId = null;

/* ───────── DOM refs ───────── */
const codeIn      = $('room-code-input');
const passIn      = $('room-password-input');
const setupBox    = $('room-setup');
const roomBox     = $('room-interface');
const createdInfo = $('created-room-info');
const createdCode = $('created-room-code');
const createdPass = $('created-room-pass');
const currCode    = $('current-room-code');
const ownerHint   = $('owner-hint');

const ytInput  = $('youtube-url');
const addBtn   = $('add-track');
const nextBtn  = $('next-track');
const listUL   = $('track-list');
const iframe   = $('yt-player');

const chatInput = $('chat-input');
const sendBtn   = $('send-chat');
const chatUL    = $('chat-list');

/* ───────── room workflow ───────── */
async function createRoom () {
  const code = genCode();
  const pass = genPassword();

  const { error } = await db.from('rooms').insert({ code, password: pass });
  if (error) { alert('DB error – could not create'); return; }

  createdCode.textContent  = code;
  createdPass.textContent  = pass;
  createdInfo.style.display = 'block';
  enterRoom(code, pass, true);
}

async function joinRoom () {
  const code = codeIn.value.trim().toUpperCase();
  const pass = passIn.value.trim();
  if (!code || !pass) return alert('Enter code & password');

  const { data, error } = await db.from('rooms').select('*').eq('code', code).single();
  if (error || !data)             return alert('Room not found');
  if (data.password !== pass)     return alert('Wrong password');

  enterRoom(code, pass, false);
}

function enterRoom (code, pass, ownerFlag) {
  roomCode   = code;
  isOwner    = ownerFlag;

  currCode.textContent     = `${code} (🔐 ${pass}) – you are ${userName}`;
  ownerHint.style.display  = ownerFlag ? 'block' : 'none';
  nextBtn.disabled         = !ownerFlag;

  setupBox.style.display   = 'none';
  roomBox.style.display    = 'block';

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => { refreshQueue(); refreshChat(); }, 4000);

  refreshQueue();
  refreshChat();
}

/* ───────── queue logic ───────── */
async function addTrack () {
  const fullUrl = ytInput.value.trim();
  const videoId = ytId(fullUrl);
  if (!videoId)     return alert('Invalid YouTube link');
  if (!roomCode)    return alert('Join or create a room first');

  const track = {
    room_code   : roomCode,
    youtube_url : fullUrl,
    video_id    : videoId,
    status      : 'queued',
    added_by    : userName,
    start_time  : null
  };

  const { error } = await db.from('room_videos').insert(track);
  if (error) {
    console.error('Track insert failed:', error.message);
    return alert('Could not add video');
  }

  ytInput.value = '';
  refreshQueue();
}

async function refreshQueue() {
  if (!roomCode) return;

  const { data } = await db.from('room_videos')
    .select('*')
    .eq('room_code', roomCode)
    .order('id', { ascending: true });

  if (!data) return;

  listUL.innerHTML = '';
  data.forEach((t, i) => {
    const li = document.createElement('li');
    li.textContent = `${t.status === 'playing' ? '▶️' : '🎵'} ${t.video_id} • ${t.added_by}`;
    listUL.appendChild(li);
  });

  let playing = data.find(t => t.status === 'playing');

  if (!playing && isOwner && data.length) {
    const first = data[0];
    const now = new Date().toISOString();

    await db.from('room_videos')
      .update({ status: 'playing', start_time: now })
      .eq('id', first.id);

    playing = { ...first, status: 'playing', start_time: now };
  }

  if (playing) {
    const offset = playing.start_time
      ? Math.floor((Date.now() - new Date(playing.start_time).getTime()) / 1000)
      : 0;

    if (playing.video_id !== currentVideoId) {
      currentVideoId = playing.video_id;
      iframe.src = `https://www.youtube.com/embed/${playing.video_id}?autoplay=1&start=${offset}&mute=0&controls=0&modestbranding=1&rel=0`;
      iframe.style.display = 'block';
    }
  }
}

async function nextTrack () {
  if (!isOwner) return;

  const { data } = await db.from('room_videos')
    .select('*')
    .eq('room_code', roomCode)
    .order('id', { ascending: true })
    .limit(1);

  if (!data?.length) return alert('Queue empty');

  await db.from('room_videos').delete().eq('id', data[0].id);
  refreshQueue();
}

/* ───────── chat logic ───────── */
async function sendChat () {
  const msg = chatInput.value.trim();
  if (!msg || !roomCode) return;

  const { error } = await db.from('room_chats').insert({
    room_code : roomCode,
    sender    : userName,
    message   : msg
  });

  if (error) {
    console.error('Chat insert error:', error.message);
    return alert('Failed to send message');
  }

  chatInput.value = '';
  refreshChat();
}

async function refreshChat () {
  if (!roomCode) return;

  const { data } = await db.from('room_chats')
    .select('*')
    .eq('room_code', roomCode)
    .order('created_at', { ascending: true });

  if (!data) return;

  chatUL.innerHTML = '';
  data.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${c.sender}</strong>: ${c.message}`;
    chatUL.appendChild(li);
  });
  chatUL.scrollTop = chatUL.scrollHeight;
}

/* ───────── event wiring ───────── */
$('create-room').onclick = createRoom;
$('join-room'  ).onclick = joinRoom;
addBtn .onclick = addTrack;
nextBtn.onclick = nextTrack;
sendBtn.onclick = sendChat;

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
});
