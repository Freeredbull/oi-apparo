// OI APPARO — Public Music-Rooms (No passwords)
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI";
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const rand = (set, n) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
const genCode = () => rand('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
const ytId = url => { const m = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; };

let roomCode = null;
let isOwner = false;
let pollTimer = null;
const userName = `apparo${Math.floor(Math.random() * 1000)}`;
let currentVideoId = null;
let ytPlayer = null;

const nameIn = $('room-name-input');
const codeIn = $('room-code-input');
const setupBox = $('room-setup');
const roomBox = $('room-interface');
const createdInfo = $('created-room-info');
const createdCode = $('created-room-code');
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

async function createRoom() {
  const code = genCode();
  const name = nameIn?.value?.trim() || null;

  const { error } = await db.from('rooms').insert({ code, name, public: true });
  if (error) return alert('DB error creating room');

  createdCode.textContent = code;
  createdInfo.style.display = 'block';
  enterRoom(code, true);
}

async function joinRoom() {
  const code = codeIn.value.trim().toUpperCase();
  if (!code) return alert('Enter a room code');

  const { data, error } = await db.from('rooms').select('*').eq('code', code).single();
  if (error || !data) return alert('Room not found');

  enterRoom(code, false);
}

function enterRoom(code, ownerFlag) {
  roomCode = code;
  isOwner = ownerFlag;

  currCode.textContent = `${code} — you are ${userName}`;
  ownerHint.style.display = ownerFlag ? 'block' : 'none';
  nextBtn.disabled = !ownerFlag;

  setupBox.style.display = 'none';
  roomBox.style.display = 'block';

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    refreshQueue();
    refreshChat();
  }, 4000);

  trackPresence();
  refreshQueue();
  refreshChat();
}

async function addTrack() {
  const fullUrl = ytInput.value.trim();
  const videoId = ytId(fullUrl);
  if (!videoId) return alert('Invalid YouTube link');
  if (!roomCode) return alert('Join or create a room first');

  await db.from('room_videos').insert({
    room_code: roomCode,
    youtube_url: fullUrl,
    video_id: videoId,
    status: 'queued',
    added_by: userName,
    start_time: null
  });

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
  data.forEach(t => {
    const li = document.createElement('li');
    li.textContent = `${t.status === 'playing' ? '▶️' : '🎵'} ${t.video_id} • ${t.added_by}`;
    listUL.appendChild(li);
  });

  let playing = data.find(t => t.status === 'playing');

  if (!playing && isOwner && data.length) {
    await promoteNext();
    playing = { ...data[0], status: 'playing', start_time: new Date().toISOString() };
  }

  if (playing) {
    const offset = playing.start_time
      ? Math.floor((Date.now() - new Date(playing.start_time).getTime()) / 1000)
      : 0;

    if (!currentVideoId || playing.video_id !== currentVideoId) {
      currentVideoId = playing.video_id;
      iframe.src = `https://www.youtube.com/embed/${playing.video_id}?autoplay=1&start=${offset}&mute=0&controls=0&modestbranding=1&rel=0&enablejsapi=1`;
    }

    if (!ytPlayer && window.YT && window.YT.Player) {
      ytPlayer = new YT.Player(iframe, {
        events: {
          onStateChange: (e) => {
            if (window.YT && e.data === YT.PlayerState.ENDED) nextTrack();
          }
        }
      });
    }

    iframe.style.display = 'block';
  }
}

async function promoteNext() {
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

async function nextTrack() {
  if (!isOwner || !roomCode) return;
  const { data: playing } = await db.from('room_videos')
    .select('*')
    .eq('room_code', roomCode)
    .eq('status', 'playing')
    .single();

  if (playing) await db.from('room_videos').delete().eq('id', playing.id);
  await promoteNext();
  currentVideoId = null;
  refreshQueue();
}

async function sendChat() {
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

async function refreshChat() {
  if (!roomCode) return;
  const { data } = await db.from('room_chats')
    .select('*')
    .eq('room_code', roomCode)
    .order('created_at', { ascending: true });

  chatUL.innerHTML = '';
  data.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${c.sender}</strong>: ${c.message}`;
    chatUL.appendChild(li);
  });
  chatUL.scrollTop = chatUL.scrollHeight;
}

async function trackPresence() {
  await db.from('room_users').insert({ room_code: roomCode, username: userName });
  window.addEventListener('beforeunload', async () => {
    await db.from('room_users').delete().eq('room_code', roomCode).eq('username', userName);
  });
}

// Events
$('create-room').onclick = createRoom;
$('join-room').onclick = joinRoom;
addBtn.onclick = addTrack;
nextBtn.onclick = nextTrack;
sendBtn.onclick = sendChat;
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

if (!window.YT) {
  const tag = document.createElement('script');
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

const params = new URLSearchParams(location.search);
if (params.get('code')) {
  enterRoom(params.get('code'), false);
}
