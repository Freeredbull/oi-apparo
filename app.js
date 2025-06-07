const SUPABASE_URL = "https://gycoadvqrogvmrdmxntn.supabase.co";
const SUPABASE_ANON_KEY = "your-key-here";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function submitPost() {
  const content = document.getElementById('postContent').value;
  const fileInput = document.getElementById('postImage');
  let imageUrl = null;

  if (!content.trim()) return;

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const fileName = `${Date.now()}_${file.name}`;
    const { data: uploadData, error: uploadError } = await client.storage.from('images').upload(fileName, file);

    if (uploadError) {
      alert('Image upload failed: ' + uploadError.message);
      return;
    }

    const { data: urlData } = client.storage.from('images').getPublicUrl(fileName);
    imageUrl = urlData.publicUrl;
  }

  const { error: insertError } = await client.from('posts').insert([{ content, image_url: imageUrl }]);
  if (insertError) {
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
    alert('You have already voted!');
    return;
  }

  await client.from('votes').insert([{ post_id: postId, type }]);
  votes[postId] = type;
  localStorage.setItem('oiap_votes', JSON.stringify(votes));
  loadPosts();
}

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