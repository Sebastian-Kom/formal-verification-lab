// Compare the browser interface and the native demo, including all 23 cycles.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [work, output] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(resolve(output, 'variants.json'), 'utf8'));
// Node's fetch does not serve local files. Supply the publication directory as its origin.
globalThis.fetch = async url => new Response(await readFile(url));
const traces = [];
for (const variant of ['original', 'swapped']) {
    const example = resolve(work, variant);
    const target = resolve(output, variant);
    const source = await readFile(resolve(example, 'src', 'controller.c'));
    assert.deepEqual(await readFile(resolve(target, 'controller.c')), source);
    const digest = createHash('sha256').update(source).digest('hex');
    assert.equal(manifest.variants[variant].controllerSha256, digest);
    const simulation = await import(pathToFileURL(resolve(target, 'simulation.mjs')));
    assert.equal(simulation.sourceRevision, manifest.commit);
    assert.equal(simulation.controllerSha256, digest);
    const expected = execFileSync('make', ['-s', '--no-print-directory', 'demo'], {
        cwd: example, encoding: 'utf8'
    });
    assert.equal(await simulation.runSimulation(), expected);
    assert.equal(await simulation.runSimulation(), expected);
    console.log(`${variant}: two browser runs matched the native C program byte for byte.`);
    traces.push(expected);
}
assert.notEqual(traces[0], traces[1], 'Swapping the calls must change the observed trace.');
