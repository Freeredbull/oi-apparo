/*  OI APPARO – Music Rooms
    Paste-ready module – keep keys in ONE place for convenience          */

import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL  = 'https://gycoadvqrogvmrdmxntn.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI' // ⇦ your anon key
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const rand = (chars, len) =>
  Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

const genCode     = () => rand('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6);
const genPassword = () => rand('abcdefghijkmnpqrstuvwxyz23456789', 8);
const ytId = (url) => {
  const m = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
  return m ? m[1] : null;
};

// ---------- state ----------
let currentRoom   = null;
let isOwner       = false;
let queuePoller   = null;

// ---------- UI refs ----------
const setupBox    = $('room-setup');
const roomBox     = $('room-interface');
const codeIn      = $('room-code-input');
const passIn      = $('room-password-input');
const infoWrap    = $('created-room-info');
const infoCode    = $('created-room-code');
const infoPass    = $('created-room-pass');
const currentCode = $('current-room-code');
const ownerHint   = $('owner-hint');

const ytInput     = $('youtube-url');
const addBtn      = $('add-track');
const nextBtn     = $('next-track');
const listUL      = $('track-list');
const player      = $('yt-player');

// ---------- room actions ----------
async function createRoom() {
  const code = genCode();
  const pass = genPassword();

  const { error } = await db.from('rooms').insert({ code, password: pass });
  if (error) { alert('Error creating room'); return; }

  infoCode.textContent = code;
  infoPass.textContent = pass;
  infoWrap.style.display = 'block';

  enterRoom(code, pass, true);
}

async function joinRoom() {
  const code = codeIn.value.trim().toUpperCase();
  const pass = passIn.value.trim();
  if (!code || !pass) return alert('Enter code & password');

  const { data, error } = await db.from('rooms').select('*').eq('code', code).single();
  if (error || !data)               return alert('Room not found');
  if (data.password !== pass)       return alert('Wrong password');

  enterRoom(code, pass, false);
}

function enterRoom(code, pass, ownerFlag) {
  currentRoom = code;
  isOwner     = ownerFlag;

  setupBox.style.display = 'none';
  roomBox.style.display  = 'block';
  currentCode.textContent = code;
  ownerHint.style.display = ownerFlag ? 'block' : 'none';
  nextBtn.disabled        = !ownerFlag;

  refreshQueue();
  if (queuePoller) clearInterval(queuePoller);
  queuePoller = setInterval(refreshQueue, 5000);
}

// ---------- queue ----------
async function refreshQueue() {
  if (!currentRoom) return;

  const { data } = await db.from('room_videos')
    .select('*')
    .eq('room_code', currentRoom)
    .order('id', { ascending: true });

  renderQueue(data || []);
  if (data?.length) playTrack(data[0].video_id, false);
}

function renderQueue(q) {
  listUL.innerHTML = '';
  q.forEach((item, idx) => {
    const li = document.createElement('li');
    li.textContent = `${idx === 0 ? '▶️' : '🎵'} ${item.video_id}`;
    listUL.appendChild(li);
  });
}

async function addTrack() {
  const id = ytId(ytInput.value.trim());
  if (!id)             return alert('Bad YouTube link');
  if (!currentRoom)    return alert('Join or create a room first');

  await db.from('room_videos').insert({ room_code: currentRoom, video_id: id });
  ytInput.value = '';
  refreshQueue();
}

async function nextTrack() {
  if (!isOwner) return;
  const { data } = await db.from('room_videos')
    .select('*')
    .eq('room_code', currentRoom)
    .order('id',{ascending:true})
    .limit(1);
  if (!data?.length) return alert('Queue empty');

  await db.from('room_videos').delete().eq('id', data[0].id);
  refreshQueue();
}

function playTrack(id, forceShow=true) {
  if (!id) return;
  player.src = `https://www.youtube.com/embed/${id}?autoplay=1&controls=0&mute=0&modestbranding=1&rel=0`;
  if (forceShow) player.style.display = 'block';
}

// ---------- bind ----------
$('create-room').onclick = createRoom;
$('join-room').onclick   = joinRoom;
addBtn.onclick           = addTrack;
nextBtn.onclick          = nextTrack;
