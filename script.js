
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

/* =========================================================
   FIREBASE
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyBJrLkfW9aAVJnrcB7hvYFbsJURBGjQU8M",
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

/* =========================================================
   CONFIGURAÇÕES DO RANKING
========================================================= */

const POINTS_PER_WIN = 20;
const POINTS_PER_LOSS = 15;

/* =========================================================
   ESTADO
========================================================= */

let data = {
  players: [],
  stats: {}
};

let isAdmin = false;
let initialized = false;
let toastTimeout = null;
let unsubscribePlayers = null;

/* =========================================================
   UTILITÁRIOS
========================================================= */

const $ = (selector) => document.querySelector(selector);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[char];
  });
}

function normalizeNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.floor(number);
}

function generatePlayerId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return (
    "player_" +
    Date.now() +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

function getPlayer(playerId) {
  return data.players.find((player) => player.id === playerId);
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
  if (
    !auth.currentUser ||
    auth.currentUser.uid !== ADMIN_UID ||
    !isAdmin
  ) {
    showToast("Você não tem permissão para realizar essa ação.");
    return false;
  }

  return true;
}

/* =========================================================
   CÁLCULO DE PONTOS E ESTATÍSTICAS
========================================================= */

function getPlayerStats() {
  const stats = {};

  data.players.forEach((player) => {
    const wins = normalizeNumber(player.wins);
    const losses = normalizeNumber(player.losses);
    const manualPoints = normalizeNumber(player.manualPoints);

    const points =
      wins * POINTS_PER_WIN -
      losses * POINTS_PER_LOSS +
      manualPoints;

    const totalMatches = wins + losses;

    const accuracy =
      totalMatches > 0
        ? (wins / totalMatches) * 100
        : 0;

    stats[player.id] = {
      wins,
      losses,
      manualPoints,
      points,
      totalMatches,
      accuracy
    };
  });

  return stats;
}

/* =========================================================
   RENDERIZAÇÃO DO RANKING PRINCIPAL
   Sem coluna ou emblema de elo
========================================================= */

function renderRanking() {
  const rankingBody = $("#rankingBody");

  if (!rankingBody) {
    return;
  }

  const sortedPlayers = [...data.players].sort((a, b) => {
    const statsA = data.stats[a.id];
    const statsB = data.stats[b.id];

    if (statsB.points !== statsA.points) {
      return statsB.points - statsA.points;
    }

    if (statsB.wins !== statsA.wins) {
      return statsB.wins - statsA.wins;
    }

    if (statsA.losses !== statsB.losses) {
      return statsA.losses - statsB.losses;
    }

    return a.name.localeCompare(b.name, "pt-BR");
  });

  rankingBody.innerHTML = sortedPlayers
    .map((player, index) => {
      const stats = data.stats[player.id];

      return `
        <tr>
          <td>
            <span class="ranking-position position-${index + 1}">
              ${index + 1}
            </span>
          </td>

          <td>
            <div class="player-cell">
              <strong>${escapeHTML(player.name)}</strong>
            </div>
          </td>

          <td>
            <strong class="points-value">
              ${stats.points}
            </strong>
          </td>

          <td>
            <span class="wins-value">${stats.wins}</span>
            /
            <span class="losses-value">${stats.losses}</span>
          </td>

          <td>
            ${stats.accuracy.toFixed(1)}%
          </td>
        </tr>
      `;
    })
    .join("");

  const totalPlayers = $("#totalPlayers");
  const totalMatches = $("#totalMatches");
  const leaderName = $("#leaderName");
  const leaderPoints = $("#leaderPoints");
  const rankingCount = $("#rankingCount");
  const emptyRanking = $("#emptyRanking");

  const matchCount = Object.values(data.stats).reduce(
    (total, stats) => total + stats.totalMatches,
    0
  );

  if (totalPlayers) {
    totalPlayers.textContent = data.players.length;
  }

  if (totalMatches) {
    totalMatches.textContent = matchCount;
  }

  if (rankingCount) {
    rankingCount.textContent =
      `${data.players.length} jogador` +
      (data.players.length === 1 ? "" : "es");
  }

  if (sortedPlayers.length > 0) {
    const leader = sortedPlayers[0];
    const leaderStats = data.stats[leader.id];

    if (leaderName) {
      leaderName.textContent = leader.name;
    }

    if (leaderPoints) {
      leaderPoints.textContent = `${leaderStats.points} pontos`;
    }
  } else {
    if (leaderName) {
      leaderName.textContent = "—";
    }

    if (leaderPoints) {
      leaderPoints.textContent = "0 pontos";
    }
  }

  if (emptyRanking) {
    emptyRanking.classList.toggle(
      "hidden",
      sortedPlayers.length > 0
    );
  }
}

/* =========================================================
   PAINEL ADMINISTRATIVO
   Sem exibição de elo
========================================================= */

function renderAdminHistory() {
  const adminHistory = $("#adminHistory");

  if (!adminHistory) {
    return;
  }

  if (data.players.length === 0) {
    adminHistory.innerHTML = `
      <div class="empty-state">
        Nenhum jogador cadastrado para gerenciar.
      </div>
    `;
    return;
  }

  const sortedPlayers = [...data.players].sort((a, b) => {
    const statsA = data.stats[a.id];
    const statsB = data.stats[b.id];

    if (statsB.points !== statsA.points) {
      return statsB.points - statsA.points;
    }

    return a.name.localeCompare(b.name, "pt-BR");
  });

  adminHistory.innerHTML = sortedPlayers.map((player) => {
    const stats = data.stats[player.id];

    return `
      <div class="individual-player-row" data-player-id="${escapeHTML(player.id)}">

        <div class="individual-player-info">
          <h4>${escapeHTML(player.name)}</h4>

          <div class="individual-player-rank">
            <strong>${stats.points} pontos</strong>
          </div>

          <div class="individual-player-stats">
            <span>Vitórias: <strong>${stats.wins}</strong></span>
            <span>Derrotas: <strong>${stats.losses}</strong></span>
            <span>Aproveitamento: <strong>${stats.accuracy.toFixed(1)}%</strong></span>
            <span>Pontos manuais: <strong>${stats.manualPoints}</strong></span>
          </div>
        </div>

        <div class="individual-player-actions">
          <button
            type="button"
            class="primary-btn"
            data-action="win"
            data-player-id="${escapeHTML(player.id)}"
          >
            + Vitória
          </button>

          <button
            type="button"
            class="secondary-btn"
            data-action="loss"
            data-player-id="${escapeHTML(player.id)}"
          >
            − Derrota
          </button>

          <button
            type="button"
            class="edit-player-btn"
            data-action="edit-name"
            data-player-id="${escapeHTML(player.id)}"
          >
            Alterar nome
          </button>

          <button
            type="button"
            class="remove-player-btn"
            data-action="remove-player"
            data-player-id="${escapeHTML(player.id)}"
          >
            Remover jogador
          </button>
        </div>

        <form
          class="manual-points-form"
          data-player-id="${escapeHTML(player.id)}"
        >
          <label for="manual-points-${escapeHTML(player.id)}">
            Adicionar ou retirar pontos
          </label>

          <div class="manual-points-controls">
            <input
              id="manual-points-${escapeHTML(player.id)}"
              name="manualPoints"
              type="number"
              step="1"
              required
              placeholder="Ex.: 50 ou -20"
            >

            <button
              class="primary-btn"
              type="submit"
            >
              Aplicar
            </button>
          </div>
        </form>

      </div>
    `;
  }).join("");
}

/* =========================================================
   CADASTRAR JOGADOR
========================================================= */

async function addPlayer(event) {
  event.preventDefault();

  if (!requireAdmin()) {
    return;
  }

  const input = $("#playerName");

  if (!input) {
    return;
  }

  const name = input.value.trim();

  if (!name) {
    showToast("Digite o nome do jogador.");
    return;
  }

  if (name.length > 24) {
    showToast("O nome pode ter no máximo 24 caracteres.");
    return;
  }

  const normalizedName = name.toLocaleLowerCase("pt-BR");

  const alreadyExists = data.players.some(
    (player) =>
      player.name.trim().toLocaleLowerCase("pt-BR") === normalizedName
  );

  if (alreadyExists) {
    showToast("Já existe um jogador com esse nome.");
    return;
  }

  const playerId = generatePlayerId();

  try {
    await setDoc(doc(db, "players", playerId), {
      name,
      wins: 0,
      losses: 0,
      manualPoints: 0
    });

    input.value = "";
    showToast(`Jogador ${name} cadastrado com sucesso.`);
  } catch (error) {
    console.error("Erro ao cadastrar jogador:", error);
    showToast("Não foi possível cadastrar o jogador.");
  }
}

/* =========================================================
   ALTERAR NOME DO JOGADOR
========================================================= */

async function renamePlayer(playerId) {
  if (!requireAdmin()) {
    return;
  }

  const player = getPlayer(playerId);

  if (!player) {
    showToast("Jogador não encontrado.");
    return;
  }

  const newName = window.prompt(
    "Digite o novo nome do jogador:",
    player.name
  );

  if (newName === null) {
    return;
  }

  const name = newName.trim();

  if (!name) {
    showToast("O nome do jogador não pode ficar vazio.");
    return;
  }

  if (name.length > 24) {
    showToast("O nome pode ter no máximo 24 caracteres.");
    return;
  }

  const normalizedName = name.toLocaleLowerCase("pt-BR");

  const alreadyExists = data.players.some(
    (otherPlayer) =>
      otherPlayer.id !== playerId &&
      otherPlayer.name.trim().toLocaleLowerCase("pt-BR") === normalizedName
  );

  if (alreadyExists) {
    showToast("Já existe outro jogador com esse nome.");
    return;
  }

  try {
    await updateDoc(doc(db, "players", playerId), {
      name
    });

    showToast("Nome do jogador alterado com sucesso.");
  } catch (error) {
    console.error("Erro ao alterar nome:", error);
    showToast("Não foi possível alterar o nome do jogador.");
  }
}

/* =========================================================
   REMOVER JOGADOR
========================================================= */

async function removePlayer(playerId) {
  if (!requireAdmin()) {
    return;
  }

  const player = getPlayer(playerId);

  if (!player) {
    showToast("Jogador não encontrado.");
    return;
  }

  const confirmed = window.confirm(
    `Tem certeza que deseja remover o jogador "${player.name}"?\n\n` +
    "Essa ação excluirá o cadastro e os dados de vitórias, derrotas " +
    "e pontos manuais desse jogador. Essa operação não pode ser desfeita."
  );

  if (!confirmed) {
    return;
  }

  try {
    await deleteDoc(doc(db, "players", playerId));

    showToast(`Jogador ${player.name} removido com sucesso.`);
  } catch (error) {
    console.error("Erro ao remover jogador:", error);
    showToast(
      "Não foi possível remover o jogador. Verifique as permissões do Firebase."
    );
  }
}

/* =========================================================
   REGISTRAR VITÓRIA OU DERROTA
========================================================= */

async function registerResult(playerId, result) {
  if (!requireAdmin()) {
    return;
  }

  const player = getPlayer(playerId);

  if (!player) {
    showToast("Jogador não encontrado.");
    return;
  }

  if (result !== "win" && result !== "loss") {
    return;
  }

  const field = result === "win" ? "wins" : "losses";

  try {
    await updateDoc(doc(db, "players", playerId), {
      [field]: increment(1)
    });

    if (result === "win") {
      showToast(
        `Vitória registrada para ${player.name}: +${POINTS_PER_WIN} pontos.`
      );
    } else {
      showToast(
        `Derrota registrada para ${player.name}: -${POINTS_PER_LOSS} pontos.`
      );
    }
  } catch (error) {
    console.error("Erro ao registrar resultado:", error);
    showToast("Não foi possível registrar o resultado.");
  }
}

/* =========================================================
   ADICIONAR OU RETIRAR PONTOS MANUAIS
========================================================= */

async function addManualPoints(playerId, amount) {
  if (!requireAdmin()) {
    return;
  }

  const player = getPlayer(playerId);

  if (!player) {
    showToast("Jogador não encontrado.");
    return;
  }

  const points = Number(amount);

  if (!Number.isSafeInteger(points) || points === 0) {
    showToast("Informe um número inteiro diferente de zero.");
    return;
  }

  try {
    await runTransaction(db, async (transaction) => {
      const playerRef = doc(db, "players", playerId);
      const playerSnapshot = await transaction.get(playerRef);

      if (!playerSnapshot.exists()) {
        throw new Error("PLAYER_NOT_FOUND");
      }

      const currentPoints = normalizeNumber(
        playerSnapshot.data().manualPoints
      );

      transaction.update(playerRef, {
        manualPoints: currentPoints + points
      });
    });

    showToast(
      points > 0
        ? `${points} pontos adicionados a ${player.name}.`
        : `${Math.abs(points)} pontos retirados de ${player.name}.`
    );
  } catch (error) {
    console.error("Erro ao atualizar pontos manuais:", error);
    showToast("Não foi possível atualizar os pontos.");
  }
}

/* =========================================================
   LOGIN DO ADMINISTRADOR
========================================================= */

function createAdminLogin() {
  if ($("#adminLoginOverlay")) {
    return;
  }

  const overlay = document.createElement("div");

  overlay.id = "adminLoginOverlay";
  overlay.className = "login-overlay";

  overlay.innerHTML = `
    <div class="login-modal" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
      <button
        type="button"
        class="login-close"
        id="closeLoginBtn"
        aria-label="Fechar"
      >
        ×
      </button>

      <span class="eyebrow">ÁREA RESTRITA</span>

      <h2 id="loginTitle">Login administrativo</h2>

      <p class="form-hint">
        Entre com as credenciais do administrador.
      </p>

      <form id="adminLoginForm">
        <label for="adminEmail">E-mail</label>
        <input
          id="adminEmail"
          name="email"
          type="email"
          autocomplete="username"
          placeholder="Seu e-mail"
          required
        >

        <label for="adminPassword">Senha</label>
        <input
          id="adminPassword"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="Sua senha"
          required
        >

        <button
          class="primary-btn"
          id="loginSubmitBtn"
          type="submit"
        >
          Entrar
        </button>
      </form>

      <p id="loginError" class="login-error" aria-live="polite"></p>
    </div>
  `;

  document.body.appendChild(overlay);

  $("#closeLoginBtn")?.addEventListener("click", () => {
    overlay.remove();
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });

  $("#adminLoginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = $("#adminEmail")?.value.trim();
    const password = $("#adminPassword")?.value;
    const submitButton = $("#loginSubmitBtn");
    const errorElement = $("#loginError");

    if (!email || !password) {
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Entrando...";
    }

    if (errorElement) {
      errorElement.textContent = "";
    }

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (credential.user.uid !== ADMIN_UID) {
        await signOut(auth);

        if (errorElement) {
          errorElement.textContent =
            "Esta conta não tem permissão de administrador.";
        }

        return;
      }

      overlay.remove();
      showToast("Login administrativo realizado com sucesso.");
    } catch (error) {
      console.error("Erro no login:", error);

      if (errorElement) {
        errorElement.textContent =
          "Não foi possível entrar. Confira o e-mail e a senha.";
      }
    } finally {
      if (submitButton && document.body.contains(submitButton)) {
        submitButton.disabled = false;
        submitButton.textContent = "Entrar";
      }
    }
  });
}

/* =========================================================
   SAIR DO ADMINISTRADOR
========================================================= */

async function closeAdmin() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erro ao sair:", error);
    showToast("Não foi possível encerrar a sessão.");
  }
}

function toggleAdmin() {
  if (isAdmin && auth.currentUser?.uid === ADMIN_UID) {
    $("#adminPanel")?.classList.toggle("hidden");
    return;
  }

  createAdminLogin();
}

/* =========================================================
   FIRESTORE: ATUALIZAÇÃO EM TEMPO REAL
========================================================= */

function startPlayersListener() {
  if (unsubscribePlayers) {
    unsubscribePlayers();
  }

  unsubscribePlayers = onSnapshot(
    playersCollection,
    (snapshot) => {
      const players = [];

      snapshot.forEach((documentSnapshot) => {
        const playerData = documentSnapshot.data();

        players.push({
          id: documentSnapshot.id,
          name: String(playerData.name ?? "Sem nome"),
          wins: normalizeNumber(playerData.wins),
          losses: normalizeNumber(playerData.losses),
          manualPoints: normalizeNumber(playerData.manualPoints)
        });
      });

      data.players = players;
      data.stats = getPlayerStats();

      renderAll();
    },
    (error) => {
      console.error("Erro ao carregar jogadores:", error);
      showToast("Erro ao sincronizar os jogadores com o Firebase.");
    }
  );
}

/* =========================================================
   AUTENTICAÇÃO
========================================================= */

function listenToAuthentication() {
  onAuthStateChanged(auth, async (user) => {
    if (user && user.uid === ADMIN_UID) {
      isAdmin = true;

      const adminBtn = $("#adminBtn");
      const logoutBtn = $("#logoutBtn");
      const adminPanel = $("#adminPanel");

      if (adminBtn) {
        adminBtn.textContent = "Painel ADM";
      }

      logoutBtn?.classList.remove("hidden");
      adminPanel?.classList.remove("hidden");

      return;
    }

    isAdmin = false;

    const adminBtn = $("#adminBtn");
    const adminPanel = $("#adminPanel");

    if (adminBtn) {
      adminBtn.textContent = "Login";
    }

    adminPanel?.classList.add("hidden");
    $("#logoutBtn")?.classList.add("hidden");

    if (user && user.uid !== ADMIN_UID) {
      try {
        await signOut(auth);
      } catch (error) {
        console.error("Erro ao encerrar sessão não autorizada:", error);
      }
    }
  });
}

/* =========================================================
   EVENTOS DO PAINEL ADMINISTRATIVO
========================================================= */

function handleAdminHistoryClick(event) {
  const button = event.target.closest(
    "button[data-action][data-player-id]"
  );

  if (!button) {
    return;
  }

  const playerId = button.dataset.playerId;
  const action = button.dataset.action;

  if (!playerId) {
    return;
  }

  switch (action) {
    case "win":
    case "loss":
      registerResult(playerId, action);
      break;

    case "edit-name":
      renamePlayer(playerId);
      break;

    case "remove-player":
      removePlayer(playerId);
      break;

    default:
      break;
  }
}

function handleManualPointsSubmit(event) {
  const form = event.target.closest(".manual-points-form");

  if (!form) {
    return;
  }

  event.preventDefault();

  const playerId = form.dataset.playerId;
  const input = form.querySelector('[name="manualPoints"]');

  if (!playerId || !input) {
    return;
  }

  const amount = Number(input.value);

  if (!Number.isSafeInteger(amount) || amount === 0) {
    showToast("Informe um número inteiro diferente de zero.");
    return;
  }

  addManualPoints(playerId, amount);
}

/* =========================================================
   RENDERIZAR TODA A INTERFACE
   Sem renderização dos elos
========================================================= */

function renderAll() {
  data.stats = getPlayerStats();

  renderRanking();
  renderAdminHistory();
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

function initialize() {
  if (initialized) {
    return;
  }

  initialized = true;

  const playerForm = $("#playerForm");
  const adminBtn = $("#adminBtn");
  const logoutBtn = $("#logoutBtn");
  const adminHistory = $("#adminHistory");

  if (playerForm) {
    playerForm.addEventListener("submit", addPlayer);
  }

  if (adminBtn) {
    adminBtn.addEventListener("click", toggleAdmin);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", closeAdmin);
  }

  if (adminHistory) {
    adminHistory.addEventListener(
      "click",
      handleAdminHistoryClick
    );

    adminHistory.addEventListener(
      "submit",
      handleManualPointsSubmit
    );
  }

  startPlayersListener();
  listenToAuthentication();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
