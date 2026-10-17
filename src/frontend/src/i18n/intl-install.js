// Side-effect module, imported first by main.jsx so the fallbacks are in place
// before any other module creates a formatter (see intl-fallback.js).
import { installIntlFallbacks } from './intl-fallback';

installIntlFallbacks();
