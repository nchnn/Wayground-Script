    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
        try {
            this._url = url;
        } catch (e) {
            console.warn("Could not capture request URL in XMLHttpRequest.open", e);
        }
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        try {
            if (this._url && infractions.test(this._url)) {
                console.group('%c[Security] Request Blocked', 'color: red; font-weight: bold;');
                try {
                    const payload = JSON.parse(body);
                    console.log('%cBlocked payload:', 'font-weight: bold;', payload);
                } catch (e) {
                    console.log('%cBlocked raw payload:', 'font-weight: bold;', body, e);
                }
                console.groupEnd();
                return;
            }

            const isJoin = join.test(this._url);
            const isRejoin = rejoin.test(this._url);
            const isSoloJoin = soloJoin.test(this._url);
            const isBase = base.test(this._url);
            const isCheckRoom = checkRoom.test(this._url);
            const isCheckRoomAsignment = checkRoomAsignmets.test(this._url);

            if (this._url && (isJoin || isRejoin || isSoloJoin || isBase || isCheckRoom || isCheckRoomAsignment)) {
                this.addEventListener('load', function () {
                    function applyPatches(xhrInstance, modifiedResponse) {
                        Object.defineProperty(xhrInstance, 'responseText', {
                            get: () => modifiedResponse,
                            configurable: true
                        });
                        Object.defineProperty(xhrInstance, 'response', {
                            get: () => modifiedResponse,
                            configurable: true
                        });
                    }

                    try {
                        let quizId = null;
                        if (isJoin) {
                            const data = JSON.parse(this.responseText);
                            try {
                                data.room.options.antiCheating.enabled = false;
                                data.room.options.focusMode = false;
                                data.room.options.disableCopyPaste = false;
                                data.room.options.disableRightClick = false;
                                data.room.options.alertOnInfraction = false;
                                ANTI_CHEAT = true;
                                showNotification("Protection enabled");
                                                                console.log("Protection enabled");
                            } catch {
                                ANTI_CHEAT = false;
                                showNotification("Protection setup failed", "#af4c4c");
                                                                console.log("Protection setup failed");
                            }
                            const modifiedResponse = JSON.stringify(data);
                            applyPatches(this, modifiedResponse);
                            ROOM_DATA = data?.room;
                            QUIZ_NAME = data?.room?.name;
                            TYPE_QUIZ = data?.room?.type;

                            const directQuizId = data?.room?.quizId || data?.room?.quizInfo?.quizId;
                            if (directQuizId) {
                                fetchQuizAnswers(directQuizId);
                            } else if (data?.room?.hash) {
                                fetchQuizDataId(data.room.hash).then(_id => {
                                    if (_id) fetchQuizAnswers(_id);
                                }).catch(() => {});
                            }

                            startQuizSolver(data?.room);
                        } else if (isRejoin) {
                            const data = JSON.parse(this.responseText);
                            if(data?.data?.room?.type === 'solo'){
                                fetchQuizDataId(data?.data?.room?.hash)
                                .then((_id) => {
                                    if (_id) {
                                        console.log("Quiz ID retrieved successfully:", _id);
                                        fetchQuizAnswers(_id);
                                    }
                                })
                                    .catch((error) => {
                                    console.error("Failed to get quiz ID:", error);
                                });
                            }else{
                                try {
                                    data.data.room.options.antiCheating.enabled = false;
                                    data.data.room.options.focusMode = false;
                                    data.data.room.options.disableCopyPaste = false;
                                    data.data.room.options.disableRightClick = false;
                                    data.data.room.options.alertOnInfraction = false;
                                    ANTI_CHEAT = true;
                                    showNotification("Protection enabled");
                                                                    console.log("Protection enabled");
                                } catch {
                                    ANTI_CHEAT = false;
                                    showNotification("Protection setup failed", "#af4c4c");
                                                                    console.log("Protection setup failed");
                                }
                                const modifiedResponse = JSON.stringify(data);
                                applyPatches(this, modifiedResponse);
                                ROOM_DATA = data?.data?.room;
                                QUIZ_NAME = data?.data?.room?.name;
                                TYPE_QUIZ = data?.data?.room?.type;

                                const rejoinQuizId = data?.data?.room?.quizId || data?.data?.room?.quizInfo?.quizId;
                                if (rejoinQuizId) {
                                    fetchQuizAnswers(rejoinQuizId);
                                } else if (data?.data?.room?.hash) {
                                    fetchQuizDataId(data.data.room.hash).then(_id => {
                                        if (_id) fetchQuizAnswers(_id);
                                    }).catch(() => {});
                                }

                                startQuizSolver(data?.data?.room);
                            }
                        } else if (isSoloJoin) {
                            const data = JSON.parse(body);
                            quizId = data.quizId;
                            fetchQuizAnswers(quizId);
                        } else if (isBase) {
                            const data = JSON.parse(this.responseText);
                            quizId = data.data?.quizInfo?.quizId;
                            fetchQuizAnswers(quizId);
                        } else if (isCheckRoomAsignment) {
                            savedQuestions = null; CLEANED_QUESTIONS = null;
                            const data = JSON.parse(this.responseText);
                            try {
                                data.room.options.antiCheating.enabled = false;
                                data.room.options.focusMode = false;
                                data.room.options.reviewAndSubmit = true;
                                data.room.options.timer = false;
                            } catch {}
                            applyPatches(this, JSON.stringify(data));
                        } else if (isCheckRoom) {
                            QUIZ_DATA = null;
                            ROOM_DATA = null;
                            savedQuestions = null;
                            CLEANED_QUESTIONS = null;
                        } else {
                            console.error("Request mapped differently dynamically.");
                        }
                    } catch (e) {
                        console.error('Error in game join flow:', e);
                    }
                });
            }
        } catch (e) {
            console.error("Critical error in .send interceptor:", e);
        }
        return originalSend.apply(this, arguments);
    };

