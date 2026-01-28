import * as esbuild from 'esbuild';

// ESM build
await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile: 'dist/index.js',
});

// CommonJS build
await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    outfile: 'dist/index.cjs',
});

console.log('Build complete (ESM + CJS)');
