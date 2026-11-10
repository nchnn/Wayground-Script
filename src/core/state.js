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

