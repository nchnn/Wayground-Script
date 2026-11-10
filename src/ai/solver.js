    async function startQuizSolver(data) {
        try {
            updateProtectionUI(ANTI_CHEAT);

            const quizNameDisplay = getShadowEl('#quiz-name-display');
            if (quizNameDisplay) quizNameDisplay.innerText = QUIZ_NAME;

            const targetHash = data?.hash || data?.roomHash || ROOM_DATA?.hash || ROOM_DATA?.roomHash || data?.quizId || ROOM_DATA?.quizId;
            if (targetHash) {
                try {
                    await fetchQuizData(targetHash);
                } catch (e) {
                    // Silent fallback: allows direct quiz API pipeline to take over without showing false red alarm
                    console.log("Room hash not on student endpoint, falling back to direct quiz API...");
                }
            }

            CLEANED_QUESTIONS = cleanQuizData(data.questions || ROOM_DATA?.questions);
            const hash = await generateQuizHash(CLEANED_QUESTIONS);

            // Comprehensive ID & Content Signature Resolution (Recognizes same test across different Game PINs!)
            const resolvedQuizId = QUIZ_DATA?._id || QUIZ_DATA?.id || ROOM_DATA?.quizId || ROOM_DATA?.hash || data?.quizId || data?.hash || "active_quiz";
            const contentSig = getQuizContentKey(data?.questions || ROOM_DATA?.questions || savedQuestions);

            const quizStorage = (contentSig ? GM_getValue(contentSig, null) : null) ||
                                GM_getValue(`${resolvedQuizId}`, null) ||
                                GM_getValue("active_quiz", null);

            const toggleAiCheckbox = getShadowEl('#toggle-ai-checkbox');
            const isAiChecked = toggleAiCheckbox ? toggleAiCheckbox.checked : GM_getValue("aiAssistance", false);

            if (isAiChecked && !OK && typeof testApi === 'function') {
                await testApi();
            }

            const quizStatusMenu = getShadowEl('#quiz-status-display');
            const ansListMenu = getShadowEl('#answers-list');

            // PRIORITY 1: Check if Quizizz provided the official teacher answer key in the room payload!
            const officialAnswers = formatQuizResultsFromSaved(data.questions || ROOM_DATA?.questions || savedQuestions);
            const hasOfficial = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

            if (hasOfficial) {
                // 100% ACCURATE: Use the real teacher answer key straight from Quizizz
                CACHED_RESULTS = officialAnswers;

                // Build official map and overwrite any bad AI guesses in permanent storage
                const officialMap = {};
                const qList = Array.isArray(data.questions || ROOM_DATA?.questions || savedQuestions)
                    ? (data.questions || ROOM_DATA?.questions || savedQuestions)
                    : Object.values(data.questions || ROOM_DATA?.questions || savedQuestions);

                qList.forEach((q, idx) => {
                    const qId = q._id || q.id || String(idx);
                    const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                    if (ans !== undefined && ans !== null) {
                        officialMap[qId] = ans;
                    }
                });

                if (Object.keys(officialMap).length > 0) {
                    AI_DATA = officialMap;
                    const targetKey = resolvedQuizId || "active_quiz";
                    GM_setValue(`${targetKey}`, { isOfficial: true, answers: officialMap });
                    GM_setValue("active_quiz", { isOfficial: true, answers: officialMap });
                }

                instantHighlight();

                const htmlList = Object.entries(CACHED_RESULTS)
                    .map(([question, answer]) => `
                        <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                            <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                            <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                        </div>
                    `).join('');

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = 'Answers available (Official)';
                    quizStatusMenu.style.color = '#39be44';
                }
                if (ansListMenu) ansListMenu.innerHTML = htmlList || '<p>No answers available.</p>';
                showNotification("Official Quizizz answers loaded!");
                return; // HARD STOP: Real answers are in hand, do not use AI cache or call AI
            }

            // PRIORITY 2: Load cache ONLY if it is a verified 5/5 OFFICIAL key (Blocks bad AI guesses from loading)
            if (quizStorage && quizStorage.isOfficial && quizStorage.answers && Object.keys(quizStorage.answers).length > 0) {
                AI_DATA = quizStorage.answers;
                CACHED_RESULTS = formatQuizResults(AI_DATA, CLEANED_QUESTIONS);

                instantHighlight();

                const htmlList = Object.entries(CACHED_RESULTS)
                    .map(([question, answer]) => `
                        <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                            <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                            <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                        </div>
                    `).join('');

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = 'Answers available';
                    quizStatusMenu.style.color = '#39be44';
                }
                if (ansListMenu) ansListMenu.innerHTML = htmlList || '<p>No answers available.</p>';
                showNotification("Official answers loaded from cache!", "#39be44");
                return;
            }

            // 2. Query AI if enabled
            if (isAiChecked) {
                const aiAnswers = await processQuizAi(CLEANED_QUESTIONS);
                if (aiAnswers) {
                    CACHED_RESULTS = formatQuizResults(aiAnswers, data.questions || CLEANED_QUESTIONS);

                    // Instantly trigger checkmark (0ms delay)
                    instantHighlight();

                    const htmlList = Object.entries(CACHED_RESULTS)
                        .map(([question, answer]) => `
                            <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                                <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                                <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                            </div>
                        `).join('');

                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = 'Answers available';
                        quizStatusMenu.style.color = '#39be44';
                    }
                    if (ansListMenu) ansListMenu.innerHTML = htmlList || '<p>No answers available.</p>';
                    showNotification("Answers generated successfully");
                }
            } else {
                if (quizStatusMenu) {
                    quizStatusMenu.innerText = 'AI is disabled';
                    quizStatusMenu.style.color = '#FFA500';
                }
            }
        } catch (error) {
            showNotification("Error in quiz flow", "#af4c4c");
            console.error("Error in startQuizSolver:", error);
        }
    }

    async function processQuizAi(cleanedQuestionsJson) {
        if (!cleanedQuestionsJson || Object.keys(cleanedQuestionsJson).length === 0) {
            console.error("No questions provided to processQuizAi.");
            showNotification("No question data found to solve", "#af4c4c");
            return null;
        }

        // Determine quiz ID with fallbacks so it never silently aborts
        const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
        const hash = await generateQuizHash(cleanedQuestionsJson);
        const provider = getSelectedProvider();

        // Always sync the latest API key from storage
        if (provider === "groq") API_KEY = GM_getValue("apiKeyGroq", API_KEY);
        else if (provider === "gemini") API_KEY = GM_getValue("apiKeyGemini", API_KEY);
        else if (provider === "gpt") API_KEY = GM_getValue("apiKeyGpt", API_KEY);

        if (!API_KEY || API_KEY.trim() === "") {
            showNotification("API Key is missing! Set it in the menu.", "#af4c4c");
            return null;
        }

        try {
            showNotification(`Sending to ${provider.toUpperCase()}...`, "#FFA500");
            let answers = null;

            if (provider === "groq") {
                answers = await solveQuizWithGroq(cleanedQuestionsJson);
            } else if (provider === "gemini") {
                answers = await solveQuizWithGemini(cleanedQuestionsJson);
            } else if (provider === "gpt") {
                answers = await solveQuizWithGPT(cleanedQuestionsJson);
            }

            if (answers && Object.keys(answers).length > 0) {
                AI_DATA = answers;
                CACHED_RESULTS = formatQuizResults(AI_DATA, cleanedQuestionsJson);
                GM_setValue(`${quizId}`, { "hash": hash, answers: answers });
                instantHighlight();
                return AI_DATA;
            } else {
                console.warn("AI returned empty answers object.");
                return null;
            }
        } catch (err) {
            showNotification("AI solver error: " + (err.message || err), "#af4c4c");
            console.error("AI solver error:", err);
            return null;
        }
    }
    // Helper: Strip HTML tags, preserve math exponents/subscripts, and decode entities
