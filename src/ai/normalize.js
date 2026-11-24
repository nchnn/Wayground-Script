    function stripHtml(html) {
        if (html === null || html === undefined) return '';

        let formatted = String(html)
            .replace(/<sup[^>]*>(.*?)<\/sup>/gi, '^$1')
            .replace(/<sub[^>]*>(.*?)<\/sub>/gi, '_$1')
            .replace(/<br\s*\/?>/gi, '\n');

        const temp = document.createElement('div');
        temp.innerHTML = formatted;
        return (temp.textContent || temp.innerText || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const normalizeText = (str) => {
        return stripHtml(str)
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    };

    function extractAnswerText(rawAnswer, rawOptions = []) {
        if (rawAnswer === null || rawAnswer === undefined) return '';

        function parseNode(node) {
            if (node === null || node === undefined) return '';

            // Handle poll / opinion marker
            if (node === -1) {
                return 'Any Answer / Poll (All choices accepted)';
            }

            // Handle number: either an option index or raw numeric value
            if (typeof node === 'number') {
                if (rawOptions && rawOptions[node]) {
                    const opt = rawOptions[node];
                    const t = opt.text || opt.value || opt.query?.text || '';
                    if (t) return stripHtml(t);
                    const hasMedia = opt.media && (Array.isArray(opt.media) ? opt.media.length > 0 : Boolean(opt.media.url || opt.media.id));
                    if (hasMedia) return `Image #${node + 1}`;
                }
                return String(node);
            }

            // Handle string
            if (typeof node === 'string') {
                let str = stripHtml(node).trim();
                if (!str || str === '[object Object]') return '';

                // If string matches an option ID, prefer the option's text
                if (rawOptions && rawOptions.length > 0) {
                    const matchedIdx = rawOptions.findIndex(o => String(o.id || o._id) === str);
                    if (matchedIdx !== -1) {
                        const matched = rawOptions[matchedIdx];
                        const t = matched.text || matched.value || '';
                        if (t) return stripHtml(t);
                        const hasMedia = matched.media && (Array.isArray(matched.media) ? matched.media.length > 0 : Boolean(matched.media.url || matched.media.id));
                        if (hasMedia) return `Image #${matchedIdx + 1}`;
                    }
                }

                // If string looks like JSON object or array, try parsing
                if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
                    try {
                        const parsed = JSON.parse(str);
                        const res = parseNode(parsed);
                        if (res && res !== '[object Object]') return res;
                    } catch (e) {}
                }

                return str;
            }

            // Handle boolean
            if (typeof node === 'boolean') {
                return node ? 'True' : 'False';
            }

            // Handle array: recursively parse items and join cleanly
            if (Array.isArray(node)) {
                const parts = [];
                node.forEach(item => {
                    const parsed = parseNode(item);
                    if (parsed && parsed !== '[object Object]' && parsed.trim().length > 0) {
                        parts.push(parsed);
                    }
                });
                const unique = Array.from(new Set(parts));
                return unique.join(' | ');
            }

            // Handle object: check known answer properties
            if (typeof node === 'object') {
                const directFields = [
                    node.text,
                    node.value,
                    node.answer,
                    node.raw,
                    node.response,
                    node.label,
                    node.query?.text,
                    node.math?.latex,
                    node.latex
                ];

                for (const field of directFields) {
                    if (field !== undefined && field !== null) {
                        const parsed = parseNode(field);
                        if (parsed && parsed !== '[object Object]' && parsed.trim().length > 0) return parsed;
                    }
                }

                const values = Object.values(node);
                if (values.length > 0) {
                    const parts = [];
                    values.forEach(v => {
                        const parsed = parseNode(v);
                        if (parsed && parsed !== '[object Object]' && parsed.trim().length > 0) {
                            parts.push(parsed);
                        }
                    });
                    const unique = Array.from(new Set(parts));
                    if (unique.length > 0) return unique.join(' | ');
                }

                return '';
            }

            return stripHtml(String(node)).trim();
        }

        const out = parseNode(rawAnswer);
        if (!out || out === '[object Object]') {
            return '';
        }
        return out;
    }

    function getDetailedMatchPairs(q) {
        if (!q) return [];
        const structure = q.structure || {};
        const rawOptions = structure.options || q.options || [];
        const rawTargets = structure.targets || q.targets || [];
        const answer = structure.answer !== undefined ? structure.answer : q.answer;
        const matches = structure.matches || q.matches;
        const kind = String(q.type || structure.kind || '').toUpperCase();

        const isOrder = kind.includes('ORDER') || kind.includes('REORDER') || kind.includes('SORT') ||
                        (rawTargets.length === 0 && Array.isArray(answer) && answer.length > 1 && answer.length === rawOptions.length);

        function getCardLabel(opt, idx) {
            if (!opt) return `Item #${idx + 1}`;
            let text = stripHtml(opt.text || opt.value || opt.query?.text || '').trim();
            if (text) return text;
            const hasMedia = opt.media && (Array.isArray(opt.media) ? opt.media.length > 0 : Boolean(opt.media.url || opt.media.id));
            return hasMedia ? `Image #${idx + 1}` : `Card #${idx + 1}`;
        }

        function getTargetLabel(tgt, idx) {
            if (!tgt) return `Category #${idx + 1}`;
            if (typeof tgt === 'string' || typeof tgt === 'number') {
                const rawStr = stripHtml(String(tgt)).trim();
                if (rawTargets.length > 0) {
                    const found = rawTargets.find((t, tIdx) => String(t.id || t._id || tIdx) === rawStr);
                    if (found) return stripHtml(found.text || found.value || `Category #${idx + 1}`);
                }
                return rawStr;
            }
            return stripHtml(tgt.text || tgt.value || tgt.query?.text || `Category #${idx + 1}`).trim();
        }

        function extractMediaUrl(opt) {
            if (!opt) return '';
            if (Array.isArray(opt.media)) {
                return opt.media[0]?.url || opt.media[0]?.id || '';
            }
            return opt.media?.url || opt.media?.id || '';
        }

        const detailed = [];

        // Subcase 0: ORDER / REORDER
        if (isOrder && Array.isArray(answer)) {
            answer.forEach((optRef, orderIdx) => {
                let opt = null;
                let optIndex = typeof optRef === 'number' ? optRef : -1;
                if (typeof optRef === 'number') {
                    opt = rawOptions[optRef];
                } else if (typeof optRef === 'string') {
                    optIndex = rawOptions.findIndex((o, oIdx) => String(o.id || o._id || oIdx) === optRef);
                    if (optIndex !== -1) opt = rawOptions[optIndex];
                    else if (!isNaN(Number(optRef)) && rawOptions[Number(optRef)]) {
                        optIndex = Number(optRef);
                        opt = rawOptions[optIndex];
                    }
                } else if (optRef && typeof optRef === 'object') {
                    const optId = optRef.id || optRef.optionId || optRef.option;
                    optIndex = rawOptions.findIndex((o, oIdx) => String(o.id || o._id || oIdx) === String(optId));
                    if (optIndex !== -1) opt = rawOptions[optIndex];
                }
                const optLabel = opt ? getCardLabel(opt, optIndex !== -1 ? optIndex : orderIdx) : `Item #${orderIdx + 1}`;
                detailed.push({
                    cardLabel: optLabel,
                    targetLabel: `Slot ${orderIdx + 1}`,
                    orderNum: orderIdx + 1,
                    mediaUrl: extractMediaUrl(opt),
                    optId: String(opt?.id || opt?._id || (optIndex !== -1 ? optIndex : orderIdx)),
                    tgtId: String(orderIdx + 1)
                });
            });
            return detailed;
        }

        // Subcase 1: matches or answer array of objects
        const matchList = Array.isArray(matches) ? matches : (Array.isArray(answer) && answer.length > 0 && typeof answer[0] === 'object' ? answer : null);
        if (matchList) {
            matchList.forEach((m, idx) => {
                const optVal = m.option !== undefined ? m.option : (m.optionId !== undefined ? m.optionId : m.key);
                const tgtVal = m.target !== undefined ? m.target : (m.targetId !== undefined ? m.targetId : m.value);

                let optObj = typeof optVal === 'number' ? rawOptions[optVal] : rawOptions.find((o, oIdx) => String(o.id || o._id || oIdx) === String(optVal));
                let tgtObj = typeof tgtVal === 'number' ? rawTargets[tgtVal] : rawTargets.find((t, tIdx) => String(t.id || t._id || tIdx) === String(tgtVal));

                const optLabel = getCardLabel(optObj, typeof optVal === 'number' ? optVal : idx);
                const tgtLabel = tgtObj ? getTargetLabel(tgtObj, typeof tgtVal === 'number' ? tgtVal : idx) : String(tgtVal || '');
                if (optLabel && tgtLabel) {
                    detailed.push({
                        cardLabel: optLabel,
                        targetLabel: tgtLabel,
                        mediaUrl: extractMediaUrl(optObj),
                        optId: String(optObj?.id || optObj?._id || optVal),
                        tgtId: String(tgtObj?.id || tgtObj?._id || tgtVal)
                    });
                }
            });
        }

        // Subcase 2: answer object mapping { [optionId]: targetId }
        if (detailed.length === 0 && answer && typeof answer === 'object' && !Array.isArray(answer)) {
            Object.entries(answer).forEach(([key, val], idx) => {
                let optObj = rawOptions.find((o, oIdx) => String(o.id || o._id || oIdx) === key);
                let tgtObj = rawTargets.find((t, tIdx) => String(t.id || t._id || tIdx) === String(val));
                if (!optObj && !tgtObj) {
                    optObj = rawOptions.find((o, oIdx) => String(o.id || o._id || oIdx) === String(val));
                    tgtObj = rawTargets.find((t, tIdx) => String(t.id || t._id || tIdx) === key);
                }
                const optLabel = optObj ? getCardLabel(optObj, idx) : `Card #${idx + 1}`;
                const tgtLabel = tgtObj ? getTargetLabel(tgtObj, idx) : String(val);
                detailed.push({
                    cardLabel: optLabel,
                    targetLabel: tgtLabel,
                    mediaUrl: extractMediaUrl(optObj),
                    optId: String(optObj?.id || optObj?._id || key),
                    tgtId: String(tgtObj?.id || tgtObj?._id || val)
                });
            });
        }

        // Subcase 3: answer array of target IDs/indices corresponding to options
        if (detailed.length === 0 && Array.isArray(answer) && rawOptions.length > 0) {
            answer.forEach((tgtRef, optIdx) => {
                const optObj = rawOptions[optIdx];
                let tgtObj = null;
                if (typeof tgtRef === 'number') {
                    tgtObj = rawTargets[tgtRef];
                } else if (typeof tgtRef === 'string') {
                    tgtObj = rawTargets.find((t, tIdx) => String(t.id || t._id || tIdx) === tgtRef) || rawTargets[Number(tgtRef)];
                }
                const optLabel = getCardLabel(optObj, optIdx);
                const tgtLabel = tgtObj ? getTargetLabel(tgtObj, typeof tgtRef === 'number' ? tgtRef : optIdx) : String(tgtRef || '');
                if (optLabel && tgtLabel) {
                    detailed.push({
                        cardLabel: optLabel,
                        targetLabel: tgtLabel,
                        mediaUrl: extractMediaUrl(optObj),
                        optId: String(optObj?.id || optObj?._id || optIdx),
                        tgtId: String(tgtObj?.id || tgtObj?._id || tgtRef)
                    });
                }
            });
        }

        // Subcase 4: options have target property
        if (detailed.length === 0 && rawOptions.length > 0) {
            rawOptions.forEach((opt, optIdx) => {
                const tgtRef = opt.target || opt.targetId || opt.matchedWith || opt.match;
                if (tgtRef !== undefined && tgtRef !== null) {
                    let tgtObj = typeof tgtRef === 'number' ? rawTargets[tgtRef] : rawTargets.find((t, tIdx) => String(t.id || t._id || tIdx) === String(tgtRef));
                    const optLabel = getCardLabel(opt, optIdx);
                    const tgtLabel = tgtObj ? getTargetLabel(tgtObj, optIdx) : String(tgtRef);
                    detailed.push({
                        cardLabel: optLabel,
                        targetLabel: tgtLabel,
                        mediaUrl: extractMediaUrl(opt),
                        optId: String(opt?.id || opt?._id || optIdx),
                        tgtId: String(tgtObj?.id || tgtObj?._id || tgtRef)
                    });
                }
            });
        }

        return detailed;
    }

    function formatMatchOrOrderAnswer(q) {
        if (!q) return null;
        const structure = q.structure || {};
        const rawOptions = structure.options || q.options || [];
        const rawTargets = structure.targets || q.targets || [];
        const kind = String(q.type || structure.kind || '').toUpperCase();
        const answer = structure.answer !== undefined ? structure.answer : q.answer;
        const isMatch = kind.includes('MATCH') || kind.includes('CLASSIF') || (rawTargets && rawTargets.length > 0);
        const isOrder = kind.includes('ORDER') || kind.includes('REORDER') || kind.includes('SORT') ||
                        (rawTargets.length === 0 && Array.isArray(answer) && answer.length > 1 && answer.length === rawOptions.length);

        if (!isMatch && !isOrder && rawTargets.length === 0) return null;

        // ORDER or MATCH
        const detailed = getDetailedMatchPairs(q);
        if (detailed.length > 0) {
            return detailed.map(d => `${d.cardLabel} ➔ ${d.targetLabel}`).join('  |  ');
        }

        return null;
    }

    function cleanQuizData(rawJson) {
        const cleanedQuestionsJson = {};
        if (!rawJson) return cleanedQuestionsJson;

        try {
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
                        text: optText || (opt.media?.length || opt.media ? `Image #${idx + 1}` : `Option ${idx + 1}`)
                    };
                });

                const rawTargets = structure?.targets || qData?.targets || [];
                const itemData = {
                    type: questionType,
                    question: fullQuestionText || 'Question',
                    options: options
                };

                if (rawTargets.length > 0) {
                    itemData.targets = rawTargets.map((t, idx) => ({
                        id: String(t.id || t._id || idx),
                        text: stripHtml(t.text || t.query?.text || t.value || `Category #${idx + 1}`)
                    }));
                }

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

    function formatQuizResults(answersMap, questionsObject) {
        const formattedResults = {};
        const safeAnswersMap = answersMap?.answers || answersMap || {};
        const safeQuestionsObj = questionsObject || {};

        Object.keys(safeQuestionsObj).forEach((qId) => {
            const qData = safeQuestionsObj[qId];
            const rawQuestion = qData?.question || qData?.structure?.query?.text || '';
            const questionText = stripHtml(rawQuestion);
            if (!questionText) return;

            // Check if it's a match, classification, or order question first
            const matchAnswer = formatMatchOrOrderAnswer(qData);
            if (matchAnswer) {
                formattedResults[questionText] = matchAnswer;
                return;
            }

            let aiAnswer = safeAnswersMap[qId];

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
                if (aiAnswer === -1) {
                    answerText = "Any Answer / Poll (All choices accepted)";
                } else {
                    const targetArray = Array.isArray(aiAnswer) ? aiAnswer : [aiAnswer];
                    const matchedTexts = options
                        .filter((opt, idx) => targetArray.some(a => String(a) === opt.id || String(a) === String(idx)))
                        .map(opt => opt.text)
                        .filter(t => t && t.trim().length > 0);

                    if (matchedTexts.length > 0) {
                        answerText = matchedTexts.join(" | ");
                    } else {
                        const extracted = extractAnswerText(aiAnswer, options);
                        if (extracted && extracted !== '[object Object]' && extracted.trim().length > 0) {
                            answerText = extracted;
                        } else if (typeof aiAnswer === "string" && aiAnswer.trim().length > 0) {
                            answerText = stripHtml(aiAnswer);
                        } else {
                            answerText = "Answer not found";
                        }
                    }
                }
            }

            formattedResults[questionText] = answerText;
        });

        return formattedResults;
    }
