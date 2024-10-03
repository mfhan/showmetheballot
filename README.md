# Show me the Ballot! 🗳️

## Description

"Show me the Ballot!" is a web application that allows users to search for ballot information based on their location (state, county, or zip code) in the United States. This tool aims to make voting information more accessible and transparent to citizens, helping them make informed decisions during elections.

## Features

- Search functionality for ballot information by state, county, or zip code
- Autocomplete suggestions for easier searching
- Responsive design for various screen sizes
- Displays detailed ballot information in a user-friendly format

## Technologies Used

- HTML5
- CSS3
- JavaScript (ES6+)
- jQuery
- jQuery UI (for autocomplete)
- Papa Parse (for CSV parsing)
- Marked.js (for Markdown rendering)

## Setup and Installation

1. Clone this repository to your local machine.
2. Ensure you have a web server set up to serve the files (e.g., Apache, Nginx, or a simple Python HTTP server).
3. Place your `data.csv` file in the root directory of the project. This file should contain the ballot information with columns for state, county, zip, and ballot_markdown.

## Usage

1. Open `index.html` in a web browser.
2. Use the search bar to enter a state, county, or zip code.
3. Select from the autocomplete suggestions or press enter to search.
4. View the ballot information displayed for the selected location.

## Project Structure

- `index.html`: Main HTML file for the application
- `style.css`: CSS styles for the application
- `script.js`: JavaScript file containing the application logic
- `data.csv`: CSV file containing the ballot information (not included in the repository)

## Data Source

The ballot information is sourced from [Ballotpedia](https://ballotpedia.org/). Please note that this is a beta version, and currently only the top 5 most populous zip codes in each state are available.

## Future Improvements

- Expand the database to include more zip codes and locations
- Add filtering options for different types of elections (local, state, federal)
- Implement a backend API for more efficient data retrieval
- Add user accounts for saving and tracking ballot information

## Contributing

Contributions to improve "Show me the Ballot!" are welcome. Please feel free to submit pull requests or open issues to discuss potential enhancements.

## License

[Insert appropriate license information here]

## Acknowledgements

- Ballotpedia for providing the initial data for this project
- All contributors and users who help improve this tool for better democratic participation