/**
 * UNO得点記録アプリ
 * メインJavaScriptファイル
 */


// =============================================
// Firebase初期化 (Realtime Database版)
// =============================================
let db = null;

try {
    if (typeof firebase !== 'undefined' && firebaseConfig && firebaseConfig.apiKey !== "YOUR_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        db = firebase.database(); // Realtime Databaseを使用

        // 匿名認証を開始
        firebase.auth().signInAnonymously().catch(e => {
            console.error('Auth error:', e);
            showToast('ログイン失敗: 設定を確認してください (' + e.code + ')', true);
        });

        // 認証状態の変化を監視し、認証完了後にデータロード
        firebase.auth().onAuthStateChanged(user => {
            if (user) {
                console.log('Signed in anonymously:', user.uid);
                loadData(); // 認証後にロード（再試行）
            }
        });

        console.log('Firebase (RTDB) initialized');
    } else {
        console.log('Firebase configure pending...');
    }
} catch (e) {
    console.error('Firebase init error:', e);
}

// =============================================
// グローバル状態
// =============================================
let state = {
    currentYear: new Date().getFullYear(),
    players: ['百合子', '守正', '正久', '千明', '宏子', '健二'],
    games: [], // { id, date, type, scores: { playerName: score } }
    fund: 0, // UNO基金残高
    lastGameType: 'パねぇ！', // 最後に選択したUNOタイプ
    rankingOverrides: {}, // 同点時の順位指定
    dailyWinners: {}, // 日別合計の勝者指定 { '2026-01-01': 'プレイヤー名' }
    yearlyWinner: {}, // 年間合計の勝者指定 { '2026': 'プレイヤー名' }
    sortDesc: true, // true: 新しい順, false: 古い順
    charts: {
        line: null,
        winLoss: null,
        bar: null
    }
};

// =============================================
// 定数
// =============================================
const STORAGE_KEY = 'uno_score_data';
const DB_PATH = 'uno_data_v1/main_data'; // 保存パス

// グラフ用カラーパレット（プレイヤー増加時も対応）
const CHART_COLORS = [
    '#00d4ff', '#e67700', '#00a868', '#ff4757', '#a855f7', '#f1c40f',
    '#ff69b4', '#00ff7f', '#4169e1', '#dc143c'
];

// 色を取得（インデックスがオーバーフローしてもループ）
function getChartColor(index) {
    return CHART_COLORS[index % CHART_COLORS.length];
}

// =============================================
// データ永続化 (localStorage / Realtime Database)
// =============================================

// データを保存（RTDB優先、無ければLocal）
async function saveData() {
    const data = {
        players: state.players,
        games: state.games,
        fund: state.fund,
        lastGameType: state.lastGameType,
        rankingOverrides: state.rankingOverrides,
        dailyWinners: state.dailyWinners,
        yearlyWinner: state.yearlyWinner,
        updatedAt: new Date().toISOString()
    };

    if (db) {
        try {
            await db.ref(DB_PATH).set(data);
            console.log('Saved to RTDB');
        } catch (e) {
            console.error('RTDB save error:', e);
            showToast('保存に失敗しました（クラウド）', true);
        }
    } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
}

// データを読み込み
async function loadData() {
    if (db) {
        // 認証がまだ完了していない場合は待機（onAuthStateChangedで呼ばれる）
        if (!firebase.auth().currentUser) {
            console.log('Waiting for auth to load data...');
            return;
        }

        // 既存のリスナーがあれば解除（重複防止）
        db.ref(DB_PATH).off();

        // リアルタイム同期を設定
        db.ref(DB_PATH).on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // データを統合
                state.players = data.players || state.players;
                state.games = data.games || [];
                state.fund = data.fund || 0;
                state.lastGameType = data.lastGameType || 'パねぇ！';
                state.rankingOverrides = data.rankingOverrides || {};
                state.dailyWinners = data.dailyWinners || {};
                state.yearlyWinner = data.yearlyWinner || {};


                console.log('Synced from RTDB');
                updateAllDisplays();
                window.dispatchEvent(new Event('playersUpdated'));
            } else {
                // データが無い場合は初期作成
                saveData();
            }
        }, (error) => {
            console.error('RTDB sync error:', error);
            showToast('データ読込エラー: ' + error.message, true); // エラー理由を表示
            loadFromLocal();
        });
    } else {
        loadFromLocal();
    }
}

function loadFromLocal() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const data = JSON.parse(stored);
        state.players = data.players || state.players;
        state.games = data.games || [];
        state.fund = data.fund || state.fund;
        state.lastGameType = data.lastGameType || state.lastGameType;
        state.rankingOverrides = data.rankingOverrides || {};
        state.dailyWinners = data.dailyWinners || {};
        state.yearlyWinner = data.yearlyWinner || {};
    }
    updateAllDisplays();
}

// 互換性維持のためのラップ関数
function saveToStorage() {
    saveData();
}

// =============================================
// ユーティリティ
// =============================================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatFullDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// =============================================
// タブ切り替え
// =============================================
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`${tabId}-tab`).classList.add('active');

            // グラフの再描画
            if (tabId === 'stats') {
                setTimeout(updateCharts, 100);
            }
        });
    });
}

// =============================================
// 年選択
// =============================================
function initYearSelector() {
    const prevBtn = document.getElementById('prevYear');
    const nextBtn = document.getElementById('nextYear');
    const yearDisplay = document.getElementById('currentYear');

    function updateYear() {
        yearDisplay.textContent = state.currentYear;
        updateAllDisplays();
    }

    prevBtn.addEventListener('click', () => {
        state.currentYear--;
        updateYear();
    });

    nextBtn.addEventListener('click', () => {
        state.currentYear++;
        updateYear();
    });

    updateYear();
}

// =============================================
// 得点入力フォーム
// =============================================
function initScoreInput() {
    const grid = document.getElementById('scoreInputGrid');
    const dateInput = document.getElementById('gameDate');
    const typeSelect = document.getElementById('gameType');
    const openGameCheckbox = document.getElementById('openGameMode');
    const clearBtn = document.getElementById('clearInputs');
    const saveBtn = document.getElementById('saveGame');

    // 今日の日付をセット
    dateInput.value = new Date().toISOString().split('T')[0];

    // 前回選択したタイプをセット
    typeSelect.value = state.lastGameType;

    // プレイヤー入力フィールドを生成
    function renderInputFields() {
        grid.innerHTML = state.players.map(player => `
            <div class="player-input">
                <label>${player}</label>
                <input type="number" 
                       data-player="${player}" 
                       placeholder="0" 
                       min="0" 
                       inputmode="numeric">
            </div>
        `).join('');
    }

    renderInputFields();

    // クリアボタン
    clearBtn.addEventListener('click', () => {
        grid.querySelectorAll('input').forEach(inp => inp.value = '');
        // 時間入力もクリア
        document.getElementById('gameMinutes').value = '';
        document.getElementById('gameSeconds').value = '';
        // ストップウォッチをリセット
        if (typeof resetStopwatch === 'function') {
            resetStopwatch();
        }
    });

    // 保存ボタン
    saveBtn.addEventListener('click', () => {
        const scores = {};
        let hasScore = false;

        grid.querySelectorAll('input').forEach(inp => {
            const player = inp.dataset.player;
            const value = parseInt(inp.value) || 0;
            scores[player] = value;
            if (value > 0) hasScore = true;
        });

        // 少なくとも一人は0点（勝者）である必要がある
        const hasWinner = Object.values(scores).some(s => s === 0);

        if (!hasWinner && !hasScore) {
            showToast('得点を入力してください', true);
            return;
        }

        // 選択したタイプを保存
        state.lastGameType = typeSelect.value;

        // 経過時間を取得
        const minutes = parseInt(document.getElementById('gameMinutes').value) || 0;
        const seconds = parseInt(document.getElementById('gameSeconds').value) || 0;

        const game = {
            id: generateId(),
            date: dateInput.value,
            type: typeSelect.value,
            isOpen: openGameCheckbox.checked, // オープンゲームフラグ
            scores: scores,
            duration: (minutes > 0 || seconds > 0) ? { minutes, seconds } : null
        };

        state.games.push(game);
        saveToStorage();

        // 入力をクリア
        grid.querySelectorAll('input').forEach(inp => inp.value = '');
        // 時間入力もクリア
        document.getElementById('gameMinutes').value = '';
        document.getElementById('gameSeconds').value = '';
        // ストップウォッチをリセット
        if (typeof resetStopwatch === 'function') {
            resetStopwatch();
        }

        if (openGameCheckbox.checked) {
            showToast('オープンゲームを記録しました！（統計には換算されません）');
        } else {
            showToast('ゲームを記録しました！');
        }
        updateAllDisplays();
    });

    // プレイヤー追加時にフィールドを更新
    window.addEventListener('playersUpdated', renderInputFields);
}

// =============================================
// 直近のゲーム表示
// =============================================
function updateRecentGames() {
    const header = document.getElementById('recentGamesHeader');
    const body = document.getElementById('recentGamesBody');
    if (!header || !body) return;

    // オープンゲームも含めて全データを取得
    const yearGames = state.games.filter(game => {
        const gameYear = new Date(game.date).getFullYear();
        return gameYear === state.currentYear;
    });

    // 追加順（新しい順）にソートして先頭5件
    // IDはタイムスタンプベースなので、ID降順で最新が先になる
    const recent = [...yearGames].sort((a, b) => {
        // IDを数値に変換して比較（降順）
        const idA = parseInt(a.id.split('')[0], 36);
        const idB = parseInt(b.id.split('')[0], 36);
        // より長いIDを持つ方が新しい（Date.now()ベース）
        return b.id.localeCompare(a.id);
    }).slice(0, 5);

    if (recent.length === 0) {
        body.innerHTML = '<tr><td colspan="100" style="text-align:center; padding: 2rem; color: var(--text-muted);">まだゲーム記録がありません</td></tr>';
        header.innerHTML = '';
        return;
    }

    // ヘッダー生成
    header.innerHTML = `
        <tr>
            <th class="sticky-col">日付</th>
            <th style="width: 50px;">⏱️</th>
            ${state.players.map(p => `<th>${p}</th>`).join('')}
        </tr>
    `;

    // ボディ生成
    body.innerHTML = recent.map(game => {
        const scores = state.players.map(p => ({
            name: p,
            score: game.scores[p] || 0
        }));

        const minScore = Math.min(...scores.map(s => s.score));
        const maxScore = Math.max(...scores.map(s => s.score));

        const isOpen = game.isOpen === true;
        const typeBadge = game.type === 'パねぇ！' ? 'paney' : (game.type === 'パーチー' ? 'party' : 'normal');

        const cells = state.players.map(player => {
            const score = game.scores[player] || 0;
            let className = '';

            if (!isOpen) {
                if (score === minScore) className = 'cell-winner';
                else if (score === maxScore && maxScore !== minScore) className = 'cell-loser';
            }
            return `<td class="${className}">${score}</td>`;
        }).join('');

        // 経過時間の表示
        const durationDisplay = game.duration
            ? `${game.duration.minutes}:${game.duration.seconds.toString().padStart(2, '0')}`
            : '-';

        return `
            <tr style="${isOpen ? 'background-color: rgba(0,0,0,0.02);' : ''}">
                <td class="sticky-col">
                    <div style="font-size: 0.8rem; line-height: 1.2; white-space: nowrap;">
                        ${formatDate(game.date)} <span class="type-badge ${typeBadge}" style="font-size: 0.65rem;">${game.type || 'パねぇ！'}</span>${isOpen ? ' <span style="font-size: 0.65rem; color: var(--text-muted);">Open</span>' : ''}
                    </div>
                </td>
                <td class="time-cell">${durationDisplay}</td>
                ${cells}
            </tr>
        `;
    }).join('');
}

// =============================================
// 記録一覧テーブル
// =============================================
function getGamesForYear(year, excludeOpen = false) {
    let filtered = state.games.filter(game => {
        const gameYear = new Date(game.date).getFullYear();
        if (gameYear !== year) return false;
        if (excludeOpen && game.isOpen) return false;
        return true;
    });

    // ソート（降順または昇順）
    filtered.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return state.sortDesc ? (dateB - dateA) : (dateA - dateB);
    });

    return filtered;
}


function updateScoreTable() {
    const header = document.getElementById('tableHeader');
    const body = document.getElementById('tableBody');
    const foot = document.getElementById('tableFoot');
    const countDisplay = document.getElementById('gameCount');
    const sortBtn = document.getElementById('sortDateBtn');

    if (sortBtn) {
        sortBtn.textContent = state.sortDesc ? '📅 日付順 (新しい順)' : '📅 日付順 (古い順)';
        // イベントリスナーの多重登録を防ぐため、HTML側でonclickを設定するか、ここで毎回クローンする手法があるが、
        // 今回はinitDataManagementあたりで一度だけ設定するのが綺麗。しかしここでも表示更新が必要。
    }

    const yearGames = getGamesForYear(state.currentYear);
    const validGames = yearGames.filter(g => !g.isOpen);
    const openGamesCount = yearGames.length - validGames.length;

    countDisplay.textContent = `${yearGames.length}ゲーム` + (openGamesCount > 0 ? ` (うちオープン${openGamesCount})` : '');

    // ヘッダー生成（幅固定用の隠しヘッダー）
    // table-layout: fixedを機能させるため、theadに列幅定義用の行を配置する
    header.innerHTML = `
        <th style="width: 80px; height: 0; padding: 0; border: none; visibility: hidden;"></th>
        <th style="width: 80px; height: 0; padding: 0; border: none; visibility: hidden;"></th>
        ${state.players.map(p => '<th style="height: 0; padding: 0; border: none; visibility: hidden;"></th>').join('')}
        <th style="height: 0; padding: 0; border: none; visibility: hidden;"></th>
    `;

    if (yearGames.length === 0) {
        body.innerHTML = `
            <tr>
                <td colspan="${state.players.length + 3}" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    ${state.currentYear}年のゲーム記録がありません
                </td>
            </tr>
        `;
        foot.innerHTML = '';
        return;
    }

    // ========== 年間合計の計算（一番上に表示用）==========
    const yearTotals = {};
    state.players.forEach(player => {
        yearTotals[player] = validGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
    });

    const yearScores = Object.values(yearTotals);
    const yearMin = Math.min(...yearScores);
    const yearMax = Math.max(...yearScores);

    const yearZeroPlayers = state.players.filter(p => yearTotals[p] === 0);
    const hasYearZeroTie = yearMin === 0 && yearZeroPlayers.length > 1;
    const yearlyWinner = state.yearlyWinner[state.currentYear];

    const yearCells = state.players.map(player => {
        const score = yearTotals[player];
        let className = '';
        let content = score.toLocaleString();
        let onclickAttr = '';
        let styleAttr = '';

        if (hasYearZeroTie && score === 0) {
            if (yearlyWinner === player) {
                className = 'cell-winner';
                content = `<span style="font-size:inherit;">${score.toLocaleString()}</span><span style="font-size:0.6rem; display:block; margin-top:-2px;">★勝者</span>`;
            } else if (yearlyWinner) {
                className = '';
            } else {
                className = 'cell-winner cell-choice-needed';
            }
            onclickAttr = `onclick="toggleYearlyWinner('${state.currentYear}', '${player}')"`;
            styleAttr = 'cursor: pointer;';
        } else if (score === yearMin) {
            className = 'cell-winner';
        } else if (score === yearMax && yearMax !== yearMin) {
            className = 'cell-loser';
        }

        return `<td class="${className}" style="${styleAttr}" ${onclickAttr}>${content}</td>`;
    }).join('');

    // ========== 日付別合計一覧の計算 ==========
    const gamesByDate = {};
    yearGames.forEach(game => {
        if (!gamesByDate[game.date]) {
            gamesByDate[game.date] = [];
        }
        gamesByDate[game.date].push(game);
    });

    // 日付別合計一覧（昇順：1月→12月）
    const datesAsc = Object.keys(gamesByDate).sort((a, b) => new Date(a) - new Date(b));

    let datesSummaryRows = [];
    datesAsc.forEach(date => {
        const dailyGames = gamesByDate[date].filter(g => !g.isOpen);
        if (dailyGames.length === 0) return;

        const dailyTotals = {};
        state.players.forEach(player => {
            dailyTotals[player] = dailyGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
        });

        const dailyScores = Object.values(dailyTotals);
        const dailyMin = Math.min(...dailyScores);
        const dailyMax = Math.max(...dailyScores);

        const zeroPlayers = state.players.filter(p => dailyTotals[p] === 0);
        const hasZeroTie = dailyMin === 0 && zeroPlayers.length > 1;
        const dailyWinner = state.dailyWinners[date];

        const dailyCells = state.players.map(player => {
            const score = dailyTotals[player];
            let className = '';
            let content = score.toString();
            let onclickAttr = '';
            let styleAttr = '';

            if (hasZeroTie && score === 0) {
                if (dailyWinner === player) {
                    className = 'cell-winner';
                    content = `<span style="font-size:inherit;">${score}</span><span style="font-size:0.5rem; display:block; margin-top:-2px;">★</span>`;
                } else if (dailyWinner) {
                    className = '';
                } else {
                    className = 'cell-winner cell-choice-needed';
                }
                onclickAttr = `onclick="toggleDailyWinner('${date}', '${player}')"`;
                styleAttr = 'cursor: pointer;';
            } else if (score === dailyMin) {
                className = 'cell-winner';
            } else if (score === dailyMax && dailyMax !== dailyMin) {
                className = 'cell-loser';
            }

            return `<td class="${className}" style="${styleAttr}" ${onclickAttr}>${content}</td>`;
        }).join('');

        datesSummaryRows.push(`
            <tr class="date-summary-row">
                <td colspan="2" style="text-align: left; padding-left: 0.5rem;">${formatDate(date)}</td>
                ${dailyCells}
                <td></td>
            </tr>
        `);
    });

    // ========== テーブルボディ生成（年間合計→日付別一覧→詳細） ==========
    let rows = [];

    // 1. 年間合計（一番上）
    rows.push(`
        <tr class="column-header-row" style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">
            <th style="padding: 0.5rem; width: 80px;"></th>
            <th style="padding: 0.5rem; width: 80px;"></th>
            ${state.players.map(p => `<th style="padding: 0.5rem;">${p}</th>`).join('')}
            <th style="padding: 0.5rem;"></th>
        </tr>
        <tr class="yearly-total-row">
            <td colspan="2">🏆 年間合計</td>
            ${yearCells}
            <td></td>
        </tr>
    `);

    // 2. 日付別合計一覧（昇順）
    if (datesSummaryRows.length > 0) {
        rows.push(`
            <tr style="height: 10px;"><td colspan="${state.players.length + 3}" style="border: none;"></td></tr>
            <tr class="section-header-row">
                <td colspan="${state.players.length + 3}" style="background: var(--bg-secondary); font-weight: 600; padding: 0.5rem;">
                    📊 日付別合計一覧
                </td>
            </tr>
            <tr class="column-header-row" style="background: var(--bg-tertiary); font-size: 0.85rem;">
                <th colspan="2" style="padding: 0.3rem;">日付</th>
                ${state.players.map(p => `<th style="padding: 0.3rem;">${p}</th>`).join('')}
                <th></th>
            </tr>
        `);
        rows.push(...datesSummaryRows);
    }

    // 3. 個別ゲーム記録（既存のロジック）
    rows.push(`
        <tr style="height: 20px;"><td colspan="${state.players.length + 3}" style="border: none;"></td></tr>
        <tr class="section-header-row">
            <td colspan="${state.players.length + 3}" style="background: var(--bg-secondary); font-weight: 600; padding: 0.5rem;">
                📋 ゲーム記録詳細
            </td>
        </tr>
    `);

    // 日付キーのソート（ユーザー選択順）
    const sortedDates = Object.keys(gamesByDate).sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return state.sortDesc ? (dateB - dateA) : (dateA - dateB);
    });

    sortedDates.forEach(date => {
        const dailyGames = gamesByDate[date];
        let dailyGameNumber = 1;

        const dayType = dailyGames[0]?.type || 'パねぇ！';
        const typeBadgeClass = dayType === 'パーチー' ? 'type-party' : (dayType === '普通' ? 'type-normal' : 'type-panee');
        rows.push(`
            <tr class="date-header-row">
                <td colspan="${state.players.length + 3}">
                    📅 ${formatFullDate(date)}
                    <span class="type-badge ${typeBadgeClass}" style="margin-left: 0.5rem;">${dayType}</span>
                </td>
            </tr>
            <tr class="column-header-row" style="background: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">
                <th style="padding: 0.5rem; width: 80px;">#</th>
                <th style="padding: 0.5rem; width: 80px;">⏱️</th>
                ${state.players.map(p => `<th style="padding: 0.5rem;">${p}</th>`).join('')}
                <th style="padding: 0.5rem;">操作</th>
            </tr>
        `);

        dailyGames.forEach((game, idx) => {
            const scores = state.players.map(p => game.scores[p] || 0);
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);

            const isOpen = game.isOpen === true;
            const rowClass = isOpen ? 'open-game-row' : '';

            const winners = state.players.filter(p => (game.scores[p] || 0) === 0);
            const hasMultipleZeroers = winners.length > 1;

            const cells = state.players.map(player => {
                const score = game.scores[player] || 0;
                let className = '';
                let onclickAttr = '';
                let styleAttr = '';

                if (!isOpen) {
                    if (hasMultipleZeroers && score === 0) {
                        styleAttr = 'cursor: pointer; position: relative;';
                        onclickAttr = `onclick="toggleWinner('${game.id}', '${player}')"`;

                        if (game.trueWinner) {
                            if (game.trueWinner === player) {
                                className = 'cell-winner';
                            } else {
                                className = '';
                            }
                        } else {
                            className = 'cell-winner cell-choice-needed';
                        }
                    } else {
                        if (score === minScore) {
                            className = 'cell-winner';
                        } else if (score === maxScore && maxScore !== minScore) {
                            className = 'cell-loser';
                        }
                    }
                }

                let content = `<span style="font-size:inherit;">${score}</span>`;
                if (className.includes('cell-choice-needed')) {
                    content += '<span style="font-size:0.5rem; display:block; opacity:0.7; margin-top:-3px;">👈選ぶ</span>';
                }
                if (game.trueWinner === player) {
                    content += '<span style="font-size:0.5rem; display:block; margin-top:-3px;">★勝者</span>';
                }

                return `<td class="${className}" style="${styleAttr}" ${onclickAttr}>${content}</td>`;
            }).join('');

            const durationDisplay = game.duration
                ? `${game.duration.minutes}:${game.duration.seconds.toString().padStart(2, '0')}`
                : '-';

            rows.push(`
                <tr class="${rowClass}" style="${isOpen ? 'background-color: rgba(0,0,0,0.02); color: var(--text-muted);' : ''}">
                    <td>${dailyGameNumber++}</td>
                    <td class="time-cell">${durationDisplay}${isOpen ? '<span style="display:block; font-size: 0.6rem; color: var(--text-muted);">Open</span>' : ''}</td>
                    ${cells}
                    <td>
                        <button class="btn-icon" onclick="deleteGame('${game.id}')" title="削除">🗑️</button>
                    </td>
                </tr>
            `);
        });

        // 日計（オープンゲームを除く）
        const validDailyGames = dailyGames.filter(g => !g.isOpen);
        if (validDailyGames.length > 0) {
            const dailyTotals = {};
            state.players.forEach(player => {
                dailyTotals[player] = validDailyGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
            });

            const dailyScores = Object.values(dailyTotals);
            const dailyMin = Math.min(...dailyScores);
            const dailyMax = Math.max(...dailyScores);

            const zeroPlayers = state.players.filter(p => dailyTotals[p] === 0);
            const hasZeroTie = dailyMin === 0 && zeroPlayers.length > 1;
            const dailyWinner = state.dailyWinners[date];

            const dailyCells = state.players.map(player => {
                const score = dailyTotals[player];
                let className = '';
                let content = score.toString();
                let onclickAttr = '';
                let styleAttr = '';

                if (hasZeroTie && score === 0) {
                    if (dailyWinner === player) {
                        className = 'cell-winner';
                        content = `<span style="font-size:inherit;">${score}</span><span style="font-size:0.6rem; display:block; margin-top:-2px;">★勝者</span>`;
                    } else if (dailyWinner) {
                        className = '';
                    } else {
                        className = 'cell-winner cell-choice-needed';
                    }
                    onclickAttr = `onclick="toggleDailyWinner('${date}', '${player}')"`;
                    styleAttr = 'cursor: pointer;';
                } else if (score === dailyMin) {
                    className = 'cell-winner';
                } else if (score === dailyMax && dailyMax !== dailyMin) {
                    className = 'cell-loser';
                }

                return `<td class="${className}" style="${styleAttr}" ${onclickAttr}>${content}</td>`;
            }).join('');

            rows.push(`
                <tr class="daily-total-row">
                    <td colspan="2">📊 合計</td>
                    ${dailyCells}
                    <td></td>
                </tr>
            `);
        }
    });

    body.innerHTML = rows.join('');
    foot.innerHTML = ''; // フッターは不要に
}

// ゲーム削除
window.deleteGame = function (gameId) {
    showConfirmModal('ゲームを削除', 'このゲーム記録を削除しますか？', () => {
        state.games = state.games.filter(g => g.id !== gameId);
        saveToStorage();
        showToast('ゲームを削除しました');
        updateAllDisplays();
    });
};

// 真の勝者を切り替え
window.toggleWinner = function (gameId, playerName) {
    const gameIndex = state.games.findIndex(g => g.id === gameId);
    if (gameIndex === -1) return;

    const game = state.games[gameIndex];

    // 既にこの人が真の勝者の場合は解除
    if (game.trueWinner === playerName) {
        delete game.trueWinner;
        showToast('勝者指定を解除しました（全員ハイライトします）');
    } else {
        // 設定
        game.trueWinner = playerName;
        showToast(`${playerName}を勝者に指定しました！`);
    }

    // 保存して更新
    state.games[gameIndex] = game;
    saveToStorage();
    updateScoreTable(); // テーブルのみ更新で十分
};

// 日別合計の勝者を切り替え
window.toggleDailyWinner = function (date, playerName) {
    // 既にこの人が勝者の場合は解除
    if (state.dailyWinners[date] === playerName) {
        delete state.dailyWinners[date];
        showToast('日別勝者指定を解除しました');
    } else {
        // 設定
        state.dailyWinners[date] = playerName;
        showToast(`${playerName}を日別勝者に指定しました！`);
    }

    saveToStorage();
    updateScoreTable();
};

// 年間合計の勝者を切り替え
window.toggleYearlyWinner = function (year, playerName) {
    // 既にこの人が勝者の場合は解除
    if (state.yearlyWinner[year] === playerName) {
        delete state.yearlyWinner[year];
        showToast('年間勝者指定を解除しました');
    } else {
        // 設定
        state.yearlyWinner[year] = playerName;
        showToast(`${playerName}を年間勝者に指定しました！`);
    }

    saveToStorage();
    updateScoreTable();
};

// ゲームタイプを循環変更
window.cycleGameType = function (gameId) {
    const gameIndex = state.games.findIndex(g => g.id === gameId);
    if (gameIndex === -1) return;

    const game = state.games[gameIndex];
    const types = ['パねぇ！', 'パーチー', '普通'];
    const currentIndex = types.indexOf(game.type || 'パねぇ！');
    const nextIndex = (currentIndex + 1) % types.length;

    game.type = types[nextIndex];
    state.games[gameIndex] = game;

    saveToStorage();
    updateScoreTable();
    showToast(`種類を「${game.type}」に変更しました`);
};

// =============================================
// ランキング表示
// =============================================
function updateRanking() {
    updateDailyRanking();
    updateYearlyRanking();
}


// 同点対応のソート関数
function getSortedRankingWithOverrides(totals, overrideKey) {
    return Object.entries(totals).sort((a, b) => {
        // まずスコアで比較（昇順）
        if (a[1] !== b[1]) return a[1] - b[1];

        // スコアが同じ場合、Override設定を確認
        const overrides = state.rankingOverrides[overrideKey] || [];
        const idxA = overrides.indexOf(a[0]);
        const idxB = overrides.indexOf(b[0]);

        // 両方ともOverride設定にある場合、その順序に従う
        if (idxA !== -1 && idxB !== -1) {
            return idxA - idxB;
        }

        // 設定がない場合は名前順などで安定させる（あるいはそのまま）
        return 0;
    });
}

function updateDailyRanking() {
    const container = document.getElementById('dailyRankingGrid');
    if (!container) return;

    const yearGames = getGamesForYear(state.currentYear, true); // オープンゲーム除外

    if (yearGames.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">データがありません</p>';
        return;
    }

    // 最新の日付を取得（日付オブジェクトとして比較して最も新しい日付を取得）
    const uniqueDates = [...new Set(yearGames.map(g => g.date))];
    const latestDate = uniqueDates.reduce((latest, current) => {
        return new Date(current) > new Date(latest) ? current : latest;
    }, uniqueDates[0]);
    const dailyGames = yearGames.filter(g => g.date === latestDate);

    // 日別合計を計算
    const totals = {};
    state.players.forEach(player => {
        totals[player] = dailyGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
    });

    // ソートしてランキング作成（オーバーライド対応）
    const overrideKey = `daily_${latestDate}`;
    const sorted = getSortedRankingWithOverrides(totals, overrideKey);

    // 調整ボタン
    const buttonHtml = `<button onclick="showRankingEditor('daily', '${latestDate}')" class="btn btn-secondary btn-sm" style="white-space:nowrap;">⚡ 調整</button>`;

    // タイトル横に日付を表示
    const dateSpan = document.getElementById('dailyRankingDate');
    if (dateSpan) {
        dateSpan.textContent = formatDate(latestDate);
    }

    // 直近のゲーム結果と同じスタイルのテーブル形式
    container.innerHTML = `
        <div class="recent-games-container">
            <table class="recent-games-table">
                <thead>
                    <tr>
                        ${sorted.map(([name], i) => {
        let icon = '';
        if (i === 0) icon = '🥇';
        else if (i === sorted.length - 1 && sorted.length > 1) icon = '😢';
        return `<th>${icon}${name}</th>`;
    }).join('')}
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        ${sorted.map(([name, score], i) => {
        let cls = '';
        if (i === 0) cls = 'cell-winner';
        else if (i === sorted.length - 1 && sorted.length > 1) cls = 'cell-loser';
        return `<td class="${cls}">${score.toLocaleString()}</td>`;
    }).join('')}
                        <td>${buttonHtml}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

function updateYearlyRanking() {
    const container = document.getElementById('yearlyRankingGrid');
    if (!container) return;

    const yearGames = getGamesForYear(state.currentYear, true); // オープンゲーム除外

    if (yearGames.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">データがありません</p>';
        return;
    }

    // 年間合計を計算
    const totals = {};
    state.players.forEach(player => {
        totals[player] = yearGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
    });

    // ソートしてランキング作成（オーバーライド対応）
    const overrideKey = `yearly_${state.currentYear}`;
    const sorted = getSortedRankingWithOverrides(totals, overrideKey);

    // 調整ボタン
    const buttonHtml = `<button onclick="showRankingEditor('yearly', '${state.currentYear}')" class="btn btn-secondary btn-sm" style="white-space:nowrap;">⚡ 調整</button>`;

    // 直近のゲーム結果と同じスタイルのテーブル形式
    container.innerHTML = `
        <div class="recent-games-container">
            <table class="recent-games-table">
                <thead>
                    <tr>
                        ${sorted.map(([name], i) => {
        let icon = '';
        if (i === 0) icon = '🥇';
        else if (i === sorted.length - 1 && sorted.length > 1) icon = '😢';
        return `<th>${icon}${name}</th>`;
    }).join('')}
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        ${sorted.map(([name, score], i) => {
        let cls = '';
        if (i === 0) cls = 'cell-winner';
        else if (i === sorted.length - 1 && sorted.length > 1) cls = 'cell-loser';
        return `<td class="${cls}">${score.toLocaleString()}</td>`;
    }).join('')}
                        <td>${buttonHtml}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// =============================================
// 統計・グラフ
// =============================================
function updateCharts() {
    updateLineChart();
    updateWinLossChart();
    updateBarChart();
    updateSummary();
}

function updateLineChart() {
    const ctx = document.getElementById('lineChart');
    const selector = document.getElementById('chartDateSelector');
    if (!ctx) return;

    // グラフ用は常に古い順（昇順）でソート
    let allYearGames = state.games.filter(game => {
        const gameYear = new Date(game.date).getFullYear();
        if (gameYear !== state.currentYear) return false;
        if (game.isOpen) return false; // オープンゲーム除外
        return true;
    });
    allYearGames.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 日付のリストを取得
    const dates = [...new Set(allYearGames.map(g => g.date))].sort();

    // セレクタを更新
    if (selector) {
        const currentValue = selector.value;
        selector.innerHTML = '<option value="all">📅 年間全体</option>';
        dates.forEach(date => {
            const d = new Date(date);
            const label = `${d.getMonth() + 1}/${d.getDate()}`;
            selector.innerHTML += `<option value="${date}">${label}</option>`;
        });

        // 直近の日付をデフォルトに（初回のみ）
        if (!state.chartSelectedDate && dates.length > 0) {
            state.chartSelectedDate = dates[dates.length - 1]; // 直近の日付
        }

        // 選択値を復元
        if (state.chartSelectedDate && dates.includes(state.chartSelectedDate)) {
            selector.value = state.chartSelectedDate;
        } else if (currentValue === 'all' || !state.chartSelectedDate) {
            selector.value = state.chartSelectedDate || (dates.length > 0 ? dates[dates.length - 1] : 'all');
            state.chartSelectedDate = selector.value;
        }

        // イベントリスナー（重複防止）
        selector.onchange = () => {
            state.chartSelectedDate = selector.value;
            updateLineChart();
        };
    }

    // 選択日付でフィルタ
    let yearGames = allYearGames;
    if (state.chartSelectedDate && state.chartSelectedDate !== 'all') {
        yearGames = allYearGames.filter(g => g.date === state.chartSelectedDate);
    }

    if (state.charts.line) {
        state.charts.line.destroy();
    }

    if (yearGames.length === 0) {
        return;
    }

    // 累計得点を計算
    const cumulative = {};
    state.players.forEach(p => cumulative[p] = []);

    let runningTotal = {};
    state.players.forEach(p => runningTotal[p] = 0);

    yearGames.forEach(game => {
        state.players.forEach(player => {
            runningTotal[player] += game.scores[player] || 0;
            cumulative[player].push(runningTotal[player]);
        });
    });

    state.charts.line = new Chart(ctx, {
        type: 'line',
        data: {
            labels: yearGames.map((_, i) => `G${i + 1}`),
            datasets: state.players.map((player, idx) => ({
                label: player,
                data: cumulative[player],
                borderColor: getChartColor(idx),
                backgroundColor: getChartColor(idx) + '20',
                tension: 0,
                fill: false
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#4a4a6a',
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#4a4a6a' },
                    grid: { color: 'rgba(0,0,0,0.08)' }
                },
                y: {
                    ticks: { color: '#4a4a6a' },
                    grid: { color: 'rgba(0,0,0,0.08)' }
                }
            }
        }
    });
}

function updateWinLossChart() {
    const ctx = document.getElementById('winLossChart');
    const selector = document.getElementById('winLossDateSelector');
    if (!ctx) return;

    // グラフ用は常に古い順（昇順）でソート
    let allYearGames = state.games.filter(game => {
        const gameYear = new Date(game.date).getFullYear();
        if (gameYear !== state.currentYear) return false;
        if (game.isOpen) return false; // オープンゲーム除外
        return true;
    });
    allYearGames.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 日付のリストを取得
    const dates = [...new Set(allYearGames.map(g => g.date))].sort();

    // セレクタを更新
    if (selector) {
        const currentValue = selector.value;
        selector.innerHTML = '<option value="all">📅 年間全体</option>';
        dates.forEach(date => {
            const d = new Date(date);
            const label = `${d.getMonth() + 1}/${d.getDate()}`;
            selector.innerHTML += `<option value="${date}">${label}</option>`;
        });

        // 直近の日付をデフォルトに（初回のみ）
        if (!state.winLossSelectedDate && dates.length > 0) {
            state.winLossSelectedDate = dates[dates.length - 1]; // 直近の日付
        }

        // 選択値を復元
        if (state.winLossSelectedDate && dates.includes(state.winLossSelectedDate)) {
            selector.value = state.winLossSelectedDate;
        } else if (currentValue === 'all' || !state.winLossSelectedDate) {
            selector.value = state.winLossSelectedDate || (dates.length > 0 ? dates[dates.length - 1] : 'all');
            state.winLossSelectedDate = selector.value;
        }

        // イベントリスナー（重複防止）
        selector.onchange = () => {
            state.winLossSelectedDate = selector.value;
            updateWinLossChart();
        };
    }

    // 選択日付でフィルタ
    let yearGames = allYearGames;
    if (state.winLossSelectedDate && state.winLossSelectedDate !== 'all') {
        yearGames = allYearGames.filter(g => g.date === state.winLossSelectedDate);
    }

    if (state.charts.winLoss) {
        state.charts.winLoss.destroy();
    }

    if (yearGames.length === 0) {
        return;
    }

    // 勝利数と敗北数をカウント
    const wins = {};
    const losses = {};
    state.players.forEach(p => {
        wins[p] = 0;
        losses[p] = 0;
    });

    yearGames.forEach(game => {
        const scores = state.players.map(p => ({ player: p, score: game.scores[p] || 0 }));
        const minScore = Math.min(...scores.map(s => s.score));
        const maxScore = Math.max(...scores.map(s => s.score));

        scores.forEach(s => {
            if (s.score === minScore) wins[s.player]++;
            if (s.score === maxScore && maxScore !== minScore) losses[s.player]++;
        });
    });

    state.charts.winLoss = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: state.players,
            datasets: [
                {
                    label: '勝利数',
                    data: state.players.map(p => wins[p]),
                    backgroundColor: 'rgba(255, 140, 0, 0.7)',
                    borderColor: '#ff8c00',
                    borderWidth: 2
                },
                {
                    label: '敗北数',
                    data: state.players.map(p => losses[p]),
                    backgroundColor: 'rgba(0, 212, 255, 0.7)',
                    borderColor: '#00d4ff',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#4a4a6a' }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.dataset.label}: ${context.raw}回`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#4a4a6a' },
                    grid: { color: 'rgba(0,0,0,0.08)' }
                },
                y: {
                    ticks: {
                        color: '#4a4a6a',
                        stepSize: 1
                    },
                    grid: { color: 'rgba(0,0,0,0.08)' },
                    beginAtZero: true
                }
            }
        }
    });
}

function updateBarChart() {
    const ctx = document.getElementById('barChart');
    const selector = document.getElementById('barDateSelector');
    if (!ctx) return;

    // グラフ用は常に古い順（昇順）でソート
    let allYearGames = state.games.filter(game => {
        const gameYear = new Date(game.date).getFullYear();
        if (gameYear !== state.currentYear) return false;
        if (game.isOpen) return false; // オープンゲーム除外
        return true;
    });
    allYearGames.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 日付のリストを取得
    const dates = [...new Set(allYearGames.map(g => g.date))].sort();

    // セレクタを更新
    if (selector) {
        const currentValue = selector.value;
        selector.innerHTML = '<option value="all">📅 年間全体</option>';
        dates.forEach(date => {
            const d = new Date(date);
            const label = `${d.getMonth() + 1}/${d.getDate()}`;
            selector.innerHTML += `<option value="${date}">${label}</option>`;
        });

        // 直近の日付をデフォルトに（初回のみ）
        if (!state.barSelectedDate && dates.length > 0) {
            state.barSelectedDate = dates[dates.length - 1]; // 直近の日付
        }

        // 選択値を復元
        if (state.barSelectedDate && dates.includes(state.barSelectedDate)) {
            selector.value = state.barSelectedDate;
        } else if (currentValue === 'all' || !state.barSelectedDate) {
            selector.value = state.barSelectedDate || (dates.length > 0 ? dates[dates.length - 1] : 'all');
            state.barSelectedDate = selector.value;
        }

        // イベントリスナー（重複防止）
        selector.onchange = () => {
            state.barSelectedDate = selector.value;
            updateBarChart();
        };
    }

    // 選択日付でフィルタ
    let yearGames = allYearGames;
    if (state.barSelectedDate && state.barSelectedDate !== 'all') {
        yearGames = allYearGames.filter(g => g.date === state.barSelectedDate);
    }

    if (state.charts.bar) {
        state.charts.bar.destroy();
    }

    if (yearGames.length === 0) {
        return;
    }

    // 平均得点を計算
    const totals = {};
    state.players.forEach(p => {
        totals[p] = yearGames.reduce((sum, game) => sum + (game.scores[p] || 0), 0);
    });

    const avg = {};
    state.players.forEach(p => {
        avg[p] = parseFloat((totals[p] / yearGames.length).toFixed(2));
    });

    state.charts.bar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: state.players,
            datasets: [{
                label: '平均得点',
                data: state.players.map(p => avg[p]),
                backgroundColor: state.players.map((_, i) => getChartColor(i) + '80'),
                borderColor: state.players.map((_, i) => getChartColor(i)),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: { color: '#4a4a6a' },
                    grid: { color: 'rgba(0,0,0,0.08)' }
                },
                y: {
                    ticks: { color: '#4a4a6a' },
                    grid: { color: 'rgba(0,0,0,0.08)' }
                }
            }
        }
    });
}

function updateSummary() {
    const container = document.getElementById('summaryGrid');
    const yearGames = getGamesForYear(state.currentYear, true); // オープンゲーム除外

    if (yearGames.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">データがありません</p>';
        return;
    }

    // 統計計算
    const totals = {};
    const wins = {};
    const losses = {};

    state.players.forEach(p => {
        totals[p] = 0;
        wins[p] = 0;
        losses[p] = 0;
    });

    yearGames.forEach(game => {
        const scores = state.players.map(p => ({ player: p, score: game.scores[p] || 0 }));
        const minScore = Math.min(...scores.map(s => s.score));
        const maxScore = Math.max(...scores.map(s => s.score));

        scores.forEach(s => {
            totals[s.player] += s.score;
            if (s.score === minScore) wins[s.player]++;
            if (s.score === maxScore && maxScore !== minScore) losses[s.player]++;
        });
    });

    // 1位と最下位を特定（複数該当者に対応）
    const sortedTotal = Object.entries(totals).sort((a, b) => a[1] - b[1]);
    const firstScore = sortedTotal[0][1];
    const lastScore = sortedTotal[sortedTotal.length - 1][1];
    const firstPlayers = sortedTotal.filter(([_, s]) => s === firstScore).map(([n, _]) => n);
    const lastPlayers = sortedTotal.filter(([_, s]) => s === lastScore).map(([n, _]) => n);

    // 最多勝利・最多敗北（複数該当者に対応）
    const sortedWins = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    const sortedLosses = Object.entries(losses).sort((a, b) => b[1] - a[1]);
    const maxWinCount = sortedWins[0][1];
    const maxLossCount = sortedLosses[0][1];
    const mostWinsPlayers = sortedWins.filter(([_, w]) => w === maxWinCount);
    const mostLossesPlayers = sortedLosses.filter(([_, l]) => l === maxLossCount);

    // 全員平均
    const totalScore = Object.values(totals).reduce((a, b) => a + b, 0);
    const averageScore = (totalScore / state.players.length / yearGames.length).toFixed(2);

    container.innerHTML = `
        <div class="summary-item">
            <span class="summary-label">🎮 総ゲーム数</span>
            <span class="summary-value">${yearGames.length}</span>
        </div>
        <div class="summary-item winner">
            <span class="summary-label">🏆 年間1位</span>
            <span class="summary-value">${firstPlayers.join('・')}</span>
        </div>
        <div class="summary-item loser">
            <span class="summary-label">😢 年間最下位</span>
            <span class="summary-value">${lastPlayers.join('・')}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">🥇 最多勝利</span>
            <span class="summary-value">${mostWinsPlayers.map(([n, w]) => `${n}(${w}勝)`).join('・')}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">💀 最多敗北</span>
            <span class="summary-value">${mostLossesPlayers.map(([n, l]) => `${n}(${l}敗)`).join('・')}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">📊 全員平均</span>
            <span class="summary-value">${averageScore}</span>
        </div>
    `;
}

// =============================================
// プレイヤー管理
// =============================================
function initPlayerManagement() {
    const list = document.getElementById('playerList');
    const input = document.getElementById('newPlayerName');
    const addBtn = document.getElementById('addPlayer');

    function renderPlayerList() {
        list.innerHTML = state.players.map(player => `
            <div class="player-item">
                <span class="player-name">${player}</span>
                <button class="btn btn-danger btn-sm" onclick="removePlayer('${player}')">削除</button>
            </div>
        `).join('');
    }

    addBtn.addEventListener('click', () => {
        const name = input.value.trim();
        if (!name) {
            showToast('名前を入力してください', true);
            return;
        }
        if (state.players.includes(name)) {
            showToast('同じ名前のプレイヤーが既に存在します', true);
            return;
        }

        state.players.push(name);
        saveToStorage();
        input.value = '';
        renderPlayerList();
        window.dispatchEvent(new Event('playersUpdated'));
        updateAllDisplays(); // 追加: 画面全体の表示を更新する
        showToast(`${name}を追加しました`);
    });

    window.removePlayer = function (name) {
        if (state.players.length <= 2) {
            showToast('最低2人のプレイヤーが必要です', true);
            return;
        }

        showConfirmModal('プレイヤーを削除', `${name}を削除しますか？このプレイヤーの記録も失われます。`, () => {
            state.players = state.players.filter(p => p !== name);
            saveToStorage();
            renderPlayerList();
            window.dispatchEvent(new Event('playersUpdated'));
            updateAllDisplays();
            showToast(`${name}を削除しました`);
        });
    };

    renderPlayerList();
}

// =============================================
// データ管理
// =============================================
function initDataManagement() {
    const exportBtn = document.getElementById('exportData');
    const importBtn = document.getElementById('importData');
    const importFile = document.getElementById('importFile');
    const clearBtn = document.getElementById('clearData');

    // エクスポート
    exportBtn.addEventListener('click', () => {
        const data = {
            players: state.players,
            games: state.games,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `uno_scores_${state.currentYear}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('データをエクスポートしました');
    });

    // インポート
    importBtn.addEventListener('click', () => importFile.click());

    importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);

                if (data.players) state.players = data.players;
                if (data.games) {
                    // 重複を避けて追加
                    const existingIds = new Set(state.games.map(g => g.id));
                    data.games.forEach(game => {
                        if (!existingIds.has(game.id)) {
                            state.games.push(game);
                        }
                    });
                }

                saveToStorage();
                window.dispatchEvent(new Event('playersUpdated'));
                updateAllDisplays();
                showToast('データをインポートしました');
            } catch (err) {
                showToast('ファイルの読み込みに失敗しました', true);
            }
        };
        reader.readAsText(file);
        importFile.value = '';
    });

    // 全削除
    clearBtn.addEventListener('click', () => {
        showConfirmModal('全データを削除', '全てのゲーム記録を削除しますか？この操作は取り消せません。', () => {
            state.games = [];
            saveToStorage();
            updateAllDisplays();
            showToast('全データを削除しました');
        });
    });

    // 今年のデータを削除
    const clearYearBtn = document.getElementById('clearYearData');
    if (clearYearBtn) {
        clearYearBtn.addEventListener('click', () => {
            const yearGames = getGamesForYear(state.currentYear);
            if (yearGames.length === 0) {
                showToast('今年のデータはありません', true);
                return;
            }
            showConfirmModal(
                `${state.currentYear}年のデータを削除`,
                `${state.currentYear}年の${yearGames.length}件のゲーム記録を削除しますか？`,
                () => {
                    state.games = state.games.filter(g => {
                        const gameYear = new Date(g.date).getFullYear();
                        return gameYear !== state.currentYear;
                    });
                    saveToStorage();
                    updateAllDisplays();
                    showToast(`${state.currentYear}年のデータを削除しました`);
                }
            );
        });
    }

    // 日付を選んで削除
    const clearDateBtn = document.getElementById('clearDateData');
    const deleteDatePicker = document.getElementById('deleteDatePicker');
    const deleteDateInput = document.getElementById('deleteDate');
    const confirmDeleteDateBtn = document.getElementById('confirmDeleteDate');
    const cancelDeleteDateBtn = document.getElementById('cancelDeleteDate');

    if (clearDateBtn && deleteDatePicker) {
        clearDateBtn.addEventListener('click', () => {
            deleteDateInput.value = new Date().toISOString().split('T')[0];
            deleteDatePicker.style.display = 'block';
        });

        cancelDeleteDateBtn.addEventListener('click', () => {
            deleteDatePicker.style.display = 'none';
        });

        confirmDeleteDateBtn.addEventListener('click', () => {
            const targetDate = deleteDateInput.value;
            if (!targetDate) {
                showToast('日付を選択してください', true);
                return;
            }

            const dateGames = state.games.filter(g => g.date === targetDate);
            if (dateGames.length === 0) {
                showToast('選択した日付のデータはありません', true);
                return;
            }

            showConfirmModal(
                `${formatFullDate(targetDate)}のデータを削除`,
                `${formatFullDate(targetDate)}の${dateGames.length}件のゲーム記録を削除しますか？`,
                () => {
                    state.games = state.games.filter(g => g.date !== targetDate);
                    saveToStorage();
                    updateAllDisplays();
                    deleteDatePicker.style.display = 'none';
                    showToast(`${formatFullDate(targetDate)}のデータを削除しました`);
                }
            );
        });
    }

    // CSVインポート
    const importCSVBtn = document.getElementById('importCSV');
    const importCSVFile = document.getElementById('importCSVFile');

    if (importCSVBtn && importCSVFile) {
        importCSVBtn.addEventListener('click', () => importCSVFile.click());

        importCSVFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const csvText = event.target.result;
                    const games = parseCSV(csvText);

                    if (games.length === 0) {
                        showToast('インポートするデータがありません', true);
                        return;
                    }

                    // 既存ゲームに追加
                    state.games = state.games.concat(games);
                    saveToStorage();
                    window.dispatchEvent(new Event('playersUpdated'));
                    updateAllDisplays();
                    showToast(`${games.length}件のデータをインポートしました`);
                } catch (err) {
                    console.error(err);
                    showToast('CSVの読み込みに失敗しました', true);
                }
            };
            reader.readAsText(file);
            importCSVFile.value = '';
        });
    }
}

// CSVパース関数
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n').map(line => line.trim());
    if (lines.length < 2) return [];

    // ヘッダー行を解析（プレイヤー名を取得）
    const headerCells = lines[0].split(',').map(cell => cell.trim().replace(/"/g, ''));

    // プレイヤー名の列インデックスを特定
    // フォーマット: 日付, 百合子, 守正, 正久, 千明, 宏子, 健二, タイプ
    const playerNames = [];
    const playerColStart = 1; // 日付の次から

    for (let i = playerColStart; i < headerCells.length; i++) {
        const name = headerCells[i];
        // タイプ列やその他の列をスキップ
        if (name && !['タイプ', '種類', '合計', '累計', ''].includes(name)) {
            playerNames.push({ name, col: i });
        }
    }

    const games = [];
    const currentYear = state.currentYear;

    // データ行を解析
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        const cells = line.split(',').map(cell => cell.trim().replace(/"/g, ''));

        // 日付を取得（A列）
        const dateStr = cells[0];
        if (!dateStr || dateStr === '' || dateStr.includes('累計') || dateStr.includes('順位') || dateStr.includes('1位') || dateStr.includes('最下位') || dateStr.includes('差分')) {
            continue; // サマリー行をスキップ
        }

        // 日付をパース（1/19形式 または 2025/1/19形式）
        let date;
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 2) {
                // 月/日 形式
                const month = parseInt(parts[0]);
                const day = parseInt(parts[1]);
                if (isNaN(month) || isNaN(day)) continue;
                date = `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            } else if (parts.length === 3) {
                // 年/月/日 形式
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]);
                const day = parseInt(parts[2]);
                if (isNaN(year) || isNaN(month) || isNaN(day)) continue;
                date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            } else {
                continue;
            }
        } else {
            continue;
        }

        // スコアを取得
        const scores = {};
        let hasScore = false;

        playerNames.forEach(({ name, col }) => {
            const scoreStr = cells[col];
            const score = parseInt(scoreStr) || 0;
            scores[name] = score;
            if (score > 0) hasScore = true;
        });

        if (!hasScore) continue;

        // タイプを取得（最後の列または「タイプ」列）
        let type = 'パねぇ！';
        const lastCell = cells[cells.length - 1];
        if (lastCell && (lastCell.includes('パネェ') || lastCell.includes('パねぇ'))) {
            type = 'パねぇ！';
        } else if (lastCell && lastCell.includes('パーチー')) {
            type = 'パーチー';
        } else if (lastCell && (lastCell.includes('普通') || lastCell.includes('どっちも'))) {
            type = '普通';
        }

        games.push({
            id: generateId(),
            date: date,
            type: type,
            scores: scores
        });
    }

    return games;
}

// =============================================
// UNO基金
// =============================================
function initFund() {
    const fundInput = document.getElementById('fundAmount');
    const saveBtn = document.getElementById('saveFund');
    const historyContainer = document.getElementById('fundHistory');

    // 初期値をセット
    if (state.fund > 0) {
        fundInput.value = state.fund;
    }

    // 保存ボタン
    saveBtn.addEventListener('click', () => {
        const amount = parseInt(fundInput.value) || 0;
        state.fund = amount;
        saveToStorage();
        showToast(`UNO基金を ¥${amount.toLocaleString()} に更新しました`);
        updateFundDisplay();
    });

    updateFundDisplay();
}

function updateFundDisplay() {
    const historyContainer = document.getElementById('fundHistory');
    const fundInput = document.getElementById('fundAmount');
    if (!historyContainer) return;

    // 入力欄も更新（Firebaseからロードされた値を反映）
    if (fundInput && state.fund > 0) {
        fundInput.value = state.fund;
    }

    if (state.fund > 0) {
        historyContainer.innerHTML = `
            <p>💰 現在の残高: <strong style="color: var(--accent-orange); font-size: 1.2rem;">¥${state.fund.toLocaleString()}</strong></p>
        `;
    } else {
        historyContainer.innerHTML = '<p>まだ基金が登録されていません</p>';
    }
}

// =============================================
// 確認モーダル
// =============================================
let modalCallback = null;

function showConfirmModal(title, message, callback) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    modalCallback = callback;
    modal.classList.add('active');
}

function initModal() {
    const modal = document.getElementById('confirmModal');
    const cancelBtn = document.getElementById('modalCancel');
    const confirmBtn = document.getElementById('modalConfirm');

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        modalCallback = null;
    });

    confirmBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        if (modalCallback) {
            modalCallback();
            modalCallback = null;
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            modalCallback = null;
        }
    });
}

// =============================================
// 表示更新
// =============================================
function updateAllDisplays() {
    updateRecentGames();
    updateScoreTable();
    updateRanking();
    updateFundDisplay(); // UNO基金の表示も更新

    // 統計タブが表示中なら更新
    if (document.getElementById('stats-tab').classList.contains('active')) {
        updateCharts();
    }
}

// =============================================
// 初期化
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    loadData(); // Firestore / LocalStorage からロード
    initTabs();
    initYearSelector();
    initScoreInput();
    initPlayerManagement();
    initDataManagement();
    initFund();
    initModal();
    initRankingEditor();
    initStopwatch();

    // ソートボタンのイベントリスナー
    const sortBtn = document.getElementById('sortDateBtn');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            state.sortDesc = !state.sortDesc;
            updateScoreTable();
        });
    }

    // updateAllDisplaysはロード完了時に呼ばれるのでここでは不要な場合もあるが、初期表示のために呼んでおく
    updateAllDisplays();
});


// =============================================
// ランキング順位編集
// =============================================
let currentEditKey = null;
let currentEditData = []; // [{name, score}, ...]

function initRankingEditor() {
    const modal = document.getElementById('rankingEditorModal');
    const saveBtn = document.getElementById('rankingEditorSave');
    const cancelBtn = document.getElementById('rankingEditorCancel');

    saveBtn.addEventListener('click', () => {
        if (!currentEditKey) return;

        // 現在の順序を保存
        const order = currentEditData.map(d => d.name);
        state.rankingOverrides[currentEditKey] = order;

        saveToStorage();
        updateAllDisplays();
        modal.classList.remove('active');
        showToast('順位を保存しました');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
}

window.showRankingEditor = function (type, keyVal) {
    const modal = document.getElementById('rankingEditorModal');
    const listContainer = document.getElementById('rankingEditorList');

    // データ準備
    let overrideKey = '';
    let totals = {};
    const yearGames = getGamesForYear(state.currentYear, true);

    if (type === 'daily') {
        overrideKey = `daily_${keyVal}`;
        const dailyGames = yearGames.filter(g => g.date === keyVal);
        state.players.forEach(player => {
            totals[player] = dailyGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
        });
    } else {
        overrideKey = `yearly_${keyVal}`;
        state.players.forEach(player => {
            totals[player] = yearGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
        });
    }

    currentEditKey = overrideKey;

    // 現在のソート順（オーバーライド適用）を取得
    const sortedEntries = getSortedRankingWithOverrides(totals, overrideKey);
    currentEditData = sortedEntries.map(([name, score]) => ({ name, score }));

    renderRankingEditorList();
    modal.classList.add('active');
};

function renderRankingEditorList() {
    const listContainer = document.getElementById('rankingEditorList');

    listContainer.innerHTML = currentEditData.map((item, index) => {
        // 前後と比較して同点かどうかチェック
        const isTiePrev = index > 0 && currentEditData[index - 1].score === item.score;
        const isTieNext = index < currentEditData.length - 1 && currentEditData[index + 1].score === item.score;
        const isTie = isTiePrev || isTieNext;

        return `
            <div class="ranking-editor-item ${isTie ? 'is-tie' : ''}">
                <div style="display:flex; align-items:center;">
                    <span style="font-weight:700; width: 1.5rem;">${index + 1}</span>
                    <span>${item.name}</span>
                    <span class="ranking-score-info">${item.score}点</span>
                    ${isTie ? '<span style="font-size:0.75rem; color:var(--accent-orange); margin-left:0.5rem;">●同点</span>' : ''}
                </div>
                <div class="ranking-actions">
                    <button class="ranking-sort-btn" onclick="moveRankingItem(${index}, -1)" ${index === 0 ? 'disabled' : ''}>▲</button>
                    <button class="ranking-sort-btn" onclick="moveRankingItem(${index}, 1)" ${index === currentEditData.length - 1 ? 'disabled' : ''}>▼</button>
                </div>
            </div>
        `;
    }).join('');
}

window.moveRankingItem = function (index, direction) {
    if (index + direction < 0 || index + direction >= currentEditData.length) return;

    // 入れ替え
    const temp = currentEditData[index];
    currentEditData[index] = currentEditData[index + direction];
    currentEditData[index + direction] = temp;

    renderRankingEditorList();
};

// =============================================
// ストップウォッチ機能
// =============================================
let stopwatchInterval = null;
let stopwatchSeconds = 0;
let stopwatchRunning = false;

function initStopwatch() {
    const displayContainer = document.getElementById('stopwatchDisplay');
    const display = document.getElementById('stopwatchTime');

    if (!display || !displayContainer) return;

    function updateDisplay() {
        const mins = Math.floor(stopwatchSeconds / 60);
        const secs = stopwatchSeconds % 60;
        display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // ストップウォッチ表示をタップでトグル（開始/停止）
    displayContainer.addEventListener('click', () => {
        if (stopwatchRunning) {
            // 停止
            stopwatchRunning = false;
            displayContainer.classList.remove('running');

            if (stopwatchInterval) {
                clearInterval(stopwatchInterval);
                stopwatchInterval = null;
            }

            // 自動で時間入力欄に反映
            const mins = Math.floor(stopwatchSeconds / 60);
            const secs = stopwatchSeconds % 60;
            document.getElementById('gameMinutes').value = mins;
            document.getElementById('gameSeconds').value = secs;
        } else {
            // 開始
            stopwatchRunning = true;
            displayContainer.classList.add('running');

            stopwatchInterval = setInterval(() => {
                stopwatchSeconds++;
                updateDisplay();
            }, 1000);
        }
    });
}

// グローバルリセット関数（ゲーム保存後に呼ばれる）
function resetStopwatch() {
    const displayContainer = document.getElementById('stopwatchDisplay');
    const display = document.getElementById('stopwatchTime');

    stopwatchRunning = false;
    if (displayContainer) displayContainer.classList.remove('running');

    if (stopwatchInterval) {
        clearInterval(stopwatchInterval);
        stopwatchInterval = null;
    }

    stopwatchSeconds = 0;
    if (display) {
        display.textContent = '00:00';
    }
}
