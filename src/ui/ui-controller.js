    let shadow = null;

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

            if (searchInput && answersList) {
                searchInput.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase().trim();
                    const items = answersList.querySelectorAll('.answer-item');

                    items.forEach(item => {
                        const textContent = item.textContent.toLowerCase();

                        if (textContent.includes(searchTerm)) {
                            item.style.display = 'block';
                        } else {
                            item.style.display = 'none';
                        }
                    });
                });
            }

            const configBtn = shadow.querySelector('#config');
            const closeSettings = shadow.querySelector('#close-settings');
            const settingsMenu = shadow.querySelector('.settings_menu');
            const cards = shadow.querySelectorAll('.card, .card-track');
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
            const toggleMenu = (open) => settingsMenu?.classList.toggle('open', open);
            const toggleTerms = (open) => termsMenu?.classList.toggle('open', open);
            const toggleApikey = (open) => apikeyMenu?.classList.toggle('open', open);
            const toggleAnswers = (open) => answersMenu?.classList.toggle('open', open);

            let isDragging = false;
            let startX, startY;
            const dragTarget = typeof shadow !== 'undefined' && shadow.host ? shadow.host : shadow.querySelector('.main');

            if (dragTarget && (!dragTarget.style.position || dragTarget.classList.contains('main'))) {
                dragTarget.style.position = 'fixed';
                dragTarget.style.bottom = '10px';
                dragTarget.style.right = '10px';
                dragTarget.style.zIndex = '99999';
            }

            let initialRight, initialBottom;

            dragTarget?.addEventListener('mousedown', (e) => {
    if (e.target.closest('.settings_menu, .terms_menu, .apikey_menu, .shortcuts_menu, input, label, a, button')) return;

                startX = e.clientX;
                startY = e.clientY;

                const computed = window.getComputedStyle(dragTarget);
                initialRight = parseInt(computed.right) || 0;
                initialBottom = parseInt(computed.bottom) || 0;

                function onMouseMove(moveEvent) {
                    const dx = startX - moveEvent.clientX;
                    const dy = startY - moveEvent.clientY;

                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                        isDragging = true;
                        dragTarget.style.right = (initialRight + dx) + 'px';
                        dragTarget.style.bottom = (initialBottom + dy) + 'px';
                        dragTarget.style.cursor = 'grabbing';
                    }
                }

                function onMouseUp() {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    dragTarget.style.cursor = '';
                    setTimeout(() => { isDragging = false; }, 50);
                }

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            dragTarget?.addEventListener('click', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, true);

            configBtn?.addEventListener('click', () => {
                toggleTerms(false);
                toggleApikey(false);
                toggleAnswers(false);
                toggleMenu(true);
            });
            closeSettings?.addEventListener('click', () => toggleMenu(false));
            settingsMenu?.addEventListener('mouseleave', () => toggleMenu(false));
            termsBtn?.addEventListener('click', () => {
                toggleMenu(false);
                toggleApikey(false);
                toggleAnswers(false);
                toggleTerms(true);
            });
            closeTerms?.addEventListener('click', () => toggleTerms(false));
            termsMenu?.addEventListener('mouseleave', () => toggleTerms(false));
            // Clear Cache Button Event
            // Live Re-Solve Handler (No reload needed)
            // Live Re-Solve Handler with Full Error Recovery
            const clearCacheBtn = shadow.querySelector('#btn-clear-cache');
            clearCacheBtn?.addEventListener('click', async () => {
                const quizStatusMenu = shadow.querySelector('#quiz-status-display');
                const ansListMenu = shadow.querySelector('#answers-list');

                // 1. Wipe local answer caches
                const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
                GM_deleteValue(`${quizId}`);

                GM_listValues().forEach(k => {
                    if (k.length >= 20) GM_deleteValue(k);
                });

                AI_DATA = null;
                CACHED_RESULTS = null;
                hasAutoClickedCurrent = false;

                // 2. Remove all visible checkmarks from the screen
                document.querySelectorAll('.ans-check').forEach(el => el.remove());
                document.querySelectorAll('.subtle-answer-text').forEach(el => el.remove());

                // 3. Check for 5/5 Official Answers from finished test FIRST
                const officialAnswers = formatQuizResultsFromSaved(savedQuestions || ROOM_DATA?.questions);
                const hasOfficial = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

                if (hasOfficial) {
                    CACHED_RESULTS = officialAnswers;
                    CLEANED_QUESTIONS = cleanQuizData(savedQuestions || ROOM_DATA?.questions);

                    // Save official 5/5 key into permanent storage
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

                    // Populate clean 5/5 answers in sidebar drawer (No Lixus, no blind guesses!)
                    if (ansListMenu) {
                        ansListMenu.innerHTML = Object.entries(CACHED_RESULTS)
                            .map(([question, answer]) => `
                                <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                                    <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                                    <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                                </div>
                            `).join('');
                    }

                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "Official answers applied!";
                        quizStatusMenu.style.color = "#39be44";
                    }

                    instantHighlight();
                    showNotification("Official answers applied!", "#39be44");
                    return; // STOP: We have the 100% correct answers, do not call AI to make blind guesses
                }

                // 4. Fallback: Multi-tier question recovery for AI if official answers are hidden
                if (savedQuestions && Array.isArray(savedQuestions) && savedQuestions.length > 0) {
                    CLEANED_QUESTIONS = cleanQuizData(savedQuestions);
                } else if (ROOM_DATA?.questions) {
                    CLEANED_QUESTIONS = cleanQuizData(ROOM_DATA.questions);
                } else if (QUIZ_DATA?.info?.questions) {
                    CLEANED_QUESTIONS = cleanQuizData(QUIZ_DATA.info.questions);
                }

                // 5. Ultimate Fallback: Live DOM Screen Scraper
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

                // 5. Query AI with freshly recovered data
                if (quizStatusMenu) {
                    quizStatusMenu.innerText = "Re-solving quiz with AI...";
                    quizStatusMenu.style.color = "#FFA500";
                }

                try {
                    const newAnswers = await processQuizAi(CLEANED_QUESTIONS);

                    if (newAnswers && Object.keys(newAnswers).length > 0) {
                        CACHED_RESULTS = formatQuizResults(newAnswers, CLEANED_QUESTIONS);

                        if (ansListMenu) {
                            ansListMenu.innerHTML = Object.entries(CACHED_RESULTS)
                                .map(([question, answer]) => `
                                    <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                                        <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                                        <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                                    </div>
                                `).join('');
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

            apikeyBtn?.addEventListener('click', () => {
                toggleMenu(false);
                toggleTerms(false);
                toggleAnswers(false);
                toggleApikey(true);
            });
            apikeyBtnconfig?.addEventListener('click', () => {
                toggleMenu(false);
                toggleTerms(false);
                toggleAnswers(false);
                toggleApikey(true);
            });
            closeApikey?.addEventListener('click', () => toggleApikey(false));
            apikeyMenu?.addEventListener('mouseleave', () => toggleApikey(false));
            btnAnswers?.addEventListener('click', () => {
                toggleMenu(false);
                toggleTerms(false);
                toggleApikey(false);
                toggleAnswers(true);
            });
            closeAnswers?.addEventListener('click', () => toggleAnswers(false));
            answersMenu?.addEventListener('mouseleave', () => toggleAnswers(false));

            function UpdateAnsColor() {
                html.style.setProperty('--color-picked-user', `${colorPicker.value}`);
                localStorage.setItem("ansColor", colorPicker.value);
            }

            const ansColorSaved = localStorage.getItem("ansColor") || '#4579f2';
            colorPicker.value = ansColorSaved;
            UpdateAnsColor();
            colorPicker.oninput = UpdateAnsColor;

            const main = shadow.querySelector('.main');
            const menuIcon = shadow.querySelector('.menu');
            const toggleAns = shadow.querySelector('#toggleAns input[type="checkbox"]');
            const toggleAnsSub = shadow.querySelector('.subtle-answer-text');
            const toggleAnsDark = shadow.querySelector('#dark-mode input[type="checkbox"]');
            // Auto Click Toggle and Delay binding
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
            // 1. Notification Toggle
            const toggleNotif = shadow.querySelector('#toggle-notifications');
            if (toggleNotif) {
                toggleNotif.checked = NOTIFICATIONS_ENABLED;
                toggleNotif.addEventListener('change', (e) => {
                    NOTIFICATIONS_ENABLED = e.target.checked;
                    GM_setValue("notificationsEnabled", NOTIFICATIONS_ENABLED);
                    if (NOTIFICATIONS_ENABLED) showNotification("Notifications enabled");
                });
            }

            // 2. Hide / Unhide Stealth Mode Handlers
            const btnHideUi = shadow.querySelector('#btn-hide-ui');
            const stealthUnhideZone = shadow.querySelector('#stealth-unhide-zone');

            function hideUiCompletely() {
                toggleMenu(false);
                toggleTerms(false);
                toggleApikey(false);
                toggleAnswers(false);

                main.classList.add('stealth-hidden');

                if (stealthUnhideZone) {
                    stealthUnhideZone.style.display = 'block';
                    // Trigger radiant light aura animation
                    stealthUnhideZone.classList.remove('aura-glow');
                    void stealthUnhideZone.offsetWidth; // Force reflow so animation plays
                    stealthUnhideZone.classList.add('aura-glow');
                }

                if (dragTarget) dragTarget.style.pointerEvents = 'auto';
                showNotification("UI hidden! Click the glowing zone to restore.");
            }

            function unhideUi() {
                main.classList.remove('stealth-hidden');
                if (stealthUnhideZone) {
                    stealthUnhideZone.classList.remove('aura-glow');
                    stealthUnhideZone.style.display = 'none';
                }
                if (dragTarget) dragTarget.style.pointerEvents = '';
                showNotification("UI restored!");
            }

            btnHideUi?.addEventListener('click', hideUiCompletely);
            stealthUnhideZone?.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                unhideUi();
            });
            // Global Stealth Toggle: Ctrl + Left Click anywhere to Hide OR Unhide UI
            window.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    // Don't intercept if clicking an actual link tag
                    if (e.target && e.target.closest && e.target.closest('a')) return;

                    e.preventDefault();
                    e.stopPropagation();

                    // Two-way switch: if hidden -> unhide, if visible -> hide
                    if (main.classList.contains('stealth-hidden')) {
                        unhideUi();
                    } else {
                        hideUiCompletely();
                    }
                }
            }, true);

            // Global Toggle: Alt + Left Click anywhere to show/hide Answers
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

            // Safe background brightness detector (Will never throw null crash)
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

                // Sync custom UI elements to current theme
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
                // If the user manually saved a dark/light mode preference, do not let Quizizz auto-override it
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

            cards.forEach((card) => {
                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const cardCenterX = rect.left + rect.width / 2;
                    const cardCenterY = rect.top + rect.height / 2;

                    const deltaX = e.clientX - cardCenterX;
                    const deltaY = e.clientY - cardCenterY;

                    const strength = 0.35;
                    const moveX = deltaX * strength;
                    const moveY = deltaY * strength;

                    card.style.transform = `translate(${moveX}px, ${moveY}px)`;
                });

                card.addEventListener('mouseleave', () => {
                    card.style.transform = '';
                });
            });

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
                        if (typeof mainStatusDot !== 'undefined') mainStatusDot.style.backgroundColor = 'green';
                        apiStatusText.textContent = 'Connected';
                    } else {
                        apiStatusDot.style.backgroundColor = 'red';
                        if (typeof mainStatusDot !== 'undefined') mainStatusDot.style.backgroundColor = 'red';
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

        // Apply visibility to all rendered checks and text hints on page
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

            toggleAns.addEventListener('change', toggleAnswersEn);
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



