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
                    console.log("Room hash not on student endpoint, falling back to direct quiz API...");
                }
            }

            CLEANED_QUESTIONS = cleanQuizData(data.questions || ROOM_DATA?.questions);
            const hash = await generateQuizHash(CLEANED_QUESTIONS);

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

            const officialAnswers = formatQuizResultsFromSaved(data.questions || ROOM_DATA?.questions || savedQuestions);
            const hasOfficial = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

            if (hasOfficial) {
                CACHED_RESULTS = Object.assign({}, officialAnswers);

                const officialMap = {};
                const qList = Array.isArray(data.questions || ROOM_DATA?.questions || savedQuestions)
                    ? (data.questions || ROOM_DATA?.questions || savedQuestions)
                    : Object.values(data.questions || ROOM_DATA?.questions || savedQuestions);

                qList.forEach((q, idx) => {
                    const qId = q._id || q.id || String(idx);
                    const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                    if (ans !== undefined && ans !== null && ans !== -1) {
                        officialMap[qId] = ans;
                    }
                });

                AI_DATA = Object.assign({}, officialMap);

                // Identify missing questions (e.g. BLANK/OPEN or questions with no official answer in the API)
                const missingQuestions = {};
                if (CLEANED_QUESTIONS) {
                    qList.forEach((q, idx) => {
                        const qId = q._id || q.id || String(idx);
                        const qText = stripHtml(q.structure?.query?.text || q.query?.text || q.question || '');
                        const currAns = CACHED_RESULTS[qText];
                        if (!currAns || currAns === "Answer not found") {
                            if (CLEANED_QUESTIONS[qId]) {
                                missingQuestions[qId] = CLEANED_QUESTIONS[qId];
                            }
                        }
                    });
                }

                const missingCount = Object.keys(missingQuestions).length;
                if (missingCount > 0 && isAiChecked) {
                    showNotification(`Official answers loaded! Generating AI answers for ${missingCount} question(s)...`, "#FFA500");
                    const aiPartial = await requestAiAnswers(missingQuestions);
                    if (aiPartial) {
                        Object.assign(AI_DATA, aiPartial);
                        const formattedPartial = formatQuizResults(aiPartial, missingQuestions);
                        Object.assign(CACHED_RESULTS, formattedPartial);
                        showNotification("AI answers generated and merged!");
                    }
                }

                if (Object.keys(AI_DATA).length > 0) {
                    const targetKey = resolvedQuizId || "active_quiz";
                    GM_setValue(`${targetKey}`, { isOfficial: true, answers: AI_DATA });
                    GM_setValue("active_quiz", { isOfficial: true, answers: AI_DATA });
                }

                instantHighlight();

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = (missingCount > 0 && isAiChecked) ? 'Answers available (Official + AI)' : 'Answers available (Official)';
                    quizStatusMenu.style.color = 'var(--theme-accent)';
                }
                if (typeof renderAnswersList === 'function') {
                    renderAnswersList(CACHED_RESULTS, (missingCount > 0 && isAiChecked) ? "HYBRID" : "OFFICIAL");
                }
                if (missingCount === 0 || !isAiChecked) {
                    showNotification("Official Quizizz answers loaded!");
                }
                return;
            }

            if (quizStorage && quizStorage.isOfficial && quizStorage.answers && Object.keys(quizStorage.answers).length > 0) {
                AI_DATA = quizStorage.answers;
                CACHED_RESULTS = formatQuizResults(AI_DATA, CLEANED_QUESTIONS);

                instantHighlight();

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = 'Answers available';
                    quizStatusMenu.style.color = 'var(--theme-accent)';
                }
                if (typeof renderAnswersList === 'function') {
                    renderAnswersList(CACHED_RESULTS, "CACHE");
                }
                showNotification("Official answers loaded from cache!");
                return;
            }

            if (isAiChecked) {
                const aiAnswers = await processQuizAi(CLEANED_QUESTIONS);
                if (aiAnswers) {
                    CACHED_RESULTS = formatQuizResults(aiAnswers, data.questions || CLEANED_QUESTIONS);

                    instantHighlight();

                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = 'Answers available';
                        quizStatusMenu.style.color = 'var(--theme-accent)';
                    }
                    if (typeof renderAnswersList === 'function') {
                        renderAnswersList(CACHED_RESULTS, "AI");
                    }
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

    async function requestAiAnswers(questionsJson) {
        if (!questionsJson || Object.keys(questionsJson).length === 0) return null;

        const provider = getSelectedProvider();

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
                answers = await solveQuizWithGroq(questionsJson);
            } else if (provider === "gemini") {
                answers = await solveQuizWithGemini(questionsJson);
            } else if (provider === "gpt") {
                answers = await solveQuizWithGPT(questionsJson);
            }

            return (answers && Object.keys(answers).length > 0) ? answers : null;
        } catch (err) {
            showNotification("AI solver error: " + (err.message || err), "#af4c4c");
            console.error("AI solver error:", err);
            return null;
        }
    }

    const PENDING_ON_DEMAND = new Set();
    async function solveSingleQuestionOnDemand(qId, qData) {
        const toggleAiCheckbox = getShadowEl('#toggle-ai-checkbox');
        const isAiChecked = toggleAiCheckbox ? toggleAiCheckbox.checked : GM_getValue("aiAssistance", false);
        if (!isAiChecked) return null;

        const targetId = qId || qData?._id || qData?.id || 'active_q';
        if (PENDING_ON_DEMAND.has(targetId)) return null;
        PENDING_ON_DEMAND.add(targetId);

        try {
            const singleJson = {};
            const cleanObj = (CLEANED_QUESTIONS && CLEANED_QUESTIONS[targetId]) ? CLEANED_QUESTIONS[targetId] : {
                type: 'BLANK',
                question: stripHtml(qData?.question || qData?.structure?.query?.text || 'Question'),
                options: []
            };
            singleJson[targetId] = cleanObj;

            const answers = await requestAiAnswers(singleJson);
            if (answers && answers[targetId]) {
                if (!AI_DATA) AI_DATA = {};
                AI_DATA[targetId] = answers[targetId];

                const stem = stripHtml(qData?.question || qData?.structure?.query?.text || '');
                if (stem && CACHED_RESULTS) {
                    CACHED_RESULTS[stem] = String(answers[targetId]);
                }
                const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
                GM_setValue(`${quizId}`, { isOfficial: false, answers: AI_DATA });
                instantHighlight();
                return answers[targetId];
            }
        } finally {
            PENDING_ON_DEMAND.delete(targetId);
        }
        return null;
    }

    async function processQuizAi(cleanedQuestionsJson) {
        if (!cleanedQuestionsJson || Object.keys(cleanedQuestionsJson).length === 0) {
            console.error("No questions provided to processQuizAi.");
            showNotification("No question data found to solve", "#af4c4c");
            return null;
        }

        const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
        const hash = await generateQuizHash(cleanedQuestionsJson);

        const answers = await requestAiAnswers(cleanedQuestionsJson);
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
    }
