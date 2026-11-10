    function fetchQuizDataId(hash) {
        const cleanRoomId = hash.toString().trim();

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

                        if (!data) {
                            reject("No data found");
                            return;
                        }
                        resolve(data?.data?.items[0]?.quizId)

                    } catch (e) {
                        showNotification("Error processing quiz API data", "#af4c4c");
                        console.error('Error processing quiz API data', e);
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

