// == Supabase Setup ==
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// == Global State for Music Room ==
let currentRoomId = null;
let currentRoomCode = null;
let isRoomOwner = false;

// == DOM Elements ==
const musicRoomDiv = document.getElementById('music-room');
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const roomPasswordInput = document.getElementById('room-password');
const musicStatus = document.getElementById('music-status');
const musicControls = document.getElementById('music-controls');
const ytLinkInput = document.getElementById('youtube-link');
const addTrackBtn = document.getElementById('add-track');
const nextTrackBtn = document.getElementById('next-track');
const audioPlayer = document.getElementById('yt-audio');

// == Helper Functions ==
function generateCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function extractYouTubeID(url) {
  const match = url.match(/(?:youtube\.com.*(?:\?|&)v=|youtu\.be\/)([\w-]+)/);
  return match ? match[1] : null;
}

function playTrack(videoId) {
  if (!videoId) return;
  audioPlayer.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&modestbranding=1&rel=0`;
  audioPlayer.style.display = 'block';
  musicStatus.textContent = `▶️ Now playing: ${videoId}`;
}

// == Supabase Room Functions ==
async function createRoom() {
  const password = roomPasswordInput.value.trim();
  if (!password) return alert('Password is required');

  const code = generateCode();
  const { data, error } = await client.from('music_rooms').insert({ code, password });

  if (error) return alert('Failed to create room');
  currentRoomCode = code;
  isRoomOwner = true;
  musicStatus.textContent = `✅ Room created. Code: ${code}`;
  musicControls.style.display = 'block';
  pollRoom(code);
}

async function joinRoom() {
  const code = roomCodeInput.value.trim().toUpperCase();
  const password = roomPasswordInput.value.trim();
  if (!code || !password) return alert('Code and password required');

  const { data, error } = await client.from('music_rooms').select('*').eq('code', code).single();
  if (error || !data || data.password !== password) return alert('Invalid code or password');

  currentRoomCode = code;
  musicStatus.textContent = `🎧 Joined room: ${code}`;
  pollRoom(code);
}

async function addTrack() {
  const url = ytLinkInput.value.trim();
  const vid = extractYouTubeID(url);
  if (!vid || !currentRoomCode) return alert('Invalid YouTube URL or not in a room');

  await client.from('music_queue').insert({ room_code: currentRoomCode, video_id: vid });
  ytLinkInput.value = '';
  musicStatus.textContent = `🎵 Added track to queue.`;
}

async function nextTrack() {
  if (!currentRoomCode || !isRoomOwner) return alert('Only room owner can skip');

  const { data: queue } = await client.from('music_queue')
    .select('*')
    .eq('room_code', currentRoomCode)
    .order('id', { ascending: true })
    .limit(1);

  if (!queue?.length) return alert('No tracks in queue');

  const next = queue[0];
  playTrack(next.video_id);
  await client.from('music_queue').delete().eq('id', next.id);
}

function pollRoom(code) {
  setInterval(async () => {
    if (isRoomOwner) return; // clients wait for next
    const { data: queue } = await client.from('music_queue')
      .select('*')
      .eq('room_code', code)
      .order('id', { ascending: true })
      .limit(1);
    if (queue?.length) {
      const current = queue[0];
      playTrack(current.video_id);
    }
  }, 5000);
}

// == Event Listeners ==
createRoomBtn.onclick = createRoom;
joinRoomBtn.onclick = joinRoom;
addTrackBtn.onclick = addTrack;
nextTrackBtn.onclick = nextTrack;
