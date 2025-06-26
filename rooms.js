// rooms.js

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient('https://gycoadvqrogvmrdmxntn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI');
const db = supabase;

let roomCode = '';
let isOwner = false;
let pollTimer;
let ytPlayer;
let currentVideoId = null;
let allowAnyoneToSkip = false;

const createBtn = document.getElementById('create-room');
const joinBtn = document.getElementById('join-room');
const nextBtn = document.getElementById('next-track');

createBtn.onclick = async () => {
  roomCode = generateCode();
  const name = document.getElementById('room-name-input').value || null;

  const { error } = await db.from('rooms').insert({ code: roomCode, name, public: true });
  if (error) return alert('Failed to create room');

  isOwner = true;
  showRoom(roomCode);
  document.getElementById('created-room-code').innerText = roomCode;
  document.getElementById('created-room-info').style.display = 'block';
};

joinBtn.onclick = async () => {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!code) return;

  const { data, error } = await db.from('rooms').select('*').eq('code', code).single();
  if (error || !data) return alert('Room not found');

  roomCode = code;
  isOwner = false;
  showRoom(roomCode);
};

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function showRoom(code) {
  document.getElementById('room-setup').style.display = 'none';
  document.getElementById('room-interface').style.display = 'block';
  document.getElementById('current-room-code').innerText = `Room: ${code}`;
  document.getElementById('owner-hint').style.display = isOwner ? 'block' : 'none';
  nextBtn.style.display = isOwner ? 'inline-block' : 'none';

  try {
    await db.from('room_users').insert({ room_code: code, username: `apparo${Math.floor(Math.random() * 1000)}` });
  } catch (e) {
    console.warn('Room user already exists or insert error:', e.message);
  }

  loadQueue();
  loadChat();

  pollTimer = setInterval(() => {
    loadQueue();
    loadChat();
    checkOwnerPresence();
  }, 4000);
}

async function loadQueue() {
  const list = document.getElementById('track-list');
  list.innerHTML = '';

  const { data, error } = await db
    .from('tracks')
    .select('*')
    .eq('room_code', roomCode)
    .order('id');

  if (error) {
    console.error('Error loading tracks:', error.message);
    return;
  }

  if (!data || data.length === 0) return;

  data.forEach(track => {
    const li = document.createElement('li');
    li.textContent = track.url;
    list.appendChild(li);
  });

  const nextVideoId = extractId(data[0].url);
  if (!nextVideoId) return;

  if (ytPlayer) {
    if (currentVideoId !== nextVideoId) {
      currentVideoId = nextVideoId;
      ytPlayer.loadVideoById(currentVideoId);
    }
  } else {
    currentVideoId = nextVideoId;
    ytPlayer = new YT.Player('yt-player', {
      videoId: currentVideoId,
      events: {
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            if (isOwner || allowAnyoneToSkip) nextTrack();
          }
        }
      }
    });
  }
}

function extractId(url) {
  const reg = /(?:v=|be\/|embed\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(reg);
  return match ? match[1] : null;
}

document.getElementById('add-track').onclick = async () => {
  const url = document.getElementById('youtube-url').value.trim();
  if (!url) return;
  await db.from('tracks').insert({ room_code: roomCode, url });
  document.getElementById('youtube-url').value = '';
  loadQueue();
};

document.getElementById('next-track').onclick = () => nextTrack();

async function nextTrack() {
  const { data } = await db.from('tracks').select('*').eq('room_code', roomCode).order('id');
  if (data.length < 2) return;
  await db.from('tracks').delete().eq('id', data[0].id);
  loadQueue();
}

async function loadChat() {
  const { data, error } = await db.from('messages').select('*').eq('room_code', roomCode).order('created_at');
  if (error || !data) return;
  const chat = document.getElementById('chat-list');
  chat.innerHTML = '';
  data.forEach(m => {
    const li = document.createElement('li');
    li.textContent = m.text;
    chat.appendChild(li);
  });
}

document.getElementById('send-chat').onclick = async () => {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  await db.from('messages').insert({ room_code: roomCode, text });
  input.value = '';
  loadChat();
};

async function loadRoomGrid() {
  const grid = document.getElementById('room-grid');
  if (!grid) return;

  const { data } = await db.from('rooms').select('*').eq('public', true).order('created_at', { ascending: false });
  grid.innerHTML = '';
  data.forEach(room => {
    const div = document.createElement('div');
    div.className = 'room-card';
    div.style = 'border:2px solid #0f0; padding:1rem; background:#000; cursor:pointer;';
    div.innerHTML = `<h3>${room.name || 'Unnamed Room'}</h3><p>Code: <strong>${room.code}</strong></p>`;
    div.onclick = () => {
      window.location.href = `rooms.html?code=${room.code}`;
    };
    grid.appendChild(div);
  });
}

async function checkOwnerPresence() {
  const { data } = await db.from('room_users').select('*').eq('room_code', roomCode);
  const owners = data; // simplified — just check if any users are in the room
  allowAnyoneToSkip = owners.length === 0;
  nextBtn.disabled = !(isOwner || allowAnyoneToSkip);
}

function getRoomCodeFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('code')?.toUpperCase() || null;
}

async function autoJoinFromQuery() {
  const code = getRoomCodeFromURL();
  if (!code) return;

  const { data, error } = await db.from('rooms').select('*').eq('code', code).single();
  if (data) {
    roomCode = code;
    isOwner = false;
    showRoom(roomCode);
  } else {
    alert("Room not found.");
  }
}

window.addEventListener('DOMContentLoaded', () => {
  autoJoinFromQuery();
  loadRoomGrid();
});
