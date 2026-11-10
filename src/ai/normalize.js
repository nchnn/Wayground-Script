    function stripHtml(html) {
        if (html === null || html === undefined) return '';

        // Force the input to a String to prevent crash when Quizizz passes raw Numbers/Arrays
        let formatted = String(html)
            .replace(/<sup[^>]*>(.*?)<\/sup>/gi, '^$1')
            .replace(/<sub[^>]*>(.*?)<\/sub>/gi, '_$1')
            .replace(/<br\s*\/?>/gi, '\n');

        const temp = document.createElement('div');
        temp.innerHTML = formatted;
        return (temp.textContent || temp.innerText || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    }

    const normalizeText = (str) => {
        return stripHtml(str)
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    };

    function cleanQuizData(rawJson) {
        const cleanedQuestionsJson = {};
        if (!rawJson) return cleanedQuestionsJson;

        try {
            // Handle both Array (savedQuestions) and Object (ROOM_DATA) formats
            const entries = Array.isArray(rawJson)
                ? rawJson.map((q, idx) => [q._id || q.id || String(idx), q])
                : Object.entries(rawJson);

            for (const [qId, qData] of entries) {
                const structure = qData?.structure || {};
                let questionType = qData?.type || structure?.kind || 'MCQ';

                const isMultiple = structure?.settings?.hasMultipleCorrectAnswers ||
                                   structure?.settings?.canSelectMultiple ||
                                   structure?.kind === 'MSQ' ||
                                   qData?.type === 'MSQ';
                if (isMultiple) questionType = 'MSQ';

                let queryRaw = structure?.query?.text || qData?.query?.text || qData?.question || '';
                let mathLatex = structure?.query?.math?.latex || structure?.query?.latex || '';
                if (Array.isArray(mathLatex)) mathLatex = mathLatex.join(' ').trim();
                if (mathLatex && String(mathLatex).trim().length > 0) {
                    queryRaw += ` [Formula: ${mathLatex}]`;
                }

                const mediaArr = structure?.query?.media || qData?.query?.media || structure?.media || [];
                const mediaItems = Array.isArray(mediaArr) ? mediaArr : (mediaArr ? [mediaArr] : []);
                const mediaUrls = mediaItems
                    .filter(m => m && (m.url || m.id))
                    .map(m => `[Diagram/Image: ${m.url || m.id}]`)
                    .join(' ');

                let fullQuestionText = stripHtml(queryRaw);
                if (mediaUrls) {
                    fullQuestionText = (fullQuestionText ? fullQuestionText + ' ' : '') + mediaUrls;
                }

                const targetSettings = structure?.targets?.[0]?.settings;
                const answerLength = targetSettings?.answerLength ||
                      structure?.settings?.questionMetadata?.answerLength || 0;

                const rawOptions = structure?.options || qData?.options || [];
                const options = rawOptions.map((opt, idx) => {
                    let optText = stripHtml(opt.text || '');

                    let optLatex = opt.math?.latex || opt.latex || '';
                    if (Array.isArray(optLatex)) optLatex = optLatex.join(' ').trim();
                    if (optLatex && String(optLatex).trim().length > 0) {
                        optText = optText ? `${optText} (${optLatex})` : optLatex;
                    }

                    const optMediaUrl = Array.isArray(opt.media) ? opt.media[0]?.url : opt.media?.url;
                    if (optMediaUrl && !optText) {
                        optText = `[Option Image: ${optMediaUrl}]`;
                    } else if (optMediaUrl) {
                        optText += ` [Option Image: ${optMediaUrl}]`;
                    }

                    return {
                        id: opt.id || opt._id || String(idx),
                        text: optText || `Option ${idx + 1}`
                    };
                });

                const itemData = {
                    type: questionType,
                    question: fullQuestionText || 'Question',
                    options: options
                };

                if (answerLength > 0) {
                    itemData.answerLength = answerLength;
                }

                const finalId = qData?._id || qData?.id || qId;
                cleanedQuestionsJson[finalId] = itemData;
            }
        } catch (e) {
            console.error("Error cleaning questions JSON:", e);
        }

        return cleanedQuestionsJson;
    }

    // Restores missing formatQuizResults function
    function formatQuizResults(answersMap, questionsObject) {
        const formattedResults = {};
        const safeAnswersMap = answersMap?.answers || answersMap || {};
        const safeQuestionsObj = questionsObject || {};

        Object.keys(safeQuestionsObj).forEach((qId) => {
            const qData = safeQuestionsObj[qId];
            const rawQuestion = qData?.question || qData?.structure?.query?.text || '';
            const questionText = stripHtml(rawQuestion);
            if (!questionText) return;

            let aiAnswer = safeAnswersMap[qId];

            // If the ID got mismatched, fall back to searching text keys
            if (aiAnswer === undefined) {
                 const matchId = Object.keys(safeAnswersMap).find(k => String(k).includes(qId) || qId.includes(String(k)));
                 if (matchId) aiAnswer = safeAnswersMap[matchId];
            }

            const rawOptions = qData?.options || qData?.structure?.options || [];
            const options = rawOptions.map((opt, idx) => ({
                id: String(opt.id || opt._id || idx),
                text: stripHtml(opt.text || '')
            }));

            let answerText = "Answer not found";

            if (aiAnswer !== undefined && aiAnswer !== null) {
                const targetArray = Array.isArray(aiAnswer) ? aiAnswer : [aiAnswer];
                const matchedTexts = options
                    .filter((opt, idx) => targetArray.some(a => String(a) === opt.id || String(a) === String(idx)))
                    .map(opt => opt.text);

                if (matchedTexts.length > 0) {
                    answerText = matchedTexts.join(" | ");
                } else if (typeof aiAnswer === "object") {
                    answerText = JSON.stringify(aiAnswer); // safety fallback
                } else {
                    answerText = String(aiAnswer); // Direct AI string output
                }
            }

            formattedResults[questionText] = answerText;
        });

        return formattedResults;
    }
