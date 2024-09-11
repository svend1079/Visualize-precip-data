// Initialize variables
let currentApiUrl = '';
const climateApiUrl = 'https://dmigw.govcloud.dk/v2/climateData/collections/stationValue/items?api-key=3d060a77-29be-41ef-8b31-2c74dce37dbe&parameterId=acc_precip&timeResolution=hour&datetime=';
const observationsApiUrl = 'https://dmigw.govcloud.dk/v2/metObs/collections/observation/items?api-key=8f1fa25f-6bfe-442b-8ab1-9146209a1c23&datetime=';
let currentApiType = 'climate'; // Default to 'climate'

// Helper function to get the last whole hour
function getLastWholeHour() {
    const now = new Date();
    now.setMinutes(0, 0, 0); // Set minutes, seconds, and milliseconds to 0
    return now;
}

// Helper function to format the date into ISO format (for API use)
function formatDateToISO(date) {
    return date.toISOString().split('.')[0] + 'Z'; // Remove milliseconds for cleaner format
}

// Helper function to format date into "HH-MM" format
function formatTime(date) {
    const hours = date.getUTCHours().toString().padStart(2, '0');
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Helper function to format the date into "DD-MM-YYYY" format
function formatDate(date) {
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0'); // Months are 0-indexed
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
}

var map = new ol.Map({
    target: 'map', // Target the div with id 'map'
    layers: [
        // Add CartoDB Voyager basemap
        new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
            })
        })
    ],
    view: new ol.View({
        center: ol.proj.fromLonLat([12.4, 55.7]), // Center of the map (adjust as necessary)
        zoom: 10 // Zoom level
    }),
    controls: ol.control.defaults({
        attribution: false
    })
});

// Add an overlay for the popup
var popup = new ol.Overlay({
    element: document.getElementById('popup'),
    autoPan: true, // Make sure the popup pans into view if it's outside the viewport
    autoPanAnimation: {
        duration: 250,
    }
});
map.addOverlay(popup);

// Function to fetch and render GeoJSON data based on the current time
async function fetchGeoJSONData(time) {
    // Calculate the end time (one hour ahead of the current time)
    const endTime = new Date(time.getTime() + 3600 * 1000);
    const fromTime = formatDateToISO(time);
    const endTimeISO = formatDateToISO(endTime);

    // Determine the API URL based on the currentApiType
    const apiUrl = (currentApiType === 'climate') 
        ? `${climateApiUrl}${fromTime}/${fromTime}` 
        : `${observationsApiUrl}${endTimeISO}/${endTimeISO}&parameterId=precip_past1h`;

    console.log(apiUrl);

    try {
        let data = await fetch(apiUrl).then(response => response.json());

        const vectorSource = new ol.source.Vector({
            features: new ol.format.GeoJSON().readFeatures(data, {
                featureProjection: 'EPSG:3857' // Ensure the projection is Web Mercator
            })
        });

        const styleFunction = function (feature) {
            let value = feature.get('value');
            let formattedValue = value.toFixed(1);

            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 6,
                    fill: new ol.style.Fill({ color: 'rgb(135,206,250)' }),
                    stroke: new ol.style.Stroke({
                        color: 'rgb(65,105,225)',
                        width: 2
                    })
                }),
                text: new ol.style.Text({
                    font: '16px Calibri,sans-serif',
                    text: formattedValue, // Display the value above the point
                    offsetY: -15, // Position the label above the point
                    fill: new ol.style.Fill({ color: 'black' }),
                    stroke: new ol.style.Stroke({ color: 'white', width: 2 })
                })
            });
        };

        // Remove previous layer if exists
        const layers = map.getLayers().getArray();
        if (layers.length > 1) {
            map.removeLayer(layers[layers.length - 1]);
        }

        const vectorLayer = new ol.layer.Vector({
            source: vectorSource,
            style: styleFunction // Apply the style function to each feature
        });

        map.addLayer(vectorLayer); // Add the vector layer to the map

    } catch (error) {
        console.error('Error fetching or displaying data:', error);
    }
}

// Set up the slider and time logic
const lastWholeHour = getLastWholeHour();
document.getElementById('timeSlider').addEventListener('input', function () {
    const sliderValue = parseInt(this.value);
    const adjustedTime = new Date(lastWholeHour.getTime() + sliderValue * 3600 * 1000);

    // Create a new Date object for one hour ahead
    const endTime = new Date(adjustedTime.getTime() + 3600 * 1000);

    // Format times and date
    const startTimeFormatted = formatTime(adjustedTime);
    const endTimeFormatted = formatTime(endTime);
    const dateFormatted = formatDate(adjustedTime);

    // Update the label to show the time range above the date
    document.getElementById('timeLabel').innerHTML = `${startTimeFormatted} - ${endTimeFormatted}<br>${dateFormatted}`;

    // Fetch and update the map data based on the slider time
    fetchGeoJSONData(adjustedTime); // Always use currentApiUrl
});

// Initial call to fetch data for the current time (last whole hour) using the initial API
const startTimeFormatted = formatTime(lastWholeHour);
const endTimeFormatted = formatTime(new Date(lastWholeHour.getTime() + 3600 * 1000));
const dateFormatted = formatDate(lastWholeHour);
document.getElementById('timeLabel').innerHTML = `${startTimeFormatted} - ${endTimeFormatted}<br>${dateFormatted}`;
fetchGeoJSONData(lastWholeHour); // Always use currentApiUrl

// Global variable to keep track of the chart instance
let chartInstance = null;

// Function to fetch data for the last 24 hours and render a bar chart
async function fetchAndDisplayChart(stationId) {
    const now = new Date();
    const fromTime = new Date(now.getTime() - 24 * 3600 * 1000); // 24 hours ago
    const fromTimeISO = formatDateToISO(fromTime);
    const nowISO = formatDateToISO(now);

    const apiUrl = `${climateApiUrl}${fromTimeISO}/${nowISO}&stationId=${stationId}`;

    try {
        const response = await fetch(apiUrl);
        const data = await response.json();

        const values = data.features.map(feature => feature.properties.value).reverse();
        const labels = data.features.map(feature => new Date(feature.properties.from).toISOString().substring(11, 16)).reverse(); // Extract time in "HH:MM"
        const dateLabel = data.features.map(feature => new Date(feature.properties.from).toISOString()).reverse()
        // Set the popup content first (with canvas)
        document.getElementById('popup-content').innerHTML = `
        <strong>Station ID: ${stationId}</strong>
        <canvas id="chart" width="400" height="200"></canvas>
        <img id="downloadCsv" src="download.png" alt="Download CSV" style="position: absolute; top: 10px; right: 10px; cursor: pointer;" />
    `;
        console.log(apiUrl)
        console.log(lastWholeHour)
        // If there's an existing chart instance, destroy it before creating a new one
        if (chartInstance) {
            chartInstance.destroy();
        }

        // After setting the popup content, initialize the chart
        var ctx = document.getElementById('chart').getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Precipitation (mm)',
                    data: values,
                    backgroundColor: 'rgba(0,191,255, 0.2)',
                    borderColor: 'rgba(65,105,225, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
        document.getElementById('downloadCsv').addEventListener('click', function () {
            downloadCSV(dateLabel, values);
        });
    } catch (error) {
        console.error('Error fetching or displaying chart:', error);
    }
}

// Click event to display the popup with stationId and bar chart
map.on('click', function (evt) {
    var feature = map.forEachFeatureAtPixel(evt.pixel, function (feature) {
        return feature;
    });

    if (feature) {
        var stationId = feature.get('stationId'); // Assuming 'stationId' is the property name
        var coordinate = evt.coordinate;

        // Set the popup content and show it at the clicked coordinate
        var popupContent = document.getElementById('popup-content');
        popup.setPosition(coordinate);

        // Fetch and display the chart for the selected station
        fetchAndDisplayChart(stationId);
    } else {
        popup.setPosition(undefined); // Hide popup if no feature is clicked
    }
});

// Set up button click handlers
document.getElementById('climateButton').addEventListener('click', function () {
    currentApiType = 'climate';
    this.classList.add('active');
    document.getElementById('observationsButton').classList.remove('active');
    fetchGeoJSONData(lastWholeHour); // Fetch data using the climate API
});

document.getElementById('observationsButton').addEventListener('click', function () {
    currentApiType = 'observations';
    this.classList.add('active');
    document.getElementById('climateButton').classList.remove('active');
    fetchGeoJSONData(lastWholeHour); // Fetch data using the observations API
});

function convertToCSV(labels, data) {
    const header = 'Time,Precipitation (mm)\n';
    const rows = labels.map((label, index) => `${label},${data[index]}`).join('\n');
    return header + rows;
}

function downloadCSV(labels, data) {
    const csv = convertToCSV(labels, data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'precipitation_data.csv';
    a.click();
    
    URL.revokeObjectURL(url); // Clean up the URL object
}