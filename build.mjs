import * as esbuild from 'esbuild';

await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile: 'dist/index.js',
});

console.log('Build complete');
