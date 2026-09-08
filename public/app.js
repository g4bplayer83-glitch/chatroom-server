/* DocSpace 3.5 — un client, une connexion, des vues explicites. */
"use strict";
const $ = (id) => document.getElementById(id);
const icons = {
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0Z M7 10h8 M7 14h5",
  folder: "M3 7V4h6l2 3h10v13H3Z",
  game: "M7 7h10c3 0 5 11 3 12-2 1-4-3-5-3H9c-1 0-3 4-5 3-2-1 0-12 3-12Z M7 10v5 M4.5 12.5h5 M16 11h.1 M19 14h.1",
  settings:
    "m9 3 1-1h4l1 3 3 1 3 2-1 3 1 3-3 3-3 1-1 3h-4l-1-3-3-1-3-3 1-3-1-3 3-2 3-1Z M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
  search: "M17 10a7 7 0 1 0-14 0 7 7 0 0 0 14 0Z M15 15l6 6",
  plus: "M12 4v16 M4 12h16",
  close: "m6 6 12 12 M6 18 18 6",
  hash: "m10 3-4 18 M18 3l-4 18 M3 8h18 M2 16h18",
  users:
    "M15 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z M3 21v-3a7 7 0 0 1 14 0v3 M17 3a4 4 0 0 1 0 8 M20 15l1 6",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  smile:
    "M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0Z M8 9h.1 M16 9h.1 M7 14q5 6 10 0",
  send: "m3 3 19 9-19 9 4-9Z M7 12h15",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  headphones: "M3 14v-3a9 9 0 0 1 18 0v3 M3 13h4v8H3Z M17 13h4v8h-4Z",
  "phone-off":
    "M5 3 3 5c-2 6 10 18 16 16l2-2-5-5-3 2-5-5 2-3Z M16 3l5 5 M21 3l-5 5",
  download: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4",
  volume: "M3 9h4l5-5v16l-5-5H3Z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14",
};
function icon(name) {
  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[name] || icons.hash}"/></svg>`;
}
function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}
function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function decodeLegacy(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}
function safePath(value) {
  const s = String(value || "");
  return /^\/uploads\/[a-zA-Z0-9_./-]+$/.test(s) && !s.includes("..") ? s : "";
}
function avatarHTML(name, url) {
  const src = safePath(url);
  return `<span class="avatar">${
    src
      ? `<img src="${esc(src)}" alt="" loading="lazy">`
      : esc(
          String(name || "?")
            .slice(0, 2)
            .toUpperCase(),
        )
  }</span>`;
}
function bytes(n) {
  return n >= 1048576
    ? `${(n / 1048576).toFixed(1)} Mo`
    : `${Math.ceil((n || 0) / 1024)} Ko`;
}
function keyName(v) {
  return String(v || "").toLowerCase();
}
function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
const preferences = readLocal("docspace.preferences", {
  theme: "dark",
  compact: false,
  motion: false,
  quietEvents: true,
  echo: true,
  noise: true,
});
function savePreferences() {
  localStorage.setItem("docspace.preferences", JSON.stringify(preferences));
  applyPreferences();
}
function applyPreferences() {
  document.body.classList.toggle("light", preferences.theme === "light");
  document.body.classList.toggle("compact", !!preferences.compact);
  document.body.classList.toggle("reduce-motion", !!preferences.motion);
}
const state = {
  me: null,
  ready: false,
  view: "channels",
  channel: "général",
  peer: null,
  channels: [],
  voiceChannels: [],
  messages: [],
  users: [],
  conversations: [],
  emojis: [],
  reactions: {},
  reactionTarget: null,
  friends: { friends: [], pending: [], requests: [] },
  unread: {},
  drafts: {},
  reply: null,
  attachment: null,
  token: sessionStorage.getItem("docspace.token") || "",
  register: false,
  typingTimer: 0,
  uploading: false,
};
const socket = io({ autoConnect: false });
window.DocSpace = { socket, state, toast, icon, esc, preferences };
let toastTimer, authTimer;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 5000);
}
function authError(message) {
  clearTimeout(authTimer);
  $("auth-submit").disabled = false;
  $("auth-error").textContent = message;
}
function showAuth(message = "") {
  state.ready = false;
  state.me = null;
  state.token = "";
  sessionStorage.removeItem("docspace.token");
  $("auth").hidden = false;
  $("app").hidden = true;
  authError(message);
}
function draftKey() {
  return state.view === "dms"
    ? `dm:${keyName(state.peer)}`
    : `channel:${state.channel}`;
}
function rememberDraft() {
  state.drafts[draftKey()] = $("message-input").value;
}
function setDrawer(open) {
  $("sidebar").classList.toggle("open", open);
  $("drawer-shade").hidden = !open;
}
function setPage(title, description, symbol) {
  $("view-title").textContent = title;
  $("view-description").textContent = description;
  $("view-symbol").textContent = symbol;
}
function navigate(view, peer = null, channel = state.channel) {
  rememberDraft();
  stopTyping();
  window.closeDocSpaceGames?.();
  state.view = view;
  state.peer = peer;
  state.channel = channel;
  state.messages = [];
  state.reply = null;
  state.attachment = null;
  renderAttachment();
  $("reply-preview").hidden = true;
  document
    .querySelectorAll("[data-view]")
    .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $("sidebar-title").textContent =
    view === "dms" ? "Messages privés" : "DocSpace";
  $("conversation").hidden =
    !["channels", "dms"].includes(view) || (view === "dms" && !peer);
  $("page").hidden = !$("conversation").hidden;
  renderNavigation();
  setDrawer(false);
  $("message-input").value = state.drafts[draftKey()] || "";
  resizeComposer();
  $("message-input").maxLength = view === "dms" ? 4000 : 500;
  if (view === "channels") {
    setPage(state.channel, "Les discussions commencent ici.", "#");
    $("message-input").placeholder =
      `Envoyer un message dans #${state.channel}`;
    socket.emit("switch_channel", { channel: state.channel });
    renderMessages();
    renderMembers();
  }
  if (view === "dms") {
    socket.emit("get_dm_conversations");
    if (peer) {
      state.unread[keyName(peer)] = 0;
      setPage(peer, "Votre conversation, tout simplement.", "@");
      $("message-input").placeholder = `Envoyer un message à @${peer}`;
      socket.emit("get_dm_history", { username: peer });
      socket.emit("get_user_profile", { username: peer });
      renderMessages();
    } else {
      setPage(
        "Amis et messages",
        "Une conversation suffit pour se retrouver.",
        "◌",
      );
      renderDMHome();
      renderMembers();
    }
  }
  if (view === "files") {
    setPage(
      "Fichiers partagés",
      `Les pièces jointes de #${state.channel}`,
      "▱",
    );
    $("members").innerHTML = "";
    $("page").innerHTML = "<p>Chargement des fichiers…</p>";
    socket.emit("switch_channel", { channel: state.channel });
  }
  if (view === "arcade") {
    setPage("Arcade", "Une pause, une partie, puis on se retrouve.", "✦");
    $("members").innerHTML = "";
    renderArcade();
  }
}
function renderNavigation() {
  let html = "";
  if (state.view === "dms") {
    html = `<button class="nav-item ${!state.peer ? "active" : ""}" data-home-dms>${icon("users")}<span>Amis</span><span class="pill">${state.friends.friends?.length || 0}</span></button><div class="nav-label">Messages privés <button class="link" data-find-person aria-label="Nouvelle conversation">+</button></div>`;
    const list = [...state.conversations];
    if (
      state.peer &&
      !list.some((c) => keyName(c.username) === keyName(state.peer))
    )
      list.unshift({
        username: state.peer,
        lastMessage: "Nouvelle conversation",
      });
    html += list
      .map(
        (c) =>
          `<button class="nav-item ${keyName(c.username) === keyName(state.peer) ? "active" : ""}" data-peer="${esc(c.username)}">${avatarHTML(c.username, c.avatar)}<span class="dm-copy"><strong>${esc(c.username)}</strong><small>${esc(decodeLegacy(c.lastMessage) || "Dire bonjour")}</small></span>${state.unread[keyName(c.username)] ? `<span class="unread">${state.unread[keyName(c.username)]}</span>` : ""}</button>`,
      )
      .join("");
    if (!list.length)
      html += '<p class="section-note">Tes conversations apparaîtront ici.</p>';
    $("voice-list").innerHTML = "";
  } else {
    let category = "";
    for (const c of state.channels) {
      if (c.category !== category) {
        category = c.category;
        html += `<div class="nav-label">${esc(category || "Discussions")}</div>`;
      }
      html += `<button class="nav-item ${state.view === "channels" && state.channel === c.name ? "active" : ""}" data-channel="${esc(c.name)}"><span class="hash">#</span><span>${esc(c.name)}</span></button>`;
    }
    $("voice-list").innerHTML =
      '<div class="nav-label">Salons vocaux</div>' +
      state.voiceChannels
        .map(
          (c) =>
            `<button class="nav-item" data-voice-room="${esc(c.name)}">${icon("volume")}<span>${esc(c.label || c.name)}</span><small data-voice-count="${esc(c.name)}"></small></button>`,
        )
        .join("");
  }
  $("nav-list").innerHTML = html;
}
function renderMembers() {
  const users = state.users.filter(
    (u) => keyName(u.username) !== keyName(state.me?.username),
  );
  $("members").innerHTML =
    `<h3>En ligne — ${state.users.length}</h3>` +
    users
      .map(
        (u) =>
          `<button class="person" data-peer="${esc(u.username)}">${avatarHTML(u.username, u.avatar)}<div><strong>${esc(u.username)}</strong><small>${esc(u.customStatus || "Disponible")}</small></div><span class="online-dot"></span></button>`,
      )
      .join("") +
    (!users.length
      ? "<small>Tes amis apparaîtront ici dès leur connexion.</small>"
      : "");
}
function renderProfile(p) {
  if (state.view !== "dms" || keyName(p.username) !== keyName(state.peer))
    return;
  const color = /^#[a-f0-9]{6}$/i.test(p.profileColor || "")
    ? p.profileColor
    : "#65609c";
  $("members").innerHTML =
    `<div class="profile-card"><div class="profile-banner" style="background:${color}"></div>${avatarHTML(p.username, p.avatar)}<h2>${esc(p.username)}</h2><small>${p.status === "offline" ? "Hors ligne" : "En ligne"}</small><div class="profile-divider"></div><h3>À propos</h3><p>${esc(p.bio || "Ce profil attend encore quelques mots.")}</p><div class="profile-divider"></div><h3>Membre depuis</h3><small>${p.joinDate ? new Date(p.joinDate).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "Les débuts de DocSpace"}</small><div class="profile-divider"></div><button class="primary" data-add-friend="${esc(p.username)}">Ajouter en ami</button></div>`;
}
function renderDMHome() {
  const friends = state.friends.friends || [],
    requests = state.friends.requests || [];
  const name = (f) => (typeof f === "string" ? f : f.username);
  $("page").innerHTML =
    `<div class="page-heading"><div><span class="eyebrow">LES BONNES CONVERSATIONS</span><h2 style="margin-top:12px">On se retrouve ici.</h2><p>Un bonjour, une idée ou votre prochaine partie.</p></div><button class="primary" data-find-person>Nouvelle conversation</button></div>${requests.length ? `<h3>Demandes reçues</h3>${requests.map((f) => `<div class="friend-row">${avatarHTML(name(f))}<div><strong>${esc(name(f))}</strong></div><button data-accept-friend="${esc(name(f))}">Accepter</button><button data-reject-friend="${esc(name(f))}">Refuser</button></div>`).join("")}` : ""}<h3 style="margin-top:35px">Mes amis <span class="pill">${friends.length}</span></h3>${friends.length ? friends.map((f) => `<div class="friend-row">${avatarHTML(name(f), f.avatar)}<div><strong>${esc(name(f))}</strong><small>${state.users.some((u) => keyName(u.username) === keyName(name(f))) ? "En ligne" : "Hors ligne"}</small></div><button data-peer="${esc(name(f))}">Message</button></div>`).join("") : '<div class="empty"><span class="empty-symbol">◌</span><h2>Tout commence par un bonjour.</h2><p>Ouvre une conversation avec le pseudo de ton ami. Son profil te permettra aussi de l’ajouter à ta liste d’amis.</p><button class="primary" data-find-person>Retrouver un ami</button></div>'}${state.friends.pending?.length ? `<p class="section-note">${state.friends.pending.length} demande(s) d’amitié en attente.</p>` : ""}`;
}
function renderArcade() {
  $("page").innerHTML =
    `<div class="page-heading"><div><span class="eyebrow">FAIS UNE PAUSE</span><h2 style="margin-top:12px">À quoi on joue ?</h2><p>Des jeux légers. Des contrôles au clavier et au toucher.</p></div><span class="pill">ARCADE</span></div><div class="page-cards"><button class="feature-card" data-game-open="tetris"><span class="feature-icon">▦</span><h3>Tetris Versus</h3><p>Empile, complète des lignes et défie un ami avec le même code.</p><span class="pill">Solo · Duel</span></button><button class="feature-card" data-game-open="maze"><span class="feature-icon">◈</span><h3>Neon Maze</h3><p>Explore le labyrinthe et retrouve les six orbes. Joue seul ou ensemble.</p><span class="pill">Exploration · Multi</span></button><button class="feature-card" data-game-open="pong"><span class="feature-icon">↔</span><h3>Pulse Pong</h3><p>Garde le rythme. Déplace ta raquette et marque sept points.</p><span class="pill">Solo · Tactile</span></button><button class="feature-card" data-godot-open><span class="feature-icon">◇</span><h3>Orbit Garden</h3><p>Un petit terrain 3D pour ramasser des cristaux, créé avec Godot.</p><span class="pill">Godot · 3D</span></button></div><div class="section-note">Le jeu s’arrête quand tu quittes l’Arcade. Tes conversations et le vocal restent accessibles.</div><div class="page-heading"><div><h3>Regarder ensemble</h3><p>Ouvre une vidéo YouTube dans le lecteur intégré.</p></div></div><form id="youtube-form"><label>Lien YouTube<input name="video" placeholder="https://www.youtube.com/watch?v=…" required></label><button class="primary" style="margin-top:12px">Ouvrir la vidéo</button></form><div id="youtube-player"></div>`;
}
function textContentHTML(content) {
  const parts = String(content || "").split(/(:[a-zA-Z0-9_]{2,32}:)/g);
  return parts
    .map((p) => {
      const found = state.emojis.find((e) => `:${e.name}:` === p);
      const src = safePath(found?.url || found?.path);
      return src
        ? `<img class="custom-emoji" src="${esc(src)}" alt="${esc(p)}" title="${esc(p)}">`
        : esc(p);
    })
    .join("");
}
function attachmentHTML(a) {
  if (!a) return "";
  const url = safePath(a.path || a.url);
  if (!url) return "";
  const name = a.originalname || a.name || a.filename || "Fichier";
  let media = "";
  if (/\.(png|jpe?g|webp|gif|avif)$/i.test(url))
    media = `<a href="${esc(url)}" target="_blank" rel="noopener"><img class="attachment-image" src="${esc(url)}" alt="${esc(name)}" loading="lazy"></a>`;
  if (/\.(mp3|ogg|wav|m4a)$/i.test(url))
    media = `<audio controls preload="none" src="${esc(url)}"></audio>`;
  if (/\.(mp4|webm)$/i.test(url))
    media = `<video class="attachment-image" controls preload="metadata" src="${esc(url)}"></video>`;
  return (
    media +
    `<a class="attachment" href="${esc(url)}" download="${esc(name)}">${icon("download")}<span>${esc(name)}<small>${bytes(a.size)}</small></span></a>`
  );
}
function renderMessage(m, previous) {
  const author = m.from || m.username || "DocSpace";
  const system = m.type === "system";
  if (system) {
    const row = document.createElement("div");
    row.className = "message system";
    row.textContent = decodeLegacy(m.content);
    return row;
  }
  const grouped =
    previous &&
    (previous.from || previous.username) === author &&
    new Date(m.timestamp) - new Date(previous.timestamp) < 300000 &&
    !m.replyTo &&
    previous.type !== "system";
  const el = document.createElement("article");
  el.className = "message" + (grouped ? " grouped" : "");
  el.dataset.id = m.id;
  el.innerHTML = `${avatarHTML(author, m.avatar)}<div class="message-body"><div class="message-heading"><button data-peer="${esc(author)}">${esc(author)}</button><time datetime="${esc(m.timestamp)}">${new Date(m.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time></div>${m.replyTo ? `<div class="reply-quote">↳ ${esc(m.replyTo.username)} : ${esc(decodeLegacy(m.replyTo.content).slice(0, 120))}</div>` : ""}<div class="message-content">${textContentHTML(m.from ? m.content : decodeLegacy(m.content))}</div>${attachmentHTML(m.attachment)}</div><div class="message-actions"><button data-reply="${esc(m.id)}" aria-label="Répondre à ce message" title="Répondre">↩</button>${!m.from && keyName(author) === keyName(state.me?.username) ? `<button data-edit="${esc(m.id)}">Modifier</button><button data-delete="${esc(m.id)}">Supprimer</button>` : ""}</div>`;
  if (!m.from) {
    const add = document.createElement("button");
    add.textContent = "☺";
    add.title = "Réagir";
    add.setAttribute("aria-label", "Réagir à ce message");
    add.onclick = () => {
      $("emoji-button").click();
      state.reactionTarget = m.id;
    };
    el.querySelector(".message-actions").append(add);
    const chips = document.createElement("div");
    chips.className = "reaction-chips";
    chips.dataset.reactionsFor = m.id;
    el.querySelector(".message-body").append(chips);
    fillReactions(chips, m.id);
  }
  return el;
}
function fillReactions(container, id) {
  container.replaceChildren();
  for (const [emoji, users] of Object.entries(state.reactions[id] || {})) {
    if (!Array.isArray(users) || !users.length) continue;
    const button = document.createElement("button");
    button.innerHTML = `${textContentHTML(emoji)} <span>${users.length}</span>`;
    button.title = users.join(", ");
    button.classList.toggle("selected", users.includes(state.me?.username));
    button.onclick = () =>
      socket.emit("reaction", {
        messageId: id,
        emoji,
        action: users.includes(state.me?.username) ? "remove" : "add",
      });
    container.append(button);
  }
}
function visibleMessages() {
  return state.messages
    .filter(
      (m) =>
        !(
          preferences.quietEvents &&
          m.type === "system" &&
          /Event (live|termine)|événement/i.test(m.content || "")
        ),
    )
    .slice(-250);
}
function renderMessages() {
  const list = $("message-list");
  list.replaceChildren();
  const welcome = document.createElement("div");
  welcome.className = "welcome-card";
  welcome.innerHTML = `<span class="eyebrow">${state.peer ? "JUSTE ENTRE VOUS" : "TON ESPACE, TES CONVERSATIONS"}</span><h2>${state.peer ? `Bonjour, ${esc(state.peer)}.` : `Bienvenue dans #${esc(state.channel)}`}</h2><p>${state.peer ? "Le début de votre conversation. Les messages restent disponibles après déconnexion." : "Partage une idée, un fichier ou simplement ta journée."}</p>`;
  list.append(welcome);
  let previous = null;
  for (const m of visibleMessages()) {
    const day = new Date(m.timestamp).toLocaleDateString("fr-FR");
    if (
      !previous ||
      new Date(previous.timestamp).toLocaleDateString("fr-FR") !== day
    ) {
      const divider = document.createElement("div");
      divider.className = "day-divider";
      divider.textContent = day;
      list.append(divider);
    }
    list.append(renderMessage(m, previous));
    previous = m;
  }
  list.scrollTop = list.scrollHeight;
  $("new-messages").hidden = true;
}
function appendMessage(m) {
  if (state.messages.some((x) => String(x.id) === String(m.id))) return;
  const list = $("message-list"),
    nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 130;
  const previous = visibleMessages().at(-1);
  state.messages.push(m);
  if (!visibleMessages().includes(m)) return;
  list.append(renderMessage(m, previous));
  if (state.messages.length > 250) {
    state.messages = state.messages.slice(-250);
    const first = list.querySelector(".message");
    first?.remove();
  }
  if (
    nearBottom ||
    keyName(m.from || m.username) === keyName(state.me?.username)
  ) {
    list.scrollTop = list.scrollHeight;
  } else {
    $("new-messages").hidden = false;
  }
}
function renderFiles(messages) {
  const files = messages
    .filter(
      (m) => m.attachment && safePath(m.attachment.path || m.attachment.url),
    )
    .reverse();
  $("page").innerHTML =
    `<div class="page-heading"><div><span class="eyebrow">ON MET LES IDÉES EN COMMUN</span><h2 style="margin-top:12px">Fichiers partagés</h2><p>Les fichiers conservés dans l’historique récent de #${esc(state.channel)}.</p></div><button class="primary" data-back-channel>Partager un fichier</button></div><label>Rechercher un fichier<input id="file-search" placeholder="Nom du document…"></label><div id="file-results">${files.map((m) => `<div class="file-row" data-filename="${esc(keyName(m.attachment.originalname || m.attachment.name || m.attachment.filename))}">${icon("folder")}<div><strong>${esc(m.attachment.originalname || m.attachment.name || m.attachment.filename)}</strong><small>${esc(m.username)} · ${bytes(m.attachment.size)}</small></div><a href="${esc(safePath(m.attachment.path || m.attachment.url))}" download>${icon("download")}</a></div>`).join("") || '<div class="empty"><h3>Un espace pour vos idées.</h3><p>Envoie un fichier avec le bouton + dans un salon pour le retrouver ici.</p></div>'}</div>`;
}
function resizeComposer() {
  const input = $("message-input");
  input.style.height = "auto";
  input.style.height = Math.min(140, input.scrollHeight) + "px";
}
function stopTyping() {
  clearTimeout(state.typingTimer);
  if (state.peer) socket.emit("dm_typing_stop", { to: state.peer });
  else socket.emit("typing_stop");
  $("typing").textContent = "";
}
function renderAttachment() {
  $("attachment-preview").hidden = !state.attachment;
  $("attachment-preview").innerHTML = state.attachment
    ? `📎 ${esc(state.attachment.originalname)} · ${bytes(state.attachment.size)} <button id="remove-attachment" aria-label="Retirer la pièce jointe">×</button>`
    : "";
}
async function upload(file, avatar = false) {
  if (!file) return null;
  if (file.size > (avatar ? 10 : 100) * 1048576)
    throw Error("Ce fichier dépasse la taille autorisée.");
  const body = new FormData();
  body.append(avatar ? "avatar" : "file", file);
  const response = await fetch(avatar ? "/upload-avatar" : "/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${state.token}` },
    body,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Envoi impossible");
  return result;
}
function showSettings(tab = "profile") {
  $("settings-dialog").showModal();
  renderSettings(tab);
}
function renderSettings(tab) {
  $("settings-tabs")
    .querySelectorAll("button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const panel = $("settings-content");
  if (tab === "profile") {
    panel.innerHTML = `<h3>Un profil qui te ressemble</h3><p>Ton pseudo : <strong>${esc(state.me.username)}</strong></p><form id="profile-form"><label>Photo de profil<input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><label>Quelques mots sur toi<textarea id="profile-bio" maxlength="300" placeholder="Tes projets, tes envies, ta prochaine partie…"></textarea></label><label>Statut<select id="profile-status"><option value="online">Disponible</option><option value="idle">Absent</option><option value="dnd">Ne pas déranger</option><option value="invisible">Invisible</option></select></label><button class="primary">Enregistrer le profil</button></form>`;
    socket.emit("get_user_profile", { username: state.me.username });
  }
  if (tab === "account") {
    panel.innerHTML = `<h3>Pseudo et mot de passe</h3><p>Tu es connecté en tant que <strong>${esc(state.me.username)}</strong>. Aucun email n’est demandé.</p><form id="password-form"><label>Mot de passe actuel<input name="current" type="password" autocomplete="current-password" required maxlength="128"></label><label>Nouveau mot de passe<input name="next" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label><label>Confirmer le nouveau mot de passe<input name="confirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128"></label><small>Au moins 8 caractères. Les autres sessions seront déconnectées.</small><button class="primary">Changer mon mot de passe</button></form><div class="setting-section"><button id="logout" class="danger">Se déconnecter</button></div>`;
  }
  if (tab === "appearance") {
    panel.innerHTML = `<h3>Le confort avant tout</h3><div class="setting-row"><label for="theme">Thème<small>Le même espace, une autre ambiance.</small></label><select id="theme"><option value="dark">Sombre</option><option value="light">Clair</option></select></div>${[
      ["compact", "Messages compacts", "Réduire l’espace entre les messages."],
      ["motion", "Réduire les animations", "Une interface plus calme."],
      [
        "quietEvents",
        "Masquer les annonces automatiques",
        "Garder le fil des vraies conversations.",
      ],
    ]
      .map(
        ([id, title, sub]) =>
          `<div class="setting-row"><label for="pref-${id}">${title}<small>${sub}</small></label><input type="checkbox" id="pref-${id}" data-pref="${id}" ${preferences[id] ? "checked" : ""}></div>`,
      )
      .join(
        "",
      )}<div class="section-note">Sur téléphone, utilise le menu du navigateur pour ajouter DocSpace à l’écran d’accueil.</div>`;
    $("theme").value = preferences.theme;
  }
  if (tab === "voice") {
    panel.innerHTML = `<h3>On t’écoute</h3><p>Le micro s’active seulement quand tu rejoins un salon vocal ou lances le test.</p><label>Microphone<select id="mic-device"><option value="">Microphone par défaut</option></select></label><button id="refresh-devices" style="margin-top:12px">Actualiser les microphones</button><div class="setting-row"><label for="pref-echo">Annulation de l’écho</label><input type="checkbox" id="pref-echo" data-pref="echo" ${preferences.echo ? "checked" : ""}></div><div class="setting-row"><label for="pref-noise">Réduction du bruit</label><input type="checkbox" id="pref-noise" data-pref="noise" ${preferences.noise ? "checked" : ""}></div><button id="test-mic" class="primary">Tester mon micro</button><meter id="mic-level" min="0" max="100" value="0" style="width:100%;margin-top:16px" aria-label="Niveau du microphone"></meter><p><small>Les changements de micro sont appliqués au prochain appel. Un serveur TURN peut être nécessaire sur certains réseaux.</small></p>`;
    window.DocSpaceVoice?.listDevices();
  }
  if (tab === "plus") {
    panel.innerHTML = `<div class="plus-hero"><h3>✦ DocSpace Plus ${state.me.plusActive ? "· Activé" : ""}</h3><p>Un petit bonus, sans abonnement : des emojis à toi, activés par un code de ton administrateur.</p></div>${!state.me.plusActive ? '<form id="plus-form"><label>Code d’activation<input name="code" required maxlength="100" placeholder="Ton code DocSpace Plus" autocomplete="off"></label><button class="primary">Activer Plus</button></form>' : '<form id="emoji-form"><label>Nom de l’emoji<input name="name" pattern="[a-z0-9_]{2,24}" minlength="2" maxlength="24" required placeholder="super_chat"></label><label>Image · 512 Ko maximum<input name="image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required></label><button class="primary">Ajouter mon emoji</button></form>'}<div class="emoji-list">${state.emojis
      .filter((e) => keyName(e.owner) === keyName(state.me.username))
      .map(
        (e) =>
          `<div class="emoji-item"><img src="${esc(safePath(e.url || e.path))}" alt="${esc(e.name)}"><small>:${esc(e.name)}:</small><button data-delete-emoji="${esc(e.id)}">Supprimer</button></div>`,
      )
      .join("")}</div>`;
  }
}
function handleAuth(data) {
  clearTimeout(authTimer);
  state.me = data;
  if (data.token) {
    state.token = data.token;
    sessionStorage.setItem("docspace.token", data.token);
  }
  $("login-password").value = "";
  $("confirm-password").value = "";
  $("auth-submit").disabled = false;
  socket.emit("user_join", {
    username: data.username,
    deviceId: sessionStorage.getItem("docspace.device") || socket.id,
  });
}
socket.on("connect", () => {
  state.ready = false;
  $("connection-state").textContent = "Connexion…";
  if (state.token) socket.emit("resume_account", { token: state.token });
});
socket.on("disconnect", (reason) => {
  state.ready = false;
  $("connection-state").textContent = "Reconnexion…";
  $("connection-state").classList.remove("online");
  window.DocSpaceVoice?.leave(false);
  if (reason === "io server disconnect" && state.me)
    showAuth("La session a été fermée. Reconnecte-toi.");
});
socket.on("connect_error", () =>
  authError(
    "Serveur indisponible. La connexion sera réessayée automatiquement.",
  ),
);
socket.on("account_registered", handleAuth);
socket.on("account_logged_in", handleAuth);
socket.on("account_error", (d) => authError(d.message));
socket.on("session_expired", () =>
  showAuth("Ta session a expiré. Reconnecte-toi."),
);
socket.on("account_required", (d) => {
  if (!state.token) showAuth(d.message);
});
socket.on("user_join_ready", () => {
  state.ready = true;
  $("auth").hidden = true;
  $("app").hidden = false;
  $("self-name").textContent = state.me.username;
  $("self-avatar").textContent = state.me.username.slice(0, 2).toUpperCase();
  $("connection-state").textContent = "Connecté";
  $("connection-state").classList.add("online");
  socket.emit("get_custom_emojis");
  socket.emit("get_friends");
  socket.emit("get_dm_conversations");
  navigate(state.view, state.peer);
  window.dispatchEvent(new Event("docspace:connected"));
});
socket.on("channel_config_update", (d) => {
  state.channels = d.channels || [];
  state.voiceChannels = d.voiceChannels || [];
  if (!state.channels.some((c) => c.name === state.channel))
    state.channel = state.channels[0]?.name || "général";
  renderNavigation();
});
socket.on("channel_history", (d) => {
  if (d.channel !== state.channel) return;
  if (state.view === "files") return renderFiles(d.messages || []);
  if (state.view !== "channels") return;
  state.messages = d.messages || [];
  state.reactions = d.reactions || {};
  renderMessages();
});
socket.on("reaction_update", (d) => {
  state.reactions[d.messageId] = d.reactions || {};
  document.querySelectorAll("[data-reactions-for]").forEach((el) => {
    if (el.dataset.reactionsFor === String(d.messageId))
      fillReactions(el, d.messageId);
  });
});
socket.on("new_message", (m) => {
  if (state.view === "channels" && (m.channel || "général") === state.channel)
    appendMessage(m);
});
socket.on("message_deleted", (d) => {
  state.messages = state.messages.filter(
    (m) => String(m.id) !== String(d.messageId || d.id),
  );
  renderMessages();
});
socket.on("message_edited", (d) => {
  const m = state.messages.find(
    (m) => String(m.id) === String(d.messageId || d.id),
  );
  if (m) {
    m.content = d.newContent;
    renderMessages();
  }
});
socket.on("users_update", (d) => {
  state.users = d.users || [];
  if (!(state.view === "dms" && state.peer)) renderMembers();
  if (state.view === "dms" && !state.peer) renderDMHome();
});
socket.on("dm_conversations", (d) => {
  state.conversations = Array.isArray(d) ? d : [];
  for (const c of state.conversations)
    state.unread[keyName(c.username)] = c.unread || 0;
  if (state.view === "dms") renderNavigation();
});
socket.on("dm_conversations_changed", () =>
  socket.emit("get_dm_conversations"),
);
socket.on("dm_history", (d) => {
  if (state.view === "dms" && keyName(d.username) === keyName(state.peer)) {
    state.peer = d.username;
    state.messages = d.messages || [];
    renderMessages();
    if (state.messages.length)
      socket.emit("mark_dm_read", {
        username: state.peer,
        messageId: state.messages.at(-1).id,
      });
  }
});
for (const event of ["dm_sent", "dm_received"])
  socket.on(event, (m) => {
    const peer =
      keyName(m.from) === keyName(state.me?.username) ? m.to : m.from;
    if (state.view === "dms" && keyName(state.peer) === keyName(peer)) {
      appendMessage(m);
      socket.emit("mark_dm_read", { username: peer, messageId: m.id });
    } else if (keyName(m.from) !== keyName(state.me?.username)) {
      state.unread[keyName(peer)] = (state.unread[keyName(peer)] || 0) + 1;
      if (state.view === "dms") renderNavigation();
    }
  });
socket.on("dm_typing", (d) => {
  if (state.view === "dms" && keyName(d.from) === keyName(state.peer)) {
    $("typing").textContent = d.isTyping ? `${d.from} écrit…` : "";
    clearTimeout(state.remoteTypingTimer);
    state.remoteTypingTimer = setTimeout(
      () => ($("typing").textContent = ""),
      4000,
    );
  }
});
socket.on("channel_typing_update", (d) => {
  if (state.view === "channels") {
    $("typing").textContent = (d[state.channel] || [])
      .map((u) => (typeof u === "string" ? u : u.username))
      .filter((u) => u !== state.me?.username)
      .join(", ");
    if ($("typing").textContent) $("typing").textContent += " écrit…";
  }
});
socket.on("user_profile", (p) => {
  renderProfile(p);
  if (keyName(p.username) === keyName(state.me?.username) && $("profile-bio"))
    $("profile-bio").value = p.bio || "";
});
socket.on("friends_list", (d) => {
  state.friends = d;
  if (state.view === "dms") renderNavigation();
  if (state.view === "dms" && !state.peer) renderDMHome();
});
for (const event of [
  "error",
  "dm_error",
  "friend_error",
  "account_settings_error",
  "plus_error",
  "custom_emoji_error",
  "access_denied",
  "muted",
])
  socket.on(event, (d) => toast(d?.message || "Action impossible."));
socket.on("automod_blocked", (d) => toast(d.reason || "Message refusé."));
socket.on("slow_mode_active", (d) =>
  toast(`Patiente encore ${d.remainingTime} seconde(s).`),
);
socket.on("kicked", (d) => showAuth(d.message));
socket.on("account_settings_saved", (d) => {
  if (d.token) {
    state.token = d.token;
    sessionStorage.setItem("docspace.token", d.token);
  }
  Object.assign(state.me, d);
  $("password-form")?.reset();
  toast("Mot de passe mis à jour.");
});
socket.on("bio_updated", () => toast("Profil enregistré."));
socket.on("friend_request_sent", () => toast("Demande d’amitié envoyée."));
socket.on("plus_status", (d) => {
  Object.assign(state.me, d);
  if ($("settings-dialog").open) renderSettings("plus");
  toast(d.activated ? "DocSpace Plus est activé !" : "Statut Plus actualisé.");
});
socket.on("custom_emojis", (d) => {
  state.emojis = Array.isArray(d) ? d : d.emojis || [];
});
socket.on("custom_emojis_list", (d) => {
  state.emojis = Array.isArray(d) ? d : d.emojis || [];
  if (
    $("settings-dialog").open &&
    document.querySelector('[data-tab="plus"].active')
  )
    renderSettings("plus");
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button,[data-channel],[data-voice-room]");
  if (!b) return;
  if (b.dataset.view) navigate(b.dataset.view);
  if (b.hasAttribute("data-settings")) showSettings();
  if (b.dataset.tab) renderSettings(b.dataset.tab);
  if (b.hasAttribute("data-close-dialog")) b.closest("dialog").close();
  if (b.dataset.channel) navigate("channels", null, b.dataset.channel);
  if (b.dataset.peer && keyName(b.dataset.peer) !== keyName(state.me?.username))
    navigate("dms", b.dataset.peer);
  if (b.hasAttribute("data-home-dms")) navigate("dms");
  if (b.hasAttribute("data-find-person") || b.id === "find-person") {
    $("person-dialog").showModal();
    $("person-name").focus();
  }
  if (b.dataset.addFriend)
    socket.emit("send_friend_request", { username: b.dataset.addFriend });
  if (b.dataset.acceptFriend)
    socket.emit("accept_friend", { username: b.dataset.acceptFriend });
  if (b.dataset.rejectFriend)
    socket.emit("reject_friend", { username: b.dataset.rejectFriend });
  if (b.dataset.deleteEmoji)
    socket.emit("delete_custom_emoji", { id: b.dataset.deleteEmoji });
  if (b.hasAttribute("data-back-channel")) navigate("channels");
  if (b.dataset.gameOpen) {
    window.openDocSpaceGames?.();
    window.openDocSpaceStage?.(b.dataset.gameOpen);
  }
  if (b.hasAttribute("data-godot-open")) openGodot();
  if (b.id === "remove-attachment") {
    state.attachment = null;
    renderAttachment();
  }
  if (b.dataset.reply) {
    const m = state.messages.find((m) => String(m.id) === b.dataset.reply);
    state.reply = {
      id: m.id,
      username: m.from || m.username,
      content: m.content,
    };
    $("reply-preview").hidden = false;
    $("reply-preview").innerHTML =
      `Répondre à ${esc(state.reply.username)}<button id="cancel-reply" aria-label="Annuler la réponse">×</button>`;
    $("message-input").focus();
  }
  if (b.id === "cancel-reply") {
    state.reply = null;
    $("reply-preview").hidden = true;
  }
  if (b.dataset.edit) {
    const m = state.messages.find((m) => String(m.id) === b.dataset.edit);
    const content = prompt("Modifier ton message", decodeLegacy(m.content));
    if (content?.trim())
      socket.emit("edit_message", { messageId: m.id, newContent: content });
  }
  if (b.dataset.delete && confirm("Supprimer ce message ?"))
    socket.emit("delete_message", { messageId: b.dataset.delete });
  if (b.id === "logout") {
    socket.emit("logout_account", { token: state.token });
    $("settings-dialog").close();
    showAuth();
    socket.disconnect();
    socket.connect();
  }
  if (b.dataset.insertEmoji) {
    if (state.reactionTarget !== null) {
      socket.emit("reaction", {
        messageId: state.reactionTarget,
        emoji: b.dataset.insertEmoji,
        action: "add",
      });
      state.reactionTarget = null;
      $("emoji-dialog").close();
      return;
    }
    const input = $("message-input");
    input.setRangeText(
      b.dataset.insertEmoji,
      input.selectionStart,
      input.selectionEnd,
      "end",
    );
    $("emoji-dialog").close();
    input.focus();
    resizeComposer();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.pref) {
    preferences[e.target.dataset.pref] = e.target.checked;
    savePreferences();
    if (e.target.dataset.pref === "quietEvents") renderMessages();
  }
  if (e.target.id === "theme") {
    preferences.theme = e.target.value;
    savePreferences();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "file-search")
    document
      .querySelectorAll("[data-filename]")
      .forEach(
        (row) =>
          (row.hidden = !row.dataset.filename.includes(
            keyName(e.target.value),
          )),
      );
});
document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (form.id === "auth-form") {
    e.preventDefault();
    if (!socket.connected)
      return authError(
        "Connexion au serveur en cours. Réessaie dans un instant.",
      );
    const password = $("login-password").value;
    if (
      state.register &&
      (password.length < 8 || password !== $("confirm-password").value)
    )
      return authError(
        "Les mots de passe doivent être identiques et contenir au moins 8 caractères.",
      );
    $("auth-submit").disabled = true;
    $("auth-error").textContent = "";
    socket.emit(state.register ? "register_account" : "login_account", {
      username: $("login-name").value.trim(),
      password,
    });
    authTimer = setTimeout(
      () => authError("Le serveur met trop de temps à répondre. Réessaie."),
      15000,
    );
  }
  if (form.id === "person-form") {
    e.preventDefault();
    const name = $("person-name").value.trim();
    if (!/^[a-zA-Z0-9_.-]{2,20}$/.test(name))
      return toast("Entre un pseudo valide.");
    $("person-dialog").close();
    navigate("dms", name);
  }
  if (form.id === "composer") {
    e.preventDefault();
    if (!state.ready) return toast("Attends la reconnexion avant d’envoyer.");
    if (state.uploading)
      return toast("Le fichier est encore en cours d’envoi.");
    const input = $("message-input"),
      content = input.value.trim();
    if (!content && !state.attachment) return;
    const payload = {
      content,
      attachment: state.attachment,
      replyTo: state.reply,
    };
    const sentDraft = input.value;
    const targetKey = draftKey();
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    const event = state.view === "dms" ? "send_dm" : "send_message";
    Object.assign(
      payload,
      state.view === "dms" ? { to: state.peer } : { channel: state.channel },
    );
    socket.timeout(10000).emit(event, payload, (error, result) => {
      submit.disabled = false;
      if (error || !result?.success)
        return toast(
          result?.message || "Envoi non confirmé. Ton brouillon est conservé.",
        );
      if (draftKey() === targetKey && input.value === sentDraft) {
        input.value = "";
        state.attachment = null;
        state.reply = null;
        renderAttachment();
        $("reply-preview").hidden = true;
        resizeComposer();
      }
      state.drafts[targetKey] = "";
      stopTyping();
    });
  }
  if (form.id === "profile-form") {
    e.preventDefault();
    try {
      if ($("avatar-file").files[0]) {
        const r = await upload($("avatar-file").files[0], true);
        socket.emit("update_profile", { avatar: r.path || r.avatar });
      }
      socket.emit("update_bio", { bio: $("profile-bio").value });
      socket.emit("update_status", { status: $("profile-status").value });
      $("self-status").textContent =
        $("profile-status").selectedOptions[0].text;
    } catch (err) {
      toast(err.message);
    }
  }
  if (form.id === "password-form") {
    e.preventDefault();
    if (form.next.value !== form.confirm.value)
      return toast("Les nouveaux mots de passe ne correspondent pas.");
    socket.emit("change_account_password", {
      currentPassword: form.current.value,
      newPassword: form.next.value,
    });
  }
  if (form.id === "plus-form") {
    e.preventDefault();
    socket.emit("redeem_plus_code", { code: form.code.value.trim() });
  }
  if (form.id === "emoji-form") {
    e.preventDefault();
    const file = form.image.files[0];
    if (file.size > 524288)
      return toast("Choisis une image de moins de 512 Ko.");
    const reader = new FileReader();
    reader.onload = () =>
      socket.emit("create_custom_emoji", {
        name: form.elements.name.value,
        dataUrl: reader.result,
      });
    reader.readAsDataURL(file);
  }
  if (form.id === "youtube-form") {
    e.preventDefault();
    let id;
    try {
      const u = new URL(form.video.value);
      if (u.hostname === "youtu.be") id = u.pathname.slice(1);
      else if (
        ["www.youtube.com", "youtube.com", "m.youtube.com"].includes(u.hostname)
      )
        id = u.searchParams.get("v") || u.pathname.split("/")[2];
    } catch {}
    if (!/^[\w-]{11}$/.test(id || ""))
      return toast("Ce lien YouTube n’est pas valide.");
    $("youtube-player").innerHTML =
      `<iframe title="Lecteur YouTube" src="https://www.youtube-nocookie.com/embed/${id}" allow="fullscreen; autoplay; encrypted-media" style="border:0;width:100%;aspect-ratio:16/9;margin-top:20px" allowfullscreen></iframe><p class="section-note">Ce lecteur dépend de l’accès à YouTube sur ton réseau.</p>`;
  }
});
$("auth-toggle").onclick = () => {
  state.register = !state.register;
  $("auth-title").textContent = state.register
    ? "Ton espace t’attend."
    : "Content de te revoir.";
  $("auth-subtitle").textContent = state.register
    ? "Choisis un pseudo et un mot de passe."
    : "Retrouve ton espace et tes conversations.";
  $("auth-submit").textContent = state.register
    ? "Créer mon compte"
    : "Se connecter";
  $("auth-toggle").textContent = state.register
    ? "Se connecter"
    : "Créer un compte";
  $("auth-switch-text").textContent = state.register
    ? "Déjà parmi nous ?"
    : "Tu nous rejoins ?";
  $("confirm-wrap").hidden = !state.register;
  $("confirm-password").required = state.register;
  $("login-password").autocomplete = state.register
    ? "new-password"
    : "current-password";
  $("auth-error").textContent = "";
};
$("show-password").onclick = () => {
  const i = $("login-password");
  i.type = i.type === "password" ? "text" : "password";
  $("show-password").setAttribute(
    "aria-label",
    i.type === "password"
      ? "Afficher le mot de passe"
      : "Masquer le mot de passe",
  );
};
$("menu-toggle").onclick = () =>
  setDrawer(!$("sidebar").classList.contains("open"));
$("drawer-shade").onclick = () => setDrawer(false);
$("members-toggle").onclick = () => $("members").classList.toggle("open");
$("new-messages").onclick = () => {
  $("message-list").scrollTop = $("message-list").scrollHeight;
  $("new-messages").hidden = true;
};
$("message-input").addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    !e.shiftKey &&
    !e.isComposing &&
    matchMedia("(min-width:761px)").matches
  ) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});
$("message-input").addEventListener("input", () => {
  resizeComposer();
  rememberDraft();
  if (!state.ready) return;
  if (!state.typingTimer)
    socket.emit(
      state.peer ? "dm_typing_start" : "typing_start",
      state.peer ? { to: state.peer } : { channel: state.channel },
    );
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(() => {
    stopTyping();
    state.typingTimer = 0;
  }, 2000);
});
$("file-input").onchange = async () => {
  const file = $("file-input").files[0];
  if (!file) return;
  state.uploading = true;
  toast("Envoi du fichier…");
  try {
    state.attachment = await upload(file);
    renderAttachment();
    toast("Fichier prêt. Tu peux envoyer ton message.");
  } catch (e) {
    toast(e.message);
  } finally {
    state.uploading = false;
    $("file-input").value = "";
  }
};
$("emoji-button").onclick = () => {
  state.reactionTarget = null;
  $("emoji-grid").innerHTML =
    [
      "😀",
      "😂",
      "🥰",
      "😎",
      "🥲",
      "🤔",
      "😴",
      "👋",
      "🙌",
      "👍",
      "❤️",
      "🔥",
      "✨",
      "🎉",
      "🎮",
      "💡",
      "📎",
      "✅",
      "☕",
      "🌙",
      "👀",
    ]
      .map(
        (e) =>
          `<button data-insert-emoji="${e}" aria-label="${e}">${e}</button>`,
      )
      .join("") +
    state.emojis
      .map(
        (e) =>
          `<button data-insert-emoji=":${esc(e.name)}:" title=":${esc(e.name)}:"><img class="custom-emoji" src="${esc(safePath(e.url || e.path))}" alt="${esc(e.name)}"></button>`,
      )
      .join("");
  $("emoji-dialog").showModal();
};
async function openGodot() {
  $("page").innerHTML = "<p>Chargement du jardin 3D…</p>";
  try {
    const r = await fetch("/games/orbit-garden/index.html", { method: "HEAD" });
    if (!r.ok) throw Error();
    $("page").innerHTML =
      '<div class="page-heading"><h2>Orbit Garden</h2><button data-view="arcade">Quitter le jeu</button></div><iframe id="godot-frame" title="Orbit Garden — jeu Godot 3D" src="/games/orbit-garden/index.html" allow="fullscreen; gamepad" allowfullscreen style="width:100%;height:min(70dvh,680px);border:1px solid var(--border);border-radius:12px"></iframe>';
  } catch {
    $("page").innerHTML =
      '<div class="empty"><span class="empty-symbol">◇</span><h2>Le jardin est en préparation.</h2><p>L’export web de ce jeu n’est pas installé sur ce serveur. Les trois autres jeux restent disponibles.</p><button class="primary" data-view="arcade">Retour aux jeux</button></div>';
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopTyping();
});
if (!sessionStorage.getItem("docspace.device"))
  sessionStorage.setItem("docspace.device", crypto.randomUUID());
// Retirer les anciens mots de passe de l’interface historique, sans toucher au compte.
for (const key of [
  "docspace_password",
  "docspace_saved_password",
  "docspace_credentials",
]) {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}
mountIcons();
applyPreferences();
socket.connect();
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
