document.addEventListener("DOMContentLoaded", () => {
    loadIntro();
    loadPapers();
});

// 1. Load Markdown Intro
async function loadIntro() {
    try {
        const response = await fetch('input/intro.md');
        if (!response.ok) throw new Error("Intro not found");
        const text = await response.text();
        document.getElementById('intro-text').innerHTML = marked.parse(text);
    } catch (e) {
        document.getElementById('intro-text').innerText = "Could not load bio.";
    }
}

// 2. Load and Parse BibTeX
async function loadPapers() {
    try {
        const response = await fetch('input/papers.bib');
        if (!response.ok) throw new Error("Papers not found");
        const text = await response.text();
        
        // Parse all entry types (@article, @misc, etc.)
        const entries = text.split(/@(?=article|misc|inproceedings|book)/i).slice(1);
        const papers = [];

        // Parse and collect all papers
        entries.forEach(entry => {
            const paper = parseBibTexEntry(entry);
            if (paper) {
                papers.push(paper);
            }
        });

        // Sort by year (newest first), then by month if available
        papers.sort((a, b) => {
            const yearDiff = (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
            if (yearDiff !== 0) return yearDiff;
            // If years are the same, sort by month (if available)
            return (parseInt(b.month) || 0) - (parseInt(a.month) || 0);
        });

        // Render sorted papers
        const container = document.getElementById('paper-list');
        container.innerHTML = '';
        papers.forEach(paper => {
            container.appendChild(createPaperCard(paper));
        });

    } catch (e) {
        console.error(e);
        document.getElementById('paper-list').innerText = "Could not load publications.";
    }
}

// Helper: Extract fields from a single BibTeX entry
function parseBibTexEntry(entry) {
    const getField = (key) => {
        // Regex to find key = {value} or key={value}
        const match = entry.match(new RegExp(`${key}\\s*=\\s*{(.*?)}`, 's'));
        return match ? match[1].trim() : null;
    };

    // Convert month name to number for sorting
    const getMonthNumber = (monthStr) => {
        if (!monthStr) return 0;
        const months = {
            'jan': 1, 'january': 1,
            'feb': 2, 'february': 2,
            'mar': 3, 'march': 3,
            'apr': 4, 'april': 4,
            'may': 5,
            'jun': 6, 'june': 6,
            'jul': 7, 'july': 7,
            'aug': 8, 'august': 8,
            'sep': 9, 'september': 9,
            'oct': 10, 'october': 10,
            'nov': 11, 'november': 11,
            'dec': 12, 'december': 12
        };
        return months[monthStr.toLowerCase()] || 0;
    };

    // Only return if we have a title
    const title = getField('title');
    if (!title) return null;

    const monthStr = getField('month');
    return {
        title: title,
        authors: getField('author'),
        journal: getField('journal'),
        year: getField('year'),
        month: getMonthNumber(monthStr),
        preview: getField('preview'),
        link: getField('html') || getField('url')
    };
}

// Helper: Format author names
function formatAuthors(authorString) {
    if (!authorString) return '';
    
    // Split by 'and' to get individual authors
    const authors = authorString.split(' and ').map(author => author.trim());
    
    // Process each author
    const formattedAuthors = authors.map(author => {
        // Check if format is "LastName, FirstName MiddleName"
        if (author.includes(',')) {
            const parts = author.split(',').map(p => p.trim());
            const lastName = parts[0];
            const firstMiddle = parts[1] || '';
            // Reorder to "FirstName MiddleName LastName"
            author = `${firstMiddle} ${lastName}`.trim();
        }
        
        // Bold, underline, and italicize "Alan Junzhe Zhou"
        if (author.includes('Alan Junzhe Zhou') || author === 'Zhou, Alan Junzhe') {
            return '<b><u><i>Alan Junzhe Zhou</i></u></b>';
        }
        
        return author;
    });
    
    return formattedAuthors.join(', ');
}

// Helper: Generate HTML for a paper
function createPaperCard(paper) {
    const card = document.createElement('div');
    card.className = 'paper-card';

    // If image exists in bibtex, use it. Otherwise placeholder.
    const imgPath = paper.preview ? `input_image/${paper.preview}` : 'input_image/default.jpg';
    
    // Format authors
    const formattedAuthors = formatAuthors(paper.authors);

    card.innerHTML = `
        <img src="${imgPath}" class="paper-thumb" alt="Paper Preview" onerror="this.style.display='none'">
        <div class="paper-details">
            <h3><a href="${paper.link}" target="_blank">${paper.title}</a></h3>
            <div class="paper-authors">${formattedAuthors}</div>
            <div class="paper-meta">${paper.journal || "Preprint"} (${paper.year})</div>
        </div>
    `;
    return card;
}