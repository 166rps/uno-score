/**
 * UNO得点記録アプリ
 * メインJavaScriptファイル
 */

// =============================================
// グローバル状態
// =============================================
let state = {
    currentYear: new Date().getFullYear(),
    players: ['百合子', '守正', '正久', '千明', '宏子', '健二'],
    games: [], // { id, date, type, scores: { playerName: score } }
    fund: 0, // UNO基金残高
    lastGameType: 'パねぇ！', // 最後に選択したUNOタイプ
    charts: {
        line: null,
        winLoss: null,
        bar: null
    }
};

// =============================================
// ローカルストレージ
// =============================================
const STORAGE_KEY = 'uno_score_data';

function saveToStorage() {
    const data = {
        players: state.players,
        games: state.games,
        fund: state.fund,
        lastGameType: state.lastGameType
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const data = JSON.parse(stored);
        state.players = data.players || state.players;
        state.games = data.games || [];
        state.fund = data.fund || 0;
        state.lastGameType = data.lastGameType || 'パねぇ！';
    }
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

        const game = {
            id: generateId(),
            date: dateInput.value,
            type: typeSelect.value,
            isOpen: openGameCheckbox.checked, // オープンゲームフラグ
            scores: scores
        };

        state.games.push(game);
        saveToStorage();

        // 入力をクリア
        grid.querySelectorAll('input').forEach(inp => inp.value = '');

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
    const container = document.getElementById('recentGames');
    // オープンゲームも含めて全データを取得
    const yearGames = getGamesForYear(state.currentYear);
    const recent = yearGames.slice(-5).reverse();

    if (recent.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">まだゲーム記録がありません</p>';
        return;
    }

    container.innerHTML = recent.map(game => {
        const scores = Object.entries(game.scores);
        const minScore = Math.min(...scores.map(s => s[1]));
        const maxScore = Math.max(...scores.map(s => s[1]));

        const isOpen = game.isOpen === true;
        const typeBadge = game.type === 'パねぇ！' ? 'paney' : (game.type === 'パーチー' ? 'party' : 'normal');

        return `
            <div class="recent-game" style="${isOpen ? 'background-color: rgba(0,0,0,0.02);' : ''}">
                <div class="recent-game-info" style="flex-direction: column; align-items: flex-start; gap: 0.2rem;">
                    <div>${formatDate(game.date)}</div>
                    <span class="type-badge ${typeBadge}" style="font-size: 0.7rem;">${game.type || 'パねぇ！'}</span>
                    ${isOpen ? '<span style="font-size: 0.7rem; color: var(--text-muted);">🎉 オープン</span>' : ''}
                </div>
                <div class="recent-game-scores">
                    ${scores.map(([name, score]) => {
            let className = 'recent-score';
            // オープンゲームでなければ勝敗色をつける
            if (!isOpen) {
                if (score === minScore) className += ' winner';
                else if (score === maxScore && maxScore !== minScore) className += ' loser';
            }

            return `
                            <div class="${className}" style="${isOpen ? 'background: transparent; border: 1px solid var(--border-color);' : ''}">
                                <span class="name" style="${isOpen ? 'color: var(--text-muted);' : ''}">${name}</span>
                                <span class="score" style="${isOpen ? 'color: var(--text-muted);' : ''}">${score}</span>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// =============================================
// 記録一覧テーブル
// =============================================
function getGamesForYear(year, excludeOpen = false) {
    return state.games.filter(game => {
        const gameYear = new Date(game.date).getFullYear();
        if (gameYear !== year) return false;
        if (excludeOpen && game.isOpen) return false;
        return true;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// =============================================
// 記録一覧テーブル
// =============================================
// getGamesForYearは既に定義済み

function updateScoreTable() {
    const header = document.getElementById('tableHeader');
    const body = document.getElementById('tableBody');
    const foot = document.getElementById('tableFoot');
    const countDisplay = document.getElementById('gameCount');

    const yearGames = getGamesForYear(state.currentYear);
    const validGames = yearGames.filter(g => !g.isOpen);
    const openGamesCount = yearGames.length - validGames.length;

    countDisplay.textContent = `${yearGames.length}ゲーム` + (openGamesCount > 0 ? ` (うちオープン${openGamesCount})` : '');

    // ヘッダー生成
    header.innerHTML = `
        <th>#</th>
        <th>日付</th>
        ${state.players.map(p => `<th>${p}</th>`).join('')}
        <th>操作</th>
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

    // 日付ごとにグループ化
    const gamesByDate = {};
    yearGames.forEach(game => {
        if (!gamesByDate[game.date]) {
            gamesByDate[game.date] = [];
        }
        gamesByDate[game.date].push(game);
    });

    // テーブルボディ生成
    let rows = [];
    let gameNumber = 1;

    Object.keys(gamesByDate).sort().forEach(date => {
        const dailyGames = gamesByDate[date];

        // 日付ヘッダー行
        rows.push(`
            <tr class="date-header-row">
                <td colspan="${state.players.length + 3}">📅 ${formatFullDate(date)}</td>
            </tr>
        `);

        // 各ゲーム
        dailyGames.forEach((game, idx) => {
            const scores = state.players.map(p => game.scores[p] || 0);
            const minScore = Math.min(...scores);
            const maxScore = Math.max(...scores);

            const isOpen = game.isOpen === true;
            const rowClass = isOpen ? 'open-game-row' : '';
            const typeBadge = game.type === 'パねぇ！' ? 'paney' : (game.type === 'パーチー' ? 'party' : 'normal');

            const cells = state.players.map(player => {
                const score = game.scores[player] || 0;
                let className = '';
                // オープンゲームでなければ勝敗色をつける
                if (!isOpen) {
                    if (score === minScore) className = 'cell-winner';
                    else if (score === maxScore && maxScore !== minScore) className = 'cell-loser';
                }

                return `<td class="${className}">${score}</td>`;
            }).join('');

            rows.push(`
                <tr class="${rowClass}" style="${isOpen ? 'background-color: rgba(0,0,0,0.02); color: var(--text-muted);' : ''}">
                    <td>${gameNumber++}</td>
                    <td style="font-size: 0.85rem;">
                        ${idx + 1}回目
                        <span class="type-badge ${typeBadge}" style="display:block; font-size: 0.7rem; margin-top: 2px;">${game.type || 'パねぇ！'}</span>
                        ${isOpen ? '<span style="display:block; font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">🎉 オープン</span>' : ''}
                    </td>
                    ${cells}
                    <td>
                        <button class="btn-icon" onclick="deleteGame('${game.id}')" title="削除">🗑️</button>
                    </td>
                </tr>
            `);
        });

        // 日計（オープンゲームを除く）
        const validDailyGames = dailyGames.filter(g => !g.isOpen);

        // 有効なゲームがある場合のみ日計を表示
        if (validDailyGames.length > 0) {
            const dailyTotals = {};
            state.players.forEach(player => {
                dailyTotals[player] = validDailyGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
            });

            const dailyScores = Object.values(dailyTotals);
            const dailyMin = Math.min(...dailyScores);
            const dailyMax = Math.max(...dailyScores);

            const dailyCells = state.players.map(player => {
                const score = dailyTotals[player];
                let className = '';
                if (score === dailyMin) className = 'cell-winner';
                else if (score === dailyMax && dailyMax !== dailyMin) className = 'cell-loser';

                return `<td class="${className}">${score}</td>`;
            }).join('');

            rows.push(`
                <tr class="daily-total-row">
                    <td colspan="2">📊 合計</td>
                    ${dailyCells}
                    <td></td>
                </tr>
            `);
        } else if (dailyGames.some(g => g.isOpen)) {
            rows.push(`
                <tr class="daily-total-row" style="background-color: transparent;">
                    <td colspan="${state.players.length + 3}" style="text-align: right; font-size: 0.8rem; color: var(--text-muted);">
                        ※オープンゲームのため合計計算対象外
                    </td>
                </tr>
            `);
        }
    });

    body.innerHTML = rows.join('');

    // 年間合計（オープンゲームを除く）
    const yearTotals = {};
    state.players.forEach(player => {
        yearTotals[player] = validGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
    });

    const yearScores = Object.values(yearTotals);
    const yearMin = Math.min(...yearScores);
    const yearMax = Math.max(...yearScores);

    const yearCells = state.players.map(player => {
        const score = yearTotals[player];
        let className = '';
        if (score === yearMin) className = 'cell-winner';
        else if (score === yearMax && yearMax !== yearMin) className = 'cell-loser';

        return `<td class="${className}">${score.toLocaleString()}</td>`;
    }).join('');

    foot.innerHTML = `
        <tr>
            <td colspan="2">🏆 年間合計</td>
            ${yearCells}
            <td></td>
        </tr>
    `;
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

// =============================================
// ランキング表示
// =============================================
function updateRanking() {
    updateDailyRanking();
    updateYearlyRanking();
}


function updateDailyRanking() {
    const container = document.getElementById('dailyRankingGrid');
    if (!container) return;

    const yearGames = getGamesForYear(state.currentYear, true); // オープンゲーム除外

    if (yearGames.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">データがありません</p>';
        return;
    }

    // 直近の日付を取得
    const lastDate = yearGames[yearGames.length - 1].date;
    const dailyGames = yearGames.filter(g => g.date === lastDate);

    // 直近日の合計を計算
    const totals = {};
    state.players.forEach(player => {
        totals[player] = dailyGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
    });

    // ソートしてランキング作成
    const sorted = Object.entries(totals).sort((a, b) => a[1] - b[1]);

    container.innerHTML = `
        <p style="color: var(--text-muted); font-size: 0.85rem; grid-column: 1/-1; margin-bottom: 0.5rem;">📅 ${formatFullDate(lastDate)}</p>
        ${sorted.map(([name, score], index) => {
        let className = 'ranking-item';
        let position = `${index + 1}位`;

        if (index === 0) {
            className += ' rank-1';
            position = '🥇 1位';
        } else if (index === sorted.length - 1 && sorted.length > 1) {
            className += ' rank-last';
            position = `😢 ${index + 1}位`;
        }

        return `
                <div class="${className}">
                    <span class="ranking-position">${position}</span>
                    <span class="ranking-name">${name}</span>
                    <span class="ranking-score">${score.toLocaleString()}</span>
                </div>
            `;
    }).join('')}
    `;
}

function updateYearlyRanking() {
    const container = document.getElementById('yearlyRankingGrid');
    if (!container) return;

    const yearGames = getGamesForYear(state.currentYear, true); // オープンゲーム除外

    if (yearGames.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">データがありません</p>';
        return;
    }

    // 年間合計を計算
    const totals = {};
    state.players.forEach(player => {
        totals[player] = yearGames.reduce((sum, game) => sum + (game.scores[player] || 0), 0);
    });

    // ソートしてランキング作成
    const sorted = Object.entries(totals).sort((a, b) => a[1] - b[1]);

    container.innerHTML = sorted.map(([name, score], index) => {
        let className = 'ranking-item';
        let position = `${index + 1}位`;

        if (index === 0) {
            className += ' rank-1';
            position = '🥇 1位';
        } else if (index === sorted.length - 1 && sorted.length > 1) {
            className += ' rank-last';
            position = `😢 ${index + 1}位`;
        }

        return `
            <div class="${className}">
                <span class="ranking-position">${position}</span>
                <span class="ranking-name">${name}</span>
                <span class="ranking-score">${score.toLocaleString()}</span>
            </div>
        `;
    }).join('');
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
    if (!ctx) return;

    const yearGames = getGamesForYear(state.currentYear, true); // オープンゲーム除外

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

    const colors = [
        '#00d4ff', '#ff8c00', '#00ff88', '#ff4757', '#a855f7', '#f1c40f'
    ];

    state.charts.line = new Chart(ctx, {
        type: 'line',
        data: {
            labels: yearGames.map((_, i) => `G${i + 1}`),
            datasets: state.players.map((player, idx) => ({
                label: player,
                data: cumulative[player],
                borderColor: colors[idx % colors.length],
                backgroundColor: colors[idx % colors.length] + '20',
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
    if (!ctx) return;

    const yearGames = getGamesForYear(state.currentYear, true); // オープンゲーム除外

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
    if (!ctx) return;

    const yearGames = getGamesForYear(state.currentYear, true); // オープンゲーム除外

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

    const colors = [
        '#00d4ff', '#ff8c00', '#00ff88', '#ff4757', '#a855f7', '#f1c40f'
    ];

    state.charts.bar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: state.players,
            datasets: [{
                label: '平均得点',
                data: state.players.map(p => avg[p]),
                backgroundColor: colors.slice(0, state.players.length).map(c => c + '80'),
                borderColor: colors.slice(0, state.players.length),
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
    if (!historyContainer) return;

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

    // 統計タブが表示中なら更新
    if (document.getElementById('stats-tab').classList.contains('active')) {
        updateCharts();
    }
}

// =============================================
// 初期化
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    initTabs();
    initYearSelector();
    initScoreInput();
    initPlayerManagement();
    initDataManagement();
    initFund();
    initModal();
    updateAllDisplays();
});
