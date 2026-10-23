import { state } from "./state.js";
import { $, toast } from "./ui.js";
import { apiRequest } from "./api.js";
import { avatarHtml, escapeHtml } from "./utils.js";

let savingComment = false;
let refreshPostsCallback = () => {};

export function renderComments(post) {
  const list = $("#commentsList");

  if (!list) return;

  $("#commentCount").textContent = (post.comments || []).length;

  if (!post.comments?.length) {
    list.innerHTML = `
      <p class="muted">
        아직 댓글이 없습니다. 첫 댓글을 남겨보세요.
      </p>
    `;
    return;
  }

  list.innerHTML = post.comments
    .map((comment) => `
      <div class="comment">
        <strong class="comment-author">
          <span class="comment-avatar">
            ${avatarHtml(comment.authorImage, comment.authorName)}
          </span>
          ${escapeHtml(comment.authorName)}
        </strong>

        <p>${escapeHtml(comment.text)}</p>
      </div>
    `)
    .join("");
}

export function initComments({ refreshPosts } = {}) {
  if (typeof refreshPosts === "function") {
    refreshPostsCallback = refreshPosts;
  }

  $("#commentForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = $("#commentInput");
    const content = input.value.trim();
    const postId = state.selectedPostId;

    if (!content || !postId || savingComment) return;

    savingComment = true;

    try {
      const saved = await apiRequest(
        `/posts/${encodeURIComponent(postId)}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ content })
        }
      );

      const index = state.posts.findIndex(
        (post) => post.id === postId
      );

      if (index >= 0) {
        state.posts[index] = saved;
      }

      if (state.selectedPostId === postId) {
        if (input.value.trim() === content) {
          input.value = "";
        }

        renderComments(saved);
      }

      refreshPostsCallback();
    } catch (error) {
      toast(error.message);
    } finally {
      savingComment = false;
    }
  });
}
