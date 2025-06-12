// == Supabase Setup ==
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// == Audio Files ==
const horseSound = new Audio('/assets/horse.mp3');
const nixtopSound = new Audio('/assets/nixtop-toggle.mp3');

// == Global State ==
let nixtopMode = false;
let postPage = 0;
let loadingPosts = false;
let allPostsLoaded = false;
const postsPerPage = 15;

// == UI Elements ==
const drawPreview = document.getElementById("draw-preview");
const drawModal = document.getElementById("draw-modal");
const canvas = document.getElementById("draw-canvas");
const ctx = canvas?.getContext("2d");

// == Drawing Pad Setup ==
if (canvas && ctx && drawModal) {
  let drawing = false;
  let mode = "draw";

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX || e.touches?.[0]?.clientX) - rect.left,
      y: (e.clientY || e.touches?.[0]?.clientY) - rect.top
    };
  }

  function drawStroke(x, y) {
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  const lineImages = {
    horse: "/assets/horse-draw.png",
    bat: "/assets/bat-line.png"
  };

  function loadLineArt(type) {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = lineImages[type];
  }

  document.getElementById("select-horse").onclick = () => loadLineArt("horse");
  document.getElementById("select-bat").onclick = () => loadLineArt("bat");
  document.getElementById("draw-tool").onclick = () => {
    mode = "draw";
    ctx.strokeStyle = "#00FF00";
  };
  document.getElementById("erase-tool").onclick = () => {
    mode = "erase";
    ctx.strokeStyle = "#000000";
  };
  document.getElementById("clear-drawing").onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById("close-drawing").onclick = () => drawModal.style.display = "none";

  canvas.addEventListener("mousedown", e => {
    drawing = true;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  });

  canvas.addEventListener("mousemove", e => {
    if (!drawing) return;
    const { x, y } = getCanvasCoords(e);
    drawStroke(x, y);
  });

  canvas.addEventListener("mouseup", () => drawing = false);
  canvas.addEventListener("mouseout", () => drawing = false);
  canvas.addEventListener("touchstart", e => {
    drawing = true;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  });
  canvas.addEventListener("touchend", () => drawing = false);
  canvas.addEventListener("touchmove", e => {
    if (!drawing) return;
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    drawStroke(x, y);
  }, { passive: false });

  document.getElementById("save-drawing").onclick = () => {
    canvas.toBlob(async (blob) => {
      const filePath = `drawings/${crypto.randomUUID()}.png`;
      const { error } = await client.storage.from("images").upload(filePath, blob, {
        contentType: "image/png"
      });
      if (error) return alert("Upload failed");
      const { data } = client.storage.from("images").getPublicUrl(filePath);
      document.getElementById("image-url-input").value = data.publicUrl;
      drawModal.style.display = "none";
      drawPreview.style.display = "block";
    });
  };
}

// == Draw Pad Launcher ==
document.getElementById("draw-btn").addEventListener("click", () => {
  document.getElementById("draw-modal").style.display = "block";
});

// == Post Submission ==
window.submitPost = async function () {
  const content = document.getElementById('postContent').value.trim();
  const fileInput = document.getElementById('postImage');
  const imageChoice = document.querySelector('input[name="image-source"]:checked').value;
  let imageUrl = null;

  const hasUpload = imageChoice === 'upload' && fileInput.files.length > 0;
  const hasDrawing = imageChoice === 'draw' && document.getElementById('image-url-input').value;

  if (!content && !hasUpload && !hasDrawing) return alert("Please enter text, upload an image, or draw something!");

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
  drawPreview.style.display = 'none';
  loadPosts();
};

// == Post Voting ==
window.vote = async function (postId, type) {
  const votes = JSON.parse(localStorage.getItem('oiap_votes') || '{}');
  if (votes[postId]) return alert('You already voted!');
  await client.from('votes').insert([{ post_id: postId, type }]);
  votes[postId] = type;
  localStorage.setItem('oiap_votes', JSON.stringify(votes));
  loadPosts();
};

// == Load Posts ==
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

    const content = nixtopMode ? post.content.replace(/apparo/gi, 'Nixtopapparo') : post.content;
    const emoji = nixtopMode ? '🦇' : '🐎';
    const div = document.createElement('div');
    div.className = 'post';
    if (content.toLowerCase().includes('apparo') && !nixtopMode) {
      div.classList.add('trigger-apparo');
      horseSound.currentTime = 0;
      horseSound.play().catch(() => {});
    }
    div.innerHTML = `
      <p>${emoji} ${content}</p>
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
