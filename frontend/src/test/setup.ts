import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
// English renders from the keys themselves; nothing to load.
import '@/i18n';

// Route pages are lazy-loaded (React.lazy): the first import of a page module can take a few seconds under
// jsdom, so findBy*/waitFor wait longer than the 1 s default.
configure({ asyncUtilTimeout: 20_000 });

afterEach(() => cleanup());
