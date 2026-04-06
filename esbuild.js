const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const ENV = production ? 'production' : 'development';

async function main() {
  const ctx1 = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': `"${ENV}"` 
    }
  });

  const ctx2 = await esbuild.context({
    entryPoints: ['src/webview/panel/index.tsx'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    outfile: 'out/panel-view.js',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    jsx: 'automatic',
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': `"${ENV}"` 
    }
  });

  if (watch) {
    await Promise.all([ctx1.watch(), ctx2.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([ctx1.rebuild(), ctx2.rebuild()]);
    await Promise.all([ctx1.dispose(), ctx2.dispose()]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
