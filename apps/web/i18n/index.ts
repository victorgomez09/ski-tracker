import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './en.json';
import es from './es.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
};

const getStoredLanguage = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem('user-language');
    if (savedLanguage) {
      return savedLanguage;
    }
  } catch (error) {
    console.error('Error fetching language from storage', error);
  }
  
  // Fallback to device language
  const locales = Localization.getLocales();
  const deviceLanguage = locales && locales.length > 0 ? locales[0].languageCode : 'en';
  return deviceLanguage === 'es' ? 'es' : 'en';
};

const initI18n = async () => {
  const language = await getStoredLanguage();
  
  await i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: language,
      fallbackLng: 'en',
      compatibilityJSON: 'v4', // Required for React Native compatibility
      interpolation: {
        escapeValue: false, // React already safes from xss
      },
    });
};

initI18n();

export default i18n;
