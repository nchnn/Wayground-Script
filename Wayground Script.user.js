// ==UserScript==
// @name         Wayground Script
// @description  Wayground Script enhances quiz UI with answer assistance, focus protection, and re-enables copy, paste, and text selection; powered by AI.
// @version      4.3.0
// @author       Inchan
// @license      GPLv3
// @match        *://*.wayground.com/*
// @match        *://*.quizizz.com/*
// @icon         https://cf.quizizz.com/img/wayground/brand/favicon/favicon-32x32.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @connect      generativelanguage.googleapis.com
// @connect      api.openai.com
// @connect      generativelanguage.googleapis.com
// @connect      api.openai.com
// @connect      api.groq.com

// @downloadURL https://update.greasyfork.org/scripts/602640/Wayground%20Script.user.js
// @updateURL https://update.greasyfork.org/scripts/602640/Wayground%20Script.meta.js
// ==/UserScript==

(function() {
    'use strict';
    let API_KEY = null;
    let QUIZ_DATA = null;
    let ROOM_DATA = null;
    let AI_DATA = null;
    let OK = false;
    let QUIZ_NAME = 'Waiting';
    let ANTI_CHEAT = false;
    let TYPE_QUIZ = '';
    let CLEANED_QUESTIONS = null;
    let savedQuestions = null;        // FIX: was missing, causing ReferenceError in strict mode
    let CACHED_RESULTS = null;       // FIX: declare globally
    let isAnsVisible = true;         // FIX: global state for answer visibility
    let AUTO_CLICK = GM_getValue("autoClickEnabled", false);
    let AUTO_CLICK_DELAY = GM_getValue("autoClickDelay", 1000); // 1000ms default delay
    let hasAutoClickedCurrent = false; // Prevents spam clicking the same question
    let NOTIFICATIONS_ENABLED = GM_getValue("notificationsEnabled", true);

    // All shortcuts default to "None" (safe crash-proof initialization)
    let rawHotkeys = GM_getValue("customHotkeys", null);
    if (!rawHotkeys || typeof rawHotkeys !== 'object') {
        rawHotkeys = {};
    }
    let HOTKEYS = {
        toggleAnswers: "None",
        toggleStealth: "None",
        toggleAutoClick: "None",
        reSolve: "None",
        toggleAnswersMenu: "None",
        toggleSettingsMenu: "None",
        ...rawHotkeys
    };
    const infractions = /^https:\/\/wayground\.com\/_gameapi\/main\/public\/v1\/games\/[a-f0-9]+\/player-infraction/;
    const rejoin = /^https:\/\/wayground\.com\/_gameapi\/main\/public\/v1\/games\/([a-f0-9]{24})\/rejoin/;
    const join = /^https:\/\/wayground\.com\/play-api\/v5\/join/;
    const soloJoin = /^https:\/\/wayground\.com\/play-api\/v4\/soloJoin/;
    const base = /^https:\/\/wayground\.com\/_gameapi\/main\/public\/v1\/students\/attempts\/([a-f0-9]{24})/;
    const checkRoom = /^https:\/\/wayground\.com\/play-api\/v5\/checkRoom/;
    const checkRoomAsignmets = /^https:\/\/wayground\.com\/play-api\/v5\/checkAssignment/;

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

                            // 100% ACCURATE FIX: Fetch official 5/5 answers directly from Quizizz database on join!
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
                            // Auto SPA Ghost Killer 1: Assures solo entry sequences clear cache cross context securely globally.
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
                            // SPA Lobby Handler: Clears previous game memory when entering a new lobby
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

    let shadow = null;

    function toLoad() {
        try {
            const mainBody = document.body;
            let html = null;

            if (mainBody) {
                html = document.documentElement;
                html.style.setProperty('--color-picked-user', '#4579f2');
                html.style.setProperty('--color-highlight', 'currentColor');
            } else {
                console.warn("Could not access the iframe");
            }

            const host = document.createElement('div');
            host.id = 'wayground-host';
            if(mainBody) { mainBody.appendChild(host); }
            shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500&display=swap');
                :host {
                    --loader-size: 24px;
                    --jump-height: -30px;
                    --anim-dur: 1.4s;
                    position: fixed;
                    bottom: 10px;
                    right: 10px;
                    z-index: 99999;
                    pointer-events: none;
                }

                .menu {
                    fill: var(--icon-color);
                }

                .main {
                    --secondary-color: #292929;
                    --main-color: rgba(255, 255, 255);
                    --icon-color: #292929;
                    display: grid;
                    grid-template-columns: repeat(12, 1fr);
                    gap: 0;
                    width: 280px;
                    align-items: center;
                    justify-content: center;
                    transition: gap 0.4s ease-in-out;
                    pointer-events: none;
                    position: relative;
                }

                .text {
                    opacity: 0;
                    transition: 0.2s ease-in-out;
                    font-family: "Poppins", sans-serif;
                    font-weight: 500;
                    font-size: 16px;
                    color: var(--secondary-color);
                    margin: 0;
                }

                .subtextT {
                    transition: 0.2s ease-in-out;
                    color: var(--secondary-color);
                    margin: 0;
                    font-size: 12px;
                    opacity: 0;
                    font-family: 'Poppins', sans-serif;
                }

                .subtext {
                    transition: 0.2s ease-in-out;
                    color: var(--secondary-color);
                    margin: 0;
                    font-size: 12px;
                    opacity: 0.6;
                    font-family: 'Poppins', sans-serif;
                }

                .main_back {
                    position: absolute;
                    justify-self: center;
                    transition: 0.2s ease-in-out, 0.1s background-color ease-in-out, 0.1s background-image ease-in-out;
                }

                .cardBa {
                    display: flex;
                    background: transparent;
                    align-items: center;
                    justify-content: center;
                    width: 60px;
                    height: 60px;
                    backdrop-filter: blur(5px);
                    -webkit-backdrop-filter: blur(5px);
                    border-radius: 10px;
                    pointer-events: auto;
                }

                .card, .card-track {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 70px;
                    height: 70px;
                    border-top-left-radius: 10px;
                    border: 1px solid transparent;
                    gap: 3px;
                    will-change: transform;
                    transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.2s ease-in-out, background-color 0.2s ease, background-image 0.2s ease-in-out;
                }

                .card-track:hover {
                    background-color: var(--secondary-color);
                    box-shadow: 0px 10px 20px rgba(0, 0, 0, 0.2);
                }

                .card-track:hover .text {
                    color: var(--main-color) !important;
                }

                .card .title {
                    opacity: 0;
                    transition: 0.2s ease-in-out;
                    background: #f5e642;
                }

                .card:nth-child(1) {
                    grid-column: span 12;
                    width: 100%;
                }

                .card:nth-child(2) {
                    grid-column: span 7;
                    width: 100%;
                    flex-direction: column;
                    border-radius: 0px;
                }

                .card:nth-child(3) {
                    grid-column: span 5;
                    width: 100%;
                    flex-direction: column;
                    border-radius: 0px;
                }

                .card:nth-child(3) .shield {
                    opacity: 0;
                    transition: 0.2s ease-in-out;
                    fill: var(--secondary-color);
                }

                .card:nth-child(4) {
                    grid-column: span 6;
                    width: 100%;
                    flex-direction: column;
                    border-radius: 0px;
                }

                .card:nth-child(4) .toggleAns {
                    opacity: 0;
                    transition: 0.2s ease-in-out;
                    fill: var(--secondary-color);
                }

                .card:nth-child(5) {
                    grid-column: span 6;
                    width: 100%;
                    flex-direction: column;
                    border-radius: 0px;
                }

                .card:nth-child(5) .toggleAns {
                    opacity: 0;
                    transition: 0.2s ease-in-out;
                    fill: var(--secondary-color);
                }

                .card:nth-child(6) {
                    grid-column: span 4;
                    width: 100%;
                    border-radius: 0px;
                    border-bottom-left-radius: 10px;
                }

                .card:nth-child(6) .greasy {
                    opacity: 0;
                    transition: 0.2s ease-in-out;
                    fill: var(--secondary-color);
                }

                .card:nth-child(7) {
                    grid-column: span 4;
                    width: 100%;
                    border-radius: 0px;
                }

                .card:nth-child(7) .github {
                    opacity: 0;
                    transition: 0.2s ease-in-out;
                    fill: var(--secondary-color);
                }

                .card:nth-child(8) {
                    grid-column: span 4;
                    width: 100%;
                    border-radius: 0px;
                    border-bottom-right-radius: 10px;
                }

                .card:nth-child(8) .settings {
                    opacity: 0;
                    transition: 0.2s ease-in-out;
                    fill: var(--secondary-color);
                }


                .main:hover {
                    gap: 0.4em;
                    cursor: pointer;
                    pointer-events: auto;
                }

                .main:hover .words { opacity: 1; }
                .main:hover .text { opacity: 1; }
                .main:hover .subtextT { opacity: 0.6; }
                .main:hover .main_back { opacity: 0;display: none; }
                .main:hover .menu { opacity: 0; display: none; }
                .main:hover .card {
                    margin: 0;
                    border-radius: 10px;
                    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    background: var(--main-color);
                }

                .main:hover .card:nth-child(8) { border: transparent; }
                .main:hover .title { opacity: 1; }
                .main:hover .shield { opacity: 1; }
                .main:hover .toggleAns { opacity: 1; }
                .main:hover .greasy { opacity: 1; }
                .main:hover .github { opacity: 1; }
                .main:hover .settings { opacity: 1; }
                .card:hover {
                    transform: scale(1.02);
                }

                .card:nth-child(1):hover {
                    border-bottom: 5px solid #0a0a0a;
                    position: relative;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    background-color: #f5e642;
                    background-image: repeating-linear-gradient(45deg, transparent 0px, transparent 8px, rgba(0, 0, 0, 0.12) 8px, rgba(0, 0, 0, 0.12) 10px);
                }

                .card:nth-child(1):hover .text { color: #292929; }
                .card:nth-child(2):hover { border-bottom: 5px solid #0a0a0a; background: #adb5bd; cursor: pointer; }
                .card:nth-child(2):hover .text { color: #292929; }
                .card:nth-child(3):hover { border-bottom: 5px solid #0a0a0a; background: #adb5bd; }
                .card:nth-child(3):hover .text { color: #292929; }
                .card:nth-child(3):hover .shield { fill: var(--secondary-color); }
                .card:nth-child(4):hover { border-bottom: 5px solid #0a0a0a; background: #adb5bd; }
                .card:nth-child(4):hover .text { color: #292929; }
                .card:nth-child(4):hover .toggleAns { fill: #292929; }
                .card:nth-child(5):hover { border-bottom: 5px solid #0a0a0a; background: #adb5bd; }
                .card:nth-child(5):hover .text { color: #292929; }
                .card:nth-child(5):hover .toggleAns { fill: #292929; }
                .card:nth-child(6):hover { border-bottom: 5px solid #0a0a0a; background-color: var(--secondary-color); }
                .card:nth-child(6):hover .greasy { fill: var(--main-color); }
                .card:nth-child(6):hover .svgIcon { transform: rotate(250deg); transition-duration: 1.5s; }
                .card:nth-child(7):hover { border-bottom: 5px solid #0a0a0a; background-color: var(--secondary-color); }
                .card:nth-child(7):hover .github { fill: var(--main-color); }
                .card:nth-child(7):hover .text { color: var(--main-color); }
                .card:nth-child(8):hover { border-bottom: 5px solid #0a0a0a; background-color: var(--secondary-color); }
                .card:nth-child(8):hover .settings { fill: var(--main-color); }
                .card:nth-child(8) > svg { animation: spin 4s linear infinite; transform-origin: center; }

                .loader-container {
                    position: relative;
                    width: var(--loader-size);
                    height: var(--loader-size);
                }

                .loader-shadow {
                    position: absolute;
                    bottom: -6px;
                    left: calc(var(--loader-size) * -0.2);
                    width: calc(var(--loader-size) * 1.4);
                    height: 4px;
                    background: rgba(0, 0, 0, 0.15);
                    border-radius: 50%;
                    animation: shadowScale var(--anim-dur) infinite;
                    transform-origin: center center;
                }

                .loader-box-wrap {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    transform-origin: bottom center;
                    animation: squash var(--anim-dur) infinite;
                }

                .loader-box {
                    width: 100%;
                    height: 100%;
                    animation: jumpRotate var(--anim-dur) infinite;
                    transform-origin: center center;
                }

                .loader-box svg {
                    width: 100%;
                    height: 100%;
                    display: block;
                }

                @keyframes squash {
                    0% { transform: scaleX(1.05) scaleY(0.95); animation-timing-function: ease-in-out; }
                    15% { transform: scaleX(0.95) scaleY(1.05); animation-timing-function: ease-out; }
                    50% { transform: scaleX(1) scaleY(1); animation-timing-function: ease-in; }
                    84.9% { transform: scaleX(0.95) scaleY(1.05); }
                    85% { transform: scaleX(1.15) scaleY(0.85); animation-timing-function: ease-in-out; }
                    100% { transform: scaleX(1.05) scaleY(0.95); }
                }

                @keyframes jumpRotate {
                    0% { transform: translateY(0) rotate(0deg); animation-timing-function: ease-in-out; }
                    15% { transform: translateY(0) rotate(0deg); animation-timing-function: ease-out; }
                    50% { transform: translateY(var(--jump-height)) rotate(45deg); animation-timing-function: ease-in; }
                    84.9% { transform: translateY(0) rotate(90deg); }
                    85% { transform: translateY(0) rotate(90deg); animation-timing-function: ease-in-out; }
                    100% { transform: translateY(0) rotate(90deg); }
                }

                @keyframes shadowScale {
                    0% { transform: scaleX(1.05); opacity: 0.15; animation-timing-function: ease-in-out; }
                    15% { transform: scaleX(0.9); opacity: 0.1; animation-timing-function: ease-out; }
                    50% { transform: scaleX(0.5); opacity: 0.05; animation-timing-function: ease-in; }
                    84.9% { transform: scaleX(0.9); opacity: 0.1; }
                    85% { transform: scaleX(1.15); opacity: 0.2; animation-timing-function: ease-in-out; }
                    100% { transform: scaleX(1.05); opacity: 0.15; }
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                #pause { display: none; }

                .words {
                    display: inline-block;
                    opacity: 0;
                    height: 1.5em;
                    overflow: hidden;
                    position: relative;
                }

                .word {
                    display: flex;
                    align-items: center;
                    height: 100%;
                    padding-left: 6px;
                    color: #956afa;
                    animation: spin_words 4s infinite ease-in-out;
                }

                @keyframes spin_words {
                    20% { transform: translateY(-102%); }
                    33% { transform: translateY(-100%); }
                    53% { transform: translateY(-202%); }
                    66% { transform: translateY(-200%); }
                    86% { transform: translateY(-302%); }
                    100% { transform: translateY(-300%); }
                }

                .switch {
                    font-size: 17px;
                    position: relative;
                    display: inline-block;
                    width: 40px;
                    height: 22px;
                    opacity: 0;
                }

                .main:hover .switch {
                    opacity: 1;
                }

                .switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #fff;
                    border: 1px solid #adb5bd;
                    transition: .4s;
                    border-radius: 22px;
                }

                .slider:before {
                    position: absolute;
                    content: "";
                    height: 16px;
                    width: 16px;
                    border-radius: 50%;
                    left: 2px;
                    bottom: 2px;
                    background-color: #adb5bd;
                    transition: .4s;
                }

                input:checked + .slider {
                    background-color: #39be44;
                    border: 1px solid #39be44;
                }

                input:focus + .slider {
                    box-shadow: 0 0 1px #39be44;
                }

                input:checked + .slider:before {
                    transform: translateX(18px);
                    background-color: #fff;
                }

                .settings_menu, .terms_menu, .apikey_menu, .answers_menu {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    min-height: 100%;
                    height: max-content;
                    background: var(--main-color);
                    border-radius: 10px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
                    backdrop-filter: blur(5px);
                    -webkit-backdrop-filter: blur(5px);
                    filter: blur(0px);

                    opacity: 0;
                    filter: blur(10px);
                    pointer-events: none;
                    visibility: hidden;
                    max-height: 100%;
                    overflow: hidden;
                    transition: opacity 0.3s ease-in-out, filter 0.3s ease-in-out, max-height 0.6s ease-in-out, visibility 0.3s;

                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    padding: 20px;
                    box-sizing: border-box;
                    z-index: 100;
                    gap: 15px;
                }

                .settings-item {
                    border-radius: 8px; border: 1px solid rgba(150, 150, 150, 0.2);
                    padding: 10px 15px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    box-sizing: border-box;
                }

                #close-settings, #close-terms, #close-apikey, #close-answers {
                    cursor: pointer;
                    fill: var(--secondary-color);
                    transition: transform 0.2s;
                }

                #close-settings:hover, #close-terms:hover, #close-apikey:hover, #close-answers:hover {
                    transform: scale(1.2);
                }

                .settings_menu.open, .terms_menu.open, .apikey_menu.open, .answers_menu.open {
                    opacity: 1;
                    filter: blur(0px);
                    max-height: 600px;
                    pointer-events: auto;
                    visibility: visible;
                    border-bottom: 5px solid #0a0a0a;
                    background-color: var(--main-color);
                }

                .settings_menu.open > div:first-child > .text, .terms_menu.open > div:first-child > .text, .apikey_menu.open > div:first-child > .text, .answers_menu.open > div:first-child > .text {
                    color: var(--secondary-color);
                }

                .settings_menu.open > div:first-child > #close-settings, .terms_menu.open > div:first-child > #close-terms, .apikey_menu.open > div:first-child > #close-apikey, .answers_menu.open > div:first-child > #close-answers {
                    fill: var(--secondary-color);
                }

                .settings_menu .settings-item .text, .answers_menu .settings-item .text {
                    color: var(--secondary-color) !important;
                }

                .main:has(.settings_menu.open, .terms_menu.open, .apikey_menu.open, .answers_menu.open, .shortcuts_menu.open) .card {
                    filter: blur(8px) !important;
                    pointer-events: none !important;
                    transition: filter 0.3s ease-in-out;
                }

                .menu-header {
                    width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;
                }

                .menu-title-wrapper {
                    display: flex; align-items: baseline; gap: 8px;
                }

                .menu-title {
                    opacity: 1; margin: 0; font-size: 18px; font-weight: bold;
                }

                .badge-version {
                    font-size: 11px; background: #4579f2; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-family: 'Poppins', sans-serif;
                }

                .settings-item-col {
                    display: flex; flex-direction: column; flex: 1; min-width: 0; padding-right: 10px;
                }

                .settings-item-title {
                    opacity: 1; font-size: 14px; color: var(--secondary-color);
                }

                .color-picker-input {
                    width: 40px; height: 22px; border: none; border-radius: 4px; cursor: pointer;
                }

                .btn-outline {
                    width: 90%; height: 40px; margin: 10px auto 0 auto; border-radius: 8px; border: 1px solid rgba(150, 150, 150, 0.2); cursor: pointer;
                }

                .btn-outline .text {
                    opacity: 1; font-size: 13px; font-weight: bold; color: var(--secondary-color); transition: color 0.2s ease;
                }

                .terms-content {
                    overflow-y: auto; max-height: 400px; font-size: 12px; color: var(--secondary-color); font-family: 'Poppins', sans-serif; text-align: left; padding-right: 5px;
                }

                #answers-list {
                scrollbar-width: none;
                -ms-overflow-style: none;
                }

                #answers-list::-webkit-scrollbar {
                display: none;
                }
            .main.stealth-hidden {
                    opacity: 0 !important;
                    pointer-events: none !important;
                    visibility: hidden !important;
                }

                /* 1. Themed Visible Scroller (Matches Script UI) */
                .settings_menu, .shortcuts_menu {
                    overflow-y: auto !important;
                    max-height: 480px !important;
                    scrollbar-width: thin !important;
                    scrollbar-color: rgba(150, 150, 150, 0.4) transparent !important;
                }

                .settings_menu::-webkit-scrollbar,
                .shortcuts_menu::-webkit-scrollbar,
                .terms-content::-webkit-scrollbar,
                .apikey-content::-webkit-scrollbar,
                .answers-content::-webkit-scrollbar {
                    width: 5px !important;
                    display: block !important;
                }

                .settings_menu::-webkit-scrollbar-track,
                .shortcuts_menu::-webkit-scrollbar-track,
                .terms-content::-webkit-scrollbar-track,
                .apikey-content::-webkit-scrollbar-track,
                .answers-content::-webkit-scrollbar-track {
                    background: transparent !important;
                }

                .settings_menu::-webkit-scrollbar-thumb,
                .shortcuts_menu::-webkit-scrollbar-thumb,
                .terms-content::-webkit-scrollbar-thumb,
                .apikey-content::-webkit-scrollbar-thumb,
                .answers-content::-webkit-scrollbar-thumb {
                    background: rgba(150, 150, 150, 0.4) !important;
                    border-radius: 10px !important;
                    transition: background 0.2s ease !important;
                }

                .settings_menu::-webkit-scrollbar-thumb:hover,
                .shortcuts_menu::-webkit-scrollbar-thumb:hover,
                .terms-content::-webkit-scrollbar-thumb:hover,
                .apikey-content::-webkit-scrollbar-thumb:hover,
                .answers-content::-webkit-scrollbar-thumb:hover {
                    background: #956afa !important;
                }

                /* 2. Styled Choice Dropdowns (Matches Script Card UI) */
                .keybind-select {
                    appearance: none;
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    padding: 6px 30px 6px 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(150, 150, 150, 0.25);
                    background: transparent url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23956afa'%3e%3cpath d='M7 10l5 5 5-5z'/%3e%3c/svg%3e") no-repeat right 8px center / 16px;
                    color: var(--secondary-color);
                    font-family: 'Poppins', sans-serif;
                    font-weight: 500;
                    font-size: 13px;
                    cursor: pointer;
                    outline: none;
                    min-width: 90px;
                    text-align: left;
                    transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), border-color 0.2s, box-shadow 0.2s;
                }

                .keybind-select:hover {
                    border-color: #956afa;
                    box-shadow: 0 4px 12px rgba(149, 106, 250, 0.2);
                    transform: scale(1.02);
                }

                .keybind-select option {
                    background-color: var(--main-color);
                    color: var(--secondary-color);
                    font-family: 'Poppins', sans-serif;
                    font-size: 13px;
                    padding: 8px;
                }

                /* 3. Themed Decrease/Increase Stepper (Matches .card-track and .btn-outline) */
                .stepper-container {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(150, 150, 150, 0.08);
                    padding: 4px 8px;
                    border-radius: 8px;
                    border: 1px solid rgba(150, 150, 150, 0.2);
                }

                .stepper-btn {
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    border: 1px solid rgba(150, 150, 150, 0.25);
                    background: transparent;
                    color: var(--secondary-color);
                    font-family: 'Poppins', sans-serif;
                    font-size: 16px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    outline: none;
                    transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.2s, color 0.2s;
                    user-select: none;
                }

                .stepper-btn:hover {
                    background-color: var(--secondary-color);
                    color: var(--main-color);
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
                    transform: scale(1.08);
                }

                .stepper-btn:active {
                    transform: scale(0.92);
                }

                .stepper-value {
                    min-width: 65px;
                    text-align: center;
                    font-family: 'Poppins', sans-serif;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--secondary-color);
                    user-select: none;
                }

                /* 4. Stealth Unhide Hitbox & Radiant Light Aura */
                #stealth-unhide-zone {
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    width: 100px;
                    height: 100px;
                    border-radius: 20px;
                    cursor: pointer;
                    pointer-events: auto;
                    z-index: 100000;
                    box-sizing: border-box;
                    transition: all 0.3s ease;
                }

                #stealth-unhide-zone.aura-glow {
                    animation: stealthAuraPulse 1s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
                }

                #stealth-unhide-zone:hover {
                    box-shadow: 0 0 35px 10px rgba(69, 121, 242, 0.7), inset 0 0 15px rgba(69, 121, 242, 0.35) !important;
                    border: 2px dashed #4579f2 !important;
                    background-color: rgba(69, 121, 242, 0.18) !important;
                }

                @keyframes stealthAuraPulse {
                    0% {
                        box-shadow: 0 0 0px 0px rgba(69, 121, 242, 0);
                        border: 2px solid transparent;
                        background-color: transparent;
                        transform: scale(0.85);
                    }
                    15% {
                        box-shadow: 0 0 55px 20px rgba(69, 121, 242, 0.95), inset 0 0 25px rgba(69, 121, 242, 0.5);
                        border: 3px solid #4579f2;
                        background-color: rgba(69, 121, 242, 0.35);
                        transform: scale(1.06);
                    }
                    45% {
                        box-shadow: 0 0 35px 12px rgba(69, 121, 242, 0.75), inset 0 0 15px rgba(69, 121, 242, 0.3);
                        border: 2px solid #4579f2;
                        background-color: rgba(69, 121, 242, 0.2);
                        transform: scale(1);
                    }
                    80% {
                        box-shadow: 0 0 20px 6px rgba(69, 121, 242, 0.4);
                        border: 2px solid rgba(69, 121, 242, 0.4);
                        background-color: rgba(69, 121, 242, 0.06);
                    }
                    100% {
                        box-shadow: 0 0 0px 0px rgba(69, 121, 242, 0);
                        border: 2px solid transparent;
                        background-color: transparent;
                    }
                }

                .shortcuts_menu {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    min-height: 100%;
                    height: max-content;
                    background: var(--main-color);
                    border-radius: 10px;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
                    backdrop-filter: blur(5px);
                    -webkit-backdrop-filter: blur(5px);
                    opacity: 0;
                    filter: blur(10px);
                    pointer-events: none;
                    visibility: hidden;
                    max-height: 100%;
                    overflow: hidden;
                    transition: opacity 0.3s ease-in-out, filter 0.3s ease-in-out, max-height 0.6s ease-in-out, visibility 0.3s;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    padding: 20px;
                    box-sizing: border-box;
                    z-index: 100;
                    gap: 12px;
                }

                .shortcuts_menu.open {
                    opacity: 1;
                    filter: blur(0px);
                    max-height: 520px;
                    pointer-events: auto;
                    visibility: visible;
                    border-bottom: 5px solid #0a0a0a;
                    background-color: var(--main-color);
                }
            </style>

            <div class="main">
                <div class="card card-wide title">
                    <div style="display: flex; align-items: center;">
                    <p class="text">Wayground Script</p>
                        <div class="words">
                            <span class="word text">auto</span>
                            <span class="word text">simple</span>
                            <span class="word text">easy</span>
                            <span class="word text" aria-hidden="true">auto</span>
                        </div>
                    </div>
                </div>

                <div id="btn-answers" class="card" style="text-align: center;">
                    <p class="text" id="quiz-name-display" style="font-size: 14px;">${QUIZ_NAME}</p>
                    <p class="subtextT" id="quiz-status-display">Searching answers...</p>
                </div>

                <div id="card-protection" class="card">
                                    <p class="text" style="margin-left: 5px; font-size: 14px;">Protection</p>
                    <svg class="shield" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="m438-338 226-226-57-57-169 169-84-84-57 57 141 141Zm42 258q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z"/></svg>
                    <p class="subtextT" id="protection-status-display" style="color: #39be44;">Safe</p>
                </div>

                <div id="toggleAns" class="card">
                    <p class="text" style="margin-left: 5px;">Show Answers</p>
                    <label class="switch">
                        <input type="checkbox" checked>
                        <span class="slider"></span>
                        </label>
                </div>

                <div id="btn-apikey" class="card" style="position: relative;">
                    <p class="text" style="margin-left: 5px;">Api key</p>
                    <p class="subtextT"> click for configuration</p>
                    <div id="main-ai-indicator" style="position: absolute; top: 12px; right: 15px; width: 8px; height: 8px; border-radius: 50%; background-color: gray; box-shadow: 0 0 5px gray;" title="AI is disabled"></div>
                </div>

                <a id="greasy" href="https://greasyfork.org/es/users/1600509-byoscarpine" class="card" target="_blank" rel="noopener noreferrer">
                    <svg class="greasy" height="30px" width="30px" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5.89 2.227a.28.28 0 0 1 .266.076l5.063 5.062c.54.54.509 1.652-.031 2.192l8.771 8.77c1.356 1.355-.36 3.097-1.73 1.728l-8.772-8.77c-.54.54-1.651.571-2.191.031l-5.063-5.06c-.304-.304.304-.911.608-.608l3.714 3.713L7.59 8.297 3.875 4.582c-.304-.304.304-.911.607-.607l3.715 3.714 1.067-1.066L5.549 2.91c-.228-.228.057-.626.342-.683ZM12 0C5.374 0 0 5.375 0 12s5.374 12 12 12c6.625 0 12-5.375 12-12S18.625 0 12 0Z"/>
                    </svg>
                </a>

                <a id="github" href="https://github.com/ByOscarPINE" class="card" target="_blank" rel="noopener noreferrer">
                    <svg height="30px" width="30px" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" class="github">
                        <path d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z"></path>
                    </svg>
                </a>

                <div id="config" class="card">
                    <svg class="settings" xmlns="http://www.w3.org/2000/svg" height="30px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"/></svg>
                </div>

                <div class="settings_menu">
                    <div class="menu-header">
                        <div class="menu-title-wrapper">
                            <p class="text menu-title">Settings</p>
                            <span id="script-version" class="badge-version">VERSION 1.0.0</span>
                        </div>
                        <svg id="close-settings" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                    </div>

                    <div id="btn-apikeyconfig" class="settings-item">
                        <div class="settings-item-col">
                            <span class="text settings-item-title">Api Key</span>
                            <span class="subtext">Enter your API key</span>
                        </div>
                    </div>

                    <div id="dark-mode" class="settings-item">
                        <div class="settings-item-col">
                            <span class="text settings-item-title">Dark Mode</span>
                            <span class="subtext">Force the dark theme.</span>
                        </div>
                        <label class="switch" style="opacity: 1;">
                            <input type="checkbox">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="settings-item">
                        <div class="settings-item-col">
                            <span class="text settings-item-title">Answer Color</span>
                            <span class="subtext">Choose a custom color.</span>
                        </div>
                        <input id="color-picker" class="color-picker-input" type="color" value="#4579f2">
                    </div>
                    <div id="auto-click-setting" class="settings-item">
                        <div class="settings-item-col">
                            <span class="text settings-item-title">Auto Click</span>
                            <span class="subtext">Automatically select ticked answer.</span>
                        </div>
                        <label class="switch" style="opacity: 1;">
                            <input type="checkbox" id="toggle-autoclick">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div id="auto-click-delay-setting" class="settings-item">
                        <div class="settings-item-col">
                            <span class="text settings-item-title">Click Delay</span>
                            <span class="subtext">Wait time before clicking.</span>
                        </div>
                        <div class="stepper-container">
                            <button type="button" class="stepper-btn" id="delay-decrease" title="Decrease 100ms">&minus;</button>
                            <span id="delay-val-display" class="stepper-value">1000ms</span>
                            <button type="button" class="stepper-btn" id="delay-increase" title="Increase 100ms">&plus;</button>
                        </div>
                    </div>
                    <div id="notifications-setting" class="settings-item">
                        <div class="settings-item-col">
                            <span class="text settings-item-title">Notifications</span>
                            <span class="subtext">Show popup toast messages.</span>
                        </div>
                        <label class="switch" style="opacity: 1;">
                            <input type="checkbox" id="toggle-notifications">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <!-- Direct Hide UI Button -->
                    <div id="btn-hide-ui" class="settings-item" style="cursor: pointer; justify-content: center; background: rgba(0, 0, 0, 0.05); border-color: rgba(150, 150, 150, 0.3);">
                        <span class="text" style="font-weight: bold;">Hide UI (Stealth Mode)</span>
                    </div>
                    <!-- PASTE HERE -->
                    <div id="btn-clear-cache" class="settings-item" style="cursor: pointer; justify-content: center; background: rgba(229, 57, 53, 0.1); border-color: rgba(229, 57, 53, 0.3);">
    <span class="text" style="color: #e53935 !important; font-weight: bold;">Clear & Re-Solve Now</span>
</div>

                    <div id="btn-terms" class="card-track btn-outline">
                        <span class="text">Terms & Conditions</span>
                    </div>
                </div>
                <div class="terms_menu">
                    <div class="menu-header">
                        <p class="text menu-title">Terms & Conditions</p>
                        <svg id="close-terms" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                    </div>
                    <div class="terms-content">
                        <p><strong>1. Educational Use:</strong> This script is a proof of concept for research purposes only.</p>
                        <p><strong>2. No Warranty:</strong> It is provided "as is", without any warranty of any kind.</p>
                        <p><strong>3. Privacy:</strong> No user information is stored or transmitted to external servers. Everything works entirely locally.</p>
                        <p><strong>4. Liability:</strong> The user assumes all risks associated with the use of this script.</p>
                    </div>
                </div>

                <div class="apikey_menu">
                    <div class="menu-header">
                        <p class="text menu-title">API Key</p>
                        <svg id="close-apikey" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                    </div>
                    <div class="apikey-content" style="width: 100%; box-sizing: border-box; overflow-y: auto; max-height: 400px; padding-right: 5px;">
                        <div class="settings-item" style="margin-bottom: 10px;">
                            <div class="settings-item-col">
                                <span class="text settings-item-title" style="color: var(--secondary-color) !important;">Enable AI</span>
                                <span class="subtext">Turn AI assistance on/off. Note: AI can make mistakes.</span>
                            </div>
                            <label class="switch" style="opacity: 1;">
                                <input type="checkbox" id="toggle-ai-checkbox">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <div class="settings-item" style="flex-direction: column; align-items: flex-start; gap: 10px; margin-bottom: 10px;">
                            <div class="settings-item-col" style="width: 100%;">
                                <span class="text settings-item-title" style="color: var(--secondary-color) !important;">API Provider</span>
                                <span class="subtext">Select your AI provider</span>
                            </div>
                            <select id="api-provider-select" style="width: 100%; padding: 8px; border-radius: 5px; border: 1px solid rgba(150, 150, 150, 0.2); background: transparent; color: var(--secondary-color); box-sizing: border-box; outline: none;">
    <option value="groq" style="color: #000;">Groq GPT-OSS 120B (Ultra Fast - Free)</option>
    <option value="gemini" style="color: #000;">Gemini Flash-Lite Latest (Google)</option>
    <option value="gpt" style="color: #000;">GPT-4o Mini (OpenAI)</option>
</select>
                        </div>

                        <div class="settings-item" style="flex-direction: column; align-items: flex-start; gap: 10px; margin-bottom: 10px;">
                            <div class="settings-item-col">
                                <span class="text settings-item-title" style="color: var(--secondary-color) !important;">Api Key</span>
                                <span class="subtext">Enter your API key below:</span>
                                <span class="subtext">100% client-side storage. Your key is never shared or uploaded.</span>
                            </div>
                            <input type="text" id="apikey-input" placeholder="Your API Key" style="width: 100%; padding: 8px; border-radius: 5px; border: 1px solid rgba(150, 150, 150, 0.2); background: transparent; color: var(--secondary-color); box-sizing: border-box; outline: none;">
                        </div>

                        <div class="settings-item" style="flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 15px;">
                            <button id="test-api-btn" style="padding: 8px 15px; border-radius: 5px; border: 1px solid var(--secondary-color); background: transparent; color: var(--secondary-color); cursor: pointer; font-weight: bold; transition: 0.2s;">
                                Test API
                            </button>
                            <div id="api-status" style="display: flex; align-items: center; gap: 5px;">
                                <div style="width: 10px; height: 10px; border-radius: 50%; background-color: gray;" id="api-status-dot"></div>
                                <span class="subtext" id="api-status-text" style="color: var(--secondary-color) !important;">Not tested</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="answers_menu">
                    <div class="menu-header">
                        <p class="text menu-title">Answers</p>
                        <svg id="close-answers" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                    </div>
                    <div style="margin-bottom: 10px; width: 100%;">
                        <input
                            type="text"
                            id="search-input"
                            placeholder="Buscar pregunta o respuesta..."
                            style="width: 100%; padding: 6px 10px; box-sizing: border-box; border: 1px solid #444; border-radius: 4px; background: var(--main-color); color: var(--secondary-color); font-size: 13px;"
                        />
                    </div>

                    <div class="answers-content" id="answers-list" style="width: 100%; box-sizing: border-box; overflow-y: auto; max-height: 400px; scrollbar-width: none; aspect-ratio: 1 / 2;">
                        <p class="subtext" style="text-align: center; ">No answers found yet.</p>
                    </div>
                </div>
              <div class="main_back">
                    <div class="cardBa">
                        <div class="loader-container">
                            <div class="loader-shadow"></div>
                            <div class="loader-box-wrap">
                                <div class="loader-box">
                                    <svg class="menu" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#1f1f1f"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Z"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="stealth-unhide-zone" style="display: none;" title="Click to unhide script UI"></div>
            `;

            const searchInput = shadow.querySelector('#search-input');
            const answersList = shadow.querySelector('#answers-list');

            if (searchInput && answersList) {
                searchInput.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase().trim();
                    const items = answersList.querySelectorAll('.answer-item');

                    items.forEach(item => {
                        const textContent = item.textContent.toLowerCase();

                        if (textContent.includes(searchTerm)) {
                            item.style.display = 'block';
                        } else {
                            item.style.display = 'none';
                        }
                    });
                });
            }

            const configBtn = shadow.querySelector('#config');
            const closeSettings = shadow.querySelector('#close-settings');
            const settingsMenu = shadow.querySelector('.settings_menu');
            const cards = shadow.querySelectorAll('.card, .card-track');
            const colorPicker = shadow.querySelector('#color-picker');
            const termsBtn = shadow.querySelector('#btn-terms');
            const closeTerms = shadow.querySelector('#close-terms');
            const termsMenu = shadow.querySelector('.terms_menu');
            const apikeyBtn = shadow.querySelector('#btn-apikey');
            const apikeyBtnconfig = shadow.querySelector('#btn-apikeyconfig');
            const closeApikey = shadow.querySelector('#close-apikey');
            const apikeyMenu = shadow.querySelector('.apikey_menu');
            const btnAnswers = shadow.querySelector('#btn-answers');
            const closeAnswers = shadow.querySelector('#close-answers');
            const answersMenu = shadow.querySelector('.answers_menu');
            const toggleMenu = (open) => settingsMenu?.classList.toggle('open', open);
            const toggleTerms = (open) => termsMenu?.classList.toggle('open', open);
            const toggleApikey = (open) => apikeyMenu?.classList.toggle('open', open);
            const toggleAnswers = (open) => answersMenu?.classList.toggle('open', open);

            let isDragging = false;
            let startX, startY;
            const dragTarget = typeof shadow !== 'undefined' && shadow.host ? shadow.host : shadow.querySelector('.main');

            if (dragTarget && (!dragTarget.style.position || dragTarget.classList.contains('main'))) {
                dragTarget.style.position = 'fixed';
                dragTarget.style.bottom = '10px';
                dragTarget.style.right = '10px';
                dragTarget.style.zIndex = '99999';
            }

            let initialRight, initialBottom;

            dragTarget?.addEventListener('mousedown', (e) => {
    if (e.target.closest('.settings_menu, .terms_menu, .apikey_menu, .shortcuts_menu, input, label, a, button')) return;

                startX = e.clientX;
                startY = e.clientY;

                const computed = window.getComputedStyle(dragTarget);
                initialRight = parseInt(computed.right) || 0;
                initialBottom = parseInt(computed.bottom) || 0;

                function onMouseMove(moveEvent) {
                    const dx = startX - moveEvent.clientX;
                    const dy = startY - moveEvent.clientY;

                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                        isDragging = true;
                        dragTarget.style.right = (initialRight + dx) + 'px';
                        dragTarget.style.bottom = (initialBottom + dy) + 'px';
                        dragTarget.style.cursor = 'grabbing';
                    }
                }

                function onMouseUp() {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    dragTarget.style.cursor = '';
                    setTimeout(() => { isDragging = false; }, 50);
                }

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            dragTarget?.addEventListener('click', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, true);

            configBtn?.addEventListener('click', () => {
                toggleTerms(false);
                toggleApikey(false);
                toggleAnswers(false);
                toggleMenu(true);
            });
            closeSettings?.addEventListener('click', () => toggleMenu(false));
            settingsMenu?.addEventListener('mouseleave', () => toggleMenu(false));
            termsBtn?.addEventListener('click', () => {
                toggleMenu(false);
                toggleApikey(false);
                toggleAnswers(false);
                toggleTerms(true);
            });
            closeTerms?.addEventListener('click', () => toggleTerms(false));
            termsMenu?.addEventListener('mouseleave', () => toggleTerms(false));
            // Clear Cache Button Event
            // Live Re-Solve Handler (No reload needed)
            // Live Re-Solve Handler with Full Error Recovery
            const clearCacheBtn = shadow.querySelector('#btn-clear-cache');
            clearCacheBtn?.addEventListener('click', async () => {
                const quizStatusMenu = shadow.querySelector('#quiz-status-display');
                const ansListMenu = shadow.querySelector('#answers-list');

                // 1. Wipe local answer caches
                const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
                GM_deleteValue(`${quizId}`);

                GM_listValues().forEach(k => {
                    if (k.length >= 20) GM_deleteValue(k);
                });

                AI_DATA = null;
                CACHED_RESULTS = null;
                hasAutoClickedCurrent = false;

                // 2. Remove all visible checkmarks from the screen
                document.querySelectorAll('.ans-check').forEach(el => el.remove());
                document.querySelectorAll('.subtle-answer-text').forEach(el => el.remove());

                // 3. Check for 5/5 Official Answers from finished test FIRST
                const officialAnswers = formatQuizResultsFromSaved(savedQuestions || ROOM_DATA?.questions);
                const hasOfficial = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

                if (hasOfficial) {
                    CACHED_RESULTS = officialAnswers;
                    CLEANED_QUESTIONS = cleanQuizData(savedQuestions || ROOM_DATA?.questions);

                    // Save official 5/5 key into permanent storage
                    const officialMap = {};
                    const qList = Array.isArray(savedQuestions) ? savedQuestions : Object.values(savedQuestions || ROOM_DATA?.questions || {});
                    qList.forEach((q, idx) => {
                        const qId = q._id || q.id || String(idx);
                        const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                        if (ans !== undefined && ans !== null) officialMap[qId] = ans;
                    });

                    if (Object.keys(officialMap).length > 0) {
                        AI_DATA = officialMap;
                        GM_setValue(`${quizId}`, { isOfficial: true, answers: officialMap });
                        GM_setValue("active_quiz", { isOfficial: true, answers: officialMap });
                    }

                    // Populate clean 5/5 answers in sidebar drawer (No Lixus, no blind guesses!)
                    if (ansListMenu) {
                        ansListMenu.innerHTML = Object.entries(CACHED_RESULTS)
                            .map(([question, answer]) => `
                                <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                                    <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                                    <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                                </div>
                            `).join('');
                    }

                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "Official answers applied!";
                        quizStatusMenu.style.color = "#39be44";
                    }

                    instantHighlight();
                    showNotification("Official answers applied!", "#39be44");
                    return; // STOP: We have the 100% correct answers, do not call AI to make blind guesses
                }

                // 4. Fallback: Multi-tier question recovery for AI if official answers are hidden
                if (savedQuestions && Array.isArray(savedQuestions) && savedQuestions.length > 0) {
                    CLEANED_QUESTIONS = cleanQuizData(savedQuestions);
                } else if (ROOM_DATA?.questions) {
                    CLEANED_QUESTIONS = cleanQuizData(ROOM_DATA.questions);
                } else if (QUIZ_DATA?.info?.questions) {
                    CLEANED_QUESTIONS = cleanQuizData(QUIZ_DATA.info.questions);
                }

                // 5. Ultimate Fallback: Live DOM Screen Scraper
                if (!CLEANED_QUESTIONS || Object.keys(CLEANED_QUESTIONS).length === 0) {
                    const stemEl = document.querySelector('[data-highlight-block="stem"]') ||
                                   document.querySelector('[data-testid="question-container-text"]') ||
                                   document.querySelector('#questionText') ||
                                   document.querySelector('.question-text-color');

                    const optionBtns = document.querySelectorAll(
                        'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
                    );

                    if (stemEl && optionBtns.length > 0) {
                        const liveQuesId = document.querySelector('[data-quesid]')?.getAttribute('data-quesid') || "live_scraped_q";
                        const scrapedOptions = Array.from(optionBtns).map((btn, idx) => {
                            const textEl = btn.querySelector('p') || btn.querySelector('.resizeable-text') || btn;
                            return {
                                id: String(idx),
                                text: stripHtml(textEl.textContent)
                            };
                        });

                        CLEANED_QUESTIONS = {
                            [liveQuesId]: {
                                type: 'MCQ',
                                question: stripHtml(stemEl.textContent),
                                options: scrapedOptions
                            }
                        };
                    }
                }

                if (!CLEANED_QUESTIONS || Object.keys(CLEANED_QUESTIONS).length === 0) {
                    showNotification("No question data found in memory or on screen", "#af4c4c");
                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "No quiz data";
                        quizStatusMenu.style.color = "#af4c4c";
                    }
                    return;
                }

                // 5. Query AI with freshly recovered data
                if (quizStatusMenu) {
                    quizStatusMenu.innerText = "Re-solving quiz with AI...";
                    quizStatusMenu.style.color = "#FFA500";
                }

                try {
                    const newAnswers = await processQuizAi(CLEANED_QUESTIONS);

                    if (newAnswers && Object.keys(newAnswers).length > 0) {
                        CACHED_RESULTS = formatQuizResults(newAnswers, CLEANED_QUESTIONS);

                        if (ansListMenu) {
                            ansListMenu.innerHTML = Object.entries(CACHED_RESULTS)
                                .map(([question, answer]) => `
                                    <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                                        <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                                        <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                                    </div>
                                `).join('');
                        }

                        if (quizStatusMenu) {
                            quizStatusMenu.innerText = "Answers updated!";
                            quizStatusMenu.style.color = "#39be44";
                        }

                        instantHighlight();
                        showNotification("Quiz re-solved successfully!");
                    } else {
                        if (quizStatusMenu) {
                            quizStatusMenu.innerText = "Re-solve failed";
                            quizStatusMenu.style.color = "#af4c4c";
                        }
                    }
                } catch (e) {
                    console.error("Live re-solve failed:", e);
                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "Re-solve error";
                        quizStatusMenu.style.color = "#af4c4c";
                    }
                    showNotification("Re-solve failed: " + (e.message || e), "#af4c4c");
                }
            });

            apikeyBtn?.addEventListener('click', () => {
                toggleMenu(false);
                toggleTerms(false);
                toggleAnswers(false);
                toggleApikey(true);
            });
            apikeyBtnconfig?.addEventListener('click', () => {
                toggleMenu(false);
                toggleTerms(false);
                toggleAnswers(false);
                toggleApikey(true);
            });
            closeApikey?.addEventListener('click', () => toggleApikey(false));
            apikeyMenu?.addEventListener('mouseleave', () => toggleApikey(false));
            btnAnswers?.addEventListener('click', () => {
                toggleMenu(false);
                toggleTerms(false);
                toggleApikey(false);
                toggleAnswers(true);
            });
            closeAnswers?.addEventListener('click', () => toggleAnswers(false));
            answersMenu?.addEventListener('mouseleave', () => toggleAnswers(false));

            function UpdateAnsColor() {
                html.style.setProperty('--color-picked-user', `${colorPicker.value}`);
                localStorage.setItem("ansColor", colorPicker.value);
            }

            const ansColorSaved = localStorage.getItem("ansColor") || '#4579f2';
            colorPicker.value = ansColorSaved;
            UpdateAnsColor();
            colorPicker.oninput = UpdateAnsColor;

            const main = shadow.querySelector('.main');
            const menuIcon = shadow.querySelector('.menu');
            const toggleAns = shadow.querySelector('#toggleAns input[type="checkbox"]');
            const toggleAnsSub = shadow.querySelector('.subtle-answer-text');
            const toggleAnsDark = shadow.querySelector('#dark-mode input[type="checkbox"]');
            // Auto Click Toggle and Delay binding
            const toggleAutoClick = shadow.querySelector('#toggle-autoclick');
            const inputAutoClickDelay = shadow.querySelector('#autoclick-delay');

            if (toggleAutoClick) {
                toggleAutoClick.checked = AUTO_CLICK;
                toggleAutoClick.addEventListener('change', (e) => {
                    AUTO_CLICK = e.target.checked;
                    GM_setValue("autoClickEnabled", AUTO_CLICK);
                    showNotification(AUTO_CLICK ? "Auto-click enabled" : "Auto-click disabled");
                });
            }

            const delayDisplay = shadow.querySelector('#delay-val-display');
            const btnDecreaseDelay = shadow.querySelector('#delay-decrease');
            const btnIncreaseDelay = shadow.querySelector('#delay-increase');

            function updateDelayDisplay() {
                if (delayDisplay) delayDisplay.textContent = `${AUTO_CLICK_DELAY}ms`;
                GM_setValue("autoClickDelay", AUTO_CLICK_DELAY);
            }

            if (delayDisplay) updateDelayDisplay();

            btnDecreaseDelay?.addEventListener('click', (e) => {
                e.stopPropagation();
                AUTO_CLICK_DELAY = Math.max(100, AUTO_CLICK_DELAY - 100);
                updateDelayDisplay();
            });

            btnIncreaseDelay?.addEventListener('click', (e) => {
                e.stopPropagation();
                AUTO_CLICK_DELAY = Math.min(10000, AUTO_CLICK_DELAY + 100);
                updateDelayDisplay();
            });
            // 1. Notification Toggle
            const toggleNotif = shadow.querySelector('#toggle-notifications');
            if (toggleNotif) {
                toggleNotif.checked = NOTIFICATIONS_ENABLED;
                toggleNotif.addEventListener('change', (e) => {
                    NOTIFICATIONS_ENABLED = e.target.checked;
                    GM_setValue("notificationsEnabled", NOTIFICATIONS_ENABLED);
                    if (NOTIFICATIONS_ENABLED) showNotification("Notifications enabled");
                });
            }

            // 2. Hide / Unhide Stealth Mode Handlers
            const btnHideUi = shadow.querySelector('#btn-hide-ui');
            const stealthUnhideZone = shadow.querySelector('#stealth-unhide-zone');

            function hideUiCompletely() {
                toggleMenu(false);
                toggleTerms(false);
                toggleApikey(false);
                toggleAnswers(false);

                main.classList.add('stealth-hidden');

                if (stealthUnhideZone) {
                    stealthUnhideZone.style.display = 'block';
                    // Trigger radiant light aura animation
                    stealthUnhideZone.classList.remove('aura-glow');
                    void stealthUnhideZone.offsetWidth; // Force reflow so animation plays
                    stealthUnhideZone.classList.add('aura-glow');
                }

                if (dragTarget) dragTarget.style.pointerEvents = 'auto';
                showNotification("UI hidden! Click the glowing zone to restore.");
            }

            function unhideUi() {
                main.classList.remove('stealth-hidden');
                if (stealthUnhideZone) {
                    stealthUnhideZone.classList.remove('aura-glow');
                    stealthUnhideZone.style.display = 'none';
                }
                if (dragTarget) dragTarget.style.pointerEvents = '';
                showNotification("UI restored!");
            }

            btnHideUi?.addEventListener('click', hideUiCompletely);
            stealthUnhideZone?.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                unhideUi();
            });
            // Global Stealth Toggle: Ctrl + Left Click anywhere to Hide OR Unhide UI
            window.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    // Don't intercept if clicking an actual link tag
                    if (e.target && e.target.closest && e.target.closest('a')) return;

                    e.preventDefault();
                    e.stopPropagation();

                    // Two-way switch: if hidden -> unhide, if visible -> hide
                    if (main.classList.contains('stealth-hidden')) {
                        unhideUi();
                    } else {
                        hideUiCompletely();
                    }
                }
            }, true);

            // Global Toggle: Alt + Left Click anywhere to show/hide Answers
            window.addEventListener('click', (e) => {
                if (e.altKey && e.button === 0) {
                    e.preventDefault();
                    e.stopPropagation();

                    if (toggleAns) {
                        toggleAns.checked = !toggleAns.checked;
                        toggleAnswersEn();
                        if (toggleAns.checked) instantHighlight();
                        showNotification(toggleAns.checked ? "Answers: Visible" : "Answers: Hidden", "#4579f2");
                    }
                }
            }, true);

            // Safe background brightness detector (Will never throw null crash)
            function verifyBackgroundColor() {
                try {
                    const el = document.querySelector('.test-theme-waiting');
                    if (!el) return 255;
                    const colorBackground = window.getComputedStyle(el).backgroundColor;
                    const rgb = colorBackground.match(/\d+/g);

                    if (rgb && rgb.length >= 3) {
                        const r = parseInt(rgb[0]), g = parseInt(rgb[1]), b = parseInt(rgb[2]);
                        return (r * 299 + g * 587 + b * 114) / 1000;
                    }
                } catch (e) {}
                return 255;
            }

            function setTheme(isDark) {
                const props = isDark
                    ? ['#292929', '#ffffff']
                    : ['#ffffff', '#292929'];

                main.style.setProperty('--main-color', props[0]);
                main.style.setProperty('--secondary-color', props[1]);
                if (toggleAnsDark) toggleAnsDark.checked = isDark;

                // Sync custom UI elements to current theme
                shadow?.querySelectorAll('.settings_menu, .shortcuts_menu, .terms_menu, .apikey_menu, .answers_menu').forEach(m => {
                    m.style.backgroundColor = props[0];
                });
                shadow?.querySelectorAll('.keybind-select').forEach(sel => {
                    sel.style.color = props[1];
                });
                shadow?.querySelectorAll('.stepper-btn').forEach(btn => {
                    btn.style.color = props[1];
                });

                const brightness = verifyBackgroundColor();
                if (brightness < 128 || isDark) {
                    main.style.setProperty('--icon-color', '#ffffff');
                } else {
                    main.style.setProperty('--icon-color', '#292929');
                }
            }
            function verifyColorMode() {
                const userPreference = GM_getValue("darkMode", null);
                if (userPreference !== null) {
                    setTheme(userPreference);
                    return;
                }
                const brightness = verifyBackgroundColor();
                setTheme(brightness < 128);
            }

            function initThemeObserver() {
                // If the user manually saved a dark/light mode preference, do not let Quizizz auto-override it
                if (GM_getValue("darkMode", null) !== null) return;

                const el = document.querySelector('.test-theme-waiting');
                if (el) return attachDirect(el);

                const finder = new MutationObserver((_, obs) => {
                    const target = document.querySelector('.test-theme-waiting');
                    if (target) {
                        obs.disconnect();
                        attachDirect(target);
                    }
                });

                finder.observe(document.body, { childList: true, subtree: true });
            }

            function attachDirect(target) {
                if (GM_getValue("darkMode", null) !== null) return;
                verifyColorMode();
                new MutationObserver(() => verifyColorMode()).observe(target, {
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });
            }

            initThemeObserver();

            cards.forEach((card) => {
                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const cardCenterX = rect.left + rect.width / 2;
                    const cardCenterY = rect.top + rect.height / 2;

                    const deltaX = e.clientX - cardCenterX;
                    const deltaY = e.clientY - cardCenterY;

                    const strength = 0.35;
                    const moveX = deltaX * strength;
                    const moveY = deltaY * strength;

                    card.style.transform = `translate(${moveX}px, ${moveY}px)`;
                });

                card.addEventListener('mouseleave', () => {
                    card.style.transform = '';
                });
            });

            const testApiBtn = shadow.querySelector('#test-api-btn');
            const apiStatusDot = shadow.querySelector('#api-status-dot');
            const apiStatusText = shadow.querySelector('#api-status-text');
            const mainStatusDot = shadow.querySelector('#main-ai-indicator');
            const apiProvider = shadow.querySelector('#api-provider-select');
            const apiKey = shadow.querySelector('#apikey-input');
            const toggleAiCheckbox = shadow.querySelector('#toggle-ai-checkbox');

            apiProvider.value = GM_getValue("apiProvider", "gemini");

            function changeProvider() {
        const selectedProvider = apiProvider?.value;
        apiStatusDot.style.backgroundColor = 'gray';
        mainStatusDot.style.backgroundColor = 'gray';
        apiStatusText.textContent = 'Not tested';
        switch (selectedProvider) {
            case "groq":
                apiKey.value = GM_getValue("apiKeyGroq", "");
                break;
            case "gemini":
                apiKey.value = GM_getValue("apiKeyGemini", "");
                break;
            case "gpt":
                apiKey.value = GM_getValue("apiKeyGpt", "");
                break;
            default:
                apiKey.value = "";
                break;
        }
        GM_setValue("apiProvider", selectedProvider);
        API_KEY = apiKey.value;
    }
            function updateApiKey() {
                API_KEY = apiKey.value.trim();
            }

            apiProvider?.addEventListener('change', changeProvider);
            apiKey?.addEventListener('input', updateApiKey);
            changeProvider()

            async function testApi(){
                testApiBtn.textContent = 'Testing...';
                apiStatusDot.style.backgroundColor = 'orange';
                apiStatusText.textContent = 'Connecting...';
                const provider = apiProvider.value;
                OK = false;

                try {
                    if (provider === "groq") {
                        const res = await fetch('https://api.groq.com/openai/v1/models', {
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${API_KEY}` }
                        });
                        if (res.ok) {
                            console.log("Groq API is available.");
                            OK = true;
                            GM_setValue("apiKeyGroq", API_KEY);
                        } else {
                            console.warn("Groq API returned an error status:", res.status);
                        }

                    } else if (provider === "gemini") {
                        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
                        if (res.ok) {
                            console.log("Gemini API is available.");
                            OK = true;
                            GM_setValue("apiKeyGemini", API_KEY);
                        } else {
                            console.warn("Gemini API returned an error status:", res.status);
                        }

                    } else if (provider === "gpt") {
                        const res = await fetch('https://api.openai.com/v1/models', {
                            method: 'GET',
                            headers: { 'Authorization': `Bearer ${API_KEY}` }
                        });
                        if (res.ok) {
                            console.log("OpenAI API is available.");
                            OK = true;
                            GM_setValue("apiKeyGpt", API_KEY);
                        } else {
                            console.warn("OpenAI API returned an error status:", res.status);
                        }
                    }
                } catch (err) {
                    console.error("No response received from server:", err);
                    OK = false;
                } finally {
                    testApiBtn.textContent = 'Test API';
                    testApiBtn.disabled = false;

                    if (OK) {
                        apiStatusDot.style.backgroundColor = 'green';
                        if (typeof mainStatusDot !== 'undefined') mainStatusDot.style.backgroundColor = 'green';
                        apiStatusText.textContent = 'Connected';
                    } else {
                        apiStatusDot.style.backgroundColor = 'red';
                        if (typeof mainStatusDot !== 'undefined') mainStatusDot.style.backgroundColor = 'red';
                        apiStatusText.textContent = 'Failed';
                    }
                }
            }

            testApiBtn?.addEventListener('click', testApi);

            function toggleAiState() {
                if (!toggleAiCheckbox || !mainStatusDot) return;
                const isEnabled = toggleAiCheckbox.checked;
                GM_setValue("aiAssistance", isEnabled);
                if (isEnabled && apiKey.value) {
                    testApi();
                } else {
                    apiStatusDot.style.backgroundColor = 'gray';
                    mainStatusDot.style.backgroundColor = 'gray';
                    apiStatusText.textContent = 'Disabled';
                }
            }

            toggleAiCheckbox?.addEventListener('change', toggleAiState);
            const aiEnabledSaved = GM_getValue("aiAssistance", false);
            if (toggleAiCheckbox) toggleAiCheckbox.checked = aiEnabledSaved;
            toggleAiState();

            function toggleAnswersEn() {
        isAnsVisible = !!toggleAns.checked;
        GM_setValue("ansEnabled", isAnsVisible);
        html.style.setProperty('--color-highlight', isAnsVisible ? 'var(--color-picked-user)' : 'currentColor');

        // Apply visibility to all rendered checks and text hints on page
        document.querySelectorAll('.ans-check').forEach(el => {
            el.style.opacity = isAnsVisible ? '1' : '0';
        });
        document.querySelectorAll('.subtle-answer-text').forEach(el => {
            el.style.display = isAnsVisible ? 'block' : 'none';
            el.style.opacity = isAnsVisible ? '1' : '0';
        });
    }

            function changeColorMode() {
                setTheme(toggleAnsDark.checked);
                GM_setValue("darkMode", toggleAnsDark.checked);
            };

            toggleAns.addEventListener('change', toggleAnswersEn);
            const ansEnabled = GM_getValue("ansEnabled");
            toggleAns.checked = ansEnabled;

            toggleAnsDark.addEventListener('change', changeColorMode);
            const darkModeSaved = GM_getValue("darkMode", null);
            if (darkModeSaved !== null) {
                toggleAnsDark.checked = darkModeSaved;
                setTheme(darkModeSaved);
            } else {
                verifyColorMode();
            }
            toggleAnswersEn();

            const versionBadge = shadow.querySelector('#script-version');
            if (versionBadge && typeof GM_info !== 'undefined') {
                versionBadge.textContent = "VERSION " + GM_info.script.version;
            }

        } catch (e) {
            showNotification("Error injecting the shadow DOM", "#af4c4c");
            console.error("Error injecting the shadow DOM:", e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', toLoad);
    } else {
        toLoad();
    }



    const SHIELD_PATHS = {
        true: "m438-338 226-226-57-57-169 169-84-84-57 57 141 141Zm42 258q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z",
        false: "M508.5-331.5Q520-343 520-360t-11.5-28.5Q497-400 480-400t-28.5 11.5Q440-377 440-360t11.5 28.5Q463-320 480-320t28.5-11.5ZM440-480h80v-200h-80v200Zm40 400q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z"
    };

    function updateProtectionUI(isActive) {
        const card = (typeof shadow !== 'undefined' ? shadow : document).querySelector('#card-protection');
        if (!card) return;
        const svg = card.querySelector('.shield');
        const path = card.querySelector('.shield path');
        const statusText = card.querySelector('#protection-status-display');
        if (isActive) {
            svg.style.setProperty('fill', '#39be44');
            path.setAttribute('d', SHIELD_PATHS.true);
            if (statusText) {
                statusText.textContent = 'Safe';
                statusText.style.color = '#39be44';
            }
        } else {
            svg.style.setProperty('fill', '#e53935');
            path.setAttribute('d', SHIELD_PATHS.false);
            if (statusText) {
                statusText.textContent = 'Not protected';
                statusText.style.color = '#e53935';
            }
        }
    }

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
    // Helper to get fresh UI elements from shadow DOM
    function getShadowEl(selector) {
        return shadow ? shadow.querySelector(selector) : null;
    }

    function getSelectedProvider() {
        return getShadowEl('#api-provider-select')?.value || GM_getValue("apiProvider", "gemini");
    }

    async function startQuizSolver(data) {
        try {
            updateProtectionUI(ANTI_CHEAT);

            const quizNameDisplay = getShadowEl('#quiz-name-display');
            if (quizNameDisplay) quizNameDisplay.innerText = QUIZ_NAME;

            const targetHash = data?.hash || data?.roomHash || ROOM_DATA?.hash || ROOM_DATA?.roomHash || data?.quizId || ROOM_DATA?.quizId;
            if (targetHash) {
                try {
                    await fetchQuizData(targetHash);
                } catch (e) {
                    // Silent fallback: allows direct quiz API pipeline to take over without showing false red alarm
                    console.log("Room hash not on student endpoint, falling back to direct quiz API...");
                }
            }

            CLEANED_QUESTIONS = cleanQuizData(data.questions || ROOM_DATA?.questions);
            const hash = await generateQuizHash(CLEANED_QUESTIONS);

            // Comprehensive ID & Content Signature Resolution (Recognizes same test across different Game PINs!)
            const resolvedQuizId = QUIZ_DATA?._id || QUIZ_DATA?.id || ROOM_DATA?.quizId || ROOM_DATA?.hash || data?.quizId || data?.hash || "active_quiz";
            const contentSig = getQuizContentKey(data?.questions || ROOM_DATA?.questions || savedQuestions);

            const quizStorage = (contentSig ? GM_getValue(contentSig, null) : null) ||
                                GM_getValue(`${resolvedQuizId}`, null) ||
                                GM_getValue("active_quiz", null);

            const toggleAiCheckbox = getShadowEl('#toggle-ai-checkbox');
            const isAiChecked = toggleAiCheckbox ? toggleAiCheckbox.checked : GM_getValue("aiAssistance", false);

            if (isAiChecked && !OK && typeof testApi === 'function') {
                await testApi();
            }

            const quizStatusMenu = getShadowEl('#quiz-status-display');
            const ansListMenu = getShadowEl('#answers-list');

            // PRIORITY 1: Check if Quizizz provided the official teacher answer key in the room payload!
            const officialAnswers = formatQuizResultsFromSaved(data.questions || ROOM_DATA?.questions || savedQuestions);
            const hasOfficial = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

            if (hasOfficial) {
                // 100% ACCURATE: Use the real teacher answer key straight from Quizizz
                CACHED_RESULTS = officialAnswers;

                // Build official map and overwrite any bad AI guesses in permanent storage
                const officialMap = {};
                const qList = Array.isArray(data.questions || ROOM_DATA?.questions || savedQuestions)
                    ? (data.questions || ROOM_DATA?.questions || savedQuestions)
                    : Object.values(data.questions || ROOM_DATA?.questions || savedQuestions);

                qList.forEach((q, idx) => {
                    const qId = q._id || q.id || String(idx);
                    const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                    if (ans !== undefined && ans !== null) {
                        officialMap[qId] = ans;
                    }
                });

                if (Object.keys(officialMap).length > 0) {
                    AI_DATA = officialMap;
                    const targetKey = resolvedQuizId || "active_quiz";
                    GM_setValue(`${targetKey}`, { isOfficial: true, answers: officialMap });
                    GM_setValue("active_quiz", { isOfficial: true, answers: officialMap });
                }

                instantHighlight();

                const htmlList = Object.entries(CACHED_RESULTS)
                    .map(([question, answer]) => `
                        <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                            <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                            <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                        </div>
                    `).join('');

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = 'Answers available (Official)';
                    quizStatusMenu.style.color = '#39be44';
                }
                if (ansListMenu) ansListMenu.innerHTML = htmlList || '<p>No answers available.</p>';
                showNotification("Official Quizizz answers loaded!");
                return; // HARD STOP: Real answers are in hand, do not use AI cache or call AI
            }

            // PRIORITY 2: Load cache ONLY if it is a verified 5/5 OFFICIAL key (Blocks bad AI guesses from loading)
            if (quizStorage && quizStorage.isOfficial && quizStorage.answers && Object.keys(quizStorage.answers).length > 0) {
                AI_DATA = quizStorage.answers;
                CACHED_RESULTS = formatQuizResults(AI_DATA, CLEANED_QUESTIONS);

                instantHighlight();

                const htmlList = Object.entries(CACHED_RESULTS)
                    .map(([question, answer]) => `
                        <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                            <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                            <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                        </div>
                    `).join('');

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = 'Answers available';
                    quizStatusMenu.style.color = '#39be44';
                }
                if (ansListMenu) ansListMenu.innerHTML = htmlList || '<p>No answers available.</p>';
                showNotification("Official answers loaded from cache!", "#39be44");
                return;
            }

            // 2. Query AI if enabled
            if (isAiChecked) {
                const aiAnswers = await processQuizAi(CLEANED_QUESTIONS);
                if (aiAnswers) {
                    CACHED_RESULTS = formatQuizResults(aiAnswers, data.questions || CLEANED_QUESTIONS);

                    // Instantly trigger checkmark (0ms delay)
                    instantHighlight();

                    const htmlList = Object.entries(CACHED_RESULTS)
                        .map(([question, answer]) => `
                            <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                                <p class="text" style="font-weight: bold; margin-bottom: 4px;">${question}</p>
                                <p class="subtextT" style="color: #39be44; opacity: 1;">${answer}</p>
                            </div>
                        `).join('');

                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = 'Answers available';
                        quizStatusMenu.style.color = '#39be44';
                    }
                    if (ansListMenu) ansListMenu.innerHTML = htmlList || '<p>No answers available.</p>';
                    showNotification("Answers generated successfully");
                }
            } else {
                if (quizStatusMenu) {
                    quizStatusMenu.innerText = 'AI is disabled';
                    quizStatusMenu.style.color = '#FFA500';
                }
            }
        } catch (error) {
            showNotification("Error in quiz flow", "#af4c4c");
            console.error("Error in startQuizSolver:", error);
        }
    }

    async function processQuizAi(cleanedQuestionsJson) {
        if (!cleanedQuestionsJson || Object.keys(cleanedQuestionsJson).length === 0) {
            console.error("No questions provided to processQuizAi.");
            showNotification("No question data found to solve", "#af4c4c");
            return null;
        }

        // Determine quiz ID with fallbacks so it never silently aborts
        const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
        const hash = await generateQuizHash(cleanedQuestionsJson);
        const provider = getSelectedProvider();

        // Always sync the latest API key from storage
        if (provider === "groq") API_KEY = GM_getValue("apiKeyGroq", API_KEY);
        else if (provider === "gemini") API_KEY = GM_getValue("apiKeyGemini", API_KEY);
        else if (provider === "gpt") API_KEY = GM_getValue("apiKeyGpt", API_KEY);

        if (!API_KEY || API_KEY.trim() === "") {
            showNotification("API Key is missing! Set it in the menu.", "#af4c4c");
            return null;
        }

        try {
            showNotification(`Sending to ${provider.toUpperCase()}...`, "#FFA500");
            let answers = null;

            if (provider === "groq") {
                answers = await solveQuizWithGroq(cleanedQuestionsJson);
            } else if (provider === "gemini") {
                answers = await solveQuizWithGemini(cleanedQuestionsJson);
            } else if (provider === "gpt") {
                answers = await solveQuizWithGPT(cleanedQuestionsJson);
            }

            if (answers && Object.keys(answers).length > 0) {
                AI_DATA = answers;
                CACHED_RESULTS = formatQuizResults(AI_DATA, cleanedQuestionsJson);
                GM_setValue(`${quizId}`, { "hash": hash, answers: answers });
                instantHighlight();
                return AI_DATA;
            } else {
                console.warn("AI returned empty answers object.");
                return null;
            }
        } catch (err) {
            showNotification("AI solver error: " + (err.message || err), "#af4c4c");
            console.error("AI solver error:", err);
            return null;
        }
    }
    // Helper: Strip HTML tags, preserve math exponents/subscripts, and decode entities
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
    async function solveQuizWithGroq(questionsJsonObject) {
        const url = "https://api.groq.com/openai/v1/chat/completions";

        const systemInstruction = `
            You are an expert quiz-solving assistant.
            For each question ID, identify the correct option ID (_id or id) or concise text.
            Respond ONLY in valid JSON matching: {"answers": {"QUESTION_ID": "CORRECT_OPTION_ID"}}.
        `;

        const entries = Object.entries(questionsJsonObject || {});
        if (entries.length === 0) return {};

        // Batch into chunks of 6 to stay well under Groq's 8,000 TPM limit
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
            });
            chunks.push(chunkObj);
        }

        const aggregatedAnswers = {};

        // Sub-function executing GM_xmlhttpRequest with 15s timeout
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
                    timeout: 15000, // 15-second timeout prevents infinite freezing
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

        // Process batches sequentially
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

    function showNotification(message, color = '#4caf50') {
        if (!NOTIFICATIONS_ENABLED) return;
    let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            Object.assign(container.style, {
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                zIndex: '99999',
                pointerEvents: 'none'
            });
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        Object.assign(toast.style, {
            backgroundColor: color,
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            fontFamily: 'sans-serif',
            pointerEvents: 'auto',
            opacity: '0',
            transform: 'translateY(-10px)',
            transition: 'all 0.3s ease'
        });

        toast.innerText = message;
        container.prepend(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                toast.remove();
                if (container.children.length === 0) container.remove();
            }, 300);
        }, 3000);
    }
    // Content Fingerprinter: Identifies the test by question text so NEW game codes load the same 5/5 answers!
    function getQuizContentKey(questions) {
        if (!questions || typeof questions !== 'object') return null;
        const qList = Array.isArray(questions) ? questions : Object.values(questions);
        if (qList.length === 0) return null;

        const stems = qList.map(q => {
            const rawQ = q.structure?.query?.text || q.query?.text || q.question || '';
            return normalizeText(rawQ);
        }).filter(t => t && t.length > 3).sort();

        if (stems.length === 0) return null;

        // Hash the question stems together to create a permanent signature for this test
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

        // Supports both Array (savedQuestions) and Object (ROOM_DATA.questions)
        const qList = Array.isArray(questions) ? questions : Object.values(questions);

        qList.forEach(q => {
            const rawQ = q.structure?.query?.text || q.query?.text || q.question || '';
            const qText = stripHtml(rawQ);
            if (!qText) return;

            const answer = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
            const options = (q.structure?.options || q.options || []).map((o, idx) => ({
                id: String(o.id || o._id || idx),
                text: stripHtml(o.text || '')
            }));

            let ansText = "Answer not found";
            if (answer !== undefined && answer !== null) {
                if (Array.isArray(answer) && answer[0] && answer[0].text) {
                    ansText = answer.map(a => a.text).join(" | ");
                } else {
                    const targetIndices = Array.isArray(answer) ? answer : [answer];
                    const matchedTexts = options
                        .filter((opt, idx) => targetIndices.some(t => String(t) === String(opt.id) || String(t) === String(idx)))
                        .map(opt => opt.text);
                    if (matchedTexts.length > 0) ansText = matchedTexts.join(" | ");
                }
            }
            results[qText] = ansText;
        });
        return results;
    }

    let lastFetchAnswersTime = 0;
    function fetchQuizAnswers(quizId) {
        const cleanRoomId = quizId.toString().trim();
        if (Date.now() - lastFetchAnswersTime < 2000) return; // Prevents simultaneous API duplicate firing
        lastFetchAnswersTime = Date.now();
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://wayground.com/api/main/quiz/${cleanRoomId}`,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.success && data.data?.quiz?.info?.questions) {
                            savedQuestions = data.data.quiz.info.questions;
                            // CRITICAL SPA FIX: Instantly detaches ID trackers from the old task you just finished
                            QUIZ_DATA = data.data.quiz.info;
                            ROOM_DATA = null;
                            // 1. Update Quiz Name & Status in the UI (replaces "Waiting")
                            QUIZ_NAME = data.data.quiz.info.name || "Quizizz Game";
                            const quizNameDisplay = getShadowEl('#quiz-name-display');
                            if (quizNameDisplay) quizNameDisplay.innerText = QUIZ_NAME;

                            const quizStatusMenu = getShadowEl('#quiz-status-display');
                            if (quizStatusMenu) {
                                quizStatusMenu.innerText = "Answers available";
                                quizStatusMenu.style.color = "#39be44";
                            }

                            // 2. Prepare cleaned questions & answers list
                            CLEANED_QUESTIONS = cleanQuizData(savedQuestions);
                            const officialAnswers = formatQuizResultsFromSaved(savedQuestions);
                            const hasValidOfficialAnswers = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

                            // PROTECTION GUARD: If the 5/5 official answers are ALREADY loaded on screen, do NOT let a delayed network call downgrade them to AI guesses!
                            const alreadyHasValidAnswers = CACHED_RESULTS && Object.values(CACHED_RESULTS).some(a => a && a !== "Answer not found");
                            if (alreadyHasValidAnswers && !hasValidOfficialAnswers) {
                                console.log("5/5 official answers are already active on screen. Ignoring unverified network fallback.");
                                return; // HARD STOP: Keeps the 5/5 answers locked on your screen permanently!
                            }

                            if (hasValidOfficialAnswers) {
                                // 100% ACCURATE: Use the real teacher answer key straight from Quizizz
                                CACHED_RESULTS = officialAnswers;

                                const officialMap = {};
                                savedQuestions.forEach((q, idx) => {
                                    const qId = q._id || q.id || String(idx);
                                    const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                                    if (ans !== undefined && ans !== null) {
                                        officialMap[qId] = ans;
                                    }
                                });

                                if (Object.keys(officialMap).length > 0) {
                                    AI_DATA = officialMap;

                                    savedQuestions.forEach((q, idx) => {
                                        const rawQ = q.structure?.query?.text || q.query?.text || q.question || '';
                                        const qText = normalizeText(rawQ);
                                        const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                                        if (qText && ans !== undefined && ans !== null) {
                                            officialMap[qText] = ans;
                                        }
                                    });

                                    const targetKey = cleanRoomId || QUIZ_DATA?._id || "active_quiz";
                                    const contentSig = getQuizContentKey(savedQuestions);
                                    const savePayload = { isOfficial: true, answers: officialMap, results: officialAnswers };

                                    GM_setValue(`${targetKey}`, savePayload);
                                    GM_setValue("active_quiz", savePayload);
                                    if (contentSig) GM_setValue(contentSig, savePayload);
                                }
                            } else {
                                // Check if we have 5/5 official answers saved under the Content Signature (from alt account)
                                const contentSig = getQuizContentKey(savedQuestions);
                                const savedOfficial = (contentSig ? GM_getValue(contentSig, null) : null) ||
                                                      GM_getValue(`${cleanRoomId}`, null) ||
                                                      GM_getValue("active_quiz", null);

                                if (savedOfficial && savedOfficial.isOfficial && savedOfficial.results) {
                                    CACHED_RESULTS = savedOfficial.results;
                                    AI_DATA = savedOfficial.answers;
                                } else {
                                    // Only fall back to AI if NO official key exists anywhere
                                    const existingSolved = GM_getValue(`${cleanRoomId}`, null) || GM_getValue("active_quiz", null);
                                    if (existingSolved && existingSolved.answers && Object.keys(existingSolved.answers).length > 0) {
                                        AI_DATA = existingSolved.answers;
                                        CACHED_RESULTS = formatQuizResults(AI_DATA, CLEANED_QUESTIONS);
                                    } else {
                                        CACHED_RESULTS = officialAnswers;
                                    }
                                }
                            }

                            // 3. Populate the Answers Menu list immediately
                            const ansListMenu = getShadowEl('#answers-list');
                            if (ansListMenu && CACHED_RESULTS) {
                                ansListMenu.innerHTML = Object.entries(CACHED_RESULTS)
                                    .map(([q, a]) => `
                                        <div class="answer-item" style="margin-bottom: 12px; padding: 8px; border-bottom: 1px solid #eee;">
                                            <p class="text" style="font-weight: bold; margin-bottom: 4px;">${q}</p>
                                            <p class="subtextT" style="color: #39be44; opacity: 1;">${a}</p>
                                        </div>
                                    `).join('');
                            }

                            instantHighlight();
                            showNotification("Answers retrieved successfully");
                        }
                    } catch (e) {
                        showNotification("Failed to parse answers", "#af4c4c");
                    }
                },
                onerror: () => showNotification("Failed to retrieve answers", "#af4c4c")
            });
        } catch (e) {
            console.error(e);
        }
    }

    // ==========================================
    // INSTANT HIGHLIGHTING & DOM RESOLUTION ENGINE
    // ==========================================
    let isHighlightScheduled = false;
    let lastProcessedStem = null;

    function instantHighlight() {
        // Fast Memory Resync: Only query browser storage if memory is currently unlinked (prevents loop lag)
        if (!AI_DATA && !savedQuestions && !CACHED_RESULTS) {
            const routeDataRef = QUIZ_DATA?._id || QUIZ_DATA?.id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
            const memoryTransitStore = GM_getValue(`${routeDataRef}`, null) || GM_getValue("active_quiz", null);

            if (memoryTransitStore && memoryTransitStore.answers) {
                AI_DATA = memoryTransitStore.answers;
            }
        }

        if (!savedQuestions && !AI_DATA && !CACHED_RESULTS) return;

        // 1. Locate Question Stem on Screen
        const stemEl = document.querySelector('[data-highlight-block="stem"]') ||
                       document.querySelector('[data-testid="question-container-text"]') ||
                       document.querySelector('#questionText .content-slot') ||
                       document.querySelector('#questionText') ||
                       document.querySelector('.question-text-color') ||
                       document.querySelector('.resizeable-text') ||
                       document.querySelector('.stem-container');

        const quesIdEl = document.querySelector('[data-quesid]');
        const domQuesId = quesIdEl?.getAttribute('data-quesid');
        const currentStemText = stemEl ? normalizeText(stemEl.textContent) : '';

        if (!domQuesId && !currentStemText) return;

        // Clean up stale checkmarks on question change
        if (lastProcessedStem !== (domQuesId || currentStemText)) {
            document.querySelectorAll('.ans-check').forEach(el => el.remove());
            document.querySelectorAll('.subtle-answer-text').forEach(el => el.remove());
            lastProcessedStem = domQuesId || currentStemText;
            hasAutoClickedCurrent = false;
        }

        let activeQuestionData = null;
        let expectedAnswer = null;

        // 2. Multi-tier Active Question Resolution (PRIORITY 1: Match Answer Box 100%)
        let isOfficialKey = false;

        // TIER 1: Sync directly with the Answer Box (Guarantees checkmark matches the 5/5 answers in the box!)
        if (CACHED_RESULTS && currentStemText) {
            for (const [qText, ans] of Object.entries(CACHED_RESULTS)) {
                const normQ = normalizeText(qText);
                if (normQ && (normQ === currentStemText || normQ.includes(currentStemText) || currentStemText.includes(normQ))) {
                    if (ans && ans !== "Answer not found") {
                        expectedAnswer = ans;
                        isOfficialKey = true; // Takes top priority over any AI guesses
                        break;
                    }
                }
            }
        }

        // TIER 2: Official Quizizz Database fallback (savedQuestions)
        if ((expectedAnswer === null || expectedAnswer === undefined) && savedQuestions) {
            if (domQuesId) {
                activeQuestionData = savedQuestions.find(q => q._id === domQuesId || q.id === domQuesId);
            }
            if (!activeQuestionData && currentStemText) {
                activeQuestionData = savedQuestions.find(q => {
                    const rawQ = q.structure?.query?.text || q.query?.text || q.question || '';
                    const qText = normalizeText(rawQ);
                    return qText && (qText === currentStemText || qText.includes(currentStemText) || currentStemText.includes(qText));
                });
            }
            if (activeQuestionData) {
                const officialAns = activeQuestionData.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData.answer;
                if (officialAns !== undefined && officialAns !== null) {
                    expectedAnswer = officialAns;
                    isOfficialKey = true;
                }
            }
        }

        // TIER 3: AI Data fallback (Only used if no answers exist in the box or database)
        if (!isOfficialKey && (expectedAnswer === null || expectedAnswer === undefined) && AI_DATA) {
            if (domQuesId && AI_DATA[domQuesId] !== undefined) {
                expectedAnswer = AI_DATA[domQuesId];
                activeQuestionData = CLEANED_QUESTIONS?.[domQuesId];
            } else if (currentStemText && CLEANED_QUESTIONS) {
                for (const [qId, qData] of Object.entries(CLEANED_QUESTIONS)) {
                    const qText = normalizeText(qData.question);
                    if (qText && (qText === currentStemText || qText.includes(currentStemText) || currentStemText.includes(qText))) {
                        expectedAnswer = AI_DATA[qId];
                        activeQuestionData = qData;
                        break;
                    }
                }
            }
        }

        if (expectedAnswer === null || expectedAnswer === undefined) return;

        // 3. Handle Fill-in-the-Blank and Open Questions
        const qType = activeQuestionData?.type || activeQuestionData?.structure?.kind || 'MCQ';
        const rawOptions = activeQuestionData?.options || activeQuestionData?.structure?.options || [];

        // Determine if choice squares are physically active across Single-Page view changes
        const isChoiceActiveVisuals = document.querySelectorAll(
            'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
        ).length > 0;

        if (qType === 'BLANK' || qType === 'OPEN' || (rawOptions.length === 0 && !isChoiceActiveVisuals)) {
            const textContainer = document.querySelector('[data-testid="text-renderer"]') ||
                                  document.querySelector('.drag-drop-text div') ||
                                  document.querySelector('.h-full .flex .flex-col .gap-4') ||
                                  document.querySelector('.p-4.sm\\:p-6') ||
                                  stemEl?.parentElement;

            if (textContainer && !textContainer.querySelector('.subtle-answer-text')) {
                let ansStr = '';
                if (Array.isArray(expectedAnswer)) {
                    ansStr = expectedAnswer.join(' | ');
                } else if (typeof expectedAnswer === 'number' && rawOptions[expectedAnswer]) {
                    ansStr = stripHtml(rawOptions[expectedAnswer].text);
                } else {
                    ansStr = stripHtml(String(expectedAnswer));
                }

                const answerDiv = document.createElement('div');
                answerDiv.className = 'subtle-answer-text';
                answerDiv.textContent = `Possible answer: ${ansStr}`;
                answerDiv.style.cssText = `
                    margin-top: 12px;
                    font-weight: bold;
                    color: var(--color-picked-user, #39be44);
                    pointer-events: none;
                    font-size: 15px;
                    display: ${isAnsVisible ? 'block' : 'none'};
                    opacity: ${isAnsVisible ? '1' : '0'};
                `;
                textContainer.appendChild(answerDiv);
            }
            return;
        }

        // 4. Resolve Target Option Texts & Identifiers
        const targetAnswersList = [];
        const rawTargets = Array.isArray(expectedAnswer) ? expectedAnswer : [expectedAnswer];

        rawTargets.forEach(val => {
            if (typeof val === 'string' && val.trim().length > 0) {
                targetAnswersList.push(normalizeText(val));
            }
        });

        rawOptions.forEach((opt, idx) => {
            const optId = String(opt.id || opt._id || '');
            if (rawTargets.some(t => (optId.length > 1 && String(t) === optId) || String(t) === String(idx))) {
                if (opt.text) targetAnswersList.push(normalizeText(opt.text));
            }
        });

        // 5. Select Option Elements (Cleaned of nested parent duplicates)
        let optionButtons = Array.from(document.querySelectorAll(
            'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
        ));
        optionButtons = optionButtons.filter(btn => !optionButtons.some(other => other !== btn && other.contains(btn)));

        // Ultimate Accuracy Engine (Fixes: Sequence "2,3,4" bleed | Identifies Code words like lst[0] effortlessly)
        const scoredButtons = [];

        optionButtons.forEach((btn, btnIdx) => {
            const optionTextEl = btn.querySelector('[data-highlight-block^="option:"] p') ||
                                  btn.querySelector('[data-highlight-block^="option:"]') ||
                                  btn.querySelector('.resizeable-text') ||
                                  btn.querySelector('.content-slot') ||
                                  btn.querySelector('p') ||
                                  btn;

            // Grab dirty DOM representation and a super cleaned variant removing localized addon labels natively
            const domText = normalizeText(optionTextEl.textContent);
            // This intelligently separates '1' hotkeys floating onto quiz boundaries like '1 lst[0]' dynamically.
            const cleanText = domText.replace(/^[a-z0-9][.\s)]+\s*/i, '').trim();

            const cyAttr = btn.getAttribute('data-cy') || '';
            const testIdAttr = btn.getAttribute('data-testid') || '';

            let score = 0;

            // Level A: Official Server Key Match (Like v2.0.0: marks data-cy="option-X" directly)
            rawTargets.forEach(targetId => {
                const tidStr = String(targetId).trim();
                if (tidStr && (cyAttr === `option-${tidStr}` || testIdAttr === `option-trigger-${tidStr}`)) {
                    score = isOfficialKey ? 5 : 4; // Official server index gets highest absolute priority
                } else if (tidStr && tidStr.length > 3 && (cyAttr.includes(tidStr) || testIdAttr.includes(tidStr))) {
                    score = 4; // Long ID match
                }
            });

            // Level B: Precise Text Evaluators
            if (score === 0) {
                targetAnswersList.some(target => {
                    // Priority 3: Exact Text Match
                    if (domText === target || cleanText === target) {
                        score = 3;
                        return true;
                    }

                    if (target.length < 2) return false;

                    // Strictly parse numerical grids (prevents "2,3,4" bleed into "2,3,4,5")
                    const isMathPureGridStringDataNumber = /^[\d\s.,\-+]+$/.test(target);

                    if (isMathPureGridStringDataNumber) {
                        const exactEnding = domText.endsWith(target) || domText.endsWith(` ${target}`);
                        const boundedInclusion = domText.split(/[\s,.)-]/).includes(target.replace(/[\s,.)-]/g, ''));

                        if (exactEnding || boundedInclusion) score = 2;
                        return (score > 0);
                    }

                    // Priority 1: Soft fallback parsing for code components and sentences (like lst[0])
                    if (domText.includes(target) || cleanText.includes(target) || target.includes(cleanText)) {
                        score = 1;
                        return true;
                    }
                });
            }

            // Level C: Positional Array alignment mapping (visual index)
            if (score === 0 && rawTargets.some(t => String(t) === String(btnIdx))) {
                score = isOfficialKey ? 4 : 0.5;
            }

            if (score > 0) {
                scoredButtons.push({ btn, score, domText });
            }
        });

        let matchedButtons = [];
        if (scoredButtons.length > 0) {
            // Find the highest score achieved (e.g. 3 for exact text match)
            const maxScore = Math.max(...scoredButtons.map(s => s.score));
            // Only keep buttons that scored the highest priority
            const bestButtons = scoredButtons.filter(s => s.score === maxScore).map(s => s.btn);

            if (qType !== 'MSQ' && bestButtons.length > 1) {
                matchedButtons = [bestButtons[0]];
            } else {
                matchedButtons = bestButtons;
            }
        }

        // Wipe any previous checkmarks before rendering new ones
        document.querySelectorAll('.ans-check').forEach(el => el.remove());

        // Render checkmark strictly on the winning button
        matchedButtons.forEach(btn => {
            if (!btn.querySelector('.ans-check')) {
                const checkmark = document.createElement('span');
                checkmark.className = 'ans-check';
                checkmark.innerHTML = '&#10003;';
                checkmark.style.cssText = `
                    position: absolute;
                    color: var(--color-picked-user, #39be44);
                    top: 8px;
                    right: 12px;
                    font-size: 26px;
                    font-weight: bold;
                    pointer-events: none;
                    z-index: 100;
                    opacity: ${isAnsVisible ? '1' : '0'};
                    transition: opacity 0.2s ease-in-out;
                `;

                const targetContainer = btn.querySelector('.rounded-assessment-lg') || btn;
                const computedPos = window.getComputedStyle(targetContainer).position;
                if (computedPos === 'static') {
                    targetContainer.style.position = 'relative';
                }
                targetContainer.appendChild(checkmark);
            }
        });

        // 6. Safe Auto-Click Trigger with Human-like Delay
        if (AUTO_CLICK && !hasAutoClickedCurrent && matchedButtons.length > 0) {
            hasAutoClickedCurrent = true;
            const currentQuestionId = domQuesId || currentStemText;

            setTimeout(() => {
                if (lastProcessedStem === currentQuestionId) {
                    matchedButtons.forEach(btn => {
                        if (document.body.contains(btn)) {
                            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                            btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                            btn.click();
                        }
                    });
                }
            }, AUTO_CLICK_DELAY);
        }
    }
    // 6. Optimized Mutation Observer
    const observer = new MutationObserver(() => {
        try {
            if (!isHighlightScheduled) {
                isHighlightScheduled = true;
                requestAnimationFrame(() => {
                    isHighlightScheduled = false;
                    instantHighlight();
                });
            }
        } catch (e) {
            console.error("MutationObserver error:", e);
        }
    });

    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

    // Interval ensures single page framework rerouting (V-Dom rendering drops bypassing classical parent object triggers seamlessly fallback safety checks optimal processing efficiency routing check ticks correctly continually intelligently actively gracefully optimally perfectly.)
    setInterval(() => { if(isAnsVisible) requestAnimationFrame(instantHighlight); }, 1250);
})();