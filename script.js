"use strict";

/* =========================================
   WR COMPETITIVE
   Firebase Authentication + Cloud Firestore
========================================= */

import { initializeApp } from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    setDoc,
    updateDoc,
    increment,
    onSnapshot,
    runTransaction
} from
    "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


/* =========================================
   CONFIGURAÇÃO FIREBASE
========================================= */

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


/* =========================================
   CONFIGURAÇÕES DO RANKING
========================================= */

const POINTS_PER_WIN = 20;
const POINTS_PER_LOSS = 15;
const POINTS_PER_DIVISION = 100;
const POINTS_PER_RANK = 300;
const MITHRIL_MIN_POINTS = 1500;

const RANKS = [
    {
        name: "Papel",
        color: "#9CA3AF",
        icon: "◇",
        min: 0,
        max: 299
    },
    {
        name: "Madeira",
        color: "#B8875B",
        icon: "♜",
        min: 300,
        max: 599
    },
    {
        name: "Ferrugem",
        color: "#C66A45",
        icon: "◆",
        min: 600,
        max: 899
    },
    {
        name: "Plástico",
        color: "#43D9C5",
        icon: "⬡",
        min: 900,
        max: 1199
    },
    {
        name: "Latão",
        color: "#E8BC65",
        icon: "✦",
        min: 1200,
        max: 1499
    },
    {
        name: "Mithril",
        color: "#83BFFF",
        icon: "✧",
        min: MITHRIL_MIN_POINTS,
        max: Infinity
    }
];

const DIVISIONS = [
    { name: "III", index: 0 },
    { name: "II", index: 1 },
    { name: "I", index: 2 }
];


/* =========================================
   ESTADO DA APLICAÇÃO
========================================= */

let data = {
    players: [],
    stats: {},
    manualPoints: {}
};

let isAdmin = false;
let initialized = false;
let toastTimeout = null;
let unsubscribePlayers = null;
let selectedRankIndex = null;
let selectedDivisionIndex = 0;


/* =========================================
   ELEMENTOS E UTILITÁRIOS
========================================= */

function $(id) {
    return document.getElementById(id);
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function normalizeNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.floor(number);
}

function generatePlayerId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return "player-" + window.crypto.randomUUID();
    }

    return "player-" + Date.now() + "-" +
        Math.random().toString(36).slice(2, 10);
}

function getPlayer(playerId) {
    return data.players.find(player => player.id === playerId);
}


/* =========================================
   AVISOS
========================================= */

function showToast(message) {
    const toast = $("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}


/* =========================================
   CÁLCULO DO ELO E DA DIVISÃO
========================================= */

function getRankInfo(points) {
    /*
       Mithril começa em 1.500 pontos e não tem divisões.
       Os cinco elos anteriores têm três divisões de 100 pontos.
    */

    if (points >= MITHRIL_MIN_POINTS) {
        return {
            rankIndex: 5,
            divisionIndex: null,
            rank: RANKS[5],
            division: null
        };
    }

    /*
       Pontuações abaixo de zero permanecem no Papel.
       O valor real do jogador continua sendo exibido.
    */

    const safePoints = Math.max(0, points);

    const rankIndex = Math.min(
        4,
        Math.floor(safePoints / POINTS_PER_RANK)
    );

    const pointsInsideRank =
        safePoints - rankIndex * POINTS_PER_RANK;

    const divisionIndex = Math.min(
        2,
        Math.floor(pointsInsideRank / POINTS_PER_DIVISION)
    );

    return {
        rankIndex,
        divisionIndex,
        rank: RANKS[rankIndex],
        division: DIVISIONS[divisionIndex].name
    };
}

function getPlayerStats() {
    return data.players.map(player => {
        const stats = data.stats[player.id] || {
            wins: 0,
            losses: 0
        };

        const wins = Math.max(0, normalizeNumber(stats.wins));
        const losses = Math.max(0, normalizeNumber(stats.losses));
        const manualPoints = Math.max(
            0,
            normalizeNumber(data.manualPoints[player.id])
        );

        const played = wins + losses;

        const points =
            wins * POINTS_PER_WIN -
            losses * POINTS_PER_LOSS +
            manualPoints;

        const accuracy = played > 0
            ? Math.round((wins / played) * 100)
            : 0;

        const rankInfo = getRankInfo(points);

        return {
            ...player,
            wins,
            losses,
            played,
            points,
            manualPoints,
            accuracy,
            ...rankInfo
        };
    }).sort((a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        a.losses - b.losses ||
        a.name.localeCompare(b.name)
    );
}


/* =========================================
   EMBLEMA DO ELO
========================================= */

function rankBadge(player) {
    const divisionText = player.division
        ? ` ${player.division}`
        : "";

    return `
        <span
            class="rank-badge"
            style="--rank-color:${player.rank.color};color:${player.rank.color}"
        >
            <span class="rank-symbol">${player.rank.icon}</span>
            ${escapeHTML(player.rank.name)}${divisionText}
        </span>
    `;
}


/* =========================================
   RANKING PRINCIPAL
========================================= */

function renderRanking() {
    const tbody = $("rankingBody");
    const empty = $("emptyRanking");

    if (!tbody || !empty) {
        return;
    }

    const players = getPlayerStats();

    $("totalPlayers").textContent = players.length;

    $("rankingCount").textContent =
        `${players.length} jogador${players.length === 1 ? "" : "es"}`;

    const totalResults = players.reduce(
        (total, player) => total + player.played,
        0
    );

    $("totalMatches").textContent = totalResults;

    const leader = players[0];

    $("leaderName").textContent = leader ? leader.name : "—";

    $("leaderPoints").textContent =
        leader ? `${leader.points} pontos` : "0 pontos";

    tbody.innerHTML = players.map((player, index) => `
        <tr>
            <td>
                <span class="position ${index < 3 ? "top" : ""}">
                    ${String(index + 1).padStart(2, "0")}
                </span>
            </td>

            <td>
                <span class="player-name">
                    ${escapeHTML(player.name)}
                </span>
                <span class="player-sub">
                    ${escapeHTML(player.rank.name)}
                    ${player.division ? " " + player.division : ""}
                </span>
            </td>

            <td>
                <span class="points">${player.points}</span>
            </td>

            <td>
                <span class="win">${player.wins}</span>/<span class="loss">${player.losses}</span>
            </td>

            <td>
                <span>${player.accuracy}%</span>
            </td>
        </tr>
    `).join("");

    empty.classList.toggle("hidden", players.length > 0);
}


/* =========================================
   CARDS DOS SEIS ELOS
========================================= */

function renderRanks() {
    const grid = $("ranksGrid");

    if (!grid) {
        return;
    }

    grid.innerHTML = RANKS.map((rank, index) => {
        const isMithril = index === 5;

        let pointsText;

        if (isMithril) {
            pointsText = "1.500 pontos ou mais";
        } else {
            pointsText = `${rank.min}–${rank.max} pontos`;
        }

        const divisionText = isMithril
            ? "Sem divisões"
            : "Divisões III, II e I";

        const selectedClass =
            selectedRankIndex === index ? " selected" : "";

        return `
            <article
                class="rank-card${selectedClass}"
                style="--rank-color:${rank.color}"
                data-rank-index="${index}"
                role="button"
                tabindex="0"
                aria-label="Ver jogadores do elo ${rank.name}"
                aria-pressed="${selectedRankIndex === index}"
            >
                <div class="rank-emblem">${rank.icon}</div>

                <h3 style="color:${rank.color}">
                    ${rank.name}
                </h3>

                <p>${divisionText}</p>
                <p>${pointsText}</p>
            </article>
        `;
    }).join("");
}


/* =========================================
   JOGADORES DE CADA ELO
========================================= */

function renderRankDetails() {
    const panel = $("rankDetails");
    const tabs = $("divisionTabs");
    const list = $("rankPlayerList");
    const empty = $("emptyRankPlayers");

    if (!panel || !tabs || !list || !empty) {
        return;
    }

    if (
        selectedRankIndex === null ||
        !RANKS[selectedRankIndex]
    ) {
        panel.classList.add("hidden");
        return;
    }

    const rank = RANKS[selectedRankIndex];
    const isMithril = selectedRankIndex === 5;

    panel.classList.remove("hidden");

    $("rankDetailTitle").textContent =
        `Elo ${rank.name}`;

    $("rankDetailDescription").textContent = isMithril
        ? "Todos os jogadores com 1.500 pontos ou mais. Mithril não possui divisões."
        : `Selecione uma divisão de ${rank.name} para consultar os jogadores e suas pontuações.`;

    if (isMithril) {
        tabs.innerHTML = "";
    } else {
        tabs.innerHTML = DIVISIONS.map(division => `
            <button
                type="button"
                class="division-tab ${
                    selectedDivisionIndex === division.index ? "active" : ""
                }"
                data-division-index="${division.index}"
                aria-pressed="${
                    selectedDivisionIndex === division.index
                }"
            >
                Divisão ${division.name}
            </button>
        `).join("");
    }

    const allPlayers = getPlayerStats();

    const filteredPlayers = allPlayers.filter(player => {
        if (player.rankIndex !== selectedRankIndex) {
            return false;
        }

        if (isMithril) {
            return true;
        }

        return player.divisionIndex === selectedDivisionIndex;
    });

    list.innerHTML = filteredPlayers.map((player, index) => `
        <article class="rank-player-row">
            <span class="rank-player-position">
                ${String(index + 1).padStart(2, "0")}
            </span>

            <div>
                <div class="rank-player-name">
                    ${escapeHTML(player.name)}
                </div>

                <span class="rank-player-meta">
                    ${player.wins} vitórias · ${player.losses} derrotas
                </span>
            </div>

            <span class="rank-player-points">
                ${player.points.toLocaleString("pt-BR")} pts
            </span>
        </article>
    `).join("");

    empty.classList.toggle("hidden", filteredPlayers.length > 0);
}


/* =========================================
   PAINEL ADMINISTRATIVO
========================================= */

function renderAdminHistory() {
    const container = $("adminHistory");

    if (!container) {
        return;
    }

    if (!isAdmin) {
        container.innerHTML = "";
        return;
    }

    const players = getPlayerStats();

    if (players.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                Nenhum jogador cadastrado ainda.
            </div>
        `;
        return;
    }

    container.innerHTML = players.map(player => `
        <article
            class="admin-history-row individual-player-row"
            data-player-id="${escapeHTML(player.id)}"
        >
            <div class="individual-player-info">
                <strong>${escapeHTML(player.name)}</strong>

                <div class="individual-player-rank">
                    <span style="color:${player.rank.color};font-weight:700">
                        Elo atual:
                    </span>
                    ${rankBadge(player)}
                </div>

                <div class="individual-player-stats">
                    <span>
                        Vitórias:
                        <strong class="win">${player.wins}</strong>
                    </span>

                    <span>
                        Derrotas:
                        <strong class="loss">${player.losses}</strong>
                    </span>

                    <span>
                        Partidas:
                        <strong>${player.played}</strong>
                    </span>

                    <span>
                        Aproveitamento:
                        <strong>${player.accuracy}%</strong>
                    </span>

                    <span>
                        Pontos totais:
                        <strong class="points">${player.points}</strong>
                    </span>

                    <span>
                        Pontos manuais:
                        <strong>${player.manualPoints}</strong>
                    </span>
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
                    class="primary-btn"
                    data-action="loss"
                    data-player-id="${escapeHTML(player.id)}"
                >
                    − Derrota
                </button>
            </div>

            <form
                class="manual-points-form"
                data-player-id="${escapeHTML(player.id)}"
            >
                <label for="points-${escapeHTML(player.id)}">
                    Adicionar pontos
                </label>

                <div class="manual-points-controls">
                    <input
                        id="points-${escapeHTML(player.id)}"
                        class="manual-points-input"
                        type="number"
                        min="1"
                        step="1"
                        inputmode="numeric"
                        placeholder="Ex.: 100"
                        required
                    >

                    <button type="submit" class="primary-btn">
                        Adicionar
                    </button>
                </div>
            </form>
        </article>
    `).join("");
}


/* =========================================
   AUTORIZAÇÃO ADMINISTRATIVA
========================================= */

function requireAdmin() {
    if (
        !auth.currentUser ||
        auth.currentUser.uid !== ADMIN_UID ||
        !isAdmin
    ) {
        showToast("Entre com a conta administrativa autorizada.");
        return false;
    }

    return true;
}


/* =========================================
   REGISTRAR VITÓRIA OU DERROTA
========================================= */

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
        showToast("Resultado inválido.");
        return;
    }

    const field = result === "win" ? "wins" : "losses";

    try {
        await updateDoc(doc(db, "players", playerId), {
            [field]: increment(1)
        });

        showToast(
            `${result === "win" ? "Vitória" : "Derrota"} registrada para ${player.name}.`
        );
    } catch (error) {
        console.error("Erro ao registrar resultado:", error);
        showToast("Não foi possível registrar o resultado.");
    }
}


/* =========================================
   ADICIONAR PONTOS MANUALMENTE
========================================= */

async function addManualPoints(playerId, amount) {
    if (!requireAdmin()) {
        return;
    }

    const player = getPlayer(playerId);

    if (!player) {
        showToast("Jogador não encontrado.");
        return;
    }

    const pointsToAdd = Number(amount);

    if (
        !Number.isSafeInteger(pointsToAdd) ||
        pointsToAdd <= 0
    ) {
        showToast("Digite um número inteiro de pontos maior que zero.");
        return;
    }

    try {
        const playerRef = doc(db, "players", playerId);

        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(playerRef);

            if (!snapshot.exists()) {
                throw new Error("PLAYER_NOT_FOUND");
            }

            const currentPoints = Math.max(
                0,
                normalizeNumber(snapshot.data().manualPoints)
            );

            if (currentPoints + pointsToAdd > Number.MAX_SAFE_INTEGER) {
                throw new Error("POINTS_TOO_HIGH");
            }

            transaction.update(playerRef, {
                manualPoints: currentPoints + pointsToAdd
            });
        });

        showToast(
            `+${pointsToAdd} pontos adicionados para ${player.name}.`
        );
    } catch (error) {
        console.error("Erro ao adicionar pontos:", error);

        if (error.message === "POINTS_TOO_HIGH") {
            showToast("Essa quantidade de pontos é muito alta.");
        } else {
            showToast("Não foi possível adicionar os pontos.");
        }
    }
}


/* =========================================
   CADASTRAR JOGADOR
========================================= */

async function addPlayer(event) {
    event.preventDefault();

    if (!requireAdmin()) {
        return;
    }

    const input = $("playerName");

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

    const exists = data.players.some(player =>
        player.name.trim().toLocaleLowerCase("pt-BR") === normalizedName
    );

    if (exists) {
        showToast("Esse jogador já está cadastrado.");
        return;
    }

    const id = generatePlayerId();

    try {
        await setDoc(doc(db, "players", id), {
            name,
            wins: 0,
            losses: 0,
            manualPoints: 0
        });

        input.value = "";
        showToast("Jogador cadastrado com sucesso!");
    } catch (error) {
        console.error("Erro ao cadastrar jogador:", error);
        showToast("Não foi possível cadastrar o jogador.");
    }
}


/* =========================================
   LOGIN ADMINISTRATIVO
========================================= */

function createAdminLogin() {
    if (isAdmin) {
        $("adminPanel").classList.remove("hidden");
        $("adminPanel").scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
        return;
    }

    if ($("adminLoginOverlay")) {
        return;
    }

    const overlay = document.createElement("div");
    overlay.id = "adminLoginOverlay";

    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(3,8,18,.88);
        backdrop-filter: blur(8px);
    `;

    overlay.innerHTML = `
        <form id="adminLoginForm" style="
            width: 100%;
            max-width: 360px;
            padding: 28px;
            border: 1px solid #263449;
            border-radius: 16px;
            background: #101827;
            color: #f2f5fb;
            box-shadow: 0 20px 60px rgba(0,0,0,.45);
            font-family: inherit;
        ">
            <div style="
                color: #43d9f5;
                font-size: 12px;
                font-weight: 800;
                letter-spacing: 2px;
                margin-bottom: 10px;
            ">WR COMPETITIVE</div>

            <h2 style="margin: 0 0 8px; font-size: 23px;">
                Acesso administrativo
            </h2>

            <p style="
                color: #8b9bb3;
                font-size: 14px;
                margin: 0 0 22px;
            ">
                Entre com o e-mail e a senha da conta autorizada.
            </p>

            <label for="adminEmailInput"
                style="display:block;margin-bottom:8px;font-size:13px;">
                E-mail administrativo
            </label>

            <input
                id="adminEmailInput"
                type="email"
                autocomplete="username"
                required
                placeholder="Seu e-mail"
                style="
                    width: 100%;
                    box-sizing: border-box;
                    padding: 13px;
                    border: 1px solid #263449;
                    border-radius: 9px;
                    background: #080d18;
                    color: #f2f5fb;
                    font: inherit;
                    margin-bottom: 14px;
                "
            >

            <label for="adminPasswordInput"
                style="display:block;margin-bottom:8px;font-size:13px;">
                Senha
            </label>

            <input
                id="adminPasswordInput"
                type="password"
                autocomplete="current-password"
                required
                placeholder="Sua senha"
                style="
                    width: 100%;
                    box-sizing: border-box;
                    padding: 13px;
                    border: 1px solid #263449;
                    border-radius: 9px;
                    background: #080d18;
                    color: #f2f5fb;
                    font: inherit;
                    margin-bottom: 12px;
                "
            >

            <p id="adminLoginError" style="
                display: none;
                color: #ff7087;
                font-size: 13px;
                margin: 0 0 12px;
                line-height: 1.5;
            "></p>

            <button type="submit" id="adminLoginSubmit" style="
                width: 100%;
                padding: 13px;
                border: 0;
                border-radius: 9px;
                background: #43d9f5;
                color: #080d18;
                font: inherit;
                font-weight: 800;
                cursor: pointer;
                margin-bottom: 10px;
            ">
                Entrar no painel
            </button>

            <button type="button" id="cancelAdminLogin" style="
                width: 100%;
                padding: 11px;
                border: 1px solid #263449;
                border-radius: 9px;
                background: transparent;
                color: #f2f5fb;
                font: inherit;
                cursor: pointer;
            ">
                Cancelar
            </button>
        </form>
    `;

    document.body.appendChild(overlay);

    $("adminLoginForm").addEventListener("submit", async event => {
        event.preventDefault();

        const email = $("adminEmailInput").value.trim();
        const password = $("adminPasswordInput").value;
        const errorElement = $("adminLoginError");
        const submitButton = $("adminLoginSubmit");

        errorElement.style.display = "none";
        submitButton.disabled = true;
        submitButton.textContent = "Verificando acesso...";

        try {
            const credential = await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

            if (credential.user.uid !== ADMIN_UID) {
                await signOut(auth);
                throw new Error("NOT_AUTHORIZED");
            }

            overlay.remove();
        } catch (error) {
            console.error("Erro no login administrativo:", error);

            if (error.message === "NOT_AUTHORIZED") {
                errorElement.textContent =
                    "Esta conta não possui autorização administrativa.";
            } else if (
                error.code === "auth/invalid-credential" ||
                error.code === "auth/wrong-password" ||
                error.code === "auth/user-not-found" ||
                error.code === "auth/invalid-email"
            ) {
                errorElement.textContent = "E-mail ou senha incorretos.";
            } else if (error.code === "auth/too-many-requests") {
                errorElement.textContent =
                    "Muitas tentativas. Aguarde um pouco e tente novamente.";
            } else if (error.code === "auth/network-request-failed") {
                errorElement.textContent =
                    "Falha de conexão. Verifique sua internet.";
            } else {
                errorElement.textContent =
                    "Não foi possível entrar. Confira o login e tente novamente.";
            }

            errorElement.style.display = "block";
            $("adminPasswordInput").value = "";
            $("adminPasswordInput").focus();

            submitButton.disabled = false;
            submitButton.textContent = "Entrar no painel";
        }
    });

    $("cancelAdminLogin").addEventListener("click", () => {
        overlay.remove();
    });

    overlay.addEventListener("click", event => {
        if (event.target === overlay) {
            overlay.remove();
        }
    });

    $("adminEmailInput").focus();
}


/* =========================================
   ENCERRAR SESSÃO
========================================= */

async function closeAdmin() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Erro ao encerrar sessão:", error);
        showToast("Não foi possível encerrar a sessão.");
        return;
    }

    isAdmin = false;
    $("adminPanel").classList.add("hidden");

    const overlay = $("adminLoginOverlay");

    if (overlay) {
        overlay.remove();
    }

    renderAdminHistory();
    showToast("Sessão administrativa encerrada.");
}

function toggleAdmin() {
    if (isAdmin) {
        closeAdmin();
    } else {
        createAdminLogin();
    }
}


/* =========================================
   EVENTOS DOS ELOS
========================================= */

function handleRankGridClick(event) {
    const card = event.target.closest("[data-rank-index]");

    if (!card) {
        return;
    }

    openRank(card.dataset.rankIndex);
}

function handleRankGridKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    const card = event.target.closest("[data-rank-index]");

    if (!card) {
        return;
    }

    event.preventDefault();
    openRank(card.dataset.rankIndex);
}

function openRank(rankIndex) {
    const index = Number(rankIndex);

    if (!Number.isInteger(index) || !RANKS[index]) {
        return;
    }

    selectedRankIndex = index;
    selectedDivisionIndex = 0;

    renderRanks();
    renderRankDetails();

    $("rankDetails").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function closeRankDetails() {
    selectedRankIndex = null;

    renderRanks();
    renderRankDetails();
}


/* =========================================
   RENDERIZAÇÃO GERAL
========================================= */

function renderAll() {
    renderRanking();
    renderRanks();
    renderRankDetails();
    renderAdminHistory();
}


/* =========================================
   SINCRONIZAÇÃO EM TEMPO REAL
========================================= */

function startPlayersListener() {
    if (unsubscribePlayers) {
        unsubscribePlayers();
    }

    unsubscribePlayers = onSnapshot(
        playersCollection,

        snapshot => {
            const players = [];
            const stats = {};
            const manualPoints = {};

            snapshot.forEach(documentSnapshot => {
                const record = documentSnapshot.data();
                const id = documentSnapshot.id;

                players.push({
                    id,
                    name: String(record.name || "Jogador")
                        .trim()
                        .slice(0, 24)
                });

                stats[id] = {
                    wins: normalizeNumber(record.wins),
                    losses: normalizeNumber(record.losses)
                };

                manualPoints[id] = normalizeNumber(record.manualPoints);
            });

            data = {
                players,
                stats,
                manualPoints
            };

            renderAll();
        },

        error => {
            console.error("Erro ao sincronizar ranking:", error);
            showToast(
                "Erro ao carregar o ranking. Verifique sua conexão e as regras do Firebase."
            );
        }
    );
}


/* =========================================
   ESTADO DE AUTENTICAÇÃO
========================================= */

function listenToAuthentication() {
    onAuthStateChanged(auth, async user => {
        if (user && user.uid === ADMIN_UID) {
            const wasAdmin = isAdmin;
            isAdmin = true;

            const overlay = $("adminLoginOverlay");

            if (overlay) {
                overlay.remove();
            }

            $("adminPanel").classList.remove("hidden");
            renderAdminHistory();

            if (!wasAdmin) {
                showToast("Acesso administrativo autorizado!");
            }
        } else {
            isAdmin = false;
            $("adminPanel").classList.add("hidden");
            renderAdminHistory();

            if (user) {
                showToast("Conta sem autorização administrativa.");

                try {
                    await signOut(auth);
                } catch (error) {
                    console.error("Erro ao encerrar conta não autorizada:", error);
                }
            }
        }
    });
}


/* =========================================
   INICIALIZAÇÃO
========================================= */

function initialize() {
    if (initialized) {
        return;
    }

    const requiredIds = [
        "adminBtn",
        "adminPanel",
        "logoutBtn",
        "playerForm",
        "playerName",
        "adminHistory",
        "rankingBody",
        "totalPlayers",
        "totalMatches",
        "leaderName",
        "leaderPoints",
        "rankingCount",
        "emptyRanking",
        "ranksGrid",
        "rankDetails",
        "rankDetailTitle",
        "rankDetailDescription",
        "divisionTabs",
        "rankPlayerList",
        "emptyRankPlayers",
        "closeRankDetails",
        "toast"
    ];

    const missing = requiredIds.filter(id => !$(id));

    if (missing.length > 0) {
        console.error(
            "WR Competitive: elementos não encontrados no HTML:",
            missing.join(", ")
        );
        return;
    }

    initialized = true;

    $("playerForm").addEventListener("submit", addPlayer);
    $("adminBtn").addEventListener("click", toggleAdmin);
    $("logoutBtn").addEventListener("click", closeAdmin);

    $("ranksGrid").addEventListener("click", handleRankGridClick);
    $("ranksGrid").addEventListener("keydown", handleRankGridKeydown);

    $("closeRankDetails").addEventListener("click", closeRankDetails);

    $("divisionTabs").addEventListener("click", event => {
        const button = event.target.closest("[data-division-index]");

        if (!button) {
            return;
        }

        const index = Number(button.dataset.divisionIndex);

        if (!Number.isInteger(index) || !DIVISIONS[index]) {
            return;
        }

        selectedDivisionIndex = index;
        renderRankDetails();
    });

    $("adminHistory").addEventListener("click", event => {
        const button = event.target.closest(
            "button[data-action][data-player-id]"
        );

        if (!button) {
            return;
        }

        registerResult(
            button.dataset.playerId,
            button.dataset.action
        );
    });

    $("adminHistory").addEventListener("submit", event => {
        const form = event.target.closest(".manual-points-form");

        if (!form) {
            return;
        }

        event.preventDefault();

        const input = form.querySelector(".manual-points-input");

        if (!input) {
            return;
        }

        const amount = input.value;
        input.value = "";

        addManualPoints(form.dataset.playerId, amount);
    });

    renderAll();
    startPlayersListener();
    listenToAuthentication();

    console.log("WR Competitive conectado ao Firebase.");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
        once: true
    });
} else {
    initialize();
}
