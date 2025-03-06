document.addEventListener('DOMContentLoaded', function() {
    // Initialize map centered on US
    const map = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: true,
        dragging: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        touchZoom: true
    }).setView([37.8, -96], 4);

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Get map ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const mapId = urlParams.get('mapId');
    
    if (!mapId) {
        showError("No map ID provided. Please check your link.");
        return;
    }
    
    // Load map data from localStorage
    const allMaps = JSON.parse(localStorage.getItem('travelMapAllMaps') || '[]');
    const mapData = allMaps.find(m => m.id === mapId);
    
    if (!mapData) {
        showError("Map not found or has been deleted.");
        return;
    }
    
    if (!mapData.isPublic) {
        showError("This map is private and cannot be viewed.");
        return;
    }
    
    // Set map title and creator
    document.getElementById('map-title').textContent = mapData.title || "Shared Travel Map";
    document.title = (mapData.title || "Shared Travel Map") + " - US Travel Map";
    document.getElementById('creator-name').textContent = mapData.userEmail || "Anonymous";
    
    // Load GeoJSON data and display map
    fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json')
        .then(response => response.json())
        .then(data => {
            const visitedStates = new Set(mapData.states || []);
            
            // Add GeoJSON layer with styling
            L.geoJSON(data, {
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
                    layer.bindPopup(stateName);
                }
            }).addTo(map);
            
            updateStats(visitedStates, data.features);
        })
        .catch(error => {
            console.error('Error loading GeoJSON data:', error);
            showError('Failed to load map data. Please try again later.');
        });
    
    // Function to update stats
    function updateStats(visitedStates, stateFeatures) {
        const statesCount = visitedStates.size;
        const percentage = Math.round((statesCount / 50) * 100);
        
        document.getElementById('states-count').textContent = statesCount;
        document.getElementById('percentage').textContent = `${percentage}%`;
        
        // Populate visited states list
        const statesList = document.getElementById('visited-states-list');
        statesList.innerHTML = '';
        
        if (statesCount === 0) {
            const listItem = document.createElement('li');
            listItem.textContent = 'No states visited yet';
            statesList.appendChild(listItem);
            return;
        }
        
        // Sort states alphabetically
        const sortedStates = Array.from(visitedStates).sort();
        
        // Add each state to the list
        sortedStates.forEach(stateName => {
            const listItem = document.createElement('li');
            listItem.textContent = stateName;
            statesList.appendChild(listItem);
        });
    }
    
    // Function to show error message
    function showError(message) {
        const container = document.querySelector('.container');
        container.innerHTML = `
            <div class="error-container">
                <h2>Error</h2>
                <p>${message}</p>
                <a href="index.html" class="create-own-btn">Go to Map Creator</a>
            </div>
        `;
    }
}); 