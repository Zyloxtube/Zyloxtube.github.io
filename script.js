const gistRawUrl = "https://gist.githubusercontent.com/Zyloxtube/b6e8faa92098c05976412ea2246482c1/raw/database.json";
const gistId = "b6e8faa92098c05976412ea2246482c1";
const token = "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"; // ضع التوكن هنا

let dbData = null;
let currentVideo = null;
let currentChannel = null;

// قراءة البيانات من Gist
async function loadDB() {
  const res = await fetch(gistRawUrl);
  dbData = await res.json();
}

// عرض الفيديوهات في الصفحة الرئيسية
async function loadDBAndDisplayVideos() {
  await loadDB();
  const videoList = document.getElementById("videoList");
  videoList.innerHTML = "";
  dbData.videos.forEach(v => {
    const channel = dbData.channels.find(c => c.channelId === v.channelId);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${v.thumbnailBase64}" alt="صورة الفيديو">
      <p>${v.title}</p>
      <small>👁 ${v.views} مشاهدة</small>
      <div class="duration">${v.duration}</div>
    `;
    card.onclick = () => {
      localStorage.setItem("currentVideoId", v.videoId);
      window.location.href = "watch.html";
    };
    videoList.appendChild(card);
  });
}

// عرض الفيديو الحالي
async function displayCurrentVideo() {
  await loadDB();
  const videoId = localStorage.getItem("currentVideoId");
  currentVideo = dbData.videos.find(v => v.videoId === videoId);
  currentChannel = dbData.channels.find(c => c.channelId === currentVideo.channelId);

  currentVideo.views = (currentVideo.views || 0) + 1;

  document.getElementById("videoContainer").innerHTML = `
    <h2>${currentVideo.title}</h2>
    <video controls>
      <source src="${currentVideo.videoBase64}" type="video/mp4">
    </video>
    <div class="stats">
      <span>👁 ${currentVideo.views} مشاهدة</span>
      <span id="likeBtn" class="like-btn">👍 ${currentVideo.likes || 0} إعجاب</span>
      <span id="dislikeBtn" class="dislike-btn">👎 ${currentVideo.dislikes || 0} عدم إعجاب</span>
    </div>
    <div class="channel">
      <img src="${currentChannel.channelAvatarBase64}">
      <div>
        <strong>${currentChannel.channelName}</strong><br>
        @${currentChannel.channelUsername} - ${currentChannel.subscribers} مشترك
      </div>
    </div>
  `;
  loadComments(videoId);

  document.getElementById("likeBtn").onclick = () => {
    currentVideo.likes = (currentVideo.likes || 0) + 1;
    document.getElementById("likeBtn").innerText = `👍 ${currentVideo.likes} إعجاب`;
    updateGist(dbData);
  };
  document.getElementById("dislikeBtn").onclick = () => {
    currentVideo.dislikes = (currentVideo.dislikes || 0) + 1;
    document.getElementById("dislikeBtn").innerText = `👎 ${currentVideo.dislikes} عدم إعجاب`;
    updateGist(dbData);
  };
}

// الكومنتات
function loadComments(videoId) {
  const section = document.getElementById("commentsSection");
  section.innerHTML = "";
  const comments = dbData.comments.filter(c => c.videoId === videoId);
  comments.forEach(c => {
    const div = document.createElement("div");
    div.className = "comment";
    div.innerHTML = `
      <img src="${c.avatarBase64}" width="40" height="40" style="border-radius:50%">
      <strong>${c.username}</strong>
      <p>${c.text}</p>
      <small>👍 ${c.likes}</small>
    `;
    section.appendChild(div);
  });
}

function addComment() {
  const input = document.getElementById("commentInput");
  const text = input.value.trim();
  if (!text) return alert("اكتب تعليق أولاً");
  const newComment = {
    commentId: "c" + Date.now(),
    videoId: currentVideo.videoId,
    userId: "u" + Date.now(),
    username: "مستخدم تجريبي",
    avatarBase64: "data:image/png;base64,...",
    text,
    date: new Date().toISOString(),
    likes: 0
  };
  dbData.comments.push(newComment);
  updateGist(dbData);
  loadComments(currentVideo.videoId);
  input.value = "";
}

// رفع التغييرات إلى Gist
async function updateGist(newData) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `token ${token}`,
      "Accept": "application/vnd.github.v3+json"
    },
    body: JSON.stringify({
      files: {
        "database.json": { content: JSON.stringify(newData, null, 2) }
      }
    })
  });
  await res.json();
}

// رفع فيديو جديد
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

async function uploadVideo() {
  const title = document.getElementById("videoTitle").value.trim();
  const videoFile = document.getElementById("videoFile").files[0];
  const thumbnailFile = document.getElementById("thumbnailFile").files[0];
  if (!title || !videoFile || !thumbnailFile) return alert("الرجاء إدخال جميع البيانات!");

  const videoBase64 = await fileToBase64(videoFile);
  const thumbnailBase64 = await fileToBase64(thumbnailFile);

  const channelId = "1234567890";
  let channel = dbData.channels.find(c => c.channelId === channelId);
  if (!channel) {
    channel = {
      channelId,
      channelName: "قناتي التجريبية",
      channelUsername: "zyloxtube",
      channelAvatarBase64: "data:image/png;base64,...",
      subscribers: 0
    };
    dbData.channels.push(channel);
  }

  const newVideo = {
    videoId: "v" + Date.now(),
    title,
    thumbnailBase64,
    videoBase64,
    duration: "00:00",
    channelId,
    views: 0,
    likes: 0,
    dislikes: 0
  };

  dbData.videos.push(newVideo);
  await updateGist(dbData);
  alert("تم رفع الفيديو بنجاح!");
  document.getElementById("videoTitle").value = "";
  document.getElementById("videoFile").value = "";
  document.getElementById("thumbnailFile").value = "";
  loadDBAndDisplayVideos();
}
