    // ==========================================
    // INSTANT HIGHLIGHTING & DOM RESOLUTION ENGINE
    // ==========================================
    let isHighlightScheduled = false;
    let lastProcessedStem = null;

    function instantHighlight() {
        // Fast Memory Resync: Only query browser storage if memory is currently unlinked (prevents loop lag)
        if (!AI_DATA && !savedQuestions && !CACHED_RESULTS) {
            const routeDataRef = QUIZ_DATA?._id || QUIZ_DATA?.id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
            const memoryTransitStore = GM_getValue(`${routeDataRef}`, null) || GM_getValue("active_quiz", null);

            if (memoryTransitStore && memoryTransitStore.answers) {
                AI_DATA = memoryTransitStore.answers;
            }
        }

        if (!savedQuestions && !AI_DATA && !CACHED_RESULTS) return;

        // 1. Locate Question Stem on Screen
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

        // Clean up stale checkmarks on question change
        if (lastProcessedStem !== (domQuesId || currentStemText)) {
            document.querySelectorAll('.ans-check').forEach(el => el.remove());
            document.querySelectorAll('.subtle-answer-text').forEach(el => el.remove());
            lastProcessedStem = domQuesId || currentStemText;
            hasAutoClickedCurrent = false;
        }

        let activeQuestionData = null;
        let expectedAnswer = null;

        // 2. Multi-tier Active Question Resolution (PRIORITY 1: Match Answer Box 100%)
        let isOfficialKey = false;

        // TIER 1: Sync directly with the Answer Box (Guarantees checkmark matches the 5/5 answers in the box!)
        if (CACHED_RESULTS && currentStemText) {
            for (const [qText, ans] of Object.entries(CACHED_RESULTS)) {
                const normQ = normalizeText(qText);
                if (normQ && (normQ === currentStemText || normQ.includes(currentStemText) || currentStemText.includes(normQ))) {
                    if (ans && ans !== "Answer not found") {
                        expectedAnswer = ans;
                        isOfficialKey = true; // Takes top priority over any AI guesses
                        break;
                    }
                }
            }
        }

        // TIER 2: Official Quizizz Database fallback (savedQuestions)
        if ((expectedAnswer === null || expectedAnswer === undefined) && savedQuestions) {
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
            if (activeQuestionData) {
                const officialAns = activeQuestionData.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData.answer;
                if (officialAns !== undefined && officialAns !== null) {
                    expectedAnswer = officialAns;
                    isOfficialKey = true;
                }
            }
        }

        // TIER 3: AI Data fallback (Only used if no answers exist in the box or database)
        if (!isOfficialKey && (expectedAnswer === null || expectedAnswer === undefined) && AI_DATA) {
            if (domQuesId && AI_DATA[domQuesId] !== undefined) {
                expectedAnswer = AI_DATA[domQuesId];
                activeQuestionData = CLEANED_QUESTIONS?.[domQuesId];
            } else if (currentStemText && CLEANED_QUESTIONS) {
                for (const [qId, qData] of Object.entries(CLEANED_QUESTIONS)) {
                    const qText = normalizeText(qData.question);
                    if (qText && (qText === currentStemText || qText.includes(currentStemText) || currentStemText.includes(qText))) {
                        expectedAnswer = AI_DATA[qId];
                        activeQuestionData = qData;
                        break;
                    }
                }
            }
        }

        if (expectedAnswer === null || expectedAnswer === undefined) return;

        // 3. Handle Fill-in-the-Blank and Open Questions
        const qType = activeQuestionData?.type || activeQuestionData?.structure?.kind || 'MCQ';
        const rawOptions = activeQuestionData?.options || activeQuestionData?.structure?.options || [];

        // Determine if choice squares are physically active across Single-Page view changes
        const isChoiceActiveVisuals = document.querySelectorAll(
            'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
        ).length > 0;

        if (qType === 'BLANK' || qType === 'OPEN' || (rawOptions.length === 0 && !isChoiceActiveVisuals)) {
            const textContainer = document.querySelector('[data-testid="text-renderer"]') ||
                                  document.querySelector('.drag-drop-text div') ||
                                  document.querySelector('.h-full .flex .flex-col .gap-4') ||
                                  document.querySelector('.p-4.sm\\:p-6') ||
                                  stemEl?.parentElement;

            if (textContainer && !textContainer.querySelector('.subtle-answer-text')) {
                let ansStr = '';
                if (Array.isArray(expectedAnswer)) {
                    ansStr = expectedAnswer.join(' | ');
                } else if (typeof expectedAnswer === 'number' && rawOptions[expectedAnswer]) {
                    ansStr = stripHtml(rawOptions[expectedAnswer].text);
                } else {
                    ansStr = stripHtml(String(expectedAnswer));
                }

                const answerDiv = document.createElement('div');
                answerDiv.className = 'subtle-answer-text';
                answerDiv.textContent = `Possible answer: ${ansStr}`;
                answerDiv.style.cssText = `
                    margin-top: 12px;
                    font-weight: bold;
                    color: var(--color-picked-user, #39be44);
                    pointer-events: none;
                    font-size: 15px;
                    display: ${isAnsVisible ? 'block' : 'none'};
                    opacity: ${isAnsVisible ? '1' : '0'};
                `;
                textContainer.appendChild(answerDiv);
            }
            return;
        }

        // 4. Resolve Target Option Texts & Identifiers
        const targetAnswersList = [];
        const rawTargets = Array.isArray(expectedAnswer) ? expectedAnswer : [expectedAnswer];

        rawTargets.forEach(val => {
            if (typeof val === 'string' && val.trim().length > 0) {
                targetAnswersList.push(normalizeText(val));
            }
        });

        rawOptions.forEach((opt, idx) => {
            const optId = String(opt.id || opt._id || '');
            if (rawTargets.some(t => (optId.length > 1 && String(t) === optId) || String(t) === String(idx))) {
                if (opt.text) targetAnswersList.push(normalizeText(opt.text));
            }
        });

        // 5. Select Option Elements (Cleaned of nested parent duplicates)
        let optionButtons = Array.from(document.querySelectorAll(
            'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
        ));
        optionButtons = optionButtons.filter(btn => !optionButtons.some(other => other !== btn && other.contains(btn)));

        // Ultimate Accuracy Engine (Fixes: Sequence "2,3,4" bleed | Identifies Code words like lst[0] effortlessly)
        const scoredButtons = [];

        optionButtons.forEach((btn, btnIdx) => {
            const optionTextEl = btn.querySelector('[data-highlight-block^="option:"] p') ||
                                  btn.querySelector('[data-highlight-block^="option:"]') ||
                                  btn.querySelector('.resizeable-text') ||
                                  btn.querySelector('.content-slot') ||
                                  btn.querySelector('p') ||
                                  btn;

            // Grab dirty DOM representation and a super cleaned variant removing localized addon labels natively
            const domText = normalizeText(optionTextEl.textContent);
            // This intelligently separates '1' hotkeys floating onto quiz boundaries like '1 lst[0]' dynamically.
            const cleanText = domText.replace(/^[a-z0-9][.\s)]+\s*/i, '').trim();

            const cyAttr = btn.getAttribute('data-cy') || '';
            const testIdAttr = btn.getAttribute('data-testid') || '';

            let score = 0;

            // Level A: Official Server Key Match (Like v2.0.0: marks data-cy="option-X" directly)
            rawTargets.forEach(targetId => {
                const tidStr = String(targetId).trim();
                if (tidStr && (cyAttr === `option-${tidStr}` || testIdAttr === `option-trigger-${tidStr}`)) {
                    score = isOfficialKey ? 5 : 4; // Official server index gets highest absolute priority
                } else if (tidStr && tidStr.length > 3 && (cyAttr.includes(tidStr) || testIdAttr.includes(tidStr))) {
                    score = 4; // Long ID match
                }
            });

            // Level B: Precise Text Evaluators
            if (score === 0) {
                targetAnswersList.some(target => {
                    // Priority 3: Exact Text Match
                    if (domText === target || cleanText === target) {
                        score = 3;
                        return true;
                    }

                    if (target.length < 2) return false;

                    // Strictly parse numerical grids (prevents "2,3,4" bleed into "2,3,4,5")
                    const isMathPureGridStringDataNumber = /^[\d\s.,\-+]+$/.test(target);

                    if (isMathPureGridStringDataNumber) {
                        const exactEnding = domText.endsWith(target) || domText.endsWith(` ${target}`);
                        const boundedInclusion = domText.split(/[\s,.)-]/).includes(target.replace(/[\s,.)-]/g, ''));

                        if (exactEnding || boundedInclusion) score = 2;
                        return (score > 0);
                    }

                    // Priority 1: Soft fallback parsing for code components and sentences (like lst[0])
                    if (domText.includes(target) || cleanText.includes(target) || target.includes(cleanText)) {
                        score = 1;
                        return true;
                    }
                });
            }

            // Level C: Positional Array alignment mapping (visual index)
            if (score === 0 && rawTargets.some(t => String(t) === String(btnIdx))) {
                score = isOfficialKey ? 4 : 0.5;
            }

            if (score > 0) {
                scoredButtons.push({ btn, score, domText });
            }
        });

        let matchedButtons = [];
        if (scoredButtons.length > 0) {
            // Find the highest score achieved (e.g. 3 for exact text match)
            const maxScore = Math.max(...scoredButtons.map(s => s.score));
            // Only keep buttons that scored the highest priority
            const bestButtons = scoredButtons.filter(s => s.score === maxScore).map(s => s.btn);

            if (qType !== 'MSQ' && bestButtons.length > 1) {
                matchedButtons = [bestButtons[0]];
            } else {
                matchedButtons = bestButtons;
            }
        }

        // Wipe any previous checkmarks before rendering new ones
        document.querySelectorAll('.ans-check').forEach(el => el.remove());

        // Render checkmark strictly on the winning button
        matchedButtons.forEach(btn => {
            if (!btn.querySelector('.ans-check')) {
                const checkmark = document.createElement('span');
                checkmark.className = 'ans-check';
                checkmark.innerHTML = '&#10003;';
                checkmark.style.cssText = `
                    position: absolute;
                    color: var(--color-picked-user, #39be44);
                    top: 8px;
                    right: 12px;
                    font-size: 26px;
                    font-weight: bold;
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
        });

        // 6. Safe Auto-Click Trigger with Human-like Delay
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
    // 6. Optimized Mutation Observer
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

    // Interval ensures single page framework rerouting (V-Dom rendering drops bypassing classical parent object triggers seamlessly fallback safety checks optimal processing efficiency routing check ticks correctly continually intelligently actively gracefully optimally perfectly.)
    setInterval(() => { if(isAnsVisible) requestAnimationFrame(instantHighlight); }, 1250);
