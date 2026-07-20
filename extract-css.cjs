const fs = require('fs');
const path = require('path');

function extractCss(htmlFilePath, cssFileName) {
    const content = fs.readFileSync(htmlFilePath, 'utf8');
    const startTag = '<style>';
    const endTag = '</style>';
    
    const startIndex = content.indexOf(startTag);
    const endIndex = content.indexOf(endTag);
    
    if (startIndex !== -1 && endIndex !== -1) {
        // Extract CSS content (between <style> and </style>)
        const cssContent = content.substring(startIndex + startTag.length, endIndex).trim();
        
        // Write to CSS file
        const dir = path.dirname(htmlFilePath);
        const cssPath = path.join(dir, cssFileName);
        fs.writeFileSync(cssPath, cssContent);
        
        // Replace <style>...</style> with <link>
        const linkTag = `<link rel="stylesheet" href="${cssFileName}">`;
        const newHtmlContent = content.substring(0, startIndex) + linkTag + content.substring(endIndex + endTag.length);
        
        // Write back to HTML file
        fs.writeFileSync(htmlFilePath, newHtmlContent);
        console.log(`Successfully extracted CSS from ${htmlFilePath} to ${cssFileName}`);
    } else {
        console.log(`No <style> tags found in ${htmlFilePath}`);
    }
}

// Extract from backend landing page
extractCss('c:\\API\\public\\index.html', 'style.css');

// Extract from frontend landing page
extractCss('c:\\API\\dashboard\\public\\landing.html', 'landing.css');
