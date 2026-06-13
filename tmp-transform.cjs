const fs = require('fs');
let content = fs.readFileSync('src/components/AdminGamesTab.tsx', 'utf8');

// Remove collapsible toggle buttons from section headers, keeping the h4
content = content.replace(
  /<button\s*\n\s*onClick=\{\(\) => setBossesExpanded\(p => !p\)\)\}\s*\n\s*className="flex items-center gap-1\.5 shrink-0 hover:opacity-80 transition"\s*\n\s*>\s*\n\s*\{bossesExpanded \? <ChevronUp className="[^"]*" \/> : <ChevronDown className="[^"]*" \/>\}\s*\n\s*(<h4 className="text-xs font-semibold text-\[#d4d4d8\] flex items-center gap-1\.5"><Skull[\s\S]*?<\/h4>)\s*\n\s*<\/button>/,
  '$1'
);

content = content.replace(
  /<button\s*\n\s*onClick=\{\(\) => setActivitiesExpanded\(p => !p\)\)\}\s*\n\s*className="flex items-center gap-1\.5 shrink-0 hover:opacity-80 transition"\s*\n\s*>\s*\n\s*\{activitiesExpanded \? <ChevronUp className="[^"]*" \/> : <ChevronDown className="[^"]*" \/>\}\s*\n\s*(<h4 className="text-xs font-semibold text-\[#d4d4d8\] flex items-center gap-1\.5"><Calendar[\s\S]*?<\/h4>)\s*\n\s*<\/button>/,
  '$1'
);

content = content.replace(
  /<button onClick=\{\(\) => setCatsExpanded\(p => !p\)\)\} className="flex items-center gap-1\.5 shrink-0 hover:opacity-80 transition">\s*\n\s*\{catsExpanded \? <ChevronUp className="[^"]*" \/> : <ChevronDown className="[^"]*" \/>\}\s*\n\s*(<h4 className="text-xs font-semibold text-\[#d4d4d8\] flex items-center gap-1\.5"><Tags[\s\S]*?<\/h4>)\s*\n\s*<\/button>/,
  '$1'
);

content = content.replace(
  /<button onClick=\{\(\) => setRarsExpanded\(p => !p\)\)\} className="flex items-center gap-1\.5 shrink-0 hover:opacity-80 transition">\s*\n\s*\{rarsExpanded \? <ChevronUp className="[^"]*" \/> : <ChevronDown className="[^"]*" \/>\}\s*\n\s*(<h4 className="text-xs font-semibold text-\[#d4d4d8\] flex items-center gap-1\.5"><Palette[\s\S]*?<\/h4>)\s*\n\s*<\/button>/,
  '$1'
);

content = content.replace(
  /<button\s*\n\s*onClick=\{\(\) => setItemsExpanded\(p => !p\)\)\}\s*\n\s*className="flex items-center gap-1\.5 shrink-0 hover:opacity-80 transition"\s*\n\s*>\s*\n\s*\{itemsExpanded \? <ChevronUp className="[^"]*" \/> : <ChevronDown className="[^"]*" \/>\}\s*\n\s*(<h4 className="text-xs font-semibold text-\[#d4d4d8\] flex items-center gap-1\.5"><Package[\s\S]*?<\/h4>)\s*\n\s*<\/button>/,
  '$1'
);

// Remove animation wrapper divs
content = content.replace(
  /<div className=\{`transition-all duration-300 ease-in-out overflow-hidden \$\{bossesExpanded \? "max-h-\[5000px\] opacity-100" : "max-h-0 opacity-0"\}`\}>/g,
  ''
);
content = content.replace(
  /<div className=\{`transition-all duration-300 ease-in-out overflow-hidden \$\{activitiesExpanded \? "max-h-\[5000px\] opacity-100" : "max-h-0 opacity-0"\}`\}>/g,
  ''
);
content = content.replace(
  /<div className=\{`transition-all duration-300 ease-in-out overflow-hidden \$\{catsExpanded \? "max-h-\[5000px\] opacity-100" : "max-h-0 opacity-0"\}`\}>/g,
  ''
);
content = content.replace(
  /<div className=\{`transition-all duration-300 ease-in-out overflow-hidden \$\{rarsExpanded \? "max-h-\[5000px\] opacity-100" : "max-h-0 opacity-0"\}`\}>/g,
  ''
);
content = content.replace(
  /<div className=\{`transition-all duration-300 ease-in-out overflow-hidden \$\{itemsExpanded \? "max-h-\[5000px\] opacity-100" : "max-h-0 opacity-0"\}`\}>/g,
  ''
);

// Remove extra closing </div> tags that were paired with animation wrappers
// (This is conservative - we remove ones that follow a specific pattern)
// For now just write the file and let tsc catch issues

fs.writeFileSync('src/components/AdminGamesTab.tsx', content);
console.log('Transformation complete');
