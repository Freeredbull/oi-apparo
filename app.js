import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5Y29hZHZxcm9ndm1yZG14bnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyMDc2MzcsImV4cCI6MjA2NDc4MzYzN30.hF_0bAwBs1kcCxuSL8UypC2SomDtuCXSVudXSDhwOpI";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Get or create a unique browser session ID
let sessionId = localStorage.getItem('online_user_id');
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem('online_user_id', sessionId);
}

// Every 60 seconds: update presence + fetch count
async function refreshOnlineStatus() {
  const now = new Date().toISOString();

  // Upsert this session's row
  await supabase.from('online_users').upsert({
    id: sessionId,
    last_seen: now
  });

  // Get count of users seen in the past 2 minutes
  const { data, error, count } = await supabase
    .from('online_users')
    .select('id', { count: 'exact' })
    .gte('last_seen', new Date(Date.now() - 2 * 60 * 1000).toISOString());

  if (count !== null) {
    document.getElementById('online-count').textContent = `🟢 ${count} online now`;
  }
}

// Kick off every 60 seconds
refreshOnlineStatus(); // run once at page load
setInterval(refreshOnlineStatus, 60 * 1000);

// Submit a new post (with optional image)
async function submitPost() {
  const content = document.getElementById('postContent').value.trim();
  const fileInput = document.getElementById('postImage');
  let imageUrl = null;

  if (!content) return alert("Please enter some text!");

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const fileName = `${Date.now()}_${file.name}`;

    const { data: uploadData, error: uploadError } = await client.storage
      .from('images')
      .upload(fileName, file);

    if (uploadError) {
      console.error('Upload error:', uploadError.message);
      alert('Image upload failed: ' + uploadError.message);
      return;
    }

    const { data: urlData, error: urlError } = client.storage.from('images').getPublicUrl(fileName);
    if (urlError) {
      console.error('Get public URL error:', urlError.message);
      alert('Failed to get image URL: ' + urlError.message);
      return;
    }
    imageUrl = urlData.publicUrl;
  }

  const { error: insertError } = await client.from('posts').insert([{ content, image_url: imageUrl }]);

  if (insertError) {
    console.error('Insert post error:', insertError.message);
    alert('Failed to save post: ' + insertError.message);
    return;
  }

  document.getElementById('postContent').value = '';
  fileInput.value = '';
  loadPosts();
}

async function vote(postId, type) {
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
    console.error("Vote failed:", error.message);
  }
}

async function loadPosts() {
  try {
    console.log('Loading posts...');
    const { data: posts, error } = await client
      .from('posts')
      .select('id, content, image_url, created_at, votes(type)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error loading posts:", error.message);
      return;
    }

    console.log("Posts loaded:", posts);

    const postsDiv = document.getElementById('posts');
    postsDiv.innerHTML = '';

    posts.forEach(post => {
      console.log('Rendering post:', post);
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
  } catch (error) {
    console.error("Error loading posts:", error.message);
  }
}

loadPosts();
