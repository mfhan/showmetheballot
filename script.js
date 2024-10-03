let ballotData = [];
let zipLookup = [];
let autocompleteData = [];

// Function to load and parse the CSV files
function loadCSVs() {
    Papa.parse('zip_lookup.csv', {
        download: true,
        header: true,
        complete: function(results) {
            zipLookup = results.data;
            console.log('Zip lookup CSV loaded:', zipLookup);
            
            // After zip_lookup is loaded, load the ballot data
            Papa.parse('data.csv', {
                download: true,
                header: true,
                complete: function(results) {
                    ballotData = results.data;
                    console.log('Ballot data CSV loaded:', ballotData);
                    setupAutocomplete();
                    displayDefaultMessage();
                }
            });
        }
    });
}

// Function to set up autocomplete
function setupAutocomplete() {
    autocompleteData = zipLookup.flatMap(row => [
        `${row.county}, ${row.state} (${row.zip})`
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
    const suggestionList = document.getElementById('suggestions');
    suggestionList.innerHTML = '';
    suggestions.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        li.addEventListener('click', () => {
            document.getElementById('search-input').value = item;
            suggestionList.innerHTML = '';
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
                suggestionList.innerHTML = '';
                search(suggestions[selectedIndex].textContent);
            } else {
                search();
            }
            break;
    }
}

// Function to search for a county, state, or zip code
function search(searchTerm = null) {
    const suggestionList = document.getElementById('suggestions');
    suggestionList.innerHTML = '';

    searchTerm = searchTerm || document.getElementById('search-input').value.trim();
    
    // Try to parse the search term into county, state, and zip
    const parsedResult = parseSearchTerm(searchTerm);
    
    if (parsedResult) {
        const { county, state, zip } = parsedResult;
        const result = ballotData.find(row => 
            row.county.toLowerCase() === county.toLowerCase() &&
            row.state.toLowerCase() === state.toLowerCase()
        );
        
        if (result) {
            displayResult(result, county, state, zip);
            return;
        }
    }
    
    // If parsing fails or no exact match found, search for any partial match
    const partialMatch = ballotData.find(row => 
        ['county', 'state', 'zip'].some(key => 
            String(row[key]).toLowerCase().includes(searchTerm.toLowerCase())
        )
    );
    
    displayResult(partialMatch);
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

// Function to display the search result
function displayResult(result) {
    const resultsDiv = document.getElementById('results');
    if (result) {
        const renderedMarkdown = marked(result.ballot_markdown);
        resultsDiv.innerHTML = `
            <div>${renderedMarkdown}</div>
        `;
    } else {
        resultsDiv.innerHTML = '<p>No results found.</p>';
    }
}

function displayDefaultMessage() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <h2>Your Voice, Your Vote</h2>
        <p>Elections shape our daily life. Schools, taxes, roads – it's all on the ballot. Know what's at stake before you go.</p>
        <p>Type and select from any location in the United States to see what's on your ticket. Examples:</p>
        <ul>
            <li>Los Angeles, California (90011)</li>
            <li>Chicago, Illinois (60629)</li>
            <li>Brooklyn, New York (11226)</li>
        </ul>
        <p>Get the facts. Be prepared. Vote smart.</p>
    `;
}

// Load the CSVs when the page loads
document.addEventListener('DOMContentLoaded', loadCSVs);