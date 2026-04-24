export default {
  '*.{ts,js}': (files) => [
    // Run tsc --noEmit without passing any files (so it uses tsconfig.json correctly)
    'tsc --noEmit --skipLibCheck',
    // Run vitest related tests for staged files (requires --run to avoid watch mode)
    `vitest related --run ${files.join(' ')}`,
  ],
};
