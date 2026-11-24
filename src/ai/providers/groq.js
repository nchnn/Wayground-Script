    async function solveQuizWithGroq(questionsJsonObject) {
        const url = "https://api.groq.com/openai/v1/chat/completions";

        const systemInstruction = `
            You are an expert quiz-solving assistant.
            CRITICAL RULES:
            1. For "MCQ": Select the single correct option ID (_id or id) or concise text.
            2. For "MSQ": Select ALL correct option IDs as an array of strings.
            3. For "BLANK" or "OPEN": Provide the concise plain text answer that should be typed into the blank.
            Respond ONLY in valid JSON matching: {"answers": {"QUESTION_ID": "OPTION_ID_OR_TEXT"}}.
        `;

        const entries = Object.entries(questionsJsonObject || {});
        if (entries.length === 0) return {};

        const CHUNK_SIZE = 6;
        const chunks = [];
        for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
            const chunkObj = {};
            entries.slice(i, i + CHUNK_SIZE).forEach(([k, v]) => {
                chunkObj[k] = {
                    type: v.type,
                    question: v.question?.slice(0, 250),
                    options: v.options?.map(o => ({ id: o.id, text: o.text?.slice(0, 120) }))
                };
                if (v.answerLength) chunkObj[k].answerLength = v.answerLength;
            });
            chunks.push(chunkObj);
        }

        const aggregatedAnswers = {};

        function solveChunk(chunkData, chunkIndex) {
            const payload = {
                model: "openai/gpt-oss-120b",
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: JSON.stringify(chunkData) }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            };

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: url,
                    timeout: 15000,
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${API_KEY}`
                    },
                    data: JSON.stringify(payload),
                    onload: function(response) {
                        try {
                            const json = JSON.parse(response.responseText);
                            if (json.error) {
                                reject(new Error(json.error.message || json.error));
                                return;
                            }
                            const raw = json.choices?.[0]?.message?.content;
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                resolve(parsed.answers || parsed);
                            } else {
                                resolve({});
                            }
                        } catch (e) {
                            reject(e);
                        }
                    },
                    ontimeout: function() {
                        reject(new Error(`Groq request timed out on batch ${chunkIndex + 1}`));
                    },
                    onerror: function(err) {
                        reject(new Error("Network error connecting to Groq"));
                    }
                });
            });
        }

        for (let i = 0; i < chunks.length; i++) {
            try {
                showNotification(`Solving batch ${i + 1}/${chunks.length} with Groq...`, "#FFA500");
                const batchAnswers = await solveChunk(chunks[i], i);
                Object.assign(aggregatedAnswers, batchAnswers);

                if (i < chunks.length - 1) {
                    await new Promise(r => setTimeout(r, 800));
                }
            } catch (err) {
                console.error(`Error on chunk ${i + 1}:`, err);
                showNotification(`Groq Batch ${i + 1} Error: ${err.message || err}`, "#af4c4c");
            }
        }

        return aggregatedAnswers;
    }
