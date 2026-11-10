    let lastFetchAnswersTime = 0;
    function fetchQuizAnswers(quizId) {
        const cleanRoomId = quizId.toString().trim();
        if (Date.now() - lastFetchAnswersTime < 2000) return; // Prevents simultaneous API duplicate firing
        lastFetchAnswersTime = Date.now();
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://wayground.com/api/main/quiz/${cleanRoomId}`,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.success && data.data?.quiz?.info?.questions) {
                            savedQuestions = data.data.quiz.info.questions;
                            // CRITICAL SPA FIX: Instantly detaches ID trackers from the old task you just finished
                            QUIZ_DATA = data.data.quiz.info;
                            ROOM_DATA = null;
                            // 1. Update Quiz Name & Status in the UI (replaces "Waiting")
                            QUIZ_NAME = data.data.quiz.info.name || "Quizizz Game";
                            const quizNameDisplay = getShadowEl('#quiz-name-display');
                            if (quizNameDisplay) quizNameDisplay.innerText = QUIZ_NAME;

                            const quizStatusMenu = getShadowEl('#quiz-status-display');
                            if (quizStatusMenu) {
                                quizStatusMenu.innerText = "Answers available";
                                quizStatusMenu.style.color = "#39be44";
                            }

                            // 2. Prepare cleaned questions & answers list
                            CLEANED_QUESTIONS = cleanQuizData(savedQuestions);
                            const officialAnswers = formatQuizResultsFromSaved(savedQuestions);
                            const hasValidOfficialAnswers = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

                            // PROTECTION GUARD: If the 5/5 official answers are ALREADY loaded on screen, do NOT let a delayed network call downgrade them to AI guesses!
                            const alreadyHasValidAnswers = CACHED_RESULTS && Object.values(CACHED_RESULTS).some(a => a && a !== "Answer not found");
                            if (alreadyHasValidAnswers && !hasValidOfficialAnswers) {
                                console.log("5/5 official answers are already active on screen. Ignoring unverified network fallback.");
                                return; // HARD STOP: Keeps the 5/5 answers locked on your screen permanently!
                            }

                            if (hasValidOfficialAnswers) {
                                // 100% ACCURATE: Use the real teacher answer key straight from Quizizz
                                CACHED_RESULTS = officialAnswers;

                                const officialMap = {};
                                savedQuestions.forEach((q, idx) => {
                                    const qId = q._id || q.id || String(idx);
                                    const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                                    if (ans !== undefined && ans !== null) {
                                        officialMap[qId] = ans;
                                    }
                                });

                                if (Object.keys(officialMap).length > 0) {
                                    AI_DATA = officialMap;

                                    savedQuestions.forEach((q, idx) => {
                                        const rawQ = q.structure?.query?.text || q.query?.text || q.question || '';
                                        const qText = normalizeText(rawQ);
                                        const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                                        if (qText && ans !== undefined && ans !== null) {
                                            officialMap[qText] = ans;
                                        }
                                    });

                                    const targetKey = cleanRoomId || QUIZ_DATA?._id || "active_quiz";
                                    const contentSig = getQuizContentKey(savedQuestions);
                                    const savePayload = { isOfficial: true, answers: officialMap, results: officialAnswers };

                                    GM_setValue(`${targetKey}`, savePayload);
                                    GM_setValue("active_quiz", savePayload);
                                    if (contentSig) GM_setValue(contentSig, savePayload);
                                }
                            } else {
                                // Check if we have 5/5 official answers saved under the Content Signature (from alt account)
                                const contentSig = getQuizContentKey(savedQuestions);
                                const savedOfficial = (contentSig ? GM_getValue(contentSig, null) : null) ||
                                                      GM_getValue(`${cleanRoomId}`, null) ||
                                                      GM_getValue("active_quiz", null);

                                if (savedOfficial && savedOfficial.isOfficial && savedOfficial.results) {
                                    CACHED_RESULTS = savedOfficial.results;
                                    AI_DATA = savedOfficial.answers;
                                } else {
                                    // Only fall back to AI if NO official key exists anywhere
                                    const existingSolved = GM_getValue(`${cleanRoomId}`, null) || GM_getValue("active_quiz", null);
                                    if (existingSolved && existingSolved.answers && Object.keys(existingSolved.answers).length > 0) {
                                        AI_DATA = existingSolved.answers;
                                        CACHED_RESULTS = formatQuizResults(AI_DATA, CLEANED_QUESTIONS);
                                    } else {
                                        CACHED_RESULTS = officialAnswers;
                                    }
                                }
                            }

                            // 3. Populate the Answers Menu list immediately
                            const ansListMenu = getShadowEl('#answers-list');
                            if (ansListMenu && CACHED_RESULTS) {
                                ansListMenu.innerHTML = Object.entries(CACHED_RESULTS)
                                    .map(([q, a]) => `
                                        <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                                            <p class="text" style="font-weight: bold; margin-bottom: 4px;">${q}</p>
                                            <p class="subtextT" style="color: #39be44; opacity: 1;">${a}</p>
                                        </div>
                                    `).join('');
                            }

                            instantHighlight();
                            showNotification("Answers retrieved successfully");
                        }
                    } catch (e) {
                        showNotification("Failed to parse answers", "#af4c4c");
                    }
                },
                onerror: () => showNotification("Failed to retrieve answers", "#af4c4c")
            });
        } catch (e) {
            console.error(e);
        }
    }

