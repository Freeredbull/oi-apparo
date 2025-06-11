import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const horseSound = new Audio('/assets/horse.mp3');
const nixtopSound = new Audio('/assets/nixtop-toggle.mp3');

let nixtopMode = false;
let postPage = 0;
let loadingPosts = false;
let allPostsLoaded = false;
const postsPerPage = 15;

const btnApparos = document.getElementById('mode-apparos');
const btnNixtop = document.getElementById('mode-nixtop');

btnApparos.addEventListener('click', () => {
  nixtopMode = false;
  document.documentElement.classList.remove('nixtop-active');
  btnApparos.classList.add('active');
  btnNixtop.classList.remove('active');
  document.querySelector('h1').textContent = '🐎 OI APPARO';
  postPage = 0;
  allPostsLoaded = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadPosts(false);
});

btnNixtop.addEventListener('click', () => {
  nixtopMode = true;
  document.documentElement.classList.add('nixtop-active');
  btnApparos.classList.remove('active');
  btnNixtop.classList.add('active');
  document.querySelector('h1').textContent = '🦇 OI NIXTOPAPPARO';
  nixtopSound.currentTime = 0;
  nixtopSound.play().catch(() => {});
  postPage = 0;
  allPostsLoaded = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadPosts(false);
});

let sessionId = localStorage.getItem('online_user_id');
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem('online_user_id', sessionId);
}

async function refreshOnlineStatus() {
  const now = new Date().toISOString();
  await client.from('online_users').upsert({ id: sessionId, last_seen: now });
  const { count } = await client
    .from('online_users')
    .select('id', { count: 'exact' })
    .gte('last_seen', new Date(Date.now() - 2 * 60 * 1000).toISOString());
  if (count !== null) {
    document.getElementById('online-count').textContent = `🟢 ${count} online now`;
  }
}

window.submitPost = async function () {
  const content = document.getElementById('postContent').value.trim();
  const fileInput = document.getElementById('postImage');
  const imageChoice = document.querySelector('input[name="image-source"]:checked').value;
  let imageUrl = null;

  const hasUpload = imageChoice === 'upload' && fileInput.files.length > 0;
  const hasDrawing = imageChoice === 'draw' && document.getElementById('image-url-input').value;

  if (!content && !hasUpload && !hasDrawing) {
    return alert("Please enter text, upload an image, or draw something!");
  }

  if (hasUpload) {
    const file = fileInput.files[0];
    const fileName = `${Date.now()}_${file.name}`;
    await client.storage.from('images').upload(fileName, file);
    const { data } = client.storage.from('images').getPublicUrl(fileName);
    imageUrl = data.publicUrl;
  }

  if (hasDrawing) {
    imageUrl = document.getElementById('image-url-input').value;
  }

  await client.from('posts').insert([{ content, image_url: imageUrl }]);
  document.getElementById('postContent').value = '';
  fileInput.value = '';
  document.getElementById('image-url-input').value = '';
  loadPosts();
};

window.vote = async function (postId, type) {
  const votes = JSON.parse(localStorage.getItem('oiap_votes') || '{}');
  if (votes[postId]) return alert('You already voted!');
  await client.from('votes').insert([{ post_id: postId, type }]);
  votes[postId] = type;
  localStorage.setItem('oiap_votes', JSON.stringify(votes));
  loadPosts();
};

async function loadPosts(append = true) {
  if (loadingPosts || allPostsLoaded) return;
  loadingPosts = true;
  const { data: posts, error } = await client
    .from('posts')
    .select('id, content, image_url, created_at, votes(type)')
    .order('created_at', { ascending: false })
    .range(postPage * postsPerPage, (postPage + 1) * postsPerPage - 1);
  if (error) {
    console.error("Error loading posts:", error.message);
    loadingPosts = false;
    return;
  }
  if (posts.length < postsPerPage) allPostsLoaded = true;
  const postsDiv = document.getElementById('posts');
  if (!append) postsDiv.innerHTML = '';

  posts.forEach(post => {
    const upvotes = post.votes?.filter(v => v.type === 'up').length || 0;
    const downvotes = post.votes?.filter(v => v.type === 'down').length || 0;
    const horseVotes = post.votes?.filter(v => v.type === 'horse').length || 0;
    const original = post.content;
    const content = nixtopMode ? original.replace(/apparo/gi, 'Nixtopapparo') : original;
    const hasApparo = content.toLowerCase().includes('apparo');
    const emoji = nixtopMode ? '🦇' : '🐎';
    const div = document.createElement('div');
    div.className = 'post';
    if (hasApparo && !nixtopMode) {
      div.classList.add('trigger-apparo');
      horseSound.currentTime = 0;
      horseSound.play().catch(() => {});
    }
    div.innerHTML = `
      <p>${hasApparo ? emoji + ' ' : ''}${content}</p>
      ${post.image_url ? `<img src="${post.image_url}" />` : ''}
      <div style="margin-top:10px;display:flex;gap:10px;">
        <button onclick="vote('${post.id}', 'up')">⬆️ ${upvotes}</button>
        <button onclick="vote('${post.id}', 'down')">⬇️ ${downvotes}</button>
        <button onclick="vote('${post.id}', 'horse')">${emoji} ${horseVotes}</button>
      </div>
    `;
    postsDiv.appendChild(div);
  });
  postPage++;
  loadingPosts = false;
}

async function loadMarqueeTopPosts() {
  const { data: posts } = await client
    .from('posts')
    .select('id, content, image_url, votes(type)')
    .order('created_at', { ascending: false });

  const scored = posts.map(post => {
    const up = post.votes?.filter(v => v.type === 'up').length || 0;
    const down = post.votes?.filter(v => v.type === 'down').length || 0;
    const horse = post.votes?.filter(v => v.type === 'horse').length || 0;
    return { ...post, score: up - down + horse };
  });

  const top = scored
    .filter(p => !p.image_url)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(p => `📰 ${p.content.slice(0, 100).replace(/\n/g, ' ')}`);

  document.getElementById('marquee-text').textContent =
    top.length > 0 ? top.join('   •   ') : 'No top posts yet. Be the first to post something legendary. 🐎';
}

document.addEventListener('DOMContentLoaded', () => {
  loadMarqueeTopPosts();
  refreshOnlineStatus();
  loadPosts(false);
  setInterval(refreshOnlineStatus, 60 * 1000);
  window.addEventListener('scroll', () => {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
    if (nearBottom) loadPosts(true);
  });
});
