    async function solveQuizWithGPT(questionsJsonObject) {
        const url = "https://api.openai.com/v1/chat/completions";

        const systemInstruction = `
            You are an expert quiz-solving assistant.
            CRITICAL RULES:
            1. For "MCQ": Select the single correct option ID (_id or id) or concise text.
            2. For "MSQ": Select ALL correct option IDs as an array of strings.
            3. For "BLANK" or "OPEN": Provide the concise plain text answer that should be typed into the blank.
            Respond ONLY in JSON format matching the structure {"answers": {"QUESTION_ID": "OPTION_ID_OR_TEXT"}}.
        `;

        const payload = {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: JSON.stringify(questionsJsonObject) }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
        };

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                timeout: 15000,
ontimeout: function() {
    reject(new Error("Request timed out after 15 seconds"));
},
                method: "POST",
                url: url,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                },
                data: JSON.stringify(payload),
                onload: function(response) {
                    try {
                        const jsonResponse = JSON.parse(response.responseText);
                        if (jsonResponse.error) {
                            showNotification(`OpenAI Error: ${jsonResponse.error?.message || jsonResponse.error}`, "#af4c4c");
                            reject(jsonResponse.error);
                            return;
                        }
                        const choice = jsonResponse.choices?.[0];
                        if (choice?.message?.content) {
                            const parsed = JSON.parse(choice.message.content);
                            resolve(parsed.answers || parsed);
                        } else {
                            reject("OpenAI empty response");
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: reject
            });
        });
    }

