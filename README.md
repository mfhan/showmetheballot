# <img src="https://cdn.glitch.global/d0deef32-a01d-4d8a-974d-d4201e267934/icon.png?v=1729724853087" width="32" height="32" alt="Ballot Box">[Show me the Ballot!](https://show-me-the-ballot.glitch.me/)

## Description

"Show me the Ballot!" is a web application that helps voters preview their ballot information by searching their location in the United States. The tool makes voting information more accessible by presenting ballot data in an easy-to-read format, helping voters make informed decisions before heading to the polls.

## Features

- Location-based search with support for county, state, and zip code combinations
- Smart autocomplete with suggestions as you type
- Collapsible ballot sections for easy navigation
- Markdown rendering for formatted ballot content
- Mobile-responsive design
- Real-time search results
- Loading indicators for better user experience

## Usage

1. Open the [application](https://show-me-the-ballot.glitch.me/) in a web browser
2. Enter a location in the search box (e.g., "Los Angeles County, California (90011)")
3. Select from autocomplete suggestions or press Enter
4. Click on district headers to expand/collapse ballot information

## Data Requirements

The application requires two CSV files:

1. `data.csv` - Contains ballot information with columns:

   - county
   - state
   - zip
   - district (optional)
   - ballot_markdown

2. `zip_lookup.csv` - Contains location mapping with columns:
   - county
   - state
   - zip

## Setup and Installation

1. Clone this repository
2. Place required CSV files in the root directory
3. Serve the files using a web server (e.g., Apache, Nginx, or Python's `http.server`)

```bash
# Example using Python's built-in server
python -m http.server 8000
```

## Data Attribution

Ballot information is sourced from [Ballotpedia](https://ballotpedia.org/). The application currently supports the most populous zip codes in each state. Always verify ballot information with your local election office.

## Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Ballotpedia](https://ballotpedia.org/) for providing ballot data
- [Showdown.js](https://github.com/showdownjs/showdown) for Markdown conversion
- [Papa Parse](https://www.papaparse.com/) for CSV parsing
