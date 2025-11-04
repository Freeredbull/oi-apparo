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
let currentUser = null;
let currentUsername = null;

let authForm;
let authEmailInput;
let authPasswordInput;
let authStatusLabel;
let signOutButton;

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
  loadPosts({ reset: true });
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
  loadPosts({ reset: true });
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

function requireAuth() {
  if (!currentUser || !currentUsername) {
    alert('Please sign in to share posts and comments.');
    return false;
  }
  return true;
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return date.toLocaleDateString();
}

function extractImagePath(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const marker = '/storage/v1/object/public/images/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return null;
    return parsed.pathname.substring(idx + marker.length);
  } catch (err) {
    return null;
  }
}

function generateUsernameSeed() {
  const random = Math.floor(100 + Math.random() * 900);
  return `Apparos${random}`;
}

async function ensureProfile(user) {
  try {
    const { data, error } = await client
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Profile lookup failed:', error.message);
      return null;
    }

    if (data?.username) {
      return data.username;
    }

    let username = generateUsernameSeed();
    for (let i = 0; i < 5; i++) {
      const { error: insertError } = await client
        .from('profiles')
        .insert({ id: user.id, username });

      if (!insertError) {
        return username;
      }

      if (insertError.code === '23505') {
        username = generateUsernameSeed();
        continue;
      }

      console.error('Failed to create profile:', insertError.message);
      return null;
    }
  } catch (err) {
    console.error('Unexpected profile error:', err);
  }
  return null;
}

function updateAuthUI() {
  if (!authStatusLabel || !signOutButton || !authForm) return;

  if (currentUser && currentUsername) {
    authStatusLabel.textContent = `Signed in as ${currentUsername}`;
    signOutButton.style.display = 'inline-block';
    authForm.style.display = 'none';
  } else {
    authStatusLabel.textContent = 'Sign in to post and comment.';
    signOutButton.style.display = 'none';
    authForm.style.display = 'flex';
  }
}

async function handleAuthState(user) {
  currentUser = user;

  if (currentUser) {
    currentUsername = await ensureProfile(currentUser);
    if (!currentUsername) {
      alert('Unable to load your profile. Please try signing in again.');
      await client.auth.signOut();
      currentUser = null;
    }
  } else {
    currentUsername = null;
  }

  updateAuthUI();
}

async function cleanupOldPosts() {
  const cutoff = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldPosts, error } = await client
    .from('posts')
    .select('id, image_url')
    .lt('created_at', cutoff);

  if (error) {
    console.error('Failed to look up old posts:', error.message);
    return;
  }

  if (!oldPosts || oldPosts.length === 0) {
    return;
  }

  const deletableIds = oldPosts.map((post) => post.id);

  const imagePaths = oldPosts
    .map((post) => extractImagePath(post.image_url))
    .filter(Boolean);

  if (imagePaths.length > 0) {
    const { error: removeError } = await client.storage
      .from('images')
      .remove(imagePaths);

    if (removeError) {
      console.error('Failed to clean up old images:', removeError.message);
    }
  }

  const { error: deleteError } = await client
    .from('posts')
    .delete()
    .in('id', deletableIds);

  if (deleteError) {
    console.error('Failed to delete expired posts:', deleteError.message);
  }
}

window.submitPost = async function () {
  if (!requireAuth()) return;
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
    {
      content,
      image_url: imageUrl,
      author_id: currentUser.id,
      author_username: currentUsername
    }
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

  await loadPosts({ reset: true });
  await loadMarqueeTopPosts();
};

window.vote = async function (postId, type) {
  const votes = JSON.parse(localStorage.getItem('oiap_votes') || '{}');
  if (votes[postId]) return alert('You already voted!');
  await client.from('votes').insert([{ post_id: postId, type }]);
  votes[postId] = type;
  localStorage.setItem('oiap_votes', JSON.stringify(votes));
  await loadPosts({ reset: true });
  await loadMarqueeTopPosts();
};

async function loadPosts({ reset = false } = {}) {
  if (reset) {
    postPage = 0;
    allPostsLoaded = false;
    const postsDiv = document.getElementById('posts');
    if (postsDiv) postsDiv.innerHTML = '';
  }

  if (loadingPosts || allPostsLoaded) return;
  loadingPosts = true;

  const { data: posts, error } = await client
    .from('posts')
    .select('id, content, image_url, created_at, author_username, votes(type), comments(id, content, author_username, created_at)')
    .order('created_at', { ascending: false })
    .range(postPage * postsPerPage, (postPage + 1) * postsPerPage - 1);

  if (error) {
    console.error("Error loading posts:", error.message);
    loadingPosts = false;
    return;
  }

  const safePosts = posts ?? [];

  if (safePosts.length < postsPerPage) allPostsLoaded = true;

  const postsDiv = document.getElementById('posts');
  if (!postsDiv) {
    loadingPosts = false;
    return;
  }

  safePosts.forEach(post => {
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
    const comments = (post.comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const commentsMarkup = comments.length
      ? comments.map(comment => `
          <div class="comment">
            <span class="comment-author">${comment.author_username || 'Apparos'}</span>
            <span class="comment-meta">${formatRelativeTime(comment.created_at)}</span>
            <div>${comment.content}</div>
          </div>
        `).join('')
      : '<div class="no-comments">No comments yet. Be the first to neigh.</div>';

    const commentFormMarkup = currentUser && currentUsername
      ? `
        <form class="comment-form" onsubmit="submitComment('${post.id}', this); return false;">
          <textarea placeholder="Share a comment..."></textarea>
          <button type="submit">💬 Comment</button>
        </form>
      `
      : '<div class="sign-in-reminder">Sign in to join the conversation.</div>';

    div.innerHTML = `
      <div class="post-header">
        <span class="post-author">${post.author_username || 'Apparos'}</span>
        <span class="post-meta">${formatRelativeTime(post.created_at)}</span>
      </div>
      <p>${emoji} ${content}</p>
      ${post.image_url ? `<img src="${post.image_url}" />` : ''}
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
        <button onclick="vote('${post.id}', 'up')">⬆️ ${upvotes}</button>
        <button onclick="vote('${post.id}', 'down')">⬇️ ${downvotes}</button>
        <button onclick="vote('${post.id}', 'horse')">${emoji} ${horseVotes}</button>
      </div>
      <div class="comment-section">
        ${commentsMarkup}
        ${commentFormMarkup}
      </div>
    `;
    postsDiv.appendChild(div);
  });

  postPage++;
  loadingPosts = false;
}

async function loadMarqueeTopPosts() {
  const cutoff = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const { data: posts } = await client
    .from('posts')
    .select('id, content, image_url, votes(type)')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false });

  const scored = (posts || []).map(post => {
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

window.submitComment = async function (postId, formEl) {
  if (!requireAuth()) return false;
  const textarea = formEl.querySelector('textarea');
  const content = textarea.value.trim();
  if (!content) {
    alert('Please enter a comment first.');
    return false;
  }

  const { error } = await client.from('comments').insert([
    {
      post_id: postId,
      content,
      author_id: currentUser.id,
      author_username: currentUsername
    }
  ]);

  if (error) {
    alert('Failed to add comment.');
    return false;
  }

  textarea.value = '';
  await loadPosts({ reset: true });
  return false;
};

document.addEventListener('DOMContentLoaded', async () => {
  authForm = document.getElementById('auth-form');
  authEmailInput = document.getElementById('auth-email');
  authPasswordInput = document.getElementById('auth-password');
  authStatusLabel = document.getElementById('auth-status');
  signOutButton = document.getElementById('auth-signout');

  if (authForm) {
    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = authEmailInput.value.trim();
      const password = authPasswordInput.value;

      if (!email || !password) {
        alert('Email and password are required.');
        return;
      }

      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        alert(error.message || 'Sign-in failed.');
        return;
      }

      authPasswordInput.value = '';
    });
  }

  const signUpButton = document.getElementById('auth-signup-btn');
  if (signUpButton) {
    signUpButton.addEventListener('click', async () => {
      const email = authEmailInput.value.trim();
      const password = authPasswordInput.value;

      if (!email || !password) {
        alert('Email and password are required.');
        return;
      }

      const { error } = await client.auth.signUp({ email, password });
      if (error) {
        alert(error.message || 'Sign-up failed.');
        return;
      }

      alert('Check your email to confirm your account. Once confirmed, sign in to start posting.');
    });
  }

  if (signOutButton) {
    signOutButton.addEventListener('click', async () => {
      await client.auth.signOut();
    });
  }

  const { data } = await client.auth.getSession();
  await handleAuthState(data.session?.user ?? null);

  client.auth.onAuthStateChange(async (_event, session) => {
    await handleAuthState(session?.user ?? null);
    await loadPosts({ reset: true });
  });

  await cleanupOldPosts();
  await loadMarqueeTopPosts();
  refreshOnlineStatus();
  await loadPosts({ reset: true });
  setInterval(refreshOnlineStatus, 60 * 1000);

  const drawLaunch = document.getElementById('draw-launch');
  const uploadSection = document.getElementById('upload-section');
  const imageRadios = document.querySelectorAll('input[name="image-source"]');

  imageRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'draw' && radio.checked) {
        drawLaunch.style.display = 'block';
        uploadSection.style.display = 'none';
      } else {
        drawLaunch.style.display = 'none';
        uploadSection.style.display = 'block';
      }
    });
  });

  document.getElementById('draw-btn').addEventListener('click', () => {
    document.getElementById('draw-modal').style.display = 'block';
    loadLineArt('horse');
  });

  window.addEventListener('scroll', () => {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
    if (nearBottom) loadPosts();
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

