// dashboard.js - Nestlé SKU Inventory Dashboard

// Initialize socket connection
const socket = io();

// Global state
let currentPage = 1;
const pageSize = 10;
let totalEvents = 0;
let events = [];
let skuData = {};
let isFeedbackPending = false;
let lastUploadedEventId = null;

// Charts references
let mainChart = null;
let marketShareChart = null;
let dailyCountChart = null;

// DOM elements
const eventsTableBody = document.getElementById('eventsTableBody');
const paginationInfo = document.getElementById('paginationInfo');
const startCount = document.getElementById('startCount');
const endCount = document.getElementById('endCount');
const totalCount = document.getElementById('totalCount');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const eventDetailModal = document.getElementById('eventDetailModal');
const closeModalBtn = document.getElementById('closeModal');
const dateRangeDisplay = document.getElementById('dateRangeDisplay');
const selectedDateDisplay = document.getElementById('selectedDate');

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
    
    // Pagination controls
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchEvents();
        }
    });
    
    nextPageBtn.addEventListener('click', () => {
        if (currentPage * pageSize < totalEvents) {
            currentPage++;
            fetchEvents();
        }
    });
    
    // Modal close button
    closeModalBtn.addEventListener('click', () => {
        eventDetailModal.classList.add('hidden');
    });
    
    // Date selectors
    document.getElementById('dateSelector').addEventListener('click', () => {
        // For now, display today's date
        const today = new Date();
        selectedDateDisplay.textContent = `${today.toLocaleString('default', { month: 'short' })} ${today.getDate()}`;
    });
    
    // Navigation for daily count chart
    document.getElementById('prevDay').addEventListener('click', () => {
        // Would shift the date range back
        console.log("Previous day range");
    });
    
    document.getElementById('nextDay').addEventListener('click', () => {
        // Would shift the date range forward
        console.log("Next day range");
    });
});

// Socket event listeners
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('new_detection', async (data) => {
    // Format timestamp
    const timestamp = new Date(data.timestamp).toLocaleString();
    
    // Create toast message with image path check
    const imagePath = data.image_path ? `/${data.image_path}` : '/static/placeholder.png';
    
    const message = `
        <div class="flex items-start space-x-4">
            <div class="flex-1">
                <div class="font-medium text-gray-900">New Detection</div>
                <div class="text-sm text-gray-600">Device: ${data.device_id}</div>
                <div class="text-sm mt-1">
                    <span class="text-blue-600">Nestlé: ${data.nestle_count}</span> | 
                    <span class="text-red-600">Competitor: ${data.competitor_count}</span>
                </div>
                <div class="text-xs text-gray-500 mt-1">${timestamp}</div>
            </div>
            ${data.image_path ? `
            <div class="flex-shrink-0">
                <img src="${imagePath}" 
                     alt="Detection" 
                     onerror="this.src='/static/placeholder.png'"
                     class="h-16 w-16 object-cover rounded shadow">
            </div>
            ` : ''}
        </div>
    `;
    
    showToastNotification(message);
    
    // Update dashboard data
    await fetchDashboardData();
    currentPage = 1;
    await fetchEvents();
});

// Initialize the dashboard
function initializeDashboard() {
    fetchDashboardData().then(() => {
        initializeChart();
        fetchEvents();
        startAutoRefresh();
    });
}

// Show toast notification
function showToastNotification(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = message;
    
    document.body.appendChild(toast);
    
    // Show with animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 5000);
}

// Fetch dashboard data from server
async function fetchDashboardData() {
    try {
        const response = await fetch('/api/dashboard_data');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        skuData = data;
        
        updateDateRange();
        renderMainChart();
        renderMarketShareChart();
        renderDailyCountChart();
        updateStatisticsCards();
        
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
    }
}

// Function to get IQI color class
function getIQIColorClass(iqi) {
    if (iqi >= 80) return 'bg-green-100 text-green-800'; // Excellent quality
    if (iqi >= 60) return 'bg-blue-100 text-blue-800';   // Good quality
    if (iqi >= 40) return 'bg-yellow-100 text-yellow-800'; // Fair quality
    return 'bg-red-100 text-red-800';                    // Poor quality
}

// Function to get IQI quality text
function getIQIQualityText(iqi) {
    if (iqi >= 80) return 'Excellent quality';
    if (iqi >= 60) return 'Good quality';
    if (iqi >= 40) return 'Fair quality';
    return 'Poor quality';
}

// Function to render events table
function renderEventsTable() {
    eventsTableBody.innerHTML = '';
    
    if (!events || !events.length) {
        eventsTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="px-4 py-4 text-center text-gray-500">
                    No detection events found
                </td>
            </tr>
        `;
        return;
    }

    // Filter events - show all old events but new events need feedback
    const filteredEvents = events.filter(event => {
        // If it's the latest event (first in array)
        if (event === events[0]) {
            return event.nestle_feedback === 'Approved' || event.nestle_feedback === 'Needs Improvement';
        }
        // Show all previous events
        return true;
    });

    if (!filteredEvents.length) {
        eventsTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="px-4 py-4 text-center text-gray-500">
                    No events found
                </td>
            </tr>
        `;
        return;
    }

    // Update the Nestlé Products column header with static count
    const nestleHeader = document.querySelector('th[data-column="nestle"]') || 
                        document.querySelector('th:nth-child(5)') ||
                        document.querySelector('th:contains("NESTLÉ")');
    if (nestleHeader) {
        nestleHeader.textContent = 'NESTLÉ PRODUCTS(10)';
    }
    
    filteredEvents.forEach(event => {
        const row = document.createElement('tr');
        
        // Get counts directly from event data
        const nestleCount = event.nestle_count || 0;
        const compCount = event.competitor_count || 0;
        const total = nestleCount + compCount;
        const nestlePercentage = total > 0 ? Math.round((nestleCount / total) * 100) : 0;
        const compPercentage = total > 0 ? Math.round((compCount / total) * 100) : 0;
        const iqiScore = event.iqi_score || 0;
        const iqiColorClass = getIQIColorClass(iqiScore);
        const iqiQualityText = getIQIQualityText(iqiScore);
        const feedback = event.nestle_feedback || '-';
        
        row.innerHTML = `
            <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900">#${event.id}</td>
            <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${event.device_id}</td>
            <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(event.timestamp)}</td>
            <td class="px-4 py-4 whitespace-nowrap text-sm">
                <span class="font-medium text-gray-900">${iqiScore}</span>
                <span class="ml-2 px-2 py-1 text-xs font-medium ${iqiColorClass} rounded-full">${iqiQualityText}</span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm">
                <span class="font-medium text-gray-900">${nestleCount}</span>
                <span class="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">${nestlePercentage}%</span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm">
                <span class="font-medium text-gray-900">${compCount}</span>
                <span class="ml-2 px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">${compPercentage}%</span>
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-500" id="feedback-${event.id}">
                ${feedback}
            </td>
            <td class="px-4 py-4 whitespace-nowrap text-sm text-blue-600 hover:text-blue-800">
                <div class="flex space-x-2">
                    <button onclick="viewEventDetails(${event.id})" class="text-blue-600 hover:text-blue-800">View</button>
                    <a href="/download/${event.image_path ? event.image_path.split('/').pop() : ''}" class="text-gray-600 hover:text-gray-800">Download</a>
                </div>
            </td>
        `;
        eventsTableBody.appendChild(row);
    });
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(totalEvents / pageSize);
    
    // Update pagination info
    if (startCount) startCount.textContent = totalEvents > 0 ? ((currentPage - 1) * pageSize) + 1 : 0;
    if (endCount) endCount.textContent = Math.min(currentPage * pageSize, totalEvents);
    if (totalCount) totalCount.textContent = totalEvents;
    
    // Update button states
    if (prevPageBtn) {
        prevPageBtn.disabled = currentPage <= 1;
        prevPageBtn.classList.toggle('opacity-50', currentPage <= 1);
    }
    if (nextPageBtn) {
        nextPageBtn.disabled = currentPage >= totalPages;
        nextPageBtn.classList.toggle('opacity-50', currentPage >= totalPages);
    }
    
    // If current page is beyond total pages, reset to first page
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = 1;
        fetchEvents();
    }
}

// Function to view event details
async function viewEventDetails(eventId) {
    try {
        const response = await fetch(`/api/events/${eventId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch event details');
        }
        
        const data = await response.json();
        
        // Update modal event info
        document.getElementById('modalEventInfo').textContent = `Event #${data.id} | Device: ${data.device_id}`;
        
        // Calculate total Nestlé products from products data
        let nestleTotal = 0;
        if (data.products && data.products.nestle_products) {
            nestleTotal = Object.values(data.products.nestle_products).reduce((sum, count) => sum + count, 0);
        }
        data.nestleCount = nestleTotal;

        // Calculate total competitor products
        let compTotal = 0;
        if (data.products && data.products.competitor_products) {
            if (Array.isArray(data.products.competitor_products)) {
                compTotal = data.products.competitor_products.length;
            } else if (typeof data.products.competitor_products === 'object') {
                compTotal = Object.values(data.products.competitor_products).reduce((sum, count) => sum + count, 0);
            }
        }
        data.compCount = compTotal;
        
        // Calculate percentages
        const total = data.nestleCount + data.compCount;
        const nestlePercent = total > 0 ? Math.round((data.nestleCount / total) * 100) : 0;
        const compPercent = total > 0 ? Math.round((data.compCount / total) * 100) : 0;

        // Update counts with percentages
        const nestleCountElement = document.getElementById('modalNestleCount');
        const compCountElement = document.getElementById('modalCompCount');
        const timestampElement = document.getElementById('modalTimestamp');
        
        nestleCountElement.innerHTML = `
            ${data.nestleCount}
            <span class="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                ${nestlePercent}%
            </span>
        `;
        
        compCountElement.innerHTML = `
            ${data.compCount}
            <span class="ml-2 px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                ${compPercent}%
            </span>
        `;

        // Update the event in the events array with the new counts
        const eventIndex = events.findIndex(e => e.id === eventId);
        if (eventIndex !== -1) {
            events[eventIndex].nestle_count = data.nestleCount;
            events[eventIndex].competitor_count = data.compCount;
            renderEventsTable();
        }

        timestampElement.textContent = formatDate(data.timestamp);

        // Add IQI score display
        const iqiScore = data.iqi_score || 0;
        const iqiColorClass = getIQIColorClass(iqiScore);
        const iqiQualityText = getIQIQualityText(iqiScore);
        const iqiElement = document.getElementById('modalIQI');
        if (iqiElement) {
            iqiElement.innerHTML = `
                <div class="text-sm text-gray-500 mb-1">Image Quality Index (IQI)</div>
                <div class="font-semibold text-gray-800 text-xl flex items-center">
                    ${Math.round(iqiScore)}
                    <span class="ml-2 px-2 py-1 text-xs font-medium ${iqiColorClass} rounded-full">
                        ${iqiQualityText}
                    </span>
                </div>
            `;
        }
        
        // Update product breakdown
        const detectedProducts = document.getElementById('detectedProducts');
        detectedProducts.innerHTML = '';
        if (data.products && (data.products.nestle_products || data.products.competitor_products)) {
            // Add Nestle products
            if (data.products.nestle_products && Object.keys(data.products.nestle_products).length > 0) {
                const nestleSection = document.createElement('div');
                nestleSection.innerHTML = `
                    <div class="font-medium text-blue-700 mb-2">Nestlé Products:</div>
                    ${Object.entries(data.products.nestle_products).map(([product, count]) => `
                        <div class="flex justify-between items-center text-sm pl-2 mb-1">
                            <span class="text-gray-700">${product}</span>
                            <span class="font-medium bg-blue-50 px-2 py-1 rounded">${count}</span>
                        </div>
                    `).join('')}
                `;
                detectedProducts.appendChild(nestleSection);
            }
        
            // Add Competitor products
            if (data.products.competitor_products) {
                if (detectedProducts.children.length > 1) { // > 1 because we already added accuracy buttons
                    detectedProducts.appendChild(document.createElement('hr'));
                }
                
                const compSection = document.createElement('div');
                compSection.innerHTML = `<div class="font-medium text-red-700 mt-4 mb-2">Uncategorised Products:</div>`;
                
                if (Array.isArray(data.products.competitor_products) || 
                    Object.keys(data.products.competitor_products).every(key => !isNaN(parseInt(key)))) {
                    const count = Array.isArray(data.products.competitor_products) ? 
                        data.products.competitor_products.length : 
                        Object.keys(data.products.competitor_products).length;
                        
                    compSection.innerHTML += `
                        <div class="flex justify-between items-center text-sm pl-2 mb-1">
                            <span class="text-gray-700">unclassified</span>
                            <span class="font-medium bg-red-50 px-2 py-1 rounded">${count}</span>
                        </div>
                    `;
                } else {
                    Object.entries(data.products.competitor_products).forEach(([product, count]) => {
                        compSection.innerHTML += `
                            <div class="flex justify-between items-center text-sm pl-2 mb-1">
                                <span class="text-gray-700">${product}</span>
                                <span class="font-medium bg-red-50 px-2 py-1 rounded">${count}</span>
                            </div>
                        `;
                    });
                }
                
                detectedProducts.appendChild(compSection);
            }
        } else {
            detectedProducts.innerHTML = '<div class="text-sm text-gray-500">No detailed product data available</div>';
        }

        // Update image
        const eventImage = document.querySelector('#eventImage img');
        if (data.image_path) {
            eventImage.src = '/' + data.image_path;
            eventImage.classList.remove('hidden');
        } else {
            eventImage.classList.add('hidden');
        }

        // Show modal
        document.getElementById('eventDetailModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error viewing event details:', error);
        showToastNotification('Error loading event details');
    }
}

// Add auto-refresh functionality
function startAutoRefresh() {
    // Refresh every 30 seconds
    setInterval(async () => {
        await fetchDashboardData();
        if (currentPage === 1) {
            await fetchEvents();
        }
    }, 30000); // 30 seconds
}

// Fetch event data from server
async function fetchEvents() {
    try {
        let url = `/api/events?page=${currentPage}&limit=${pageSize}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Fetched events:', data); // Debug log
        
        if (!data || !data.data) {
            throw new Error('Invalid data format received from server');
        }
        
        // Map the data to ensure consistent property names and correct counts
        events = await Promise.all(data.data.map(async event => {
            try {
                // Fetch detailed data for each event
                const detailResponse = await fetch(`/api/events/${event.id}`);
                if (!detailResponse.ok) {
                    throw new Error(`HTTP error! status: ${detailResponse.status}`);
                }
                const detailData = await detailResponse.json();
                
                // Calculate counts from products data if available
                let nestleCount = 0;
                let compCount = 0;
                
                if (detailData.products) {
                    if (detailData.products.nestle_products) {
                        nestleCount = Object.values(detailData.products.nestle_products)
                            .reduce((sum, count) => sum + count, 0);
                    }
                    
                    if (detailData.products.competitor_products) {
                        if (Array.isArray(detailData.products.competitor_products)) {
                            compCount = detailData.products.competitor_products.length;
                        } else {
                            compCount = Object.values(detailData.products.competitor_products)
                                .reduce((sum, count) => sum + count, 0);
                        }
                    }
                }
                
                // Check if this is a new event (within last 5 minutes)
                const eventTime = new Date(event.timestamp).getTime();
                const currentTime = new Date().getTime();
                const isNewEvent = (currentTime - eventTime) <= 5 * 60 * 1000; // 5 minutes in milliseconds
                
                return {
                    ...event,
                    ...detailData,
                    nestle_count: nestleCount || detailData.nestle_count || event.nestle_count || 0,
                    competitor_count: compCount || detailData.competitor_count || event.competitor_count || 0,
                    iqi_score: detailData.iqi_score || event.iqi_score || 0,
                    isNewEvent: isNewEvent
                };
            } catch (error) {
                console.error(`Error fetching details for event ${event.id}:`, error);
                return {
                    ...event,
                    nestle_count: event.nestle_count || 0,
                    competitor_count: event.competitor_count || 0,
                    iqi_score: event.iqi_score || 0,
                    isNewEvent: false
                };
            }
        }));
        
        // Filter events - only filter out new events that need feedback
        const filteredEvents = events.filter(event => {
            if (event.isNewEvent) {
                return event.nestle_feedback === 'Approved' || event.nestle_feedback === 'Needs Improvement';
            }
            return true;
        });
        
        totalEvents = data.pagination ? data.pagination.total : events.length;
        
        // Adjust total events count based on filtered new events
        const newEventsWithoutFeedback = events.filter(event => 
            event.isNewEvent && !event.nestle_feedback
        ).length;
        totalEvents -= newEventsWithoutFeedback;
        
        renderEventsTable();
        updatePagination();
        
        // Update the showing count text
        const showingText = document.querySelector('.text-gray-500');
        if (showingText) {
            if (totalEvents > 0) {
                const start = ((currentPage - 1) * pageSize) + 1;
                const end = Math.min(currentPage * pageSize, totalEvents);
                showingText.textContent = `Showing ${start} to ${end} of ${totalEvents} events`;
            } else {
                showingText.textContent = 'No events found';
            }
        }
        
    } catch (error) {
        console.error("Error fetching events:", error);
        eventsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-4 py-4 text-center text-red-500">
                    Error loading detection events: ${error.message}
                </td>
            </tr>
        `;
    }
}

// Update date range displays
function updateDateRange() {
    try {
        if (skuData.daily_data && skuData.daily_data.dates) {
            const firstDate = skuData.daily_data.dates[0];
            const lastDate = skuData.daily_data.dates[skuData.daily_data.dates.length - 1];
            
            // Safely update dateRangeDisplay
            const dateRangeElement = document.getElementById('dateRangeDisplay');
            if (dateRangeElement) {
                dateRangeElement.textContent = `${firstDate} - ${lastDate}`;
            }
            
            // Safely update dailyDateRange
            const dailyDateRangeElement = document.getElementById('dailyDateRange');
            if (dailyDateRangeElement) {
                dailyDateRangeElement.textContent = `${firstDate} - ${lastDate}`;
            }
            
            // Safely update selectedDateDisplay
            const selectedDateElement = document.getElementById('selectedDate');
            if (selectedDateElement) {
                selectedDateElement.textContent = formatShortDate(lastDate);
            }
        }
    } catch (error) {
        console.error('Error updating date range:', error);
        // Continue execution even if date range update fails
    }
}

// Helper to format date as "Feb 20"
function formatShortDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
}

// Render main chart comparing Nestlé vs Competitor products over time
function renderMainChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (mainChart) {
        mainChart.destroy();
    }
    
    // Prepare data
    let labels = [];
    let nestleData = [];
    let competitorData = [];
    
    if (skuData.daily_data) {
        labels = skuData.daily_data.dates || [];
        nestleData = skuData.daily_data.nestle_values || Array(labels.length).fill(0);
        competitorData = skuData.daily_data.competitor_values || Array(labels.length).fill(0);
    }
    
    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Nestlé',
                    data: nestleData,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Competitor',
                    data: competitorData,
                    borderColor: '#EF4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 750
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    padding: 10,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    titleColor: '#000',
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyColor: '#666',
                    bodyFont: {
                        size: 13
                    },
                    borderColor: '#ddd',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 12
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 12
                        },
                        stepSize: 1 // Force integer steps
                    }
                }
            }
        }
    });
}

// Render market share chart
function renderMarketShareChart() {
    const ctx = document.getElementById('marketShareChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (marketShareChart) {
        marketShareChart.destroy();
    }
    
    // Calculate total products for both Nestle and Competitor
    let totalNestle = 0;
    let totalCompetitor = 0;
    
    if (skuData.daily_data) {
        totalNestle = skuData.daily_data.nestle_values.reduce((sum, value) => sum + value, 0);
        totalCompetitor = skuData.daily_data.competitor_values.reduce((sum, value) => sum + value, 0);
    }
    
    const total = totalNestle + totalCompetitor;
    const nestlePercentage = total > 0 ? Math.round((totalNestle / total) * 100) : 0;
    const competitorPercentage = total > 0 ? Math.round((totalCompetitor / total) * 100) : 0;

    marketShareChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Nestlé', 'Competitor'],
            datasets: [{
                data: [totalNestle, totalCompetitor],
                backgroundColor: ['#3B82F6', '#EF4444'],
                borderWidth: 0,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            return data.labels.map((label, i) => ({
                                text: `${label} ${i === 0 ? nestlePercentage : competitorPercentage}%`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                strokeStyle: data.datasets[0].backgroundColor[i],
                                pointStyle: 'circle',
                                index: i
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = context.dataIndex === 0 ? nestlePercentage : competitorPercentage;
                            return `${context.label}: ${percentage}%`;
                        }
                    }
                }
            }
        }
    });
}

// Render daily count chart
function renderDailyCountChart() {
    const ctx = document.getElementById('dailyCountChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (dailyCountChart) {
        dailyCountChart.destroy();
    }
    
    // Prepare data - combine Nestle and Competitor values
    let labels = [];
    let totalData = [];
    
    if (skuData.daily_data) {
        labels = skuData.daily_data.dates || [];
        totalData = skuData.daily_data.dates.map((_, index) => {
            const nestleValue = skuData.daily_data.nestle_values[index] || 0;
            const competitorValue = skuData.daily_data.competitor_values[index] || 0;
            return nestleValue + competitorValue;
        });
    }
    
    dailyCountChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Products',
                data: totalData,
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                borderColor: 'rgb(99, 102, 241)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Total Products: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Update statistics cards with real data
function updateStatisticsCards() {
    if (skuData.nestle) {
        // Update Nestlé statistics
        const nestleElements = document.querySelectorAll('.card:nth-child(1) .text-3xl');
        if (nestleElements.length >= 3) {
            nestleElements[0].textContent = skuData.nestle.max.count || 0;
            nestleElements[1].textContent = skuData.nestle.avg.count || 0;
            nestleElements[2].textContent = skuData.nestle.min.count || 0;
        }
        
        const nestleDates = document.querySelectorAll('.card:nth-child(1) .font-medium.text-gray-800');
        if (nestleDates.length >= 3) {
            nestleDates[0].textContent = skuData.nestle.max.date || '';
            nestleDates[1].textContent = skuData.nestle.avg.period || 'Last 7 days';
            nestleDates[2].textContent = skuData.nestle.min.date || '';
        }
    }
    
    if (skuData.competitor) {
        // Update Competitor statistics
        const compElements = document.querySelectorAll('.card:nth-child(2) .text-3xl');
        if (compElements.length >= 3) {
            compElements[0].textContent = skuData.competitor.max.count || 0;
            compElements[1].textContent = skuData.competitor.avg.count || 0;
            compElements[2].textContent = skuData.competitor.min.count || 0;
        }
        
        const compDates = document.querySelectorAll('.card:nth-child(2) .font-medium.text-gray-800');
        if (compDates.length >= 3) {
            compDates[0].textContent = skuData.competitor.max.date || '';
            compDates[1].textContent = skuData.competitor.avg.period || 'Last 7 days';
            compDates[2].textContent = skuData.competitor.min.date || '';
        }
    }
    
    // Update Top 3 Nestlé SKUs
    if (skuData.top_products && skuData.top_products.length > 0) {
        const topProductsCards = document.querySelector('.card .flex.justify-around');
        if (topProductsCards) {
            const productElements = topProductsCards.querySelectorAll('.flex.flex-col.items-center');
            
            // Get max count for scaling
            const maxCount = Math.max(...skuData.top_products.map(p => p.count || 0));
            
            skuData.top_products.forEach((product, index) => {
                if (index < productElements.length) {
                    const countElement = productElements[index].querySelector('.text-sm.font-medium');
                    const barElement = productElements[index].querySelector('.w-12');
                    const nameElement = productElements[index].querySelector('.mt-2');
                    
                    if (countElement) countElement.textContent = product.count || 0;
                    if (nameElement) nameElement.textContent = product.name || `Product ${index + 1}`;
                    
                    // Scale the bar height (max height = 168px)
                    if (barElement) {
                        const height = maxCount > 0 ? Math.round((product.count / maxCount) * 168) : 0;
                        barElement.style.height = `${Math.max(height, 10)}px`;
                    }
                }
            });
        }
    }
    
    // Update market share percentages in the legend
    if (skuData.market_share && skuData.market_share.values) {
        const nestleShare = skuData.market_share.values[0] || 50;
        const competitorShare = skuData.market_share.values[1] || 50;
        
        const marketShareLegend = document.querySelector('.flex.justify-center.space-x-10');
        if (marketShareLegend) {
            const percents = marketShareLegend.querySelectorAll('.block.text-sm.text-gray-500');
            if (percents.length >= 2) {
                percents[0].textContent = `${nestleShare}%`;
                percents[1].textContent = `${competitorShare}%`;
            }
        }
    }
}

// Add warning popup function
function showFeedbackWarning() {
    return new Promise((resolve) => {
        const warningModal = document.createElement('div');
        warningModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        warningModal.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
                <h3 class="text-lg font-medium text-red-600 mb-4">Feedback Required</h3>
                <p class="text-gray-600 mb-6">Please provide feedback (Approved or Needs Improvement) for the latest detection before proceeding.</p>
                <div class="flex justify-end">
                    <button class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600" onclick="this.closest('.fixed').remove(); resolve(false);">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(warningModal);
    });
}

// Modify the image upload handler
document.getElementById('imageInput').addEventListener('change', async (e) => {
    if (isFeedbackPending) {
        const shouldProceed = await showFeedbackWarning();
        if (!shouldProceed) {
            e.target.value = ''; // Clear the file input
            return;
        }
    }
    
    const file = e.target.files[0];
    if (!file) return;
    
    const uploadStatus = document.getElementById('uploadStatus');
    const detectionResults = document.getElementById('detectionResults');
    
    uploadStatus.textContent = 'Processing image...';
    uploadStatus.classList.remove('text-red-500', 'text-green-500');
    uploadStatus.classList.add('text-gray-500');
    
    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch('/check_image', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to process image');
        }

        const result = await response.json();
        isFeedbackPending = true;
        lastUploadedEventId = result.id;
        
        // Add accuracy status buttons with the correct event ID
        const accuracyButtons = document.createElement('div');
        accuracyButtons.className = 'flex justify-center space-x-4 mb-4';
        accuracyButtons.innerHTML = `
            <button onclick="handleFeedback(${result.id}, 'Approved')" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50">
                Approved (>80% accuracy)
            </button>
            <button onclick="handleFeedback(${result.id}, 'Needs Improvement')" class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50">
                Needs Improvement (<80% accuracy)
            </button>
        `;
        
        // Clear previous buttons if they exist
        detectionResults.querySelectorAll('.flex.justify-center.space-x-4.mb-4').forEach(el => el.remove());
        detectionResults.insertBefore(accuracyButtons, detectionResults.firstChild);
        
        // Update counts
        document.getElementById('nestleCount').textContent = result.total_nestle;
        document.getElementById('competitorCount').textContent = result.total_competitor;
        
        // Update product breakdown
        const productList = document.getElementById('productList');
        productList.innerHTML = '';

        // Show Nestlé products (from Roboflow)
        if (Object.keys(result.nestle_products).length > 0) {
            const nestleHeader = document.createElement('div');
            nestleHeader.className = 'font-medium text-blue-700 mb-2';
            nestleHeader.textContent = 'Nestlé Products:';
            productList.appendChild(nestleHeader);
            
            Object.entries(result.nestle_products).forEach(([product, count]) => {
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center text-sm pl-2 mb-1';
                item.innerHTML = `
                    <span class="text-gray-700">${product}</span>
                    <span class="font-medium bg-blue-50 px-2 py-1 rounded">${count}</span>
                `;
                productList.appendChild(item);
            });
        }

        // Show Competitor products (from DINO-X)
        if (Object.keys(result.competitor_products).length > 0) {
            if (productList.children.length > 0) {
                productList.appendChild(document.createElement('hr'));
            }
            
            const compHeader = document.createElement('div');
            compHeader.className = 'font-medium text-red-700 mt-4 mb-2';
            compHeader.textContent = 'Uncategorised Products:';
            productList.appendChild(compHeader);
            
            Object.entries(result.competitor_products).forEach(([product, count]) => {
                const item = document.createElement('div');
                item.className = 'flex justify-between items-center text-sm pl-2 mb-1';
                item.innerHTML = `
                    <span class="text-gray-700">${product}</span>
                    <span class="font-medium bg-red-50 px-2 py-1 rounded">${count}</span>
                `;
                productList.appendChild(item);
            });
        }

        if (productList.children.length === 0) {
            productList.innerHTML = '<div class="text-gray-500 text-sm">No products detected</div>';
        }
        
        // Display labeled image
        const labeledImage = document.getElementById('labeledImage');
        labeledImage.src = '/' + result.labeled_image;
        
        // Show results
        detectionResults.classList.remove('hidden');
        uploadStatus.textContent = 'Processing complete!';
        uploadStatus.classList.remove('text-gray-500');
        uploadStatus.classList.add('text-green-500');

        // Update dashboard data and charts after detection
        await updateDashboardAfterDetection(result);

    } catch (error) {
        console.error('Error:', error);
        uploadStatus.textContent = 'Error processing image: ' + error.message;
        uploadStatus.classList.remove('text-gray-500', 'text-green-500');
        uploadStatus.classList.add('text-red-500');
    }
});

// Add new function to handle feedback
async function handleFeedback(eventId, feedback) {
    await updateNestleFeedback(eventId, feedback);
    isFeedbackPending = false;
    lastUploadedEventId = null;
}

// Add beforeunload event listener
window.addEventListener('beforeunload', function(e) {
    if (isFeedbackPending) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Modify logout function
document.querySelector('a[href="/logout"]').addEventListener('click', async function(e) {
    if (isFeedbackPending) {
        e.preventDefault();
        const shouldProceed = await showFeedbackWarning();
        if (!shouldProceed) {
            return;
        }
    }
});

// Update updateNestleFeedback function
async function updateNestleFeedback(eventId, feedback) {
    try {
        // Always update the most recent event (first event in the array)
        if (events.length > 0) {
            const latestEvent = events[0];
            
            // Send feedback to the server
            const response = await fetch(`/api/events/${latestEvent.id}/feedback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ feedback })
            });

            if (!response.ok) {
                throw new Error('Failed to update feedback');
            }

            // Update local state
            latestEvent.nestle_feedback = feedback;
            
            // Update the feedback cell in the table
            const feedbackCell = document.getElementById(`feedback-${latestEvent.id}`);
            if (feedbackCell) {
                feedbackCell.textContent = feedback;
            }
            
            // Re-render the table to ensure all data is in sync
            renderEventsTable();
            
            // Reset feedback pending state
            isFeedbackPending = false;
            lastUploadedEventId = null;
            
            // Show success notification
            showToastNotification('Feedback updated successfully');
        } else {
            console.error('No events available');
            showToastNotification('Error: No events available');
        }
    } catch (error) {
        console.error('Error updating feedback:', error);
        showToastNotification('Error updating feedback');
    }
}

// Drag and drop handling
const dropZone = document.querySelector('label[for="imageInput"]');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults (e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
    dropZone.classList.add('border-blue-500', 'bg-blue-50');
}

function unhighlight(e) {
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
}

dropZone.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    
    const input = document.getElementById('imageInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
}

// Add this function to ensure chart is properly initialized
function initializeChart() {
    if (mainChart) {
        mainChart.destroy();
    }
    
    const ctx = document.getElementById('mainChart').getContext('2d');
    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: skuData.daily_data.dates,
            datasets: [
                {
                    label: 'Nestlé',
                    data: skuData.daily_data.nestle_values,
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Competitor',
                    data: skuData.daily_data.competitor_values,
                    borderColor: '#EF4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 750
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Update the showAllProducts function
function showAllProducts() {
    // Fetch all products data from new endpoint
    fetch('/api/all_products')
        .then(response => response.json())
        .then(products => {
            const tableBody = document.getElementById('allProductsTable');
            tableBody.innerHTML = '';

            if (products.length === 0) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td colspan="2" class="px-6 py-4 text-center text-sm text-gray-500">
                        No products detected
                    </td>
                `;
                tableBody.appendChild(row);
                return;
            }

            // Create table rows for all products
            products.forEach(product => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50';
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${product.name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">${product.count}</span>
                    </td>
                `;
                tableBody.appendChild(row);
            });

            // Show modal
            document.getElementById('allProductsModal').classList.remove('hidden');
        })
        .catch(error => {
            console.error('Error fetching products:', error);
            showToastNotification('Error loading product data');
        });
}

function closeAllProductsModal() {
    document.getElementById('allProductsModal').classList.add('hidden');
}

// Add event listener for ESC key to close modal
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeAllProductsModal();
    }
});

// Close modal when clicking outside
document.getElementById('allProductsModal').addEventListener('click', function(event) {
    if (event.target === this) {
        closeAllProductsModal();
    }
});

// Tambahkan CSS untuk animasi toast
const style = document.createElement('style');
style.textContent = `
.toast-notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: white;
    padding: 1rem;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
    z-index: 50;
    max-width: 400px;
    border-left: 4px solid #3B82F6;
}

.toast-notification.show {
    transform: translateX(0);
}
`;
document.head.appendChild(style);

function createProductList(products) {
    const productList = document.createElement('div');
    
    // Nestlé Products section
    const nestleHeader = document.createElement('div');
    nestleHeader.className = 'font-medium text-blue-700 mb-2';
    nestleHeader.textContent = 'Nestlé Products:';
    productList.appendChild(nestleHeader);
    
    if (products.nestle_products && Object.keys(products.nestle_products).length > 0) {
        Object.entries(products.nestle_products).forEach(([name, count]) => {
            const item = document.createElement('div');
            item.className = 'text-sm text-gray-600 ml-2';
            item.textContent = `${name}: ${count}`;
            productList.appendChild(item);
        });
    } else {
        const noNestle = document.createElement('div');
        noNestle.className = 'text-sm text-gray-500 ml-2';
        noNestle.textContent = 'No Nestlé products detected';
        productList.appendChild(noNestle);
    }

    // Competitor Products section
    const compHeader = document.createElement('div');
    compHeader.className = 'font-medium text-red-700 mt-4 mb-2';
    compHeader.textContent = 'Uncategorised Products:';
    productList.appendChild(compHeader);
    
    if (products.competitor_products && products.competitor_products.unclassified > 0) {
        const item = document.createElement('div');
        item.className = 'text-sm text-gray-600 ml-2';
        item.textContent = `Unclassified: ${products.competitor_products.unclassified}`;
        productList.appendChild(item);
    } else {
        const noComp = document.createElement('div');
        noComp.className = 'text-sm text-gray-500 ml-2';
        noComp.textContent = 'No Uncategorised products detected';
        productList.appendChild(noComp);
    }

    return productList;
}

// Update fungsi untuk menampilkan events
function createEventRow(event) {
    const row = document.createElement('tr');
    row.className = 'hover:bg-gray-50';
    
    const timestamp = new Date(event.timestamp).toLocaleString();
    
    row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm text-gray-900">${event.device_id}</div>
            <div class="text-xs text-gray-500">${timestamp}</div>
        </td>
        <td class="px-6 py-4">
            <span class="text-blue-600 font-medium">${event.nestle_detections}</span>
        </td>
        <td class="px-6 py-4">
            <span class="text-red-600 font-medium">${event.unclassified_detections}</span>
        </td>
        <td class="px-6 py-4 text-right text-sm font-medium">
            <button onclick="showEventDetails(${event.id})" 
                    class="text-indigo-600 hover:text-indigo-900">
                Details
            </button>
        </td>
    `;
    return row;
}

// Update fungsi untuk menampilkan event details
function showEventDetails(eventId) {
    fetch(`/api/events/${eventId}`)
        .then(response => response.json())
        .then(data => {
            const modalContent = document.getElementById('eventDetailsContent');
            modalContent.innerHTML = `
                <div class="space-y-4">
                    <div class="flex justify-between items-start">
                        <div>
                            <h3 class="text-lg font-medium">Detection Details</h3>
                            <p class="text-sm text-gray-500">Device: ${data.device_id}</p>
                            <p class="text-sm text-gray-500">Time: ${new Date(data.timestamp).toLocaleString()}</p>
                        </div>
                        <div class="text-right">
                            <p class="text-blue-600">Nestlé: ${data.nestleCount}</p>
                            <p class="text-red-600">Unclassified: ${data.compCount}</p>
                        </div>
                    </div>
                    ${data.image_path ? `
                        <div class="mt-4">
                            <img src="/${data.image_path}" alt="Detection" class="w-full rounded-lg">
                        </div>
                    ` : ''}
                </div>
            `;
            showModal('eventDetailsModal');
        })
        .catch(error => console.error('Error:', error));
}

// Update updateDashboardAfterDetection function to handle potential errors
async function updateDashboardAfterDetection(detectionResult) {
    try {
        const currentDate = detectionResult.date || new Date().toISOString().split('T')[0];
        
        // Add the new event to our events array
        const newEvent = {
            id: detectionResult.id,
            device_id: 'web_upload',
            timestamp: new Date().toISOString(),
            nestle_count: Object.values(detectionResult.nestle_products).reduce((a, b) => a + b, 0),
            competitor_count: Object.values(detectionResult.competitor_products).reduce((a, b) => a + b, 0),
            iqi_score: detectionResult.iqi_score || 0,
            nestle_feedback: null, // Initialize with no feedback
            image_path: detectionResult.labeled_image,
            products: {
                nestle_products: detectionResult.nestle_products,
                competitor_products: detectionResult.competitor_products
            }
        };

        // Add to beginning of events array
        events.unshift(newEvent);
        
        // Note: totalEvents will be updated in renderEventsTable() since it depends on feedback status
        
        // Initialize skuData.daily_data if it doesn't exist
        if (!skuData.daily_data) {
            skuData.daily_data = {
                dates: [currentDate],
                nestle_values: [0],
                competitor_values: [0]
            };
        }
        
        // Ensure current date exists in dates array
        let dateIndex = skuData.daily_data.dates.indexOf(currentDate);
        if (dateIndex === -1) {
            skuData.daily_data.dates.push(currentDate);
            skuData.daily_data.nestle_values.push(0);
            skuData.daily_data.competitor_values.push(0);
            dateIndex = skuData.daily_data.dates.length - 1;
        }
        
        // Add new detection counts to existing values
        const nestleTotal = Object.values(detectionResult.nestle_products).reduce((a, b) => a + b, 0);
        const competitorTotal = Object.values(detectionResult.competitor_products).reduce((a, b) => a + b, 0);
        
        skuData.daily_data.nestle_values[dateIndex] += nestleTotal;
        skuData.daily_data.competitor_values[dateIndex] += competitorTotal;
        
        // Force immediate chart update if chart exists
        if (mainChart) {
            mainChart.data.datasets[0].data = skuData.daily_data.nestle_values;
            mainChart.data.datasets[1].data = skuData.daily_data.competitor_values;
            mainChart.update('active');
        }

        try {
            // Fetch fresh dashboard data
            const response = await fetch('/api/dashboard_data');
            if (!response.ok) {
                throw new Error('Failed to fetch updated dashboard data');
            }
            const freshData = await response.json();
            skuData = freshData;
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            // Continue with existing data if fetch fails
        }

        // Update all visualizations
        try {
            updateDateRange();
            renderMainChart();
            renderMarketShareChart();
            renderDailyCountChart();
            updateStatisticsCards();
        } catch (error) {
            console.error('Error updating visualizations:', error);
        }

        // Render the events table with the new event
        renderEventsTable();
        updatePagination();

    } catch (error) {
        console.error('Error updating dashboard:', error);
        throw error;
    }
}
