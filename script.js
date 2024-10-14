let ballotData = [];
let zipLookup = [];
let autocompleteData = [];
let isDataLoaded = false;
showdown.setOption('tables', true);
const converter = new showdown.Converter();

// Function to load and parse the CSV files
function loadCSVs() {
    Papa.parse('zip_lookup.csv', {
        download: true,
        header: true,
        complete: function(results) {
            zipLookup = results.data;
            console.log('Zip lookup CSV loaded');
            setupAutocomplete();

            // After zip_lookup is loaded, load the ballot data
            Papa.parse('data.csv', {
                download: true,
                header: true,
                complete: function(results) {
                    ballotData = results.data;
                    console.log('Ballot data CSV loaded');
                    isDataLoaded = true;
                    checkUrlParameters();
                }
            });
        }
    });
}

// Function to show loading indicator
function showLoadingIndicator() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Loading ballot data...</div>';
}

// Function to hide loading indicator
function hideLoadingIndicator() {
    const loadingDiv = document.querySelector('.loading');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

// Function to set up autocomplete
function setupAutocomplete() {
    autocompleteData = zipLookup.flatMap(row => [
        `${row.county} County, ${row.state} (${row.zip})`
    ]);
    autocompleteData = [...new Set(autocompleteData)]; // Remove duplicates

    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', handleInput);
    searchInput.addEventListener('keydown', handleKeyDown);
}

function handleInput(e) {
    const input = e.target.value.toLowerCase();
    if (input.length < 2) return;

    const matches = autocompleteData.filter(item => 
        item.toLowerCase().includes(input)
    ).slice(0, 5); // Limit to 5 suggestions

    showSuggestions(matches);
}

function showSuggestions(suggestions) {
    let suggestionList = document.getElementById('suggestions');
    
    if (!suggestionList) {
        suggestionList = document.createElement('ul');
        suggestionList.id = 'suggestions';
        const searchContainer = document.getElementById('search-container');
        searchContainer.appendChild(suggestionList);
    }

    suggestionList.innerHTML = '';
    suggestions.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        li.addEventListener('click', () => {
            document.getElementById('search-input').value = item;
            removeSuggestionList();
            search(item);
        });
        suggestionList.appendChild(li);
    });
}

function handleKeyDown(e) {
    const suggestionList = document.getElementById('suggestions');
    const suggestions = suggestionList.children;
    let selectedIndex = -1;

    for (let i = 0; i < suggestions.length; i++) {
        if (suggestions[i].classList.contains('selected')) {
            selectedIndex = i;
            break;
        }
    }

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            if (selectedIndex < suggestions.length - 1) {
                if (selectedIndex > -1) suggestions[selectedIndex].classList.remove('selected');
                suggestions[selectedIndex + 1].classList.add('selected');
            }
            break;
        case 'ArrowUp':
            e.preventDefault();
            if (selectedIndex > 0) {
                suggestions[selectedIndex].classList.remove('selected');
                suggestions[selectedIndex - 1].classList.add('selected');
            }
            break;
        case 'Enter':
            e.preventDefault();
            if (selectedIndex > -1) {
                document.getElementById('search-input').value = suggestions[selectedIndex].textContent;
                removeSuggestionList();
                search(suggestions[selectedIndex].textContent);
            } else {
                search();
            }
            break;
    }
}

// Function to check URL parameters and perform search if needed
function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('q');
    if (searchQuery) {
        document.getElementById('search-input').value = searchQuery;
        search(searchQuery);
    }
}

// Function to update URL with search query
function updateUrlWithSearch(searchQuery) {
    const url = new URL(window.location);
    url.searchParams.set('q', searchQuery);
    window.history.pushState({}, '', url);
}

// Function to update URL with toggle states
function updateUrlWithToggles(toggleStates) {
    const url = new URL(window.location);
    url.searchParams.set('toggles', toggleStates.join(','));
    window.history.pushState({}, '', url);
}


// Function to search for a county, state, or zip code
function search(searchTerm = null) {
    removeSuggestionList();
    searchTerm = searchTerm || document.getElementById('search-input').value.trim();

    if (!isDataLoaded) {
        showLoadingIndicator();
        // Wait for data to load before searching
        const checkDataInterval = setInterval(() => {
            if (isDataLoaded) {
                clearInterval(checkDataInterval);
                performSearch(searchTerm);
            }
        }, 100); // Check every 100ms
    } else {
        performSearch(searchTerm);
    }
}

// Function to perform the actual search
function performSearch(searchTerm) {
    hideLoadingIndicator();
    
    // Update URL with search query
    updateUrlWithSearch(searchTerm);
    
    // Try to parse the search term into county, state, and zip
    const parsedResult = parseSearchTerm(searchTerm);
    
    let results = [];
    
    if (parsedResult) {
        const { county, state, zip } = parsedResult;
        results = ballotData.filter(row => 
            row.zip && row.zip.includes(zip)
        );
    }
    
    // If parsing fails or no exact match found, search for any partial match
    if (results.length === 0) {
        results = ballotData.filter(row => 
            ['county', 'state', 'zip', 'district'].some(key => 
                String(row[key]).toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }
    
    displayResults(results);
}

function parseSearchTerm(searchTerm) {
    const parts = searchTerm.split(',');
    if (parts.length === 2) {
        const county = parts[0].trim();
        const stateZipParts = parts[1].trim().split('(');
        if (stateZipParts.length === 2) {
            const state = stateZipParts[0].trim();
            const zip = stateZipParts[1].replace(')', '').trim();
            return { county, state, zip };
        }
    }
    return null;
}

// Function to display the search results
function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    if (results.length > 0) {
        resultsDiv.innerHTML = results.map((result, index) => {
            const title = result.district ? 
                `${result.county} County, ${result.state} － ${result.district}` : 
                `${result.county} County, ${result.state}`;
            
            // Use showdown to convert Markdown to HTML
            const htmlContent = converter.makeHtml(result.ballot_markdown);
            
            return `
                <div class="result-toggle">
                    <h2 onclick="toggleBallot(${index})">${title}</h2>
                    <div id="ballot-${index}" class="ballot-content" style="display: none;">
                        ${htmlContent}
                    </div>
                </div>
            `;
        }).join('');

        // Check URL parameters for toggle states
        const urlParams = new URLSearchParams(window.location.search);
        const toggleStates = urlParams.get('toggles');
        if (toggleStates) {
            toggleStates.split(',').forEach((state, index) => {
                if (state === '1') {
                    toggleBallot(index);
                }
            });
        }
    } else {
        resultsDiv.innerHTML = '<p>No results found.</p>';
    }
}

// Function to toggle the visibility of ballot content
function toggleBallot(index) {
    const ballotContent = document.getElementById(`ballot-${index}`);
    ballotContent.style.display = ballotContent.style.display === 'none' ? 'block' : 'none';
    
    // Update URL with toggle states
    const toggleStates = Array.from(document.querySelectorAll('.ballot-content')).map(content => content.style.display === 'none' ? '0' : '1');
    updateUrlWithToggles(toggleStates);
}

function displayDefaultMessage() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<h2>Your Voice, Your Vote</h2>
<p>Elections shape our daily life. Schools, taxes, roads – it's all on the ballot. Know what's at stake before you go.</p>

<p>To see what you'll be voting for, type and select from any location in the United States. Examples:</p>

<div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
    <div style="width: 48%;">
        <h3>Most Complex Ballots</h3>
        <ul>
            <li><a href="?q=Harris%20County,%20Texas%20(77088)">Harris County, Texas (77088)</a></li>
            <li><a href="?q=Riverside%20County,%20California%20(92880)">Riverside County, California (92880)</a></li>
            <li><a href="?q=Los%20Angeles%20County,%20California%20(90066)">Los Angeles County, California (90066)</a></li>
            <li><a href="?q=San%20Diego%20County,%20California%20(92057)">San Diego County, California (92057)</a></li>
            <li><a href="?q=Kern%20County,%20California%20(93505)">Kern County, California (93505)</a></li>
        </ul>
    </div>
    <div style="width: 48%;">
        <h3>Least Complex Ballots</h3>
        <ul>
            <li><a href="?q=Cheshire%20County,%20New%20Hampshire%20(03446)">Cheshire County, New Hampshire (03446)</a></li>
            <li><a href="?q=Coos%20County,%20New%20Hampshire%20(03570)">Coos County, New Hampshire (03570)</a></li>
            <li><a href="?q=Belknap%20County,%20New%20Hampshire%20(03246)">Belknap County, New Hampshire (03246)</a></li>
            <li><a href="?q=Grafton%20County,%20New%20Hampshire%20(03755)">Grafton County, New Hampshire (03755)</a></li>
            <li><a href="?q=Hillsborough%20County,%20New%20Hampshire%20(03060)">Hillsborough County, New Hampshire (03060)</a></li>
        </ul>
    </div>
</div>

<p>Get the facts. Be prepared. Vote smart.</p>

<p><strong>Disclaimer: This tool provides a preview of your ballot based on available data from <a href="https://ballotpedia.org" target="_blank">Ballotpedia</a>.</strong></p>
<p><strong>It may not include all races or candidates. Always verify with your local election office for the most complete and up-to-date information.</strong></p>`;
}

function removeSuggestionList() {
    const suggestionList = document.getElementById('suggestions');
    if (suggestionList) {
        suggestionList.remove();
    }
}

function setupDocumentClickListener() {
    document.addEventListener('click', (event) => {
        const searchContainer = document.getElementById('search-container');
        const isClickInsideSearchContainer = searchContainer.contains(event.target);
        
        if (!isClickInsideSearchContainer) {
            removeSuggestionList();
        }
    });
}


// Load the CSVs when the page loads
// Load the CSVs and set up event listeners when the page loads
document.addEventListener('DOMContentLoaded', () => {
    displayDefaultMessage();
    loadCSVs();
    setupDocumentClickListener();
});