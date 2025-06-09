import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Unique session ID per browser
let sessionId = localStorage.getItem('online_user_id');
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem('online_user_id', sessionId);
}

// Online presence
async function refreshOnlineStatus() {
  const now = new Date().toISOString();

  const { error: upsertError } = await client.from('online_users').upsert({
    id: sessionId,
    last_seen: now
  });

  if (upsertError) {
    console.error('Upsert error:', upsertError.message);
    return;
  }

  const { count, error: countError } = await client
    .from('online_users')
    .select('id', { count: 'exact' })
    .gte('last_seen', new Date(Date.now() - 2 * 60 * 1000).toISOString());

  if (countError) {
    console.error('Count error:', countError.message);
    return;
  }

  if (count !== null) {
    document.getElementById('online-count').textContent = `🟢 ${count} online now`;
  }
}

refreshOnlineStatus();
setInterval(refreshOnlineStatus, 60 * 1000);

// Submit a new post
window.submitPost = async function () {
  const content = document.getElementById('postContent').value.trim();
  const fileInput = document.getElementById('postImage');
  let imageUrl = null;

  if (!content) return alert("Please enter some text!");

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const fileName = `${Date.now()}_${file.name}`;

    const { error: uploadError } = await client.storage
      .from('images')
      .upload(fileName, file);

    if (uploadError) {
      alert('Image upload failed: ' + uploadError.message);
      return;
    }

    const { data: urlData, error: urlError } = client.storage
      .from('images')
      .getPublicUrl(fileName);

    if (urlError) {
      alert('Failed to get image URL: ' + urlError.message);
      return;
    }

    imageUrl = urlData.publicUrl;
  }

  const { error: insertError } = await client
    .from('posts')
    .insert([{ content, image_url: imageUrl }]);

  if (insertError) {
    alert('Failed to save post: ' + insertError.message);
    return;
  }

  document.getElementById('postContent').value = '';
  fileInput.value = '';
  loadPosts();
};

// Vote
window.vote = async function (postId, type) {
  const votes = JSON.parse(localStorage.getItem('oiap_votes') || '{}');

  if (votes[postId]) {
    alert('You have already voted on this post!');
    return;
  }

  try {
    await client.from('votes').insert([{ post_id: postId, type }]);
    votes[postId] = type;
    localStorage.setItem('oiap_votes', JSON.stringify(votes));
    loadPosts();
  } catch (error) {
    alert('Vote failed: ' + error.message);
  }
};

// Load posts
async function loadPosts() {
  const { data: posts, error } = await client
    .from('posts')
    .select('id, content, image_url, created_at, votes(type)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error loading posts:", error.message);
    return;
  }

  const postsDiv = document.getElementById('posts');
  postsDiv.innerHTML = '';

  posts.forEach(post => {
    const upvotes = post.votes?.filter(v => v.type === 'up').length || 0;
    const downvotes = post.votes?.filter(v => v.type === 'down').length || 0;

    const div = document.createElement('div');
    div.className = 'post';
    div.innerHTML = `
      <p>${post.content}</p>
      ${post.image_url ? `<img src="${post.image_url}" />` : ''}
      <div style="margin-top: 10px; display: flex; gap: 10px;">
        <button onclick="vote('${post.id}', 'up')">⬆️ ${upvotes}</button>
        <button onclick="vote('${post.id}', 'down')">⬇️ ${downvotes}</button>
      </div>
    `;
    postsDiv.appendChild(div);
  });
}

loadPosts();
