/*  OI APPARO — Music Rooms
    Drop-in ES-module (type="module") for rooms.html                */

/* ----------  Supabase  ---------- */
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = 'https://gycoadvqrogvmrdmxntn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI';
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ----------  Small helpers  ---------- */
const $   = (id) => document.getElementById(id);
const rand = (chars,len)=>
  [...Array(len)].map(()=>chars[Math.floor(Math.random()*chars.length)]).join('');

const genCode     = () => rand('ABCDEFGHJKMNPQRSTUVWXYZ23456789',6);
const genPassword = () => rand('abcdefghijkmnopqrstuvwxyz23456789',8);
const ytId = (url)=>{
  const m = url.match(/(?:youtu\.be\/|v=)([0-9A-Za-z_-]{11})/);
  return m ? m[1] : null;
};

/* ----------  State  ---------- */
let currentRoom  = null;
let currentPass  = null;
let isOwner      = false;
let queuePoller  = null;

/* ----------  DOM refs  ---------- */
const codeIn      = $('room-code-input');
const passIn      = $('room-password-input');
const createBtn   = $('create-room');
const joinBtn     = $('join-room');

const setupWrap   = $('room-setup');
const roomWrap    = $('room-interface');
const createdInfo = $('created-room-info');
const infoCode    = $('created-room-code');
const infoPass    = $('created-room-pass');
const curCodeSpan = $('current-room-code');
const ownerHint   = $('owner-hint');

const ytInput     = $('youtube-url');
const addBtn      = $('add-track');
const nextBtn     = $('next-track');
const listUL      = $('track-list');
const player      = $('audio-player');      // <audio> element

/* ----------  Room flow  ---------- */
async function createRoom(){
  const code = genCode();
  const pass = genPassword();

  const { error } = await db.from('rooms').insert({ code, password:pass });
  if(error){ alert('❌ Could not create room'); return; }

  // show share-info
  infoCode.textContent = code;
  infoPass.textContent = pass;
  createdInfo.style.display = 'block';

  enterRoom(code,pass,true);
}

async function joinRoom(){
  const code = codeIn.value.trim().toUpperCase();
  const pass = passIn.value.trim();
  if(!code||!pass) return alert('Enter code & password');

  const { data, error } = await db.from('rooms').select('*').eq('code',code).single();
  if(error||!data)           return alert('Room not found');
  if(data.password!==pass)   return alert('Wrong password');

  enterRoom(code,pass,false);
}

function enterRoom(code,pass,owner){
  currentRoom = code;
  currentPass = pass;
  isOwner     = owner;

  setupWrap.style.display = 'none';
  roomWrap .style.display = 'block';

  curCodeSpan.textContent = `${code} (🔐 ${pass})`;
  ownerHint.style.display = owner?'block':'none';
  nextBtn.disabled        = !owner;

  refreshQueue();                 // immediate first load
  clearInterval(queuePoller);
  queuePoller = setInterval(refreshQueue,5000);
}

/* ----------  Queue helpers  ---------- */
async function refreshQueue(){
  if(!currentRoom) return;

  const { data } = await db.from('room_videos')
      .select('*')
      .eq('room_code',currentRoom)
      .order('id',{ascending:true});

  renderQueue(data || []);
  if(data?.length) playTrack(data[0].youtube_url,false);
}

function renderQueue(q){
  listUL.innerHTML = '';
  q.forEach((item,idx)=>{
    const li = document.createElement('li');
    li.textContent = `${idx===0?'▶️':'🎵'} ${item.youtube_url}`;
    listUL.appendChild(li);
  });
}

async function addTrack(){
  const id = ytId(ytInput.value.trim());
  if(!id)           return alert('Bad YouTube link');
  if(!currentRoom)  return alert('Create / join room first');

  await db.from('room_videos').insert({
    room_code: currentRoom,
    youtube_url: id,
    status: 'queued'
  });
  ytInput.value='';
  refreshQueue();
}

async function nextTrack(){
  if(!isOwner) return alert('Only room owner can skip');

  const { data } = await db.from('room_videos')
      .select('*')
      .eq('room_code',currentRoom)
      .order('id',{ascending:true})
      .limit(1);

  if(!data?.length) return alert('Queue empty 👀');

  await db.from('room_videos').delete().eq('id',data[0].id);
  refreshQueue();
}

function playTrack(videoId,forceShow=true){
  if(!videoId) return;

  /* 
     We only need audio, but easiest reliable embed
     → YouTube IFrame API in audio-only mode isn’t trivial
     → Quick workaround: use no-picture “embed” HTML5 audio proxy
     For demo: use yewtu.be / youtube-nocookie, but a true audio proxy
     would be needed in production
  */
  player.src = `https://ytdlproxy.fly.dev/audio/${videoId}`; // tiny public proxy
  if(forceShow) player.style.display='block';
}

/* ----------  Bind events  ---------- */
createBtn.onclick = createRoom;
joinBtn  .onclick = joinRoom;
addBtn   .onclick = addTrack;
nextBtn  .onclick = nextTrack;

/* ----------  Clean-up on leave / reload ---------- */
window.addEventListener('beforeunload',()=>clearInterval(queuePoller));
