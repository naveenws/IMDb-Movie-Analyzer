/**
 * ==================================================================
 * IMDb Movie Analyzer - Frontend JavaScript Studio
 * Manages AJAX data loading, interactive Search & Sorting,
 * Chart.js analytics dashboard, and SSE dynamic scraping logging.
 * ==================================================================
 */

// Global Application State
let allMovies = [];
let filteredMovies = [];
let decadeChartInstance = null;
let ratingChartInstance = null;

// DOM Elements
const movieGrid = document.getElementById('movie-grid');
const noResultsContainer = document.getElementById('no-results');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const resultsCountText = document.getElementById('results-count');

// Dashboard Stat Counters
const statTotal = document.getElementById('stat-total');
const statAvgRating = document.getElementById('stat-avg-rating');
const statLongest = document.getElementById('stat-longest');
const statTopDecade = document.getElementById('stat-top-decade');

// Scraper Elements
const btnScrapeTop = document.getElementById('btn-scrape-top');
const btnExportTop = document.getElementById('btn-export-top');
const loadingOverlay = document.getElementById('loading-overlay');
const consoleLogs = document.getElementById('console-logs');
const scraperStatusText = document.getElementById('scraper-status-text');

/**
 * Initializes the dashboard application.
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Fetch initial dataset from backend CSV
    fetchMovies();
    
    // 2. Wire up Search Input
    searchInput.addEventListener('input', handleSearchAndSort);
    
    // 3. Wire up Sort Dropdown
    sortSelect.addEventListener('change', handleSearchAndSort);
    
    // 4. Wire up Scraping Controls
    btnScrapeTop.addEventListener('click', triggerLiveScraping);
    btnExportTop.addEventListener('click', () => {
        window.location.href = '/api/export';
    });
});

/**
 * Fetches movie list from Flask API and refreshes the UI.
 */
function fetchMovies() {
    fetch('/api/movies')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                allMovies = data.movies;
                // Add index as Rank representing original order
                allMovies.forEach((m, idx) => {
                    m.rank = idx + 1;
                });
                
                // Initial filter/sort matching defaults
                handleSearchAndSort();
                
                // Redraw graphs
                updateAnalyticsDashboard();
            } else {
                console.error("API error fetching movies:", data.message);
            }
        })
        .catch(err => {
            console.error("Network error fetching movies:", err);
        });
}

/**
 * Filters and sorts movies based on user inputs.
 */
function handleSearchAndSort() {
    const query = searchInput.value.toLowerCase().trim();
    const sortVal = sortSelect.value;
    
    // 1. Search Filter
    filteredMovies = allMovies.filter(movie => {
        return movie.title.toLowerCase().includes(query);
    });
    
    // 2. Sorting Logic
    filteredMovies.sort((a, b) => {
        if (sortVal === 'rank-asc') {
            return a.rank - b.rank;
        } else if (sortVal === 'rating-desc') {
            return b.rating - a.rating;
        } else if (sortVal === 'rating-asc') {
            return a.rating - b.rating;
        } else if (sortVal === 'year-desc') {
            return b.year - a.year;
        } else if (sortVal === 'year-asc') {
            return a.year - b.year;
        } else if (sortVal === 'runtime-desc') {
            return b.runtime_minutes - a.runtime_minutes;
        }
        return 0;
    });
    
    // 3. Render
    renderMovieGrid();
}

/**
 * Dynamically injects movie cards into the HTML container.
 */
function renderMovieGrid() {
    movieGrid.innerHTML = '';
    
    // Manage results count text
    resultsCountText.innerText = `Showing ${filteredMovies.length} of ${allMovies.length} movies`;
    
    if (filteredMovies.length === 0) {
        noResultsContainer.classList.remove('d-none');
        movieGrid.classList.add('d-none');
        return;
    }
    
    noResultsContainer.classList.add('d-none');
    movieGrid.classList.remove('d-none');
    
    filteredMovies.forEach(movie => {
        // Construct visual card HTML
        const cardCol = document.createElement('div');
        cardCol.className = 'animate-fade-in';
        
        // Duration badge text helper
        let runtimeLabel = 'Standard';
        if (movie.runtime_minutes < 100) runtimeLabel = 'Short duration';
        else if (movie.runtime_minutes > 150) runtimeLabel = 'Feature Epic';
        
        cardCol.innerHTML = `
            <div class="glass-panel movie-card p-4 d-flex flex-column justify-content-between">
                <div>
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <span class="movie-meta-badge">Rank #${movie.rank}</span>
                        <span class="rating-badge">
                            <i class="fa-solid fa-star text-warning star-glow"></i>
                            ${Number(movie.rating).toFixed(1)}
                        </span>
                    </div>
                    
                    <h3 class="movie-title">${movie.title}</h3>
                </div>
                
                <div class="mt-4">
                    <div class="d-flex justify-content-between text-secondary mb-3" style="font-size: 0.85rem;">
                        <span><i class="fa-regular fa-calendar me-1"></i> ${movie.year}</span>
                        <span><i class="fa-regular fa-clock me-1"></i> ${movie.runtime}</span>
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="badge" style="background: rgba(102, 252, 241, 0.08); color: #66fcf1; border: 1px solid rgba(102, 252, 241, 0.15); font-size: 0.7rem;">
                            ${runtimeLabel}
                        </span>
                        <span class="text-muted" style="font-size: 0.75rem;">
                            ${movie.runtime_minutes} mins
                        </span>
                    </div>
                </div>
            </div>
        `;
        movieGrid.appendChild(cardCol);
    });
}

/**
 * Calculates metrics and builds analytical charts using Chart.js.
 */
function updateAnalyticsDashboard() {
    if (allMovies.length === 0) return;
    
    // --- 1. Compute Stats ---
    statTotal.innerText = allMovies.length;
    
    const avgRating = allMovies.reduce((sum, m) => sum + Number(m.rating), 0) / allMovies.length;
    statAvgRating.innerText = avgRating.toFixed(2);
    
    const longestMovieObj = allMovies.reduce((prev, current) => {
        return (prev.runtime_minutes > current.runtime_minutes) ? prev : current;
    });
    statLongest.innerText = `${longestMovieObj.runtime_minutes}m`;
    
    // Decade math
    const decadeCounts = {};
    allMovies.forEach(m => {
        const decade = Math.floor(m.year / 10) * 10;
        const decadeStr = `${decade}s`;
        decadeCounts[decadeStr] = (decadeCounts[decadeStr] || 0) + 1;
    });
    
    let topDecadeStr = "1990s";
    let maxDecadeCount = 0;
    Object.keys(decadeCounts).forEach(dec => {
        if (decadeCounts[dec] > maxDecadeCount) {
            maxDecadeCount = decadeCounts[dec];
            topDecadeStr = dec;
        }
    });
    statTopDecade.innerText = topDecadeStr;
    
    // --- 2. Chart 1: Decade Distribution ---
    // Sort decades chronologically
    const sortedDecades = Object.keys(decadeCounts).sort();
    const decadeData = sortedDecades.map(dec => decadeCounts[dec]);
    
    if (decadeChartInstance) {
        decadeChartInstance.destroy();
    }
    
    const ctxDecade = document.getElementById('decadeChart').getContext('2d');
    decadeChartInstance = new Chart(ctxDecade, {
        type: 'bar',
        data: {
            labels: sortedDecades,
            datasets: [{
                label: 'Movies Count',
                data: decadeData,
                backgroundColor: 'rgba(102, 252, 241, 0.45)',
                borderColor: '#66fcf1',
                borderWidth: 2,
                borderRadius: 6,
                hoverBackgroundColor: 'rgba(102, 252, 241, 0.85)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2833',
                    titleColor: '#fff',
                    bodyColor: '#66fcf1',
                    borderColor: 'rgba(102, 252, 241, 0.3)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } }
                }
            }
        }
    });
    
    // --- 3. Chart 2: Rating Distribution ---
    const ratingBuckets = {
        '9.0+ Masterpiece': 0,
        '8.7 - 8.9 Outstanding': 0,
        '8.4 - 8.6 Recommended': 0,
        '8.0 - 8.3 Good': 0
    };
    
    allMovies.forEach(m => {
        const rating = Number(m.rating);
        if (rating >= 9.0) ratingBuckets['9.0+ Masterpiece']++;
        else if (rating >= 8.7) ratingBuckets['8.7 - 8.9 Outstanding']++;
        else if (rating >= 8.4) ratingBuckets['8.4 - 8.6 Recommended']++;
        else ratingBuckets['8.0 - 8.3 Good']++;
    });
    
    if (ratingChartInstance) {
        ratingChartInstance.destroy();
    }
    
    const ctxRating = document.getElementById('ratingChart').getContext('2d');
    ratingChartInstance = new Chart(ctxRating, {
        type: 'doughnut',
        data: {
            labels: Object.keys(ratingBuckets),
            datasets: [{
                data: Object.values(ratingBuckets),
                backgroundColor: [
                    '#ffc107', // masterpiece gold
                    'rgba(102, 252, 241, 0.85)', // outstanding cyan
                    'rgba(79, 70, 229, 0.85)', // recommended indigo
                    'rgba(148, 163, 184, 0.45)' // good grey
                ],
                borderColor: '#0f131a',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        padding: 18,
                        font: { family: 'Plus Jakarta Sans', size: 11 }
                    }
                },
                tooltip: {
                    backgroundColor: '#1f2833',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    borderWidth: 1
                }
            },
            cutout: '65%'
        }
    });
}

/**
 * Initiates real-time Server-Sent Events scraping pipeline.
 * Activates glassmorphic overlay loader and streams terminal progress.
 */
function triggerLiveScraping() {
    let movieCount = parseInt(document.getElementById('movie-count').value) || 50;
    if (movieCount < 1) movieCount = 1;
    if (movieCount > 250) movieCount = 250;
    document.getElementById('movie-count').value = movieCount;

    // 1. Show dynamic loader overlay
    loadingOverlay.classList.add('active');
    
    // 2. Reset logging terminal console
    consoleLogs.innerHTML = `<div class="console-log-line system">[SYSTEM] Starting IMDb scraping engine...</div>`;
    
    scraperStatusText.innerText = `Deploying crawler for Top ${movieCount} movies...`;
    
    // Helper to log text lines into logging box
    const appendConsoleLog = (text, type = 'system') => {
        const logLine = document.createElement('div');
        logLine.className = `console-log-line ${type}`;
        logLine.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
        consoleLogs.appendChild(logLine);
        
        // Auto-scroll terminal logs to bottom
        consoleLogs.scrollTop = consoleLogs.scrollHeight;
    };
    
    // 3. Initiate SSE connection
    const eventSource = new EventSource(`/api/scrape?count=${movieCount}`);
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'log') {
                appendConsoleLog(data.message, 'system');
                
                // Dynamically update spinner status message for key phases
                if (data.message.includes('Connecting')) {
                    scraperStatusText.innerText = "Loading IMDb Chart...";
                } else if (data.message.includes('React elements')) {
                    scraperStatusText.innerText = "Parsing dynamically...";
                } else if (data.message.includes('Scraped')) {
                    scraperStatusText.innerText = `Collecting items: ${data.message.split('Scraped ')[1]}`;
                }
            } else if (data.type === 'complete') {
                appendConsoleLog(data.message, 'success');
                scraperStatusText.innerText = "Finalizing movies.csv dataset...";
                
                // Close SSE channel
                eventSource.close();
                
                // Hold overlay loader briefly to show complete phase, then close and reload
                setTimeout(() => {
                    loadingOverlay.classList.remove('active');
                    fetchMovies();
                }, 1800);
                
            } else if (data.type === 'error') {
                appendConsoleLog(data.message, 'error');
                scraperStatusText.innerText = "Scraper halted due to unexpected error.";
                
                eventSource.close();
                
                // Allow user to click overlay or close it after error
                const closeBtn = document.createElement('button');
                closeBtn.className = 'btn btn-cyan btn-sm mt-3 w-100';
                closeBtn.innerText = "Return to Dashboard";
                closeBtn.onclick = () => {
                    loadingOverlay.classList.remove('active');
                    fetchMovies(); // Reload anyway to fallback data
                };
                consoleLogs.appendChild(closeBtn);
                consoleLogs.scrollTop = consoleLogs.scrollHeight;
            }
        } catch (e) {
            console.error("SSE parse error:", e);
            eventSource.close();
            loadingOverlay.classList.remove('active');
        }
    };
    
    eventSource.onerror = (err) => {
        console.error("EventSource failed:", err);
        appendConsoleLog("SSE Connection error. Gracefully fallback loading...", "error");
        eventSource.close();
        
        // Wait and close
        setTimeout(() => {
            loadingOverlay.classList.remove('active');
            fetchMovies();
        }, 3000);
    };
}
