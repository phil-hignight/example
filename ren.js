const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Two separate locations:
// 1. EXECUTION_DIR - where the script was run from (for Java app working directory)
// 2. SCRIPT_DIR - where run.js is located (for compilation)
const EXECUTION_DIR = process.cwd();
const SCRIPT_DIR = __dirname;

console.log('=== Code Boss Application Runner ===');
console.log('');

console.log(`Working directory (for Code Boss): ${EXECUTION_DIR}`);
console.log(`Application location: ${SCRIPT_DIR}`);
console.log('');

// Check if script directory exists
if (!fs.existsSync(SCRIPT_DIR)) {
    console.error(`ERROR: Script directory does not exist: ${SCRIPT_DIR}`);
    process.exit(1);
}

// Change to script directory for compilation
process.chdir(SCRIPT_DIR);

console.log('[1/4] Cleaning previous compilation artifacts...');
// Clean up any previous .class files (recursively)
function deleteClassFiles(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            deleteClassFiles(filePath);
        } else if (file.endsWith('.class')) {
            fs.unlinkSync(filePath);
            console.log(`  Deleted ${filePath}`);
        }
    }
}
try {
    deleteClassFiles('.');
} catch (error) {
    // Ignore errors if no class files exist
}

console.log('[2/4] Compiling Java files...');
try {
    // Get list of all Java files recursively
    function findJavaFiles(dir, fileList = []) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                findJavaFiles(filePath, fileList);
            } else if (file.endsWith('.java')) {
                fileList.push(filePath);
            }
        }
        return fileList;
    }

    const javaFiles = findJavaFiles('.');

    if (javaFiles.length === 0) {
        console.error('ERROR: No Java files found in the project directory!');
        console.error('Please ensure the project files have been extracted.');
        process.exit(1);
    }

    console.log(`  Found ${javaFiles.length} Java files to compile`);

    const compileCommand = `javac ${javaFiles.join(' ')}`;
    execSync(compileCommand, { stdio: 'inherit' });
    console.log('  Compilation successful!');
} catch (error) {
    console.error('ERROR: Compilation failed!');
    console.error(error.message);
    process.exit(1);
}

console.log('[3/4] Verifying main class...');
const mainClassPath = path.join('com', 'codeboss', 'Main.class');
if (!fs.existsSync(mainClassPath)) {
    console.error(`ERROR: ${mainClassPath} not found after compilation!`);
    process.exit(1);
}

console.log('[4/4] Starting Code Boss Application...');
console.log('');
console.log('=====================================');
console.log('   Code Boss Application Started');
console.log('=====================================');
console.log('');

try {
    // Run Main.java with the execution directory as working directory
    execSync(`java com.codeboss.Main "${EXECUTION_DIR}"`, { stdio: 'inherit' });
} catch (error) {
    // Java process was terminated, this is normal
}

console.log('');
console.log('=====================================');
console.log('   Code Boss Application Stopped');
console.log('=====================================');
