const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Two separate locations:
// 1. EXECUTION_DIR - where the build script was run from (for Java app working directory)
// 2. SCRIPT_DIR - where build.js and bundle.txt are located (for extraction and compilation)
const EXECUTION_DIR = process.cwd();
const SCRIPT_DIR = __dirname;
const BUNDLE_FILE = path.join(SCRIPT_DIR, 'bundle.txt');
const DELIMITER = '|~|~|~|~|~|~|~|~|~|~|~|';

// Check for run-only mode
const RUN_ONLY = process.argv.includes('r');

console.log('=== Manual Coding Agent Build Script ===');
console.log('');

console.log(`Execution directory (Java app working dir): ${EXECUTION_DIR}`);
console.log(`Script directory (extraction/compilation): ${SCRIPT_DIR}`);
console.log(`Bundle file: ${BUNDLE_FILE}`);
if (RUN_ONLY) {
    console.log('Mode: Run-only (skipping extraction and compilation)');
}
console.log('');

// Check if script directory exists
if (!fs.existsSync(SCRIPT_DIR)) {
    console.error(`ERROR: Script directory does not exist: ${SCRIPT_DIR}`);
    process.exit(1);
}

// Only check bundle file if we're not in run-only mode
if (!RUN_ONLY && !fs.existsSync(BUNDLE_FILE)) {
    console.error(`ERROR: Bundle file not found: ${BUNDLE_FILE}`);
    console.error('Please ensure bundle.txt is in the same directory as build.js');
    process.exit(1);
}

// Skip extraction and compilation if in run-only mode
if (RUN_ONLY) {
    console.log('Skipping extraction and compilation - running existing classes...');
    process.chdir(SCRIPT_DIR);
} else {
    console.log('[1/5] Unbundling Java files to script directory...');
    process.chdir(SCRIPT_DIR);

try {
    // Read bundle file
    const bundleContent = fs.readFileSync(BUNDLE_FILE, 'utf8');
    const lines = bundleContent.split('\n');
    
    let currentFile = null;
    let fileContent = [];
    let inFileContent = false;
    let extractedFiles = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check if line starts with "FILE: "
        if (line.startsWith('FILE: ')) {
            // Save previous file if we have one
            if (currentFile && fileContent.length > 0) {
                const content = fileContent.join('\n');
                fs.writeFileSync(currentFile, content, 'utf8');
                console.log(`  [OK] Wrote ${currentFile} (${content.length} chars)`);
                extractedFiles++;
            }
            
            // Start new file
            currentFile = line.substring(6).trim(); // Remove "FILE: "
            fileContent = [];
            inFileContent = false;
            console.log(`  Extracting: ${currentFile}`);
        }
        // Check if line is delimiter
        else if (line === DELIMITER) {
            if (inFileContent) {
                // End of file content
                inFileContent = false;
            } else {
                // Start of file content
                inFileContent = true;
            }
        }
        // Regular content line
        else if (inFileContent && currentFile) {
            fileContent.push(lines[i]); // Keep original line with whitespace
        }
    }
    
    // Save last file
    if (currentFile && fileContent.length > 0) {
        const content = fileContent.join('\n');
        fs.writeFileSync(currentFile, content, 'utf8');
        console.log(`  [OK] Wrote ${currentFile} (${content.length} chars)`);
        extractedFiles++;
    }
    
    console.log(`  Extracted ${extractedFiles} Java files`);
    
    // Verify files were created
    const javaFiles = fs.readdirSync('.').filter(f => f.endsWith('.java'));
    if (javaFiles.length === 0) {
        console.error('ERROR: No Java files were extracted!');
        process.exit(1);
    }
    
} catch (error) {
    console.error(`ERROR: Failed to parse bundle file: ${error.message}`);
    process.exit(1);
}

console.log('[2/5] Cleaning previous compilation artifacts...');
// Clean up any previous .class files
try {
    const classFiles = fs.readdirSync('.').filter(f => f.endsWith('.class'));
    for (const classFile of classFiles) {
        fs.unlinkSync(classFile);
        console.log(`  Deleted ${classFile}`);
    }
} catch (error) {
    // Ignore errors if no class files exist
}

console.log('[3/5] Compiling Java files...');
try {
    // Get list of Java files explicitly
    const javaFiles = fs.readdirSync('.').filter(f => f.endsWith('.java'));
    console.log(`  Found ${javaFiles.length} Java files to compile`);
    
    const compileCommand = `javac ${javaFiles.join(' ')}`;
    execSync(compileCommand, { stdio: 'inherit' });
    console.log('  Compilation successful!');
} catch (error) {
    console.error('ERROR: Compilation failed!');
    console.error(error.message);
    process.exit(1);
}

console.log('[4/5] Verifying main class...');
if (!fs.existsSync('ConversationCLI.class')) {
    console.error('ERROR: ConversationCLI.class not found after compilation!');
    process.exit(1);
}
} // End of extraction and compilation block

console.log('[5/5] Starting ConversationCLI...');
console.log('');
console.log('=====================================');
console.log('   Manual Coding Agent Started');
console.log('=====================================');
console.log('');

try {
    execSync(`java ConversationCLI "${EXECUTION_DIR}"`, { stdio: 'inherit' });
} catch (error) {
    // Java process was terminated, this is normal
}

console.log('');
console.log('=====================================');
console.log('   Manual Coding Agent Stopped');
console.log('=====================================');
