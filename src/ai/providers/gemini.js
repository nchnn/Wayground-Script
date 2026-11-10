    async function solveQuizWithGemini(questionsJsonObject) {
        // Uses Google's official rolling alias for latest high-throughput Flash-Lite
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${API_KEY}`;

        const systemInstruction = `
            You are an expert quiz-solving assistant.
            You will receive a JSON object where each question has a "type", "question", "options" array, and optionally "answerLength".
            CRITICAL RULES:
            1. For "MCQ": Select the SINGLE correct option ID (string).
            2. For "MSQ": Select ALL correct option IDs as an ARRAY of strings.
            3. For "BLANK" or "OPEN": Provide a concise plain text answer matching exact "answerLength" if specified.
            Respond ONLY in JSON format: {"answers": {"QUESTION_ID": "OPTION_ID_OR_TEXT_OR_ARRAY"}}
        `;

        const payload = {
            contents: [{ parts: [{ text: JSON.stringify(questionsJsonObject) }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1
            }
        };

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: url,
                timeout: 30000,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify(payload),
                onload: function(response) {
                    try {
                        const jsonResponse = JSON.parse(response.responseText);
                        if (jsonResponse.error) {
                            showNotification(`Gemini Error: ${jsonResponse.error.message}`, "#af4c4c");
                            reject(new Error(jsonResponse.error.message));
                            return;
                        }
                        const rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (rawText) {
                            const parsed = JSON.parse(rawText);
                            resolve(parsed.answers || parsed);
                        } else {
                            reject(new Error("Gemini returned empty response"));
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                ontimeout: function() {
                    reject(new Error("Gemini request timed out after 30 seconds"));
                },
                onerror: function(err) {
                    reject(new Error("Network error connecting to Gemini"));
                }
            });
        });
    }

