    let isHighlightScheduled = false;
    let lastProcessedStem = null;

    function ensureThemeStyles() {
        let style = document.getElementById('wayground-theme-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'wayground-theme-styles';
            (document.head || document.documentElement || document.body).appendChild(style);
        }
        style.textContent = `
            :root {
                --theme-accent: var(--color-picked-user, #39be44);
                --theme-accent-muted: color-mix(in srgb, var(--theme-accent) 15%, transparent);
                --theme-accent-bg: color-mix(in srgb, var(--theme-accent) 10%, transparent);
                --theme-accent-border: color-mix(in srgb, var(--theme-accent) 30%, transparent);
                --theme-danger: #e53935;
                --theme-danger-bg: rgba(229, 57, 53, 0.1);
                --theme-danger-border: rgba(229, 57, 53, 0.3);
                --theme-neutral-bg: rgba(0, 0, 0, 0.05);
                --theme-neutral-border: rgba(150, 150, 150, 0.3);
                --theme-success: var(--theme-accent);
                --theme-success-bg: color-mix(in srgb, var(--theme-accent) 20%, transparent);

                --ans-accent: var(--theme-accent);
                --ans-accent-muted: var(--theme-accent-muted);
                --ans-bg: rgba(15, 23, 42, 0.95);
                --ans-bg-hover: rgba(15, 23, 42, 0.92);
                --ans-border: var(--theme-accent);
                --ans-text: #e2e8f0;
                --ans-text-dim: #94a3b8;
                --ans-btn-bg: var(--theme-accent);
                --ans-btn-color: #0d1117;
                --ans-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                --ans-shadow-lg: 0 4px 14px rgba(0, 0, 0, 0.4);
                --ans-divider: rgba(255, 255, 255, 0.08);
                --ans-watermark: rgba(255, 255, 255, 0.18);
                --ans-badge-bg: #2563eb;
                --ans-badge-color: #ffffff;
                --ans-badge-border: #ffffff;
                --ans-drop-bg: var(--theme-accent);
                --ans-drop-color: #0d1117;
            }
        `;
    }

    function ensureStealthStyles() {
        let style = document.getElementById('wayground-stealth-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'wayground-stealth-styles';
            (document.head || document.documentElement || document.body).appendChild(style);
        }
        const cursorVal = MCQ_CURSOR || 'not-allowed';
        const opacityVal = Math.max(0.1, Math.min(0.9, (Number(GRAYSCALE_OPACITY) || 55) / 100)).toFixed(2);
        style.textContent = `
            .ans-cursor-target,
            .ans-cursor-target * {
                cursor: ${cursorVal} !important;
                pointer-events: auto !important;
            }
            .ans-grayscale-target {
                opacity: ${opacityVal} !important;
                filter: grayscale(45%) contrast(85%) !important;
                transition: opacity 0.2s ease, filter 0.2s ease !important;
                pointer-events: auto !important;
            }
        `;
    }

    function clearStealthDisabled() {
        document.querySelectorAll('.ans-cursor-target, .ans-grayscale-target, .ans-stealth-disabled').forEach(el => {
            el.classList.remove('ans-cursor-target', 'ans-grayscale-target', 'ans-stealth-disabled');
            el.style.removeProperty('--stealth-cursor');
            el.style.removeProperty('--grayscale-opacity');
            el.style.removeProperty('cursor');
            el.style.removeProperty('opacity');
            el.style.removeProperty('filter');
            el.style.removeProperty('pointer-events');
            el.querySelectorAll('*').forEach(child => {
                child.style.removeProperty('cursor');
                child.style.removeProperty('pointer-events');
            });
        });
    }

    function instantHighlight() {
        ensureThemeStyles();
        if (!AI_DATA && !savedQuestions && !CACHED_RESULTS) {
            const routeDataRef = QUIZ_DATA?._id || QUIZ_DATA?.id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
            const memoryTransitStore = GM_getValue(`${routeDataRef}`, null) || GM_getValue("active_quiz", null);

            if (memoryTransitStore && memoryTransitStore.answers) {
                AI_DATA = memoryTransitStore.answers;
            }
        }

        if (!savedQuestions && !AI_DATA && !CACHED_RESULTS) return;

        const stemEl = document.querySelector('[data-highlight-block="stem"]') ||
                       document.querySelector('[data-testid="question-container-text"]') ||
                       document.querySelector('#questionText .content-slot') ||
                       document.querySelector('#questionText') ||
                       document.querySelector('.question-text-color') ||
                       document.querySelector('.resizeable-text') ||
                       document.querySelector('.stem-container');

        const quesIdEl = document.querySelector('[data-quesid]');
        const domQuesId = quesIdEl?.getAttribute('data-quesid');
        const currentStemText = stemEl ? normalizeText(stemEl.textContent) : '';

        if (!domQuesId && !currentStemText) return;

        if (lastProcessedStem !== (domQuesId || currentStemText)) {
            document.querySelectorAll('.ans-check').forEach(el => el.remove());
            clearStealthDisabled();
            document.querySelectorAll('.subtle-answer-text').forEach(el => el.remove());
            document.querySelectorAll('.match-num-badge').forEach(el => el.remove());
            document.querySelectorAll('.match-target-badge').forEach(el => el.remove());
            document.querySelectorAll('.match-guide-box').forEach(el => el.remove());
            lastProcessedStem = domQuesId || currentStemText;
            hasAutoClickedCurrent = false;
        }

        let activeQuestionData = null;
        let expectedAnswer = null;

        let isOfficialKey = false;

        // Always resolve activeQuestionData from savedQuestions or CLEANED_QUESTIONS
        if (savedQuestions) {
            if (domQuesId) {
                activeQuestionData = savedQuestions.find(q => q._id === domQuesId || q.id === domQuesId);
            }
            if (!activeQuestionData && currentStemText) {
                activeQuestionData = savedQuestions.find(q => {
                    const rawQ = q.structure?.query?.text || q.query?.text || q.question || '';
                    const qText = normalizeText(rawQ);
                    return qText && (qText === currentStemText || qText.includes(currentStemText) || currentStemText.includes(qText));
                });
            }
        }

        if (!activeQuestionData && CLEANED_QUESTIONS) {
            if (domQuesId && CLEANED_QUESTIONS[domQuesId]) {
                activeQuestionData = CLEANED_QUESTIONS[domQuesId];
            } else if (currentStemText) {
                for (const [qId, qData] of Object.entries(CLEANED_QUESTIONS)) {
                    const qText = normalizeText(qData.question);
                    if (qText && (qText === currentStemText || qText.includes(currentStemText) || currentStemText.includes(qText))) {
                        activeQuestionData = qData;
                        break;
                    }
                }
            }
        }

        if (CACHED_RESULTS && currentStemText) {
            for (const [qText, ans] of Object.entries(CACHED_RESULTS)) {
                const normQ = normalizeText(qText);
                if (normQ && (normQ === currentStemText || normQ.includes(currentStemText) || currentStemText.includes(normQ))) {
                    if (ans && ans !== "Answer not found" && ans !== "[object Object]") {
                        expectedAnswer = ans;
                        isOfficialKey = true;
                        break;
                    }
                }
            }
        }

        if (activeQuestionData) {
            const qKind = String(activeQuestionData.type || activeQuestionData.structure?.kind || '').toUpperCase();
            const isBlankNow = qKind.includes('BLANK') || qKind.includes('OPEN') || Boolean(document.querySelector('input[data-testid="typed-response-input"], input.typed-response-input, input[placeholder*="Type answer"], textarea'));
            if (!isBlankNow && typeof formatMatchOrOrderAnswer === 'function') {
                const matchAns = formatMatchOrOrderAnswer(activeQuestionData);
                if (matchAns) {
                    expectedAnswer = matchAns;
                    isOfficialKey = true;
                }
            }
            if (expectedAnswer === null || expectedAnswer === undefined) {
                const officialAns = activeQuestionData.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData.answer;
                const isPollQ = qKind === 'POLL';
                if (officialAns !== undefined && officialAns !== null && (officialAns !== -1 || isPollQ)) {
                    expectedAnswer = officialAns;
                    isOfficialKey = true;
                }
            }
        }

        if (!isOfficialKey && (expectedAnswer === null || expectedAnswer === undefined) && AI_DATA) {
            if (domQuesId && AI_DATA[domQuesId] !== undefined) {
                expectedAnswer = AI_DATA[domQuesId];
            } else if (currentStemText && CLEANED_QUESTIONS) {
                for (const [qId, qData] of Object.entries(CLEANED_QUESTIONS)) {
                    const qText = normalizeText(qData.question);
                    if (qText && (qText === currentStemText || qText.includes(currentStemText) || currentStemText.includes(qText))) {
                        expectedAnswer = AI_DATA[qId];
                        break;
                    }
                }
            }
        }

        const qType = activeQuestionData?.type || activeQuestionData?.structure?.kind || 'MCQ';
        const rawOptions = activeQuestionData?.options || activeQuestionData?.structure?.options || [];

        const isChoiceActiveVisuals = document.querySelectorAll(
            'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
        ).length > 0;

        const typedInputEl = document.querySelector('input[data-testid="typed-response-input"], input.typed-response-input, input[placeholder*="Type answer"], textarea');
        const isBlankQuestion = qType === 'BLANK' || qType === 'OPEN' || Boolean(typedInputEl);

        if ((expectedAnswer === null || expectedAnswer === undefined) && !isBlankQuestion) return;

        if (isBlankQuestion || qType === 'BLANK' || qType === 'OPEN' || qType === 'MATCH' || qType === 'CLASSIFICATION' || qType === 'ORDER' || (rawOptions.length === 0 && !isChoiceActiveVisuals)) {
            const textContainer = document.querySelector('[data-testid="text-renderer"]') ||
                                  document.querySelector('.drag-drop-text div') ||
                                  document.querySelector('.h-full .flex .flex-col .gap-4') ||
                                  document.querySelector('.p-4.sm\\:p-6') ||
                                  document.querySelector('.text-area-container') ||
                                  document.querySelector('[data-testid="typed-response-input"]') ||
                                  stemEl?.parentElement;

            if (textContainer) {
                let ansStr = '';

                // Only call formatMatchOrOrderAnswer if NOT a blank/typed question!
                if (!isBlankQuestion && typeof formatMatchOrOrderAnswer === 'function' && activeQuestionData) {
                    ansStr = formatMatchOrOrderAnswer(activeQuestionData) || '';
                }

                if (!ansStr && expectedAnswer) {
                    const candidate = typeof extractAnswerText === 'function' ? extractAnswerText(expectedAnswer, rawOptions) : String(expectedAnswer);
                    if (!isBlankQuestion || (!candidate.includes('➔') && !candidate.includes('Category #') && !candidate.includes('Item #') && !candidate.includes('Any Answer') && !candidate.includes('Poll'))) {
                        ansStr = candidate;
                    }
                }

                // If blank question and still empty or contaminated with match artifacts, extract clean answer
                if (isBlankQuestion && (!ansStr || ansStr.includes('➔') || ansStr.includes('Category #') || ansStr === 'Answer not available' || ansStr === 'Answer not found' || ansStr.includes('Any Answer') || ansStr.includes('Poll'))) {
                    ansStr = '';
                    const cleanList = [];
                    rawOptions.forEach(o => {
                        const t = stripHtml(o.text || o.value || o.query?.text || '');
                        if (t && !t.includes('➔') && !t.includes('Category #') && !t.includes('Item #') && !t.includes('Any Answer') && !t.includes('Poll')) {
                            cleanList.push(t);
                        }
                    });
                    const backupAns = activeQuestionData?.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData?.answer;
                    if (backupAns !== undefined && backupAns !== null && backupAns !== -1) {
                        const extracted = typeof extractAnswerText === 'function' ? extractAnswerText(backupAns, rawOptions) : String(backupAns);
                        if (extracted && !extracted.includes('➔') && !extracted.includes('Category #') && !extracted.includes('Any Answer') && !extracted.includes('Poll')) {
                            extracted.split(/\s*\|\s*/).forEach(t => {
                                if (t && !cleanList.includes(t)) cleanList.push(t);
                            });
                        }
                    }
                    const targetOpts = activeQuestionData?.structure?.targets?.[0]?.options || [];
                    targetOpts.forEach(to => {
                        const tText = stripHtml(to.text || to.value || to || '');
                        if (tText && !cleanList.includes(tText)) cleanList.push(tText);
                    });
                    if (cleanList.length > 0) {
                        ansStr = cleanList.join(' | ');
                    }
                }

                // If blank question and still no answer, trigger on-demand AI resolution if AI enabled
                if (isBlankQuestion && (!ansStr || ansStr === 'Answer not available' || ansStr === 'Answer not found')) {
                    const toggleAiCheckbox = getShadowEl('#toggle-ai-checkbox');
                    const isAiChecked = toggleAiCheckbox ? toggleAiCheckbox.checked : GM_getValue("aiAssistance", false);
                    if (isAiChecked && typeof solveSingleQuestionOnDemand === 'function') {
                        ansStr = 'AI generating answer...';
                        solveSingleQuestionOnDemand(domQuesId, activeQuestionData);
                    } else {
                        ansStr = 'Answer not available';
                    }
                }

                if (!ansStr || ansStr === '[object Object]') {
                    ansStr = 'Answer not available';
                }

                let answerDiv = textContainer.querySelector('.subtle-answer-text');
                if (!answerDiv) {
                    answerDiv = document.createElement('div');
                    answerDiv.className = 'subtle-answer-text';
                    textContainer.appendChild(answerDiv);
                }

                if (isBlankQuestion) {
                    const firstOption = ansStr.split(/\s*\|\s*/)[0].trim();
                    const targetInput = document.querySelector('input[data-testid="typed-response-input"], input.typed-response-input, input[placeholder*="Type answer"], textarea');
                    const currentMode = (typeof TYPED_ANSWER_MODE !== 'undefined') ? TYPED_ANSWER_MODE : 'visible';

                    const isFillable = firstOption && firstOption !== 'Answer not available' && firstOption !== 'AI generating answer...' && firstOption !== 'Answer not found';
                    const doFill = () => {
                        if (targetInput && isFillable) {
                            targetInput.value = firstOption;
                            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                            targetInput.focus();
                            showNotification("Filled answer into input!");
                        } else if (navigator.clipboard && isFillable) {
                            navigator.clipboard.writeText(firstOption);
                            showNotification("Copied to clipboard!");
                        }
                    };

                    // SVG icons (no emoji)
                    const svgPencil = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
                    const svgEye  = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
                    const svgClipboard = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;

                    const insertBtnHtml = `
                        <button class="btn-fill-typed-action" type="button" style="
                            display: inline-flex; align-items: center; gap: 5px;
                            background: var(--ans-btn-bg);
                            color: var(--ans-btn-color);
                            font-weight: 800; font-size: 12px;
                            padding: 4px 10px; border-radius: 5px;
                            border: none; cursor: pointer; white-space: nowrap;
                            font-family: inherit;
                        ">${svgClipboard} Insert</button>`;

                    // --- MODE: autofill: silently fill input, hide the box ---
                    if (currentMode === 'autofill') {
                        answerDiv.style.display = 'none';
                        if (targetInput && isFillable && !targetInput.value) {
                            targetInput.value = firstOption;
                            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                    // --- MODE: placeholder: answer shown only as input placeholder ---
                    } else if (currentMode === 'placeholder') {
                        answerDiv.style.display = 'none';
                        if (targetInput && isFillable) {
                            targetInput.placeholder = firstOption;
                        }

                    // --- MODE: watermark: tiny, barely-visible text below the input ---
                    } else if (currentMode === 'watermark') {
                        answerDiv.innerHTML = `<span style="
                            font-size: 11px;
                            color: var(--ans-watermark);
                            letter-spacing: 0.5px;
                            user-select: none;
                            pointer-events: none;
                            display: block;
                            margin-top: 6px;
                        ">${escapeHtml(ansStr)}</span>`;

                    // --- MODE: hover: collapsed summary, click to reveal ---
                    } else if (currentMode === 'hover') {
                        answerDiv.innerHTML = `
                            <details style="margin-top: 10px; cursor: pointer;">
                                <summary style="
                                    list-style: none;
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 5px;
                                    color: var(--ans-accent);
                                    font-size: 12px;
                                    opacity: 0.7;
                                    font-weight: 600;
                                    user-select: none;
                                ">${svgEye} Tap to reveal answer</summary>
                                <div style="
                                    margin-top: 6px;
                                    background: var(--ans-bg-hover);
                                    border: 1.5px solid var(--ans-border);
                                    border-radius: 7px;
                                    padding: 8px 13px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: space-between;
                                    gap: 10px;
                                    box-shadow: var(--ans-shadow);
                                ">
                                    <span style="color: var(--ans-text); font-size: 15px; font-weight: 700;">${escapeHtml(ansStr)}</span>
                                    ${insertBtnHtml}
                                </div>
                            </details>
                        `;
                        answerDiv.querySelector('.btn-fill-typed-action')?.addEventListener('click', doFill);

                    // --- MODE: visible (default): full visible box ---
                    } else {
                        answerDiv.innerHTML = `
                            <div style="
                                margin-top: 14px;
                                background: var(--ans-bg);
                                border: 1.5px solid var(--ans-border);
                                border-radius: 8px;
                                padding: 10px 14px;
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                gap: 10px;
                                box-shadow: var(--ans-shadow);
                            ">
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <span style="display:inline-flex;align-items:center;gap:5px;font-weight:800;color:var(--ans-accent);font-size:13px;">
                                        ${svgPencil} Typed Answer:
                                    </span>
                                    <span class="click-to-fill-typed" style="
                                        font-weight: 700;
                                        color: var(--ans-text);
                                        font-size: 15px;
                                        cursor: pointer;
                                        text-decoration: underline;
                                    " title="Click to fill into input">${escapeHtml(ansStr)}</span>
                                </div>
                                ${insertBtnHtml}
                            </div>
                        `;
                        answerDiv.querySelector('.click-to-fill-typed')?.addEventListener('click', doFill);
                        answerDiv.querySelector('.btn-fill-typed-action')?.addEventListener('click', doFill);

                        if (targetInput && !targetInput.value && isFillable) {
                            targetInput.placeholder = firstOption;
                        }
                    }
                } else if (ansStr.includes('➔')) {
                    const rawPairs = ansStr.split(/\s*\|\s*/).map(p => p.trim()).filter(Boolean);
                    let pairsHtml = rawPairs.map((p, idx) => {
                        const parts = p.split('➔');
                        const cardText = parts[0]?.trim() || `Item #${idx + 1}`;
                        const targetText = parts[1]?.trim() || '';
                        return `
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--ans-divider);">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="background: var(--ans-badge-bg); color: var(--ans-badge-color); font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 10px; white-space: nowrap;">#${idx + 1}</span>
                                    <span style="color: var(--ans-text); font-size: 13px; font-weight: 500;">${cardText}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="color: var(--ans-accent); display: inline-flex; align-items: center;"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></span>
                                    <span style="color: var(--ans-accent); font-weight: 700; font-size: 14px;">${targetText}</span>
                                </div>
                            </div>
                        `;
                    }).join('');

                    answerDiv.innerHTML = `
                        <div class="match-guide-box" style="margin-top: 14px; background: var(--ans-bg); border: 1.5px solid var(--ans-border); border-radius: 10px; padding: 12px 16px; box-shadow: var(--ans-shadow-lg); text-align: left; max-width: 100%;">
                            <div style="font-weight: 800; color: var(--ans-accent); font-size: 14px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                                <span style="display:inline-flex;align-items:center;gap:6px;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                                    Match &amp; Drag Guide
                                </span>
                                <span style="font-size: 11px; font-weight: normal; color: var(--ans-text-dim);">Match numbers to categories</span>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                ${pairsHtml}
                            </div>
                        </div>
                    `;

                    const detailedPairs = typeof getDetailedMatchPairs === 'function' ? getDetailedMatchPairs(activeQuestionData) : [];

                    // Badging for Draggable Cards (Top Items)
                    const dragCandidates = Array.from(document.querySelectorAll(
                        '[draggable="true"], [data-testid^="draggable-"], .drag-item, .draggable-tile, .match-card, [class*="drag-item"], [class*="draggable"], [class*="match-option"]'
                    )).filter(el => !el.closest('#toolbar-pill') && !el.closest('.answers_menu') && el.offsetHeight > 30);

                    const cardsToBadge = (dragCandidates.length > 0 ? dragCandidates : Array.from(document.querySelectorAll('div, button')).filter(el => {
                        return el.querySelector('img') && !el.closest('#toolbar-pill') && !el.closest('.answers_menu') && el.offsetHeight > 50 && el.offsetHeight < 300 && el.offsetWidth > 50;
                    })).filter((el, i, arr) => !arr.some(other => other !== el && other.contains(el)));

                    // Match each DOM card to a pair by exact Image URL or Text or horizontal index
                    const assignedPairIndices = new Set();
                    cardsToBadge.forEach((card, domIdx) => {
                        const img = card.querySelector('img');
                        let matchedPairIdx = -1;

                        if (img && img.src && detailedPairs.length > 0) {
                            const domImgSrc = img.src.split('?')[0].split('#')[0];
                            const domFileName = domImgSrc.split('/').pop();
                            matchedPairIdx = detailedPairs.findIndex((dp, pIdx) => {
                                if (assignedPairIndices.has(pIdx) || !dp.mediaUrl) return false;
                                const cleanMedia = dp.mediaUrl.split('?')[0].split('#')[0];
                                const mediaFileName = cleanMedia.split('/').pop();
                                return domImgSrc.includes(cleanMedia) || cleanMedia.includes(domImgSrc) || (domFileName && domFileName === mediaFileName);
                            });
                        }

                        if (matchedPairIdx === -1 && detailedPairs.length > 0) {
                            const cardText = card.textContent.trim().toLowerCase();
                            if (cardText) {
                                matchedPairIdx = detailedPairs.findIndex((dp, pIdx) => {
                                    if (assignedPairIndices.has(pIdx)) return false;
                                    return dp.cardLabel && cardText.includes(dp.cardLabel.toLowerCase());
                                });
                            }
                        }

                        // Fallback to DOM index if unassigned
                        if (matchedPairIdx === -1) {
                            for (let pIdx = 0; pIdx < rawPairs.length; pIdx++) {
                                if (!assignedPairIndices.has(pIdx)) {
                                    matchedPairIdx = pIdx;
                                    break;
                                }
                            }
                        }

                        if (matchedPairIdx !== -1) {
                            assignedPairIndices.add(matchedPairIdx);
                            const badgeNum = matchedPairIdx + 1;
                            const targetName = detailedPairs[matchedPairIdx]?.targetLabel || rawPairs[matchedPairIdx]?.split('➔')[1]?.trim() || '';

                            if (!card.querySelector('.match-num-badge')) {
                                card.style.position = 'relative';
                                const badge = document.createElement('div');
                                badge.className = 'match-num-badge';
                                badge.textContent = `#${badgeNum}`;
                                badge.title = targetName ? `Drag to: ${targetName}` : `Item #${badgeNum}`;
                                badge.style.cssText = 'position: absolute; top: 6px; left: 6px; background: var(--ans-badge-bg, #2563eb); color: var(--ans-badge-color, #fff); font-weight: 900; font-size: 13px; padding: 2px 8px; border-radius: 12px; z-index: 100; box-shadow: 0 2px 6px rgba(0,0,0,0.6); pointer-events: none; border: 1.5px solid var(--ans-badge-border, #fff);';
                                card.appendChild(badge);
                            }
                        }
                    });

                    // Badging for Drop Targets (Bottom Categories or Ordered Slots)
                    rawPairs.forEach((p, idx) => {
                        const parts = p.split('➔');
                        if (parts.length === 2) {
                            const rawTargetText = parts[1].trim();
                            const targetText = rawTargetText.toLowerCase();
                            const slotMatch = rawTargetText.match(/\d+/);
                            const slotNum = slotMatch ? slotMatch[0] : null;

                            const allEls = document.querySelectorAll('button, div, p, span, h1, h2, h3, h4');
                            for (const el of allEls) {
                                if (el.children.length === 0 && !el.closest('#toolbar-pill') && !el.closest('.answers_menu')) {
                                    const text = el.textContent.trim().toLowerCase();
                                    const isMatch = (text && text === targetText) || (slotNum && text === slotNum);
                                    if (isMatch) {
                                        const targetBox = el.closest('[data-testid^="drop-zone-"]') || el.closest('.dropzone') || el.closest('.classification-bucket') || el.closest('.match-target') || el.parentElement;
                                        if (targetBox && !targetBox.querySelector(`.match-target-badge-num-${idx + 1}`)) {
                                            targetBox.style.position = 'relative';
                                            const tBadge = document.createElement('span');
                                            tBadge.className = `match-target-badge match-target-badge-num-${idx + 1}`;
                                            tBadge.textContent = `Drop #${idx + 1}`;
                                            tBadge.style.cssText = 'background: var(--ans-drop-bg, var(--theme-accent)); color: var(--ans-drop-color, #0d1117); font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 4px; margin-right: 6px; display: inline-block; pointer-events: none; box-shadow: 0 1px 4px rgba(0,0,0,0.3);';
                                            targetBox.prepend(tBadge);
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    });
                } else if (ansStr.includes('Poll') || ansStr === '-1' || ansStr.includes('Any Answer')) {
                    const svgVote = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>`;
                    answerDiv.innerHTML = `
                        <div style="margin-top: 12px; background: var(--ans-accent-muted); border: 1.5px solid var(--ans-border); border-radius: 8px; padding: 10px 14px; font-weight: bold; color: var(--ans-accent); font-size: 14px; display: flex; align-items: center; gap: 8px;">
                            ${svgVote} Poll / Opinion Question: Any answer is accepted (Full points)!
                        </div>
                    `;
                } else {
                    answerDiv.textContent = `Possible answer: ${ansStr}`;
                }

                answerDiv.style.cssText = `
                    margin-top: 12px;
                    font-weight: bold;
                    color: var(--ans-accent);
                    pointer-events: ${isBlankQuestion ? 'auto' : 'none'};
                    font-size: var(--answer-font-size, ${ANSWER_FONT_SIZE || 14}px);
                    display: ${isAnsVisible ? 'block' : 'none'};
                    opacity: ${isAnsVisible ? '1' : '0'};
                `;

                // Clean up any stray answer divs in other containers
                document.querySelectorAll('.subtle-answer-text').forEach(el => {
                    if (el !== answerDiv) el.remove();
                });
            }
            return;
        }

        const rawTargets = [];
        if (Array.isArray(expectedAnswer)) {
            expectedAnswer.forEach(item => {
                if (typeof item === 'string' && item.includes(' | ')) {
                    item.split(/\s*\|\s*/).forEach(p => {
                        const trimmed = p.trim();
                        if (trimmed) rawTargets.push(trimmed);
                    });
                } else if (item !== null && item !== undefined) {
                    rawTargets.push(item);
                }
            });
        } else if (typeof expectedAnswer === 'string') {
            if (expectedAnswer.includes(' | ')) {
                expectedAnswer.split(/\s*\|\s*/).forEach(p => {
                    const trimmed = p.trim();
                    if (trimmed) rawTargets.push(trimmed);
                });
            } else {
                rawTargets.push(expectedAnswer.trim());
            }
        } else if (expectedAnswer !== null && expectedAnswer !== undefined) {
            rawTargets.push(expectedAnswer);
        }

        const rawOfficialAns = activeQuestionData?.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData?.answer;
        if (Array.isArray(rawOfficialAns)) {
            rawOfficialAns.forEach(a => {
                if (!rawTargets.some(t => String(t) === String(a))) {
                    rawTargets.push(a);
                }
            });
        }

        const targetAnswersList = [];
        rawTargets.forEach(val => {
            const extracted = typeof extractAnswerText === 'function' ? extractAnswerText(val, rawOptions) : '';
            if (extracted && extracted !== '[object Object]') {
                if (extracted.includes(' | ')) {
                    extracted.split(/\s*\|\s*/).forEach(p => {
                        const norm = normalizeText(p);
                        if (norm) targetAnswersList.push(norm);
                    });
                } else {
                    const norm = normalizeText(extracted);
                    if (norm) targetAnswersList.push(norm);
                }
            }
            if (typeof val === 'string' && val.trim().length > 0 && val !== '[object Object]') {
                if (val.includes(' | ')) {
                    val.split(/\s*\|\s*/).forEach(p => {
                        const norm = normalizeText(p);
                        if (norm) targetAnswersList.push(norm);
                    });
                } else {
                    const norm = normalizeText(val);
                    if (norm) targetAnswersList.push(norm);
                }
            }
        });

        rawOptions.forEach((opt, idx) => {
            const optId = String(opt.id || opt._id || '');
            if (rawTargets.some(t => (optId.length > 1 && String(t) === optId) || String(t) === String(idx))) {
                if (opt.text) targetAnswersList.push(normalizeText(opt.text));
            }
        });

        let optionButtons = Array.from(document.querySelectorAll(
            'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
        ));
        optionButtons = optionButtons.filter(btn => !optionButtons.some(other => other !== btn && other.contains(btn)));

        const scoredButtons = [];

        optionButtons.forEach((btn, btnIdx) => {
            const optionTextEl = btn.querySelector('[data-highlight-block^="option:"] p') ||
                                  btn.querySelector('[data-highlight-block^="option:"]') ||
                                  btn.querySelector('.resizeable-text') ||
                                  btn.querySelector('.content-slot') ||
                                  btn.querySelector('p') ||
                                  btn;

            const domText = normalizeText(optionTextEl.textContent);
            const cleanText = domText.replace(/^[a-z0-9][.\s)]+\s*/i, '').trim();

            const cyAttr = btn.getAttribute('data-cy') || '';
            const testIdAttr = btn.getAttribute('data-testid') || '';

            let score = 0;

            rawTargets.forEach(targetId => {
                const tidStr = String(targetId).trim();
                if (tidStr && (cyAttr === `option-${tidStr}` || testIdAttr === `option-trigger-${tidStr}`)) {
                    score = isOfficialKey ? 5 : 4;
                } else if (tidStr && tidStr.length > 3 && (cyAttr.includes(tidStr) || testIdAttr.includes(tidStr))) {
                    score = 4;
                }
            });

            if (score === 0) {
                targetAnswersList.some(target => {
                    if (domText === target || cleanText === target) {
                        score = 3;
                        return true;
                    }

                    if (target.length < 2) return false;

                    const isMathPureGridStringDataNumber = /^[\d\s.,\-+]+$/.test(target);

                    if (isMathPureGridStringDataNumber) {
                        const exactEnding = domText.endsWith(target) || domText.endsWith(` ${target}`);
                        const boundedInclusion = domText.split(/[\s,.)-]/).includes(target.replace(/[\s,.)-]/g, ''));

                        if (exactEnding || boundedInclusion) score = 2;
                        return (score > 0);
                    }

                    if (domText.includes(target) || cleanText.includes(target) || target.includes(cleanText)) {
                        score = 1;
                        return true;
                    }
                });
            }

            if (score === 0 && rawTargets.some(t => String(t) === String(btnIdx))) {
                score = isOfficialKey ? 4 : 0.5;
            }

            if (score > 0) {
                scoredButtons.push({ btn, score, domText });
            }
        });

        const isPoll = expectedAnswer === -1 ||
                       String(expectedAnswer).toLowerCase().includes('poll') ||
                       String(expectedAnswer).toLowerCase().includes('any answer');

        const instructionText = document.querySelector('[data-testid="question-instruction-text"]')?.textContent?.toLowerCase() ||
                                document.querySelector('.question-instruction')?.textContent?.toLowerCase() ||
                                document.querySelector('.question-instruction-container')?.textContent?.toLowerCase() || '';

        const isMSQ = qType === 'MSQ' ||
                      activeQuestionData?.type === 'MSQ' ||
                      activeQuestionData?.structure?.kind === 'MSQ' ||
                      activeQuestionData?.structure?.settings?.hasMultipleCorrectAnswers === true ||
                      activeQuestionData?.structure?.settings?.canSelectMultiple === true ||
                      targetAnswersList.length > 1 ||
                      rawTargets.length > 1 ||
                      (typeof expectedAnswer === 'string' && expectedAnswer.includes(' | ')) ||
                      instructionText.includes('select all') ||
                      currentStemText.includes('select all') ||
                      (document.body.innerText && document.body.innerText.toLowerCase().includes('select all correct')) ||
                      document.querySelectorAll('.options-grid input[type="checkbox"], [data-testid^="option-trigger-"] [type="checkbox"]').length > 0;

        let matchedButtons = [];
        if (isPoll && optionButtons.length > 0) {
            matchedButtons = optionButtons;
        } else if (isMSQ) {
            const matchedSet = new Set();
            scoredButtons.forEach(s => {
                if (s.score > 0) {
                    matchedSet.add(s.btn);
                }
            });

            optionButtons.forEach(btn => {
                const textEl = btn.querySelector('[data-highlight-block^="option:"] p') ||
                               btn.querySelector('[data-highlight-block^="option:"]') ||
                               btn.querySelector('.resizeable-text') ||
                               btn.querySelector('.content-slot') ||
                               btn.querySelector('p') || btn;
                const domT = normalizeText(textEl.textContent);
                const cleanT = domT.replace(/^[a-z0-9][.\s)]+\s*/i, '').trim();
                if (targetAnswersList.some(target => domT === target || cleanT === target || (target.length > 2 && (domT.includes(target) || target.includes(cleanT))))) {
                    matchedSet.add(btn);
                }
            });

            matchedButtons = Array.from(matchedSet);
        } else if (scoredButtons.length > 0) {
            const maxScore = Math.max(...scoredButtons.map(s => s.score));
            const bestButtons = scoredButtons.filter(s => s.score === maxScore).map(s => s.btn);
            matchedButtons = [bestButtons[0]];
        }

        document.querySelectorAll('.ans-check').forEach(el => el.remove());
        clearStealthDisabled();

        matchedButtons.forEach(btn => {
            if (!isAnsVisible) return;

            if (MCQ_MODE === 'cursor') {
                ensureStealthStyles();
                const cursorVal = MCQ_CURSOR || 'not-allowed';
                btn.classList.add('ans-cursor-target');
                btn.style.setProperty('--stealth-cursor', cursorVal);
                btn.style.setProperty('cursor', cursorVal, 'important');
                btn.style.setProperty('pointer-events', 'auto', 'important');
                btn.querySelectorAll('*').forEach(child => {
                    child.style.setProperty('cursor', cursorVal, 'important');
                    child.style.setProperty('pointer-events', 'auto', 'important');
                });
            } else if (MCQ_MODE === 'grayscale') {
                ensureStealthStyles();
                const opacityVal = Math.max(0.1, Math.min(0.9, (Number(GRAYSCALE_OPACITY) || 55) / 100)).toFixed(2);
                const targetContainer = btn.querySelector('.rounded-assessment-lg') || btn;

                btn.classList.add('ans-grayscale-target');
                btn.style.setProperty('--grayscale-opacity', opacityVal);
                btn.style.setProperty('opacity', opacityVal, 'important');
                btn.style.setProperty('filter', 'grayscale(45%) contrast(85%)', 'important');
                btn.style.setProperty('pointer-events', 'auto', 'important');

                if (targetContainer && targetContainer !== btn) {
                    targetContainer.classList.add('ans-grayscale-target');
                    targetContainer.style.setProperty('--grayscale-opacity', opacityVal);
                    targetContainer.style.setProperty('opacity', opacityVal, 'important');
                    targetContainer.style.setProperty('filter', 'grayscale(45%) contrast(85%)', 'important');
                    targetContainer.style.setProperty('pointer-events', 'auto', 'important');
                }
            } else {
                if (!btn.querySelector('.ans-check')) {
                    const checkmark = document.createElement('span');
                    checkmark.className = 'ans-check';
                    checkmark.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><polyline points="20 6 9 17 4 12"/></svg>`;
                    checkmark.style.cssText = `
                        position: absolute;
                        color: var(--ans-accent);
                        top: 8px;
                        right: 12px;
                        pointer-events: none;
                        z-index: 100;
                        opacity: ${isAnsVisible ? '1' : '0'};
                        transition: opacity 0.2s ease-in-out;
                    `;

                    const targetContainer = btn.querySelector('.rounded-assessment-lg') || btn;
                    const computedPos = window.getComputedStyle(targetContainer).position;
                    if (computedPos === 'static') {
                        targetContainer.style.position = 'relative';
                    }
                    targetContainer.appendChild(checkmark);
                }
            }
        });

        if (AUTO_CLICK && !hasAutoClickedCurrent && matchedButtons.length > 0) {
            hasAutoClickedCurrent = true;
            const currentQuestionId = domQuesId || currentStemText;

            setTimeout(() => {
                if (lastProcessedStem === currentQuestionId) {
                    matchedButtons.forEach(btn => {
                        if (document.body.contains(btn)) {
                            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                            btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                            btn.click();
                        }
                    });
                }
            }, AUTO_CLICK_DELAY);
        }
    }
    const observer = new MutationObserver(() => {
        try {
            if (!isHighlightScheduled) {
                isHighlightScheduled = true;
                requestAnimationFrame(() => {
                    isHighlightScheduled = false;
                    instantHighlight();
                });
            }
        } catch (e) {
            console.error("MutationObserver error:", e);
        }
    });

    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

    setInterval(() => { if(isAnsVisible) requestAnimationFrame(instantHighlight); }, 1250);
