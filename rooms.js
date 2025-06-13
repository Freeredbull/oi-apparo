// rooms.js - Nokia 3310 Style Music Room Logic

import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentRoomCode = null;
let isOwner = false;

const roomCodeInput = document.getElementById('room-code-input');
const passwordInput = document.getElementById('room-password-input');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomInterface = document.getElementById('room-interface');
const currentRoomCodeDisplay = document.getElementById('current-room-code');
const ytInput = document.getElementById('youtube-url');
const addTrackBtn = document.getElementById('add-track');
const nextTrackBtn = document.getElementById('next-track');
const trackList = document.getElementById('track-list');
const audioPlayer = document.getElementById('audio-player');

function generateCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function extractYouTubeId(url) {
  const match = url.match(/(?:youtube\.com.*[?&]v=|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

function setAudio(videoId) {
  audioPlayer.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0`;
  audioPlayer.style.display = 'block';
}

async function createRoom() {
  const password = passwordInput.value.trim();
  if (!password) return alert('Password is required');

  const code = generateCode();
  const { error } = await client.from('rooms').insert({ code, password });
  if (error) return alert('Error creating room');

  isOwner = true;
  currentRoomCode = code;
  enterRoom(code);
}

async function joinRoom() {
  const code = roomCodeInput.value.trim().toUpperCase();
  const password = passwordInput.value.trim();

  const { data, error } = await client.from('rooms').select('*').eq('code', code).single();
  if (error || !data || data.password !== password) {
    return alert('Invalid room code or password');
  }

  currentRoomCode = code;
  enterRoom(code);
}

function enterRoom(code) {
  currentRoomCodeDisplay.textContent = code;
  roomInterface.style.display = 'block';
  pollTrack();
}

async function addTrack() {
  const url = ytInput.value.trim();
  const videoId = extractYouTubeId(url);
  if (!videoId || !currentRoomCode) return alert('Invalid link or not in room');

  await client.from('room_videos').insert({ room_id: currentRoomCode, youtube_url: videoId, status: 'queued', added_by: 'anon' });
  ytInput.value = '';
  loadQueue();
}

async function nextTrack() {
  if (!isOwner) return alert('Only the room owner can skip');

  const { data } = await client.from('room_videos')
    .select('*')
    .eq('room_id', currentRoomCode)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (data?.length) {
    const next = data[0];
    setAudio(next.youtube_url);
    await client.from('room_videos').update({ status: 'played' }).eq('id', next.id);
    loadQueue();
  }
}

async function loadQueue() {
  const { data } = await client.from('room_videos')
    .select('*')
    .eq('room_id', currentRoomCode)
    .order('created_at');

  trackList.innerHTML = '';
  data.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.status === 'played' ? '✅' : '🎵'} ${item.youtube_url}`;
    trackList.appendChild(li);
  });
}

function pollTrack() {
  setInterval(async () => {
    if (isOwner) return;
    const { data } = await client.from('room_videos')
      .select('*')
      .eq('room_id', currentRoomCode)
      .eq('status', 'queued')
      .order('created_at')
      .limit(1);

    if (data?.length) {
      const next = data[0];
      setAudio(next.youtube_url);
    }
  }, 5000);
}

createRoomBtn.onclick = createRoom;
joinRoomBtn.onclick = joinRoom;
addTrackBtn.onclick = addTrack;
nextTrackBtn.onclick = nextTrack;
