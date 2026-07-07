/* ============================================
   毛概题库练习系统 - 核心逻辑
   路由 | 渲染 | 存储 | 进度 | 错题本 | 导入导出
   ============================================ */

// ==================== 全局状态 ====================
const APP = {
    currentChapter: null,
    currentView: 'home',
    progress: {},
    expandedExplanations: new Set(),
    favorites: new Set()
};

// ==================== 存储管理 ====================
const STORAGE_KEY = 'maogai_question_bank';

function loadProgress() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (e) { return {}; }
}

function saveProgress(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); APP.progress = p; }
    catch (e) { alert('本地存储空间不足，请清理浏览器数据或导出进度后重置。'); }
}

function setUserAnswer(questionId, userAnswer, isCorrect) {
    APP.progress[questionId] = { answer: userAnswer, correct: isCorrect, timestamp: Date.now() };
    saveProgress(APP.progress);
}

// 通过题目ID快速定位所属章节
function findChapterForQuestion(questionId) {
    return QUESTION_BANK.chapters.find(c => c.questions.some(q => q.id === questionId)) || null;
}

function resetChapter(chapterId) {
    const ch = QUESTION_BANK.chapters.find(c => c.id === chapterId);
    if (!ch) return;
    ch.questions.forEach(q => {
        delete APP.progress[q.id];
        APP.expandedExplanations.delete(q.id);
    });
    saveProgress(APP.progress);
    saveExpandedState();
}

function resetAll() {
    if (!confirm('确定要清除所有答题进度吗？此操作不可恢复！\n建议先导出备份。')) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('maogai_expanded');
    APP.progress = {};
    APP.expandedExplanations.clear();
    navigate('home');
}

function getChapterProgress(chapterId) {
    const ch = QUESTION_BANK.chapters.find(c => c.id === chapterId);
    if (!ch) return { done: 0, total: 0, correct: 0 };
    let done = 0, correct = 0;
    ch.questions.forEach(q => {
        const s = APP.progress[q.id];
        if (!s) return;
        // 多选：只有 decided 为 true 的才算完成
        if (q.type === 'multi' && s.decided !== true) return;
        done++;
        if (s.correct) correct++;
    });
    return { done, total: ch.questions.length, correct };
}

function getTotalProgress() {
    let total = 0, done = 0, correct = 0;
    QUESTION_BANK.chapters.forEach(ch => {
        ch.questions.forEach(q => {
            total++;
            const s = APP.progress[q.id];
            if (!s) return;
            if (q.type === 'multi' && s.decided !== true) return;
            done++;
            if (s.correct) correct++;
        });
    });
    return { done, total, correct };
}

function getWrongAnswers(chapterId) {
    const chapters = chapterId ? QUESTION_BANK.chapters.filter(c => c.id === chapterId) : QUESTION_BANK.chapters;
    const wrong = [];
    chapters.forEach(ch => {
        ch.questions.forEach(q => {
            const s = APP.progress[q.id];
            if (!s) return;
            // 判断/单选：!correct 即为错题；多选：decided && !correct
            const isWrong = q.type === 'multi' ? (s.decided === true && !s.correct) : !s.correct;
            if (isWrong) {
                wrong.push({ ...q, chapterTitle: ch.title, chapterId: ch.id, userAnswer: s.answer });
            }
        });
    });
    return wrong;
}

// ==================== 收藏夹 ====================
const FAVORITES_KEY = 'maogai_favorites';

function loadFavorites() {
    try {
        const raw = localStorage.getItem(FAVORITES_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) { return new Set(); }
}

function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...APP.favorites])); }
    catch (e) { alert('本地存储空间不足，无法保存收藏。'); }
}

function isFavorite(questionId) {
    return APP.favorites.has(questionId);
}

function toggleFavorite(questionId) {
    if (APP.favorites.has(questionId)) APP.favorites.delete(questionId);
    else APP.favorites.add(questionId);
    saveFavorites();
    updateFavoritesBadge();
    // 仅更新当前卡片上的收藏按钮，避免整页重渲
    const card = document.getElementById('card-' + questionId);
    if (card) {
        const btn = card.querySelector('.favorite-btn');
        if (btn) {
            const fav = APP.favorites.has(questionId);
            btn.classList.toggle('favorited', fav);
            btn.textContent = fav ? '★ 已收藏' : '☆ 收藏';
        }
    }
}

function updateFavoritesBadge() {
    document.querySelectorAll('.fav-count').forEach(b => { b.textContent = APP.favorites.size; });
}

// ==================== 导入导出 ====================
function exportProgress() {
    const data = { version: 1, exportedAt: new Date().toISOString(), progress: APP.progress, expandedExplanations: [...APP.expandedExplanations] };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `毛概练习进度_${new Date().toISOString().slice(0,10)}.json` });
    a.click(); URL.revokeObjectURL(a.href);
}

function importProgress() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    input.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (!data.progress || typeof data.progress !== 'object') throw new Error('无效的进度文件格式');
                if (!confirm(`即将导入 ${Object.keys(data.progress).length} 条答题记录，是否继续？\n（将覆盖当前进度）`)) return;
                APP.progress = data.progress; saveProgress(APP.progress);
                if (data.expandedExplanations) APP.expandedExplanations = new Set(data.expandedExplanations);
                alert('导入成功！'); navigate(APP.currentView);
            } catch (err) { alert('导入失败：' + err.message); }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ==================== 路由 ====================
function navigate(view, params) {
    APP.currentView = view;
    
    // 更新导航按钮状态
    document.querySelectorAll('.nav-btn[data-view]').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
    });
    
    // 显示/隐藏进度条
    const progressBar = document.getElementById('progressBarContainer');
    if (view === 'chapter') {
        progressBar.style.display = 'block';
    } else {
        progressBar.style.display = 'none';
    }
    
    // 切换页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    switch (view) {
        case 'home':
            document.getElementById('pageHome').classList.add('active');
            renderHome();
            break;
        case 'chapter':
            document.getElementById('pageChapter').classList.add('active');
            APP.currentChapter = params.chapterId;
            renderChapter(params.chapterId);
            updateChapterProgressBar(params.chapterId);
            break;
        case 'wrong':
            document.getElementById('pageWrong').classList.add('active');
            renderWrongAnswers(params?.chapterId || null);
            break;
        case 'settings':
            document.getElementById('pageSettings').classList.add('active');
            renderSettings();
            break;
        case 'favorites':
            document.getElementById('pageFavorites').classList.add('active');
            renderFavorites();
            break;
    }
    
    updateFavoritesBadge();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== 进度条更新 ====================
function updateGlobalProgressBar() {
    const { done, total, correct } = getTotalProgress();
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('progressLabel').textContent = '总进度';
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent = `${done}/${total} (正确${correct})`;
}

function updateChapterProgressBar(chapterId) {
    const { done, total, correct } = getChapterProgress(chapterId);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const ch = QUESTION_BANK.chapters.find(c => c.id === chapterId);
    document.getElementById('progressLabel').textContent = ch ? ch.shortTitle || ch.title : '';
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressText').textContent = `${done}/${total} (正确${correct})`;
}

// ==================== 首页渲染 ====================
function renderHome() {
    const container = document.getElementById('homeContent');
    const { done, total, correct } = getTotalProgress();
    const overallPct = total > 0 ? Math.round((done / total) * 100) : 0;
    
    let html = `
        <div class="chapter-list-header">
            <img src="public/logo-site.svg" alt="毛概题库" class="hero-logo">
            <h1>毛概题库练习</h1>
            <p>毛泽东思想和中国特色社会主义理论体系概论 · 共 ${QUESTION_BANK.chapters.length} 章 · ${total} 题</p>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:20px 24px;margin-bottom:24px;text-align:center;">
            <div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:8px;">📊 总体进度</div>
            <div style="font-size:2rem;font-weight:700;color:var(--accent);">${overallPct}%</div>
            <div style="font-size:0.85rem;color:var(--text-muted);">已完成 ${done}/${total} 题，正确 ${correct} 题</div>
            <div class="progress-bar" style="margin-top:12px;height:10px;">
                <div class="progress-fill" style="width:${overallPct}%;"></div>
            </div>
        </div>
        <div class="chapter-grid">
    `;
    
    QUESTION_BANK.chapters.forEach(ch => {
        const { done: chDone, total: chTotal, correct: chCorrect } = getChapterProgress(ch.id);
        const chPct = chTotal > 0 ? Math.round((chDone / chTotal) * 100) : 0;
        html += `
            <div class="chapter-card" onclick="navigate('chapter', {chapterId:'${ch.id}'})">
                <div class="chapter-card-info">
                    <div class="chapter-card-title">${ch.title}</div>
                    <div class="chapter-card-meta">${chTotal} 题 · 已完成 ${chDone} · 正确 ${chCorrect}</div>
                </div>
                <div class="chapter-card-progress">
                    <div class="chapter-mini-bar">
                        <div class="chapter-mini-fill" style="width:${chPct}%;"></div>
                    </div>
                    <span style="font-size:0.8rem;color:var(--text-muted);min-width:36px;">${chPct}%</span>
                    <span class="chapter-card-arrow">→</span>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    
    // 错题入口
    const wrongCount = getWrongAnswers(null).length;
    if (wrongCount > 0) {
        html += `
            <div style="margin-top:24px;text-align:center;">
                <button class="btn btn-danger" onclick="navigate('wrong')">
                    📝 查看错题本 (${wrongCount} 题)
                </button>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ==================== 章节渲染 ====================
function renderChapter(chapterId) {
    const chapter = QUESTION_BANK.chapters.find(c => c.id === chapterId);
    if (!chapter) return navigate('home');
    
    const container = document.getElementById('chapterContent');
    
    // 分组：判断题、单选题、多选题
    const judgeQuestions = chapter.questions.filter(q => q.type === 'judge');
    const singleQuestions = chapter.questions.filter(q => q.type === 'single');
    const multiQuestions = chapter.questions.filter(q => q.type === 'multi');
    
    let html = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px;">
            <div>
                <button class="btn btn-sm btn-secondary" onclick="navigate('home')">← 返回目录</button>
            </div>
            <h1 style="font-size:1.3rem;margin:0;">${chapter.title}</h1>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-sm btn-secondary" onclick="resetChapter('${chapterId}');navigate('chapter',{chapterId:'${chapterId}'})">🔄 重置本章</button>
            </div>
        </div>
    `;
    
    // 判断题部分
    if (judgeQuestions.length > 0) {
        html += `<div class="question-section">
            <div class="section-header">
                <h2>一、判断题</h2>
                <span class="section-badge">${judgeQuestions.length} 题</span>
            </div>`;
        html += judgeQuestions.map(q => renderQuestionCard(q)).join('');
        html += '</div>';
    }
    
    // 单选题部分
    if (singleQuestions.length > 0) {
        html += `<div class="question-section">
            <div class="section-header">
                <h2>二、单项选择题</h2>
                <span class="section-badge">${singleQuestions.length} 题</span>
            </div>`;
        html += singleQuestions.map(q => renderQuestionCard(q)).join('');
        html += '</div>';
    }
    
    // 多选题部分
    if (multiQuestions.length > 0) {
        html += `<div class="question-section">
            <div class="section-header">
                <h2>三、多项选择题</h2>
                <span class="section-badge">${multiQuestions.length} 题</span>
            </div>`;
        html += multiQuestions.map(q => renderQuestionCard(q)).join('');
        html += '</div>';
    }
    
    container.innerHTML = html;
}

function renderQuestionCard(q) {
    const saved = APP.progress[q.id];
    const userAnswer = saved ? saved.answer : null;
    const isCorrect = saved ? saved.correct : null;
    // 多选：只有 decided 才算有结果；判断/单选：有保存就算有结果
    const showResult = q.type === 'multi' ? (saved && saved.decided === true) : (saved !== undefined);
    const expId = q.id + '-exp';
    const expanded = APP.expandedExplanations.has(q.id);
    
    let cardClass = 'question-card';
    if (showResult) {
        cardClass += isCorrect ? ' correct' : ' wrong';
    }
    
    let resultIcon = '';
    if (showResult) {
        resultIcon = isCorrect 
            ? '<span class="result-icon correct">✓</span>'
            : '<span class="result-icon wrong">✗</span>';
    }
    
    let answerHtml = '';
    if (q.type === 'judge') {
        answerHtml = `
            <div class="judge-buttons">
                <div class="judge-btn ${userAnswer === '√' ? 'selected' : ''} 
                     ${showResult && q.answer === '√' ? 'correct-answer' : ''}
                     ${showResult && userAnswer === '√' && !isCorrect ? 'wrong-answer' : ''}"
                     onclick="handleJudgeAnswer('${q.id}', '√')">
                    ✅ 正确 (√)
                </div>
                <div class="judge-btn ${userAnswer === '×' ? 'selected' : ''}
                     ${showResult && q.answer === '×' ? 'correct-answer' : ''}
                     ${showResult && userAnswer === '×' && !isCorrect ? 'wrong-answer' : ''}"
                     onclick="handleJudgeAnswer('${q.id}', '×')">
                    ❌ 错误 (×)
                </div>
            </div>
        `;
    } else if (q.type === 'single') {
        answerHtml = `<ul class="options-list">`;
        q.options.forEach(opt => {
            let cls = 'option-item';
            if (userAnswer === opt.label) cls += ' selected';
            if (showResult && q.answer === opt.label) cls += ' correct-answer';
            if (showResult && userAnswer === opt.label && !isCorrect) cls += ' wrong-answer';
            answerHtml += `
                <li class="${cls}" onclick="handleSingleAnswer('${q.id}', '${opt.label}')">
                    <span class="option-label">${opt.label}.</span>
                    <span class="option-text">${opt.text}</span>
                </li>
            `;
        });
        answerHtml += '</ul>';
    } else if (q.type === 'multi') {
        answerHtml = `<ul class="options-list">`;
        const userAnswers = userAnswer ? userAnswer.split('') : [];
        const correctLabels = q.answer.split('');
        q.options.forEach(opt => {
            let cls = 'option-item';
            if (userAnswers.includes(opt.label)) cls += ' selected';
            if (showResult && correctLabels.includes(opt.label)) cls += ' correct-answer';
            if (showResult && userAnswers.includes(opt.label) && !correctLabels.includes(opt.label)) cls += ' wrong-answer';
            answerHtml += `
                <li class="${cls}" onclick="handleMultiAnswer('${q.id}', '${opt.label}')">
                    <span class="option-label">${opt.label}.</span>
                    <span class="option-text">${opt.text}</span>
                </li>
            `;
        });
        answerHtml += '</ul>';
    }
    
    return `
        <div class="${cardClass}" id="card-${q.id}">
            <div class="question-number" style="display:flex;justify-content:space-between;align-items:center;">
                <span>第 ${q.index} 题 ${resultIcon}</span>
                <button class="favorite-btn ${isFavorite(q.id) ? 'favorited' : ''}" onclick="toggleFavorite('${q.id}')" title="收藏 / 取消收藏">
                    ${isFavorite(q.id) ? '★ 已收藏' : '☆ 收藏'}
                </button>
            </div>
            <div class="question-content">${q.content}</div>
            ${answerHtml}
            <button class="explanation-toggle" onclick="toggleExplanation('${q.id}')">
                ${expanded ? '🔽 收起解析' : '🔍 查看解析'}
            </button>
            <div class="explanation-content ${expanded ? 'visible' : ''}" id="${expId}">
                <strong>📖 解析：</strong>${q.explanation}
                ${showResult ? `<br><br><strong>✅ 正确答案：</strong>${q.answer} &nbsp;|&nbsp; <strong>你的答案：</strong>${userAnswer}` : `<br><br><strong>✅ 正确答案：</strong>${q.answer}`}
            </div>
        </div>
    `;
}

// ==================== 答题处理 ====================
function handleJudgeAnswer(questionId, userAnswer) {
    const chapter = findChapterForQuestion(questionId); if (!chapter) return;
    const q = chapter.questions.find(q => q.id === questionId); if (!q) return;
    setUserAnswer(questionId, userAnswer, userAnswer === q.answer);
    APP.expandedExplanations.add(questionId); saveExpandedState();
    renderChapter(chapter.id); updateChapterProgressBar(chapter.id);
}

function handleSingleAnswer(questionId, userAnswer) {
    const chapter = findChapterForQuestion(questionId); if (!chapter) return;
    const q = chapter.questions.find(q => q.id === questionId); if (!q) return;
    setUserAnswer(questionId, userAnswer, userAnswer === q.answer);
    APP.expandedExplanations.add(questionId); saveExpandedState();
    renderChapter(chapter.id); updateChapterProgressBar(chapter.id);
    scrollToNextQuestion(questionId);
}

function handleMultiAnswer(questionId, optionLabel) {
    const chapter = findChapterForQuestion(questionId); if (!chapter) return;
    const q = chapter.questions.find(q => q.id === questionId); if (!q) return;
    const saved = APP.progress[questionId];
    let currentAnswers = saved ? saved.answer.split('') : [];
    
    // Toggle the clicked option
    if (currentAnswers.includes(optionLabel)) {
        currentAnswers = currentAnswers.filter(a => a !== optionLabel);
    } else {
        currentAnswers = [...currentAnswers, optionLabel].sort();
    }
    
    const userAnswer = currentAnswers.join('');
    const correctLabels = q.answer.split('');
    const allCorrectSelected = correctLabels.every(l => currentAnswers.includes(l));
    const noWrongSelected = currentAnswers.every(l => correctLabels.includes(l));
    const anySelected = currentAnswers.length > 0;
    const isComplete = allCorrectSelected && noWrongSelected;
    const hasWrong = anySelected && !noWrongSelected;
    
    // Store: only decide when all correct AND no wrong, OR when wrong selected
    if (!anySelected) {
        // All deselected — remove progress entirely
        delete APP.progress[questionId];
        saveProgress(APP.progress);
        APP.expandedExplanations.delete(questionId); saveExpandedState();
    } else if (hasWrong) {
        APP.progress[questionId] = { answer: userAnswer, correct: false, decided: true, timestamp: Date.now() };
        saveProgress(APP.progress);
        APP.expandedExplanations.add(questionId); saveExpandedState();
    } else if (isComplete) {
        APP.progress[questionId] = { answer: userAnswer, correct: true, decided: true, timestamp: Date.now() };
        saveProgress(APP.progress);
        APP.expandedExplanations.add(questionId); saveExpandedState();
    } else {
        // Partial correct selection — pending, not decided
        APP.progress[questionId] = { answer: userAnswer, decided: false, timestamp: Date.now() };
        saveProgress(APP.progress);
        APP.expandedExplanations.delete(questionId); saveExpandedState();
    }
    
    renderChapter(chapter.id); updateChapterProgressBar(chapter.id);
}

function scrollToNextQuestion(currentId) {
    const chapter = findChapterForQuestion(currentId); if (!chapter) return;
    const idx = chapter.questions.findIndex(q => q.id === currentId);
    if (idx >= 0 && idx < chapter.questions.length - 1) {
        const nextCard = document.getElementById('card-' + chapter.questions[idx + 1].id);
        if (nextCard) nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ==================== 解析展开 ====================
function toggleExplanation(questionId) {
    if (APP.expandedExplanations.has(questionId)) {
        APP.expandedExplanations.delete(questionId);
    } else {
        APP.expandedExplanations.add(questionId);
    }
    saveExpandedState();
    const expEl = document.getElementById(questionId + '-exp');
    if (expEl) {
        expEl.classList.toggle('visible');
    }
    // 更新按钮文字
    const card = document.getElementById('card-' + questionId);
    if (card) {
        const btn = card.querySelector('.explanation-toggle');
        if (btn) {
            btn.textContent = APP.expandedExplanations.has(questionId) ? '🔽 收起解析' : '🔍 查看解析';
        }
    }
}

// ==================== 错题本渲染 ====================
function renderWrongAnswers(filterChapterId) {
    const container = document.getElementById('wrongContent');
    const wrongList = getWrongAnswers(filterChapterId);
    
    let html = `
        <div class="wrong-header">
            <h2>📝 错题本</h2>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-sm btn-secondary" onclick="navigate('home')">← 返回目录</button>
            </div>
        </div>
        <div class="wrong-filter">
            <button class="filter-btn ${!filterChapterId ? 'active' : ''}" 
                onclick="navigate('wrong')">全部章节</button>
    `;
    
    QUESTION_BANK.chapters.forEach(ch => {
        const count = getWrongAnswers(ch.id).length;
        if (count > 0) {
            html += `<button class="filter-btn ${filterChapterId === ch.id ? 'active' : ''}" 
                onclick="navigate('wrong', {chapterId:'${ch.id}'})">${ch.shortTitle || ch.title} (${count})</button>`;
        }
    });
    
    html += '</div>';
    
    if (wrongList.length === 0) {
        html += `
            <div class="empty-state">
                <div class="empty-state-icon">🎉</div>
                <h3>太棒了！没有错题</h3>
                <p>继续加油，保持全对！</p>
            </div>
        `;
    } else {
        wrongList.forEach((q, i) => {
            const expId = q.id + '-exp-wrong';
            const expanded = APP.expandedExplanations.has(q.id);
            
            html += `
                <div class="question-card wrong">
                    <div class="question-number" style="display:flex;justify-content:space-between;">
                        <span>${q.chapterTitle} · 第 ${q.index} 题 <span class="result-icon wrong">✗</span></span>
                        <button class="btn btn-sm btn-secondary" onclick="navigate('chapter',{chapterId:'${q.chapterId}'})">前往章节</button>
                    </div>
                    <div class="question-content">${q.content}</div>
                    <div style="padding:8px 14px;background:var(--bg-tertiary);border-radius:var(--radius-sm);margin-bottom:8px;font-size:0.9rem;">
                        <span style="color:var(--danger);">❌ 你的答案：${q.userAnswer}</span>
                        &nbsp;&nbsp;
                        <span style="color:var(--success);">✅ 正确答案：${q.answer}</span>
                    </div>
                    <button class="explanation-toggle" onclick="toggleExplanation('${q.id}')">
                        ${expanded ? '🔽 收起解析' : '🔍 查看解析'}
                    </button>
                    <div class="explanation-content ${expanded ? 'visible' : ''}" id="${expId}">
                        <strong>📖 解析：</strong>${q.explanation}
                    </div>
                </div>
            `;
        });
    }
    
    container.innerHTML = html;
}

// ==================== 收藏夹渲染 ====================
function renderFavorites() {
    const container = document.getElementById('favoritesContent');
    const byChapter = [];
    QUESTION_BANK.chapters.forEach(ch => {
        const qs = ch.questions.filter(q => APP.favorites.has(q.id));
        if (qs.length) byChapter.push({ chapter: ch, questions: qs });
    });

    let html = `
        <div class="wrong-header">
            <h2>⭐ 收藏夹</h2>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-sm btn-secondary" onclick="navigate('home')">← 返回目录</button>
            </div>
        </div>
    `;

    if (byChapter.length === 0) {
        html += `
            <div class="empty-state">
                <div class="empty-state-icon">⭐</div>
                <h3>收藏夹还是空的</h3>
                <p>在题目卡片点击「收藏」按钮，就能把题目收集到这里，按章节随时复习。</p>
            </div>
        `;
    } else {
        byChapter.forEach(group => {
            const gid = group.chapter.id;
            html += `
                <div class="question-section">
                    <div class="section-header fav-group-header" onclick="toggleFavGroup('${gid}')">
                        <h2>${group.chapter.title}</h2>
                        <span class="section-badge">${group.questions.length} 题</span>
                        <span class="group-toggle" id="fav-toggle-${gid}">▸ 展开</span>
                    </div>
                    <div class="fav-group-body" id="fav-group-${gid}" style="display:none;">
            `;
            html += group.questions.map(q => renderFavoriteCard(q)).join('');
            html += '</div></div>';
        });
    }

    container.innerHTML = html;
    updateFavoritesBadge();
}

// 收藏夹：章节折叠/展开（默认全部收起）
function toggleFavGroup(chapterId) {
    const body = document.getElementById('fav-group-' + chapterId);
    const toggle = document.getElementById('fav-toggle-' + chapterId);
    if (!body) return;
    const willShow = body.style.display === 'none';
    body.style.display = willShow ? '' : 'none';
    if (toggle) toggle.textContent = willShow ? '▾ 收起' : '▸ 展开';
}

function renderOptionsReadonly(q) {
    // 收藏夹直接呈现"已选中正确答案"的终态：正确项同时带 selected(选中态) + correct-answer(绿色高亮)
    if (q.type === 'judge') {
        const correctIsRight = q.answer === '√';
        return `
            <div class="judge-buttons">
                <div class="judge-btn ${correctIsRight ? 'selected correct-answer' : ''}">✅ 正确 (√)</div>
                <div class="judge-btn ${correctIsRight ? '' : 'selected correct-answer'}">❌ 错误 (×)</div>
            </div>`;
    }
    const correctLabels = q.answer.split('');
    let html = '<ul class="options-list">';
    q.options.forEach(opt => {
        const isCorrect = correctLabels.includes(opt.label);
        const cls = 'option-item' + (isCorrect ? ' selected correct-answer' : '');
        html += `
            <li class="${cls}">
                <span class="option-label">${opt.label}.</span>
                <span class="option-text">${opt.text}</span>
            </li>`;
    });
    html += '</ul>';
    return html;
}

function renderFavoriteCard(q) {
    const expId = q.id + '-exp-fav';
    const typeLabel = { judge: '判断题', single: '单选题', multi: '多选题' }[q.type] || '';
    return `
        <div class="question-card favorited" id="card-${q.id}">
            <div class="question-number" style="display:flex;justify-content:space-between;align-items:center;">
                <span>第 ${q.index} 题 · ${typeLabel}</span>
                <button class="favorite-btn favorited" onclick="toggleFavorite('${q.id}');renderFavorites()">★ 已收藏</button>
            </div>
            <div class="question-content">${q.content}</div>
            ${renderOptionsReadonly(q)}
            <button class="explanation-toggle" onclick="toggleFavExplanation('${q.id}')">🔽 收起解析</button>
            <div class="explanation-content visible" id="${expId}">
                <strong>📖 解析：</strong>${q.explanation}
                <br><br><strong>✅ 正确答案：</strong>${q.answer}
            </div>
        </div>
    `;
}

function toggleFavExplanation(questionId) {
    const expEl = document.getElementById(questionId + '-exp-fav');
    if (!expEl) return;
    const open = expEl.classList.toggle('visible');
    const card = document.getElementById('card-' + questionId);
    if (card) {
        const btn = card.querySelector('.explanation-toggle');
        if (btn) btn.textContent = open ? '🔽 收起解析' : '🔍 查看解析';
    }
}

// ==================== 设置页渲染 ====================
function renderSettings() {
    const container = document.getElementById('settingsContent');
    const { done, total } = getTotalProgress();
    
    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
            <button class="btn btn-sm btn-secondary" onclick="navigate('home')">← 返回目录</button>
            <h2 style="margin:0;">⚙️ 设置与数据管理</h2>
        </div>
        
        <div class="settings-section">
            <h3>📊 当前进度</h3>
            <p>已完成 ${done}/${total} 题，数据存储在浏览器本地存储中。</p>
        </div>
        
        <div class="settings-section">
            <h3>📤 导出进度</h3>
            <p>将当前答题进度导出为 JSON 文件，可用于备份或迁移到其他浏览器。</p>
            <button class="btn btn-primary" onclick="exportProgress()">📥 导出进度 (JSON)</button>
        </div>
        
        <div class="settings-section">
            <h3>📥 导入进度</h3>
            <p>从之前导出的 JSON 文件恢复答题进度。</p>
            <button class="btn btn-secondary" onclick="importProgress()">📤 导入进度文件</button>
        </div>
        
        <div class="settings-section">
            <h3>🔄 重置数据</h3>
            <p style="color:var(--danger);">清除所有答题记录，恢复到初始状态。</p>
            <button class="btn btn-danger" onclick="resetAll()">⚠️ 清除所有进度</button>
        </div>
        
        <div class="settings-section">
            <h3>ℹ️ 关于</h3>
            <p>
                毛概题库练习系统 v1.0<br>
                题目来源：《毛泽东思想和中国特色社会主义理论体系概论》（2023版）<br>
                所有数据保存在您的本地浏览器中，不上传任何信息。
            </p>
        </div>
    `;
}

// ==================== 主题管理 ====================
const THEME_KEY = 'maogai_theme';

function legacySetTheme(theme) {
    document.querySelectorAll('.theme-btn').forEach(b => {
        const isActive = b.dataset.theme === theme;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-checked', isActive.toString());
    });
    
    // 清除所有主题类
    document.body.classList.remove('dark', 'light');
    
    if (theme === 'dark') {
        document.body.classList.add('dark');
        localStorage.setItem(THEME_KEY, 'dark');
    } else if (theme === 'light') {
        document.body.classList.add('light');
        localStorage.setItem(THEME_KEY, 'light');
    } else {
        // auto: 移除类，让系统媒体查询决定
        localStorage.removeItem(THEME_KEY);
    }
}

function legacyInitTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') {
        document.body.classList.add('dark');
    } else if (saved === 'light') {
        document.body.classList.add('light');
    }
    // auto: 什么都不做，让 @media (prefers-color-scheme: dark) 生效
    if (!saved || saved === 'auto') {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark');
        }
    }
    // 同步按钮激活状态
    const activeTheme = saved || 'auto';
    document.querySelectorAll('.theme-btn').forEach(b => {
        const isActive = b.dataset.theme === activeTheme;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-checked', isActive.toString());
    });
}

// 监听系统主题变化（仅在 auto 模式下生效）
if (false && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const saved = localStorage.getItem(THEME_KEY);
        if (!saved || saved === 'auto') {
            if (e.matches) {
                document.body.classList.add('dark');
                document.body.classList.remove('light');
            } else {
                document.body.classList.remove('dark');
                document.body.classList.add('light');
            }
        }
    });
}

// ==================== 移动端菜单 ====================
const systemThemeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function getStoredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' || saved === 'light' ? saved : 'auto';
}

function getEffectiveTheme(theme) {
    if (theme === 'dark' || theme === 'light') return theme;
    return systemThemeQuery && systemThemeQuery.matches ? 'dark' : 'light';
}

function syncThemeButtons(theme) {
    document.querySelectorAll('.theme-btn').forEach(b => {
        const isActive = b.dataset.theme === theme;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-checked', isActive.toString());
    });
}

function applyTheme(theme, animate) {
    const effectiveTheme = getEffectiveTheme(theme);
    if (animate) {
        document.body.classList.add('theme-transition');
        window.clearTimeout(applyTheme.transitionTimer);
        applyTheme.transitionTimer = window.setTimeout(() => {
            document.body.classList.remove('theme-transition');
        }, 260);
    }

    document.body.classList.toggle('dark', effectiveTheme === 'dark');
    document.body.classList.toggle('light', effectiveTheme === 'light');
    document.documentElement.style.colorScheme = effectiveTheme;
    syncThemeButtons(theme);
}

function setTheme(theme) {
    if (theme === 'dark') {
        localStorage.setItem(THEME_KEY, 'dark');
    } else if (theme === 'light') {
        localStorage.setItem(THEME_KEY, 'light');
    } else {
        theme = 'auto';
        localStorage.removeItem(THEME_KEY);
    }

    applyTheme(theme, true);
}

function initTheme() {
    applyTheme(getStoredTheme(), false);
}

if (systemThemeQuery) {
    const handleSystemThemeChange = () => {
        if (getStoredTheme() === 'auto') applyTheme('auto', true);
    };

    if (systemThemeQuery.addEventListener) {
        systemThemeQuery.addEventListener('change', handleSystemThemeChange);
    } else if (systemThemeQuery.addListener) {
        systemThemeQuery.addListener(handleSystemThemeChange);
    }
}

function toggleMobileMenu() {
    const dropdown = document.getElementById('mobileDropdown');
    const btn = document.getElementById('hamburgerBtn');
    if (dropdown) {
        dropdown.classList.toggle('open');
        btn.textContent = dropdown.classList.contains('open') ? '✕' : '☰';
    }
}

function closeMobileMenu() {
    const dropdown = document.getElementById('mobileDropdown');
    const btn = document.getElementById('hamburgerBtn');
    if (dropdown) {
        dropdown.classList.remove('open');
        btn.textContent = '☰';
    }
}

// ==================== 初始化 ====================
function init() {
    APP.progress = loadProgress();
    APP.favorites = loadFavorites();
    initTheme();
    try {
        const expRaw = localStorage.getItem('maogai_expanded');
        if (expRaw) APP.expandedExplanations = new Set(JSON.parse(expRaw));
    } catch(e) {}
    navigate('home');
}

function saveExpandedState() {
    localStorage.setItem('maogai_expanded', JSON.stringify([...APP.expandedExplanations]));
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
