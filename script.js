let data = [];

// Function to load and parse the CSV file
function loadCSV() {
    Papa.parse('data.csv', {
        download: true,
        header: true,
        complete: function(results) {
            data = results.data;
            console.log('CSV loaded:', data);
            setupAutocomplete();
        }
    });
}

// Function to set up autocomplete
function setupAutocomplete() {
    const searchTerms = data.reduce((acc, row) => {
        acc.push(row.county, row.zip);
        return acc;
    }, []);

    $("#search-input").autocomplete({
        source: searchTerms,
        minLength: 2,
        select: function(event, ui) {
            search(ui.item.value);
        }
    });
}

// Function to search for a county or zip code
function search(searchTerm = null) {
    searchTerm = searchTerm || document.getElementById('search-input').value.toLowerCase();
    const result = data.find(row => 
        row.county.toLowerCase() === searchTerm.toLowerCase() || row.zip === searchTerm
    );

    displayResult(result);
}

// Function to display the search result
function displayResult(result) {
    const resultsDiv = document.getElementById('results');
    if (result) {
        const renderedMarkdown = marked(result.ballot_markdown);
        resultsDiv.innerHTML = `
            <h2>${result.county}, ${result.state} (${result.zip})</h2>
            <div>${renderedMarkdown}</div>
        `;
    } else {
        resultsDiv.innerHTML = '<p>No results found.</p>';
    }
}

// Load the CSV when the page loads
window.onload = loadCSV;