// Compare the browser interface and the native demo, including all 23 cycles.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const example = fileURLToPath(new URL('../examples/heater-shutdown/', import.meta.url));
const expected = execFileSync('make', ['-s', '--no-print-directory', 'demo'], {
    cwd: example, encoding: 'utf8'
});
const moduleURL = pathToFileURL(resolve(process.argv[2], 'simulation.mjs'));
const {runSimulation} = await import(moduleURL);
// Node's fetch does not serve local files. Supply the publication directory as its origin.
globalThis.fetch = async url => new Response(await readFile(url));
assert.equal(await runSimulation(), expected);
assert.equal(await runSimulation(), expected);
console.log('Two browser runs matched the native C simulation byte for byte.');
