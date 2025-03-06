function checkServerConnection() {
    fetch('/api/health-check')
        .then(response => {
            if (!response.ok) {
                showServerError();
            }
        })
        .catch(error => {
            console.error('Server connection error:', error);
            showServerError();
        });
}

function showServerError() {
    const errorBanner = document.createElement('div');
    errorBanner.className = 'server-error-banner';
    errorBanner.innerHTML = `
        <p><strong>Server Connection Error</strong></p>
        <p>The application server is not running. Please start the server with:</p>
        <code>node server.js</code>
        <button class="close-banner">×</button>
    `;
    document.body.appendChild(errorBanner);
    
    document.querySelector('.close-banner').addEventListener('click', function() {
        errorBanner.remove();
    });
}

// Call this at the end of the DOMContentLoaded event
checkServerConnection(); 