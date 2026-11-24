    function fetchQuizData(quizId) {
        const cleanRoomId = quizId.toString().trim();

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://wayground.com/_gameapi/main/public/v1/students/games/${cleanRoomId}`,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const firstKey = Object.keys(data?.data?.quizzes || {})[0];

                        if (!firstKey) {
                            console.error("No quiz was found in the response.");
                            reject("No quiz found in the response");
                            return;
                        }

                        QUIZ_DATA = data.data.quizzes[firstKey];
                        resolve(QUIZ_DATA);

                    } catch (e) {
                        showNotification("Error processing quiz API data", "#af4c4c");
                        console.error('Error processing quiz API data:', e);
                        reject(e);
                    }
                },
                onerror: function (err) {
                    showNotification("GM_xmlhttpRequest failed", "#af4c4c");
                    console.error("GM_xmlhttpRequest failed", err);
                    reject(err);
                }
            });
        });
    }
    function getShadowEl(selector) {
        return shadow ? shadow.querySelector(selector) : null;
    }

    function getSelectedProvider() {
        return getShadowEl('#api-provider-select')?.value || GM_getValue("apiProvider", "gemini");
    }

