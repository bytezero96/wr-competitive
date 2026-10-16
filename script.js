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
    getDocs,
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
    appId: "1:453903935694:web:d0334556ca801b84acc89f",
    measurementId: "G-6ZZ14JXLYB"
};

/*
   Este UID identifica a conta autorizada no painel.
   A segurança real das alterações também é aplicada
   pelas regras do Cloud Firestore.
*/

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

const LEGACY_STORAGE_KEY = "wrCompetitiveDataV2";

const RANKS = [
    { name: "Papel", color: "#9CA3AF", icon: "◇" },
    { name: "Madeira", color: "#B8875B", icon: "♜" },
    { name: "Ferrugem", color: "#C66A45", icon: "◆" },
    { name: "Plástico", color: "#43D9C5", icon: "⬡" },
    { name: "Latão", color: "#E8BC65", icon: "✦" },
    { name: "Mithril", color: "#83BFFF", icon: "✧" }
];

const INITIAL_PLAYERS = [
    { id: "micke", name: "Micke" },
    { id: "iago", name: "Iago" },
    { id: "gus", name: "Gus" },
    { id: "derek", name: "Derek" },
    { id: "henrique", name: "Henrique" },
    { id: "yohan", name: "Yohan" }
];

const INITIAL_STATS = {
    micke: { wins: 4, losses: 4 },
    henrique: { wins: 4, losses: 4 },
    derek: { wins: 3, losses: 1 },
    iago: { wins: 2, losses: 3 },
    gus: { wins: 0, losses: 1 },
    yohan: { wins: 1, losses: 2 }
};


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
let seedingInProgress = false;
let loadingError = false;


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

    return Math.max(0, Math.floor(number));
}

function generatePlayerId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return "player-" + window.crypto.randomUUID();
    }

    return "player-" + Date.now() + "-" +
        Math.random().toString(36).slice(2, 10);
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
   IDENTIFICAÇÃO DOS JOGADORES
========================================= */

function getPlayer(playerId) {
    return data.players.find(player => player.id === playerId);
}

function getPlayerStats() {
    return data.players.map(player => {
        const stats = data.stats[player.id] || {
            wins: 0,
            losses: 0
        };

        const wins = normalizeNumber(stats.wins);
        const losses = normalizeNumber(stats.losses);

        const manualPoints = normalizeNumber(
            data.manualPoints[player.id]
        );

        const played = wins + losses;

        /*
           Vitória: +20 pontos.
           Derrota: -15 pontos.
           Pontos manuais: somados separadamente.
        */

        const points =
            wins * POINTS_PER_WIN -
            losses * POINTS_PER_LOSS +
            manualPoints;

        const accuracy = played > 0
            ? Math.round((wins / played) * 100)
            : 0;

        const rankIndex = Math.max(
            0,
            Math.min(
                RANKS.length - 1,
                Math.floor(points / 500)
            )
        );

        const divisionIndex = Math.max(
            0,
            Math.min(
                4,
                Math.floor(
                    (((points % 500) + 500) % 500) /
                    POINTS_PER_DIVISION
                )
            )
        );

        return {
            ...player,
            wins,
            losses,
            played,
            points,
            manualPoints,
            accuracy,
            rankIndex,
            divisionIndex,
            rank: RANKS[rankIndex],
            division: ["V", "IV", "III", "II", "I"][divisionIndex]
        };
    }).sort((a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        a.losses - b.losses ||
        a.name.localeCompare(b.name)
    );
}


/* =========================================
   EMBLEMA DE RANK
========================================= */

function rankBadge(player) {
    return `
        <span
            class="rank-badge"
            style="--rank-color:${player.rank.color};color:${player.rank.color}"
        >
            <span class="rank-symbol">${player.rank.icon}</span>
            ${escapeHTML(player.rank.name)} ${player.division}
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

    $("totalPlayers").textContent = data.players.length;

    $("rankingCount").textContent =
        `${data.players.length} jogador${data.players.length === 1 ? "" : "es"}`;

    const totalResults = players.reduce(
        (total, player) => total + player.played,
        0
    );

    /*
       Cada vitória ou derrota representa um resultado individual.
       A contagem segue o comportamento do sistema original.
    */

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
   SEÇÃO DE RANKS
========================================= */

function renderRanks() {
    const grid = $("ranksGrid");

    if (!grid) {
        return;
    }

    grid.innerHTML = RANKS.map((rank, index) => {
        const start = index * 500;
        const end = start + 499;

        return `
            <article
                class="rank-card"
                style="--rank-color:${rank.color}"
            >
                <div class="rank-emblem">${rank.icon}</div>

                <h3 style="color:${rank.color}">
                    ${rank.name}
                </h3>

                <p>Divisões V, IV, III, II e I</p>

                <p>
                    ${index === 5
                        ? "2.500–2.899 pontos; divisão I a partir de 2.900"
                        : `${start}–${end} pontos`}
                </p>
            </article>
        `;
    }).join("");
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
                        Rank atual:
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
   AUTORIZAÇÃO DO ADMINISTRADOR
========================================= */

function requireAdmin() {
    if (!auth.currentUser || auth.currentUser.uid !== ADMIN_UID || !isAdmin) {
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
            const playerSnapshot = await transaction.get(playerRef);

            if (!playerSnapshot.exists()) {
                throw new Error("PLAYER_NOT_FOUND");
            }

            const currentPoints = normalizeNumber(
                playerSnapshot.data().manualPoints
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

    const exists = data.players.some(player =>
        player.name.trim().toLocaleLowerCase("pt-BR") ===
        name.toLocaleLowerCase("pt-BR")
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
   RECUPERAÇÃO DE DADOS LOCAIS ANTIGOS
========================================= */

/*
   Esta função apenas LÊ os dados antigos.
   O sistema novo não usa localStorage para salvar
   nem sincronizar o ranking.

   Os dados locais só são importados quando:
   1. O administrador está autenticado.
   2. A coleção Firestore está vazia.
*/

function loadLegacyData() {
    try {
        const saved = localStorage.getItem(LEGACY_STORAGE_KEY);

        if (!saved) {
            return null;
        }

        const parsed = JSON.parse(saved);

        if (!parsed || !Array.isArray(parsed.players)) {
            return null;
        }

        const validPlayers = parsed.players
            .filter(player => player && player.name)
            .map(player => ({
                id: String(player.id || generatePlayerId())
                    .replace(/\//g, "-"),
                name: String(player.name).trim().slice(0, 24)
            }))
            .filter(player => player.name.length > 0);

        if (validPlayers.length === 0) {
            return null;
        }

        const stats = parsed.stats || {};
        const manualPoints = parsed.manualPoints || {};

        return {
            players: validPlayers.map(player => ({
                ...player,
                wins: normalizeNumber(stats[player.id]?.wins),
                losses: normalizeNumber(stats[player.id]?.losses),
                manualPoints: normalizeNumber(manualPoints[player.id])
            }))
        };
    } catch (error) {
        console.error("Erro ao recuperar dados locais:", error);
        return null;
    }
}


/* =========================================
   DADOS INICIAIS DO RANKING
========================================= */

function getInitialPlayers() {
    const legacyData = loadLegacyData();

    if (legacyData && legacyData.players.length > 0) {
        return legacyData.players;
    }

    return INITIAL_PLAYERS.map(player => {
        const stats = INITIAL_STATS[player.id] || {
            wins: 0,
            losses: 0
        };

        return {
            ...player,
            wins: stats.wins,
            losses: stats.losses,
            manualPoints: 0
        };
    });
}


/* =========================================
   POPULAR FIRESTORE SE ESTIVER VAZIO
========================================= */

async function seedFirestoreIfNeeded() {
    if (!requireAdmin()) {
        return;
    }

    if (seedingInProgress) {
        return;
    }

    seedingInProgress = true;

    try {
        const existingPlayers = await getDocs(playersCollection);

        /*
           Nunca substitui os dados existentes.
           Se a coleção já tiver documentos, encerra.
        */

        if (!existingPlayers.empty) {
            return;
        }

        const initialPlayers = getInitialPlayers();

        for (const player of initialPlayers) {
            const id = String(player.id).replace(/\//g, "-");

            await setDoc(doc(db, "players", id), {
                name: player.name,
                wins: normalizeNumber(player.wins),
                losses: normalizeNumber(player.losses),
                manualPoints: normalizeNumber(player.manualPoints)
            });
        }

        showToast("Ranking inicial configurado com sucesso!");
    } catch (error) {
        console.error("Erro ao configurar ranking inicial:", error);
        showToast("Não foi possível configurar o ranking inicial.");
    } finally {
        seedingInProgress = false;
    }
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
            loadingError = false;

            const players = [];
            const stats = {};
            const manualPoints = {};

            snapshot.forEach(documentSnapshot => {
                const record = documentSnapshot.data();
                const id = documentSnapshot.id;

                const player = {
                    id,
                    name: String(record.name || "Jogador")
                        .trim()
                        .slice(0, 24)
                };

                players.push(player);

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

            /*
               Se a coleção estiver vazia, somente a conta
               administrativa poderá criar os dados iniciais.
            */

            if (snapshot.empty && isAdmin) {
                seedFirestoreIfNeeded();
            }
        },

        error => {
            console.error("Erro ao sincronizar ranking:", error);
            loadingError = true;
            showToast("Erro ao carregar o ranking. Verifique sua conexão.");
        }
    );
}


/* =========================================
   LOGIN ADMINISTRATIVO
========================================= */

function createAdminLogin() {
    if (isAdmin) {
        $("adminPanel").classList.remove("hidden");
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
        <form
            id="adminLoginForm"
            style="
                width: 100%;
                max-width: 360px;
                padding: 28px;
                border: 1px solid #263449;
                border-radius: 16px;
                background: #101827;
                color: #f2f5fb;
                box-shadow: 0 20px 60px rgba(0,0,0,.45);
                font-family: inherit;
            "
        >
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

            <label
                for="adminEmailInput"
                style="display:block;margin-bottom:8px;font-size:13px;"
            >
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

            <label
                for="adminPasswordInput"
                style="display:block;margin-bottom:8px;font-size:13px;"
            >
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

            <p
                id="adminLoginError"
                style="
                    display: none;
                    color: #ff7087;
                    font-size: 13px;
                    margin: 0 0 12px;
                    line-height: 1.5;
                "
            ></p>

            <button
                type="submit"
                id="adminLoginSubmit"
                style="
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
                "
            >
                Entrar no painel
            </button>

            <button
                type="button"
                id="cancelAdminLogin"
                style="
                    width: 100%;
                    padding: 11px;
                    border: 1px solid #263449;
                    border-radius: 9px;
                    background: transparent;
                    color: #f2f5fb;
                    font: inherit;
                    cursor: pointer;
                "
            >
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

            /*
               Mesmo que alguém tenha uma conta no Firebase,
               somente o UID autorizado pode abrir o painel.
            */

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
                errorElement.textContent =
                    "E-mail ou senha incorretos.";
            } else if (error.code === "auth/too-many-requests") {
                errorElement.textContent =
                    "Muitas tentativas. Aguarde um pouco e tente novamente.";
            } else if (
                error.code === "auth/network-request-failed"
            ) {
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

    $("adminPanel").classList.add("hidden");

    const overlay = $("adminLoginOverlay");

    if (overlay) {
        overlay.remove();
    }

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
   RENDERIZAÇÃO GERAL
========================================= */

function renderAll() {
    renderRanking();
    renderRanks();
    renderAdminHistory();
}


/* =========================================
   ESTADO DE AUTENTICAÇÃO
========================================= */

function listenToAuthentication() {
    onAuthStateChanged(auth, async user => {
        const previousAdminState = isAdmin;

        if (user && user.uid === ADMIN_UID) {
            isAdmin = true;

            const overlay = $("adminLoginOverlay");

            if (overlay) {
                overlay.remove();
            }

            $("adminPanel").classList.remove("hidden");

            renderAdminHistory();

            if (!previousAdminState) {
                showToast("Acesso administrativo autorizado!");
            }

            await seedFirestoreIfNeeded();

        } else {
            isAdmin = false;
            $("adminPanel").classList.add("hidden");
            renderAdminHistory();

            /*
               Uma conta diferente da autorizada não permanece
               autenticada neste painel administrativo.
            */

            if (user) {
                showToast("Conta sem autorização administrativa.");
                await signOut(auth);
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

        const playerId = form.dataset.playerId;
        const input = form.querySelector(".manual-points-input");

        if (!input) {
            return;
        }

        addManualPoints(playerId, input.value);
        input.value = "";
    });

    renderAll();

    /*
       O ranking é público e sincronizado em tempo real.
       O acesso de escrita continua restrito pelas regras
       do Firestore e pela autenticação administrativa.
    */

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
