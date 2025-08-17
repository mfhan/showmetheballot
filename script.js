let zipLookup = [];
let autocompleteData = [];

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

    // Split input into terms and filter out empty strings
    const searchTerms = input.split(/\s+/).filter(term => term.length > 0);
    if (searchTerms.length === 0) return;

    // Filter autocomplete data to require all terms match
    const matches = autocompleteData.filter(item => {
        const itemLower = item.toLowerCase();
        return searchTerms.every(term => itemLower.includes(term));
    }).slice(0, 10); // Limit to 5 suggestions

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
            clearToggleStates();
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
                clearToggleStates();
                search(suggestions[selectedIndex].textContent);
            } else {
                clearToggleStates();
                search();
            }
            break;
    }
}

// Function to check URL parameters and perform search if needed
function checkUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('q');
    const toggleStates = urlParams.get('toggles');

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

// Function to clear all toggle states from both URL and display
function clearToggleStates() {
    // Clear from URL
    const url = new URL(window.location);
    url.searchParams.delete('toggles');
    window.history.pushState({}, '', url);

    // Close all expanded ballots
    const ballotContents = document.querySelectorAll('.ballot-content');
    ballotContents.forEach(content => {
        content.style.display = 'none';
    });
}


// Function to search for a county, state, or zip code
// Modified performSearch function to handle async displayResults
// Function to perform the actual search
async function performSearch(searchTerm) {
  
    updateUrlWithSearch(searchTerm);

    const parsedResult = parseSearchTerm(searchTerm);
    let results = [];
    let zip = "";
    let county = "";
    if (parsedResult) {
        zip = parsedResult.zip;
        county = parsedResult.county;
        try {
            // Dynamically load ballot data for specific zip code
            const response = await new Promise((resolve, reject) => {

                url = `/data/processed/zip_data_${zip}.csv`;
                Papa.parse(url, {
                    download: true,
                    header: true,
                    complete: function(results) {
                        resolve(results);
                    },
                    error: function(error) {
                        reject(error);
                    }
                });
            });
            results = response.data.filter(row => row.zip && row.zip.includes(zip));

        } catch (error) {
            console.error('Error loading ballot data:', error);
            // Attempt to search in the zip lookup table if specific zip data fails
            results = [];
        }
    } else {
        // If no specific zip code found, search in zip lookup table
        const matchingZips = zipLookup.filter(row => 
            ['county', 'state', 'zip'].some(key => 
                String(row[key]).toLowerCase().includes(searchTerm.toLowerCase())
            )
        );

        // For each matching zip, try to load its data
        results = await Promise.all(matchingZips.map(async (match) => {
            try {
                const response = await new Promise((resolve, reject) => {

                    Papa.parse(`/data/processed/zip_data_${match.zip}.csv`, {
                        download: true,
                        header: true,
                        complete: function(results) {
                            resolve(results);
                        },
                        error: function(error) {
                            reject(error);
                        }
                    });
                });
                results = response.data.filter(row => row.zip && row.zip.includes(match.zip));
                return results;
            } catch (error) {
                console.error(`Error loading ballot data for zip ${match.zip}:`, error);
                return [];
            }
        })).flat();
    }

    await displayResults(results, zip, county);
    hideLoadingIndicator();
}

// Modified search function to handle async performSearch
function search(searchTerm = null) {
    removeSuggestionList();
    searchTerm = searchTerm || document.getElementById('search-input').value.trim();
    showLoadingIndicator();
    performSearch(searchTerm);
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


// Modified displayResults function
async function displayResults(results, zip, county) {
    const resultsDiv = document.getElementById('results');
    
    // Store results globally for toggle functionality
    window.currentResults = results;
    
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
    const mapUrl = `/data/processed/${zip}.html`;
    const mapExists = await checkUrlExists(mapUrl);

    // Only show iframe if map exists
    const iframeHTML = mapExists ? `
        <div class="iframe-container" style="margin-bottom: 20px; margin-left: auto; margin-right: auto; overflow: hidden;">
            <h3>Map of Zip Code ${zip}</h3>
            <iframe 
                src="${mapUrl}"
                style="width: 100%; height: 300px; border: 1px solid #ccc; border-radius: 4px; transform-origin: 0 0;"
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
            const htmlContent = converter.makeHtml(result.full_markdown);
            
            return `
                <div class="result-toggle">
                    <h2 onclick="toggleBallot(${index})">${title}</h2>
                    <div id="ballot-${index}" class="ballot-content" style="display: none;">
                        <div class="ballot-tabs">
                            <div class="tab-buttons">
                                <button class="tab-button active" onclick="switchTab(${index}, 'simplified')">Simplified Ballot</button>
                                <button class="tab-button" onclick="switchTab(${index}, 'full')">Full Ballot</button>
                            </div>
                            <div class="tab-content">
                                <div id="ballot-content-${index}">
                                    ${htmlContent}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `        }).join('');
      
        // Check URL parameters for toggle states
        const urlParams = new URLSearchParams(window.location.search);
        const toggleStates = urlParams.get('toggles');
      
        if (results.length === 1) {
          toggleBallot(0)
        } else if (toggleStates) {
              // Otherwise, respect the toggle states from URL if present
              toggleStates.split(',').forEach((state, index) => {
                  if (state === '1') {
                      toggleBallot(index);
                  }
              });
        } else {
            // Find results that match both county and zip
            const matchingResults = results.map((result, index) => ({
                result,
                index
            })).filter(item => 
                item.result.county.toLowerCase() + ' county' === (county || '').toLowerCase() && 
                item.result.zip === zip
            );

            // If exactly one result matches both county and zip, show it
            if (matchingResults.length === 1) {
                toggleBallot(matchingResults[0].index);
            }
        }
      
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

// Function to switch between tabs
function switchTab(index, tabType) {
    const contentDiv = document.getElementById(`ballot-content-${index}`);
    const resultData = window.currentResults[index];
    
    // Update active tab button
    const tabButtons = document.querySelectorAll(`#ballot-${index} .tab-button`);
    tabButtons.forEach(button => button.classList.remove('active'));
    
    if (tabType === 'simplified') {
        tabButtons[0].classList.add('active');
        // Show full_markdown converted to HTML
        const htmlContent = converter.makeHtml(resultData.full_markdown);
        contentDiv.innerHTML = htmlContent;
    } else if (tabType === 'full' && resultData.full_enhanced_ballot) {
        tabButtons[1].classList.add('active');
        // Show full_enhanced_ballot converted to HTML
        const htmlContent = converter.makeHtml(resultData.full_enhanced_ballot);
        contentDiv.innerHTML = htmlContent;
    }
}

function displayDefaultMessage() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<h2>Your Voice, Your Vote</h2>
<p>Elections shape our daily life. President, senators, schools, judges, taxes, roads — it's all on the ballot. </p>
<p>Show Me The Ballot makes voting information more accessible and provides a content report that analyzes the complexity of each ballot.  </p>
<p>To see what Americans voted for on November 5th, 2024, type and select from any location in the United States. Examples:</p>


<div style="display: flex; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap;">
    <div style="width: 50%;">
      <h3 className="text-xl font-bold mb-2">Most Complex Ballots</h3>
      <ul className="list-disc list-inside space-y-1">
          <li>
            <a href="?q=Harris+County%2C+Texas+%2877375%29&toggles=1%2C0%2C0" 
               className="text-blue-600 hover:underline">
              Harris County, TX-CD02 (77375)
            </a>
          </li>
          <li>
            <a href="?q=Oakland%20County,%20Michigan%20(48363)&toggles=1" 
               className="text-blue-600 hover:underline">
              Oakland County, MI-CD09 (48363)
            </a>
          </li>
          <li>
            <a href="?q=San%20Bernardino%20County,%20California%20(92377)&toggles=1" 
               className="text-blue-600 hover:underline">
              San Bernardino County, CA-CD33 (92377)
            </a>
          </li>
          <li>
            <a href="?q=Multnomah%20County,%20Oregon%20(97227)&toggles=0,1" 
               className="text-blue-600 hover:underline">
              Multnomah County, OR-CD03 (97227)
            </a>
          </li>
          <li>
            <a href="?q=Silver%20Bow%20County,%20Montana%20(59701)&toggles=0,0,1,0,0,0" 
               className="text-blue-600 hover:underline">
              Silver Bow County, MT-CD01 (59701)
            </a>
          </li>
      </ul>
    </div>
    <div style="width: 50%;">
      <h3 className="text-xl font-bold mb-2">Least Complex Ballots</h3>
      <ul className="list-disc list-inside space-y-1">
<li>
  <a href="?q=Monroe+County%2C+New+York+%2814559%29&toggles=1" 
     className="text-blue-600 hover:underline">
    Monroe County, NY-CD25 (14559)
  </a>
</li>
<li>
  <a href="?q=Clayton+County%2C+Georgia+%2830250%29&toggles=1" 
     className="text-blue-600 hover:underline">
    Clayton County, GA-CD13 (30250)
  </a>
</li>
<li>
  <a href="?q=Anderson+County%2C+South+Carolina+%2829643%29&toggles=1" 
     className="text-blue-600 hover:underline">
    Anderson County, SC-CD03 (29643)
  </a>
</li>
<li>
  <a href="?q=Essex+County%2C+Massachusetts+%2801944%29&toggles=1" 
     className="text-blue-600 hover:underline">
    Essex County, MA-CD06 (01944)
  </a>
</li>
<li>
  <a href="?q=Lincoln+County%2C+Maine+%2804570%29&toggles=1" 
     className="text-blue-600 hover:underline">
    Lincoln County, ME-CD01 (04570)
  </a>
</li>
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
  
    document.getElementById('search-input').addEventListener('click', function() {
      this.select();
    });
});
