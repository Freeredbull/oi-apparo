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

const GUEST_IDENTITY_KEY = 'oiap_guest_identity';

function sanitizeEmailForUsername(email) {
  if (!email) return '';
  const localPart = email.split('@')[0] ?? '';
  const cleaned = localPart.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return cleaned.slice(0, 18);
}

function generateProfileUsername(user) {
  const base = sanitizeEmailForUsername(user?.email) || 'apparos';
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${base}${suffix}`;
}

function generateGuestUsername() {
  const suffix = Math.floor(100 + Math.random() * 900);
  return `krifoapparos${suffix}`;
}

function getGuestUsername() {
  try {
    const stored = JSON.parse(localStorage.getItem(GUEST_IDENTITY_KEY) || 'null');
    if (stored?.username) {
      return stored.username;
    }
  } catch (err) {
    console.warn('Failed to parse guest identity; regenerating.', err);
  }

  const username = generateGuestUsername();
  localStorage.setItem(GUEST_IDENTITY_KEY, JSON.stringify({ username }));
  return username;
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

    let username = generateProfileUsername(user);
    for (let i = 0; i < 5; i++) {
      const { error: insertError } = await client
        .from('profiles')
        .insert({ id: user.id, username });

      if (!insertError) {
        return username;
      }

      if (insertError.code === '23505') {
        username = generateProfileUsername(user);
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
    authStatusLabel.textContent = 'Sign in to post and comment, or use guest posting below.';
    signOutButton.style.display = 'none';
    authForm.style.display = 'flex';
  }
}

function verifiedBadgeMarkup() {
  return '<span class="verified-badge" title="Verified Apparo">🐎✅</span>';
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

async function collectPostFormData() {
  const content = document.getElementById('postContent').value.trim();
  const fileInput = document.getElementById('postImage');
  const imageChoice = document.querySelector('input[name="image-source"]:checked')?.value;
  const drawUrl = document.getElementById('image-url-input').value.trim();
  let imageUrl = null;

  const hasUpload = imageChoice === 'upload' && fileInput && fileInput.files.length > 0;
  const hasDrawing = imageChoice === 'draw' && !!drawUrl;

  if (!content && !hasUpload && !hasDrawing) {
    alert('Please enter text, upload an image, or draw something!');
    return null;
  }

  if (hasUpload) {
    const file = fileInput.files[0];
    const fileName = `uploads/${Date.now()}_${file.name}`;
    const { error: uploadError } = await client.storage.from('images').upload(fileName, file);

    if (uploadError) {
      alert('Image upload failed!');
      return null;
    }

    const { data } = client.storage.from('images').getPublicUrl(fileName);
    imageUrl = data.publicUrl;
  }

  if (hasDrawing) {
    imageUrl = drawUrl;
  }

  return { content, imageUrl };
}

function resetPostForm() {
  document.getElementById('postContent').value = '';
  const fileInput = document.getElementById('postImage');
  if (fileInput) fileInput.value = '';
  document.getElementById('image-url-input').value = '';
  document.getElementById('draw-preview').style.display = 'none';
  const uploadRadio = document.querySelector('input[name="image-source"][value="upload"]');
  if (uploadRadio) uploadRadio.checked = true;
  const uploadSection = document.getElementById('upload-section');
  const drawLaunch = document.getElementById('draw-launch');
  if (uploadSection) uploadSection.style.display = 'block';
  if (drawLaunch) drawLaunch.style.display = 'none';
}

async function handlePostSubmission({ guest = false } = {}) {
  if (!guest && !requireAuth()) return;

  const payload = await collectPostFormData();
  if (!payload) return;

  const { content, imageUrl } = payload;
  const authorUsername = guest ? getGuestUsername() : currentUsername;
  const authorId = guest ? null : currentUser?.id ?? null;

  const { error: postError } = await client.from('posts').insert([
    {
      content,
      image_url: imageUrl,
      author_id: authorId,
      author_username: authorUsername
    }
  ]);

  if (postError) {
    alert('Failed to post!');
    return;
  }

  resetPostForm();
  await loadPosts({ reset: true });
  await loadMarqueeTopPosts();

  if (guest && authStatusLabel) {
    authStatusLabel.textContent = `Posting as guest ${authorUsername}`;
    setTimeout(() => {
      if (!currentUser) {
        authStatusLabel.textContent = 'Sign in to post and comment, or use guest posting below.';
      }
    }, 4000);
  }
}

window.submitPost = async function () {
  await handlePostSubmission({ guest: false });
};

window.submitGuestPost = async function () {
  await handlePostSubmission({ guest: true });
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
    .select('id, content, image_url, created_at, author_username, author_id, votes(type), comments(id, content, author_username, author_id, created_at)')
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
      ? comments.map(comment => {
          const commentBadge = comment.author_id ? ` ${verifiedBadgeMarkup()}` : ' <span class="guest-label">Guest</span>';
          return `
          <div class="comment">
            <span class="comment-author">${comment.author_username || 'Apparos'}${commentBadge}</span>
            <span class="comment-meta">${formatRelativeTime(comment.created_at)}</span>
            <div>${comment.content}</div>
          </div>
        `;
        }).join('')
      : '<div class="no-comments">No comments yet. Be the first to neigh.</div>';

    const commentFormMarkup = currentUser && currentUsername
      ? `
        <form class="comment-form" onsubmit="submitComment('${post.id}', this); return false;">
          <textarea placeholder="Share a comment..."></textarea>
          <button type="submit">💬 Comment</button>
        </form>
      `
      : '<div class="sign-in-reminder">Sign in to join the conversation.</div>';

    const verifiedBadge = post.author_id ? ` ${verifiedBadgeMarkup()}` : '';
    const guestLabel = post.author_id ? '' : ' <span class="guest-label">Guest</span>';

    div.innerHTML = `
      <div class="post-header">
        <span class="post-author">${post.author_username || 'Apparos'}${verifiedBadge}${guestLabel}</span>
        <span class="post-meta">${formatRelativeTime(post.created_at)}</span>
      </div>
      <p>${emoji} ${content}</p>
      ${post.image_url ? `<img src="${post.image_url}" />` : ''}
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
        <button onclick="vote('${post.id}', 'up')">⬆️ ${upvotes}</button>
        <button onclick="vote('${post.id}', 'down')">⬇️ ${downvotes}</button>
        <button onclick="vote('${post.id}', 'horse')">${emoji} ${horseVotes}</button>
        <button class="share-button">📤 Share</button>
      </div>
      <div class="comment-section">
        ${commentsMarkup}
        ${commentFormMarkup}
      </div>
    `;
    const shareButton = div.querySelector('.share-button');
    if (shareButton) {
      shareButton.setAttribute('aria-label', 'Share this post from OI APPARO');
      shareButton.addEventListener('click', () => sharePost(post));
    }
    postsDiv.appendChild(div);
  });

  postPage++;
  loadingPosts = false;
}

async function sharePost(post) {
  const shareText = `${post.author_username || 'Apparos'} on OI APPARO:\n${post.content}`;

  try {
    const blob = await createShareImage(post);
    const files = blob
      ? [new File([blob], 'oi-apparo-share.png', { type: 'image/png' })]
      : [];

    if (files.length && navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({
        title: 'OI APPARO',
        text: shareText,
        url: window.location.origin,
        files
      });
      return;
    }

    if (navigator.share) {
      await navigator.share({
        title: 'OI APPARO',
        text: shareText,
        url: window.location.origin
      });
      return;
    }

    if (blob) {
      triggerImageDownload(blob);
      alert('Share image downloaded. Share it anywhere you like to spread the OI APPARO legend!');
      return;
    }

    await navigator.clipboard?.writeText?.(shareText);
    alert('Share text copied to clipboard.');
  } catch (error) {
    console.error('Share failed:', error);
    alert('Could not share this post automatically. A download of the share artwork will start instead.');
    try {
      const fallbackBlob = await createShareImage(post);
      if (fallbackBlob) {
        triggerImageDownload(fallbackBlob);
      }
    } catch (err) {
      console.error('Share fallback failed:', err);
    }
  }
}

function triggerImageDownload(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'oi-apparo-share.png';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function createShareImage(post) {
  try {
    await document.fonts?.ready;
  } catch (err) {
    console.warn('Fonts not ready for share image, continuing anyway.', err);
  }

  const canvas = document.createElement('canvas');
  const width = 1080;
  const height = 1080;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#001b00');
  gradient.addColorStop(0.5, '#012f12');
  gradient.addColorStop(1, '#013d18');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 16;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  ctx.fillStyle = '#39ff14';
  ctx.font = 'bold 64px "Press Start 2P", monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = '#00ff9d';
  ctx.shadowBlur = 20;
  ctx.fillText('OI APPARO', 80, 80);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#d6ffd6';
  ctx.font = '28px "Press Start 2P", monospace';
  ctx.fillText('Green Nokia Broadcast', 84, 160);

  ctx.fillStyle = '#39ff14';
  ctx.font = '32px "Press Start 2P", monospace';
  const authorLabel = `${post.author_id ? 'Verified' : 'Guest'} — ${post.author_username || 'Apparos'}`;
  wrapText(ctx, authorLabel, 84, 230, width - 168, 44);

  ctx.fillStyle = '#f5fff5';
  ctx.font = '36px "Press Start 2P", monospace';
  const contentY = 320;
  wrapText(ctx, post.content || '', 84, contentY, width - 168, 52);

  ctx.fillStyle = '#39ff14';
  ctx.font = '24px "Press Start 2P", monospace';
  const footerText = `${formatRelativeTime(post.created_at)} • Share your voice at oiapparo`; 
  wrapText(ctx, footerText, 84, height - 160, width - 168, 36);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#39ff14';
  ctx.font = '32px "Press Start 2P", monospace';
  ctx.fillText('#GreenNokia', width - 84, height - 100);

  return await new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/png');
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return;

  const paragraphs = String(text).split(/\n+/);
  let cursorY = y;

  paragraphs.forEach((paragraph, index) => {
    const words = paragraph.split(/\s+/);
    let line = '';

    words.forEach(word => {
      const testLine = line ? `${line} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, x, cursorY);
        line = word;
        cursorY += lineHeight;
      } else {
        line = testLine;
      }
    });

    if (line) {
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }

    if (index < paragraphs.length - 1) {
      cursorY += lineHeight * 0.5;
    }
  });
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

      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await client.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo
        }
      });
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

  function getCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = evt.clientX ?? evt.pageX ?? evt.touches?.[0]?.clientX ?? 0;
    const clientY = evt.clientY ?? evt.pageY ?? evt.touches?.[0]?.clientY ?? 0;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function drawStroke(x, y) {
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = mode === "erase" ? "#000000" : "#00FF00";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function startDrawing(evt) {
    drawing = true;
    const { x, y } = getCanvasCoords(evt);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function continueDrawing(evt) {
    if (!drawing) return;
    evt.preventDefault();
    const { x, y } = getCanvasCoords(evt);
    drawStroke(x, y);
  }

  function stopDrawing() {
    if (!drawing) return;
    drawing = false;
    ctx.beginPath();
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

  canvas.addEventListener("pointerdown", (evt) => {
    if (evt.button !== undefined && evt.button !== 0) {
      return;
    }
    if (typeof canvas.setPointerCapture === "function" && evt.pointerId !== undefined) {
      try {
        canvas.setPointerCapture(evt.pointerId);
      } catch (captureErr) {
        console.warn("Pointer capture failed", captureErr);
      }
    }
    startDrawing(evt);
  });

  canvas.addEventListener("pointermove", (evt) => {
    if (!drawing) {
      return;
    }
    continueDrawing(evt);
  });

  canvas.addEventListener("pointerup", () => {
    stopDrawing();
  });

  canvas.addEventListener("pointercancel", () => {
    stopDrawing();
  });

  canvas.addEventListener("pointerleave", () => {
    stopDrawing();
  });

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

