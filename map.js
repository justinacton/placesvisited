document.addEventListener('DOMContentLoaded', function() {
    // Check if running from file:// protocol
    if (window.location.protocol === 'file:') {
        showFileProtocolError();
        return; // Stop execution of the rest of the code
    }
    
    let currentUser = null;
    let visitedStates = new Set();
    let isPublic = false;
    let mapId = null;
    let statesLayer = null;
    let allMaps = [];
    
    // Initialize map centered on US
    const map = L.map('map').setView([37.8, -96], 4);

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Check for magic link login
    const urlParams = new URLSearchParams(window.location.search);
    const loginToken = urlParams.get('token');
    
    if (loginToken) {
        // Try to login with token
        loginWithToken(loginToken);
        // Remove token from URL to prevent sharing login links accidentally
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        // Check for stored user session
        const storedUser = localStorage.getItem('travelMapUser');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            updateUIForUser(currentUser);
        }
    }
    
    // Load all maps from localStorage
    loadAllMaps();
    
    // Load GeoJSON data and initialize map
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
        .then(response => response.json())
        .then(initializeMap)
        .catch(error => {
            console.error('Error loading GeoJSON data:', error);
            alert('Failed to load map data. Please try again later.');
        });
    
    function initializeMap(geoData) {
        // Check URL parameters for shared map
        const sharedMapId = urlParams.get('mapId');
        
        if (sharedMapId) {
            loadSharedMap(sharedMapId, geoData);
        } else {
            // Load from localStorage if available
            const savedStates = localStorage.getItem('travelMapCurrentStates');
            if (savedStates) {
                visitedStates = new Set(JSON.parse(savedStates));
            }
            
            const savedIsPublic = localStorage.getItem('travelMapIsPublic');
            if (savedIsPublic !== null) {
                isPublic = savedIsPublic === 'true';
                document.getElementById('privacy-switch').checked = isPublic;
            }
            
            const savedTitle = localStorage.getItem('travelMapTitle');
            if (savedTitle) {
                document.getElementById('map-title').value = savedTitle;
            }
            
            refreshMap(geoData);
        }
        
        setupEventListeners(geoData);
    }
    
    function loadSharedMap(mapId, geoData) {
        const map = findMapById(mapId);
        
        if (map) {
            visitedStates = new Set(map.states);
            isPublic = map.isPublic;
            mapId = map.id;
            
            document.getElementById('map-title').value = map.title;
            document.getElementById('privacy-switch').checked = isPublic;
            
            // Disable controls if not owner
            if (currentUser?.email !== map.userEmail) {
                disableControls();
            }
            
            refreshMap(geoData);
        } else {
            alert('Map not found or is private.');
            window.location.href = 'index.html';
        }
    }
    
    function refreshMap(geoData) {
        // Remove existing layer if it exists
        if (statesLayer) {
            map.removeLayer(statesLayer);
        }
        
        // Add GeoJSON layer with styling
        statesLayer = L.geoJSON(geoData, {
            style: function(feature) {
                const stateId = feature.properties.name;
                return {
                    fillColor: visitedStates.has(stateId) ? '#3498db' : '#e0e0e0',
                    weight: 1,
                    opacity: 1,
                    color: 'white',
                    fillOpacity: 0.7
                };
            },
            onEachFeature: function(feature, layer) {
                const stateName = feature.properties.name;
                
                // Add popup with state name
                layer.bindPopup(stateName);
                
                // Add click handler
                layer.on('click', function() {
                    if (visitedStates.has(stateName)) {
                        visitedStates.delete(stateName);
                        layer.setStyle({
                            fillColor: '#e0e0e0'
                        });
                    } else {
                        visitedStates.add(stateName);
                        layer.setStyle({
                            fillColor: '#3498db'
                        });
                    }
                    
                    // Update stats
                    updateStats();
                    
                    // Save current state to localStorage
                    localStorage.setItem('travelMapCurrentStates', JSON.stringify(Array.from(visitedStates)));
                    
                    // Hide share container when map changes
                    document.getElementById('share-container').classList.remove('active');
                });
                
                // Add hover effect
                layer.on('mouseover', function() {
                    if (!visitedStates.has(stateName)) {
                        layer.setStyle({
                            fillColor: '#bdc3c7'
                        });
                    }
                });
                
                layer.on('mouseout', function() {
                    if (!visitedStates.has(stateName)) {
                        layer.setStyle({
                            fillColor: '#e0e0e0'
                        });
                    }
                });
            }
        }).addTo(map);
        
        // Update stats initially
        updateStats();
    }
    
    function saveMap() {
        if (!currentUser) {
            showLoginModal();
            return Promise.reject('User not logged in');
        }
        
        const title = document.getElementById('map-title').value || 'My Travel Map';
        
        // Save current settings to localStorage
        localStorage.setItem('travelMapTitle', title);
        localStorage.setItem('travelMapIsPublic', isPublic.toString());
        
        // Create or update map object
        const now = new Date().toISOString();
        let mapToSave;
        
        if (mapId) {
            // Update existing map
            const mapIndex = allMaps.findIndex(m => m.id === mapId);
            if (mapIndex !== -1) {
                mapToSave = allMaps[mapIndex];
                mapToSave.title = title;
                mapToSave.states = Array.from(visitedStates);
                mapToSave.isPublic = isPublic;
                mapToSave.updatedAt = now;
                allMaps[mapIndex] = mapToSave;
            }
        } else {
            // Create new map
            mapId = generateUUID();
            mapToSave = {
                id: mapId,
                userId: currentUser.id,
                userEmail: currentUser.email,
                title: title,
                states: Array.from(visitedStates),
                isPublic: isPublic,
                createdAt: now,
                updatedAt: now
            };
            allMaps.push(mapToSave);
        }
        
        // Save all maps to localStorage
        localStorage.setItem('travelMapAllMaps', JSON.stringify(allMaps));
        
        showSaveSuccess();
        loadUserMaps();
        
        return Promise.resolve({ id: mapId });
    }
    
    function loadAllMaps() {
        const savedMaps = localStorage.getItem('travelMapAllMaps');
        if (savedMaps) {
            allMaps = JSON.parse(savedMaps);
        } else {
            allMaps = [];
        }
    }
    
    function findMapById(id) {
        const map = allMaps.find(m => m.id === id);
        if (map && (map.isPublic || (currentUser && map.userEmail === currentUser.email))) {
            return map;
        }
        return null;
    }
    
    function loadUserMaps() {
        if (!currentUser) return;
        
        const dropdown = document.getElementById('maps-dropdown');
        dropdown.innerHTML = '<option value="">Select a saved map</option>';
        
        const userMaps = allMaps.filter(map => map.userEmail === currentUser.email);
        
        userMaps.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        userMaps.forEach(mapData => {
            const option = document.createElement('option');
            option.value = mapData.id;
            option.textContent = mapData.title;
            if (mapData.id === mapId) {
                option.selected = true;
            }
            dropdown.appendChild(option);
        });
    }
    
    function updateStats() {
        const statesCount = visitedStates.size;
        const percentage = Math.round((statesCount / 50) * 100);
        
        document.getElementById('states-count').textContent = statesCount;
        document.getElementById('percentage').textContent = `${percentage}%`;
    }
    
    function disableControls() {
        document.getElementById('reset-btn').disabled = true;
        document.getElementById('save-btn').disabled = true;
        document.getElementById('privacy-switch').disabled = true;
        document.getElementById('map-title').readOnly = true;
        
        // Add view-only message
        const viewOnlyMsg = document.createElement('div');
        viewOnlyMsg.className = 'view-only-message';
        viewOnlyMsg.textContent = 'You are viewing someone else\'s map. Changes cannot be saved.';
        document.querySelector('.controls').appendChild(viewOnlyMsg);
        
        // Disable clicking on states
        if (statesLayer) {
            statesLayer.eachLayer(function(layer) {
                layer.off('click');
            });
        }
    }
    
    function generateShareLink() {
        const shareContainer = document.getElementById('share-container');
        const shareLinkInput = document.getElementById('share-link');
        const loginPrompt = document.getElementById('login-prompt');
        
        if (visitedStates.size === 0) {
            alert('Please select at least one state before sharing.');
            return;
        }
        
        if (!currentUser) {
            loginPrompt.style.display = 'block';
            showLoginModal();
            return;
        }
        
        // Save map first if needed
        if (!mapId) {
            saveMap().then(data => {
                const shareUrl = `${window.location.origin}${window.location.pathname}?mapId=${data.id}`;
                shareLinkInput.value = shareUrl;
                shareContainer.classList.add('active');
                loginPrompt.style.display = 'none';
            });
        } else {
            const shareUrl = `${window.location.origin}${window.location.pathname}?mapId=${mapId}`;
            shareLinkInput.value = shareUrl;
            shareContainer.classList.add('active');
            loginPrompt.style.display = 'none';
        }
    }
    
    function showSaveSuccess() {
        const successMsg = document.createElement('div');
        successMsg.className = 'save-success';
        successMsg.textContent = 'Map saved successfully!';
        document.querySelector('.controls').appendChild(successMsg);
        
        setTimeout(() => {
            successMsg.remove();
        }, 3000);
    }
    
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    function setupEventListeners(geoData) {
        // Reset button
        document.getElementById('reset-btn').addEventListener('click', function() {
            if (confirm('Are you sure you want to reset the map? This will clear all selected states.')) {
                visitedStates.clear();
                localStorage.setItem('travelMapCurrentStates', JSON.stringify([]));
                refreshMap(geoData);
            }
        });
        
        // Save button
        document.getElementById('save-btn').addEventListener('click', function() {
            saveMap();
        });
        
        // Share button
        document.getElementById('share-btn').addEventListener('click', function() {
            generateShareLink();
        });
        
        // Copy link button
        document.getElementById('copy-link-btn').addEventListener('click', function() {
            const shareLinkInput = document.getElementById('share-link');
            shareLinkInput.select();
            document.execCommand('copy');
            
            // Visual feedback
            const originalText = this.textContent;
            this.textContent = 'Copied!';
            setTimeout(() => {
                this.textContent = originalText;
            }, 2000);
        });
        
        // Privacy toggle
        document.getElementById('privacy-switch').addEventListener('change', function() {
            isPublic = this.checked;
            localStorage.setItem('travelMapIsPublic', isPublic.toString());
        });
        
        // Map title change
        document.getElementById('map-title').addEventListener('change', function() {
            localStorage.setItem('travelMapTitle', this.value);
        });
        
        // Login/Logout button
        document.getElementById('login-btn').addEventListener('click', function() {
            if (currentUser) {
                logout();
            } else {
                showEmailPrompt();
            }
        });
        
        // Maps dropdown change
        document.getElementById('maps-dropdown').addEventListener('change', function() {
            const selectedMapId = this.value;
            if (selectedMapId) {
                window.location.href = `${window.location.pathname}?mapId=${selectedMapId}`;
            }
        });
        
        // New Map button
        document.getElementById('new-map-btn').addEventListener('click', function() {
            window.location.href = window.location.pathname;
        });
        
        // Login form submission
        document.getElementById('email-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            showMagicLinkModal(email);
        });
        
        // Close modal button
        document.querySelector('.close-modal').addEventListener('click', closeLoginModal);
        
        // Close modal when clicking outside
        window.addEventListener('click', function(e) {
            if (e.target === document.getElementById('login-modal')) {
                closeLoginModal();
            }
        });
    }
    
    // Auth functions (simplified for localStorage)
    function login(email, password) {
        // Find user in localStorage
        const users = JSON.parse(localStorage.getItem('travelMapUsers') || '[]');
        const user = users.find(u => u.email === email && u.password === password);
        
        if (user) {
            currentUser = {
                id: user.id,
                email: user.email
            };
            localStorage.setItem('travelMapUser', JSON.stringify(currentUser));
            updateUIForUser(currentUser);
            closeLoginModal();
        } else {
            document.getElementById('login-error').textContent = 'Invalid email or password';
        }
    }
    
    function register(email, password) {
        // Check if user already exists
        const users = JSON.parse(localStorage.getItem('travelMapUsers') || '[]');
        if (users.some(u => u.email === email)) {
            document.getElementById('login-error').textContent = 'Email already exists';
            return;
        }
        
        // Create new user
        const newUser = {
            id: generateUUID(),
            email: email,
            password: password,
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        localStorage.setItem('travelMapUsers', JSON.stringify(users));
        
        // Auto-login
        currentUser = {
            id: newUser.id,
            email: newUser.email
        };
        localStorage.setItem('travelMapUser', JSON.stringify(currentUser));
        updateUIForUser(currentUser);
        closeLoginModal();
    }
    
    function logout() {
        currentUser = null;
        localStorage.removeItem('travelMapUser');
        updateUIForLogout();
    }
    
    function updateUIForUser(user) {
        document.getElementById('login-btn').textContent = 'Logout';
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('user-container').style.display = 'flex';
        document.getElementById('save-btn').disabled = false;
        
        // Load user's maps
        loadUserMaps();
    }
    
    function updateUIForLogout() {
        document.getElementById('login-btn').textContent = 'Login';
        document.getElementById('user-email').textContent = '';
        document.getElementById('user-container').style.display = 'none';
        document.getElementById('save-btn').disabled = true;
        document.getElementById('maps-dropdown').innerHTML = '<option value="">Select a saved map</option>';
    }
    
    function showLoginModal() {
        document.getElementById('login-modal').style.display = 'flex';
        document.getElementById('email').focus();
    }
    
    function closeLoginModal() {
        document.getElementById('login-modal').style.display = 'none';
        document.getElementById('login-error').textContent = '';
    }
    
    // Magic link login functions
    function loginWithToken(token) {
        // Find user with this token
        const users = JSON.parse(localStorage.getItem('travelMapUsers') || '[]');
        const user = users.find(u => u.loginToken === token);
        
        if (user) {
            // Token is valid, log the user in
            currentUser = {
                id: user.id,
                email: user.email
            };
            localStorage.setItem('travelMapUser', JSON.stringify(currentUser));
            updateUIForUser(currentUser);
            
            // Clear the used token for security
            user.loginToken = null;
            localStorage.setItem('travelMapUsers', JSON.stringify(users));
            
            showNotification('You have been logged in successfully!');
        }
    }
    
    function generateMagicLink(email) {
        // Check if email exists
        const users = JSON.parse(localStorage.getItem('travelMapUsers') || '[]');
        let user = users.find(u => u.email === email);
        
        // Create user if doesn't exist
        if (!user) {
            user = {
                id: generateUUID(),
                email: email,
                createdAt: new Date().toISOString()
            };
            users.push(user);
        }
        
        // Generate a login token
        user.loginToken = generateUUID();
        localStorage.setItem('travelMapUsers', JSON.stringify(users));
        
        // Create magic link
        const baseUrl = window.location.origin + window.location.pathname;
        const magicLink = `${baseUrl}?token=${user.loginToken}`;
        
        return magicLink;
    }
    
    function showMagicLinkModal(email) {
        const magicLink = generateMagicLink(email);
        
        // Create modal for displaying the magic link
        const modalHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h2>Your Magic Login Link</h2>
                <p>Use this link to log in to your account. Keep it safe and don't share it with others.</p>
                <div class="magic-link-container">
                    <input type="text" id="magic-link-input" value="${magicLink}" readonly>
                    <button id="copy-magic-link-btn">Copy</button>
                </div>
                <p class="magic-link-info">
                    <small>Bookmark this link to easily access your account in the future.</small>
                </p>
            </div>
        `;
        
        const modal = document.getElementById('login-modal');
        modal.innerHTML = modalHTML;
        modal.style.display = 'flex';
        
        // Add event listeners
        document.querySelector('.close-modal').addEventListener('click', closeLoginModal);
        document.getElementById('copy-magic-link-btn').addEventListener('click', function() {
            const linkInput = document.getElementById('magic-link-input');
            linkInput.select();
            document.execCommand('copy');
            this.textContent = 'Copied!';
            setTimeout(() => {
                this.textContent = 'Copy';
            }, 2000);
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeLoginModal();
            }
        });
    }
    
    function showEmailPrompt() {
        const modalHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h2>Login with Magic Link</h2>
                <p>Enter your email to receive a magic login link.</p>
                <form id="email-form">
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" required>
                    </div>
                    <button type="submit" id="get-link-btn">Get Magic Link</button>
                </form>
            </div>
        `;
        
        const modal = document.getElementById('login-modal');
        modal.innerHTML = modalHTML;
        modal.style.display = 'flex';
        
        // Add event listeners
        document.querySelector('.close-modal').addEventListener('click', closeLoginModal);
        
        document.getElementById('email-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            showMagicLinkModal(email);
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeLoginModal();
            }
        });
    }
    
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
});

function showFileProtocolError() {
    const errorBanner = document.createElement('div');
    errorBanner.className = 'server-error-banner';
    errorBanner.innerHTML = `
        <p><strong>File Protocol Error</strong></p>
        <p>This application cannot run directly from the file system due to browser security restrictions.</p>
        <p>Please use one of these options:</p>
        <ol>
            <li>Upload the files to a web server</li>
            <li>Use a local development server like Live Server in VS Code</li>
            <li>Open Chrome with security disabled (not recommended): 
                <code>chrome --allow-file-access-from-files</code>
            </li>
        </ol>
        <button class="close-banner">×</button>
    `;
    document.body.appendChild(errorBanner);
    
    document.querySelector('.close-banner').addEventListener('click', function() {
        errorBanner.remove();
    });
}
