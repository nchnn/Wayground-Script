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
