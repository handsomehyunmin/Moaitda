import { state } from "./state.js";
import { $, openModal } from "./ui.js";
import { avatarHtml, resizeImage } from "./utils.js";
import { apiRequest } from "./api.js";
import { saveSession } from "./session.js";

let pendingProfileImage = null;
let readingProfileImage = false;
let savingProfileImage = false;
let profileReadVersion = 0;

let renderPostsCallback = () => {};
let renderCommentsCallback = () => {};

export function updateProfileUI() {
  if (!state.currentUser) return;

  const name =
    state.currentUser.nickname || "사용자";

  $("#profileName").textContent = name;

  $("#profileAvatar").innerHTML = avatarHtml(
    state.currentUser.profileImage,
    name
  );

  $("#bigAvatar").innerHTML = avatarHtml(
    state.currentUser.profileImage,
    name
  );

  $("#profileModalName").textContent = name;
  $("#profileModalEmail").textContent =
    state.currentUser.email;
}

function updateProfileControls() {
  $("#saveProfileImageBtn").disabled =
    pendingProfileImage === null ||
    readingProfileImage ||
    savingProfileImage;

  $("#profileImageInput").disabled =
    savingProfileImage;

  $("#removeProfileImageBtn").disabled =
    savingProfileImage;
}

export async function refreshProfile() {
  const token = state.sessionToken;

  try {
    const data = await apiRequest("/me");

    if (
      !state.currentUser ||
      state.sessionToken !== token
    ) {
      return;
    }

    state.currentUser.profileImage =
      data.profileImage || "";

    saveSession();
    updateProfileUI();
  } catch (error) {
    console.warn(error.message);
  }
}

async function handleProfileImageChange(event) {
  const file = event.target.files[0];

  if (!file) return;

  const version = ++profileReadVersion;

  readingProfileImage = true;
  updateProfileControls();

  $("#profileImageStatus").textContent =
    "사진을 불러오는 중...";

  try {
    const resized = await resizeImage(file, 512);

    if (
      version !== profileReadVersion ||
      !state.currentUser
    ) {
      return;
    }

    pendingProfileImage = resized;

    $("#bigAvatar").innerHTML = avatarHtml(
      pendingProfileImage,
      state.currentUser.nickname
    );

    $("#profileImageStatus").textContent =
      "미리보기입니다. 사진 저장을 눌러주세요.";
  } catch (error) {
    if (version === profileReadVersion) {
      $("#profileImageStatus").textContent =
        error.message;
    }
  } finally {
    if (version === profileReadVersion) {
      readingProfileImage = false;
      updateProfileControls();
    }
  }
}

function handleRemoveProfileImage() {
  if (!state.currentUser) return;

  profileReadVersion++;
  readingProfileImage = false;
  pendingProfileImage = "";

  $("#profileImageInput").value = "";

  $("#bigAvatar").innerHTML = avatarHtml(
    "",
    state.currentUser.nickname
  );

  $("#profileImageStatus").textContent =
    "사진 저장을 누르면 기본 프로필로 변경됩니다.";

  updateProfileControls();
}

async function handleProfileSubmit(event) {
  event.preventDefault();

  if (
    pendingProfileImage === null ||
    readingProfileImage ||
    savingProfileImage ||
    !state.currentUser
  ) {
    return;
  }

  const token = state.sessionToken;

  savingProfileImage = true;
  updateProfileControls();

  $("#profileImageStatus").textContent = "저장 중...";

  try {
    const data = await apiRequest(
      "/me/profile-image",
      {
        method: "PUT",
        body: JSON.stringify({
          image: pendingProfileImage
        })
      }
    );

    if (
      !state.currentUser ||
      token !== state.sessionToken
    ) {
      return;
    }

    state.currentUser.profileImage =
      data.profileImage;

    for (const post of state.posts) {
      if (
        post.authorEmail === state.currentUser.email
      ) {
        post.authorImage = data.profileImage;
      }

      for (const comment of post.comments || []) {
        if (
          comment.authorEmail === state.currentUser.email
        ) {
          comment.authorImage = data.profileImage;
        }
      }
    }

    pendingProfileImage = null;

    saveSession();
    updateProfileUI();
    renderPostsCallback();

    const selected = state.posts.find(
      (post) => post.id === state.selectedPostId
    );

    if (selected) {
      renderCommentsCallback(selected);
    }

    $("#profileImageStatus").textContent =
      "프로필 사진을 저장했습니다.";
  } catch (error) {
    $("#profileImageStatus").textContent =
      error.message;
  } finally {
    savingProfileImage = false;
    updateProfileControls();
  }
}

export function initProfile({
  renderPosts,
  renderComments
} = {}) {
  if (typeof renderPosts === "function") {
    renderPostsCallback = renderPosts;
  }

  if (typeof renderComments === "function") {
    renderCommentsCallback = renderComments;
  }

  $("#profileBtn")?.addEventListener("click", () => {
    if (!savingProfileImage) {
      profileReadVersion++;
      readingProfileImage = false;
      pendingProfileImage = null;

      $("#profileImageInput").value = "";
      $("#profileImageStatus").textContent = "";

      updateProfileUI();
      updateProfileControls();
    }

    openModal("profileModal");
  });

  $("#profileImageInput")?.addEventListener(
    "change",
    handleProfileImageChange
  );

  $("#removeProfileImageBtn")?.addEventListener(
    "click",
    handleRemoveProfileImage
  );

  $("#profileImageForm")?.addEventListener(
    "submit",
    handleProfileSubmit
  );
}
