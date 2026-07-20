const fs = require('fs');
const path = require('path');

const srcPath = path.join('c:/API/public/index.html');
const destPagePath = path.join('c:/API/dashboard/src/app/page.tsx');
const destCssPath = path.join('c:/API/dashboard/src/app/landing.css');

let html = fs.readFileSync(srcPath, 'utf8');

// 1. Extract CSS
const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>') + 8;
let css = html.substring(styleStart + 7, styleEnd - 8);
fs.writeFileSync(destCssPath, css);

// Remove the entire head and html tags, just keep body
const bodyStart = html.indexOf('<body>') + 6;
const bodyEnd = html.indexOf('</body>');
let bodyContent = html.substring(bodyStart, bodyEnd);

// 2. Add Sign In link to nav
bodyContent = bodyContent.replace(
  '<a href="#pricing">Pricing</a>',
  '<a href="#pricing">Pricing</a>\n        <a href="/login" style="color: #818cf8; font-weight: 700;">Sign In</a>'
);

// 3. Convert HTML to JSX
// Simple replacements
let jsx = bodyContent
  .replace(/class=/g, 'className=')
  .replace(/for=/g, 'htmlFor=')
  .replace(/<img( [^>]*[^\/])>/g, '<img />')
  .replace(/<input( [^>]*[^\/])>/g, '<input />')
  .replace(/<br>/g, '<br />')
  .replace(/<hr>/g, '<hr />')
  .replace(/<!--[\s\S]*?-->/g, ''); // remove comments to avoid jsx comment errors

// Fix styles (e.g. style="width: 28px;...")
// We'll just remove complex inline styles or convert them naively.
// The only inline style was in the logo: style="width: 28px; height: 28px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), var(--purple)); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; color: #fff;"
// And span: style="font-weight: 800; font-size: 1.1rem; letter-spacing: -0.02em;"
jsx = jsx.replace(
  /style="width: 28px; height: 28px; border-radius: 8px; background: linear-gradient\(135deg, var\(--accent\), var\(--purple\)\); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 12px; color: #fff;"/g,
  "style={{width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--accent), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '12px', color: '#fff'}}"
);
jsx = jsx.replace(
  /style="font-weight: 800; font-size: 1.1rem; letter-spacing: -0.02em;"/g,
  "style={{fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.02em'}}"
);
jsx = jsx.replace(
  /style="display: none;"/g,
  "style={{display: 'none'}}"
);
jsx = jsx.replace(
  /style="margin-bottom: 2rem;"/g,
  "style={{marginBottom: '2rem'}}"
);
jsx = jsx.replace(
  /style="margin-bottom: 3rem;"/g,
  "style={{marginBottom: '3rem'}}"
);
jsx = jsx.replace(/onclick="([^"]+)"/gi, (match, code) => {
  return onClick={() => {  }};
});
jsx = jsx.replace(/oninput="([^"]+)"/gi, (match, code) => {
  return onChange={(e) => {  }};
});

// Remove script tags from jsx completely to put them in useEffect
const scriptStartTag = '<script>';
const scriptEndTag = '</script>';
let scriptContent = '';
while (jsx.indexOf(scriptStartTag) !== -1) {
  const sStart = jsx.indexOf(scriptStartTag);
  const sEnd = jsx.indexOf(scriptEndTag) + scriptEndTag.length;
  scriptContent += jsx.substring(sStart + scriptStartTag.length, sEnd - scriptEndTag.length);
  jsx = jsx.substring(0, sStart) + jsx.substring(sEnd);
}

// Generate the final TSX file
const finalTsx = 
"use client";
import { useEffect } from "react";
import "./landing.css";

export default function LandingPage() {
  useEffect(() => {
    // Inject logic
    
  }, []);

  return (
    <div className="landing-container">
      
    </div>
  );
}
;

fs.writeFileSync(destPagePath, finalTsx);
console.log("Conversion complete!");
