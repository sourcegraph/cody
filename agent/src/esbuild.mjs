/* eslint-disable @typescript-eslint/no-floating-promises */
import { build } from 'esbuild';
import { esbuildOptions } from './esbuild-options.mjs';

(async () => {
  const res = await build(esbuildOptions);
})();
