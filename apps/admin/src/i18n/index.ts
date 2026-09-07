import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

// AdminSpec.md section 15 open decision #8: ship English only at launch,
// but build the i18n infrastructure so a second language is a resource
// bundle, not a rewrite. No user-facing string should be written inline —
// add it to locales/en.json and read it with useTranslation() instead.
// eslint-disable-next-line import/no-named-as-default-member -- i18next's documented API is i18n.use(), not the named `use` export.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
