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
        
        // Simple custom parser for the format you provided
        const entries = text.split('@article').slice(1); // Remove text before first entry
        const container = document.getElementById('paper-list');
        container.innerHTML = '';

        entries.forEach(entry => {
            const paper = parseBibTexEntry(entry);
            if (paper) {
                container.appendChild(createPaperCard(paper));
            }
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

    // Only return if we have a title
    const title = getField('title');
    if (!title) return null;

    return {
        title: title,
        authors: getField('author'),
        journal: getField('journal'),
        year: getField('year'),
        preview: getField('preview'),
        link: getField('html') || getField('url')
    };
}

// Helper: Generate HTML for a paper
function createPaperCard(paper) {
    const card = document.createElement('div');
    card.className = 'paper-card';

    // If image exists in bibtex, use it. Otherwise placeholder.
    const imgPath = paper.preview ? `input_image/${paper.preview}` : 'input_image/default.jpg';

    card.innerHTML = `
        <img src="${imgPath}" class="paper-thumb" alt="Paper Preview" onerror="this.style.display='none'">
        <div class="paper-details">
            <h3><a href="${paper.link}" target="_blank">${paper.title}</a></h3>
            <div class="paper-authors">${paper.authors}</div>
            <div class="paper-meta">${paper.journal || "Preprint"} (${paper.year})</div>
            <a href="${paper.link}" target="_blank">[View Paper]</a>
        </div>
    `;
    return card;
}