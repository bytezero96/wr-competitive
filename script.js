
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* FIREBASE */
const firebaseConfig = {
  apiKey: "AIzaSyBJrLkfW9aAVJnrcB7hvYFbsJURBGJQU8M",
  authDomain: "duelosrankeadoswr.firebaseapp.com",
  projectId: "duelosrankeadoswr",
  storageBucket: "duelosrankeadoswr.firebasestorage.app",
  messagingSenderId: "453903935694",
  appId: "1:903903935694:web:d0334556ca801b84acc89f",
  measurementId: "G-6ZZ14JXLYB"
};

const ADMIN_UID = "U7ohORMjr1O9Ubby2WFMztAe8Au2";
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const playersCollection = collection(db, "players");

const POINTS_PER_WIN = 20;
const POINTS_PER_LOSS = 15;

let data = { players: [], stats: {} };
let isAdmin = false;
let initialized = false;
let toastTimeout = null;
let unsubscribePlayers = null;

const $ = selector => document.querySelector(selector);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function normalizeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function generatePlayerId() {
  return crypto?.randomUUID
    ? crypto.randomUUID()
    : `player_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getPlayer(id) {
  return data.players.find(player => player.id === id);
}

function showToast(message, duration = 3200) {
  const toast = $("#toast");

  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function requireAdmin() {
  if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID || !isAdmin) {
    showToast("Você não tem permissão para realizar essa ação.");
    return false;
  }

  return true;
}

/* RANKING */

function getPlayerStats() {
  const stats = {};

  data.players.forEach(player => {
    const wins = normalizeNumber(player.wins);
    const losses = normalizeNumber(player.losses);
    const manualPoints = normalizeNumber(player.manualPoints);
    const totalMatches = wins + losses;

    stats[player.id] = {
      wins,
      losses,
      manualPoints,
      points: wins * POINTS_PER_WIN - losses * POINTS_PER_LOSS + manualPoints,
      totalMatches,
      accuracy: totalMatches ? wins / totalMatches * 100 : 0
    };
  });

  return stats;
}

function sortPlayers() {
  return [...data.players].sort((a, b) => {
    const A = data.stats[a.id];
    const B = data.stats[b.id];

    return B.points - A.points ||
      B.wins - A.wins ||
      A.losses - B.losses ||
      a.name.localeCompare(b.name, "pt-BR");
  });
}

function renderRanking() {
  const body = $("#rankingBody");
  if (!body) return;

  const sorted = sortPlayers();

  body.innerHTML = sorted.map((player, i) => {
    const s = data.stats[player.id];

    return `
      <tr>
        <td>
          <span class="ranking-position position-${i + 1}">${i + 1}</span>
        </td>
        <td>
          <div class="player-cell">
            <strong>${escapeHTML(player.name)}</strong>
          </div>
        </td>
        <td><strong class="points-value">${s.points}</strong></td>
        <td>
          <span class="wins-value">${s.wins}</span> /
          <span class="losses-value">${s.losses}</span>
        </td>
        <td>${s.accuracy.toFixed(1)}%</td>
      </tr>
    `;
  }).join("");

  const matches = Object.values(data.stats)
    .reduce((sum, s) => sum + s.totalMatches, 0);

  if ($("#totalPlayers")) {
    $("#totalPlayers").textContent = data.players.length;
  }

  if ($("#totalMatches")) {
    $("#totalMatches").textContent = matches;
  }

  if ($("#rankingCount")) {
    $("#rankingCount").textContent =
      `${data.players.length} jogador${data.players.length === 1 ? "" : "es"}`;
  }

  if ($("#emptyRanking")) {
    $("#emptyRanking").classList.toggle("hidden", sorted.length > 0);
  }

  if (sorted.length) {
    $("#leaderName").textContent = sorted[0].name;
    $("#leaderPoints").textContent = `${data.stats[sorted[0].id].points} pontos`;
  } else {
    $("#leaderName").textContent = "—";
    $("#leaderPoints").textContent = "0 pontos";
  }
}

function renderAdminHistory() {
  const host = $("#adminHistory");
  if (!host) return;

  const sorted = sortPlayers();

  if (!sorted.length) {
    host.innerHTML =
      '<div class="empty-state">Nenhum jogador cadastrado para gerenciar.</div>';
    return;
  }

  host.innerHTML = sorted.map(player => {
    const s = data.stats[player.id];
    const id = escapeHTML(player.id);

    return `
      <div class="individual-player-row" data-player-id="${id}">
        <div class="individual-player-info">
          <h4>${escapeHTML(player.name)}</h4>

          <div class="individual-player-rank">
            <strong>${s.points} pontos</strong>
          </div>

          <div class="individual-player-stats">
            <span>Vitórias: <strong>${s.wins}</strong></span>
            <span>Derrotas: <strong>${s.losses}</strong></span>
            <span>Aproveitamento: <strong>${s.accuracy.toFixed(1)}%</strong></span>
            <span>Pontos manuais: <strong>${s.manualPoints}</strong></span>
          </div>
        </div>

        <div class="individual-player-actions">
          <button type="button" class="primary-btn"
            data-action="win" data-player-id="${id}">+ Vitória</button>

          <button type="button" class="secondary-btn"
            data-action="loss" data-player-id="${id}">− Derrota</button>

          <button type="button" class="edit-player-btn"
            data-action="edit-name" data-player-id="${id}">Alterar nome</button>

          <button type="button" class="remove-player-btn"
            data-action="remove-player" data-player-id="${id}">Remover jogador</button>
        </div>

        <form class="manual-points-form" data-player-id="${id}">
          <label for="manual-points-${id}">Adicionar ou retirar pontos</label>
          <div class="manual-points-controls">
            <input id="manual-points-${id}" name="manualPoints"
              type="number" step="1" required placeholder="Ex.: 50 ou -20">
            <button class="primary-btn" type="submit">Aplicar</button>
          </div>
        </form>
      </div>
    `;
  }).join("");
}

function renderAll() {
  data.stats = getPlayerStats();
  renderRanking();
  renderAdminHistory();
}

/* ADMINISTRAÇÃO DE JOGADORES */

async function addPlayer(event) {
  event.preventDefault();
  if (!requireAdmin()) return;

  const input = $("#playerName");
  const name = input?.value.trim();

  if (!name) return showToast("Digite o nome do jogador.");
  if (name.length > 24) {
    return showToast("O nome pode ter no máximo 24 caracteres.");
  }

  if (data.players.some(p =>
    p.name.trim().toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR")
  )) {
    return showToast("Já existe um jogador com esse nome.");
  }

  try {
    await setDoc(doc(db, "players", generatePlayerId()), {
      name,
      wins: 0,
      losses: 0,
      manualPoints: 0
    });

    input.value = "";
    showToast(`Jogador ${name} cadastrado com sucesso.`);
  } catch (error) {
    console.error(error);
    showToast("Não foi possível cadastrar o jogador.");
  }
}

async function renamePlayer(id) {
  if (!requireAdmin()) return;

  const player = getPlayer(id);
  if (!player) return showToast("Jogador não encontrado.");

  const value = prompt("Digite o novo nome do jogador:", player.name);
  if (value === null) return;

  const name = value.trim();

  if (!name) return showToast("O nome do jogador não pode ficar vazio.");
  if (name.length > 24) {
    return showToast("O nome pode ter no máximo 24 caracteres.");
  }

  if (data.players.some(p =>
    p.id !== id &&
    p.name.trim().toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR")
  )) {
    return showToast("Já existe outro jogador com esse nome.");
  }

  try {
    await updateDoc(doc(db, "players", id), { name });
    showToast("Nome do jogador alterado com sucesso.");
  } catch (error) {
    console.error(error);
    showToast("Não foi possível alterar o nome.");
  }
}

async function removePlayer(id) {
  if (!requireAdmin()) return;

  const player = getPlayer(id);
  if (!player) return showToast("Jogador não encontrado.");

  if (!confirm(`Tem certeza que deseja remover "${player.name}"? Esta ação não pode ser desfeita.`)) {
    return;
  }

  try {
    await deleteDoc(doc(db, "players", id));
    showToast(`Jogador ${player.name} removido.`);
  } catch (error) {
    console.error(error);
    showToast("Não foi possível remover o jogador. Verifique as permissões do Firebase.");
  }
}

async function registerResult(id, result) {
  if (!requireAdmin()) return;

  const player = getPlayer(id);
  if (!player) return showToast("Jogador não encontrado.");
  if (!["win", "loss"].includes(result)) return;

  try {
    await updateDoc(doc(db, "players", id), {
      [result === "win" ? "wins" : "losses"]: increment(1)
    });

    showToast(
      result === "win"
        ? `Vitória registrada para ${player.name}: +${POINTS_PER_WIN} pontos.`
        : `Derrota registrada para ${player.name}: -${POINTS_PER_LOSS} pontos.`
    );
  } catch (error) {
    console.error(error);
    showToast("Não foi possível registrar o resultado.");
  }
}

async function addManualPoints(id, amount) {
  if (!requireAdmin()) return;

  const player = getPlayer(id);
  if (!player) return showToast("Jogador não encontrado.");

  const points = Number(amount);

  if (!Number.isSafeInteger(points) || points === 0) {
    return showToast("Informe um número inteiro diferente de zero.");
  }

  try {
    await runTransaction(db, async transaction => {
      const ref = doc(db, "players", id);
      const snapshot = await transaction.get(ref);

      if (!snapshot.exists()) throw new Error("PLAYER_NOT_FOUND");

      transaction.update(ref, {
        manualPoints: normalizeNumber(snapshot.data().manualPoints) + points
      });
    });

    showToast(
      `${points > 0 ? "Adicionados" : "Retirados"} ${Math.abs(points)} pontos ` +
      `${points > 0 ? "a" : "de"} ${player.name}.`
    );
  } catch (error) {
    console.error(error);
    showToast("Não foi possível atualizar os pontos.");
  }
}

/* LOGIN ADMINISTRATIVO */

function createAdminLogin() {
  if ($("#adminLoginOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "adminLoginOverlay";
  overlay.className = "login-overlay";

  overlay.innerHTML = `
    <div class="login-modal" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
      <button type="button" class="login-close" id="closeLoginBtn" aria-label="Fechar">×</button>
      <span class="eyebrow">ÁREA RESTRITA</span>
      <h2 id="loginTitle">Login administrativo</h2>
      <p class="form-hint">Entre com as credenciais do administrador.</p>

      <form id="adminLoginForm">
        <label for="adminEmail">E-mail</label>
        <input id="adminEmail" name="email" type="email"
          autocomplete="username" placeholder="Seu e-mail" required>

        <label for="adminPassword">Senha</label>
        <input id="adminPassword" name="password" type="password"
          autocomplete="current-password" placeholder="Sua senha" required>

        <button class="primary-btn" id="loginSubmitBtn" type="submit">Entrar</button>
      </form>

      <p id="loginError" class="login-error" aria-live="polite"></p>
    </div>
  `;

  document.body.appendChild(overlay);

  $("#closeLoginBtn").addEventListener("click", () => overlay.remove());

  overlay.addEventListener("click", event => {
    if (event.target === overlay) overlay.remove();
  });

  $("#adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault();

    const email = $("#adminEmail").value.trim();
    const password = $("#adminPassword").value;
    const button = $("#loginSubmitBtn");
    const errorMessage = $("#loginError");

    button.disabled = true;
    button.textContent = "Entrando...";
    errorMessage.textContent = "";

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);

      if (credential.user.uid !== ADMIN_UID) {
        await signOut(auth);
        errorMessage.textContent = "Esta conta não tem permissão de administrador.";
        return;
      }

      overlay.remove();
      showToast("Login administrativo realizado com sucesso.");
    } catch (error) {
      console.error(error);
      errorMessage.textContent = "Não foi possível entrar. Confira o e-mail e a senha.";
    } finally {
      if (document.body.contains(button)) {
        button.disabled = false;
        button.textContent = "Entrar";
      }
    }
  });
}

function toggleAdmin() {
  if (isAdmin && auth.currentUser?.uid === ADMIN_UID) {
    $("#adminPanel")?.classList.toggle("hidden");
  } else {
    createAdminLogin();
  }
}

async function closeAdmin() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    showToast("Não foi possível encerrar a sessão.");
  }
}

function startPlayersListener() {
  unsubscribePlayers?.();

  unsubscribePlayers = onSnapshot(
    playersCollection,
    snapshot => {
      data.players = snapshot.docs.map(documentSnapshot => {
        const player = documentSnapshot.data();

        return {
          id: documentSnapshot.id,
          name: String(player.name ?? "Sem nome"),
          wins: normalizeNumber(player.wins),
          losses: normalizeNumber(player.losses),
          manualPoints: normalizeNumber(player.manualPoints)
        };
      });

      renderAll();
    },
    error => {
      console.error(error);
      showToast("Erro ao sincronizar os jogadores com o Firebase.");
    }
  );
}

function listenToAuthentication() {
  onAuthStateChanged(auth, async user => {
    if (user && user.uid === ADMIN_UID) {
      isAdmin = true;

      if ($("#adminBtn")) $("#adminBtn").textContent = "Painel ADM";
      $("#logoutBtn")?.classList.remove("hidden");
      $("#adminPanel")?.classList.remove("hidden");
      return;
    }

    isAdmin = false;

    if ($("#adminBtn")) $("#adminBtn").textContent = "Login";
    $("#adminPanel")?.classList.add("hidden");
    $("#logoutBtn")?.classList.add("hidden");

    if (user && user.uid !== ADMIN_UID) {
      try {
        await signOut(auth);
      } catch (error) {
        console.error(error);
      }
    }
  });
}

function handleAdminClick(event) {
  const button = event.target.closest("button[data-action][data-player-id]");
  if (!button) return;

  const { playerId, action } = button.dataset;

  if (action === "win" || action === "loss") {
    registerResult(playerId, action);
  } else if (action === "edit-name") {
    renamePlayer(playerId);
  } else if (action === "remove-player") {
    removePlayer(playerId);
  }
}

function handleManualPoints(event) {
  const form = event.target.closest(".manual-points-form");
  if (!form) return;

  event.preventDefault();

  const input = form.querySelector('[name="manualPoints"]');
  addManualPoints(form.dataset.playerId, Number(input.value));
}

/* =========================================================
   ROLETA DE CAMPEÕES — WILD RIFT
========================================================= */

const CHAMPION_DATA_URL =
  "https://ry2x.github.io/WildRift-Merged-Champion-Data/data_pt_BR.json";

/* Versão alternativa para quando a API de versões estiver indisponível. */
const FALLBACK_DDRAGON_VERSION = "15.20.1";

const ROLE_LABELS = {
  tank: "Tank",
  fighter: "Lutador",
  mage: "Mago",
  assassin: "Assassino",
  marksman: "Atirador",
  support: "Suporte"
};

const ROLE_ALIASES = {
  tank: ["tank", "tanque"],
  fighter: ["fighter", "lutador", "figther"],
  mage: ["mage", "mago", "magician"],
  assassin: ["assassin", "assassino"],
  marksman: ["marksman", "atirador", "adc"],
  support: ["support", "suporte"]
};

/* Alguns nomes do catálogo diferem dos IDs do Data Dragon. */
const CHAMPION_ID_FIXES = {
  "wukong": "MonkeyKing",
  "nunu & willump": "Nunu",
  "dr. mundo": "DrMundo",
  "jarvan iv": "JarvanIV",
  "kai'sa": "Kaisa",
  "kha'zix": "Khazix",
  "kog'maw": "KogMaw",
  "rek'sai": "RekSai",
  "vel'koz": "Velkoz",
  "cho'gath": "Chogath",
  "leblanc": "Leblanc",
  "bel'veth": "Belveth",
  "renata glasc": "Renata",
  "ksante": "KSante"
};

let championList = [];
let selectedRoles = new Set();
let usedChampionIds = new Set();
let currentChampionId = null;
let rouletteBusy = false;
let spinTimer = null;
let dataDragonVersion = FALLBACK_DDRAGON_VERSION;

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getDataDragonChampionId(champion) {
  const normalizedName = normalized(champion.name);
  const fixedId = CHAMPION_ID_FIXES[normalizedName];

  if (fixedId) return fixedId;

  /*
   * Para os demais campeões, usa o ID textual fornecido pelo catálogo.
   * Não use champion.key aqui: esse campo pode ser numérico.
   */
  return String(champion.id || champion.name || "").trim();
}

function createChampionImageUrl(champion, version = dataDragonVersion) {
  const championId = getDataDragonChampionId(champion);

  if (!championId || !version) return "";

  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${encodeURIComponent(championId)}.png`;
}

function championRoles(champion) {
  const raw = Array.isArray(champion.roles)
    ? champion.roles
    : Array.isArray(champion.tags)
      ? champion.tags
      : [];

  const values = raw.map(normalized);
  const roles = [];

  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.some(alias => values.includes(alias))) {
      roles.push(role);
    }
  }

  const fields = {
    tank: ["is_tank", "isTank"],
    fighter: ["is_fighter", "isFighter"],
    mage: ["is_mage", "isMage"],
    assassin: ["is_assassin", "isAssassin"],
    marksman: ["is_marksman", "isMarksman"],
    support: ["is_support", "isSupport"]
  };

  for (const [role, fieldNames] of Object.entries(fields)) {
    const enabled = fieldNames.some(field =>
      champion[field] === true ||
      champion[field] === 1 ||
      champion[field] === "true"
    );

    if (enabled && !roles.includes(role)) {
      roles.push(role);
    }
  }

  return roles;
}

function normalizeChampionData(payload) {
  const source = payload?.data ?? payload?.champions ?? payload;
  const entries = Array.isArray(source)
    ? source
    : Object.values(source ?? {});

  return entries
    .filter(champion =>
      champion &&
      typeof champion === "object" &&
      champion.name &&
      (champion.id || champion.key || champion.hero_id) &&
      (
        champion.is_wr === undefined ||
        champion.is_wr === true ||
        champion.is_wr === 1 ||
        champion.is_wr === "true"
      )
    )
    .map(champion => ({
      id: String(champion.id ?? champion.key ?? champion.hero_id),
      key: String(champion.key ?? champion.id ?? champion.hero_id),
      name: String(champion.name),
      roles: championRoles(champion),
      image: champion.image ?? champion.avatar ?? ""
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/* Gera uma URL de imagem para cada campeão. */
function prepareChampionImages() {
  championList = championList.map(champion => ({
    ...champion,
    image: champion.image || createChampionImageUrl(champion)
  }));
}

async function loadChampionCatalog() {
  const button = $("#spinRoulette");
  const status = $("#rouletteStatus");
  const catalog = $("#championCatalog");

  if (button) {
    button.disabled = true;
    button.textContent = "Carregando campeões...";
  }

  if (status) {
    status.textContent = "Carregando catálogo de campeões...";
  }

  if (catalog) {
    catalog.innerHTML =
      '<p class="form-hint">Carregando catálogo de campeões...</p>';
  }

  try {
    const response = await fetch(CHAMPION_DATA_URL, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(`Catálogo respondeu HTTP ${response.status}`);
    }

    const payload = await response.json();
    championList = normalizeChampionData(payload);

    if (!championList.length) {
      throw new Error("A API não retornou campeões de Wild Rift válidos.");
    }

    /*
     * A versão alternativa já está definida acima.
     * Se a consulta falhar, a roleta ainda terá URLs para tentar carregar.
     */
    try {
      const versionResponse = await fetch(
        "https://ddragon.leagueoflegends.com/api/versions.json",
        { cache: "no-cache" }
      );

      if (versionResponse.ok) {
        const versions = await versionResponse.json();

        if (Array.isArray(versions) && versions[0]) {
          dataDragonVersion = String(versions[0]);
        }
      }
    } catch (error) {
      console.warn(
        "Usando versão alternativa do Data Dragon:",
        dataDragonVersion,
        error
      );
    }

    prepareChampionImages();

    if (button) {
      button.disabled = false;
      button.textContent = "Girar roleta";
    }

    if (status) {
      status.textContent =
        `Catálogo carregado: ${championList.length} campeões encontrados.`;
    }

    renderChampionCatalog();
  } catch (error) {
    console.error("Erro ao carregar catálogo de Wild Rift:", error);

    if (status) {
      status.textContent =
        "Não foi possível carregar os campeões. Confira a conexão e recarregue a página.";
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Catálogo indisponível";
    }

    if ($("#championCount")) {
      $("#championCount").textContent = "Erro ao carregar";
    }

    if (catalog) {
      catalog.innerHTML =
        '<p class="form-hint">O serviço de dados está indisponível. Tente recarregar a página mais tarde.</p>';
    }
  }
}

function getFilteredChampions() {
  const query = normalized($("#championSearch")?.value ?? "");

  return championList.filter(champion =>
    normalized(champion.name).includes(query) &&
    (
      selectedRoles.size === 0 ||
      [...selectedRoles].some(role => champion.roles.includes(role))
    )
  );
}

function updateChampionCounts() {
  const all = $("#championCount");
  const filtered = $("#filteredChampionCount");
  const catalog = $("#catalogCount");

  const available = getFilteredChampions().filter(champion =>
    !$("#avoidRepeat")?.checked ||
    !usedChampionIds.has(champion.id)
  );

  if (all) all.textContent = `${championList.length} campeões`;
  if (filtered) filtered.textContent = available.length;

  if (catalog) {
    catalog.textContent = `${getFilteredChampions().length} campeões`;
  }
}

function renderChampionCatalog() {
  const catalog = $("#championCatalog");
  if (!catalog) return;

  const filtered = getFilteredChampions();

  if (!filtered.length) {
    catalog.innerHTML =
      '<p class="form-hint">Nenhum campeão encontrado com esses filtros.</p>';
    updateChampionCounts();
    return;
  }

  catalog.innerHTML = filtered.map(champion => {
    const used = usedChampionIds.has(champion.id);
    const selected = currentChampionId === champion.id;

    const roles = champion.roles.length
      ? champion.roles.map(role => ROLE_LABELS[role]).join(" · ")
      : "Classe não identificada";

    const image = champion.image
      ? `
        <img
          src="${escapeHTML(champion.image)}"
          alt="${escapeHTML(champion.name)}"
          loading="lazy"
          decoding="async"
          onerror="this.onerror=null;this.style.display='none';"
        >
      `
      : "";

    return `
      <article class="champion-card ${used ? "used" : ""} ${selected ? "selected" : ""}">
        ${image}
        <strong>${escapeHTML(champion.name)}</strong>
        <span>${escapeHTML(roles)}</span>
        ${used ? "<span>Sorteado</span>" : ""}
      </article>
    `;
  }).join("");

  updateChampionCounts();
}

function displayChampion(champion) {
  currentChampionId = champion.id;

  $("#roulettePlaceholder")?.classList.add("hidden");
  $("#championResult")?.classList.remove("hidden");

  const image = $("#championImage");

  if (image) {
    image.onerror = () => {
      image.onerror = null;
      image.style.visibility = "hidden";
      console.error("Não foi possível carregar a imagem:", image.src);
    };

    image.alt = champion.name;
    image.style.visibility = "visible";
    image.src = champion.image || "";
  }

  if ($("#championName")) {
    $("#championName").textContent = champion.name;
  }

  if ($("#championRoles")) {
    $("#championRoles").textContent = champion.roles.length
      ? champion.roles.map(role => ROLE_LABELS[role]).join(" · ")
      : "Classe não identificada";
  }

  renderChampionCatalog();
}

function spinChampionRoulette() {
  if (rouletteBusy) return;

  const avoid = $("#avoidRepeat")?.checked ?? false;

  const available = getFilteredChampions().filter(champion =>
    !avoid || !usedChampionIds.has(champion.id)
  );

  if (!available.length) {
    $("#rouletteStatus").textContent =
      "Não há campeões disponíveis. Altere os filtros ou reinicie os sorteios.";
    return;
  }

  rouletteBusy = true;

  const button = $("#spinRoulette");

  if (button) {
    button.disabled = true;
    button.textContent = "Girando...";
  }

  $("#rouletteStatus").textContent = "Sorteando campeão...";
  $("#roulettePlaceholder")?.classList.add("hidden");
  $("#championResult")?.classList.remove("hidden");

  const start = performance.now();
  const duration = 2400;

  function tick(now) {
    if (!rouletteBusy) return;

    const progress = Math.min((now - start) / duration, 1);
    const delay = 45 + Math.floor(progress * 180);

    const preview = available[
      Math.floor(Math.random() * available.length)
    ];

    if ($("#championName")) {
      $("#championName").textContent = preview.name;
    }

    if ($("#championRoles")) {
      $("#championRoles").textContent = preview.roles.length
        ? preview.roles.map(role => ROLE_LABELS[role]).join(" · ")
        : "Classe não identificada";
    }

    const image = $("#championImage");

    if (image) {
      image.onerror = () => {
        image.onerror = null;
        image.style.visibility = "hidden";
      };

      image.alt = preview.name;
      image.style.visibility = "visible";
      image.src = preview.image || "";
    }

    if (progress >= 1) {
      const winner = available[
        Math.floor(Math.random() * available.length)
      ];

      displayChampion(winner);

      if (avoid) {
        usedChampionIds.add(winner.id);
      }

      rouletteBusy = false;

      if (button) {
        button.disabled = false;
        button.textContent = "Girar novamente";
      }

      $("#rouletteStatus").textContent =
        `Campeão sorteado: ${winner.name}.`;

      renderChampionCatalog();
      return;
    }

    spinTimer = setTimeout(() => requestAnimationFrame(tick), delay);
  }

  requestAnimationFrame(tick);
}

function resetChampionRoulette() {
  if (rouletteBusy) {
    showToast("Aguarde o fim do sorteio para reiniciar.");
    return;
  }

  clearTimeout(spinTimer);

  usedChampionIds.clear();
  currentChampionId = null;

  $("#championResult")?.classList.add("hidden");
  $("#roulettePlaceholder")?.classList.remove("hidden");

  const image = $("#championImage");

  if (image) {
    image.removeAttribute("src");
    image.alt = "Ícone do campeão sorteado";
    image.style.visibility = "hidden";
  }

  if ($("#championName")) $("#championName").textContent = "";
  if ($("#championRoles")) $("#championRoles").textContent = "";

  if ($("#rouletteStatus")) {
    $("#rouletteStatus").textContent = "Sorteios reiniciados.";
  }

  renderChampionCatalog();
}

function initializeChampionRoulette() {
  if (!$("#championRoulette")) return;

  $("#championSearch")?.addEventListener("input", renderChampionCatalog);
  $("#avoidRepeat")?.addEventListener("change", renderChampionCatalog);

  $("#roleFilters")?.addEventListener("click", event => {
    const button = event.target.closest("[data-role]");

    if (!button || rouletteBusy) return;

    const role = button.dataset.role;

    if (role === "all") {
      selectedRoles.clear();
    } else if (selectedRoles.has(role)) {
      selectedRoles.delete(role);
    } else {
      selectedRoles.add(role);
    }

    document.querySelectorAll("#roleFilters [data-role]").forEach(item => {
      const active = item.dataset.role === "all"
        ? selectedRoles.size === 0
        : selectedRoles.has(item.dataset.role);

      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });

    renderChampionCatalog();
  });

  $("#spinRoulette")?.addEventListener("click", spinChampionRoulette);
  $("#resetRoulette")?.addEventListener("click", resetChampionRoulette);

  loadChampionCatalog();
}

/* INICIALIZAÇÃO */

function initialize() {
  if (initialized) return;
  initialized = true;

  $("#playerForm")?.addEventListener("submit", addPlayer);
  $("#adminBtn")?.addEventListener("click", toggleAdmin);
  $("#logoutBtn")?.addEventListener("click", closeAdmin);

  $("#adminHistory")?.addEventListener("click", handleAdminClick);
  $("#adminHistory")?.addEventListener("submit", handleManualPoints);

  initializeChampionRoulette();
  startPlayersListener();
  listenToAuthentication();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
