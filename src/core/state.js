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

