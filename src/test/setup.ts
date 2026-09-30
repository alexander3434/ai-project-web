import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library does not auto-clean without globals: every test starts from an empty document.
afterEach(cleanup)

// jsdom does not implement scrolling; the browser does, and the components rely on it.
Element.prototype.scrollIntoView = () => {}
