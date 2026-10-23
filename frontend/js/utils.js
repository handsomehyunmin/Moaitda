export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[ch]));
}

export function formatDate(iso) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function initials(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

export async function resizeImage(file, maxEdge) {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("JPG, PNG, GIF, WebP 이미지를 선택해주세요.");
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error("20MB 이하의 이미지를 선택해주세요.");
  }

  const url = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const scale = Math.min(
      1,
      maxEdge / Math.max(image.naturalWidth, image.naturalHeight)
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    for (let attempt = 0; attempt < 8; attempt++) {
      const context = canvas.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const data = canvas.toDataURL("image/webp", 0.85);
      const encoded = data.split(",")[1];

      const bytes =
        encoded.length * 3 / 4 -
        (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);

      if (bytes <= 2 * 1024 * 1024) {
        return data;
      }

      canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
      canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
    }

    throw new Error("이미지 크기를 줄일 수 없습니다.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function avatarHtml(image, name) {
  const imagePattern =
    /^data:image\/(jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/;

  if (typeof image === "string" && imagePattern.test(image)) {
    return `<img class="avatar-image" src="${escapeHtml(image)}" alt="">`;
  }

  return escapeHtml(initials(name));
}
