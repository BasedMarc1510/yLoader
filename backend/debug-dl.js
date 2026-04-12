import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// 1. Detect yt-dlp
let ytDlpPath = process.env.YT_DLP_PATH;

if (!ytDlpPath) {
    try {
        if (process.platform === 'win32') {
            const out = execSync('where yt-dlp').toString().trim().split('\n')[0];
            if (out) ytDlpPath = out.trim();
        } else {
            const out = execSync('which yt-dlp').toString().trim();
            if (out) ytDlpPath = out;
        }
    } catch (e) {
        // ignore
    }
}

console.log('Detected yt-dlp path:', ytDlpPath);

if (!ytDlpPath) {
    console.error('CRITICAL: yt-dlp not found in PATH or YT_DLP_PATH env var.');
    process.exit(1);
}

// 2. Prepare arguments
const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // Me at the zoo
const outputTemplate = path.join(process.cwd(), 'test_download_%(id)s.%(ext)s');

const args = [
    '-f', 'bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--progress',
    '--newline',
    '-o', outputTemplate,
    url
];

console.log('Spawning yt-dlp with args:', args);

// 3. Spawn
const child = spawn(ytDlpPath, args);

child.stdout.on('data', (d) => console.log('STDOUT:', d.toString().trim()));
child.stderr.on('data', (d) => console.error('STDERR:', d.toString().trim()));

child.on('error', (e) => {
    console.error('SPAWN ERROR:', e);
});

child.on('close', (code, signal) => {
    console.log(`\nProcess exited with code ${code} and signal ${signal}`);
    if (signal === 'SIGTERM') {
        console.error('!! Process was killed with SIGTERM !!');
    }
});

// Keep this process alive explicitly?
// No need, node waits for child.
