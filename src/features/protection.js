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

