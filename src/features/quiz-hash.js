    function getQuizContentKey(questions) {
        if (!questions || typeof questions !== 'object') return null;
        const qList = Array.isArray(questions) ? questions : Object.values(questions);
        if (qList.length === 0) return null;

        const stems = qList.map(q => {
            const rawQ = q.structure?.query?.text || q.query?.text || q.question || '';
            return normalizeText(rawQ);
        }).filter(t => t && t.length > 3).sort();

        if (stems.length === 0) return null;

        const signature = stems.slice(0, 6).join(':::');
        let hash = 0;
        for (let i = 0; i < signature.length; i++) {
            hash = ((hash << 5) - hash) + signature.charCodeAt(i);
            hash |= 0;
        }
        return `quiz_sig_${Math.abs(hash)}`;
    }
    async function generateQuizHash(questionsJsonObject) {
        try {
            if (!questionsJsonObject || typeof questionsJsonObject !== 'object') return null;
            const sortedKeys = Object.keys(questionsJsonObject).sort();
            const canonical = sortedKeys.join('|');
            const msgUint8 = new TextEncoder().encode(canonical);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
            return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn("Hashing error:", e);
            return null;
        }
    }

    function formatQuizResultsFromSaved(questions) {
        const results = {};
        if (!questions || typeof questions !== 'object') return results;

        const qList = Array.isArray(questions) ? questions : Object.values(questions);

        qList.forEach(q => {
            const rawQ = q.structure?.query?.text || q.query?.text || q.question || '';
            const qText = stripHtml(rawQ);
            if (!qText) return;

            // Check if it's a match, classification, or order question first
            if (typeof formatMatchOrOrderAnswer === 'function') {
                const matchAns = formatMatchOrOrderAnswer(q);
                if (matchAns) {
                    results[qText] = matchAns;
                    return;
                }
            }

            const answer = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
            const options = (q.structure?.options || q.options || []).map((o, idx) => {
                let optText = stripHtml(o.text || o.value || o.query?.text || '');
                if (!optText) {
                    const hasMedia = o.media && (Array.isArray(o.media) ? o.media.length > 0 : Boolean(o.media.url || o.media.id));
                    if (hasMedia) optText = `Image #${idx + 1}`;
                }
                return {
                    id: String(o.id || o._id || idx),
                    text: optText
                };
            });

            let ansText = "Answer not found";
            if (answer !== undefined && answer !== null) {
                if (answer === -1) {
                    ansText = "Any Answer / Poll (All choices accepted)";
                } else {
                    const targetIndices = Array.isArray(answer) ? answer : [answer];
                    const matchedTexts = options
                        .filter((opt, idx) => targetIndices.some(t => String(t) === String(opt.id) || String(t) === String(idx)))
                        .map(opt => opt.text)
                        .filter(t => t && t.trim().length > 0);

                    if (matchedTexts.length > 0) {
                        ansText = matchedTexts.join(" | ");
                    } else {
                        const extracted = typeof extractAnswerText === 'function' ? extractAnswerText(answer, options) : '';
                        if (extracted && extracted !== '[object Object]' && extracted.trim().length > 0) {
                            ansText = extracted;
                        }
                    }
                }
            }
            results[qText] = ansText;
        });
        return results;
    }

