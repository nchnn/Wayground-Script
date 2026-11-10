    async function solveQuizWithGPT(questionsJsonObject) {
        const url = "https://api.openai.com/v1/chat/completions";

        const systemInstruction = `
            You are an expert quiz-solving assistant.
            You will receive a JSON object containing questions and their respective options.
            For each question, identify the ID of the correct option (_id or id).
            Respond ONLY in JSON format matching the structure {"answers": {"QUESTION_ID": "CORRECT_OPTION_ID"}}.
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

