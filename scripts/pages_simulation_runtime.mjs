// Appended to the revision and controller digest exports by pages_simulation.sh.
// This WASI command requires only standard output and no command-line input.
export async function runSimulation() {
    const url = new URL(`simulation.${sourceRevision}.${controllerSha256}.wasm`, import.meta.url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load the simulation (HTTP ${response.status}).`);

    let instance;
    const stream = new TextDecoder();
    let output = '';
    const successfulExit = new Error('WASI process exited successfully');
    const memory = () => new DataView(instance.exports.memory.buffer);
    const emptyList = (count, bytes) => {
        const view = memory();
        view.setUint32(count, 0, true);
        view.setUint32(bytes, 0, true);
        return 0;
    };
    const wasi = {
        args_sizes_get: emptyList,
        args_get: () => 0,
        environ_sizes_get: emptyList,
        environ_get: () => 0,
        // The WASI C library seeds its stack guard when the process starts.
        random_get(address, length) {
            const bytes = new Uint8Array(instance.exports.memory.buffer, address, length);
            for (let start = 0; start < length; start += 65536) {
                crypto.getRandomValues(bytes.subarray(start, start + 65536));
            }
            return 0;
        },
        fd_fdstat_get(fd, address) {
            if (fd !== 1 && fd !== 2) return 8; // BADF
            const stat = new Uint8Array(instance.exports.memory.buffer, address, 24);
            stat.fill(0);
            stat[0] = 2; // CHARACTER_DEVICE
            return 0;
        },
        fd_seek: () => 70, // SPIPE: stdout and stderr cannot seek.
        fd_close: fd => fd === 1 || fd === 2 ? 0 : 8,
        fd_write(fd, iov, count, written) {
            if (fd !== 1 && fd !== 2) return 8;
            const view = memory();
            let size = 0;
            for (let i = 0; i < count; i++) {
                const start = view.getUint32(iov + i * 8, true);
                const length = view.getUint32(iov + i * 8 + 4, true);
                const chunk = new Uint8Array(view.buffer, start, length);
                if (fd === 1) output += stream.decode(chunk, {stream: true});
                size += length;
            }
            view.setUint32(written, size, true);
            return 0;
        },
        proc_exit(code) {
            if (code === 0) throw successfulExit;
            throw new Error(`Simulation exited with status ${code}.`);
        }
    };
    const module = await WebAssembly.instantiate(await response.arrayBuffer(), {
        wasi_snapshot_preview1: wasi
    });
    instance = module.instance;
    try {
        instance.exports._start();
    } catch (error) {
        if (error !== successfulExit) throw error;
    }
    return output + stream.decode();
}
