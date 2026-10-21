
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
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* =====================================================
   FIREBASE
===================================================== */

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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const playersCollection = collection(db, "players");

/* =====================================================
   CONFIGURAÇÕES
===================================================== */

const POINTS_PER_WIN = 20;
const POINTS_PER_LOSS = 15;
const MAX_PLAYER_NAME_LENGTH = 24;

const CHAMPION_DATA_URL =
  "https://ry2x.github.io/WildRift-Merged-Champion-Data/data_pt_BR.json";

const DDRAGON_VERSIONS_URL =
  "https://ddragon.leagueoflegends.com/api/versions.json";

const FALLBACK_DDRAGON_VERSION = "15.20.1";

const ROLE_NAMES = {
  all: "Todas",
  fighter: "Lutador",
  tank: "Tanque",
  mage: "Mago",
  assassin: "Assassino",
  marksman: "Atirador",
  support: "Suporte"
};

/* =====================================================
   ESTADO
===================================================== */

let players = [];
let currentUser = null;
let isAdmin = false;
let unsubscribePlayers = null;
let unsubscribeAuth = null;

let championList = [];
let filteredChampions = [];
let selectedRoles = new Set(["all"]);
let lastChampionId = null;
let isSpinning = false;
let ddragonVersion = FALLBACK_DDRAGON_VERSION;

let adminHistory = [];

let toastTimeout = null;

/* =====================================================
   ELEMENTOS HTML
===================================================== */

const $ = (id) => document.getElementById(id);

const elements = {
  adminBtn: $("adminBtn"),
  totalPlayers: $("totalPlayers"),
  totalMatches: $("totalMatches"),
  leaderName: $("leaderName"),
  leaderPoints: $("leaderPoints"),

  championRoulette: $("championRoulette"),
  championCount: $("championCount"),
  roleFilters: $("roleFilters"),
  roulettePlaceholder: $("roulettePlaceholder"),
  championResult: $("championResult"),
  championImage: $("championImage"),
  championName: $("championName"),
  championRoles: $("championRoles"),
  filteredChampionCount: $("filteredChampionCount"),
  avoidRepeat: $("avoidRepeat"),
  spinRoulette: $("spinRoulette"),
  resetRoulette: $("resetRoulette"),
  rouletteStatus: $("rouletteStatus"),
  catalogCount: $("catalogCount"),
  championCatalog: $("championCatalog"),

  rankingCount: $("rankingCount"),
  rankingBody: $("rankingBody"),
  emptyRanking: $("emptyRanking"),

  adminPanel: $("adminPanel"),
  logoutBtn: $("logoutBtn"),
  playerForm: $("playerForm"),
  playerName: $("playerName"),
  adminHistory: $("adminHistory"),
  toast: $("toast")
};

/* =====================================================
   FUNÇÕES UTILITÁRIAS
===================================================== */

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}

function normalizeText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function getPlayerPoints(player) {
  return (
    normalizeNumber(player.wins) * POINTS_PER_WIN -
    normalizeNumber(player.losses) * POINTS_PER_LOSS +
    normalizeNumber(player.manualPoints)
  );
}

function getRank(points) {
  if (points >= 1500) {
    return { name: "Mithril", symbol: "✧", className: "mithril" };
  }

  if (points >= 1200) {
    return { name: "Latão", symbol: "✦", className: "latao" };
  }

  if (points >= 900) {
    return { name: "Plástico", symbol: "⬡", className: "plastico" };
  }

  if (points >= 600) {
    return { name: "Ferrugem", symbol: "◆", className: "ferrugem" };
  }

  if (points >= 300) {
    return { name: "Madeira", symbol: "♜", className: "madeira" };
  }

  return { name: "Papel", symbol: "◇", className: "papel" };
}

function getDivision(points) {
  if (points >= 1500) return "";

  const division = Math.floor(Math.max(0, points) / 100) % 3;

  if (division === 0) return "III";
  if (division === 1) return "II";
  return "I";
}

function getSortedPlayers() {
  return [...players].sort((a, b) => {
    const pointsDifference = getPlayerPoints(b) - getPlayerPoints(a);

    if (pointsDifference !== 0) return pointsDifference;

    const winsDifference =
      normalizeNumber(b.wins) - normalizeNumber(a.wins);

    if (winsDifference !== 0) return winsDifference;

    const lossesDifference =
      normalizeNumber(a.losses) - normalizeNumber(b.losses);

    if (lossesDifference !== 0) return lossesDifference;

    return String(a.name).localeCompare(String(b.name), "pt-BR");
  });
}

function showToast(message, type = "success") {
  if (!elements.toast) {
    console.log(message);
    return;
  }

  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`;

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 3000);
}

function recordHistory(message) {
  adminHistory.unshift({
    message,
    date: new Date()
  });

  adminHistory = adminHistory.slice(0, 30);

  renderAdminHistory();
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function requireAdmin() {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    showToast("Ação permitida somente ao administrador.", "error");
    return false;
  }

  return true;
}

/* =====================================================
   AUTENTICAÇÃO ADMINISTRATIVA
===================================================== */

function createAdminLogin() {
  if ($("adminLoginOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "adminLoginOverlay";
  overlay.className = "modal-overlay";

  overlay.innerHTML = `
    <div class="modal-content">
      <button
        type="button"
        class="modal-close"
        id="closeAdminLogin"
        aria-label="Fechar"
      >×</button>

      <h2>Login administrativo</h2>
      <p>Acesse sua conta de administrador.</p>

      <form id="adminLoginForm">
        <label for="adminEmail">E-mail</label>
        <input
          id="adminEmail"
          type="email"
          autocomplete="username"
          required
          placeholder="Seu e-mail"
        >

        <label for="adminPassword">Senha</label>
        <input
          id="adminPassword"
          type="password"
          autocomplete="current-password"
          required
          placeholder="Sua senha"
        >

        <p id="adminLoginError" role="alert"></p>

        <button type="submit" id="adminLoginSubmit">
          Entrar
        </button>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  $("closeAdminLogin").addEventListener("click", closeAdmin);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeAdmin();
  });

  $("adminLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = $("adminEmail").value.trim();
    const password = $("adminPassword").value;
    const errorElement = $("adminLoginError");
    const submitButton = $("adminLoginSubmit");

    errorElement.textContent = "";
    submitButton.disabled = true;
    submitButton.textContent = "Entrando...";

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (credential.user.uid !== ADMIN_UID) {
        await signOut(auth);
        throw new Error("Esta conta não possui permissão administrativa.");
      }

      closeAdmin();
      showToast("Login administrativo realizado.");
    } catch (error) {
      console.error("Erro no login:", error);

      const messages = {
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/invalid-email": "O e-mail informado é inválido.",
        "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
        "auth/network-request-failed": "Falha de conexão. Verifique sua internet."
      };

      errorElement.textContent =
        error.message === "Esta conta não possui permissão administrativa."
          ? error.message
          : messages[error.code] || "Não foi possível realizar o login.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Entrar";
    }
  });
}

function toggleAdmin() {
  if (isAdmin) {
    if (elements.adminPanel) {
      elements.adminPanel.hidden = !elements.adminPanel.hidden;
      elements.adminPanel.classList.toggle(
        "active",
        !elements.adminPanel.hidden
      );
    }

    return;
  }

  createAdminLogin();

  const overlay = $("adminLoginOverlay");

  if (overlay) {
    overlay.hidden = false;
    overlay.classList.add("active");
  }
}

function closeAdmin() {
  const overlay = $("adminLoginOverlay");

  if (overlay) {
    overlay.classList.remove("active");
    overlay.hidden = true;
  }
}

async function handleLogout() {
  try {
    await signOut(auth);

    if (elements.adminPanel) {
      elements.adminPanel.hidden = true;
      elements.adminPanel.classList.remove("active");
    }

    showToast("Você saiu da área administrativa.");
  } catch (error) {
    console.error("Erro ao sair:", error);
    showToast("Não foi possível encerrar a sessão.", "error");
  }
}

function listenToAuthentication() {
  if (unsubscribeAuth) unsubscribeAuth();

  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    currentUser = user;
    isAdmin = Boolean(user && user.uid === ADMIN_UID);

    if (elements.adminBtn) {
      elements.adminBtn.textContent = isAdmin
        ? "Painel administrativo"
        : "Login";
    }

    if (elements.adminPanel) {
      elements.adminPanel.hidden = !isAdmin;
      elements.adminPanel.classList.toggle("active", isAdmin);
    }

    if (elements.logoutBtn) {
      elements.logoutBtn.hidden = !isAdmin;
    }

    if (isAdmin) {
      closeAdmin();
    } else {
      closeAdmin();
    }

    renderRanking();
  });
}

/* =====================================================
   FIRESTORE — LISTENER DO RANKING
===================================================== */

function startPlayersListener() {
  if (unsubscribePlayers) unsubscribePlayers();

  unsubscribePlayers = onSnapshot(
    playersCollection,
    (snapshot) => {
      players = snapshot.docs.map((document) => {
        const data = document.data();

        return {
          id: document.id,
          name: normalizeText(data.name),
          wins: normalizeNumber(data.wins),
          losses: normalizeNumber(data.losses),
          manualPoints: normalizeNumber(data.manualPoints)
        };
      });

      renderRanking();
      updateDashboard();
    },
    (error) => {
      console.error("Erro ao carregar jogadores:", error);

      showToast(
        "Erro ao carregar o ranking. Confira as regras do Firestore.",
        "error"
      );
    }
  );
}

/* =====================================================
   RANKING
===================================================== */

function renderRanking() {
  if (!elements.rankingBody) return;

  const sortedPlayers = getSortedPlayers();

  elements.rankingBody.innerHTML = "";

  if (elements.rankingCount) {
    elements.rankingCount.textContent = String(sortedPlayers.length);
  }

  if (elements.emptyRanking) {
    elements.emptyRanking.hidden = sortedPlayers.length > 0;
  }

  sortedPlayers.forEach((player, index) => {
    const points = getPlayerPoints(player);
    const rank = getRank(points);
    const division = getDivision(points);

    const row = document.createElement("tr");

    row.innerHTML = `
      <td class="ranking-position">${index + 1}</td>

      <td class="ranking-player">
        <strong>${escapeHTML(player.name)}</strong>
      </td>

      <td>
        <span class="rank-badge rank-${rank.className}">
          ${rank.symbol} ${rank.name}
          ${division ? `<span>${division}</span>` : ""}
        </span>
      </td>

      <td class="ranking-wins">${player.wins}</td>
      <td class="ranking-losses">${player.losses}</td>

      <td class="ranking-points">
        <strong>${points}</strong>
      </td>

      ${
        isAdmin
          ? `
            <td class="admin-actions">
              <button
                type="button"
                data-action="win"
                data-id="${escapeHTML(player.id)}"
                title="Adicionar vitória"
              >+ Vitória</button>

              <button
                type="button"
                data-action="loss"
                data-id="${escapeHTML(player.id)}"
                title="Registrar derrota"
              >− Derrota</button>

              <button
                type="button"
                data-action="points"
                data-id="${escapeHTML(player.id)}"
                title="Adicionar ou retirar pontos"
              >± Pontos</button>

              <button
                type="button"
                data-action="rename"
                data-id="${escapeHTML(player.id)}"
                title="Editar nome"
              >Editar</button>

              <button
                type="button"
                data-action="remove"
                data-id="${escapeHTML(player.id)}"
                title="Excluir jogador"
              >Excluir</button>
            </td>
          `
          : ""
      }
    `;

    elements.rankingBody.appendChild(row);
  });
}

function updateDashboard() {
  const sortedPlayers = getSortedPlayers();

  if (elements.totalPlayers) {
    elements.totalPlayers.textContent = String(players.length);
  }

  const totalMatches = players.reduce((total, player) => {
    return total + normalizeNumber(player.wins);
  }, 0);

  if (elements.totalMatches) {
    elements.totalMatches.textContent = String(totalMatches);
  }

  if (elements.leaderName) {
    elements.leaderName.textContent = sortedPlayers[0]?.name || "—";
  }

  if (elements.leaderPoints) {
    elements.leaderPoints.textContent = sortedPlayers.length
      ? String(getPlayerPoints(sortedPlayers[0]))
      : "0";
  }
}

/* =====================================================
   CADASTRO DE JOGADORES
===================================================== */

async function addPlayer(event) {
  if (event) event.preventDefault();

  if (!requireAdmin()) return;

  if (!elements.playerName) return;

  const name = normalizeText(elements.playerName.value);

  if (!name) {
    showToast("Informe o nome do jogador.", "error");
    return;
  }

  if (name.length > MAX_PLAYER_NAME_LENGTH) {
    showToast(
      `O nome deve ter no máximo ${MAX_PLAYER_NAME_LENGTH} caracteres.`,
      "error"
    );
    return;
  }

  const duplicate = players.some(
    (player) => player.name.toLocaleLowerCase("pt-BR") ===
      name.toLocaleLowerCase("pt-BR")
  );

  if (duplicate) {
    showToast("Já existe um jogador com esse nome.", "error");
    return;
  }

  try {
    await addDoc(playersCollection, {
      name,
      wins: 0,
      losses: 0,
      manualPoints: 0,
      createdAt: serverTimestamp()
    });

    elements.playerName.value = "";

    recordHistory(`Jogador cadastrado: ${name}`);
    showToast(`${name} foi adicionado ao ranking.`);
  } catch (error) {
    console.error("Erro ao cadastrar jogador:", error);
    showToast("Não foi possível cadastrar. Confira o Firestore.", "error");
  }
}

/* =====================================================
   VITÓRIAS E DERROTAS
===================================================== */

async function registerResult(playerId, result) {
  if (!requireAdmin()) return;

  const player = players.find((item) => item.id === playerId);

  if (!player) {
    showToast("Jogador não encontrado.", "error");
    return;
  }

  if (result !== "win" && result !== "loss") return;

  const field = result === "win" ? "wins" : "losses";

  try {
    await updateDoc(doc(db, "players", playerId), {
      [field]: normalizeNumber(player[field]) + 1
    });

    const label = result === "win" ? "Vitória" : "Derrota";

    recordHistory(`${label} registrada para ${player.name}`);
    showToast(`${label} registrada para ${player.name}.`);
  } catch (error) {
    console.error("Erro ao registrar resultado:", error);
    showToast("Não foi possível registrar o resultado.", "error");
  }
}

/* =====================================================
   PONTOS MANUAIS
===================================================== */

async function addManualPoints(playerId) {
  if (!requireAdmin()) return;

  const player = players.find((item) => item.id === playerId);

  if (!player) {
    showToast("Jogador não encontrado.", "error");
    return;
  }

  const input = prompt(
    `Pontos manuais para ${player.name}.\n` +
    "Use um número positivo ou negativo.\nEx.: 50 ou -20"
  );

  if (input === null) return;

  const normalizedInput = input.trim().replace(",", ".");
  const points = Number(normalizedInput);

  if (
    normalizedInput === "" ||
    !Number.isFinite(points) ||
    !Number.isInteger(points)
  ) {
    showToast("Informe um número inteiro válido.", "error");
    return;
  }

  try {
    const newManualPoints =
      normalizeNumber(player.manualPoints) + points;

    await updateDoc(doc(db, "players", playerId), {
      manualPoints: newManualPoints
    });

    const operation = points >= 0 ? "adicionados" : "retirados";

    recordHistory(
      `${Math.abs(points)} pontos ${operation} de ${player.name}`
    );

    showToast("Pontuação manual atualizada.");
  } catch (error) {
    console.error("Erro ao alterar pontos:", error);
    showToast("Não foi possível alterar os pontos.", "error");
  }
}

/* =====================================================
   EDITAR JOGADOR
===================================================== */

async function renamePlayer(playerId) {
  if (!requireAdmin()) return;

  const player = players.find((item) => item.id === playerId);

  if (!player) {
    showToast("Jogador não encontrado.", "error");
    return;
  }

  const input = prompt("Novo nome do jogador:", player.name);

  if (input === null) return;

  const newName = normalizeText(input);

  if (!newName) {
    showToast("O nome não pode ficar vazio.", "error");
    return;
  }

  if (newName.length > MAX_PLAYER_NAME_LENGTH) {
    showToast(
      `O nome deve ter no máximo ${MAX_PLAYER_NAME_LENGTH} caracteres.`,
      "error"
    );
    return;
  }

  const duplicate = players.some(
    (item) =>
      item.id !== playerId &&
      item.name.toLocaleLowerCase("pt-BR") ===
        newName.toLocaleLowerCase("pt-BR")
  );

  if (duplicate) {
    showToast("Já existe outro jogador com esse nome.", "error");
    return;
  }

  try {
    await updateDoc(doc(db, "players", playerId), {
      name: newName
    });

    recordHistory(`Nome alterado: ${player.name} → ${newName}`);
    showToast("Nome atualizado.");
  } catch (error) {
    console.error("Erro ao editar jogador:", error);
    showToast("Não foi possível editar o jogador.", "error");
  }
}

/* =====================================================
   EXCLUIR JOGADOR
===================================================== */

async function removePlayer(playerId) {
  if (!requireAdmin()) return;

  const player = players.find((item) => item.id === playerId);

  if (!player) {
    showToast("Jogador não encontrado.", "error");
    return;
  }

  const confirmed = confirm(
    `Deseja realmente excluir ${player.name} do ranking?`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "players", playerId));

    recordHistory(`Jogador excluído: ${player.name}`);
    showToast(`${player.name} foi excluído.`);
  } catch (error) {
    console.error("Erro ao excluir jogador:", error);
    showToast("Não foi possível excluir o jogador.", "error");
  }
}

/* =====================================================
   HISTÓRICO ADMINISTRATIVO
===================================================== */

function renderAdminHistory() {
  if (!elements.adminHistory) return;

  if (!adminHistory.length) {
    elements.adminHistory.innerHTML =
      "<p>Nenhuma atividade nesta sessão.</p>";
    return;
  }

  elements.adminHistory.innerHTML = adminHistory
    .map((item) => `
      <div class="history-item">
        <span>${escapeHTML(item.message)}</span>
        <small>${escapeHTML(formatDate(item.date))}</small>
      </div>
    `)
    .join("");
}

/* =====================================================
   CAMPEÕES — IMAGENS
===================================================== */

function createChampionImageUrl(champion) {
  if (champion.image) return champion.image;

  const id = champion.key || champion.id;

  if (!id) return "";

  return (
    `https://ddragon.leagueoflegends.com/cdn/` +
    `${ddragonVersion}/img/champion/${encodeURIComponent(id)}.png`
  );
}

async function loadDdragonVersion() {
  try {
    const response = await fetch(DDRAGON_VERSIONS_URL);

    if (!response.ok) throw new Error("Não foi possível obter a versão.");

    const versions = await response.json();

    if (Array.isArray(versions) && versions.length) {
      ddragonVersion = versions[0];
    }
  } catch (error) {
    console.warn("Usando versão alternativa do Data Dragon:", error);
  }
}

/* =====================================================
   CAMPEÕES — NORMALIZAÇÃO DOS DADOS
===================================================== */

function normalizeChampionRoles(rawRoles, champion) {
  let roles = [];

  if (Array.isArray(rawRoles)) {
    roles = rawRoles;
  } else if (typeof rawRoles === "string") {
    roles = rawRoles.split(/[,/|]/);
  }

  if (!roles.length && Array.isArray(champion.tags)) {
    roles = champion.tags;
  }

  const roleMap = {
    fighter: "fighter",
    bruiser: "fighter",
    lutador: "fighter",
    tank: "tank",
    tanque: "tank",
    mage: "mage",
    mago: "mage",
    assassin: "assassin",
    assassino: "assassin",
    assassina: "assassin",
    marksman: "marksman",
    atirador: "marksman",
    support: "support",
    suporte: "support",
    utility: "support"
  };

  return [...new Set(
    roles
      .map((role) => String(role).trim().toLowerCase())
      .map((role) => roleMap[role] || null)
      .filter(Boolean)
  )];
}

function normalizeChampion(raw, fallbackKey = "") {
  if (!raw || typeof raw !== "object") return null;

  const name =
    raw.name ||
    raw.nome ||
    raw.title ||
    raw.displayName;

  const key =
    raw.key ||
    raw.id ||
    raw.championId ||
    raw.hero_id ||
    raw.slug ||
    fallbackKey;

  if (!name || !key) return null;

  const rawImage =
    raw.image?.full ||
    raw.image?.url ||
    raw.imageUrl ||
    raw.image_url ||
    raw.icon ||
    raw.portrait ||
    raw.splashArt ||
    "";

  return {
    id: String(raw.id || key),
    key: String(key),
    name: String(name),
    roles: normalizeChampionRoles(
      raw.roles || raw.role || raw.tags || raw.classes,
      raw
    ),
    image: typeof rawImage === "string" ? rawImage : ""
  };
}

function extractChampionData(payload) {
  let source =
    payload?.data ||
    payload?.champions ||
    payload?.heroes ||
    payload;

  if (Array.isArray(source)) {
    return source
      .map((champion) => normalizeChampion(champion))
      .filter(Boolean);
  }

  if (source && typeof source === "object") {
    return Object.entries(source)
      .map(([key, champion]) => normalizeChampion(champion, key))
      .filter(Boolean);
  }

  return [];
}

async function loadChampions() {
  if (elements.championCatalog) {
    elements.championCatalog.innerHTML = "<p>Carregando campeões...</p>";
  }

  try {
    const response = await fetch(CHAMPION_DATA_URL, {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}`);
    }

    const payload = await response.json();

    championList = extractChampionData(payload);

    // Remove duplicatas por identificador.
    const uniqueChampions = new Map();

    championList.forEach((champion) => {
      uniqueChampions.set(champion.key, champion);
    });

    championList = [...uniqueChampions.values()];

    if (!championList.length) {
      throw new Error("A fonte não retornou campeões reconhecidos.");
    }

    await loadDdragonVersion();

    filteredChampions = [...championList];

    renderRoleFilters();
    applyChampionFilters();
    renderChampionCatalog();

    if (elements.championCount) {
      elements.championCount.textContent = String(championList.length);
    }
  } catch (error) {
    console.error("Erro ao carregar campeões:", error);

    if (elements.championCatalog) {
      elements.championCatalog.innerHTML = `
        <p>Não foi possível carregar o catálogo de campeões.</p>
        <button type="button" id="retryChampionLoad">
          Tentar novamente
        </button>
      `;

      $("retryChampionLoad")?.addEventListener("click", loadChampions);
    }

    if (elements.rouletteStatus) {
      elements.rouletteStatus.textContent =
        "Falha ao carregar os campeões.";
    }
  }
}

/* =====================================================
   FILTROS POR FUNÇÃO
===================================================== */

function renderRoleFilters() {
  if (!elements.roleFilters) return;

  elements.roleFilters.innerHTML = Object.entries(ROLE_NAMES)
    .map(([role, label]) => `
      <button
        type="button"
        class="role-filter ${selectedRoles.has(role) ? "active" : ""}"
        data-role="${role}"
        aria-pressed="${selectedRoles.has(role)}"
      >${label}</button>
    `)
    .join("");

  elements.roleFilters.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => {
      const role = button.dataset.role;

      if (role === "all") {
        selectedRoles = new Set(["all"]);
      } else {
        selectedRoles.delete("all");

        if (selectedRoles.has(role)) {
          selectedRoles.delete(role);
        } else {
          selectedRoles.add(role);
        }

        if (!selectedRoles.size) {
          selectedRoles = new Set(["all"]);
        }
      }

      renderRoleFilters();
      applyChampionFilters();
      renderChampionCatalog();
    });
  });
}

function applyChampionFilters() {
  if (selectedRoles.has("all")) {
    filteredChampions = [...championList];
  } else {
    filteredChampions = championList.filter((champion) =>
      champion.roles.some((role) => selectedRoles.has(role))
    );
  }

  if (elements.filteredChampionCount) {
    elements.filteredChampionCount.textContent =
      String(filteredChampions.length);
  }

  if (elements.rouletteStatus && !isSpinning) {
    elements.rouletteStatus.textContent =
      `${filteredChampions.length} campeões disponíveis.`;
  }
}

/* =====================================================
   CATÁLOGO DE CAMPEÕES
===================================================== */

function renderChampionCatalog() {
  if (!elements.championCatalog) return;

  if (elements.catalogCount) {
    elements.catalogCount.textContent = String(filteredChampions.length);
  }

  if (!filteredChampions.length) {
    elements.championCatalog.innerHTML =
      "<p>Nenhum campeão encontrado para esse filtro.</p>";
    return;
  }

  elements.championCatalog.innerHTML = filteredChampions
    .map((champion) => {
      const image = createChampionImageUrl(champion);

      const roles = champion.roles
        .map((role) => ROLE_NAMES[role] || role)
        .join(", ");

      return `
        <article class="champion-card">
          <img
            src="${escapeHTML(image)}"
            alt="${escapeHTML(champion.name)}"
            loading="lazy"
            onerror="this.style.visibility='hidden'"
          >

          <div class="champion-card-info">
            <h3>${escapeHTML(champion.name)}</h3>
            <p>${escapeHTML(roles || "Função não informada")}</p>
          </div>
        </article>
      `;
    })
    .join("");
}

/* =====================================================
   ROLETA DE CAMPEÕES
===================================================== */

function displayChampion(champion) {
  if (!champion) return;

  if (elements.roulettePlaceholder) {
    elements.roulettePlaceholder.hidden = true;
  }

  if (elements.championResult) {
    elements.championResult.hidden = false;
    elements.championResult.classList.add("active");
  }

  if (elements.championName) {
    elements.championName.textContent = champion.name;
  }

  if (elements.championRoles) {
    elements.championRoles.textContent = champion.roles
      .map((role) => ROLE_NAMES[role] || role)
      .join(" • ") || "Função não informada";
  }

  if (elements.championImage) {
    elements.championImage.style.visibility = "visible";
    elements.championImage.alt = champion.name;
    elements.championImage.src = createChampionImageUrl(champion);

    elements.championImage.onerror = () => {
      elements.championImage.style.visibility = "hidden";
    };
  }
}

function spinChampionRoulette() {
  if (isSpinning) return;

  if (!filteredChampions.length) {
    showToast("Nenhum campeão disponível para sortear.", "error");
    return;
  }

  let pool = [...filteredChampions];

  if (elements.avoidRepeat?.checked && lastChampionId !== null) {
    const withoutPrevious = pool.filter(
      (champion) => champion.key !== lastChampionId
    );

    if (withoutPrevious.length) {
      pool = withoutPrevious;
    }
  }

  const selectedChampion = pool[
    Math.floor(Math.random() * pool.length)
  ];

  isSpinning = true;

  if (elements.spinRoulette) {
    elements.spinRoulette.disabled = true;
    elements.spinRoulette.textContent = "Sorteando...";
  }

  if (elements.rouletteStatus) {
    elements.rouletteStatus.textContent = "A roleta está girando...";
  }

  if (elements.championRoulette) {
    elements.championRoulette.classList.add("spinning");
  }

  // Animação visual curta, sem depender de bibliotecas externas.
  const animationDuration = 1000;
  const startTime = Date.now();

  const animate = () => {
    const elapsed = Date.now() - startTime;

    if (elapsed < animationDuration) {
      const preview = pool[Math.floor(Math.random() * pool.length)];
      displayChampion(preview);
      requestAnimationFrame(animate);
      return;
    }

    displayChampion(selectedChampion);
    lastChampionId = selectedChampion.key;

    isSpinning = false;

    if (elements.spinRoulette) {
      elements.spinRoulette.disabled = false;
      elements.spinRoulette.textContent = "Sortear campeão";
    }

    if (elements.championRoulette) {
      elements.championRoulette.classList.remove("spinning");
    }

    if (elements.rouletteStatus) {
      elements.rouletteStatus.textContent =
        `Campeão sorteado: ${selectedChampion.name}`;
    }
  };

  requestAnimationFrame(animate);
}

function resetChampionRoulette() {
  if (isSpinning) return;

  lastChampionId = null;

  if (elements.championResult) {
    elements.championResult.hidden = true;
    elements.championResult.classList.remove("active");
  }

  if (elements.roulettePlaceholder) {
    elements.roulettePlaceholder.hidden = false;
  }

  if (elements.championName) {
    elements.championName.textContent = "";
  }

  if (elements.championRoles) {
    elements.championRoles.textContent = "";
  }

  if (elements.championImage) {
    elements.championImage.removeAttribute("src");
    elements.championImage.alt = "";
    elements.championImage.style.visibility = "visible";
  }

  if (elements.rouletteStatus) {
    elements.rouletteStatus.textContent =
      "A roleta foi reiniciada.";
  }
}

function initializeChampionRoulette() {
  elements.spinRoulette?.addEventListener(
    "click",
    spinChampionRoulette
  );

  elements.resetRoulette?.addEventListener(
    "click",
    resetChampionRoulette
  );

  loadChampions();
}

/* =====================================================
   EVENTOS DO RANKING
===================================================== */

function initializeRankingEvents() {
  elements.adminBtn?.addEventListener("click", toggleAdmin);
  elements.logoutBtn?.addEventListener("click", handleLogout);

  elements.playerForm?.addEventListener("submit", addPlayer);

  elements.rankingBody?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const playerId = button.dataset.id;
    const action = button.dataset.action;

    if (!playerId) return;

    switch (action) {
      case "win":
        registerResult(playerId, "win");
        break;

      case "loss":
        registerResult(playerId, "loss");
        break;

      case "points":
        addManualPoints(playerId);
        break;

      case "rename":
        renamePlayer(playerId);
        break;

      case "remove":
        removePlayer(playerId);
        break;
    }
  });
}

/* =====================================================
   INICIALIZAÇÃO
===================================================== */

function initialize() {
  initializeRankingEvents();
  initializeChampionRoulette();
  listenToAuthentication();
  startPlayersListener();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
