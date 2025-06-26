// rooms.js (Final)
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL  = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_KEY  = "YOUR_SUPABASE_ANON_KEY_HERE";
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const ytId = url => {
  const m = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};

const genCode     = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const genPassword = () => Array.from({ length: 8 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');

let roomCode = null;
let isOwner = false;
let pollTimer = null;
const userName = `apparo${Math.floor(Math.random() * 1000)}`;
let currentVideoId = null;
let ytPlayer = null;

const codeIn = $('room-code-input');
const passIn = $('room-password-input');
const setupBox = $('room-setup');
const roomBox = $('room-interface');
const createdInfo = $('created-room-info');
const createdCode = $('created-room-code');
const createdPass = $('created-room-pass');
const currCode = $('current-room-code');
const ownerHint = $('owner-hint');

const ytInput = $('youtube-url');
const addBtn = $('add-track');
const nextBtn = $('next-track');
const listUL = $('track-list');
const iframe = $('yt-player');

const chatInput = $('chat-input');
const sendBtn = $('send-chat');
const chatUL = $('chat-list');

async function createRoom () {
  const code = genCode();
  const pass = genPassword();
  const name = $('room-name-input')?.value?.trim() || null;

  const { error } = await db.from('rooms').insert({
    code,
    password: pass,
    public: true,
    name
  });

  if (error) return alert('DB error creating room');

  createdCode.textContent = code;
  createdPass.textContent = pass;
  createdInfo.style.display = 'block';
  enterRoom(code, pass, true);
}

async function joinRoom () {
  const code = codeIn.value.trim().toUpperCase();
  const pass = passIn.value.trim();
  if (!code || !pass) return alert('Enter code & password');

  const { data, error } = await db.from('rooms').select('*').eq('code', code).single();
  if (error || !data) return alert('Room not found');
  if (data.password !== pass) return alert('Wrong password');

  enterRoom(code, pass, false);
}

function enterRoom (code, pass, ownerFlag) {
  roomCode = code;
  isOwner = ownerFlag;

  currCode.textContent = `${code} (🔐 ${pass}) – you are ${userName}`;
  ownerHint.style.display = ownerFlag ? 'block' : 'none';
  nextBtn.disabled = !ownerFlag;

  setupBox.style.display = 'none';
  roomBox.style.display = 'block';

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    refreshQueue();
    refreshChat();
  }, 4000);

  db.from('room_users').insert({ room_code: code, username: userName });
  window.addEventListener("beforeunload", () => {
    db.from("room_users").delete().eq("room_code", roomCode).eq("username", userName);
  });

  refreshQueue();
  refreshChat();
}

async function addTrack () {
  const fullUrl = ytInput.value.trim();
  const videoId = ytId(fullUrl);
  if (!videoId) return alert('Invalid YouTube link');
  if (!roomCode) return;

  const track = {
    room_code: roomCode,
    youtube_url: fullUrl,
    video_id: videoId,
    status: 'queued',
    added_by: userName,
    start_time: null
  };

  const { error } = await db.from('room_videos').insert(track);
  if (error) return alert('Could not add video');

  ytInput.value = '';
  refreshQueue();
}

async function promoteNext () {
  const { data: next } = await db
    .from('room_videos')
    .select('*')
    .eq('room_code', roomCode)
    .eq('status', 'queued')
    .order('id', { ascending: true })
    .limit(1);

  if (next?.length) {
    await db.from('room_videos')
      .update({ status: 'playing', start_time: new Date().toISOString() })
      .eq('id', next[0].id);
  }
}

async function refreshQueue () {
  const { data } = await db
    .from('room_videos')
    .select('*')
    .eq('room_code', roomCode)
    .order('id', { ascending: true });

  if (!data) return;

  listUL.innerHTML = '';
  data.forEach(t => {
    const li = document.createElement('li');
    li.textContent = `${t.status === 'playing' ? '▶️' : '🎵'} ${t.video_id} • ${t.added_by}`;
    listUL.appendChild(li);
  });

  let playing = data.find(t => t.status === 'playing');
  if (!playing && isOwner && data.length) {
    await promoteNext();
    return;
  }

  if (playing) {
    const offset = playing.start_time
      ? Math.floor((Date.now() - new Date(playing.start_time).getTime()) / 1000)
      : 0;

    if (!currentVideoId || playing.video_id !== currentVideoId) {
      currentVideoId = playing.video_id;
      iframe.src = `https://www.youtube.com/embed/${currentVideoId}?autoplay=1&start=${offset}&mute=0&controls=0&modestbranding=1&rel=0&enablejsapi=1`;
      iframe.style.display = 'block';
    }
  }
}

async function nextTrack () {
  if (!isOwner || !roomCode) return;

  const { data: playing } = await db
    .from('room_videos')
    .select('*')
    .eq('room_code', roomCode)
    .eq('status', 'playing')
    .single();

  if (playing) {
    await db.from('room_videos').delete().eq('id', playing.id);
    currentVideoId = null;
  }

  await promoteNext();
  refreshQueue();
}

async function sendChat () {
  const msg = chatInput.value.trim();
  if (!msg || !roomCode) return;

  await db.from('room_chats').insert({
    room_code: roomCode,
    sender: userName,
    message: msg
  });

  chatInput.value = '';
  refreshChat();
}

async function refreshChat () {
  const { data } = await db
    .from('room_chats')
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

$('create-room').onclick = createRoom;
$('join-room').onclick = joinRoom;
addBtn.onclick = addTrack;
nextBtn.onclick = nextTrack;
sendBtn.onclick = sendChat;
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
});

if (!window.YT) {
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}
