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
  const imageChoice = document.querySelector('input[name="image-source"]:checked')?.value;
  const drawUrl = document.getElementById('image-url-input').value.trim();
  let imageUrl = null;

  const hasUpload = imageChoice === 'upload' && fileInput.files.length > 0;
  const hasDrawing = imageChoice === 'draw' && !!drawUrl;

  if (!content && !hasUpload && !hasDrawing) {
    return alert("Please enter text, upload an image, or draw something!");
  }

  if (hasUpload) {
    const file = fileInput.files[0];
    const fileName = `uploads/${Date.now()}_${file.name}`;
    const { error: uploadError } = await client.storage.from('images').upload(fileName, file);

    if (uploadError) {
      alert('Image upload failed!');
      return;
    }

    const { data } = client.storage.from('images').getPublicUrl(fileName);
    imageUrl = data.publicUrl;
  }

  if (hasDrawing) {
    imageUrl = drawUrl;
  }

  const { error: postError } = await client.from('posts').insert([
    { content, image_url: imageUrl }
  ]);

  if (postError) {
    alert("Failed to post!");
    return;
  }

  // Reset form
  document.getElementById('postContent').value = '';
  fileInput.value = '';
  document.getElementById('image-url-input').value = '';
  document.getElementById('draw-preview').style.display = 'none';

  loadPosts(false);
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

  const drawLaunch = document.getElementById("draw-launch");
  const uploadSection = document.getElementById("upload-section");
  const imageRadios = document.querySelectorAll('input[name="image-source"]');

  imageRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.value === "draw" && radio.checked) {
        drawLaunch.style.display = "block";
        uploadSection.style.display = "none";
      } else {
        drawLaunch.style.display = "none";
        uploadSection.style.display = "block";
      }
    });
  });

  document.getElementById("draw-btn").addEventListener("click", () => {
    document.getElementById("draw-modal").style.display = "block";
    loadLineArt("horse");
  });

  window.addEventListener('scroll', () => {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
    if (nearBottom) loadPosts(true);
  });
});

const drawPreview = document.getElementById("draw-preview");
const lineImages = {
  horse: "/assets/horse-draw.png",
  bat: "/assets/bat-line.png"
};

const canvas = document.getElementById("draw-canvas");
const ctx = canvas?.getContext("2d");
const drawModal = document.getElementById("draw-modal");

if (canvas && ctx && drawModal) {
  let drawing = false;
  let mode = "draw";

  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX || e.pageX || e.touches?.[0]?.clientX) - rect.left,
      y: (e.clientY || e.pageY || e.touches?.[0]?.clientY) - rect.top
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

  canvas.addEventListener("mousedown", (e) => {
  drawing = true;
  const { x, y } = getCanvasCoords(e);
  ctx.beginPath();
  ctx.moveTo(x, y);
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const { x, y } = getCanvasCoords(e);
  drawStroke(x, y);
});

canvas.addEventListener("mouseup", () => {
  drawing = false;
  ctx.beginPath();
});

canvas.addEventListener("mouseout", () => {
  drawing = false;
});

  canvas.addEventListener("touchstart", (e) => {
    drawing = true;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  });

  canvas.addEventListener("touchend", () => drawing = false);
  canvas.addEventListener("touchmove", (e) => {
  if (!drawing) return;
  e.preventDefault();
  const touch = e.touches[0];
  const { x, y } = getCanvasCoords(touch);
  drawStroke(x, y);
}, { passive: false });

  document.getElementById("save-drawing").onclick = () => {
    canvas.toBlob(async (blob) => {
      const filePath = `drawings/${crypto.randomUUID()}.png`;
      const { error } = await client.storage.from("images").upload(filePath, blob, {
        contentType: "image/png"
      });

      if (error) {
        alert("Upload failed");
        return;
      }

      const { data } = client.storage.from("images").getPublicUrl(filePath);
      document.getElementById("image-url-input").value = data.publicUrl;
      drawModal.style.display = "none";
      drawPreview.style.display = "block";
    });
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('apparos-near-btn');
  const msg = document.getElementById('apparos-message');

  btn.addEventListener('click', () => {
    msg.style.display = msg.style.display === 'none' ? 'block' : 'none';
  });
});

