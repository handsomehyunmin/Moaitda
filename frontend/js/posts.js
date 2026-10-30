import { state } from "./state.js";
import { $, $$, closeModal, openModal, toast } from "./ui.js";
import {
  avatarHtml,
  escapeHtml,
  formatDate,
  resizeImage
} from "./utils.js";
import { apiRequest } from "./api.js";
import { renderComments } from "./comments.js";

let postImageVersion = 0;
let readingPostImage = false;

function getVisiblePosts() {
  const query =
    $("#searchInput")?.value.trim().toLowerCase() || "";

  return [...state.posts]
    .filter((post) => {
      const textMatch =
        !query ||
        [
          post.title,
          post.content,
          ...(post.tags || [])
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      let filterMatch = true;

      if (state.currentFilter.type === "mine") {
        filterMatch =
          post.authorEmail === state.currentUser?.email;
      }

      if (state.currentFilter.type === "liked") {
        filterMatch =
          (post.likes || []).includes(state.currentUser?.email);
      }

      if (state.currentFilter.type === "tag") {
        filterMatch =
          (post.tags || []).includes(state.currentFilter.value);
      }

      return textMatch && filterMatch;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    );
}

function updateFilterLabel() {
  const title = $("#pageTitle");
  const description = $("#pageDescription");
  const label = $("#activeFilter");

  if (state.currentFilter.type === "mine") {
    title.textContent = "내 게시물";
    description.textContent =
      "내가 작성한 게시물만 모아서 볼 수 있어요.";
    label.textContent = "내 게시물";
    return;
  }

  if (state.currentFilter.type === "liked") {
    title.textContent = "좋아요";
    description.textContent =
      "내가 좋아요한 게시물을 확인할 수 있어요.";
    label.textContent = "좋아요한 게시글";
    return;
  }

  if (state.currentFilter.type === "tag") {
    title.textContent = `#${state.currentFilter.value}`;
    description.textContent =
      `#${state.currentFilter.value} 태그가 있는 게시물을 모아봤어요.`;
    label.textContent =
      `#${state.currentFilter.value} 게시글`;
    return;
  }

  title.textContent = "홈";
  description.textContent =
    "모든 사용자의 게시물을 확인할 수 있어요.";
  label.textContent = "전체 게시글";
}

export function renderPosts() {
  if (!state.currentUser) return;

  const visible = getVisiblePosts();
  const feed = $("#postFeed");

  if (!feed) return;

  feed.innerHTML = "";

  visible.forEach((post) => {
    const card = document.createElement("article");

    card.className = "feed-post";
    card.dataset.id = post.id;

    card.innerHTML = `
      <div class="feed-post-head">
        <div class="feed-author">
          <span class="feed-avatar">
            ${avatarHtml(post.authorImage, post.authorName)}
          </span>

          <div>
            <strong>
              ${escapeHtml(post.authorName || "사용자")}
            </strong>
            <span>${formatDate(post.createdAt)}</span>
          </div>
        </div>
        ${post.visibility === "friends" ? '<span class="visibility-badge">친구 공개</span>' : ""}
      </div>

      <h3>${escapeHtml(post.title)}</h3>

      <p class="feed-content">${escapeHtml(
        post.content.length > 260
          ? post.content.slice(0, 260) + "…"
          : post.content
      )}</p>

      ${
        post.image
          ? `<img class="feed-image" src="${post.image}" alt="게시물 이미지">`
          : ""
      }

      <div class="card-tags">
        ${(post.tags || [])
          .map(
            (tag) =>
              `<span class="tag">#${escapeHtml(tag)}</span>`
          )
          .join("")}
      </div>

      <div class="feed-post-foot">
        <span>
          ${(post.likes || []).includes(state.currentUser.email)
            ? "♥"
            : "♡"}
          ${(post.likes || []).length}
        </span>

        <span>
          💬 ${(post.comments || []).length}
        </span>
      </div>
    `;

    card.addEventListener("click", () => {
      openDetail(post.id);
    });

    feed.appendChild(card);
  });

  $("#postCount").textContent = `${visible.length}개`;

  $("#emptyState").classList.toggle(
    "hidden",
    visible.length !== 0
  );

  updateFilterLabel();
}

export async function loadPosts() {
  try {
    const loaded = await apiRequest("/posts");

    if (!state.currentUser) return;

    state.posts = Array.isArray(loaded)
      ? loaded.filter(Boolean)
      : [];

    renderPosts();
  } catch (error) {
    toast(
      error.message === "Failed to fetch"
        ? "서버 연결을 확인해주세요."
        : error.message
    );
  }
}

export function openWrite(post = null) {
  postImageVersion++;
  readingPostImage = false;

  $("#savePostBtn").disabled = state.savingPost;

  $("#postForm").reset();

  $("#editingPostId").value = post?.id || "";
  $("#postTitle").value = post?.title || "";
  $("#postContent").value = post?.content || "";
  $("#postTags").value = (post?.tags || []).join(", ");
  $("#postVisibility").value = post?.visibility || "public";

  state.imageData = post?.image || "";

  $("#imagePreview").innerHTML =
    state.imageData
      ? `<img src="${state.imageData}" alt="">`
      : "";

  $("#imagePreview").classList.toggle(
    "hidden",
    !state.imageData
  );

  $("#writeModalTitle").textContent =
    post ? "게시글 수정" : "새 게시글 작성";

  $("#savePostBtn").textContent =
    post ? "수정하기" : "게시하기";

  openModal("writeModal");
}

export function openDetail(id) {
  const post = state.posts.find((item) => item.id === id);

  if (!post) return;

  state.selectedPostId = id;

  $("#detailTitle").textContent = post.title;
  $("#detailAuthor").textContent = `👤 ${post.authorName}`;
  $("#detailDate").textContent =
    `📅 ${formatDate(post.createdAt)}`;
  $("#detailContent").textContent = post.content;

  $("#detailTags").innerHTML = (post.tags || [])
    .map(
      (tag) =>
        `<span class="tag">#${escapeHtml(tag)}</span>`
    )
    .join("");

  $("#likeDetailBtn").innerHTML = `
    ${
      (post.likes || []).includes(state.currentUser.email)
        ? "♥"
        : "♡"
    }
    <span id="likeCount">${(post.likes || []).length}</span>
  `;

  $("#detailImage").innerHTML =
    post.image
      ? `<img src="${post.image}" alt="">`
      : "";

  $("#detailImage").classList.toggle(
    "hidden",
    !post.image
  );

  const own =
    post.authorEmail === state.currentUser.email;

  $("#editPostBtn").classList.toggle("hidden", !own);
  $("#deletePostBtn").classList.toggle("hidden", !own);

  renderComments(post);
  openModal("detailModal");
}

async function handlePostImageChange(event) {
  const file = event.target.files[0];

  if (!file) return;

  const version = ++postImageVersion;

  readingPostImage = true;
  $("#savePostBtn").disabled = true;

  try {
    const resized = await resizeImage(file, 1600);

    if (version !== postImageVersion) return;

    state.imageData = resized;

    $("#imagePreview").innerHTML =
      `<img src="${resized}" alt="">`;

    $("#imagePreview").classList.remove("hidden");
  } catch (error) {
    if (version === postImageVersion) {
      event.target.value = "";
      toast(error.message);
    }
  } finally {
    if (version === postImageVersion) {
      readingPostImage = false;
      $("#savePostBtn").disabled = state.savingPost;
    }
  }
}

async function handlePostSubmit(event) {
  event.preventDefault();

  if (
    state.savingPost ||
    readingPostImage ||
    !state.currentUser
  ) {
    return;
  }

  const editingId = $("#editingPostId").value;
  const title = $("#postTitle").value.trim();
  const content = $("#postContent").value.trim();

  const tags = [
    ...new Set(
      $("#postTags")
        .value
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
    )
  ].slice(0, 6);

  if (!title || !content) {
    toast("제목과 내용을 입력해주세요.");
    return;
  }

  state.savingPost = true;

  const button = $("#savePostBtn");
  button.disabled = true;

  try {
    const post = await apiRequest(
      editingId
        ? `/posts/${encodeURIComponent(editingId)}`
        : "/posts",
      {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify({
          title,
          content,
          tags,
          image: state.imageData,
          visibility: $("#postVisibility").value
        })
      }
    );

    if (editingId) {
      const index = state.posts.findIndex(
        (item) => item.id === editingId
      );

      if (index >= 0) {
        state.posts[index] = post;
      }
    } else {
      state.posts.unshift(post);
      state.currentFilter = {
        type: "all",
        value: null
      };

      $("#searchInput").value = "";

      $$("[data-filter]").forEach((filterButton) => {
        filterButton.classList.toggle(
          "active",
          filterButton.dataset.filter === "all"
        );
      });
    }

    closeModal("writeModal");
    renderPosts();
    toast("게시물을 저장했습니다.");
  } catch (error) {
    toast(
      error.message === "Failed to fetch"
        ? "서버 연결을 확인해주세요."
        : error.message
    );
  } finally {
    state.savingPost = false;
    button.disabled = false;
  }
}

async function handleLike() {
  const postId = state.selectedPostId;
  const button = $("#likeDetailBtn");

  if (!postId || button.disabled) return;

  button.disabled = true;

  try {
    const saved = await apiRequest(
      `/posts/${encodeURIComponent(postId)}/likes`,
      { method: "POST" }
    );

    const index = state.posts.findIndex(
      (post) => post.id === postId
    );

    if (index >= 0) {
      state.posts[index] = saved;
    }

    if (
      state.selectedPostId === postId &&
      !$("#detailModal").classList.contains("hidden")
    ) {
      openDetail(postId);
    }

    renderPosts();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function handleDelete() {
  const post = state.posts.find(
    (item) => item.id === state.selectedPostId
  );

  if (
    !post ||
    post.authorEmail !== state.currentUser.email
  ) {
    return;
  }

  if (!confirm("이 게시글을 삭제할까요?")) return;

  try {
    await apiRequest(
      `/posts/${encodeURIComponent(post.id)}`,
      { method: "DELETE" }
    );
  } catch (error) {
    toast(error.message);
    return;
  }

  state.posts = state.posts.filter(
    (item) => item.id !== state.selectedPostId
  );

  state.selectedPostId = null;

  closeModal("detailModal");
  renderPosts();
  toast("게시글을 삭제했습니다.");
}

export function initPosts() {
  $("#headingNewPost")?.addEventListener("click", () => {
    openWrite();
  });

  $("#postImage")?.addEventListener(
    "change",
    handlePostImageChange
  );

  $("#postForm")?.addEventListener(
    "submit",
    handlePostSubmit
  );

  $("#likeDetailBtn")?.addEventListener(
    "click",
    handleLike
  );

  $("#editPostBtn")?.addEventListener("click", () => {
    const post = state.posts.find(
      (item) => item.id === state.selectedPostId
    );

    if (!post) return;

    closeModal("detailModal");
    openWrite(post);
  });

  $("#deletePostBtn")?.addEventListener(
    "click",
    handleDelete
  );
}
