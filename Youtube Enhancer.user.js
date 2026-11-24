// ==UserScript==
// @name         Youtube Enhancer
// @description  Youtube Enhancer enhances quiz UI with answer assistance, focus protection, and re-enables copy, paste, and text selection; powered by AI.
// @version      4.3.0
// @author       Inchan
// @license      GPLv3
// @match        *://*.wayground.com/*
// @match        *://*.quizizz.com/*
// @icon         https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/youtube/default.svg
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
    let savedQuestions = null;
    let CACHED_RESULTS = null;
    let OFFICIAL_CACHED_RESULTS = null;
    const HARDCODED_QA = {
        "Explain how your team evaluated the technical, economic, and operational feasibility of your mini capstone system. In your response, identify one technical or operational risk discovered during your analysis and describe the mitigation strategy used to address it.": "Our team evaluated the technical, economic, and operational feasibility of our mini capstone system carefully. For technical feasibility, we checked if we could build the system using available tools like standard web browsers, a database, and existing libraries. For economic feasibility, we used free and open-source tools to keep development costs very low. For operational feasibility, we made sure the system solves real user problems and is easy for everyday users to operate. One operational risk we identified was that some users might find the system difficult or confusing to navigate. To solve this, we kept the user interface simple, used clear labels and buttons, and provided step-by-step directions.",
        "How did your team transition from abstract logical design functions to concrete physical design specifications for your mini capstone? In addition, outline one key technical, financial, or operational risk identified during analysis and the mitigation strategy used to manage it.": "Our team moved from logical design to physical design by turning general system functions into concrete technical details. The logical design described what the system should do, such as user login, data searching, and path navigation. The physical design defined how it actually works, including specific screen layouts, database tables, data types, and user roles (such as regular user, staff, and admin). One technical risk we identified was system errors or outdated data when locations and records change. To manage this risk, we created an admin management module where administrators can easily edit information, update records, and post temporary notices in real time.",
        "How did you construct the Entity-Relationship Diagram (ERD) to model the data entities, attributes, and relationships of your mini capstone system? Detail the specific steps your team took to normalize the data up to Third Normal Form (3NF) to eliminate redundancy.": "We make the ERD by listing the main data of the system, such as users, places, and records. We add the attributes for each entity and connect them using relationships. To normalize the data, we remove repeating information and put related data in separate tables. We also make sure each data depends only on the primary key to avoid duplication.",
        "How did your team design the visual UI mockups for your mini capstone's main interfaces? Explain how you applied Nielsen\u2019s usability heuristics (such as error prevention or consistency) or WCAG accessibility standards (such as color contrast and keyboard navigation) to optimize the user experience.": "Our team created visual UI mockups for key screens like the home page, search screen, details view, and admin dashboard. We focused on making the layout clean, readable, and simple to use. We applied Nielsen\u2019s usability heuristics by maintaining consistency in fonts, buttons, and icons across all pages, and by using error prevention through input validation and helpful messages when a search has no results. For WCAG accessibility, we chose high-contrast colors for text readability, large clickable buttons for mobile users, and keyboard navigation support so all users can navigate the system easily.",
        "How did your team construct the Gantt chart and PERT diagram to map out your mini capstone timeline? Explain how you identified task dependencies, determined the project\u2019s critical path (CPM), and set key project milestones.": "We make the Gantt chart by listing the tasks, their duration, and the schedule of the project. We also make a PERT diagram to show which tasks must be finish first. We identify the critical path by finding the longest sequence of tasks that can delay the project. We set milestones like finishing the design, completing the features, testing, and final launch.",
        "How did your team allocate personnel, equipment, and budget to tasks to avoid workload bottlenecks during your mini capstone project? Furthermore, describe how you integrated Agile practices (such as sprint planning, daily stand-ups, or Kanban boards) alongside traditional planning tools.": "Our team assign tasks based on the skills of each member. We also prepare the equipment and budget needed for each task. To avoid too much work for one person, we divide the tasks fairly and check the progress often. We use sprint planning and daily updates, together with the Gantt chart to manage the project."
    };
    let isAnsVisible = true;
    let AUTO_CLICK = GM_getValue("autoClickEnabled", false);
    let AUTO_CLICK_DELAY = GM_getValue("autoClickDelay", 1000);
    let hasAutoClickedCurrent = false;
    let NOTIFICATIONS_ENABLED = GM_getValue("notificationsEnabled", true);
    let NOTIFICATION_COLOR = GM_getValue("notificationColor", "#39be44");
    let NOTIFICATION_FONT_SIZE = GM_getValue("notificationFontSize", 15);
    let ANSWER_FONT_SIZE = GM_getValue("answerFontSize", 14);
    let MCQ_MODE = GM_getValue("mcqMode", "cursor"); // 'cursor' | 'grayscale' | 'checkmark'
    let MCQ_CURSOR = GM_getValue("mcqCursor", "not-allowed"); // 'not-allowed' | 'help' | 'crosshair' | 'default'
    let GRAYSCALE_OPACITY = GM_getValue("grayscaleOpacity", 55); // 10 to 90 percent
    let TYPED_ANSWER_MODE = GM_getValue("typedAnswerMode", "visible"); // 'visible' | 'placeholder' | 'hover' | 'watermark' | 'autofill'

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
    let renderAnswersList = () => {};

    function toLoad() {
        try {
            const mainBody = document.body;
            let html = null;

            if (mainBody) {
                html = document.documentElement;
                const initialSavedColor = localStorage.getItem("ansColor") || '#39be44';
                html.style.setProperty('--theme-accent', initialSavedColor);
                html.style.setProperty('--color-picked-user', initialSavedColor);
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
                :host, :root {
                    /* Root Theme Variables */
                    --theme-accent:          #39be44;
                    --theme-accent-muted:    color-mix(in srgb, var(--theme-accent) 15%, transparent);
                    --theme-accent-bg:       color-mix(in srgb, var(--theme-accent) 10%, transparent);
                    --theme-accent-border:   color-mix(in srgb, var(--theme-accent) 30%, transparent);

                    --theme-danger:          #e53935;
                    --theme-danger-bg:       rgba(229, 57, 53, 0.1);
                    --theme-danger-border:   rgba(229, 57, 53, 0.3);

                    --theme-neutral-bg:      rgba(0, 0, 0, 0.05);
                    --theme-neutral-border:  rgba(150, 150, 150, 0.3);
                    --theme-input-border:    rgba(150, 150, 150, 0.2);
                    --theme-status-dot:      #808080;

                    --theme-success:         var(--theme-accent);
                    --theme-success-bg:      color-mix(in srgb, var(--theme-accent) 20%, transparent);

                    --secondary-color:       #e0e0e0;
                    --main-color:            #2a2a2e;
                    --icon-color:            #b0b0b0;

                    /* Answer overlay theme */
                    --ans-accent:            var(--theme-accent);
                    --ans-accent-muted:      var(--theme-accent-muted);
                    --ans-bg:                rgba(15, 23, 42, 0.95);
                    --ans-bg-hover:          rgba(15, 23, 42, 0.92);
                    --ans-border:            var(--theme-accent);
                    --ans-text:              #e2e8f0;
                    --ans-text-dim:          #94a3b8;
                    --ans-btn-bg:            var(--theme-accent);
                    --ans-btn-color:         #0d1117;
                    --ans-shadow:            0 4px 12px rgba(0, 0, 0, 0.4);
                    --ans-shadow-lg:         0 4px 14px rgba(0, 0, 0, 0.4);
                    --ans-divider:           rgba(255, 255, 255, 0.08);
                    --ans-watermark:         rgba(255, 255, 255, 0.18);
                    --ans-badge-bg:          #2563eb;
                    --ans-badge-color:       #ffffff;
                    --ans-badge-border:      #ffffff;
                    --ans-drop-bg:           var(--theme-accent);
                    --ans-drop-color:        #0d1117;

                    --color-picked-user:     var(--theme-accent);
                }

                :host {
                    position: fixed;
                    z-index: 99999;
                    pointer-events: none;
                }

                .btn-action-accent {
                    cursor: pointer;
                    justify-content: center;
                    background: var(--theme-accent-bg);
                    border-color: var(--theme-accent-border);
                }
                .btn-action-accent .text {
                    color: var(--theme-accent) !important;
                    font-weight: 600;
                }

                .btn-action-danger {
                    cursor: pointer;
                    justify-content: center;
                    background: var(--theme-danger-bg);
                    border-color: var(--theme-danger-border);
                }
                .btn-action-danger .text {
                    color: var(--theme-danger) !important;
                    font-weight: bold;
                }

                .btn-action-neutral {
                    cursor: pointer;
                    justify-content: center;
                    background: var(--theme-neutral-bg);
                    border-color: var(--theme-neutral-border);
                }

                .panel-badge-active {
                    background: var(--theme-success-bg);
                    color: var(--theme-success);
                }

                .api-select-styled {
                    width: 100%;
                    padding: 8px;
                    border-radius: 5px;
                    border: 1px solid var(--theme-input-border);
                    background: transparent;
                    color: var(--secondary-color);
                    box-sizing: border-box;
                    outline: none;
                }
                .api-select-styled option {
                    background: var(--main-color);
                    color: var(--secondary-color);
                }

                .api-input-styled {
                    width: 100%;
                    padding: 8px;
                    border-radius: 5px;
                    border: 1px solid var(--theme-input-border);
                    background: transparent;
                    color: var(--secondary-color);
                    box-sizing: border-box;
                    outline: none;
                }

                .api-status-indicator {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background-color: var(--theme-status-dot);
                }

                .main {
                    width: 42px;
                    height: 42px;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                    transition: opacity 0.3s ease;
                }

                .main.stealth-hidden,
                .main.stealth-hidden * {
                    opacity: 0 !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                }

                /* Tooltip */
                .tooltip {
                    position: fixed;
                    background: rgba(30, 30, 32, 0.96);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                    color: #f5f5f5;
                    font-family: 'Poppins', sans-serif;
                    font-size: 11px;
                    font-weight: 500;
                    padding: 4px 9px;
                    border-radius: 6px;
                    white-space: nowrap;
                    pointer-events: none !important;
                    opacity: 0;
                    visibility: hidden;
                    transform: scale(0.95);
                    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
                    z-index: 100001;
                }
                .tooltip.visible {
                    opacity: 1;
                    visibility: visible;
                    transform: scale(1);
                }


                /* Toolbar */
                .toolbar-pill {
                    position: absolute;
                    bottom: calc(100% + 8px);
                    left: 50%;

                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;

                    padding: 6px;

                    background: rgba(34, 34, 34, 0.95);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 26px;
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);

                    opacity: 0;
                    visibility: hidden;
                    pointer-events: none;

                    transform: translateX(-50%) translateY(8px) scale(0.95);

                    transition:
                        opacity 0.22s ease,
                        transform 0.22s ease,
                        visibility 0.22s;

                    user-select: none;
                    -webkit-user-select: none;
                    touch-action: none;
                }

                /* Closed toolbar */
                .main:not(.menu-open) .toolbar-pill,
                .main:not(.menu-open) .toolbar-pill * {
                    pointer-events: none !important;
                    visibility: hidden !important;
                }

                /* Open toolbar */
                .main.menu-open .toolbar-pill {
                    opacity: 1;
                    visibility: visible;
                    pointer-events: auto;
                    transform: translateX(-50%) translateY(0) scale(1);
                }

                /* Inverted toolbar direction when anchored near top */
                .main.open-below .toolbar-pill {
                    bottom: auto;
                    top: calc(100% + 8px);
                    transform: translateX(-50%) translateY(-8px) scale(0.95);
                }

                .main.open-below.menu-open .toolbar-pill {
                    transform: translateX(-50%) translateY(0) scale(1);
                }

                .main.menu-open .toolbar-pill * {
                    pointer-events: auto;
                }

                /* Keep visible toolbar controls clickable */
                .main.menu-open .toolbar-pill .tb-btn {
                    pointer-events: auto !important;
                }


                /* Icons and indicators should not interfere with pointer events */
                .toolbar-pill svg,
                .main.menu-open .toolbar-pill .status-dot {
                    pointer-events: none !important;
                }

                /* Toolbar buttons */
                .tb-btn {
                    width: 40px;
                    height: 40px;
                    border: none;
                    background: transparent;
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: var(--icon-color);
                    position: relative;
                    transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
                    padding: 0;
                    outline: none;
                }
                .tb-btn:hover {
                    background: rgba(255, 255, 255, 0.08);
                    color: #e0e0e0;
                }
                .tb-btn:active {
                    transform: scale(0.9);
                }
                .tb-btn.active {
                    background: var(--theme-accent-muted);
                    color: var(--theme-accent);
                }

                .tb-btn svg { pointer-events: none; }

                /* Status dots */
                .status-dot {
                    position: absolute;
                    top: 6px;
                    right: 6px;
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    background: var(--theme-accent);
                    box-shadow: 0 0 4px var(--theme-accent);
                    pointer-events: none;
                }
                .status-dot.ai-dot {
                    background: gray;
                    box-shadow: 0 0 4px gray;
                }

                /* Transparent main trigger */
                .trigger-wrap {
                    width: 42px;
                    height: 42px;

                    display: flex;
                    align-items: center;
                    justify-content: center;

                    cursor: grab;
                    pointer-events: auto !important;

                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;

                    touch-action: none;
                    user-select: none;
                    -webkit-user-select: none;
                    box-sizing: border-box;
                    padding: 0;
                    transition: transform 0.15s ease;
                }

                .trigger-wrap:hover {
                    transform: scale(1.08);
                }

                .trigger-wrap:active {
                    transform: scale(0.92);
                    cursor: grabbing;
                }

                .trigger-wrap:hover,
                .trigger-wrap:active,
                .main.menu-open .trigger-wrap {
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                }

                .main.menu-open .trigger-wrap .trigger-icon {
                    color: var(--theme-accent);
                }

                .trigger-wrap svg,
                .trigger-wrap svg * {
                    pointer-events: none !important;
                }

                .trigger-icon {
                    color: var(--icon-color);
                    transition: color 0.2s;
                }
                .trigger-wrap:hover .trigger-icon { color: #e0e0e0; }

                .trigger-wrap:hover .trigger-icon {
                    animation: shieldWobble 0.7s ease-in-out;
                }
                .trigger-wrap:hover .head-circle {
                    animation: headBounce 0.6s ease-in-out;
                }
                .trigger-wrap:hover .shoulders-path {
                    animation: shouldersBounce 0.6s ease-in-out;
                }

                @keyframes shieldWobble {
                    0% { transform: rotate(0deg) translateX(0); }
                    20% { transform: rotate(-7deg) translateX(-0.6px); }
                    50% { transform: rotate(4deg) translateX(0.25px); }
                    78% { transform: rotate(-1.5deg) translateX(-0.1px); }
                    100% { transform: rotate(0deg) translateX(0); }
                }
                @keyframes headBounce {
                    0% { transform: translateY(0); }
                    35% { transform: translateY(-1.5px); }
                    70% { transform: translateY(0.5px); }
                    100% { transform: translateY(0); }
                }
                @keyframes shouldersBounce {
                    0% { transform: translateY(0); }
                    35% { transform: translateY(0.6px); }
                    70% { transform: translateY(-0.2px); }
                    100% { transform: translateY(0); }
                }

                /* Overlay panels - positioned dynamically by JS */
                .settings_menu, .terms_menu, .apikey_menu, .answers_menu {
                    position: fixed;
                    width: 290px;
                    height: max-content;
                    max-height: 480px;
                    background: rgba(28, 28, 30, 0.96);
                    border-radius: 16px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);

                    opacity: 0;
                    transform: translateY(6px) scale(0.98);
                    pointer-events: none !important;
                    visibility: hidden;
                    transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.22s;

                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    padding: 14px;
                    box-sizing: border-box;
                    z-index: 10000;
                    gap: 10px;
                    overflow-y: auto;
                }

                .settings_menu {
                    width: 320px;
                    max-width: calc(100vw - 24px);
                }

                /* Settings Tabs */
                .settings-tabs {
                    display: flex;
                    gap: 4px;
                    width: 100%;
                    background: rgba(255, 255, 255, 0.06);
                    padding: 3px;
                    border-radius: 10px;
                    box-sizing: border-box;
                    margin-bottom: 2px;
                }
                .settings-tab-btn {
                    flex: 1;
                    padding: 6px 2px;
                    background: transparent;
                    border: none;
                    border-radius: 7px;
                    color: #999;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: 'Poppins', sans-serif;
                    text-align: center;
                    outline: none;
                }
                .settings-tab-btn:hover {
                    color: #fff;
                    background: rgba(255, 255, 255, 0.08);
                }
                .settings-tab-btn.active {
                    background: rgba(255, 255, 255, 0.16);
                    color: #fff;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
                }
                .settings-tab-pane {
                    display: none;
                    flex-direction: column;
                    gap: 8px;
                    width: 100%;
                    box-sizing: border-box;
                }
                .settings-tab-pane.active {
                    display: flex;
                }

                /* Settings Select Dropdowns */
                .settings-select {
                    appearance: none;
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    padding: 5px 24px 5px 10px;
                    border-radius: 6px;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    background: rgba(255, 255, 255, 0.08) url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23999999'%3e%3cpath d='M7 10l5 5 5-5z'/%3e%3c/svg%3e") no-repeat right 6px center / 14px;
                    color: #eee;
                    font-family: 'Poppins', sans-serif;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    outline: none;
                    transition: border-color 0.2s, background 0.2s;
                }
                .settings-select:focus {
                    border-color: var(--theme-accent);
                    background-color: rgba(255, 255, 255, 0.12);
                }
                .settings-select option {
                    background-color: #222;
                    color: #eee;
                }

                /* Stealth MCQ Modes */
                .ans-cursor-target, .ans-cursor-target * {
                    cursor: var(--stealth-cursor, not-allowed) !important;
                    pointer-events: auto !important;
                }
                .ans-grayscale-target {
                    opacity: var(--grayscale-opacity, 0.55) !important;
                    filter: grayscale(45%) contrast(85%) !important;
                    pointer-events: auto !important;
                    transition: opacity 0.2s ease, filter 0.2s ease !important;
                }
                .ans-stealth-disabled {
                    cursor: var(--stealth-cursor, not-allowed) !important;
                    opacity: var(--grayscale-opacity, 0.55) !important;
                    filter: grayscale(45%) contrast(85%) !important;
                    pointer-events: auto !important;
                }
                .ans-stealth-disabled * {
                    cursor: var(--stealth-cursor, not-allowed) !important;
                }

                .settings_menu:not(.open) *,
                .terms_menu:not(.open) *,
                .apikey_menu:not(.open) *,
                .answers_menu:not(.open) * {
                    pointer-events: none !important;
                }

                .settings_menu.open, .terms_menu.open, .apikey_menu.open, .answers_menu.open {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                    pointer-events: auto !important;
                    visibility: visible;
                }

                .settings_menu.open *, .terms_menu.open *, .apikey_menu.open *, .answers_menu.open * {
                    pointer-events: auto;
                }
                .panel-header-icon, .panel-close-btn svg, .search-icon, .answers-empty-icon {
                    pointer-events: none !important;
                }

                /* Answers menu specific layout: fixed header + fixed search, scrollable list */
                .answers_menu {
                    width: 320px;
                    max-width: calc(100vw - 24px);
                    height: 480px;
                    max-height: calc(100vh - 40px);
                    padding: 14px;
                    overflow: hidden;
                    gap: 10px;
                }

                /* Standardized Panel Header */
                .panel-header {
                    width: 100%;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    box-sizing: border-box;
                    flex-shrink: 0;
                }

                .panel-title-wrap {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .panel-header-icon {
                    color: var(--theme-accent);
                    flex-shrink: 0;
                }

                .panel-title {
                    margin: 0;
                    font-family: 'Poppins', sans-serif;
                    font-size: 15px;
                    font-weight: 600;
                    color: #f5f5f5;
                    letter-spacing: 0.2px;
                }

                .panel-badge {
                    font-size: 10px;
                    background: rgba(255, 255, 255, 0.1);
                    color: #bbb;
                    padding: 2px 7px;
                    border-radius: 10px;
                    font-weight: 600;
                    font-family: 'Poppins', sans-serif;
                }

                .panel-close-btn {
                    width: 28px;
                    height: 28px;
                    border-radius: 8px;
                    border: none;
                    background: transparent;
                    color: #999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    padding: 0;
                    outline: none;
                    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
                }

                .panel-close-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    transform: scale(1.05);
                }

                .panel-close-btn:active {
                    transform: scale(0.92);
                }

                /* Answers search bar */
                .answers-search-wrap {
                    width: 100%;
                    position: relative;
                    display: flex;
                    align-items: center;
                    flex-shrink: 0;
                }

                .answers-search-wrap .search-icon {
                    position: absolute;
                    left: 10px;
                    color: #777;
                    pointer-events: none;
                }

                .answers-search-input {
                    width: 100%;
                    padding: 8px 10px 8px 32px;
                    box-sizing: border-box;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    color: #f0f0f0;
                    font-family: 'Poppins', sans-serif;
                    font-size: 12px;
                    outline: none;
                    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
                }

                .answers-search-input::placeholder {
                    color: #777;
                }

                .answers-search-input:focus {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: rgba(57, 190, 68, 0.6);
                    box-shadow: 0 0 0 3px rgba(57, 190, 68, 0.15);
                }

                /* Answers scrollable container */
                .answers-content {
                    width: 100%;
                    flex: 1;
                    min-height: 0;
                    overflow-y: auto;
                    overflow-x: hidden;
                    box-sizing: border-box;
                    padding-right: 4px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .answers-content::-webkit-scrollbar {
                    width: 5px;
                    display: block;
                }
                .answers-content::-webkit-scrollbar-track {
                    background: transparent;
                }
                .answers-content::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 6px;
                }
                .answers-content::-webkit-scrollbar-thumb:hover {
                    background: rgba(57, 190, 68, 0.5);
                }

                /* Answer Card Item */
                .answer-item {
                    background: rgba(255, 255, 255, 0.04);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 10px;
                    padding: 10px 12px;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    cursor: pointer;
                    transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
                    user-select: none;
                }

                .answer-item:hover {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: rgba(255, 255, 255, 0.18);
                    transform: translateY(-1px);
                }

                .answer-item:active {
                    transform: translateY(0);
                }

                .answer-item.selected {
                    background: var(--theme-accent-bg);
                    border-color: var(--theme-accent);
                    box-shadow: 0 0 12px var(--theme-accent-border);
                }

                .answer-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                }

                .answer-q-tag {
                    font-size: 10px;
                    font-weight: 700;
                    color: #999;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                }

                .answer-item.selected .answer-q-tag {
                    color: var(--theme-accent);
                }

                .answer-source-tag {
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    padding: 1px 6px;
                    border-radius: 4px;
                    background: var(--theme-accent-muted);
                    color: var(--theme-accent);
                    text-transform: uppercase;
                }

                .answer-question-text {
                    font-family: 'Poppins', sans-serif;
                    font-size: 12px;
                    font-weight: 500;
                    color: #e5e5e5;
                    line-height: 1.45;
                    margin: 0;
                    word-break: break-word;
                    text-align: left;
                }

                .answer-divider {
                    width: 100%;
                    height: 1px;
                    background: rgba(255, 255, 255, 0.06);
                    margin: 2px 0;
                }

                .answer-body-row {
                    display: flex;
                    align-items: baseline;
                    gap: 8px;
                    width: 100%;
                }

                .answer-pill-label {
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    padding: 1px 5px;
                    border-radius: 4px;
                    background: rgba(255, 255, 255, 0.08);
                    color: #aaa;
                    flex-shrink: 0;
                }

                .answer-val-text {
                    font-family: 'Poppins', sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--theme-accent);
                    line-height: 1.4;
                    margin: 0;
                    word-break: break-word;
                    text-align: left;
                }

                /* Fallback for legacy answer-item markup if any */
                .answer-item > .text {
                    font-size: 12px !important;
                    font-weight: 500 !important;
                    color: #e5e5e5 !important;
                    line-height: 1.45;
                    margin: 0 0 4px 0;
                }

                .answer-item > .subtextT {
                    font-size: 13px !important;
                    font-weight: 600 !important;
                    color: var(--theme-accent) !important;
                    opacity: 1 !important;
                    margin: 0;
                }

                /* Empty states */
                .answers-empty-state, .answers-no-match {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 36px 16px;
                    text-align: center;
                    box-sizing: border-box;
                    width: 100%;
                    gap: 6px;
                }

                .answers-empty-icon {
                    color: #666;
                    margin-bottom: 4px;
                }

                .answers-empty-title {
                    font-family: 'Poppins', sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    color: #aaa;
                    margin: 0;
                }

                .answers-empty-sub {
                    font-family: 'Poppins', sans-serif;
                    font-size: 11px;
                    color: #666;
                    margin: 0;
                }

                /* Text styles */
                .text {
                    opacity: 1;
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
                    opacity: 0.6;
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

                /* Settings items */
                .settings-item {
                    border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08);
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
                    font-size: 11px; background: #555; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-family: 'Poppins', sans-serif;
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

                /* Switch */
                .switch {
                    font-size: 17px;
                    position: relative;
                    display: inline-block;
                    width: 40px;
                    height: 22px;
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
                    background-color: #555;
                    border: 1px solid #666;
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
                    background-color: var(--theme-accent);
                    border: 1px solid var(--theme-accent);
                }

                input:focus + .slider {
                    box-shadow: 0 0 1px var(--theme-accent);
                }

                input:checked + .slider:before {
                    transform: translateX(18px);
                    background-color: #fff;
                }

                /* Btn outline */
                .btn-outline {
                    width: 90%; height: 40px; margin: 10px auto 0 auto; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08); cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                }

                .btn-outline .text {
                    opacity: 1; font-size: 13px; font-weight: bold; color: var(--secondary-color); transition: color 0.2s ease;
                }

                .btn-outline:hover {
                    background-color: var(--secondary-color);
                    box-shadow: 0px 10px 20px rgba(0, 0, 0, 0.2);
                }

                .btn-outline:hover .text {
                    color: var(--main-color) !important;
                }

                .terms-content {
                    overflow-y: auto; max-height: 400px; font-size: 12px; color: var(--secondary-color); font-family: 'Poppins', sans-serif; text-align: left; padding-right: 5px;
                }

                /* Keybind select */
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

                /* Stepper */
                .stepper-container {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(150, 150, 150, 0.08);
                    padding: 4px 8px;
                    border-radius: 8px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                }

                .stepper-btn {
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    background: rgba(255, 255, 255, 0.05);
                    color: #e0e0e0;
                    font-family: 'Poppins', sans-serif;
                    font-size: 16px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    outline: none;
                    transition: transform 0.18s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.18s, border-color 0.18s, color 0.18s;
                    user-select: none;
                }

                .stepper-btn:hover {
                    background: rgba(255, 255, 255, 0.18) !important;
                    border-color: rgba(255, 255, 255, 0.35) !important;
                    color: #ffffff !important;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
                    transform: scale(1.08);
                }

                .stepper-btn:active {
                    transform: scale(0.92);
                }

                .stepper-input {
                    width: 58px;
                    height: 26px;
                    background: transparent;
                    border: 1px solid transparent;
                    border-radius: 6px;
                    color: #ffffff;
                    font-family: 'Poppins', sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    text-align: center;
                    outline: none;
                    padding: 0 2px;
                    margin: 0;
                    box-sizing: border-box;
                    transition: background 0.18s, border-color 0.18s;
                    -moz-appearance: textfield;
                }

                .stepper-input::-webkit-outer-spin-button,
                .stepper-input::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }

                .stepper-input:hover {
                    background: rgba(255, 255, 255, 0.06);
                    border-color: rgba(255, 255, 255, 0.12);
                }

                .stepper-input:focus {
                    background: rgba(255, 255, 255, 0.12);
                    border-color: var(--theme-accent);
                    box-shadow: 0 0 0 2px var(--theme-accent-border);
                }

                .stepper-value {
                    min-width: 58px;
                    text-align: center;
                    font-family: 'Poppins', sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    color: #ffffff;
                    user-select: none;
                }

                /* Stealth unhide zone */
                #stealth-unhide-zone {
                    position: fixed;
                    bottom: 10px;
                    right: 10px;
                    width: 80px;
                    height: 80px;
                    border-radius: 20px;
                    cursor: pointer;
                    pointer-events: none;
                    z-index: 100000;
                    box-sizing: border-box;
                    transition: all 0.3s ease;
                }

                #stealth-unhide-zone.aura-glow {
                    animation: stealthAuraPulse 1s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
                }

                #stealth-unhide-zone:hover {
                    box-shadow: 0 0 35px 10px color-mix(in srgb, var(--theme-accent) 70%, transparent), inset 0 0 15px color-mix(in srgb, var(--theme-accent) 35%, transparent) !important;
                    border: 2px dashed var(--theme-accent) !important;
                    background-color: color-mix(in srgb, var(--theme-accent) 18%, transparent) !important;
                }

                @keyframes stealthAuraPulse {
                    0% {
                        box-shadow: 0 0 0px 0px transparent;
                        border: 2px solid transparent;
                        background-color: transparent;
                        transform: scale(0.85);
                    }
                    15% {
                        box-shadow: 0 0 55px 20px color-mix(in srgb, var(--theme-accent) 95%, transparent), inset 0 0 25px color-mix(in srgb, var(--theme-accent) 50%, transparent);
                        border: 3px solid var(--theme-accent);
                        background-color: color-mix(in srgb, var(--theme-accent) 35%, transparent);
                        transform: scale(1.06);
                    }
                    45% {
                        box-shadow: 0 0 35px 12px color-mix(in srgb, var(--theme-accent) 75%, transparent), inset 0 0 15px color-mix(in srgb, var(--theme-accent) 30%, transparent);
                        border: 2px solid var(--theme-accent);
                        background-color: color-mix(in srgb, var(--theme-accent) 20%, transparent);
                        transform: scale(1);
                    }
                    80% {
                        box-shadow: 0 0 20px 6px color-mix(in srgb, var(--theme-accent) 40%, transparent);
                        border: 2px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
                        background-color: color-mix(in srgb, var(--theme-accent) 6%, transparent);
                    }
                    100% {
                        box-shadow: 0 0 0px 0px transparent;
                        border: 2px solid transparent;
                        background-color: transparent;
                    }
                }

                /* Scrollbar styles */
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

                /* Shortcuts menu */
                .shortcuts_menu {
                    position: fixed;
                    width: 280px;
                    height: max-content;
                    max-height: 480px;
                    background: rgba(34, 34, 34, 0.98);
                    border-radius: 14px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    opacity: 0;
                    pointer-events: none !important;
                    visibility: hidden !important;
                    transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    padding: 16px;
                    box-sizing: border-box;
                    z-index: 100;
                    gap: 12px;
                    overflow-y: auto;
                }

                .shortcuts_menu:not(.open),
                .shortcuts_menu:not(.open) * {
                    pointer-events: none !important;
                    visibility: hidden !important;
                }

                .shortcuts_menu.open {
                    opacity: 1;
                    pointer-events: auto !important;
                    visibility: visible !important;
                }

                .shortcuts_menu.open * {
                    pointer-events: auto;
                }
            </style>
            <div class="main">
                <span id="quiz-name-display" style="display:none">${QUIZ_NAME}</span>
                <span id="quiz-status-display" style="display:none">Searching answers...</span>
                <span id="protection-status-display" style="display:none">Safe</span>

                <!-- Vertical pill toolbar -->
                <div class="toolbar-pill" id="toolbar-pill" style="display: none;" inert aria-hidden="true">
                    <button class="tb-btn" id="btn-answers" data-tooltip="Answers" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-2"/><path d="M10 17H8"/><path d="M16 17h-2"/></svg>
                    </button>
                    <button class="tb-btn" id="btn-hardcoded-qa" data-tooltip="Capstone Q&amp;A" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    </button>
                    <button class="tb-btn" id="card-protection" data-tooltip="Protection">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
                        <span class="status-dot" id="protection-dot"></span>
                    </button>
                    <button class="tb-btn" id="toggleAns" data-tooltip="Show Answers">
                        <svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
                        <svg class="eye-off-icon" style="display:none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>
                    </button>
                    <button class="tb-btn" id="btn-apikey" data-tooltip="AI Config">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                        <span class="status-dot ai-dot" id="main-ai-indicator"></span>
                    </button>
                    <button class="tb-btn" id="config" data-tooltip="Settings" type="button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                </div>

                <!-- Trigger icon (separate, below pill) -->
                <div class="trigger-wrap" id="toggle-menu-btn" data-tooltip="Toggle Toolbar" role="button" aria-label="Toggle Toolbar" tabindex="0">
                    <svg class="trigger-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path class="shield-path" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
                        <path class="shoulders-path" d="M6.376 18.91a6 6 0 0 1 11.249.003"/>
                        <circle class="head-circle" cx="12" cy="11" r="4"/>
                    </svg>
                </div>

                <!-- Tooltip element -->
                <div class="tooltip" id="tooltip"></div>

                <!-- Panel overlays -->
                <div class="settings_menu" inert aria-hidden="true">
                    <div class="panel-header">
                        <div class="panel-title-wrap">
                            <span class="panel-title">Settings</span>
                            <span id="script-version" class="panel-badge">VERSION 1.0.0</span>
                        </div>
                        <button class="panel-close-btn" id="close-settings" data-tooltip="Close" type="button">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </div>

                    <!-- Tabs Navigation Bar -->
                    <div class="settings-tabs">
                        <button class="settings-tab-btn active" data-tab="general" type="button">General</button>
                        <button class="settings-tab-btn" data-tab="answers" type="button">Answers</button>
                        <button class="settings-tab-btn" data-tab="ai" type="button">AI Config</button>
                        <button class="settings-tab-btn" data-tab="about" type="button">About</button>
                    </div>

                    <!-- Tab 1: General -->
                    <div class="settings-tab-pane active" id="pane-general">
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

                        <div class="settings-item">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">Notification Color</span>
                                <span class="subtext">Choose toast alert color.</span>
                            </div>
                            <input id="notif-color-picker" class="color-picker-input" type="color" value="#39be44">
                        </div>

                        <div class="settings-item">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">Notification Font</span>
                                <span class="subtext">Resize toast text.</span>
                            </div>
                            <div class="stepper-container">
                                <button type="button" class="stepper-btn" id="notif-font-decrease" title="Smaller font">&minus;</button>
                                <input type="text" id="notif-font-input" class="stepper-input" value="15px" autocomplete="off" spellcheck="false">
                                <button type="button" class="stepper-btn" id="notif-font-increase" title="Larger font">&plus;</button>
                            </div>
                        </div>

                        <div id="btn-hide-ui" class="settings-item btn-action-neutral">
                            <span class="text" style="font-weight: bold;">Hide UI (Stealth Mode)</span>
                        </div>

                        <div id="btn-clear-cache" class="settings-item btn-action-danger">
                            <span class="text">Clear &amp; Re-Solve Now</span>
                        </div>
                    </div>

                    <!-- Tab 2: Answers -->
                    <div class="settings-tab-pane" id="pane-answers">
                        <div class="settings-item">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">MCQ Display Mode</span>
                                <span class="subtext">Cursor, Gray Scale, or Checkmark.</span>
                            </div>
                            <select id="mcq-mode-select" class="settings-select">
                                <option value="cursor">Cursor Design</option>
                                <option value="grayscale">Gray Scale</option>
                                <option value="checkmark">Checkmark (&#10003;)</option>
                            </select>
                        </div>

                        <div class="settings-item" id="mcq-cursor-setting">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">Cursor Design</span>
                                <span class="subtext">Cursor on correct option.</span>
                            </div>
                            <select id="mcq-cursor-select" class="settings-select">
                                <option value="not-allowed">Disabled (&empty;)</option>
                                <option value="help">Help (?)</option>
                                <option value="crosshair">Crosshair (+)</option>
                                <option value="default">Default Arrow</option>
                            </select>
                        </div>

                        <div class="settings-item" id="mcq-opacity-setting" style="display: none;">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">Gray Scale Opacity</span>
                                <span class="subtext">Fade level of correct card.</span>
                            </div>
                            <div class="stepper-container">
                                <button type="button" class="stepper-btn" id="opacity-decrease" title="Less opaque">&minus;</button>
                                <input type="text" id="opacity-val-input" class="stepper-input" value="55%" autocomplete="off" spellcheck="false">
                                <button type="button" class="stepper-btn" id="opacity-increase" title="More opaque">&plus;</button>
                            </div>
                        </div>

                        <div class="settings-item">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">Answer Text Color</span>
                                <span class="subtext">Subtle answer guide color.</span>
                            </div>
                            <input id="color-picker" class="color-picker-input" type="color" value="#39be44">
                        </div>

                        <div class="settings-item">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">Answer Text Size</span>
                                <span class="subtext">Resize answer text on screen.</span>
                            </div>
                            <div class="stepper-container">
                                <button type="button" class="stepper-btn" id="ans-font-decrease" title="Smaller font">&minus;</button>
                                <input type="text" id="ans-font-input" class="stepper-input" value="14px" autocomplete="off" spellcheck="false">
                                <button type="button" class="stepper-btn" id="ans-font-increase" title="Larger font">&plus;</button>
                            </div>
                        </div>

                        <div class="settings-item">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">Typed Answer Mode</span>
                                <span class="subtext">How to show answer on Type / Match / Drag.</span>
                            </div>
                            <select id="typed-answer-mode-select" class="settings-select">
                                <option value="visible">Visible Box (Insert Button)</option>
                                <option value="placeholder">Placeholder Only</option>
                                <option value="hover">Hover to Reveal</option>
                                <option value="watermark">Watermark (Ultra Subtle)</option>
                                <option value="autofill">Auto-Fill &amp; Hide</option>
                            </select>
                        </div>

                        <div id="auto-click-setting" class="settings-item">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">Auto Click</span>
                                <span class="subtext">Automatically select answer.</span>
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
                                <input type="text" id="delay-val-input" class="stepper-input" value="1000ms" autocomplete="off" spellcheck="false">
                                <button type="button" class="stepper-btn" id="delay-increase" title="Increase 100ms">&plus;</button>
                            </div>
                        </div>
                    </div>

                    <!-- Tab 3: AI Config -->
                    <div class="settings-tab-pane" id="pane-ai">
                        <div id="btn-apikeyconfig" class="settings-item btn-action-accent">
                            <span class="text">Open AI Panel &amp; Keys</span>
                        </div>
                        <div class="settings-item">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">AI Solver Status</span>
                                <span class="subtext">Active Solver Model</span>
                            </div>
                            <span class="panel-badge" id="settings-ai-model-badge">READY</span>
                        </div>
                    </div>

                    <!-- Tab 4: About -->
                    <div class="settings-tab-pane" id="pane-about">
                        <div class="settings-item">
                            <div class="settings-item-col">
                                <span class="text settings-item-title">Protection</span>
                                <span class="subtext">Anti-cheat Shield</span>
                            </div>
                            <span class="panel-badge panel-badge-active">ACTIVE</span>
                        </div>
                        <div id="btn-terms" class="card-track btn-outline" style="margin-top: 4px;">
                            <span class="text">View Terms &amp; Conditions</span>
                        </div>
                    </div>
                </div>
                <div class="terms_menu" inert aria-hidden="true">
                    <div class="panel-header">
                        <div class="panel-title-wrap">
                            <span class="panel-title">Terms &amp; Conditions</span>
                        </div>
                        <button class="panel-close-btn" id="close-terms" data-tooltip="Close" type="button">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </div>
                    <div class="terms-content">
                        <p><strong>1. Educational Use:</strong> This script is a proof of concept for research purposes only.</p>
                        <p><strong>2. No Warranty:</strong> It is provided "as is", without any warranty of any kind.</p>
                        <p><strong>3. Privacy:</strong> No user information is stored or transmitted to external servers. Everything works entirely locally.</p>
                        <p><strong>4. Liability:</strong> The user assumes all risks associated with the use of this script.</p>
                    </div>
                </div>

                <div class="apikey_menu" inert aria-hidden="true">
                    <div class="panel-header">
                        <div class="panel-title-wrap">
                            <span class="panel-title">AI Configuration</span>
                        </div>
                        <button class="panel-close-btn" id="close-apikey" data-tooltip="Close" type="button">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
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
                            <select id="api-provider-select" class="api-select-styled">
                                <option value="groq">Groq GPT-OSS 120B (Ultra Fast - Free)</option>
                                <option value="gemini">Gemini Flash-Lite Latest (Google)</option>
                                <option value="gpt">GPT-4o Mini (OpenAI)</option>
                            </select>
                        </div>

                        <div class="settings-item" style="flex-direction: column; align-items: flex-start; gap: 10px; margin-bottom: 10px;">
                            <div class="settings-item-col">
                                <span class="text settings-item-title" style="color: var(--secondary-color) !important;">Api Key</span>
                                <span class="subtext">Enter your API key below:</span>
                                <span class="subtext">100% client-side storage. Your key is never shared or uploaded.</span>
                            </div>
                            <input type="text" id="apikey-input" placeholder="Your API Key" class="api-input-styled">
                        </div>

                        <div class="settings-item" style="flex-direction: row; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 15px;">
                            <button id="test-api-btn" style="padding: 8px 15px; border-radius: 5px; border: 1px solid var(--secondary-color); background: transparent; color: var(--secondary-color); cursor: pointer; font-weight: bold; transition: 0.2s;">
                                Test API
                            </button>
                            <div id="api-status" style="display: flex; align-items: center; gap: 5px;">
                                <div class="api-status-indicator" id="api-status-dot"></div>
                                <span class="subtext" id="api-status-text" style="color: var(--secondary-color) !important;">Not tested</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="answers_menu" inert aria-hidden="true">
                    <div class="panel-header">
                        <div class="panel-title-wrap">
                            <svg class="panel-header-icon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-2"/><path d="M10 17H8"/><path d="M16 17h-2"/></svg>
                            <span class="panel-title">Answers</span>
                            <span id="answers-count-badge" class="panel-badge">0</span>
                        </div>
                        <button class="panel-close-btn" id="close-answers" data-tooltip="Close" type="button">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </div>

                    <div class="answers-search-wrap">
                        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input
                            type="text"
                            id="search-input"
                            class="answers-search-input"
                            placeholder="Search questions or answers..."
                            spellcheck="false"
                            autocomplete="off"
                        />
                    </div>

                    <div class="answers-content" id="answers-list">
                        <div class="answers-empty-state">
                            <svg class="answers-empty-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-2"/><path d="M10 17H8"/><path d="M16 17h-2"/></svg>
                            <p class="answers-empty-title">No answers yet</p>
                            <p class="answers-empty-sub">Answers will appear here once a quiz begins</p>
                        </div>
                    </div>
                </div>
            </div>
            <div id="stealth-unhide-zone" style="display: none;" title="Click to unhide script UI"></div>
            `;

            const searchInput = shadow.querySelector('#search-input');
            const answersList = shadow.querySelector('#answers-list');

            function escapeHtml(str) {
                if (typeof str !== 'string') {
                    if (typeof str === 'object' && str !== null) {
                        try { str = JSON.stringify(str); } catch (e) { str = String(str); }
                    } else {
                        str = String(str ?? '');
                    }
                }
                return str.replace(/&/g, '&amp;')
                          .replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;')
                          .replace(/"/g, '&quot;')
                          .replace(/'/g, '&#039;');
            }

            renderAnswersList = function(answersMap, source = 'OFFICIAL') {
                const listEl = shadow ? shadow.querySelector('#answers-list') : null;
                const countBadge = shadow ? shadow.querySelector('#answers-count-badge') : null;
                if (!listEl) return;

                if (!answersMap || Object.keys(answersMap).length === 0) {
                    listEl.innerHTML = `
                        <div class="answers-empty-state">
                            <svg class="answers-empty-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-2"/><path d="M10 17H8"/><path d="M16 17h-2"/></svg>
                            <p class="answers-empty-title">No answers yet</p>
                            <p class="answers-empty-sub">Answers will appear here once a quiz begins</p>
                        </div>
                    `;
                    if (countBadge) countBadge.textContent = '0';
                    return;
                }

                const entries = Object.entries(answersMap);
                if (countBadge) countBadge.textContent = String(entries.length);

                listEl.innerHTML = entries.map(([question, answer], idx) => {
                    const cleanAnswer = (typeof extractAnswerText === 'function' ? extractAnswerText(answer) : '') || answer;
                    const displayAns = (cleanAnswer && cleanAnswer !== '[object Object]') ? cleanAnswer : 'Answer not found';
                    return `
                    <div class="answer-item" data-index="${idx}">
                        <div class="answer-header-row">
                            <span class="answer-q-tag">Q${idx + 1}</span>
                            <span class="answer-source-tag">${escapeHtml(source)}</span>
                        </div>
                        <p class="answer-question-text">${escapeHtml(question)}</p>
                        <div class="answer-divider"></div>
                        <div class="answer-body-row">
                            <span class="answer-pill-label">ANS</span>
                            <p class="answer-val-text">${escapeHtml(displayAns)}</p>
                        </div>
                    </div>
                `;
                }).join('');

                listEl.querySelectorAll('.answer-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const isSel = item.classList.contains('selected');
                        listEl.querySelectorAll('.answer-item.selected').forEach(el => el.classList.remove('selected'));
                        if (!isSel) {
                            item.classList.add('selected');
                            const val = item.querySelector('.answer-val-text')?.textContent || '';
                            if (val && navigator.clipboard) {
                                navigator.clipboard.writeText(val).then(() => {
                                    showNotification("Copied answer to clipboard!");
                                }).catch(() => {});
                            }
                        }
                    });
                });

                if (searchInput && searchInput.value) {
                    searchInput.dispatchEvent(new Event('input'));
                }
            };

            if (searchInput && answersList) {
                searchInput.addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase().trim();
                    const items = answersList.querySelectorAll('.answer-item');
                    let visibleCount = 0;

                    items.forEach(item => {
                        const textContent = item.textContent.toLowerCase();
                        const matches = !searchTerm || textContent.includes(searchTerm);
                        item.style.display = matches ? 'flex' : 'none';
                        if (matches) visibleCount++;
                    });

                    let noMatchEl = answersList.querySelector('.answers-no-match');
                    if (searchTerm && visibleCount === 0 && items.length > 0) {
                        if (!noMatchEl) {
                            noMatchEl = document.createElement('div');
                            noMatchEl.className = 'answers-no-match';
                            noMatchEl.innerHTML = `
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                                <p class="answers-empty-title">No matching answers</p>
                                <p class="answers-empty-sub">Try searching with different keywords</p>
                            `;
                            answersList.appendChild(noMatchEl);
                        }
                        noMatchEl.style.display = 'flex';
                    } else if (noMatchEl) {
                        noMatchEl.style.display = 'none';
                    }

                    const countBadge = shadow.querySelector('#answers-count-badge');
                    if (countBadge && items.length > 0) {
                        countBadge.textContent = searchTerm ? `${visibleCount}/${items.length}` : `${items.length}`;
                    }
                });
            }

            const configBtn = shadow.querySelector('#config');
            const closeSettings = shadow.querySelector('#close-settings');
            const settingsMenu = shadow.querySelector('.settings_menu');
            const cards = shadow.querySelectorAll('.tb-btn');
            const colorPicker = shadow.querySelector('#color-picker');
            const termsBtn = shadow.querySelector('#btn-terms');
            const closeTerms = shadow.querySelector('#close-terms');
            const termsMenu = shadow.querySelector('.terms_menu');
            const apikeyBtn = shadow.querySelector('#btn-apikey');
            const apikeyBtnconfig = shadow.querySelector('#btn-apikeyconfig');
            const closeApikey = shadow.querySelector('#close-apikey');
            const apikeyMenu = shadow.querySelector('.apikey_menu');
            const btnAnswers = shadow.querySelector('#btn-answers');
            const btnHardcodedQa = shadow.querySelector('#btn-hardcoded-qa');
            const closeAnswers = shadow.querySelector('#close-answers');
            const answersMenu = shadow.querySelector('.answers_menu');

            function setPanelState(panelEl, open, triggerBtnEl) {
                if (!panelEl) return;
                panelEl.classList.toggle('open', open);
                panelEl.inert = !open;
                if (open) {
                    panelEl.removeAttribute('aria-hidden');
                    if (triggerBtnEl) {
                        triggerBtnEl.classList.add('active');
                        positionPanel(panelEl, triggerBtnEl);
                    }
                } else {
                    panelEl.setAttribute('aria-hidden', 'true');
                    if (triggerBtnEl) triggerBtnEl.classList.remove('active');
                    if (panelEl.contains(document.activeElement)) document.activeElement.blur();
                    if (shadow && panelEl.contains(shadow.activeElement)) shadow.activeElement.blur();
                }
            }

            const toggleMenu = (open) => setPanelState(settingsMenu, open, configBtn);
            const toggleTerms = (open) => setPanelState(termsMenu, open, configBtn);
            const toggleApikey = (open) => setPanelState(apikeyMenu, open, apikeyBtn);
            const toggleAnswers = (open, triggerEl = btnAnswers) => {
                setPanelState(answersMenu, open, triggerEl);
                if (!open) {
                    btnAnswers?.classList.remove('active');
                    btnHardcodedQa?.classList.remove('active');
                }
            };

            let isDragging = false;
            let isPointerDown = false;
            let dragStartX = 0;
            let dragStartY = 0;
            let initialToolbarX = 0;
            let initialToolbarY = 0;
            let currentX = null;
            let currentY = null;

            const dragTarget = typeof shadow !== 'undefined' && shadow.host ? shadow.host : shadow.querySelector('.main');

            if (dragTarget) {
                dragTarget.style.position = 'fixed';
                dragTarget.style.zIndex = '99999';
            }

            function updateMenuDirection() {
                if (!main) return;
                const pillH = toolbarPill ? (toolbarPill.offsetHeight || 280) : 280;
                const shouldOpenBelow = (currentY !== null && currentY < (pillH + 16));
                main.classList.toggle('open-below', shouldOpenBelow);
            }

            function clampToolbarToViewport() {
                if (!dragTarget) return;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const MARGIN = 8;
                const maxLeft = Math.max(MARGIN, vw - 42 - MARGIN);
                const maxTop = Math.max(MARGIN, vh - 42 - MARGIN);

                if (currentX === null || currentY === null) {
                    const rect = dragTarget.getBoundingClientRect();
                    currentX = rect.left || (vw - 42 - 16);
                    currentY = rect.top || (vh - 42 - 16);
                }

                currentX = Math.max(MARGIN, Math.min(currentX, maxLeft));
                currentY = Math.max(MARGIN, Math.min(currentY, maxTop));

                dragTarget.style.left = Math.round(currentX) + 'px';
                dragTarget.style.top = Math.round(currentY) + 'px';
                dragTarget.style.right = 'auto';
                dragTarget.style.bottom = 'auto';

                updateMenuDirection();
                repositionOpenPanels();
            }

            function initToolbarPosition() {
                if (!dragTarget) return;
                const savedPos = GM_getValue("toolbarPos", null);
                const w = 42;
                const h = 42;
                const vw = window.innerWidth;
                const vh = window.innerHeight;

                if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
                    currentX = savedPos.x;
                    currentY = savedPos.y;
                } else {
                    currentX = vw - w - 16;
                    currentY = vh - h - 16;
                }
                clampToolbarToViewport();
            }

            function onPointerDown(e) {
                if (isPointerDown) return;
                if (e.button !== 0 && e.pointerType === 'mouse') return;

                const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
                const rawTarget = (path.length > 0 && path[0] instanceof Element) ? path[0] : e.target;
                const targetEl = (rawTarget instanceof Element) ? rawTarget : (rawTarget?.parentElement || null);
                if (!targetEl) return;

                const interactive = targetEl.closest(
                    '.settings_menu, .terms_menu, .apikey_menu, .answers_menu, .tb-btn, input, select, textarea, label, a, button, .panel-close-btn, .stepper-btn'
                );
                if (interactive) return;

                const draggable = targetEl.closest('.toolbar-pill, .trigger-wrap');
                if (!draggable) return;

                isPointerDown = true;
                isDragging = false;
                dragStartX = e.clientX;
                dragStartY = e.clientY;

                if (typeof currentX === 'number' && typeof currentY === 'number') {
                    initialToolbarX = currentX;
                    initialToolbarY = currentY;
                } else {
                    const rect = dragTarget.getBoundingClientRect();
                    initialToolbarX = rect.left;
                    initialToolbarY = rect.top;
                }

                window.addEventListener('pointermove', onPointerMove, { passive: false });
                window.addEventListener('pointerup', onPointerUp);
                window.addEventListener('pointercancel', onPointerUp);
            }

            function onPointerMove(e) {
                if (!isPointerDown) return;

                const dx = e.clientX - dragStartX;
                const dy = e.clientY - dragStartY;

                if (!isDragging) {
                    if (Math.hypot(dx, dy) >= 4) {
                        isDragging = true;
                        document.body.style.userSelect = 'none';
                        document.body.style.webkitUserSelect = 'none';
                        dragTarget.style.cursor = 'grabbing';
                        hideTooltip();
                    } else {
                        return;
                    }
                }

                e.preventDefault();

                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const MARGIN = 8;

                let newX = initialToolbarX + dx;
                let newY = initialToolbarY + dy;

                const maxLeft = Math.max(MARGIN, vw - 42 - MARGIN);
                const maxTop = Math.max(MARGIN, vh - 42 - MARGIN);

                newX = Math.max(MARGIN, Math.min(newX, maxLeft));
                newY = Math.max(MARGIN, Math.min(newY, maxTop));

                currentX = newX;
                currentY = newY;

                dragTarget.style.left = Math.round(newX) + 'px';
                dragTarget.style.top = Math.round(newY) + 'px';
                dragTarget.style.right = 'auto';
                dragTarget.style.bottom = 'auto';

                updateMenuDirection();
                repositionOpenPanels();
            }

            function onPointerUp(e) {
                if (!isPointerDown) return;
                isPointerDown = false;

                window.removeEventListener('pointermove', onPointerMove);
                window.removeEventListener('pointerup', onPointerUp);
                window.removeEventListener('pointercancel', onPointerUp);

                document.body.style.userSelect = '';
                document.body.style.webkitUserSelect = '';
                dragTarget.style.cursor = '';

                if (isDragging) {
                    GM_setValue("toolbarPos", { x: currentX, y: currentY });

                    const swallowClick = (clickEvt) => {
                        clickEvt.preventDefault();
                        clickEvt.stopPropagation();
                        clickEvt.stopImmediatePropagation();
                        window.removeEventListener('click', swallowClick, true);
                        if (shadow) shadow.removeEventListener('click', swallowClick, true);
                    };
                    window.addEventListener('click', swallowClick, true);
                    if (shadow) shadow.addEventListener('click', swallowClick, true);

                    setTimeout(() => {
                        isDragging = false;
                    }, 100);
                }
            }

            shadow?.addEventListener('pointerdown', onPointerDown);
            if (dragTarget && dragTarget !== shadow) {
                dragTarget.addEventListener('pointerdown', onPointerDown);
            }

            const main = shadow.querySelector('.main');
            const toggleMenuBtn = shadow.querySelector('#toggle-menu-btn');
            const toolbarPill = shadow.querySelector('#toolbar-pill');
            toggleMenuBtn?.addEventListener('pointerdown', onPointerDown);
            toolbarPill?.addEventListener('pointerdown', onPointerDown);
            let idleTimer = null;
            let pillTransitionTimer = null;

            function closeAllSubmenus() {
                toggleMenu(false);
                toggleTerms(false);
                toggleApikey(false);
                toggleAnswers(false);
                configBtn?.classList.remove('active');
                apikeyBtn?.classList.remove('active');
                btnAnswers?.classList.remove('active');
                btnHardcodedQa?.classList.remove('active');
            }

            function setMainOpen(open) {
                clearTimeout(pillTransitionTimer);
                if (open) {
                    closeAllSubmenus();
                    updateMenuDirection();
                    if (toolbarPill) {
                        toolbarPill.style.display = 'flex';
                        toolbarPill.inert = false;
                        toolbarPill.removeAttribute('aria-hidden');
                        void toolbarPill.offsetHeight;
                    }
                    main.classList.add('menu-open');
                } else {
                    main.classList.remove('menu-open');
                    if (toolbarPill) {
                        toolbarPill.inert = true;
                        toolbarPill.setAttribute('aria-hidden', 'true');
                        if (toolbarPill.contains(document.activeElement)) document.activeElement.blur();
                        if (shadow && toolbarPill.contains(shadow.activeElement)) shadow.activeElement.blur();
                    }
                    closeAllSubmenus();
                    hideTooltip();
                    pillTransitionTimer = setTimeout(() => {
                        if (!main.classList.contains('menu-open') && toolbarPill) {
                            toolbarPill.style.display = 'none';
                        }
                    }, 240);
                }
                resetIdleTimer();
            }

            function resetIdleTimer() {
                main.classList.remove('idle');
                clearTimeout(idleTimer);
                const panelOpen = shadow.querySelector('.settings_menu.open, .terms_menu.open, .apikey_menu.open, .answers_menu.open');
                if (!panelOpen && main.classList.contains('menu-open')) {
                    idleTimer = setTimeout(() => main.classList.add('idle'), 3000);
                }
            }

            // Smart panel positioning with strict viewport boundaries
            function positionPanel(panelEl, triggerBtnEl) {
                if (!panelEl || !triggerBtnEl) return;
                const isAnswers = panelEl.classList.contains('answers_menu');
                const GAP = 10;
                const MARGIN = 10;
                const vw = window.innerWidth;
                const vh = window.innerHeight;

                const preferredW = isAnswers ? 320 : 290;
                const panelW = Math.min(preferredW, vw - 2 * MARGIN);
                panelEl.style.width = Math.round(panelW) + 'px';

                const triggerRect = triggerBtnEl.getBoundingClientRect();
                const preferredH = 480;
                const maxAvailableH = vh - 2 * MARGIN;

                // Vertical space: priority 1 downward, priority 2 upward
                const spaceBelow = vh - triggerRect.top - MARGIN;
                const spaceAbove = triggerRect.bottom - MARGIN;

                let useTop;
                let panelH;

                if (spaceBelow >= Math.min(preferredH, 220)) {
                    useTop = triggerRect.top;
                    panelH = Math.min(preferredH, spaceBelow);
                } else if (spaceAbove >= Math.min(preferredH, 220)) {
                    panelH = Math.min(preferredH, spaceAbove);
                    useTop = triggerRect.bottom - panelH;
                } else {
                    useTop = MARGIN;
                    panelH = maxAvailableH;
                }

                useTop = Math.max(MARGIN, Math.min(useTop, vh - MARGIN - panelH));
                panelEl.style.top = Math.round(useTop) + 'px';
                panelEl.style.maxHeight = Math.round(panelH) + 'px';

                // Horizontal: place to the left of trigger by default
                let panelLeft = triggerRect.left - panelW - GAP;
                if (panelLeft < MARGIN) {
                    const rightCandidate = triggerRect.right + GAP;
                    if (rightCandidate + panelW <= vw - MARGIN) {
                        panelLeft = rightCandidate;
                    } else {
                        panelLeft = Math.max(MARGIN, Math.min(panelLeft, vw - panelW - MARGIN));
                    }
                }
                panelLeft = Math.max(MARGIN, Math.min(panelLeft, vw - panelW - MARGIN));

                panelEl.style.left = Math.round(panelLeft) + 'px';
                panelEl.style.right = 'auto';
                panelEl.style.bottom = 'auto';
            }

            function repositionOpenPanels() {
                const activeAnswersTrigger = btnHardcodedQa?.classList.contains('active') ? btnHardcodedQa : btnAnswers;
                const panelMap = [
                    { panel: settingsMenu, trigger: configBtn },
                    { panel: termsMenu, trigger: configBtn },
                    { panel: apikeyMenu, trigger: apikeyBtn },
                    { panel: answersMenu, trigger: activeAnswersTrigger },
                ];
                panelMap.forEach(({ panel, trigger }) => {
                    if (panel && panel.classList.contains('open')) {
                        positionPanel(panel, trigger);
                    }
                });
            }

            window.addEventListener('resize', () => {
                clampToolbarToViewport();
                repositionOpenPanels();
            });

            toggleMenuBtn?.addEventListener('click', (e) => {
                if (isDragging) return;
                e.stopPropagation();
                const willOpen = !main.classList.contains('menu-open');
                setMainOpen(willOpen);
            });

            // Idle fade
            main.addEventListener('mouseenter', resetIdleTimer);
            main.addEventListener('mouseleave', () => {
                if (main.classList.contains('menu-open')) {
                    idleTimer = setTimeout(() => main.classList.add('idle'), 3000);
                }
            });

            // Tooltip logic with full hidden & drag protection
            const tooltipEl = shadow.querySelector('#tooltip');
            let tooltipTimer = null;

            function hideTooltip() {
                clearTimeout(tooltipTimer);
                if (tooltipEl) {
                    tooltipEl.classList.remove('visible');
                }
            }

            function bindTooltips() {
                shadow.querySelectorAll('[data-tooltip]').forEach(el => {
                    el.addEventListener('mouseenter', () => {
                        hideTooltip();
                        if (isDragging) return;
                        if (main.classList.contains('stealth-hidden')) return;

                        const isPillChild = el.closest('.toolbar-pill');
                        if (isPillChild && !main.classList.contains('menu-open')) return;

                        const panel = el.closest('.settings_menu, .terms_menu, .apikey_menu, .answers_menu');
                        if (panel && !panel.classList.contains('open')) return;

                        const text = el.getAttribute('data-tooltip');
                        if (!text || !tooltipEl) return;

                        tooltipTimer = setTimeout(() => {
                            if (isDragging || main.classList.contains('stealth-hidden')) return;
                            tooltipEl.textContent = text;
                            tooltipEl.classList.add('visible');

                            const rect = el.getBoundingClientRect();
                            const tw = tooltipEl.offsetWidth || 50;
                            const th = tooltipEl.offsetHeight || 22;

                            let top = rect.top + (rect.height - th) / 2;
                            let left = rect.left - tw - 8;

                            if (left < 6) {
                                left = rect.right + 8;
                            }
                            if (left + tw > window.innerWidth - 6) {
                                left = window.innerWidth - tw - 6;
                            }
                            if (top < 6) top = 6;
                            if (top + th > window.innerHeight - 6) top = window.innerHeight - th - 6;

                            tooltipEl.style.top = Math.round(top) + 'px';
                            tooltipEl.style.left = Math.round(left) + 'px';
                        }, 250);
                    });
                    el.addEventListener('mouseleave', hideTooltip);
                });
            }
            bindTooltips();

            document.addEventListener('click', (e) => {
                if (shadow.host && !shadow.host.contains(e.target)) {
                    setMainOpen(false);
                }
            });

            configBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!main.classList.contains('menu-open')) setMainOpen(true);
                const wasOpen = settingsMenu?.classList.contains('open');
                closeAllSubmenus();
                if (!wasOpen) {
                    toggleMenu(true);
                }
                resetIdleTimer();
            });
            closeSettings?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMenu(false);
                resetIdleTimer();
            });
            termsBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllSubmenus();
                toggleTerms(true);
                resetIdleTimer();
            });
            closeTerms?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTerms(false);
                resetIdleTimer();
            });
            const clearCacheBtn = shadow.querySelector('#btn-clear-cache');
            clearCacheBtn?.addEventListener('click', async () => {
                const quizStatusMenu = shadow.querySelector('#quiz-status-display');
                const ansListMenu = shadow.querySelector('#answers-list');

                const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
                GM_deleteValue(`${quizId}`);

                GM_listValues().forEach(k => {
                    if (k.length >= 20) GM_deleteValue(k);
                });

                AI_DATA = null;
                CACHED_RESULTS = null;
                hasAutoClickedCurrent = false;

                document.querySelectorAll('.ans-check').forEach(el => el.remove());
                document.querySelectorAll('.subtle-answer-text').forEach(el => el.remove());

                const officialAnswers = formatQuizResultsFromSaved(savedQuestions || ROOM_DATA?.questions);
                const hasOfficial = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

                if (hasOfficial) {
                    CACHED_RESULTS = officialAnswers;
                    CLEANED_QUESTIONS = cleanQuizData(savedQuestions || ROOM_DATA?.questions);

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

                    if (typeof renderAnswersList === 'function') {
                        renderAnswersList(CACHED_RESULTS, "OFFICIAL");
                    }

                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "Official answers applied!";
                        quizStatusMenu.style.color = "var(--theme-accent)";
                    }

                    instantHighlight();
                    showNotification("Official answers applied!");
                    return;
                }

                if (savedQuestions && Array.isArray(savedQuestions) && savedQuestions.length > 0) {
                    CLEANED_QUESTIONS = cleanQuizData(savedQuestions);
                } else if (ROOM_DATA?.questions) {
                    CLEANED_QUESTIONS = cleanQuizData(ROOM_DATA.questions);
                } else if (QUIZ_DATA?.info?.questions) {
                    CLEANED_QUESTIONS = cleanQuizData(QUIZ_DATA.info.questions);
                }

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
                    showNotification("No question data found in memory or on screen", "var(--theme-danger, #af4c4c)");
                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "No quiz data";
                        quizStatusMenu.style.color = "var(--theme-danger, #af4c4c)";
                    }
                    return;
                }

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = "Re-solving quiz with AI...";
                    quizStatusMenu.style.color = "var(--theme-warning, #FFA500)";
                }

                try {
                    const newAnswers = await processQuizAi(CLEANED_QUESTIONS);

                    if (newAnswers && Object.keys(newAnswers).length > 0) {
                        CACHED_RESULTS = formatQuizResults(newAnswers, CLEANED_QUESTIONS);

                        if (typeof renderAnswersList === 'function') {
                            renderAnswersList(CACHED_RESULTS, "AI");
                        }

                        if (quizStatusMenu) {
                            quizStatusMenu.innerText = "Answers updated!";
                            quizStatusMenu.style.color = "var(--theme-accent)";
                        }

                        instantHighlight();
                        showNotification("Quiz re-solved successfully!");
                    } else {
                        if (quizStatusMenu) {
                            quizStatusMenu.innerText = "Re-solve failed";
                            quizStatusMenu.style.color = "var(--theme-danger, #af4c4c)";
                        }
                    }
                } catch (e) {
                    console.error("Live re-solve failed:", e);
                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = "Re-solve error";
                        quizStatusMenu.style.color = "var(--theme-danger, #af4c4c)";
                    }
                    showNotification("Re-solve failed: " + (e.message || e), "var(--theme-danger, #af4c4c)");
                }
            });

            apikeyBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!main.classList.contains('menu-open')) setMainOpen(true);
                const wasOpen = apikeyMenu?.classList.contains('open');
                closeAllSubmenus();
                if (!wasOpen) {
                    toggleApikey(true);
                }
                resetIdleTimer();
            });
            apikeyBtnconfig?.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllSubmenus();
                toggleApikey(true);
                resetIdleTimer();
            });
            closeApikey?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleApikey(false);
                resetIdleTimer();
            });
            btnAnswers?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!main.classList.contains('menu-open')) setMainOpen(true);
                const wasOpen = answersMenu?.classList.contains('open');
                const wasActive = btnAnswers.classList.contains('active');
                closeAllSubmenus();
                if (!wasOpen || !wasActive) {
                    if (OFFICIAL_CACHED_RESULTS) {
                        CACHED_RESULTS = OFFICIAL_CACHED_RESULTS;
                    }
                    if (typeof renderAnswersList === 'function') {
                        renderAnswersList(CACHED_RESULTS || {}, "OFFICIAL");
                    }
                    toggleAnswers(true, btnAnswers);
                }
                resetIdleTimer();
            });
            btnHardcodedQa?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!main.classList.contains('menu-open')) setMainOpen(true);
                const wasOpen = answersMenu?.classList.contains('open');
                const wasActive = btnHardcodedQa.classList.contains('active');
                closeAllSubmenus();
                if (!wasOpen || !wasActive) {
                    if (CACHED_RESULTS && CACHED_RESULTS !== HARDCODED_QA) {
                        OFFICIAL_CACHED_RESULTS = CACHED_RESULTS;
                    }
                    CACHED_RESULTS = HARDCODED_QA;
                    if (typeof renderAnswersList === 'function') {
                        renderAnswersList(HARDCODED_QA, "CAPSTONE");
                    }
                    toggleAnswers(true, btnHardcodedQa);
                    showNotification("Capstone Q&A loaded", "var(--secondary-color, #4579f5)");
                }
                resetIdleTimer();
            });
            closeAnswers?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleAnswers(false);
                resetIdleTimer();
            });

            function UpdateAnsColor() {
                const val = colorPicker.value || '#39be44';
                [html, document.documentElement, shadow?.host].forEach(target => {
                    if (target?.style) {
                        target.style.setProperty('--theme-accent', val);
                        target.style.setProperty('--color-picked-user', val);
                    }
                });
                localStorage.setItem("ansColor", val);
            }

            const ansColorSaved = localStorage.getItem("ansColor") || '#39be44';
            colorPicker.value = ansColorSaved;
            UpdateAnsColor();
            colorPicker.oninput = UpdateAnsColor;

            const menuIcon = shadow.querySelector('.trigger-icon');
            const toggleAnsBtn = shadow.querySelector('#toggleAns');
            const eyeIcon = toggleAnsBtn?.querySelector('.eye-icon');
            const eyeOffIcon = toggleAnsBtn?.querySelector('.eye-off-icon');
            let answersVisible = true;
            const toggleAns = { get checked() { return answersVisible; }, set checked(v) { answersVisible = v; updateEyeIcon(); } };
            function updateEyeIcon() {
                if (eyeIcon) eyeIcon.style.display = answersVisible ? '' : 'none';
                if (eyeOffIcon) eyeOffIcon.style.display = answersVisible ? 'none' : '';
                if (toggleAnsBtn) toggleAnsBtn.classList.toggle('active', answersVisible);
            }
            updateEyeIcon();
            toggleAnsBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                answersVisible = !answersVisible;
                updateEyeIcon();
                toggleAnswersEn();
                if (answersVisible) instantHighlight();
                showNotification(answersVisible ? "Answers: Visible" : "Answers: Hidden");
            });
            const toggleAnsSub = shadow.querySelector('.subtle-answer-text');
            const toggleAnsDark = shadow.querySelector('#dark-mode input[type="checkbox"]');
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

            function bindStepper({
                inputEl,
                btnDec,
                btnInc,
                getValue,
                setValue,
                min,
                max,
                step = 1,
                unit = '',
                onChange
            }) {
                function render() {
                    if (inputEl) {
                        inputEl.value = `${getValue()}${unit}`;
                    }
                }

                function applyValue(rawVal, notify = false) {
                    let num = parseFloat(String(rawVal).replace(/[^0-9.-]/g, ''));
                    if (isNaN(num)) num = getValue();
                    num = Math.max(min, Math.min(max, num));
                    setValue(num);
                    render();
                    if (typeof onChange === 'function') {
                        onChange(num, notify);
                    }
                }

                render();

                btnDec?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyValue(getValue() - step, true);
                });

                btnInc?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyValue(getValue() + step, true);
                });

                if (inputEl) {
                    inputEl.addEventListener('focus', () => {
                        inputEl.select();
                    });

                    inputEl.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            inputEl.blur();
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            applyValue(getValue() + step, true);
                        } else if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            applyValue(getValue() - step, true);
                        }
                    });

                    inputEl.addEventListener('change', () => {
                        applyValue(inputEl.value, true);
                    });

                    inputEl.addEventListener('blur', () => {
                        applyValue(inputEl.value, false);
                    });
                }
            }

            // Click Delay Stepper
            bindStepper({
                inputEl: shadow.querySelector('#delay-val-input'),
                btnDec: shadow.querySelector('#delay-decrease'),
                btnInc: shadow.querySelector('#delay-increase'),
                getValue: () => AUTO_CLICK_DELAY,
                setValue: (v) => {
                    AUTO_CLICK_DELAY = v;
                    GM_setValue("autoClickDelay", AUTO_CLICK_DELAY);
                },
                min: 100,
                max: 10000,
                step: 100,
                unit: 'ms'
            });

            const toggleNotif = shadow.querySelector('#toggle-notifications');
            if (toggleNotif) {
                toggleNotif.checked = NOTIFICATIONS_ENABLED;
                toggleNotif.addEventListener('change', (e) => {
                    NOTIFICATIONS_ENABLED = e.target.checked;
                    GM_setValue("notificationsEnabled", NOTIFICATIONS_ENABLED);
                    if (NOTIFICATIONS_ENABLED) showNotification("Notifications enabled");
                });
            }

            // Settings Tabs navigation
            const tabBtns = shadow.querySelectorAll('.settings-tab-btn');
            const tabPanes = shadow.querySelectorAll('.settings-tab-pane');
            tabBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const targetTab = btn.getAttribute('data-tab');
                    tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                    tabPanes.forEach(pane => {
                        pane.classList.toggle('active', pane.id === `pane-${targetTab}`);
                    });
                });
            });

            // Notification Color Customization
            const notifColorPicker = shadow.querySelector('#notif-color-picker');
            if (notifColorPicker) {
                notifColorPicker.value = NOTIFICATION_COLOR || '#39be44';
                notifColorPicker.addEventListener('input', (e) => {
                    NOTIFICATION_COLOR = e.target.value;
                    GM_setValue("notificationColor", NOTIFICATION_COLOR);
                });
                notifColorPicker.addEventListener('change', () => {
                    showNotification("Notification color updated!", NOTIFICATION_COLOR);
                });
            }

            // Notification Font Size Stepper
            bindStepper({
                inputEl: shadow.querySelector('#notif-font-input'),
                btnDec: shadow.querySelector('#notif-font-decrease'),
                btnInc: shadow.querySelector('#notif-font-increase'),
                getValue: () => NOTIFICATION_FONT_SIZE,
                setValue: (v) => {
                    NOTIFICATION_FONT_SIZE = v;
                    GM_setValue("notificationFontSize", NOTIFICATION_FONT_SIZE);
                },
                min: 11,
                max: 24,
                step: 1,
                unit: 'px',
                onChange: (v, notify) => {
                    if (notify) showNotification("Notification font resized");
                }
            });

            // Answer Font Size Stepper
            bindStepper({
                inputEl: shadow.querySelector('#ans-font-input'),
                btnDec: shadow.querySelector('#ans-font-decrease'),
                btnInc: shadow.querySelector('#ans-font-increase'),
                getValue: () => ANSWER_FONT_SIZE,
                setValue: (v) => {
                    ANSWER_FONT_SIZE = v;
                    GM_setValue("answerFontSize", ANSWER_FONT_SIZE);
                    document.documentElement.style.setProperty('--answer-font-size', `${ANSWER_FONT_SIZE}px`);
                    document.querySelectorAll('.subtle-answer-text').forEach(el => {
                        el.style.fontSize = `${ANSWER_FONT_SIZE}px`;
                    });
                },
                min: 10,
                max: 24,
                step: 1,
                unit: 'px'
            });

            // Gray Scale Opacity Stepper
            bindStepper({
                inputEl: shadow.querySelector('#opacity-val-input'),
                btnDec: shadow.querySelector('#opacity-decrease'),
                btnInc: shadow.querySelector('#opacity-increase'),
                getValue: () => GRAYSCALE_OPACITY,
                setValue: (v) => {
                    GRAYSCALE_OPACITY = v;
                    GM_setValue("grayscaleOpacity", GRAYSCALE_OPACITY);
                    if (typeof instantHighlight === 'function') instantHighlight();
                },
                min: 10,
                max: 90,
                step: 5,
                unit: '%',
                onChange: () => {
                    if (typeof instantHighlight === 'function') instantHighlight();
                }
            });

            // Multiple Choice Mode & Sub-settings (Cursor & Opacity)
            const mcqModeSelect = shadow.querySelector('#mcq-mode-select');
            const mcqCursorSetting = shadow.querySelector('#mcq-cursor-setting');
            const mcqOpacitySetting = shadow.querySelector('#mcq-opacity-setting');
            const mcqCursorSelect = shadow.querySelector('#mcq-cursor-select');

            function updateMcqModeVisibility() {
                const mode = mcqModeSelect ? mcqModeSelect.value : MCQ_MODE;
                if (mcqCursorSetting) {
                    mcqCursorSetting.style.display = mode === 'cursor' ? '' : 'none';
                }
                if (mcqOpacitySetting) {
                    mcqOpacitySetting.style.display = mode === 'grayscale' ? '' : 'none';
                }
            }

            if (mcqModeSelect) {
                mcqModeSelect.value = MCQ_MODE || 'cursor';
                updateMcqModeVisibility();
                mcqModeSelect.addEventListener('change', (e) => {
                    MCQ_MODE = e.target.value;
                    GM_setValue("mcqMode", MCQ_MODE);
                    updateMcqModeVisibility();
                    if (typeof instantHighlight === 'function') instantHighlight();
                    const modeLabels = {
                        cursor: "Cursor Design",
                        grayscale: "Gray Scale",
                        checkmark: "Checkmark"
                    };
                    showNotification(`MCQ Mode: ${modeLabels[MCQ_MODE] || MCQ_MODE}`);
                });
            }

            if (mcqCursorSelect) {
                mcqCursorSelect.value = MCQ_CURSOR || 'not-allowed';
                mcqCursorSelect.addEventListener('change', (e) => {
                    MCQ_CURSOR = e.target.value;
                    GM_setValue("mcqCursor", MCQ_CURSOR);
                    if (typeof instantHighlight === 'function') instantHighlight();
                    showNotification(`Cursor design: ${MCQ_CURSOR}`);
                });
            }

            // Typed Answer Display Mode
            const typedAnswerModeSelect = shadow.querySelector('#typed-answer-mode-select');
            if (typedAnswerModeSelect) {
                typedAnswerModeSelect.value = TYPED_ANSWER_MODE || 'visible';
                typedAnswerModeSelect.addEventListener('change', (e) => {
                    TYPED_ANSWER_MODE = e.target.value;
                    GM_setValue("typedAnswerMode", TYPED_ANSWER_MODE);
                    // Re-render any existing answer overlay
                    document.querySelectorAll('.subtle-answer-text').forEach(el => el.remove());
                    if (typeof instantHighlight === 'function') instantHighlight();
                    const modeLabels = {
                        visible:     'Visible Box',
                        placeholder: 'Placeholder Only',
                        hover:       'Hover to Reveal',
                        watermark:   'Watermark',
                        autofill:    'Auto-Fill & Hide'
                    };
                    showNotification(`Typed Answer Mode: ${modeLabels[TYPED_ANSWER_MODE] || TYPED_ANSWER_MODE}`);
                });
            }

            const btnHideUi = shadow.querySelector('#btn-hide-ui');
            const stealthUnhideZone = shadow.querySelector('#stealth-unhide-zone');

            function hideUiCompletely() {
                setMainOpen(false);
                hideTooltip();
                main.classList.add('stealth-hidden');
                main.inert = true;
                main.setAttribute('aria-hidden', 'true');

                if (stealthUnhideZone) {
                    stealthUnhideZone.style.display = 'block';
                    stealthUnhideZone.style.pointerEvents = 'auto';
                    stealthUnhideZone.classList.remove('aura-glow');
                    void stealthUnhideZone.offsetWidth;
                    stealthUnhideZone.classList.add('aura-glow');
                }

                showNotification("UI hidden! Click the glowing zone or Ctrl+Click to restore.");
            }

            function unhideUi() {
                main.classList.remove('stealth-hidden');
                main.inert = false;
                main.removeAttribute('aria-hidden');

                if (stealthUnhideZone) {
                    stealthUnhideZone.classList.remove('aura-glow');
                    stealthUnhideZone.style.display = 'none';
                    stealthUnhideZone.style.pointerEvents = 'none';
                }

                clampToolbarToViewport();
                showNotification("UI restored!");
            }

            btnHideUi?.addEventListener('click', hideUiCompletely);
            stealthUnhideZone?.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                unhideUi();
            });
            window.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    if (e.target && e.target.closest && e.target.closest('a')) return;

                    e.preventDefault();
                    e.stopPropagation();

                    if (main.classList.contains('stealth-hidden')) {
                        unhideUi();
                    } else {
                        hideUiCompletely();
                    }
                }
            }, true);

            window.addEventListener('click', (e) => {
                if (e.altKey && e.button === 0) {
                    e.preventDefault();
                    e.stopPropagation();

                    if (toggleAns) {
                        toggleAns.checked = !toggleAns.checked;
                        toggleAnswersEn();
                        if (toggleAns.checked) instantHighlight();
                        showNotification(toggleAns.checked ? "Answers: Visible" : "Answers: Hidden");
                    }
                }
            }, true);

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

            // Parallax effect removed: not applicable to pill toolbar buttons

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
        mainStatusDot.style.boxShadow = '0 0 4px gray';
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
                        if (typeof mainStatusDot !== 'undefined') {
                            mainStatusDot.style.backgroundColor = 'green';
                            mainStatusDot.style.boxShadow = '0 0 4px green';
                        }
                        apiStatusText.textContent = 'Connected';
                    } else {
                        apiStatusDot.style.backgroundColor = 'red';
                        if (typeof mainStatusDot !== 'undefined') {
                            mainStatusDot.style.backgroundColor = 'red';
                            mainStatusDot.style.boxShadow = '0 0 4px red';
                        }
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
                    mainStatusDot.style.boxShadow = '0 0 4px gray';
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

        document.querySelectorAll('.ans-check').forEach(el => {
            el.style.opacity = isAnsVisible ? '1' : '0';
        });
        document.querySelectorAll('.subtle-answer-text').forEach(el => {
            el.style.display = isAnsVisible ? 'block' : 'none';
            el.style.opacity = isAnsVisible ? '1' : '0';
        });
        if (!isAnsVisible) {
            document.querySelectorAll('.ans-stealth-disabled').forEach(el => {
                el.classList.remove('ans-stealth-disabled');
                el.style.removeProperty('--stealth-cursor');
                el.style.removeProperty('cursor');
                el.style.removeProperty('opacity');
                el.style.removeProperty('filter');
                el.style.removeProperty('pointer-events');
                el.querySelectorAll('*').forEach(child => {
                    child.style.removeProperty('cursor');
                    child.style.removeProperty('pointer-events');
                });
            });
        }
    }

            function changeColorMode() {
                setTheme(toggleAnsDark.checked);
                GM_setValue("darkMode", toggleAnsDark.checked);
            };

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

            // Initialize inert states on hidden panels and closed toolbar pill
            [settingsMenu, termsMenu, apikeyMenu, answersMenu].forEach(panel => {
                if (panel) {
                    panel.inert = true;
                    panel.setAttribute('aria-hidden', 'true');
                }
            });
            if (toolbarPill) {
                toolbarPill.inert = true;
                toolbarPill.setAttribute('aria-hidden', 'true');
            }

            initToolbarPosition();

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
            svg.style.setProperty('fill', 'var(--theme-accent)');
            path.setAttribute('d', SHIELD_PATHS.true);
            if (statusText) {
                statusText.textContent = 'Safe';
                statusText.style.color = 'var(--theme-accent)';
            }
        } else {
            svg.style.setProperty('fill', 'var(--theme-danger)');
            path.setAttribute('d', SHIELD_PATHS.false);
            if (statusText) {
                statusText.textContent = 'Not protected';
                statusText.style.color = 'var(--theme-danger)';
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
                    console.log("Room hash not on student endpoint, falling back to direct quiz API...");
                }
            }

            CLEANED_QUESTIONS = cleanQuizData(data.questions || ROOM_DATA?.questions);
            const hash = await generateQuizHash(CLEANED_QUESTIONS);

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

            const officialAnswers = formatQuizResultsFromSaved(data.questions || ROOM_DATA?.questions || savedQuestions);
            const hasOfficial = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

            if (hasOfficial) {
                CACHED_RESULTS = Object.assign({}, officialAnswers);

                const officialMap = {};
                const qList = Array.isArray(data.questions || ROOM_DATA?.questions || savedQuestions)
                    ? (data.questions || ROOM_DATA?.questions || savedQuestions)
                    : Object.values(data.questions || ROOM_DATA?.questions || savedQuestions);

                qList.forEach((q, idx) => {
                    const qId = q._id || q.id || String(idx);
                    const ans = q.structure?.answer !== undefined ? q.structure.answer : q.answer;
                    if (ans !== undefined && ans !== null && ans !== -1) {
                        officialMap[qId] = ans;
                    }
                });

                AI_DATA = Object.assign({}, officialMap);

                // Identify missing questions (e.g. BLANK/OPEN or questions with no official answer in the API)
                const missingQuestions = {};
                if (CLEANED_QUESTIONS) {
                    qList.forEach((q, idx) => {
                        const qId = q._id || q.id || String(idx);
                        const qText = stripHtml(q.structure?.query?.text || q.query?.text || q.question || '');
                        const currAns = CACHED_RESULTS[qText];
                        if (!currAns || currAns === "Answer not found") {
                            if (CLEANED_QUESTIONS[qId]) {
                                missingQuestions[qId] = CLEANED_QUESTIONS[qId];
                            }
                        }
                    });
                }

                const missingCount = Object.keys(missingQuestions).length;
                if (missingCount > 0 && isAiChecked) {
                    showNotification(`Official answers loaded! Generating AI answers for ${missingCount} question(s)...`, "#FFA500");
                    const aiPartial = await requestAiAnswers(missingQuestions);
                    if (aiPartial) {
                        Object.assign(AI_DATA, aiPartial);
                        const formattedPartial = formatQuizResults(aiPartial, missingQuestions);
                        Object.assign(CACHED_RESULTS, formattedPartial);
                        showNotification("AI answers generated and merged!");
                    }
                }

                if (Object.keys(AI_DATA).length > 0) {
                    const targetKey = resolvedQuizId || "active_quiz";
                    GM_setValue(`${targetKey}`, { isOfficial: true, answers: AI_DATA });
                    GM_setValue("active_quiz", { isOfficial: true, answers: AI_DATA });
                }

                instantHighlight();

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = (missingCount > 0 && isAiChecked) ? 'Answers available (Official + AI)' : 'Answers available (Official)';
                    quizStatusMenu.style.color = 'var(--theme-accent)';
                }
                if (typeof renderAnswersList === 'function') {
                    renderAnswersList(CACHED_RESULTS, (missingCount > 0 && isAiChecked) ? "HYBRID" : "OFFICIAL");
                }
                if (missingCount === 0 || !isAiChecked) {
                    showNotification("Official Quizizz answers loaded!");
                }
                return;
            }

            if (quizStorage && quizStorage.isOfficial && quizStorage.answers && Object.keys(quizStorage.answers).length > 0) {
                AI_DATA = quizStorage.answers;
                CACHED_RESULTS = formatQuizResults(AI_DATA, CLEANED_QUESTIONS);

                instantHighlight();

                if (quizStatusMenu) {
                    quizStatusMenu.innerText = 'Answers available';
                    quizStatusMenu.style.color = 'var(--theme-accent)';
                }
                if (typeof renderAnswersList === 'function') {
                    renderAnswersList(CACHED_RESULTS, "CACHE");
                }
                showNotification("Official answers loaded from cache!");
                return;
            }

            if (isAiChecked) {
                const aiAnswers = await processQuizAi(CLEANED_QUESTIONS);
                if (aiAnswers) {
                    CACHED_RESULTS = formatQuizResults(aiAnswers, data.questions || CLEANED_QUESTIONS);

                    instantHighlight();

                    if (quizStatusMenu) {
                        quizStatusMenu.innerText = 'Answers available';
                        quizStatusMenu.style.color = 'var(--theme-accent)';
                    }
                    if (typeof renderAnswersList === 'function') {
                        renderAnswersList(CACHED_RESULTS, "AI");
                    }
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

    async function requestAiAnswers(questionsJson) {
        if (!questionsJson || Object.keys(questionsJson).length === 0) return null;

        const provider = getSelectedProvider();

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
                answers = await solveQuizWithGroq(questionsJson);
            } else if (provider === "gemini") {
                answers = await solveQuizWithGemini(questionsJson);
            } else if (provider === "gpt") {
                answers = await solveQuizWithGPT(questionsJson);
            }

            return (answers && Object.keys(answers).length > 0) ? answers : null;
        } catch (err) {
            showNotification("AI solver error: " + (err.message || err), "#af4c4c");
            console.error("AI solver error:", err);
            return null;
        }
    }

    const PENDING_ON_DEMAND = new Set();
    async function solveSingleQuestionOnDemand(qId, qData) {
        const toggleAiCheckbox = getShadowEl('#toggle-ai-checkbox');
        const isAiChecked = toggleAiCheckbox ? toggleAiCheckbox.checked : GM_getValue("aiAssistance", false);
        if (!isAiChecked) return null;

        const targetId = qId || qData?._id || qData?.id || 'active_q';
        if (PENDING_ON_DEMAND.has(targetId)) return null;
        PENDING_ON_DEMAND.add(targetId);

        try {
            const singleJson = {};
            const cleanObj = (CLEANED_QUESTIONS && CLEANED_QUESTIONS[targetId]) ? CLEANED_QUESTIONS[targetId] : {
                type: 'BLANK',
                question: stripHtml(qData?.question || qData?.structure?.query?.text || 'Question'),
                options: []
            };
            singleJson[targetId] = cleanObj;

            const answers = await requestAiAnswers(singleJson);
            if (answers && answers[targetId]) {
                if (!AI_DATA) AI_DATA = {};
                AI_DATA[targetId] = answers[targetId];

                const stem = stripHtml(qData?.question || qData?.structure?.query?.text || '');
                if (stem && CACHED_RESULTS) {
                    CACHED_RESULTS[stem] = String(answers[targetId]);
                }
                const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
                GM_setValue(`${quizId}`, { isOfficial: false, answers: AI_DATA });
                instantHighlight();
                return answers[targetId];
            }
        } finally {
            PENDING_ON_DEMAND.delete(targetId);
        }
        return null;
    }

    async function processQuizAi(cleanedQuestionsJson) {
        if (!cleanedQuestionsJson || Object.keys(cleanedQuestionsJson).length === 0) {
            console.error("No questions provided to processQuizAi.");
            showNotification("No question data found to solve", "#af4c4c");
            return null;
        }

        const quizId = QUIZ_DATA?.id || QUIZ_DATA?._id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
        const hash = await generateQuizHash(cleanedQuestionsJson);

        const answers = await requestAiAnswers(cleanedQuestionsJson);
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
    }
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

            // Handle poll / opinion marker or missing answer sentinel (-1)
            if (node === -1) {
                return '';
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
        const kind = String(q.type || structure.kind || '').toUpperCase();

        // BLANK, OPEN, MCQ, MSQ, POLL are NEVER matching or ordering questions!
        if (kind.includes('BLANK') || kind.includes('OPEN') || kind === 'MCQ' || kind === 'MSQ' || kind === 'POLL') {
            return [];
        }

        const rawOptions = structure.options || q.options || [];
        const rawTargets = structure.targets || q.targets || [];
        const answer = structure.answer !== undefined ? structure.answer : q.answer;
        const matches = structure.matches || q.matches;

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
        const kind = String(q.type || structure.kind || '').toUpperCase();

        if (kind.includes('BLANK') || kind.includes('OPEN') || kind === 'MCQ' || kind === 'MSQ' || kind === 'POLL') {
            return null;
        }

        const rawOptions = structure.options || q.options || [];
        const rawTargets = structure.targets || q.targets || [];
        const answer = structure.answer !== undefined ? structure.answer : q.answer;

        const hasValidTargetCategories = rawTargets.length > 0 && rawTargets.some(t => {
            const txt = stripHtml(t.text || t.value || t.query?.text || '');
            return txt.trim().length > 0;
        });

        const isMatch = (kind.includes('MATCH') || kind.includes('CLASSIF') || hasValidTargetCategories) && !kind.includes('BLANK') && !kind.includes('OPEN');
        const isOrder = kind.includes('ORDER') || kind.includes('REORDER') || kind.includes('SORT') ||
                        (rawTargets.length === 0 && Array.isArray(answer) && answer.length > 1 && answer.length === rawOptions.length);

        if (!isMatch && !isOrder) return null;

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

                const isBlankOrOpenType = questionType.includes('BLANK') || questionType.includes('OPEN');
                if (rawTargets.length > 0 && !isBlankOrOpenType) {
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
                const isPoll = qData?.type === 'POLL' || qData?.structure?.kind === 'POLL';
                if (aiAnswer === -1) {
                    answerText = isPoll ? "Any Answer / Poll (All choices accepted)" : "Answer not found";
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

    async function solveQuizWithGemini(questionsJsonObject) {
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

    function showNotification(message, color = null) {
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

        const isStandardColor = !color || color === '#4caf50' || color === '#39be44' || color.startsWith('var(');
        const finalColor = isStandardColor ? (NOTIFICATION_COLOR || 'var(--theme-accent, #39be44)') : color;

        const toast = document.createElement('div');
        Object.assign(toast.style, {
            backgroundColor: finalColor,
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: `${NOTIFICATION_FONT_SIZE || 15}px`,
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

            const kind = String(q.type || q.structure?.kind || '').toUpperCase();
            const isBlankOrOpen = kind.includes('BLANK') || kind.includes('OPEN');

            // Check if it's a match, classification, or order question first (only if NOT blank)
            if (!isBlankOrOpen && typeof formatMatchOrOrderAnswer === 'function') {
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

            if (isBlankOrOpen) {
                const blankAnswers = [];
                options.forEach(o => {
                    if (o.text && o.text.trim()) blankAnswers.push(o.text.trim());
                });
                if (answer !== undefined && answer !== null && answer !== -1) {
                    const extracted = typeof extractAnswerText === 'function' ? extractAnswerText(answer, options) : String(answer);
                    if (extracted && extracted !== '[object Object]' && !extracted.includes('➔') && !extracted.includes('Any Answer') && !extracted.includes('Poll')) {
                        extracted.split(/\s*\|\s*/).forEach(t => {
                            if (t && !blankAnswers.includes(t)) blankAnswers.push(t);
                        });
                    }
                }
                const targetOpts = q.structure?.targets?.[0]?.options || [];
                targetOpts.forEach(to => {
                    const tText = stripHtml(to.text || to.value || to || '');
                    if (tText && !blankAnswers.includes(tText)) blankAnswers.push(tText);
                });
                if (blankAnswers.length > 0) {
                    results[qText] = blankAnswers.join(' | ');
                    return;
                } else {
                    results[qText] = "Answer not found";
                    return;
                }
            }

            let ansText = "Answer not found";
            if (answer !== undefined && answer !== null) {
                if (kind === 'POLL' || (answer === -1 && kind === 'POLL')) {
                    ansText = "Any Answer / Poll (All choices accepted)";
                } else if (answer !== -1) {
                    const targetIndices = Array.isArray(answer) ? answer : [answer];
                    const matchedTexts = options
                        .filter((opt, idx) => targetIndices.some(t => String(t) === String(opt.id) || String(t) === String(idx)))
                        .map(opt => opt.text)
                        .filter(t => t && t.trim().length > 0);

                    if (matchedTexts.length > 0) {
                        ansText = matchedTexts.join(" | ");
                    } else {
                        const extracted = typeof extractAnswerText === 'function' ? extractAnswerText(answer, options) : '';
                        if (extracted && extracted !== '[object Object]' && extracted.trim().length > 0 && !extracted.includes('Any Answer')) {
                            ansText = extracted;
                        }
                    }
                }
            }
            results[qText] = ansText;
        });
        return results;
    }

    let lastFetchAnswersTime = 0;
    function fetchQuizAnswers(quizId) {
        const cleanRoomId = quizId.toString().trim();
        if (Date.now() - lastFetchAnswersTime < 2000) return;
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
                            QUIZ_DATA = data.data.quiz.info;
                            ROOM_DATA = null;
                            QUIZ_NAME = data.data.quiz.info.name || "Quizizz Game";
                            const quizNameDisplay = getShadowEl('#quiz-name-display');
                            if (quizNameDisplay) quizNameDisplay.innerText = QUIZ_NAME;

                            const quizStatusMenu = getShadowEl('#quiz-status-display');
                            if (quizStatusMenu) {
                                quizStatusMenu.innerText = "Answers available";
                                quizStatusMenu.style.color = "var(--theme-accent)";
                            }

                            CLEANED_QUESTIONS = cleanQuizData(savedQuestions);
                            const officialAnswers = formatQuizResultsFromSaved(savedQuestions);
                            const hasValidOfficialAnswers = officialAnswers && Object.values(officialAnswers).some(a => a && a !== "Answer not found");

                            const alreadyHasValidAnswers = CACHED_RESULTS && Object.values(CACHED_RESULTS).some(a => a && a !== "Answer not found");
                            if (alreadyHasValidAnswers && !hasValidOfficialAnswers) {
                                console.log("5/5 official answers are already active on screen. Ignoring unverified network fallback.");
                                return;
                            }

                            if (hasValidOfficialAnswers) {
                                CACHED_RESULTS = officialAnswers;
                                OFFICIAL_CACHED_RESULTS = officialAnswers;

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
                                const contentSig = getQuizContentKey(savedQuestions);
                                const savedOfficial = (contentSig ? GM_getValue(contentSig, null) : null) ||
                                                      GM_getValue(`${cleanRoomId}`, null) ||
                                                      GM_getValue("active_quiz", null);

                                if (savedOfficial && savedOfficial.isOfficial && savedOfficial.results) {
                                    CACHED_RESULTS = savedOfficial.results;
                                    OFFICIAL_CACHED_RESULTS = savedOfficial.results;
                                    AI_DATA = savedOfficial.answers;
                                } else {
                                    const existingSolved = GM_getValue(`${cleanRoomId}`, null) || GM_getValue("active_quiz", null);
                                    if (existingSolved && existingSolved.answers && Object.keys(existingSolved.answers).length > 0) {
                                        AI_DATA = existingSolved.answers;
                                        CACHED_RESULTS = formatQuizResults(AI_DATA, CLEANED_QUESTIONS);
                                        OFFICIAL_CACHED_RESULTS = CACHED_RESULTS;
                                    } else {
                                        CACHED_RESULTS = officialAnswers;
                                        OFFICIAL_CACHED_RESULTS = officialAnswers;
                                    }
                                }
                            }

                            if (CACHED_RESULTS && typeof renderAnswersList === 'function') {
                                renderAnswersList(CACHED_RESULTS, "OFFICIAL");
                            }

                            instantHighlight();
                            showNotification("Answers retrieved successfully");
                        }
                    } catch (e) {
                        showNotification("Failed to parse answers", "var(--theme-danger, #af4c4c)");
                    }
                },
                onerror: () => showNotification("Failed to retrieve answers", "var(--theme-danger, #af4c4c)")
            });
        } catch (e) {
            console.error(e);
        }
    }

    let isHighlightScheduled = false;
    let lastProcessedStem = null;

    function ensureThemeStyles() {
        let style = document.getElementById('wayground-theme-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'wayground-theme-styles';
            (document.head || document.documentElement || document.body).appendChild(style);
        }
        style.textContent = `
            :root {
                --theme-accent: var(--color-picked-user, #39be44);
                --theme-accent-muted: color-mix(in srgb, var(--theme-accent) 15%, transparent);
                --theme-accent-bg: color-mix(in srgb, var(--theme-accent) 10%, transparent);
                --theme-accent-border: color-mix(in srgb, var(--theme-accent) 30%, transparent);
                --theme-danger: #e53935;
                --theme-danger-bg: rgba(229, 57, 53, 0.1);
                --theme-danger-border: rgba(229, 57, 53, 0.3);
                --theme-neutral-bg: rgba(0, 0, 0, 0.05);
                --theme-neutral-border: rgba(150, 150, 150, 0.3);
                --theme-success: var(--theme-accent);
                --theme-success-bg: color-mix(in srgb, var(--theme-accent) 20%, transparent);

                --ans-accent: var(--theme-accent);
                --ans-accent-muted: var(--theme-accent-muted);
                --ans-bg: rgba(15, 23, 42, 0.95);
                --ans-bg-hover: rgba(15, 23, 42, 0.92);
                --ans-border: var(--theme-accent);
                --ans-text: #e2e8f0;
                --ans-text-dim: #94a3b8;
                --ans-btn-bg: var(--theme-accent);
                --ans-btn-color: #0d1117;
                --ans-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                --ans-shadow-lg: 0 4px 14px rgba(0, 0, 0, 0.4);
                --ans-divider: rgba(255, 255, 255, 0.08);
                --ans-watermark: rgba(255, 255, 255, 0.18);
                --ans-badge-bg: #2563eb;
                --ans-badge-color: #ffffff;
                --ans-badge-border: #ffffff;
                --ans-drop-bg: var(--theme-accent);
                --ans-drop-color: #0d1117;
            }
        `;
    }

    function ensureStealthStyles() {
        let style = document.getElementById('wayground-stealth-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'wayground-stealth-styles';
            (document.head || document.documentElement || document.body).appendChild(style);
        }
        const cursorVal = MCQ_CURSOR || 'not-allowed';
        const opacityVal = Math.max(0.1, Math.min(0.9, (Number(GRAYSCALE_OPACITY) || 55) / 100)).toFixed(2);
        style.textContent = `
            .ans-cursor-target,
            .ans-cursor-target * {
                cursor: ${cursorVal} !important;
                pointer-events: auto !important;
            }
            .ans-grayscale-target {
                opacity: ${opacityVal} !important;
                filter: grayscale(45%) contrast(85%) !important;
                transition: opacity 0.2s ease, filter 0.2s ease !important;
                pointer-events: auto !important;
            }
        `;
    }

    function clearStealthDisabled() {
        document.querySelectorAll('.ans-cursor-target, .ans-grayscale-target, .ans-stealth-disabled').forEach(el => {
            el.classList.remove('ans-cursor-target', 'ans-grayscale-target', 'ans-stealth-disabled');
            el.style.removeProperty('--stealth-cursor');
            el.style.removeProperty('--grayscale-opacity');
            el.style.removeProperty('cursor');
            el.style.removeProperty('opacity');
            el.style.removeProperty('filter');
            el.style.removeProperty('pointer-events');
            el.querySelectorAll('*').forEach(child => {
                child.style.removeProperty('cursor');
                child.style.removeProperty('pointer-events');
            });
        });
    }

    function instantHighlight() {
        ensureThemeStyles();
        if (!AI_DATA && !savedQuestions && !CACHED_RESULTS) {
            const routeDataRef = QUIZ_DATA?._id || QUIZ_DATA?.id || ROOM_DATA?.quizId || ROOM_DATA?.hash || "active_quiz";
            const memoryTransitStore = GM_getValue(`${routeDataRef}`, null) || GM_getValue("active_quiz", null);

            if (memoryTransitStore && memoryTransitStore.answers) {
                AI_DATA = memoryTransitStore.answers;
            }
        }

        if (!savedQuestions && !AI_DATA && !CACHED_RESULTS) return;

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

        if (lastProcessedStem !== (domQuesId || currentStemText)) {
            document.querySelectorAll('.ans-check').forEach(el => el.remove());
            clearStealthDisabled();
            document.querySelectorAll('.subtle-answer-text').forEach(el => el.remove());
            document.querySelectorAll('.match-num-badge').forEach(el => el.remove());
            document.querySelectorAll('.match-target-badge').forEach(el => el.remove());
            document.querySelectorAll('.match-guide-box').forEach(el => el.remove());
            lastProcessedStem = domQuesId || currentStemText;
            hasAutoClickedCurrent = false;
        }

        let activeQuestionData = null;
        let expectedAnswer = null;

        let isOfficialKey = false;

        // Always resolve activeQuestionData from savedQuestions or CLEANED_QUESTIONS
        if (savedQuestions) {
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
        }

        if (!activeQuestionData && CLEANED_QUESTIONS) {
            if (domQuesId && CLEANED_QUESTIONS[domQuesId]) {
                activeQuestionData = CLEANED_QUESTIONS[domQuesId];
            } else if (currentStemText) {
                for (const [qId, qData] of Object.entries(CLEANED_QUESTIONS)) {
                    const qText = normalizeText(qData.question);
                    if (qText && (qText === currentStemText || qText.includes(currentStemText) || currentStemText.includes(qText))) {
                        activeQuestionData = qData;
                        break;
                    }
                }
            }
        }

        if (CACHED_RESULTS && currentStemText) {
            for (const [qText, ans] of Object.entries(CACHED_RESULTS)) {
                const normQ = normalizeText(qText);
                if (normQ && (normQ === currentStemText || normQ.includes(currentStemText) || currentStemText.includes(normQ))) {
                    if (ans && ans !== "Answer not found" && ans !== "[object Object]") {
                        expectedAnswer = ans;
                        isOfficialKey = true;
                        break;
                    }
                }
            }
        }

        if (activeQuestionData) {
            const qKind = String(activeQuestionData.type || activeQuestionData.structure?.kind || '').toUpperCase();
            const isBlankNow = qKind.includes('BLANK') || qKind.includes('OPEN') || Boolean(document.querySelector('input[data-testid="typed-response-input"], input.typed-response-input, input[placeholder*="Type answer"], textarea'));
            if (!isBlankNow && typeof formatMatchOrOrderAnswer === 'function') {
                const matchAns = formatMatchOrOrderAnswer(activeQuestionData);
                if (matchAns) {
                    expectedAnswer = matchAns;
                    isOfficialKey = true;
                }
            }
            if (expectedAnswer === null || expectedAnswer === undefined) {
                const officialAns = activeQuestionData.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData.answer;
                const isPollQ = qKind === 'POLL';
                if (officialAns !== undefined && officialAns !== null && (officialAns !== -1 || isPollQ)) {
                    expectedAnswer = officialAns;
                    isOfficialKey = true;
                }
            }
        }

        if (!isOfficialKey && (expectedAnswer === null || expectedAnswer === undefined) && AI_DATA) {
            if (domQuesId && AI_DATA[domQuesId] !== undefined) {
                expectedAnswer = AI_DATA[domQuesId];
            } else if (currentStemText && CLEANED_QUESTIONS) {
                for (const [qId, qData] of Object.entries(CLEANED_QUESTIONS)) {
                    const qText = normalizeText(qData.question);
                    if (qText && (qText === currentStemText || qText.includes(currentStemText) || currentStemText.includes(qText))) {
                        expectedAnswer = AI_DATA[qId];
                        break;
                    }
                }
            }
        }

        const qType = activeQuestionData?.type || activeQuestionData?.structure?.kind || 'MCQ';
        const rawOptions = activeQuestionData?.options || activeQuestionData?.structure?.options || [];

        const isChoiceActiveVisuals = document.querySelectorAll(
            'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
        ).length > 0;

        const typedInputEl = document.querySelector('input[data-testid="typed-response-input"], input.typed-response-input, input[placeholder*="Type answer"], textarea');
        const isBlankQuestion = qType === 'BLANK' || qType === 'OPEN' || Boolean(typedInputEl);

        if ((expectedAnswer === null || expectedAnswer === undefined) && !isBlankQuestion) return;

        if (isBlankQuestion || qType === 'BLANK' || qType === 'OPEN' || qType === 'MATCH' || qType === 'CLASSIFICATION' || qType === 'ORDER' || (rawOptions.length === 0 && !isChoiceActiveVisuals)) {
            const textContainer = document.querySelector('[data-testid="text-renderer"]') ||
                                  document.querySelector('.drag-drop-text div') ||
                                  document.querySelector('.h-full .flex .flex-col .gap-4') ||
                                  document.querySelector('.p-4.sm\\:p-6') ||
                                  document.querySelector('.text-area-container') ||
                                  document.querySelector('[data-testid="typed-response-input"]') ||
                                  stemEl?.parentElement;

            if (textContainer) {
                let ansStr = '';

                // Only call formatMatchOrOrderAnswer if NOT a blank/typed question!
                if (!isBlankQuestion && typeof formatMatchOrOrderAnswer === 'function' && activeQuestionData) {
                    ansStr = formatMatchOrOrderAnswer(activeQuestionData) || '';
                }

                if (!ansStr && expectedAnswer) {
                    const candidate = typeof extractAnswerText === 'function' ? extractAnswerText(expectedAnswer, rawOptions) : String(expectedAnswer);
                    if (!isBlankQuestion || (!candidate.includes('➔') && !candidate.includes('Category #') && !candidate.includes('Item #') && !candidate.includes('Any Answer') && !candidate.includes('Poll'))) {
                        ansStr = candidate;
                    }
                }

                // If blank question and still empty or contaminated with match artifacts, extract clean answer
                if (isBlankQuestion && (!ansStr || ansStr.includes('➔') || ansStr.includes('Category #') || ansStr === 'Answer not available' || ansStr === 'Answer not found' || ansStr.includes('Any Answer') || ansStr.includes('Poll'))) {
                    ansStr = '';
                    const cleanList = [];
                    rawOptions.forEach(o => {
                        const t = stripHtml(o.text || o.value || o.query?.text || '');
                        if (t && !t.includes('➔') && !t.includes('Category #') && !t.includes('Item #') && !t.includes('Any Answer') && !t.includes('Poll')) {
                            cleanList.push(t);
                        }
                    });
                    const backupAns = activeQuestionData?.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData?.answer;
                    if (backupAns !== undefined && backupAns !== null && backupAns !== -1) {
                        const extracted = typeof extractAnswerText === 'function' ? extractAnswerText(backupAns, rawOptions) : String(backupAns);
                        if (extracted && !extracted.includes('➔') && !extracted.includes('Category #') && !extracted.includes('Any Answer') && !extracted.includes('Poll')) {
                            extracted.split(/\s*\|\s*/).forEach(t => {
                                if (t && !cleanList.includes(t)) cleanList.push(t);
                            });
                        }
                    }
                    const targetOpts = activeQuestionData?.structure?.targets?.[0]?.options || [];
                    targetOpts.forEach(to => {
                        const tText = stripHtml(to.text || to.value || to || '');
                        if (tText && !cleanList.includes(tText)) cleanList.push(tText);
                    });
                    if (cleanList.length > 0) {
                        ansStr = cleanList.join(' | ');
                    }
                }

                // If blank question and still no answer, trigger on-demand AI resolution if AI enabled
                if (isBlankQuestion && (!ansStr || ansStr === 'Answer not available' || ansStr === 'Answer not found')) {
                    const toggleAiCheckbox = getShadowEl('#toggle-ai-checkbox');
                    const isAiChecked = toggleAiCheckbox ? toggleAiCheckbox.checked : GM_getValue("aiAssistance", false);
                    if (isAiChecked && typeof solveSingleQuestionOnDemand === 'function') {
                        ansStr = 'AI generating answer...';
                        solveSingleQuestionOnDemand(domQuesId, activeQuestionData);
                    } else {
                        ansStr = 'Answer not available';
                    }
                }

                if (!ansStr || ansStr === '[object Object]') {
                    ansStr = 'Answer not available';
                }

                let answerDiv = textContainer.querySelector('.subtle-answer-text');
                if (!answerDiv) {
                    answerDiv = document.createElement('div');
                    answerDiv.className = 'subtle-answer-text';
                    textContainer.appendChild(answerDiv);
                }

                if (isBlankQuestion) {
                    const firstOption = ansStr.split(/\s*\|\s*/)[0].trim();
                    const targetInput = document.querySelector('input[data-testid="typed-response-input"], input.typed-response-input, input[placeholder*="Type answer"], textarea');
                    const currentMode = (typeof TYPED_ANSWER_MODE !== 'undefined') ? TYPED_ANSWER_MODE : 'visible';

                    const isFillable = firstOption && firstOption !== 'Answer not available' && firstOption !== 'AI generating answer...' && firstOption !== 'Answer not found';
                    const doFill = () => {
                        if (targetInput && isFillable) {
                            targetInput.value = firstOption;
                            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                            targetInput.focus();
                            showNotification("Filled answer into input!");
                        } else if (navigator.clipboard && isFillable) {
                            navigator.clipboard.writeText(firstOption);
                            showNotification("Copied to clipboard!");
                        }
                    };

                    // SVG icons (no emoji)
                    const svgPencil = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
                    const svgEye  = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
                    const svgClipboard = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;

                    const insertBtnHtml = `
                        <button class="btn-fill-typed-action" type="button" style="
                            display: inline-flex; align-items: center; gap: 5px;
                            background: var(--ans-btn-bg);
                            color: var(--ans-btn-color);
                            font-weight: 800; font-size: 12px;
                            padding: 4px 10px; border-radius: 5px;
                            border: none; cursor: pointer; white-space: nowrap;
                            font-family: inherit;
                        ">${svgClipboard} Insert</button>`;

                    // --- MODE: autofill: silently fill input, hide the box ---
                    if (currentMode === 'autofill') {
                        answerDiv.style.display = 'none';
                        if (targetInput && isFillable && !targetInput.value) {
                            targetInput.value = firstOption;
                            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                    // --- MODE: placeholder: answer shown only as input placeholder ---
                    } else if (currentMode === 'placeholder') {
                        answerDiv.style.display = 'none';
                        if (targetInput && isFillable) {
                            targetInput.placeholder = firstOption;
                        }

                    // --- MODE: watermark: tiny, barely-visible text below the input ---
                    } else if (currentMode === 'watermark') {
                        answerDiv.innerHTML = `<span style="
                            font-size: 11px;
                            color: var(--ans-watermark);
                            letter-spacing: 0.5px;
                            user-select: none;
                            pointer-events: none;
                            display: block;
                            margin-top: 6px;
                        ">${escapeHtml(ansStr)}</span>`;

                    // --- MODE: hover: collapsed summary, click to reveal ---
                    } else if (currentMode === 'hover') {
                        answerDiv.innerHTML = `
                            <details style="margin-top: 10px; cursor: pointer;">
                                <summary style="
                                    list-style: none;
                                    display: inline-flex;
                                    align-items: center;
                                    gap: 5px;
                                    color: var(--ans-accent);
                                    font-size: 12px;
                                    opacity: 0.7;
                                    font-weight: 600;
                                    user-select: none;
                                ">${svgEye} Tap to reveal answer</summary>
                                <div style="
                                    margin-top: 6px;
                                    background: var(--ans-bg-hover);
                                    border: 1.5px solid var(--ans-border);
                                    border-radius: 7px;
                                    padding: 8px 13px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: space-between;
                                    gap: 10px;
                                    box-shadow: var(--ans-shadow);
                                ">
                                    <span style="color: var(--ans-text); font-size: 15px; font-weight: 700;">${escapeHtml(ansStr)}</span>
                                    ${insertBtnHtml}
                                </div>
                            </details>
                        `;
                        answerDiv.querySelector('.btn-fill-typed-action')?.addEventListener('click', doFill);

                    // --- MODE: visible (default): full visible box ---
                    } else {
                        answerDiv.innerHTML = `
                            <div style="
                                margin-top: 14px;
                                background: var(--ans-bg);
                                border: 1.5px solid var(--ans-border);
                                border-radius: 8px;
                                padding: 10px 14px;
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                gap: 10px;
                                box-shadow: var(--ans-shadow);
                            ">
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <span style="display:inline-flex;align-items:center;gap:5px;font-weight:800;color:var(--ans-accent);font-size:13px;">
                                        ${svgPencil} Typed Answer:
                                    </span>
                                    <span class="click-to-fill-typed" style="
                                        font-weight: 700;
                                        color: var(--ans-text);
                                        font-size: 15px;
                                        cursor: pointer;
                                        text-decoration: underline;
                                    " title="Click to fill into input">${escapeHtml(ansStr)}</span>
                                </div>
                                ${insertBtnHtml}
                            </div>
                        `;
                        answerDiv.querySelector('.click-to-fill-typed')?.addEventListener('click', doFill);
                        answerDiv.querySelector('.btn-fill-typed-action')?.addEventListener('click', doFill);

                        if (targetInput && !targetInput.value && isFillable) {
                            targetInput.placeholder = firstOption;
                        }
                    }
                } else if (ansStr.includes('➔')) {
                    const rawPairs = ansStr.split(/\s*\|\s*/).map(p => p.trim()).filter(Boolean);
                    let pairsHtml = rawPairs.map((p, idx) => {
                        const parts = p.split('➔');
                        const cardText = parts[0]?.trim() || `Item #${idx + 1}`;
                        const targetText = parts[1]?.trim() || '';
                        return `
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--ans-divider);">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="background: var(--ans-badge-bg); color: var(--ans-badge-color); font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 10px; white-space: nowrap;">#${idx + 1}</span>
                                    <span style="color: var(--ans-text); font-size: 13px; font-weight: 500;">${cardText}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="color: var(--ans-accent); display: inline-flex; align-items: center;"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></span>
                                    <span style="color: var(--ans-accent); font-weight: 700; font-size: 14px;">${targetText}</span>
                                </div>
                            </div>
                        `;
                    }).join('');

                    answerDiv.innerHTML = `
                        <div class="match-guide-box" style="margin-top: 14px; background: var(--ans-bg); border: 1.5px solid var(--ans-border); border-radius: 10px; padding: 12px 16px; box-shadow: var(--ans-shadow-lg); text-align: left; max-width: 100%;">
                            <div style="font-weight: 800; color: var(--ans-accent); font-size: 14px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                                <span style="display:inline-flex;align-items:center;gap:6px;">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                                    Match &amp; Drag Guide
                                </span>
                                <span style="font-size: 11px; font-weight: normal; color: var(--ans-text-dim);">Match numbers to categories</span>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                ${pairsHtml}
                            </div>
                        </div>
                    `;

                    const detailedPairs = typeof getDetailedMatchPairs === 'function' ? getDetailedMatchPairs(activeQuestionData) : [];

                    // Badging for Draggable Cards (Top Items)
                    const dragCandidates = Array.from(document.querySelectorAll(
                        '[draggable="true"], [data-testid^="draggable-"], .drag-item, .draggable-tile, .match-card, [class*="drag-item"], [class*="draggable"], [class*="match-option"]'
                    )).filter(el => !el.closest('#toolbar-pill') && !el.closest('.answers_menu') && el.offsetHeight > 30);

                    const cardsToBadge = (dragCandidates.length > 0 ? dragCandidates : Array.from(document.querySelectorAll('div, button')).filter(el => {
                        return el.querySelector('img') && !el.closest('#toolbar-pill') && !el.closest('.answers_menu') && el.offsetHeight > 50 && el.offsetHeight < 300 && el.offsetWidth > 50;
                    })).filter((el, i, arr) => !arr.some(other => other !== el && other.contains(el)));

                    // Match each DOM card to a pair by exact Image URL or Text or horizontal index
                    const assignedPairIndices = new Set();
                    cardsToBadge.forEach((card, domIdx) => {
                        const img = card.querySelector('img');
                        let matchedPairIdx = -1;

                        if (img && img.src && detailedPairs.length > 0) {
                            const domImgSrc = img.src.split('?')[0].split('#')[0];
                            const domFileName = domImgSrc.split('/').pop();
                            matchedPairIdx = detailedPairs.findIndex((dp, pIdx) => {
                                if (assignedPairIndices.has(pIdx) || !dp.mediaUrl) return false;
                                const cleanMedia = dp.mediaUrl.split('?')[0].split('#')[0];
                                const mediaFileName = cleanMedia.split('/').pop();
                                return domImgSrc.includes(cleanMedia) || cleanMedia.includes(domImgSrc) || (domFileName && domFileName === mediaFileName);
                            });
                        }

                        if (matchedPairIdx === -1 && detailedPairs.length > 0) {
                            const cardText = card.textContent.trim().toLowerCase();
                            if (cardText) {
                                matchedPairIdx = detailedPairs.findIndex((dp, pIdx) => {
                                    if (assignedPairIndices.has(pIdx)) return false;
                                    return dp.cardLabel && cardText.includes(dp.cardLabel.toLowerCase());
                                });
                            }
                        }

                        // Fallback to DOM index if unassigned
                        if (matchedPairIdx === -1) {
                            for (let pIdx = 0; pIdx < rawPairs.length; pIdx++) {
                                if (!assignedPairIndices.has(pIdx)) {
                                    matchedPairIdx = pIdx;
                                    break;
                                }
                            }
                        }

                        if (matchedPairIdx !== -1) {
                            assignedPairIndices.add(matchedPairIdx);
                            const badgeNum = matchedPairIdx + 1;
                            const targetName = detailedPairs[matchedPairIdx]?.targetLabel || rawPairs[matchedPairIdx]?.split('➔')[1]?.trim() || '';

                            if (!card.querySelector('.match-num-badge')) {
                                card.style.position = 'relative';
                                const badge = document.createElement('div');
                                badge.className = 'match-num-badge';
                                badge.textContent = `#${badgeNum}`;
                                badge.title = targetName ? `Drag to: ${targetName}` : `Item #${badgeNum}`;
                                badge.style.cssText = 'position: absolute; top: 6px; left: 6px; background: var(--ans-badge-bg, #2563eb); color: var(--ans-badge-color, #fff); font-weight: 900; font-size: 13px; padding: 2px 8px; border-radius: 12px; z-index: 100; box-shadow: 0 2px 6px rgba(0,0,0,0.6); pointer-events: none; border: 1.5px solid var(--ans-badge-border, #fff);';
                                card.appendChild(badge);
                            }
                        }
                    });

                    // Badging for Drop Targets (Bottom Categories or Ordered Slots)
                    rawPairs.forEach((p, idx) => {
                        const parts = p.split('➔');
                        if (parts.length === 2) {
                            const rawTargetText = parts[1].trim();
                            const targetText = rawTargetText.toLowerCase();
                            const slotMatch = rawTargetText.match(/\d+/);
                            const slotNum = slotMatch ? slotMatch[0] : null;

                            const allEls = document.querySelectorAll('button, div, p, span, h1, h2, h3, h4');
                            for (const el of allEls) {
                                if (el.children.length === 0 && !el.closest('#toolbar-pill') && !el.closest('.answers_menu')) {
                                    const text = el.textContent.trim().toLowerCase();
                                    const isMatch = (text && text === targetText) || (slotNum && text === slotNum);
                                    if (isMatch) {
                                        const targetBox = el.closest('[data-testid^="drop-zone-"]') || el.closest('.dropzone') || el.closest('.classification-bucket') || el.closest('.match-target') || el.parentElement;
                                        if (targetBox && !targetBox.querySelector(`.match-target-badge-num-${idx + 1}`)) {
                                            targetBox.style.position = 'relative';
                                            const tBadge = document.createElement('span');
                                            tBadge.className = `match-target-badge match-target-badge-num-${idx + 1}`;
                                            tBadge.textContent = `Drop #${idx + 1}`;
                                            tBadge.style.cssText = 'background: var(--ans-drop-bg, var(--theme-accent)); color: var(--ans-drop-color, #0d1117); font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 4px; margin-right: 6px; display: inline-block; pointer-events: none; box-shadow: 0 1px 4px rgba(0,0,0,0.3);';
                                            targetBox.prepend(tBadge);
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    });
                } else if (ansStr.includes('Poll') || ansStr === '-1' || ansStr.includes('Any Answer')) {
                    const svgVote = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;"><path d="m9 12 2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>`;
                    answerDiv.innerHTML = `
                        <div style="margin-top: 12px; background: var(--ans-accent-muted); border: 1.5px solid var(--ans-border); border-radius: 8px; padding: 10px 14px; font-weight: bold; color: var(--ans-accent); font-size: 14px; display: flex; align-items: center; gap: 8px;">
                            ${svgVote} Poll / Opinion Question: Any answer is accepted (Full points)!
                        </div>
                    `;
                } else {
                    answerDiv.textContent = `Possible answer: ${ansStr}`;
                }

                answerDiv.style.cssText = `
                    margin-top: 12px;
                    font-weight: bold;
                    color: var(--ans-accent);
                    pointer-events: ${isBlankQuestion ? 'auto' : 'none'};
                    font-size: var(--answer-font-size, ${ANSWER_FONT_SIZE || 14}px);
                    display: ${isAnsVisible ? 'block' : 'none'};
                    opacity: ${isAnsVisible ? '1' : '0'};
                `;

                // Clean up any stray answer divs in other containers
                document.querySelectorAll('.subtle-answer-text').forEach(el => {
                    if (el !== answerDiv) el.remove();
                });
            }
            return;
        }

        const rawTargets = [];
        if (Array.isArray(expectedAnswer)) {
            expectedAnswer.forEach(item => {
                if (typeof item === 'string' && item.includes(' | ')) {
                    item.split(/\s*\|\s*/).forEach(p => {
                        const trimmed = p.trim();
                        if (trimmed) rawTargets.push(trimmed);
                    });
                } else if (item !== null && item !== undefined) {
                    rawTargets.push(item);
                }
            });
        } else if (typeof expectedAnswer === 'string') {
            if (expectedAnswer.includes(' | ')) {
                expectedAnswer.split(/\s*\|\s*/).forEach(p => {
                    const trimmed = p.trim();
                    if (trimmed) rawTargets.push(trimmed);
                });
            } else {
                rawTargets.push(expectedAnswer.trim());
            }
        } else if (expectedAnswer !== null && expectedAnswer !== undefined) {
            rawTargets.push(expectedAnswer);
        }

        const rawOfficialAns = activeQuestionData?.structure?.answer !== undefined ? activeQuestionData.structure.answer : activeQuestionData?.answer;
        if (Array.isArray(rawOfficialAns)) {
            rawOfficialAns.forEach(a => {
                if (!rawTargets.some(t => String(t) === String(a))) {
                    rawTargets.push(a);
                }
            });
        }

        const targetAnswersList = [];
        rawTargets.forEach(val => {
            const extracted = typeof extractAnswerText === 'function' ? extractAnswerText(val, rawOptions) : '';
            if (extracted && extracted !== '[object Object]') {
                if (extracted.includes(' | ')) {
                    extracted.split(/\s*\|\s*/).forEach(p => {
                        const norm = normalizeText(p);
                        if (norm) targetAnswersList.push(norm);
                    });
                } else {
                    const norm = normalizeText(extracted);
                    if (norm) targetAnswersList.push(norm);
                }
            }
            if (typeof val === 'string' && val.trim().length > 0 && val !== '[object Object]') {
                if (val.includes(' | ')) {
                    val.split(/\s*\|\s*/).forEach(p => {
                        const norm = normalizeText(p);
                        if (norm) targetAnswersList.push(norm);
                    });
                } else {
                    const norm = normalizeText(val);
                    if (norm) targetAnswersList.push(norm);
                }
            }
        });

        rawOptions.forEach((opt, idx) => {
            const optId = String(opt.id || opt._id || '');
            if (rawTargets.some(t => (optId.length > 1 && String(t) === optId) || String(t) === String(idx))) {
                if (opt.text) targetAnswersList.push(normalizeText(opt.text));
            }
        });

        let optionButtons = Array.from(document.querySelectorAll(
            'button[data-testid^="option-trigger-"], div[data-testid^="option-trigger-"], .options-grid button, button.option, div.assessment-choice'
        ));
        optionButtons = optionButtons.filter(btn => !optionButtons.some(other => other !== btn && other.contains(btn)));

        const scoredButtons = [];

        optionButtons.forEach((btn, btnIdx) => {
            const optionTextEl = btn.querySelector('[data-highlight-block^="option:"] p') ||
                                  btn.querySelector('[data-highlight-block^="option:"]') ||
                                  btn.querySelector('.resizeable-text') ||
                                  btn.querySelector('.content-slot') ||
                                  btn.querySelector('p') ||
                                  btn;

            const domText = normalizeText(optionTextEl.textContent);
            const cleanText = domText.replace(/^[a-z0-9][.\s)]+\s*/i, '').trim();

            const cyAttr = btn.getAttribute('data-cy') || '';
            const testIdAttr = btn.getAttribute('data-testid') || '';

            let score = 0;

            rawTargets.forEach(targetId => {
                const tidStr = String(targetId).trim();
                if (tidStr && (cyAttr === `option-${tidStr}` || testIdAttr === `option-trigger-${tidStr}`)) {
                    score = isOfficialKey ? 5 : 4;
                } else if (tidStr && tidStr.length > 3 && (cyAttr.includes(tidStr) || testIdAttr.includes(tidStr))) {
                    score = 4;
                }
            });

            if (score === 0) {
                targetAnswersList.some(target => {
                    if (domText === target || cleanText === target) {
                        score = 3;
                        return true;
                    }

                    if (target.length < 2) return false;

                    const isMathPureGridStringDataNumber = /^[\d\s.,\-+]+$/.test(target);

                    if (isMathPureGridStringDataNumber) {
                        const exactEnding = domText.endsWith(target) || domText.endsWith(` ${target}`);
                        const boundedInclusion = domText.split(/[\s,.)-]/).includes(target.replace(/[\s,.)-]/g, ''));

                        if (exactEnding || boundedInclusion) score = 2;
                        return (score > 0);
                    }

                    if (domText.includes(target) || cleanText.includes(target) || target.includes(cleanText)) {
                        score = 1;
                        return true;
                    }
                });
            }

            if (score === 0 && rawTargets.some(t => String(t) === String(btnIdx))) {
                score = isOfficialKey ? 4 : 0.5;
            }

            if (score > 0) {
                scoredButtons.push({ btn, score, domText });
            }
        });

        const isPoll = expectedAnswer === -1 ||
                       String(expectedAnswer).toLowerCase().includes('poll') ||
                       String(expectedAnswer).toLowerCase().includes('any answer');

        const instructionText = document.querySelector('[data-testid="question-instruction-text"]')?.textContent?.toLowerCase() ||
                                document.querySelector('.question-instruction')?.textContent?.toLowerCase() ||
                                document.querySelector('.question-instruction-container')?.textContent?.toLowerCase() || '';

        const isMSQ = qType === 'MSQ' ||
                      activeQuestionData?.type === 'MSQ' ||
                      activeQuestionData?.structure?.kind === 'MSQ' ||
                      activeQuestionData?.structure?.settings?.hasMultipleCorrectAnswers === true ||
                      activeQuestionData?.structure?.settings?.canSelectMultiple === true ||
                      targetAnswersList.length > 1 ||
                      rawTargets.length > 1 ||
                      (typeof expectedAnswer === 'string' && expectedAnswer.includes(' | ')) ||
                      instructionText.includes('select all') ||
                      currentStemText.includes('select all') ||
                      (document.body.innerText && document.body.innerText.toLowerCase().includes('select all correct')) ||
                      document.querySelectorAll('.options-grid input[type="checkbox"], [data-testid^="option-trigger-"] [type="checkbox"]').length > 0;

        let matchedButtons = [];
        if (isPoll && optionButtons.length > 0) {
            matchedButtons = optionButtons;
        } else if (isMSQ) {
            const matchedSet = new Set();
            scoredButtons.forEach(s => {
                if (s.score > 0) {
                    matchedSet.add(s.btn);
                }
            });

            optionButtons.forEach(btn => {
                const textEl = btn.querySelector('[data-highlight-block^="option:"] p') ||
                               btn.querySelector('[data-highlight-block^="option:"]') ||
                               btn.querySelector('.resizeable-text') ||
                               btn.querySelector('.content-slot') ||
                               btn.querySelector('p') || btn;
                const domT = normalizeText(textEl.textContent);
                const cleanT = domT.replace(/^[a-z0-9][.\s)]+\s*/i, '').trim();
                if (targetAnswersList.some(target => domT === target || cleanT === target || (target.length > 2 && (domT.includes(target) || target.includes(cleanT))))) {
                    matchedSet.add(btn);
                }
            });

            matchedButtons = Array.from(matchedSet);
        } else if (scoredButtons.length > 0) {
            const maxScore = Math.max(...scoredButtons.map(s => s.score));
            const bestButtons = scoredButtons.filter(s => s.score === maxScore).map(s => s.btn);
            matchedButtons = [bestButtons[0]];
        }

        document.querySelectorAll('.ans-check').forEach(el => el.remove());
        clearStealthDisabled();

        matchedButtons.forEach(btn => {
            if (!isAnsVisible) return;

            if (MCQ_MODE === 'cursor') {
                ensureStealthStyles();
                const cursorVal = MCQ_CURSOR || 'not-allowed';
                btn.classList.add('ans-cursor-target');
                btn.style.setProperty('--stealth-cursor', cursorVal);
                btn.style.setProperty('cursor', cursorVal, 'important');
                btn.style.setProperty('pointer-events', 'auto', 'important');
                btn.querySelectorAll('*').forEach(child => {
                    child.style.setProperty('cursor', cursorVal, 'important');
                    child.style.setProperty('pointer-events', 'auto', 'important');
                });
            } else if (MCQ_MODE === 'grayscale') {
                ensureStealthStyles();
                const opacityVal = Math.max(0.1, Math.min(0.9, (Number(GRAYSCALE_OPACITY) || 55) / 100)).toFixed(2);
                const targetContainer = btn.querySelector('.rounded-assessment-lg') || btn;

                btn.classList.add('ans-grayscale-target');
                btn.style.setProperty('--grayscale-opacity', opacityVal);
                btn.style.setProperty('opacity', opacityVal, 'important');
                btn.style.setProperty('filter', 'grayscale(45%) contrast(85%)', 'important');
                btn.style.setProperty('pointer-events', 'auto', 'important');

                if (targetContainer && targetContainer !== btn) {
                    targetContainer.classList.add('ans-grayscale-target');
                    targetContainer.style.setProperty('--grayscale-opacity', opacityVal);
                    targetContainer.style.setProperty('opacity', opacityVal, 'important');
                    targetContainer.style.setProperty('filter', 'grayscale(45%) contrast(85%)', 'important');
                    targetContainer.style.setProperty('pointer-events', 'auto', 'important');
                }
            } else {
                if (!btn.querySelector('.ans-check')) {
                    const checkmark = document.createElement('span');
                    checkmark.className = 'ans-check';
                    checkmark.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><polyline points="20 6 9 17 4 12"/></svg>`;
                    checkmark.style.cssText = `
                        position: absolute;
                        color: var(--ans-accent);
                        top: 8px;
                        right: 12px;
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
            }
        });

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

    setInterval(() => { if(isAnsVisible) requestAnimationFrame(instantHighlight); }, 1250);
})();