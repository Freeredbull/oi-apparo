/* OI APPARO – Synced Music Rooms with YouTube & Chat */
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = 'https://gycoadvqrogvmrdmxntn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// === DOM refs ===
const $ = (id) => document.getElementById(id);
const codeIn = $('room-code-input');
const passIn = $('room-password-input');
const ytInput = $('youtube-url');
const chatInput = $('chat-input');
const chatList = $('chat-list');
const videoFrame = $('yt-player');
const trackList = $('track-list');
const currentCode = $('current-room-code');
const chatBox = $('chat-box');

let currentRoom = null;
let isOwner = false;
let userName = `apparo${Math.floor(Math.random() * 1000)}`;
let pollingInterval = null;

// === Room Actions ===
async function createRoom() {
  const code = generateCode();
  const pass = generatePassword();
  await db.from('rooms').insert({ code, password: pass });
  enterRoom(code, pass, true);
}

async function joinRoom() {
  const code = codeIn.value.trim().toUpperCase();
  const pass = passIn.value.trim();
  const { data, error } = await db.from('rooms').select('*').eq('code', code).single();
  if (error || !data || data.password !== pass) return alert('Room not found or wrong password');
  enterRoom(code, pass, false);
}

function enterRoom(code, pass, owner) {
  currentRoom = code;
  isOwner = owner;
  currentCode.textContent = `${code} (🔐 ${pass}) - You are ${userName}`;
  chatBox.style.display = 'block';
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(pollState, 5000);
  pollState();
}

// === Track Actions ===
async function addTrack() {
  const url = ytInput.value.trim();
  const videoId = extractYouTubeID(url);
  if (!videoId) return alert('Invalid YouTube link');
  await db.from('room_videos').insert({ room_code: currentRoom, youtube_url: url, video_id: videoId, status: 'queued', added_by: userName });
  ytInput.value = '';
}

async function playNextTrack() {
  if (!isOwner) return;
  const { data } = await db.from('room_videos').select('*').eq('room_code', currentRoom).order('id', { ascending: true }).limit(1);
  const track = data?.[0];
  if (!track) return;
  await db.from('room_videos').update({ status: 'playing', start_time: new Date().toISOString() }).eq('id', track.id);
}

async function pollState() {
  await refreshQueue();
  await refreshChat();
}

async function refreshQueue() {
  const { data } = await db.from('room_videos').select('*').eq('room_code', currentRoom).order('id', { ascending: true });
  if (!data) return;
  trackList.innerHTML = '';
  data.forEach((track, i) => {
    const li = document.createElement('li');
    li.textContent = `${i === 0 ? '▶️' : '🎵'} ${track.video_id} (by ${track.added_by})`;
    trackList.appendChild(li);
  });
  const playing = data.find(t => t.status === 'playing');
  if (playing && playing.start_time) {
    const startTime = new Date(playing.start_time).getTime();
    const now = Date.now();
    const offset = Math.floor((now - startTime) / 1000);
    videoFrame.src = `https://www.youtube.com/embed/${playing.video_id}?autoplay=1&start=${offset}&mute=0`;
  }
}

// === Chat ===
async function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  await db.from('room_chats').insert({ room_code: currentRoom, sender: userName, message: msg });
  chatInput.value = '';
}

async function refreshChat() {
  const { data } = await db.from('room_chats').select('*').eq('room_code', currentRoom).order('created_at', { ascending: true });
  chatList.innerHTML = '';
  data.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${c.sender}</strong>: ${c.message}`;
    chatList.appendChild(li);
  });
}

// === Utils ===
function extractYouTubeID(url) {
  const m = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function generateCode() {
  return Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
}
function generatePassword() {
  return Array.from({ length: 8 }, () => 'abcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
}

// === Events ===
$('create-room').onclick = createRoom;
$('join-room').onclick = joinRoom;
$('add-track').onclick = addTrack;
$('next-track').onclick = playNextTrack;
$('send-chat').onclick = sendMessage;
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
