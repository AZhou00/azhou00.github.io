document.addEventListener("DOMContentLoaded", () => {
    loadIntro();
    loadPapers();
});

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

async function loadPapers() {
    try {
        const response = await fetch('input/papers.bib');
        if (!response.ok) throw new Error("Papers not found");
        const text = await response.text();
        
        const entries = text.split('@article').slice(1);
        const container = document.getElementById('paper-list');
        container.innerHTML = '';

        entries.forEach(entry => {
            const paper = parseBibTexEntry(entry);
            if (paper) {
                container.appendChild(createPaperCard(paper));
            }
        });

        // Notify background.js that elements are ready to be attached to
        setTimeout(() => {
            document.dispatchEvent(new Event('papersLoaded'));
        }, 100);

    } catch (e) {
        console.error(e);
        document.getElementById('paper-list').innerText = "Could not load publications.";
    }
}

function parseBibTexEntry(entry) {
    const getField = (key) => {
        const match = entry.match(new RegExp(`${key}\\s*=\\s*{(.*?)}`, 's'));
        return match ? match[1].trim() : null;
    };

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

function createPaperCard(paper) {
    const card = document.createElement('div');
    card.className = 'paper-card';

    const imgPath = paper.preview ? `input_image/${paper.preview}` : '';

    // NOTE: We do not use an <img> tag. We use a div mount point.
    // background.js will read 'data-src', load the image, and spawn 3D particles here.
    const imgHtml = imgPath 
        ? `<div class="paper-thumb-mount" data-src="${imgPath}"></div>` 
        : `<div class="paper-thumb-mount" style="display:none"></div>`;

    card.innerHTML = `
        ${imgHtml}
        <div class="paper-details">
            <h3><a href="${paper.link}" target="_blank">${paper.title}</a></h3>
            <div class="paper-authors">${paper.authors}</div>
            <div class="paper-meta">${paper.journal || "Preprint"} (${paper.year})</div>
        </div>
    `;
    return card;
}