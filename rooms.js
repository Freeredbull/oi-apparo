// New version: SyncTube-like Music Rooms (modular structure coming next)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  'https://gycoadvqrogvmrdmxntn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI'
);

// Global state
let roomCode = '';
let isOwner = false;
let userName = `apparo_${Math.floor(Math.random() * 1000)}`;
let ytPlayer;
let currentVideo = null;
let syncLock = false;

// Setup real-time listener for player state
function subscribeToPlayerState() {
  supabase
    .channel(`room:${roomCode}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'player_state', filter: `room_code=eq.${roomCode}` }, payload => {
      if (!isOwner) syncToPlayer(payload.new);
    })
    .subscribe();
}

function syncToPlayer(state) {
  if (!ytPlayer || syncLock) return;
  syncLock = true;
  const { current_video, position, state: playState } = state;

  if (current_video !== currentVideo) {
    ytPlayer.loadVideoById(current_video, position);
  } else {
    const drift = Math.abs(ytPlayer.getCurrentTime() - position);
    if (drift > 1) ytPlayer.seekTo(position, true);
    if (playState === 'playing') ytPlayer.playVideo();
    else ytPlayer.pauseVideo();
  }
  currentVideo = current_video;
  setTimeout(() => (syncLock = false), 1000);
}

function reportPlayerState(state) {
  if (!isOwner) return;
  const pos = ytPlayer.getCurrentTime();
  supabase.from('player_state').upsert({
    room_code: roomCode,
    current_video: currentVideo,
    position: pos,
    state,
    timestamp: new Date().toISOString()
  });
}

// YouTube API Setup
window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player('yt-player', {
    height: '390',
    width: '640',
    videoId: '',
    playerVars: { autoplay: 1, controls: 1 },
    events: {
      onReady: () => {},
      onStateChange: e => {
        if (isOwner) {
          if (e.data === YT.PlayerState.PLAYING) reportPlayerState('playing');
          if (e.data === YT.PlayerState.PAUSED) reportPlayerState('paused');
          if (e.data === YT.PlayerState.ENDED) nextVideo();
        }
      }
    }
  });
};

// Add track
async function addTrack(url) {
  const videoId = extractVideoId(url);
  if (!videoId) return alert('Invalid URL');
  await supabase.from('tracks').insert({ room_code: roomCode, url, video_id: videoId });
}

function extractVideoId(url) {
  const match = url.match(/(?:v=|be\/|embed\/)([\w-]{11})/);
  return match ? match[1] : null;
}

// Load first track and play (owner)
async function loadFirstTrack() {
  const { data } = await supabase.from('tracks').select('*').eq('room_code', roomCode).order('id', { ascending: true }).limit(1);
  if (!data.length) return;
  currentVideo = data[0].video_id;
  ytPlayer.loadVideoById(currentVideo);
  reportPlayerState('playing');
}

// Next video (owner only)
async function nextVideo() {
  const { data } = await supabase.from('tracks').select('*').eq('room_code', roomCode).order('id');
  if (data.length < 2) return;
  await supabase.from('tracks').delete().eq('id', data[0].id);
  currentVideo = data[1].video_id;
  ytPlayer.loadVideoById(currentVideo);
  reportPlayerState('playing');
}

export async function createRoom(name) {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  roomCode = code;
  isOwner = true;
  await supabase.from('rooms').insert({ code, name, public: true });
  await supabase.from('player_state').insert({ room_code: code, state: 'paused', position: 0 });
  subscribeToPlayerState();
}

export async function joinRoom(code) {
  const { data, error } = await supabase.from('rooms').select('*').eq('code', code).single();
  if (error) return alert('Room not found');
  roomCode = code;
  isOwner = false;
  subscribeToPlayerState();
}
