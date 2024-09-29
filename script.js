let data = [];

// Function to load and parse the CSV file
function loadCSV() {
    Papa.parse('data.csv', {
        download: true,
        header: true,
        complete: function(results) {
            data = results.data;
            console.log('CSV loaded:', data);
        }
    });
}

// Function to search for a county or zip code
function search() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const result = data.find(row => 
        row.county.toLowerCase() === searchTerm || row.zip === searchTerm
    );

    displayResult(result);
}

// Function to display the search result
function displayResult(result) {
    const resultsDiv = document.getElementById('results');
    if (result) {
        resultsDiv.innerHTML = `
            <h2>${result.county}, ${result.state} (${result.zip})</h2>
            <div>${result.output_markdown}</div>
        `;
    } else {
        resultsDiv.innerHTML = '<p>No results found.</p>';
    }
}

// Load the CSV when the page loads
window.onload = loadCSV;