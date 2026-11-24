    let shadow = null;
    let renderAnswersList = () => {};

    function toLoad() {
        try {
            const mainBody = document.body;
            let html = null;

            if (mainBody) {
                html = document.documentElement;
                html.style.setProperty('--color-picked-user', '#4579f2');
                html.style.setProperty('--color-highlight', 'currentColor');
            } else {
                console.warn("Could not access the iframe");
            }

            const host = document.createElement('div');
            host.id = 'wayground-host';
            if(mainBody) { mainBody.appendChild(host); }
            shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `
@@UI_CSS@@@@UI_HTML@@            `;

            const searchInput = shadow.querySelector('#search-input');
            const answersList = shadow.querySelector('#answers-list');

            function escapeHtml(str) {
                if (typeof str !== 'string') {
                    if (typeof str === 'object' && str !== null) {
                        try { str = JSON.stringify(str); } catch (e) { str = String(str); }
                    } else {
                        str = String(str ?? '');
                    }
                }
                return str.replace(/&/g, '&amp;')
                          .replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;')
                          .replace(/"/g, '&quot;')
                          .replace(/'/g, '&#039;');
            }

            renderAnswersList = function(answersMap, source = 'OFFICIAL') {
                const listEl = shadow ? shadow.querySelector('#answers-list') : null;
                const countBadge = shadow ? shadow.querySelector('#answers-count-badge') : null;
                if (!listEl) return;

                if (!answersMap || Object.keys(answersMap).length === 0) {
                    listEl.innerHTML = `
                        <div class="answers-empty-state">
                            <svg class="answers-empty-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-2"/><path d="M10 17H8"/><path d="M16 17h-2"/></svg>
                            <p class="answers-empty-title">No answers yet</p>
                            <p class="answers-empty-sub">Answers will appear here once a quiz begins</p>
                        </div>
                    `;
                    if (countBadge) countBadge.textContent = '0';
                    return;
                }

                const entries = Object.entries(answersMap);
                if (countBadge) countBadge.textContent = String(entries.length);

                listEl.innerHTML = entries.map(([question, answer], idx) => {
                    const cleanAnswer = (typeof extractAnswerText === 'function' ? extractAnswerText(answer) : '') || answer;
                    const displayAns = (cleanAnswer && cleanAnswer !== '[object Object]') ? cleanAnswer : 'Answer not found';
                    return `
                    <div class="answer-item" data-index="${idx}">
                        <div class="answer-header-row">
                            <span class="answer-q-tag">Q${idx + 1}</span>
                            <span class="answer-source-tag">${escapeHtml(source)}</span>
                        </div>
                        <p class="answer-question-text">${escapeHtml(question)}</p>
                        <div class="answer-divider"></div>
                        <div class="answer-body-row">
                            <span class="answer-pill-label">ANS</span>
                            <p class="answer-val-text">${escapeHtml(displayAns)}</p>
                        </div>
                    </div>
                `;
                }).join('');

                listEl.querySelectorAll('.answer-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const isSel = item.classList.contains('selected');
                        listEl.querySelectorAll('.answer-item.selected').forEach(el => el.classList.remove('selected'));
                        if (!isSel) {
                            item.classList.add('selected');
                            const val = item.querySelector('.answer-val-text')?.textContent || '';
                            if (val && navigator.clipboard) {
                                navigator.clipboard.writeText(val).then(() => {
                                    showNotification("Copied answer to clipboard!", "#39be44");
                                }).catch(() => {});
                            }
                        }
                    });
                });

                if (searchInput && searchInput.value) {
                    searchInput.dispatchEvent(new Event('input'));
                }
            };

            if (searchInput && answersList) {
                searchInput.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase().trim();
                    const items = answersList.querySelectorAll('.answer-item');
                    let visibleCount = 0;

                    items.forEach(item => {
                        const textContent = item.textContent.toLowerCase();
                        const matches = !searchTerm || textContent.includes(searchTerm);
                        item.style.display = matches ? 'flex' : 'none';
                        if (matches) visibleCount++;
                    });

                    let noMatchEl = answersList.querySelector('.answers-no-match');
                    if (searchTerm && visibleCount === 0 && items.length > 0) {
                        if (!noMatchEl) {
                            noMatchEl = document.createElement('div');
                            noMatchEl.className = 'answers-no-match';
                            noMatchEl.innerHTML = `
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                <p class="answers-empty-title">No matching answers</p>
                                <p class="answers-empty-sub">Try searching with different keywords</p>
                            `;
                            answersList.appendChild(noMatchEl);
                        }
                        noMatchEl.style.display = 'flex';
                    } else if (noMatchEl) {
                        noMatchEl.style.display = 'none';
                    }

                    const countBadge = shadow.querySelector('#answers-count-badge');
                    if (countBadge && items.length > 0) {
                        countBadge.textContent = searchTerm ? `${visibleCount}/${items.length}` : `${items.length}`;
                    }
                });
            }

            const configBtn = shadow.querySelector('#config');
            const closeSettings = shadow.querySelector('#close-settings');
            const settingsMenu = shadow.querySelector('.settings_menu');
            const cards = shadow.querySelectorAll('.tb-btn');
            const colorPicker = shadow.querySelector('#color-picker');
            const termsBtn = shadow.querySelector('#btn-terms');
            const closeTerms = shadow.querySelector('#close-terms');
            const termsMenu = shadow.querySelector('.terms_menu');
            const apikeyBtn = shadow.querySelector('#btn-apikey');
            const apikeyBtnconfig = shadow.querySelector('#btn-apikeyconfig');
            const closeApikey = shadow.querySelector('#close-apikey');
            const apikeyMenu = shadow.querySelector('.apikey_menu');
            const btnAnswers = shadow.querySelector('#btn-answers');
            const closeAnswers = shadow.querySelector('#close-answers');
            const answersMenu = shadow.querySelector('.answers_menu');

            function setPanelState(panelEl, open, triggerBtnEl) {
                if (!panelEl) return;
                panelEl.classList.toggle('open', open);
                panelEl.inert = !open;
                if (open) {
                    panelEl.removeAttribute('aria-hidden');
                    if (triggerBtnEl) {
                        triggerBtnEl.classList.add('active');
                        positionPanel(panelEl, triggerBtnEl);
                    }
                } else {
                    panelEl.setAttribute('aria-hidden', 'true');
                    if (triggerBtnEl) triggerBtnEl.classList.remove('active');
                    if (panelEl.contains(document.activeElement)) document.activeElement.blur();
                    if (shadow && panelEl.contains(shadow.activeElement)) shadow.activeElement.blur();
                }
            }

            const toggleMenu = (open) => setPanelState(settingsMenu, open, configBtn);
            const toggleTerms = (open) => setPanelState(termsMenu, open, configBtn);
            const toggleApikey = (open) => setPanelState(apikeyMenu, open, apikeyBtn);
            const toggleAnswers = (open) => setPanelState(answersMenu, open, btnAnswers);

            let isDragging = false;
            let isPointerDown = false;
            let dragStartX = 0;
            let dragStartY = 0;
            let initialToolbarX = 0;
            let initialToolbarY = 0;
            let currentX = null;
            let currentY = null;

            const dragTarget = typeof shadow !== 'undefined' && shadow.host ? shadow.host : shadow.querySelector('.main');

            if (dragTarget) {
                dragTarget.style.position = 'fixed';
                dragTarget.style.zIndex = '99999';
            }

            function updateMenuDirection() {
                if (!main) return;
                const pillH = toolbarPill ? (toolbarPill.offsetHeight || 240) : 240;
                const shouldOpenBelow = (currentY !== null && currentY < (pillH + 16));
                main.classList.toggle('open-below', shouldOpenBelow);
            }

            function clampToolbarToViewport() {
                if (!dragTarget) return;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const MARGIN = 8;
                const maxLeft = Math.max(MARGIN, vw - 42 - MARGIN);
                const maxTop = Math.max(MARGIN, vh - 42 - MARGIN);

                if (currentX === null || currentY === null) {
                    const rect = dragTarget.getBoundingClientRect();
                    currentX = rect.left || (vw - 42 - 16);
                    currentY = rect.top || (vh - 42 - 16);
                }

                currentX = Math.max(MARGIN, Math.min(currentX, maxLeft));
                currentY = Math.max(MARGIN, Math.min(currentY, maxTop));

                dragTarget.style.left = Math.round(currentX) + 'px';
                dragTarget.style.top = Math.round(currentY) + 'px';
                dragTarget.style.right = 'auto';
                dragTarget.style.bottom = 'auto';

                updateMenuDirection();
                repositionOpenPanels();
            }

            function initToolbarPosition() {
                if (!dragTarget) return;
                const savedPos = GM_getValue("toolbarPos", null);
                const w = 42;
                const h = 42;
                const vw = window.innerWidth;
                const vh = window.innerHeight;

                if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
                    currentX = savedPos.x;
                    currentY = savedPos.y;
                } else {
                    currentX = vw - w - 16;
                    currentY = vh - h - 16;
                }
                clampToolbarToViewport();
            }

            function onPointerDown(e) {
                if (isPointerDown) return;
                if (e.button !== 0 && e.pointerType === 'mouse') return;

                const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
                const rawTarget = (path.length > 0 && path[0] instanceof Element) ? path[0] : e.target;
                const targetEl = (rawTarget instanceof Element) ? rawTarget : (rawTarget?.parentElement || null);
                if (!targetEl) return;

                const interactive = targetEl.closest(
                    '.settings_menu, .terms_menu, .apikey_menu, .answers_menu, .tb-btn, input, select, textarea, label, a, button, .panel-close-btn, .stepper-btn'
                );
                if (interactive) return;

                const draggable = targetEl.closest('.drag-handle, .toolbar-pill, .trigger-wrap');
                if (!draggable) return;

                isPointerDown = true;
                isDragging = false;
                dragStartX = e.clientX;
                dragStartY = e.clientY;

                if (typeof currentX === 'number' && typeof currentY === 'number') {
                    initialToolbarX = currentX;
                    initialToolbarY = currentY;
                } else {
                    const rect = dragTarget.getBoundingClientRect();
                    initialToolbarX = rect.left;
                    initialToolbarY = rect.top;
                }

                window.addEventListener('pointermove', onPointerMove, { passive: false });
                window.addEventListener('pointerup', onPointerUp);
                window.addEventListener('pointercancel', onPointerUp);
            }

            function onPointerMove(e) {
                if (!isPointerDown) return;

                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;

                if (!isDragging) {
                    if (Math.hypot(dx, dy) >= 4) {
                        isDragging = true;
                        document.body.style.userSelect = 'none';
                        document.body.style.webkitUserSelect = 'none';
                        dragTarget.style.cursor = 'grabbing';
                        hideTooltip();
                    } else {
                        return;
                    }
                }

                e.preventDefault();

                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const MARGIN = 8;

                let newX = initialToolbarX + dx;
                let newY = initialToolbarY + dy;

                const maxLeft = Math.max(MARGIN, vw - 42 - MARGIN);
                const maxTop = Math.max(MARGIN, vh - 42 - MARGIN);

                newX = Math.max(MARGIN, Math.min(newX, maxLeft));
                newY = Math.max(MARGIN, Math.min(newY, maxTop));

                currentX = newX;
                currentY = newY;

                dragTarget.style.left = Math.round(newX) + 'px';
                dragTarget.style.top = Math.round(newY) + 'px';
                dragTarget.style.right = 'auto';
                dragTarget.style.bottom = 'auto';

                updateMenuDirection();
                repositionOpenPanels();
            }

            function onPointerUp(e) {
                if (!isPointerDown) return;
                isPointerDown = false;

                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointercancel', onPointerUp);

                document.body.style.userSelect = '';
                document.body.style.webkitUserSelect = '';
                dragTarget.style.cursor = '';

                if (isDragging) {
                    GM_setValue("toolbarPos", { x: currentX, y: currentY });

                    const swallowClick = (clickEvt) => {
                        clickEvt.preventDefault();
                        clickEvt.stopPropagation();
                        clickEvt.stopImmediatePropagation();
                        window.removeEventListener('click', swallowClick, true);
                        if (shadow) shadow.removeEventListener('click', swallowClick, true);
                    };
                    window.addEventListener('click', swallowClick, true);
                    if (shadow) shadow.addEventListener('click', swallowClick, true);

                    setTimeout(() => {
                        isDragging = false;
                    }, 100);
                }
            }

            shadow?.addEventListener('pointerdown', onPointerDown);
            if (dragTarget && dragTarget !== shadow) {
                dragTarget.addEventListener('pointerdown', onPointerDown);
            }

            const main = shadow.querySelector('.main');
            const toggleMenuBtn = shadow.querySelector('#toggle-menu-btn');
            const toolbarPill = shadow.querySelector('#toolbar-pill');
            const toolbarDragHandle = shadow.querySelector('#toolbar-drag-handle');
            toggleMenuBtn?.addEventListener('pointerdown', onPointerDown);
            toolbarDragHandle?.addEventListener('pointerdown', onPointerDown);
            toolbarPill?.addEventListener('pointerdown', onPointerDown);
            let idleTimer = null;
            let pillTransitionTimer = null;

            function closeAllSubmenus() {
                toggleMenu(false);
                toggleTerms(false);
                toggleApikey(false);
                toggleAnswers(false);
                configBtn?.classList.remove('active');
                apikeyBtn?.classList.remove('active');
                btnAnswers?.classList.remove('active');
            }

            function setMainOpen(open) {
                clearTimeout(pillTransitionTimer);
                if (open) {
                    closeAllSubmenus();
                    updateMenuDirection();
                    if (toolbarPill) {
                        toolbarPill.style.display = 'flex';
                        toolbarPill.inert = false;
                        toolbarPill.removeAttribute('aria-hidden');
                        void toolbarPill.offsetHeight;
                    }
                    main.classList.add('menu-open');
                } else {
                    main.classList.remove('menu-open');
                    if (toolbarPill) {
                        toolbarPill.inert = true;
                        toolbarPill.setAttribute('aria-hidden', 'true');
                        if (toolbarPill.contains(document.activeElement)) document.activeElement.blur();
                        if (shadow && toolbarPill.contains(shadow.activeElement)) shadow.activeElement.blur();
                    }
                    closeAllSubmenus();
                    hideTooltip();
                    pillTransitionTimer = setTimeout(() => {
                        if (!main.classList.contains('menu-open') && toolbarPill) {
                            toolbarPill.style.display = 'none';
                        }
                    }, 240);
                }
                resetIdleTimer();
            }

            function resetIdleTimer() {
                main.classList.remove('idle');
                clearTimeout(idleTimer);
                const panelOpen = shadow.querySelector('.settings_menu.open, .terms_menu.open, .apikey_menu.open, .answers_menu.open');
                if (!panelOpen && main.classList.contains('menu-open')) {
                    idleTimer = setTimeout(() => main.classList.add('idle'), 3000);
                }
            }

            // Smart panel positioning with strict viewport boundaries
            function positionPanel(panelEl, triggerBtnEl) {
                if (!panelEl || !triggerBtnEl) return;
                const isAnswers = panelEl.classList.contains('answers_menu');
                const GAP = 10;
                const MARGIN = 10;
                const vw = window.innerWidth;
                const vh = window.innerHeight;

                const preferredW = isAnswers ? 320 : 290;
                const panelW = Math.min(preferredW, vw - 2 * MARGIN);
                panelEl.style.width = Math.round(panelW) + 'px';

                const triggerRect = triggerBtnEl.getBoundingClientRect();
                const preferredH = 480;
                const maxAvailableH = vh - 2 * MARGIN;

                // Vertical space: priority 1 downward, priority 2 upward
                const spaceBelow = vh - triggerRect.top - MARGIN;
                const spaceAbove = triggerRect.bottom - MARGIN;

                let useTop;
                let panelH;

                if (spaceBelow >= Math.min(preferredH, 220)) {
                    useTop = triggerRect.top;
                    panelH = Math.min(preferredH, spaceBelow);
                } else if (spaceAbove >= Math.min(preferredH, 220)) {
                    panelH = Math.min(preferredH, spaceAbove);
                    useTop = triggerRect.bottom - panelH;
                } else {
                    useTop = MARGIN;
                    panelH = maxAvailableH;
                }

                useTop = Math.max(MARGIN, Math.min(useTop, vh - MARGIN - panelH));
                panelEl.style.top = Math.round(useTop) + 'px';
                panelEl.style.maxHeight = Math.round(panelH) + 'px';

                // Horizontal: place to the left of trigger by default
                let panelLeft = triggerRect.left - panelW - GAP;
                if (panelLeft < MARGIN) {
                    const rightCandidate = triggerRect.right + GAP;
                    if (rightCandidate + panelW <= vw - MARGIN) {
                        panelLeft = rightCandidate;
                    } else {
                        panelLeft = Math.max(MARGIN, Math.min(panelLeft, vw - panelW - MARGIN));
                    }
                }
                panelLeft = Math.max(MARGIN, Math.min(panelLeft, vw - panelW - MARGIN));

                panelEl.style.left = Math.round(panelLeft) + 'px';
                panelEl.style.right = 'auto';
                panelEl.style.bottom = 'auto';
            }

            function repositionOpenPanels() {
                const panelMap = [
                    { panel: settingsMenu, trigger: configBtn },
                    { panel: termsMenu, trigger: configBtn },
                    { panel: apikeyMenu, trigger: apikeyBtn },
                    { panel: answersMenu, trigger: btnAnswers },
                ];
                panelMap.forEach(({ panel, trigger }) => {
                    if (panel && panel.classList.contains('open')) {
                        positionPanel(panel, trigger);
                    }
                });
            }

            window.addEventListener('resize', () => {
                clampToolbarToViewport();
                repositionOpenPanels();
            });

            toggleMenuBtn?.addEventListener('click', (e) => {
                if (isDragging) return;
                e.stopPropagation();
                const willOpen = !main.classList.contains('menu-open');
                setMainOpen(willOpen);
            });

            // Idle fade
            main.addEventListener('mouseenter', resetIdleTimer);
            main.addEventListener('mouseleave', () => {
                if (main.classList.contains('menu-open')) {
                    idleTimer = setTimeout(() => main.classList.add('idle'), 3000);
                }
            });

            // Tooltip logic with full hidden & drag protection
            const tooltipEl = shadow.querySelector('#tooltip');
            let tooltipTimer = null;

            function hideTooltip() {
                clearTimeout(tooltipTimer);
                if (tooltipEl) {
                    tooltipEl.classList.remove('visible');
                }
            }

            function bindTooltips() {
                shadow.querySelectorAll('[data-tooltip]').forEach(el => {
                    el.addEventListener('mouseenter', () => {
                        hideTooltip();
                        if (isDragging) return;
                        if (main.classList.contains('stealth-hidden')) return;

                        const isPillChild = el.closest('.toolbar-pill');
                        if (isPillChild && !main.classList.contains('menu-open')) return;

                        const panel = el.closest('.settings_menu, .terms_menu, .apikey_menu, .answers_menu');
                        if (panel && !panel.classList.contains('open')) return;

                        const text = el.getAttribute('data-tooltip');
                        if (!text || !tooltipEl) return;

                        tooltipTimer = setTimeout(() => {
                            if (isDragging || main.classList.contains('stealth-hidden')) return;
                            tooltipEl.textContent = text;
                            tooltipEl.classList.add('visible');

                            const rect = el.getBoundingClientRect();
                            const tw = tooltipEl.offsetWidth || 50;
                            const th = tooltipEl.offsetHeight || 22;

                            let top = rect.top + (rect.height - th) / 2;
                            let left = rect.left - tw - 8;

                            if (left < 6) {
                                left = rect.right + 8;
                            }
                            if (left + tw > window.innerWidth - 6) {
                                left = window.innerWidth - tw - 6;
                            }
                            if (top < 6) top = 6;
                            if (top + th > window.innerHeight - 6) top = window.innerHeight - th - 6;

                            tooltipEl.style.top = Math.round(top) + 'px';
                            tooltipEl.style.left = Math.round(left) + 'px';
                        }, 250);
                    });
                    el.addEventListener('mouseleave', hideTooltip);
                });
            }
            bindTooltips();

            document.addEventListener('click', (e) => {
                if (shadow.host && !shadow.host.contains(e.target)) {
                    setMainOpen(false);
                }
            });

            configBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!main.classList.contains('menu-open')) setMainOpen(true);
                const wasOpen = settingsMenu?.classList.contains('open');
                closeAllSubmenus();
                if (!wasOpen) {
                    toggleMenu(true);
                }
                resetIdleTimer();
            });
            closeSettings?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMenu(false);
                resetIdleTimer();
            });
            termsBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllSubmenus();
                toggleTerms(true);
                resetIdleTimer();
            });
            closeTerms?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTerms(false);
                resetIdleTimer();
            });
            const clearCacheBtn = shadow.querySelector('#btn-clear-cache');
            clearCacheBtn?.addEventListener('click', async () => {
                const quizStatusMenu = shadow.querySelector('#quiz-status-display');
                const ansListMenu = shadow.querySelector('#answers-list');

                const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
                GM_deleteValue(`${quizId}`);

                GM_listValues().forEach(k => {
                    if (k.length >= 20) GM_deleteValue(k);
                });

                AI_DATA = null;
                CACHED_RESULTS = null;
                hasAutoClickedCurrent = false;

                document.querySelectorAll('.ans-check').forEach(el => el.remove());
                document.querySelectorAll('.subtle-answer-text').forEach(el => el.remove());

                const officialAnswers = formatQuizResultsFromSaved(savedQuestions || ROOM_DATA?.questions);
                const hasOfficial = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

                if (hasOfficial) {
                    CACHED_RESULTS = officialAnswers;
                    CLEANED_QUESTIONS = cleanQuizData(savedQuestions || ROOM_DATA?.questions);

                    const officialMap = {};
                    const qList = Array.isArray(savedQuestions) ? savedQuestions : Object.values(savedQuestions || ROOM_DATA?.questions || {});
                    qList.forEach((q, idx) => {
                        const qId = q._id || q.id || String(idx);
                        const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                        if (ans !== undefined && ans !== null) officialMap[qId] = ans;
                    });

                    if (Object.keys(officialMap).length > 0) {
                        AI_DATA = officialMap;
                        GM_setValue(`${quizId}`, { isOfficial: true, answers: officialMap });
                        GM_setValue("active_quiz", { isOfficial: true, answers: officialMap });
                    }

                    if (typeof renderAnswersList === 'function') {
                        renderAnswersList(CACHED_RESULTS, "OFFICIAL");
                    }

                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "Official answers applied!";
                        quizStatusMenu.style.color = "#39be44";
                    }

                    instantHighlight();
                    showNotification("Official answers applied!", "#39be44");
                    return;
                }

                if (savedQuestions && Array.isArray(savedQuestions) && savedQuestions.length > 0) {
                    CLEANED_QUESTIONS = cleanQuizData(savedQuestions);
                } else if (ROOM_DATA?.questions) {
                    CLEANED_QUESTIONS = cleanQuizData(ROOM_DATA.questions);
                } else if (QUIZ_DATA?.info?.questions) {
                    CLEANED_QUESTIONS = cleanQuizData(QUIZ_DATA.info.questions);
                }

                if (!CLEANED_QUESTIONS || Object.keys(CLEANED_QUESTIONS).length === 0) {
                    const stemEl = document.querySelector('[data-highlight-block="stem"]') ||
                                   document.querySelector('[data-testid="question-container-text"]') ||
                                   document.querySelector('#questionText') ||
                                   document.querySelector('.question-text-color');

                    const optionBtns = document.querySelectorAll(
                        'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
                    );

                    if (stemEl && optionBtns.length > 0) {
                        const liveQuesId = document.querySelector('[data-quesid]')?.getAttribute('data-quesid') || "live_scraped_q";
                        const scrapedOptions = Array.from(optionBtns).map((btn, idx) => {
                            const textEl = btn.querySelector('p') || btn.querySelector('.resizeable-text') || btn;
                            return {
                                id: String(idx),
                                text: stripHtml(textEl.textContent)
                            };
                        });

                        CLEANED_QUESTIONS = {
                            [liveQuesId]: {
                                type: 'MCQ',
                                question: stripHtml(stemEl.textContent),
                                options: scrapedOptions
                            }
                        };
                    }
                }

                if (!CLEANED_QUESTIONS || Object.keys(CLEANED_QUESTIONS).length === 0) {
                    showNotification("No question data found in memory or on screen", "#af4c4c");
                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "No quiz data";
                        quizStatusMenu.style.color = "#af4c4c";
                    }
                    return;
                }

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = "Re-solving quiz with AI...";
                    quizStatusMenu.style.color = "#FFA500";
                }

                try {
                    const newAnswers = await processQuizAi(CLEANED_QUESTIONS);

                    if (newAnswers && Object.keys(newAnswers).length > 0) {
                        CACHED_RESULTS = formatQuizResults(newAnswers, CLEANED_QUESTIONS);

                        if (typeof renderAnswersList === 'function') {
                            renderAnswersList(CACHED_RESULTS, "AI");
                        }

                        if (quizStatusMenu) {
                            quizStatusMenu.innerText = "Answers updated!";
                            quizStatusMenu.style.color = "#39be44";
                        }

                        instantHighlight();
                        showNotification("Quiz re-solved successfully!");
                    } else {
                        if (quizStatusMenu) {
                            quizStatusMenu.innerText = "Re-solve failed";
                            quizStatusMenu.style.color = "#af4c4c";
                        }
                    }
                } catch (e) {
                    console.error("Live re-solve failed:", e);
                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "Re-solve error";
                        quizStatusMenu.style.color = "#af4c4c";
                    }
                    showNotification("Re-solve failed: " + (e.message || e), "#af4c4c");
                }
            });

            apikeyBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!main.classList.contains('menu-open')) setMainOpen(true);
                const wasOpen = apikeyMenu?.classList.contains('open');
                closeAllSubmenus();
                if (!wasOpen) {
                    toggleApikey(true);
                }
                resetIdleTimer();
            });
            apikeyBtnconfig?.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllSubmenus();
                toggleApikey(true);
                resetIdleTimer();
            });
            closeApikey?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleApikey(false);
                resetIdleTimer();
            });
            btnAnswers?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!main.classList.contains('menu-open')) setMainOpen(true);
                const wasOpen = answersMenu?.classList.contains('open');
                closeAllSubmenus();
                if (!wasOpen) {
                    toggleAnswers(true);
                }
                resetIdleTimer();
            });
            closeAnswers?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleAnswers(false);
                resetIdleTimer();
            });

            function UpdateAnsColor() {
                html.style.setProperty('--color-picked-user', `${colorPicker.value}`);
                localStorage.setItem("ansColor", colorPicker.value);
            }

            const ansColorSaved = localStorage.getItem("ansColor") || '#4579f2';
            colorPicker.value = ansColorSaved;
            UpdateAnsColor();
            colorPicker.oninput = UpdateAnsColor;

            const menuIcon = shadow.querySelector('.trigger-icon');
            const toggleAnsBtn = shadow.querySelector('#toggleAns');
            const eyeIcon = toggleAnsBtn?.querySelector('.eye-icon');
            const eyeOffIcon = toggleAnsBtn?.querySelector('.eye-off-icon');
            let answersVisible = true;
            const toggleAns = { get checked() { return answersVisible; }, set checked(v) { answersVisible = v; updateEyeIcon(); } };
            function updateEyeIcon() {
                if (eyeIcon) eyeIcon.style.display = answersVisible ? '' : 'none';
                if (eyeOffIcon) eyeOffIcon.style.display = answersVisible ? 'none' : '';
                if (toggleAnsBtn) toggleAnsBtn.classList.toggle('active', answersVisible);
            }
            updateEyeIcon();
            toggleAnsBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                answersVisible = !answersVisible;
                updateEyeIcon();
                toggleAnswersEn();
                if (answersVisible) instantHighlight();
                showNotification(answersVisible ? "Answers: Visible" : "Answers: Hidden", "#4579f2");
            });
            const toggleAnsSub = shadow.querySelector('.subtle-answer-text');
            const toggleAnsDark = shadow.querySelector('#dark-mode input[type="checkbox"]');
            const toggleAutoClick = shadow.querySelector('#toggle-autoclick');
            const inputAutoClickDelay = shadow.querySelector('#autoclick-delay');

            if (toggleAutoClick) {
                toggleAutoClick.checked = AUTO_CLICK;
                toggleAutoClick.addEventListener('change', (e) => {
                    AUTO_CLICK = e.target.checked;
                    GM_setValue("autoClickEnabled", AUTO_CLICK);
                    showNotification(AUTO_CLICK ? "Auto-click enabled" : "Auto-click disabled");
                });
            }

            const delayDisplay = shadow.querySelector('#delay-val-display');
            const btnDecreaseDelay = shadow.querySelector('#delay-decrease');
            const btnIncreaseDelay = shadow.querySelector('#delay-increase');

            function updateDelayDisplay() {
                if (delayDisplay) delayDisplay.textContent = `${AUTO_CLICK_DELAY}ms`;
                GM_setValue("autoClickDelay", AUTO_CLICK_DELAY);
            }

            if (delayDisplay) updateDelayDisplay();

            btnDecreaseDelay?.addEventListener('click', (e) => {
                e.stopPropagation();
                AUTO_CLICK_DELAY = Math.max(100, AUTO_CLICK_DELAY - 100);
                updateDelayDisplay();
            });

            btnIncreaseDelay?.addEventListener('click', (e) => {
                e.stopPropagation();
                AUTO_CLICK_DELAY = Math.min(10000, AUTO_CLICK_DELAY + 100);
                updateDelayDisplay();
            });
            const toggleNotif = shadow.querySelector('#toggle-notifications');
            if (toggleNotif) {
                toggleNotif.checked = NOTIFICATIONS_ENABLED;
                toggleNotif.addEventListener('change', (e) => {
                    NOTIFICATIONS_ENABLED = e.target.checked;
                    GM_setValue("notificationsEnabled", NOTIFICATIONS_ENABLED);
                    if (NOTIFICATIONS_ENABLED) showNotification("Notifications enabled");
                });
            }

            const btnHideUi = shadow.querySelector('#btn-hide-ui');
            const stealthUnhideZone = shadow.querySelector('#stealth-unhide-zone');

            function hideUiCompletely() {
                setMainOpen(false);
                hideTooltip();
                main.classList.add('stealth-hidden');
                main.inert = true;
                main.setAttribute('aria-hidden', 'true');

                if (stealthUnhideZone) {
                    stealthUnhideZone.style.display = 'block';
                    stealthUnhideZone.style.pointerEvents = 'auto';
                    stealthUnhideZone.classList.remove('aura-glow');
                    void stealthUnhideZone.offsetWidth;
                    stealthUnhideZone.classList.add('aura-glow');
                }

                showNotification("UI hidden! Click the glowing zone or Ctrl+Click to restore.");
            }

            function unhideUi() {
                main.classList.remove('stealth-hidden');
                main.inert = false;
                main.removeAttribute('aria-hidden');

                if (stealthUnhideZone) {
                    stealthUnhideZone.classList.remove('aura-glow');
                    stealthUnhideZone.style.display = 'none';
                    stealthUnhideZone.style.pointerEvents = 'none';
                }

                clampToolbarToViewport();
                showNotification("UI restored!");
            }

            btnHideUi?.addEventListener('click', hideUiCompletely);
            stealthUnhideZone?.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                unhideUi();
            });
            window.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    if (e.target && e.target.closest && e.target.closest('a')) return;

                    e.preventDefault();
                    e.stopPropagation();

                    if (main.classList.contains('stealth-hidden')) {
                        unhideUi();
                    } else {
                        hideUiCompletely();
                    }
                }
            }, true);

            window.addEventListener('click', (e) => {
                if (e.altKey && e.button === 0) {
                    e.preventDefault();
                    e.stopPropagation();

                    if (toggleAns) {
                        toggleAns.checked = !toggleAns.checked;
                        toggleAnswersEn();
                        if (toggleAns.checked) instantHighlight();
                        showNotification(toggleAns.checked ? "Answers: Visible" : "Answers: Hidden", "#4579f2");
                    }
                }
            }, true);

            function verifyBackgroundColor() {
                try {
                    const el = document.querySelector('.test-theme-waiting');
                    if (!el) return 255;
                    const colorBackground = window.getComputedStyle(el).backgroundColor;
                    const rgb = colorBackground.match(/\d+/g);

                    if (rgb && rgb.length >= 3) {
                        const r = parseInt(rgb[0]), g = parseInt(rgb[1]), b = parseInt(rgb[2]);
                        return (r * 299 + g * 587 + b * 114) / 1000;
                    }
                } catch (e) {}
                return 255;
            }

            function setTheme(isDark) {
                const props = isDark
                    ? ['#292929', '#ffffff']
                    : ['#ffffff', '#292929'];

                main.style.setProperty('--main-color', props[0]);
                main.style.setProperty('--secondary-color', props[1]);
                if (toggleAnsDark) toggleAnsDark.checked = isDark;

                shadow?.querySelectorAll('.settings_menu, .shortcuts_menu, .terms_menu, .apikey_menu, .answers_menu').forEach(m => {
                    m.style.backgroundColor = props[0];
                });
                shadow?.querySelectorAll('.keybind-select').forEach(sel => {
                    sel.style.color = props[1];
                });
                shadow?.querySelectorAll('.stepper-btn').forEach(btn => {
                    btn.style.color = props[1];
                });

                const brightness = verifyBackgroundColor();
                if (brightness < 128 || isDark) {
                    main.style.setProperty('--icon-color', '#ffffff');
                } else {
                    main.style.setProperty('--icon-color', '#292929');
                }
            }
            function verifyColorMode() {
                const userPreference = GM_getValue("darkMode", null);
                if (userPreference !== null) {
                    setTheme(userPreference);
                    return;
                }
                const brightness = verifyBackgroundColor();
                setTheme(brightness < 128);
            }

            function initThemeObserver() {
                if (GM_getValue("darkMode", null) !== null) return;

                const el = document.querySelector('.test-theme-waiting');
                if (el) return attachDirect(el);

                const finder = new MutationObserver((_, obs) => {
                    const target = document.querySelector('.test-theme-waiting');
                    if (target) {
                        obs.disconnect();
                        attachDirect(target);
                    }
                });

                finder.observe(document.body, { childList: true, subtree: true });
            }

            function attachDirect(target) {
                if (GM_getValue("darkMode", null) !== null) return;
                verifyColorMode();
                new MutationObserver(() => verifyColorMode()).observe(target, {
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });
            }

            initThemeObserver();

            // Parallax effect removed — not applicable to pill toolbar buttons

            const testApiBtn = shadow.querySelector('#test-api-btn');
            const apiStatusDot = shadow.querySelector('#api-status-dot');
            const apiStatusText = shadow.querySelector('#api-status-text');
            const mainStatusDot = shadow.querySelector('#main-ai-indicator');
            const apiProvider = shadow.querySelector('#api-provider-select');
            const apiKey = shadow.querySelector('#apikey-input');
            const toggleAiCheckbox = shadow.querySelector('#toggle-ai-checkbox');

            apiProvider.value = GM_getValue("apiProvider", "gemini");

            function changeProvider() {
        const selectedProvider = apiProvider?.value;
        apiStatusDot.style.backgroundColor = 'gray';
        mainStatusDot.style.backgroundColor = 'gray';
        mainStatusDot.style.boxShadow = '0 0 4px gray';
        apiStatusText.textContent = 'Not tested';
        switch (selectedProvider) {
            case "groq":
                apiKey.value = GM_getValue("apiKeyGroq", "");
                break;
            case "gemini":
                apiKey.value = GM_getValue("apiKeyGemini", "");
                break;
            case "gpt":
                apiKey.value = GM_getValue("apiKeyGpt", "");
                break;
            default:
                apiKey.value = "";
                break;
        }
        GM_setValue("apiProvider", selectedProvider);
        API_KEY = apiKey.value;
    }
            function updateApiKey() {
                API_KEY = apiKey.value.trim();
            }

            apiProvider?.addEventListener('change', changeProvider);
            apiKey?.addEventListener('input', updateApiKey);
            changeProvider()

            async function testApi(){
                testApiBtn.textContent = 'Testing...';
                apiStatusDot.style.backgroundColor = 'orange';
                apiStatusText.textContent = 'Connecting...';
                const provider = apiProvider.value;
                OK = false;

                try {
                    if (provider === "groq") {
                        const res = await fetch('https://api.groq.com/openai/v1/models', {
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${API_KEY}` }
                        });
                        if (res.ok) {
                            console.log("Groq API is available.");
                            OK = true;
                            GM_setValue("apiKeyGroq", API_KEY);
                        } else {
                            console.warn("Groq API returned an error status:", res.status);
                        }

                    } else if (provider === "gemini") {
                        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
                        if (res.ok) {
                            console.log("Gemini API is available.");
                            OK = true;
                            GM_setValue("apiKeyGemini", API_KEY);
                        } else {
                            console.warn("Gemini API returned an error status:", res.status);
                        }

                    } else if (provider === "gpt") {
                        const res = await fetch('https://api.openai.com/v1/models', {
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${API_KEY}` }
                        });
                        if (res.ok) {
                            console.log("OpenAI API is available.");
                            OK = true;
                            GM_setValue("apiKeyGpt", API_KEY);
                        } else {
                            console.warn("OpenAI API returned an error status:", res.status);
                        }
                    }
                } catch (err) {
                    console.error("No response received from server:", err);
                    OK = false;
                } finally {
                    testApiBtn.textContent = 'Test API';
                    testApiBtn.disabled = false;

                    if (OK) {
                        apiStatusDot.style.backgroundColor = 'green';
                        if (typeof mainStatusDot !== 'undefined') {
                            mainStatusDot.style.backgroundColor = 'green';
                            mainStatusDot.style.boxShadow = '0 0 4px green';
                        }
                        apiStatusText.textContent = 'Connected';
                    } else {
                        apiStatusDot.style.backgroundColor = 'red';
                        if (typeof mainStatusDot !== 'undefined') {
                            mainStatusDot.style.backgroundColor = 'red';
                            mainStatusDot.style.boxShadow = '0 0 4px red';
                        }
                        apiStatusText.textContent = 'Failed';
                    }
                }
            }

            testApiBtn?.addEventListener('click', testApi);

            function toggleAiState() {
                if (!toggleAiCheckbox || !mainStatusDot) return;
                const isEnabled = toggleAiCheckbox.checked;
                GM_setValue("aiAssistance", isEnabled);
                if (isEnabled && apiKey.value) {
                    testApi();
                } else {
                    apiStatusDot.style.backgroundColor = 'gray';
                    mainStatusDot.style.backgroundColor = 'gray';
                    mainStatusDot.style.boxShadow = '0 0 4px gray';
                    apiStatusText.textContent = 'Disabled';
                }
            }

            toggleAiCheckbox?.addEventListener('change', toggleAiState);
            const aiEnabledSaved = GM_getValue("aiAssistance", false);
            if (toggleAiCheckbox) toggleAiCheckbox.checked = aiEnabledSaved;
            toggleAiState();

            function toggleAnswersEn() {
        isAnsVisible = !!toggleAns.checked;
        GM_setValue("ansEnabled", isAnsVisible);
        html.style.setProperty('--color-highlight', isAnsVisible ? 'var(--color-picked-user)' : 'currentColor');

        document.querySelectorAll('.ans-check').forEach(el => {
            el.style.opacity = isAnsVisible ? '1' : '0';
        });
        document.querySelectorAll('.subtle-answer-text').forEach(el => {
            el.style.display = isAnsVisible ? 'block' : 'none';
            el.style.opacity = isAnsVisible ? '1' : '0';
        });
    }

            function changeColorMode() {
                setTheme(toggleAnsDark.checked);
                GM_setValue("darkMode", toggleAnsDark.checked);
            };

            const ansEnabled = GM_getValue("ansEnabled");
            toggleAns.checked = ansEnabled;

            toggleAnsDark.addEventListener('change', changeColorMode);
            const darkModeSaved = GM_getValue("darkMode", null);
            if (darkModeSaved !== null) {
                toggleAnsDark.checked = darkModeSaved;
                setTheme(darkModeSaved);
            } else {
                verifyColorMode();
            }
            toggleAnswersEn();

            const versionBadge = shadow.querySelector('#script-version');
            if (versionBadge && typeof GM_info !== 'undefined') {
                versionBadge.textContent = "VERSION " + GM_info.script.version;
            }

            // Initialize inert states on hidden panels and closed toolbar pill
            [settingsMenu, termsMenu, apikeyMenu, answersMenu].forEach(panel => {
                if (panel) {
                    panel.inert = true;
                    panel.setAttribute('aria-hidden', 'true');
                }
            });
            if (toolbarPill) {
                toolbarPill.inert = true;
                toolbarPill.setAttribute('aria-hidden', 'true');
            }

            initToolbarPosition();

        } catch (e) {
            showNotification("Error injecting the shadow DOM", "#af4c4c");
            console.error("Error injecting the shadow DOM:", e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', toLoad);
    } else {
        toLoad();
    }



