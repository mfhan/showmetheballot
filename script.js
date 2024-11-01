let zipLookup = [];
let autocompleteData = [];
let isDataLoaded = false;

showdown.setOption('tables', true);
showdown.setOption('tasklists', true);  // Enable tasklists (checkboxes)

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
    } else {
        displayDefaultMessage();
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
// Modified performSearch function to handle async displayResults
async function performSearch(searchTerm) {

    const parsedResult = parseSearchTerm(searchTerm);
    let results = [];
    let zip = "";

    if (parsedResult) {
        const { county, state } = parsedResult;
        zip = parsedResult.zip
        results = ballotData.filter(row => 
            row.zip & row.zip.contains(zip)
        );
    }

    if (results.length === 0) {
        results = ballotData.filter(row => 
            ['county', 'state', 'zip', 'district'].some(key => 
                String(row[key]).toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }
    hideLoadingIndicator();
    await displayResults(results, zip);
}
// Modified search function to handle async performSearch
function search(searchTerm = null) {
    removeSuggestionList();
    searchTerm = searchTerm || document.getElementById('search-input').value.trim();

    if (!isDataLoaded) {
        showLoadingIndicator();
        const checkDataInterval = setInterval(async () => {
            if (isDataLoaded) {
                clearInterval(checkDataInterval);
                await performSearch(searchTerm);
            }
        }, 100);
    } else {
        performSearch(searchTerm);
    }
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

// Function to fetch and display the inlay HTML
async function fetchInlayHTML(zip) {
    try {
        const response = await fetch(`https://edbltn.github.io/show-me-the-ballot/data/processed/${zip}.html`);
        if (!response.ok) {
            throw new Error('Inlay content not found');
        }
        return await response.text();
    } catch (error) {
        console.log('Error fetching inlay:', error);
        return null;
    }
}

// Modified displayResults function
async function displayResults(results, zip) {
    const resultsDiv = document.getElementById('results');
    
    // Create a function to check if URL exists
    const checkUrlExists = async (url) => {
        try {
            const response = await fetch(url);
            return response.ok; // returns true if status is 200-299
        } catch (error) {
            return false;
        }
    };

    // Check if the map file exists before creating iframe
    const mapUrl = `https://edbltn.github.io/show-me-the-ballot/data/processed/${zip}.html`;
    const mapExists = await checkUrlExists(mapUrl);

    // Only show iframe if map exists
    const iframeHTML = mapExists ? `
        <div class="iframe-container" style="margin-bottom: 20px; margin-left: auto; margin-right: auto; overflow: hidden;">
            <iframe 
                src="${mapUrl}"
                style="width: 100%; height: 400px; border: 1px solid #ccc; border-radius: 4px; transform-origin: 0 0;"
                title="Ballot Preview">
            </iframe>
        </div>
    ` : '';
  
    if (results.length > 0) {
        resultsDiv.innerHTML = iframeHTML + results.map((result, index) => {
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
    } else {
        resultsDiv.innerHTML = iframeHTML + '<p>No results found.</p>';
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
    <div style="width: 53%;">
      <h3 className="text-xl font-bold mb-2">Most Complex Ballots</h3>
      <ul className="list-disc list-inside space-y-1">
        <li><a href="?q=Harris%20County,%20Texas%20(77088)" className="text-blue-600 hover:underline">Harris County, Texas (77088)</a></li>
        <li><a href="?q=Los%20Angeles%20County,%20California%20(90066)" className="text-blue-600 hover:underline">Los Angeles County, California (90066)</a></li>
        <li><a href="?q=Maricopa%20County,%20Arizona%20(85343)" className="text-blue-600 hover:underline">Maricopa County, Arizona (85343)</a></li>
        <li><a href="?q=Multnomah%20County,%20Oregon%20(97206)" className="text-blue-600 hover:underline">Multnomah County, Oregon (97206)</a></li>
        <li><a href="?q=San%20Diego%20County,%20California%20(92057)" className="text-blue-600 hover:underline">San Diego County, California (92057)</a></li>
      </ul>
    </div>
    <div>
      <h3 className="text-xl font-bold mb-2">Least Complex Ballots</h3>
      <ul className="list-disc list-inside space-y-1">
        <li><a href="?q=Cheshire%20County,%20New%20Hampshire%20(03446)" className="text-blue-600 hover:underline">Cheshire County, New Hampshire (03446)</a></li>
        <li><a href="?q=Cobb%20County,%20Georgia%20(30062)" className="text-blue-600 hover:underline">Cobb County, Georgia (30062)</a></li>
        <li><a href="?q=Orange%20County,%20New%20York%20(10950)" className="text-blue-600 hover:underline">Orange County, New York (10950)</a></li>
        <li><a href="?q=Wythe%20County,%20Virginia%20(24382)" className="text-blue-600 hover:underline">Wythe County, Virginia (24382)</a></li>
        <li><a href="?q=Suffolk%20County,%20New%20York%20(11746)" className="text-blue-600 hover:underline">Suffolk County, New York (11746)</a></li>
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
    showLoadingIndicator();
    setupDocumentClickListener();
    checkUrlParameters();
    loadCSVs();
});