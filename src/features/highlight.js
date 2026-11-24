    let isHighlightScheduled = false;
    let lastProcessedStem = null;

    function instantHighlight() {
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
            if (typeof formatMatchOrOrderAnswer === 'function') {
                const matchAns = formatMatchOrOrderAnswer(activeQuestionData);
                if (matchAns) {
                    expectedAnswer = matchAns;
                    isOfficialKey = true;
                }
            }
            if (expectedAnswer === null || expectedAnswer === undefined) {
                const officialAns = activeQuestionData.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData.answer;
                if (officialAns !== undefined && officialAns !== null) {
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

        if (expectedAnswer === null || expectedAnswer === undefined) return;

        const qType = activeQuestionData?.type || activeQuestionData?.structure?.kind || 'MCQ';
        const rawOptions = activeQuestionData?.options || activeQuestionData?.structure?.options || [];

        const isChoiceActiveVisuals = document.querySelectorAll(
            'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
        ).length > 0;

        if (qType === 'BLANK' || qType === 'OPEN' || qType === 'MATCH' || qType === 'CLASSIFICATION' || qType === 'ORDER' || (rawOptions.length === 0 && !isChoiceActiveVisuals)) {
            const textContainer = document.querySelector('[data-testid="text-renderer"]') ||
                                  document.querySelector('.drag-drop-text div') ||
                                  document.querySelector('.h-full .flex .flex-col .gap-4') ||
                                  document.querySelector('.p-4.sm\\:p-6') ||
                                  document.querySelector('.text-area-container') ||
                                  document.querySelector('[data-testid="typed-response-input"]') ||
                                  stemEl?.parentElement;

            if (textContainer) {
                let ansStr = '';

                if (typeof formatMatchOrOrderAnswer === 'function' && activeQuestionData) {
                    ansStr = formatMatchOrOrderAnswer(activeQuestionData) || '';
                }

                if (!ansStr && expectedAnswer) {
                    ansStr = typeof extractAnswerText === 'function' ? extractAnswerText(expectedAnswer, rawOptions) : String(expectedAnswer);
                }

                // If still empty or failed, try extracting directly from activeQuestionData
                if (!ansStr || ansStr === '[object Object]') {
                    const backupAns = activeQuestionData?.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData?.answer;
                    if (typeof extractAnswerText === 'function') {
                        ansStr = extractAnswerText(backupAns, rawOptions);
                    }
                }
                if (!ansStr || ansStr === '[object Object]') {
                    if (rawOptions && rawOptions.length > 0) {
                        ansStr = rawOptions.map(o => (typeof extractAnswerText === 'function' ? extractAnswerText(o) : '')).filter(Boolean).join(' | ');
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

                if (ansStr.includes('➔')) {
                    const rawPairs = ansStr.split(/\s*\|\s*/).map(p => p.trim()).filter(Boolean);
                    let pairsHtml = rawPairs.map((p, idx) => {
                        const parts = p.split('➔');
                        const cardText = parts[0]?.trim() || `Item #${idx + 1}`;
                        const targetText = parts[1]?.trim() || '';
                        return `
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="background: #2563eb; color: #fff; font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 10px; white-space: nowrap;">#${idx + 1}</span>
                                    <span style="color: #e2e8f0; font-size: 13px; font-weight: 500;">${cardText}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="color: var(--color-picked-user, #39be44); font-weight: bold;">➔</span>
                                    <span style="color: var(--color-picked-user, #39be44); font-weight: 700; font-size: 14px;">${targetText}</span>
                                </div>
                            </div>
                        `;
                    }).join('');

                    answerDiv.innerHTML = `
                        <div class="match-guide-box" style="margin-top: 14px; background: rgba(15, 23, 42, 0.95); border: 1.5px solid var(--color-picked-user, #39be44); border-radius: 10px; padding: 12px 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); text-align: left; max-width: 100%;">
                            <div style="font-weight: 800; color: var(--color-picked-user, #39be44); font-size: 14px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                                <span>🎯 Match &amp; Drag-and-Drop Guide:</span>
                                <span style="font-size: 11px; font-weight: normal; color: #94a3b8;">Match numbers to categories</span>
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
                                badge.style.cssText = 'position: absolute; top: 6px; left: 6px; background: #2563eb; color: #fff; font-weight: 900; font-size: 13px; padding: 2px 8px; border-radius: 12px; z-index: 100; box-shadow: 0 2px 6px rgba(0,0,0,0.6); pointer-events: none; border: 1.5px solid #fff;';
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
                                            tBadge.style.cssText = 'background: #39be44; color: #000; font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 4px; margin-right: 6px; display: inline-block; pointer-events: none; box-shadow: 0 1px 4px rgba(0,0,0,0.3);';
                                            targetBox.prepend(tBadge);
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    });
                } else if (ansStr.includes('Poll') || ansStr === '-1' || ansStr.includes('Any Answer')) {
                    answerDiv.innerHTML = `
                        <div style="margin-top: 12px; background: rgba(57, 190, 68, 0.15); border: 1.5px solid var(--color-picked-user, #39be44); border-radius: 8px; padding: 10px 14px; font-weight: bold; color: var(--color-picked-user, #39be44); font-size: 14px;">
                            🗳️ Poll / Opinion Question: Any answer is accepted (Full points)!
                        </div>
                    `;
                } else {
                    answerDiv.textContent = `Possible answer: ${ansStr}`;
                }

                answerDiv.style.cssText = `
                    margin-top: 12px;
                    font-weight: bold;
                    color: var(--color-picked-user, #39be44);
                    pointer-events: none;
                    font-size: 15px;
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
